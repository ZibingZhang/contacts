"""Command to push contacts to a remote source."""

from __future__ import annotations

from typing import cast

from contacts import command, model
from contacts.dao import disk_dao, icloud_dao
from contacts.logger import LOG
from contacts.utils import (
    dataclasses_utils,
    input_utils,
    json_utils,
    pretty_print_utils,
)


def run(*, force: bool, write: bool) -> None:
    disk_contacts = disk_dao.read_contacts()
    icloud_contacts, _ = icloud_dao.read_contacts_and_groups(cached=False)

    icloud_id_to_disk_contact_map: dict[str, model.DiskContact] = {
        contact.icloud.uuid: contact
        for contact in disk_contacts
        if contact.icloud is not None
    }
    icloud_id_to_icloud_contact_map: dict[str, model.Contact] = {
        cast(model.ICloudMetadata, contact.icloud).uuid: contact
        for contact in icloud_contacts
    }

    disk_contact_ids = icloud_id_to_disk_contact_map.keys()
    icloud_contact_ids = icloud_id_to_icloud_contact_map.keys()

    new_contacts = []
    for icloud_id in disk_contact_ids - icloud_contact_ids:
        new_contact = icloud_id_to_disk_contact_map[icloud_id]
        _remove_unsynced_fields(new_contact)

        print(
            pretty_print_utils.bordered(
                json_utils.dumps_indented(new_contact.to_dict())
            )
        )

        if force or input_utils.yes_no_input("Accept creation?"):
            icloud_id_to_icloud_contact_map[icloud_id] = new_contact
            new_contacts.append(new_contact)

    if write:
        icloud_dao.create_contacts(new_contacts)

        if len(new_contacts) > 0:
            LOG.info("Pulling contacts to sync etags")
            command.pull.run(cached=False)
    else:
        LOG.info(f"Would have written {len(new_contacts)} new contacts to iCloud")

    updated_contacts = []
    for icloud_id in disk_contact_ids & icloud_contact_ids:
        disk_contact = icloud_id_to_disk_contact_map[icloud_id]
        _remove_unsynced_fields(disk_contact)
        icloud_contact = icloud_id_to_icloud_contact_map[icloud_id]

        diff = dataclasses_utils.diff(icloud_contact, disk_contact)
        diff = _normalize_diff(diff)

        if diff:
            current_contact_display = pretty_print_utils.bordered(
                json_utils.dumps_indented(icloud_contact.to_dict())
            )
            diff_display = pretty_print_utils.bordered(json_utils.dumps_indented(diff))
            print(pretty_print_utils.besides(current_contact_display, diff_display))

            updates = diff.get("$update")
            if updates is not None and "notes" in updates:
                print(
                    pretty_print_utils.besides(
                        pretty_print_utils.bordered(icloud_contact.notes),
                        pretty_print_utils.bordered(disk_contact.notes),
                    )
                )

            if force or input_utils.yes_no_input("Accept update?"):
                icloud_id_to_icloud_contact_map[icloud_id] = disk_contact
                updated_contacts.append(disk_contact)

                if len(updated_contacts) == 5:
                    if write:
                        icloud_dao.update_contacts(updated_contacts)
                        LOG.info("Pulling contacts to sync etags")
                        command.pull.run(cached=False, ignore_updates=True)
                    else:
                        LOG.info(
                            f"Would have written {len(updated_contacts)} updated contacts to iCloud"
                        )
                    updated_contacts = []

    if len(updated_contacts) > 0:
        if write:
            icloud_dao.update_contacts(updated_contacts)
            LOG.info("Pulling contacts to sync etags")
            command.pull.run(cached=False, ignore_updates=True)
        else:
            LOG.info(
                f"Would have written {len(updated_contacts)} updated contacts to iCloud"
            )


def _remove_unsynced_fields(contact: model.DiskContact) -> None:
    try:
        del contact.name.deadname  # type: ignore
    except AttributeError:
        pass
    try:
        del contact.social_profiles.instagram.finsta_usernames  # type: ignore
    except AttributeError:
        pass


def _normalize_diff(diff: dict) -> dict:
    if diff.get("$insert") is not None:
        del diff["$insert"]["id"]
        del diff["$insert"]["mtime"]
        if not diff["$insert"]:
            del diff["$insert"]
    return diff
