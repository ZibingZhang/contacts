"""Command to pull contacts from a remote source."""

from __future__ import annotations

import time

from contacts import model
from contacts.dao import disk_dao, icloud_dao
from contacts.utils import (
    contact_utils,
    input_utils,
    json_utils,
    object_utils,
    pretty_print_utils,
)
from contacts.utils.object_utils import Object


def run(*, cached: bool, ignore_updates: bool = False) -> None:
    icloud_contacts, _ = icloud_dao.read_contacts_and_groups(cached=cached)
    disk_contacts = disk_dao.read_objects(model.TYPE_CONTACT)

    icloud_id_to_icloud_contact_map: dict[str, Object] = {
        object_utils.get_path(contact, "icloud.uuid"): contact
        for contact in icloud_contacts
    }
    icloud_id_to_disk_contact_map: dict[str, Object] = {
        uuid: contact
        for contact in disk_contacts
        if (uuid := object_utils.get_path(contact, "icloud.uuid")) is not None
    }

    if not ignore_updates:
        for icloud_id in (
            icloud_id_to_icloud_contact_map.keys()
            - icloud_id_to_disk_contact_map.keys()
        ):
            icloud_contact = icloud_id_to_icloud_contact_map[icloud_id]
            print(
                pretty_print_utils.bordered(json_utils.dumps_indented(icloud_contact))
            )
            if input_utils.yes_no_input("Accept creation?"):
                icloud_id_to_disk_contact_map[icloud_id] = icloud_contact
                disk_dao.create_objects(model.TYPE_CONTACT, [icloud_contact])

    for icloud_id in (
        icloud_id_to_disk_contact_map.keys() & icloud_id_to_icloud_contact_map.keys()
    ):
        icloud_contact = icloud_id_to_icloud_contact_map[icloud_id]
        disk_contact = icloud_id_to_disk_contact_map[icloud_id]

        updated_contact = object_utils.deep_merge(disk_contact, icloud_contact)
        diff = object_utils.diff(disk_contact, updated_contact)

        if diff:
            if contact_utils.only_etag_updated(diff):
                updated_contact["mtime"] = time.time()
                disk_dao.update_objects(model.TYPE_CONTACT, [updated_contact])
                continue

            if ignore_updates:
                continue

            current_contact_display = pretty_print_utils.bordered(
                json_utils.dumps_indented(disk_contact)
            )
            diff_display = pretty_print_utils.bordered(json_utils.dumps_indented(diff))
            print(pretty_print_utils.besides(current_contact_display, diff_display))

            if input_utils.yes_no_input("Accept update?"):
                updated_contact["mtime"] = time.time()
                disk_dao.update_objects(model.TYPE_CONTACT, [updated_contact])
