"""Query and update logic backing the HTTP API."""

from __future__ import annotations

import collections
import time
from typing import cast

from contacts import model
from contacts.dao import disk_dao, icloud_dao
from contacts.server import errors
from contacts.utils import contact_utils, dataclasses_utils, uuid_utils

_contacts_cache: list[model.DiskContact] | None = None

# Contacts/updates fetched from iCloud by the most recent start_sync_from_icloud()
# or submit_sync_code(), awaiting apply_icloud_sync() to accept/decline each one.
_pending_sync: dict[str, list] | None = None

# Local contacts/updates found by the most recent start_push_to_icloud() or
# submit_push_code(), awaiting apply_icloud_push() to accept/decline each one.
_pending_push: dict[str, list] | None = None

# How many contacts to update on iCloud per batch in apply_icloud_push(),
# refreshing disk's etags between batches -- mirrors the CLI `push` command.
_PUSH_UPDATE_BATCH_SIZE = 5


def list_contacts() -> list[model.DiskContact]:
    """List all contacts, reading from disk only on the first call.

    Subsequent calls are served from an in-memory cache until
    invalidate_contacts_cache() is called.

    Returns:
        All contacts.
    """
    global _contacts_cache
    if _contacts_cache is None:
        _contacts_cache = disk_dao.read_contacts()
    return _contacts_cache


def invalidate_contacts_cache() -> None:
    """Clear the cached contacts so the next list_contacts() re-reads from disk."""
    global _contacts_cache
    _contacts_cache = None


def get_contact(contact_id: int) -> model.DiskContact | None:
    """Get a single contact by id.

    Args:
        contact_id: The id of the contact.

    Returns:
        The contact, or None if no contact with that id exists.
    """
    contacts_by_id = {contact.id: contact for contact in disk_dao.read_contacts()}
    return contacts_by_id.get(contact_id)


def create_contact(data: dict) -> model.DiskContact:
    """Creates a new contact from user-provided field data.

    Args:
        data: Contact field data matching model.Contact's JSON shape (no
            "id", "mtime", or "icloud" -- those are assigned here).

    Returns:
        The newly created contact, with its assigned id.

    Raises:
        errors.ValidationError: If the data doesn't match the contact schema.
    """
    try:
        contact = model.Contact.from_dict(data)
    except Exception as e:
        raise errors.ValidationError(f"Invalid contact data: {e}") from e

    contact.mtime = time.time()
    contact.icloud = model.ICloudMetadata(uuid=uuid_utils.generate())

    new_contact = cast(model.DiskContact, contact)
    disk_dao.create_contacts([new_contact])
    invalidate_contacts_cache()

    return new_contact


def update_contact(contact_id: int, data: dict) -> model.DiskContact:
    """Overwrites a contact's field data, preserving its id and iCloud link.

    Args:
        contact_id: The id of the contact to update.
        data: Contact field data matching model.Contact's JSON shape (no
            "id", "mtime", or "icloud" -- those are preserved/assigned here).

    Returns:
        The updated contact.

    Raises:
        errors.NotFoundError: If no contact with that id exists.
        errors.ValidationError: If the data doesn't match the contact schema.
    """
    existing_contact = get_contact(contact_id)
    if existing_contact is None:
        raise errors.NotFoundError(f"Contact {contact_id} not found")

    try:
        contact = model.Contact.from_dict(data)
    except Exception as e:
        raise errors.ValidationError(f"Invalid contact data: {e}") from e

    contact.id = contact_id
    contact.mtime = time.time()
    contact.icloud = existing_contact.icloud

    updated_contact = cast(model.DiskContact, contact)
    disk_dao.update_contacts([updated_contact])
    invalidate_contacts_cache()

    return updated_contact


def list_contact_field_options() -> dict:
    """Lists the fixed option sets used by constrained contact fields.

    Returns:
        {"countries": list[str], "country_codes": [{"code": int, "label":
        str}], "high_schools": list[str], "universities": list[str]}.
    """
    contacts = list_contacts()
    return {
        "countries": model.Country.values(),
        "country_codes": [
            {
                "code": int(code),
                "label": "United States/Canada"
                if code is model.CountryCode.NANP
                else code.name.replace("_", " ").title(),
            }
            for code in model.CountryCode
        ],
        "high_schools": contact_utils.extract_high_schools(contacts),
        "universities": contact_utils.extract_universities(contacts),
    }


def list_tags() -> list[dict]:
    """List all tags along with how many contacts have each one.

    Returns:
        A list of {"tag": str, "count": int} dicts, sorted by tag name.
    """
    contacts = list_contacts()
    tag_counts: collections.Counter[str] = collections.Counter()
    for contact in contacts:
        tag_counts.update(contact.tags or [])

    return [
        {"tag": tag, "count": tag_counts[tag]}
        for tag in contact_utils.extract_tags(contacts)
    ]


def add_tags_to_contacts(
    contact_ids: list[int], tags: list[str]
) -> list[model.DiskContact]:
    """Add tags to a batch of contacts, unioning with each contact's existing tags.

    Args:
        contact_ids: The ids of the contacts to update.
        tags: The tags to add to each contact.

    Returns:
        The updated contacts, in the order given by contact_ids.

    Raises:
        errors.NotFoundError: If any of the contact_ids do not exist.
    """
    contacts_by_id = {contact.id: contact for contact in list_contacts()}

    missing_ids = [
        contact_id for contact_id in contact_ids if contact_id not in contacts_by_id
    ]
    if missing_ids:
        raise errors.NotFoundError(f"Contact(s) not found: {missing_ids}")

    updated_contacts = [contacts_by_id[contact_id] for contact_id in contact_ids]
    for contact in updated_contacts:
        contact.tags = (contact.tags or []) + tags

    disk_dao.update_contacts(updated_contacts)
    invalidate_contacts_cache()

    return updated_contacts


def _begin_icloud_auth() -> dict | None:
    """Starts (non-interactive) iCloud authentication.

    Shared by both the pull and push flows, since they're both just
    resuming the same pending iCloud auth once a challenge is in progress.

    Returns:
        None if authentication completed. Otherwise a "requires_verification"
        payload describing the challenge to resolve via submit_sync_device/
        submit_push_device and submit_sync_code/submit_push_code.

    Raises:
        errors.SyncError: If authenticating with iCloud fails outright.
    """
    try:
        challenge = icloud_dao.authenticate(interactive=False)
    except Exception as e:
        raise errors.SyncError(f"Failed to authenticate with iCloud: {e}") from e

    if challenge is None:
        return None

    return {
        "status": "requires_verification",
        "verification_kind": challenge.kind,
        "devices": challenge.devices,
    }


def start_sync_from_icloud() -> dict:
    """Starts a pull from iCloud (remote -> local), authenticating first.

    If the account needs two-factor/two-step verification, this returns a
    "requires_verification" status instead of blocking -- the caller must
    drive the challenge to completion with `submit_sync_device` (only for
    "device_and_code") and `submit_sync_code`, each of which resumes and
    finishes authentication once verification succeeds.

    Once authenticated, this never writes to disk directly -- any new or
    changed contacts found on iCloud are staged for review and returned, and
    the caller must call `apply_icloud_sync()` to accept or decline each one.

    Returns:
        Either {"status": "requires_verification", "verification_kind":
        "code" | "device_and_code", "devices": list[str]}, or a review
        payload (see `_prepare_icloud_sync`).

    Raises:
        errors.SyncError: If authenticating with iCloud fails.
    """
    challenge_response = _begin_icloud_auth()
    if challenge_response is not None:
        return challenge_response

    return _prepare_icloud_sync()


def submit_sync_device(device_index: int) -> dict:
    """Picks which trusted device a two-step verification code is sent to.

    Only applicable after `start_sync_from_icloud()` returned a
    "device_and_code" challenge.

    Args:
        device_index: Index into that challenge's `devices` list.

    Returns:
        {"status": "requires_verification", "verification_kind": "code", "devices": []}.

    Raises:
        errors.SyncError: If sending the verification code fails.
    """
    try:
        icloud_dao.submit_verification_device(device_index)
    except Exception as e:
        raise errors.SyncError(f"Failed to send verification code: {e}") from e

    return {"status": "requires_verification", "verification_kind": "code", "devices": []}


def submit_sync_code(code: str) -> dict:
    """Completes iCloud authentication with a verification code, then stages
    whatever's changed on iCloud for review (see `start_sync_from_icloud`).

    Args:
        code: The verification code received on a trusted device.

    Returns:
        A review payload (see `_prepare_icloud_sync`).

    Raises:
        errors.SyncError: If the code is invalid or reading from iCloud fails.
    """
    try:
        icloud_dao.submit_verification_code(code)
    except Exception as e:
        raise errors.SyncError(f"Failed to verify code: {e}") from e

    return _prepare_icloud_sync()


def apply_icloud_sync(
    create_icloud_ids: list[str], update_icloud_ids: list[str]
) -> dict:
    """Writes the accepted subset of a pending pull-from-iCloud review to disk.

    Any contact staged by `start_sync_from_icloud` / `submit_sync_code` but
    not named here is declined and left untouched on disk.

    Args:
        create_icloud_ids: icloud_id of each staged new contact to create.
        update_icloud_ids: icloud_id of each staged updated contact to apply.

    Returns:
        {"status": "complete", "created": int, "updated": int}.

    Raises:
        errors.ValidationError: If there's no pending review to apply.
    """
    global _pending_sync
    if _pending_sync is None:
        raise errors.ValidationError("No pending iCloud sync to apply")

    create_ids = set(create_icloud_ids)
    update_ids = set(update_icloud_ids)

    accepted_creates = [
        contact
        for contact in _pending_sync["created"]
        if contact.icloud.uuid in create_ids
    ]
    accepted_updates = [
        updated_contact
        for _, updated_contact in _pending_sync["updated"]
        if updated_contact.icloud.uuid in update_ids
    ]

    if accepted_creates:
        disk_dao.create_contacts(accepted_creates)
    if accepted_updates:
        disk_dao.update_contacts(accepted_updates)
    if accepted_creates or accepted_updates:
        invalidate_contacts_cache()

    _pending_sync = None

    return {
        "status": "complete",
        "created": len(accepted_creates),
        "updated": len(accepted_updates),
    }


def _prepare_icloud_sync() -> dict:
    """Pulls contacts from an already-authenticated iCloud session and stages
    any creates/updates for review, without writing anything to disk yet.

    Returns:
        {"status": "complete", "created": 0, "updated": 0} if nothing
        changed, otherwise {"status": "review", "created": [...], "updated":
        [...]} where each "created" entry is {"icloud_id": str, "contact":
        dict} and each "updated" entry is {"icloud_id": str, "before": dict,
        "after": dict}. Call `apply_icloud_sync()` with the icloud_ids to
        accept.

    Raises:
        errors.SyncError: If reading from iCloud fails.
    """
    global _pending_sync

    try:
        icloud_contacts, _ = icloud_dao.read_contacts_and_groups(cached=False)
    except Exception as e:
        raise errors.SyncError(f"Failed to sync from iCloud: {e}") from e

    disk_contacts = disk_dao.read_contacts()

    icloud_id_to_icloud_contact_map: dict[str, model.Contact] = {
        contact.icloud.uuid: contact
        for contact in icloud_contacts
        if contact.icloud is not None
    }
    icloud_id_to_disk_contact_map: dict[str, model.DiskContact] = {
        contact.icloud.uuid: contact
        for contact in disk_contacts
        if contact.icloud is not None
    }

    created_contacts = [
        icloud_id_to_icloud_contact_map[icloud_id]
        for icloud_id in (
            icloud_id_to_icloud_contact_map.keys()
            - icloud_id_to_disk_contact_map.keys()
        )
    ]

    updated_pairs: list[tuple[model.DiskContact, model.DiskContact]] = []
    for icloud_id in (
        icloud_id_to_disk_contact_map.keys() & icloud_id_to_icloud_contact_map.keys()
    ):
        icloud_contact = icloud_id_to_icloud_contact_map[icloud_id]
        disk_contact = icloud_id_to_disk_contact_map[icloud_id]

        updated_contact = disk_contact.copy()
        updated_contact.patch(icloud_contact)

        if dataclasses_utils.diff(disk_contact, updated_contact):
            updated_contact.mtime = time.time()
            updated_pairs.append((disk_contact, updated_contact))

    if not created_contacts and not updated_pairs:
        _pending_sync = None
        return {"status": "complete", "created": 0, "updated": 0}

    _pending_sync = {"created": created_contacts, "updated": updated_pairs}

    return {
        "status": "review",
        "created": [
            {
                "icloud_id": cast(model.ICloudMetadata, contact.icloud).uuid,
                "contact": contact.to_dict(),
            }
            for contact in created_contacts
        ],
        "updated": [
            {
                "icloud_id": cast(
                    model.ICloudMetadata, updated_contact.icloud
                ).uuid,
                "before": disk_contact.to_dict(),
                "after": updated_contact.to_dict(),
            }
            for disk_contact, updated_contact in updated_pairs
        ],
    }


def start_push_to_icloud() -> dict:
    """Starts a push to iCloud (local -> remote), authenticating first.

    Mirrors `start_sync_from_icloud`, but in the opposite direction: once
    authenticated, local-only and locally-changed contacts are staged for
    review and returned, and the caller must call `apply_icloud_push()` to
    accept or decline each one -- nothing is written to iCloud yet.

    Returns:
        Either {"status": "requires_verification", "verification_kind":
        "code" | "device_and_code", "devices": list[str]}, or a review
        payload (see `_prepare_icloud_push`).

    Raises:
        errors.SyncError: If authenticating with iCloud fails.
    """
    challenge_response = _begin_icloud_auth()
    if challenge_response is not None:
        return challenge_response

    return _prepare_icloud_push()


def submit_push_device(device_index: int) -> dict:
    """Picks which trusted device a two-step verification code is sent to.

    Only applicable after `start_push_to_icloud()` returned a
    "device_and_code" challenge.

    Args:
        device_index: Index into that challenge's `devices` list.

    Returns:
        {"status": "requires_verification", "verification_kind": "code", "devices": []}.

    Raises:
        errors.SyncError: If sending the verification code fails.
    """
    try:
        icloud_dao.submit_verification_device(device_index)
    except Exception as e:
        raise errors.SyncError(f"Failed to send verification code: {e}") from e

    return {"status": "requires_verification", "verification_kind": "code", "devices": []}


def submit_push_code(code: str) -> dict:
    """Completes iCloud authentication with a verification code, then stages
    whatever's changed locally for review (see `start_push_to_icloud`).

    Args:
        code: The verification code received on a trusted device.

    Returns:
        A review payload (see `_prepare_icloud_push`).

    Raises:
        errors.SyncError: If the code is invalid or reading from iCloud fails.
    """
    try:
        icloud_dao.submit_verification_code(code)
    except Exception as e:
        raise errors.SyncError(f"Failed to verify code: {e}") from e

    return _prepare_icloud_push()


def apply_icloud_push(
    create_icloud_ids: list[str], update_icloud_ids: list[str]
) -> dict:
    """Writes the accepted subset of a pending push-to-iCloud review to iCloud.

    Any contact staged by `start_push_to_icloud` / `submit_push_code` but not
    named here is declined and left untouched on iCloud. Updates are written
    in small batches, refreshing disk's iCloud etags between each one, the
    same way the CLI `push` command does.

    Args:
        create_icloud_ids: icloud_id of each staged local-only contact to
            create on iCloud.
        update_icloud_ids: icloud_id of each staged changed contact to push.

    Returns:
        {"status": "complete", "created": int, "updated": int}.

    Raises:
        errors.ValidationError: If there's no pending push review to apply.
        errors.SyncError: If writing to iCloud fails.
    """
    global _pending_push
    if _pending_push is None:
        raise errors.ValidationError("No pending iCloud push to apply")

    create_ids = set(create_icloud_ids)
    update_ids = set(update_icloud_ids)

    accepted_creates = [
        contact
        for contact in _pending_push["created"]
        if cast(model.ICloudMetadata, contact.icloud).uuid in create_ids
    ]
    accepted_updates = [
        disk_contact
        for _, disk_contact in _pending_push["updated"]
        if cast(model.ICloudMetadata, disk_contact.icloud).uuid in update_ids
    ]

    _pending_push = None

    try:
        if accepted_creates:
            icloud_dao.create_contacts(accepted_creates)
            _sync_etags_after_push()

        for i in range(0, len(accepted_updates), _PUSH_UPDATE_BATCH_SIZE):
            batch = accepted_updates[i : i + _PUSH_UPDATE_BATCH_SIZE]
            icloud_dao.update_contacts(batch)
            _sync_etags_after_push()
    except Exception as e:
        raise errors.SyncError(f"Failed to push to iCloud: {e}") from e

    if accepted_creates or accepted_updates:
        invalidate_contacts_cache()

    return {
        "status": "complete",
        "created": len(accepted_creates),
        "updated": len(accepted_updates),
    }


def _prepare_icloud_push() -> dict:
    """Finds local-only and locally-changed contacts and stages them for
    review, without writing anything to iCloud yet.

    Returns:
        {"status": "complete", "created": 0, "updated": 0} if nothing to
        push, otherwise {"status": "review", "created": [...], "updated":
        [...]} -- same shape as `_prepare_icloud_sync`, except "before"/
        "after" describe iCloud's current state and the proposed new state
        there. Call `apply_icloud_push()` with the icloud_ids to accept.

    Raises:
        errors.SyncError: If reading from iCloud fails.
    """
    global _pending_push

    try:
        icloud_contacts, _ = icloud_dao.read_contacts_and_groups(cached=False)
    except Exception as e:
        raise errors.SyncError(f"Failed to read from iCloud: {e}") from e

    disk_contacts = disk_dao.read_contacts()

    icloud_id_to_disk_contact_map: dict[str, model.DiskContact] = {
        contact.icloud.uuid: contact
        for contact in disk_contacts
        if contact.icloud is not None
    }
    icloud_id_to_icloud_contact_map: dict[str, model.Contact] = {
        cast(model.ICloudMetadata, contact.icloud).uuid: contact
        for contact in icloud_contacts
    }

    new_contacts = []
    for icloud_id in (
        icloud_id_to_disk_contact_map.keys() - icloud_id_to_icloud_contact_map.keys()
    ):
        new_contact = icloud_id_to_disk_contact_map[icloud_id]
        contact_utils.remove_unsynced_fields(new_contact)
        new_contacts.append(new_contact)

    updated_pairs: list[tuple[model.Contact, model.DiskContact]] = []
    for icloud_id in (
        icloud_id_to_disk_contact_map.keys() & icloud_id_to_icloud_contact_map.keys()
    ):
        disk_contact = icloud_id_to_disk_contact_map[icloud_id]
        contact_utils.remove_unsynced_fields(disk_contact)
        icloud_contact = icloud_id_to_icloud_contact_map[icloud_id]

        diff = contact_utils.normalize_push_diff(
            dataclasses_utils.diff(icloud_contact, disk_contact)
        )

        if diff:
            updated_pairs.append((icloud_contact, disk_contact))

    if not new_contacts and not updated_pairs:
        _pending_push = None
        return {"status": "complete", "created": 0, "updated": 0}

    _pending_push = {"created": new_contacts, "updated": updated_pairs}

    return {
        "status": "review",
        "created": [
            {
                "icloud_id": cast(model.ICloudMetadata, contact.icloud).uuid,
                "contact": contact.to_dict(),
            }
            for contact in new_contacts
        ],
        "updated": [
            {
                "icloud_id": cast(model.ICloudMetadata, disk_contact.icloud).uuid,
                "before": icloud_contact.to_dict(),
                "after": disk_contact.to_dict(),
            }
            for icloud_contact, disk_contact in updated_pairs
        ],
    }


def _sync_etags_after_push() -> None:
    """Refreshes disk's iCloud etags after a write to iCloud.

    Mirrors what the CLI `push` command does via a post-write `pull
    --ignore-updates`: any difference besides the etag is left alone, since
    there shouldn't be one right after a successful push.
    """
    icloud_contacts, _ = icloud_dao.read_contacts_and_groups(cached=False)
    disk_contacts = disk_dao.read_contacts()

    icloud_id_to_icloud_contact_map: dict[str, model.Contact] = {
        contact.icloud.uuid: contact
        for contact in icloud_contacts
        if contact.icloud is not None
    }
    icloud_id_to_disk_contact_map: dict[str, model.DiskContact] = {
        contact.icloud.uuid: contact
        for contact in disk_contacts
        if contact.icloud is not None
    }

    etag_updates = []
    for icloud_id in (
        icloud_id_to_disk_contact_map.keys() & icloud_id_to_icloud_contact_map.keys()
    ):
        disk_contact = icloud_id_to_disk_contact_map[icloud_id]
        icloud_contact = icloud_id_to_icloud_contact_map[icloud_id]

        updated_contact = disk_contact.copy()
        updated_contact.patch(icloud_contact)
        diff = dataclasses_utils.diff(disk_contact, updated_contact)

        if diff and contact_utils.only_etag_updated(diff):
            updated_contact.mtime = time.time()
            etag_updates.append(updated_contact)

    if etag_updates:
        disk_dao.update_contacts(etag_updates)
