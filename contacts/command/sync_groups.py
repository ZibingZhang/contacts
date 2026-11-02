"""Command to push DB-backed lists (sync=True) to iCloud contact groups.

Each such list's `query` is re-run and its membership associations are
reconciled; the list is pushed to iCloud (created if it has no iCloud link
yet, else updated) when membership changed or it's new. A list with unchanged
membership and an existing iCloud link is skipped -- note this means a
renamed-but-otherwise-unchanged list won't have its new name pushed until
membership next changes.
"""
from __future__ import annotations

import time

from contacts import model
from contacts.dao import disk_dao
from contacts.logger import LOG
from contacts.server import association_service, list_service
from contacts.utils import command_utils, object_utils, uuid_utils
from contacts.utils.object_utils import Object


def run() -> None:
    contacts = disk_dao.read_objects(model.TYPE_CONTACT)
    lists = [
        a_list
        for a_list in disk_dao.read_objects(model.TYPE_LIST)
        if a_list.get("sync")
    ]

    if not lists:
        LOG.info("No lists configured to sync")
        return

    pushed_lists: list[Object] = []

    for a_list in lists:
        member_ids_before = association_service.member_ids_of(
            model.TYPE_LIST, a_list["id"], a_list.get("member_type", model.TYPE_CONTACT)
        )

        list_service.refresh_list(a_list["id"])

        member_ids = list_service.member_ids(a_list["id"])
        ids_changed = set(member_ids) != set(member_ids_before)

        is_new = object_utils.get_path(a_list, "icloud.uuid") is None
        if is_new:
            object_utils.set_path(a_list, "icloud.uuid", uuid_utils.generate())

        if not is_new and not ids_changed:
            LOG.info(f"Skipping list {a_list['name']}, unchanged")
            continue

        if is_new:
            command_utils.write_new_group_to_icloud(a_list, member_ids, contacts)
        else:
            command_utils.write_updated_group_to_icloud(a_list, member_ids, contacts)

        a_list["mtime"] = time.time()
        pushed_lists.append(a_list)
        time.sleep(1)

    if pushed_lists:
        LOG.info("Pulling groups to sync etags")
        _refresh_etags(pushed_lists)
        disk_dao.update_objects(model.TYPE_LIST, pushed_lists)


def _refresh_etags(lists: list[Object]) -> None:
    icloud_groups_by_uuid = {
        uuid: icloud_group
        for icloud_group in command_utils.read_groups_from_icloud()
        if (uuid := object_utils.get_path(icloud_group, "icloud.uuid")) is not None
    }

    for a_list in lists:
        uuid = object_utils.get_path(a_list, "icloud.uuid")
        icloud_group = icloud_groups_by_uuid.get(uuid)
        if icloud_group is not None:
            object_utils.set_path(
                a_list,
                "icloud.etag",
                object_utils.get_path(icloud_group, "icloud.etag"),
            )
