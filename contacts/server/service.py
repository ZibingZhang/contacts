"""App-level logic backing the HTTP API.

Generic object CRUD lives in `object_service`; what's left here is the
contact-flavoured aggregates the UI needs (tags) and the multi-step iCloud
sync/push state machines.
"""

from __future__ import annotations

import collections
import time

from contacts import model
from contacts.dao import disk_dao, icloud_dao
from contacts.server import errors, object_service
from contacts.utils import contact_utils, object_utils
from contacts.utils.object_utils import Object

# Contacts/updates fetched from iCloud by the most recent start_sync_from_icloud()
# or submit_sync_code(), awaiting apply_icloud_sync() to accept/decline each one.
_pending_sync: dict[str, list] | None = None

# Local contacts/updates found by the most recent start_push_to_icloud() or
# submit_push_code(), awaiting apply_icloud_push() to accept/decline each one.
_pending_push: dict[str, list] | None = None

# How many contacts to update on iCloud per batch in apply_icloud_push(),
# refreshing disk's etags between batches -- mirrors the CLI `push` command.
_PUSH_UPDATE_BATCH_SIZE = 5


def _icloud_uuid(contact: Object) -> str | None:
    return object_utils.get_path(contact, "icloud.uuid")


def _by_icloud_uuid(contacts: list[Object]) -> dict[str, Object]:
    return {
        uuid: contact
        for contact in contacts
        if (uuid := _icloud_uuid(contact)) is not None
    }


def list_contacts() -> list[Object]:
    """List all contacts.

    Returns:
        All contacts.
    """
    return object_service.list_objects(model.TYPE_CONTACT)


def invalidate_contacts_cache() -> None:
    """Clear cached objects so the next read goes back to disk."""
    object_service.invalidate_cache()


def list_tags() -> list[dict]:
    """List all tags along with how many contacts have each one.

    Returns:
        A list of {"tag": str, "count": int} dicts, sorted by tag name.
    """
    contacts = list_contacts()
    tag_counts: collections.Counter[str] = collections.Counter()
    for contact in contacts:
        tag_counts.update(contact.get("tags") or [])

    return [
        {"tag": tag, "count": tag_counts[tag]}
        for tag in contact_utils.extract_tags(contacts)
    ]


def add_tags_to_contacts(contact_ids: list[int], tags: list[str]) -> list[Object]:
    """Add tags to a batch of contacts, unioning with each contact's existing tags.

    Args:
        contact_ids: The ids of the contacts to update.
        tags: The tags to add to each contact.

    Returns:
        The updated contacts, in the order given by contact_ids.

    Raises:
        errors.NotFoundError: If any of the contact_ids do not exist.
    """
    contacts_by_id = {contact["id"]: contact for contact in list_contacts()}

    missing_ids = [
        contact_id for contact_id in contact_ids if contact_id not in contacts_by_id
    ]
    if missing_ids:
        raise errors.NotFoundError(f"Contact(s) not found: {missing_ids}")

    updated_contacts = []
    for contact_id in contact_ids:
        contact = dict(contacts_by_id[contact_id])
        contact["tags"] = sorted(set((contact.get("tags") or []) + tags))
        contact["mtime"] = time.time()
        updated_contacts.append(contact)

    object_service.write_objects(model.TYPE_CONTACT, updated_contacts)

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
        {"status": "requires_verification", "verification_kind": "code",
        "devices": []}.

    Raises:
        errors.SyncError: If sending the verification code fails.
    """
    try:
        icloud_dao.submit_verification_device(device_index)
    except Exception as e:
        raise errors.SyncError(f"Failed to send verification code: {e}") from e

    return {
        "status": "requires_verification",
        "verification_kind": "code",
        "devices": [],
    }


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
        if _icloud_uuid(contact) in create_ids
    ]
    accepted_updates = [
        updated_contact
        for _, updated_contact in _pending_sync["updated"]
        if _icloud_uuid(updated_contact) in update_ids
    ]

    if accepted_creates:
        disk_dao.create_objects(model.TYPE_CONTACT, accepted_creates)
    if accepted_updates:
        disk_dao.update_objects(model.TYPE_CONTACT, accepted_updates)
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

    # Deliberately a fresh read rather than the cache: the staged contacts
    # below are mutated, which must not touch cached objects.
    disk_contacts = disk_dao.read_objects(model.TYPE_CONTACT)

    icloud_by_uuid = _by_icloud_uuid(icloud_contacts)
    disk_by_uuid = _by_icloud_uuid(disk_contacts)

    created_contacts = [
        icloud_by_uuid[icloud_id]
        for icloud_id in (icloud_by_uuid.keys() - disk_by_uuid.keys())
    ]

    updated_pairs: list[tuple[Object, Object]] = []
    for icloud_id in disk_by_uuid.keys() & icloud_by_uuid.keys():
        icloud_contact = icloud_by_uuid[icloud_id]
        disk_contact = disk_by_uuid[icloud_id]

        updated_contact = object_utils.deep_merge(disk_contact, icloud_contact)

        if object_utils.diff(disk_contact, updated_contact):
            updated_contact["mtime"] = time.time()
            updated_pairs.append((disk_contact, updated_contact))

    if not created_contacts and not updated_pairs:
        _pending_sync = None
        return {"status": "complete", "created": 0, "updated": 0}

    _pending_sync = {"created": created_contacts, "updated": updated_pairs}

    return {
        "status": "review",
        "created": [
            {"icloud_id": _icloud_uuid(contact), "contact": contact}
            for contact in created_contacts
        ],
        "updated": [
            {
                "icloud_id": _icloud_uuid(updated_contact),
                "before": disk_contact,
                "after": updated_contact,
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
        {"status": "requires_verification", "verification_kind": "code",
        "devices": []}.

    Raises:
        errors.SyncError: If sending the verification code fails.
    """
    try:
        icloud_dao.submit_verification_device(device_index)
    except Exception as e:
        raise errors.SyncError(f"Failed to send verification code: {e}") from e

    return {
        "status": "requires_verification",
        "verification_kind": "code",
        "devices": [],
    }


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
        if _icloud_uuid(contact) in create_ids
    ]
    accepted_updates = [
        disk_contact
        for _, disk_contact in _pending_push["updated"]
        if _icloud_uuid(disk_contact) in update_ids
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

    # A fresh read, since remove_unsynced_fields below mutates these.
    disk_contacts = disk_dao.read_objects(model.TYPE_CONTACT)

    disk_by_uuid = _by_icloud_uuid(disk_contacts)
    icloud_by_uuid = _by_icloud_uuid(icloud_contacts)

    new_contacts = []
    for icloud_id in disk_by_uuid.keys() - icloud_by_uuid.keys():
        new_contact = disk_by_uuid[icloud_id]
        contact_utils.remove_unsynced_fields(new_contact)
        new_contacts.append(new_contact)

    updated_pairs: list[tuple[Object, Object]] = []
    for icloud_id in disk_by_uuid.keys() & icloud_by_uuid.keys():
        disk_contact = disk_by_uuid[icloud_id]
        contact_utils.remove_unsynced_fields(disk_contact)
        icloud_contact = icloud_by_uuid[icloud_id]

        diff = contact_utils.normalize_push_diff(
            object_utils.diff(icloud_contact, disk_contact)
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
            {"icloud_id": _icloud_uuid(contact), "contact": contact}
            for contact in new_contacts
        ],
        "updated": [
            {
                "icloud_id": _icloud_uuid(disk_contact),
                "before": icloud_contact,
                "after": disk_contact,
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
    disk_contacts = disk_dao.read_objects(model.TYPE_CONTACT)

    icloud_by_uuid = _by_icloud_uuid(icloud_contacts)
    disk_by_uuid = _by_icloud_uuid(disk_contacts)

    etag_updates = []
    for icloud_id in disk_by_uuid.keys() & icloud_by_uuid.keys():
        disk_contact = disk_by_uuid[icloud_id]
        icloud_contact = icloud_by_uuid[icloud_id]

        updated_contact = object_utils.deep_merge(disk_contact, icloud_contact)
        diff = object_utils.diff(disk_contact, updated_contact)

        if diff and contact_utils.only_etag_updated(diff):
            updated_contact["mtime"] = time.time()
            etag_updates.append(updated_contact)

    if etag_updates:
        disk_dao.update_objects(model.TYPE_CONTACT, etag_updates)
        invalidate_contacts_cache()
