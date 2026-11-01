"""Command to push DB-backed groups (sync=True) to iCloud contact groups.

Each such group's `query` is re-run to refresh its cached `ids`; the group is
pushed to iCloud (created if it has no iCloud link yet, else updated) when
membership changed or it's new. A group with unchanged membership and an
existing iCloud link is skipped -- note this means a renamed-but-otherwise-
unchanged group won't have its new name pushed until membership next changes.
"""
from __future__ import annotations

import time
from typing import cast

from contacts import model
from contacts.dao import disk_dao
from contacts.logger import LOG
from contacts.utils import command_utils, uuid_utils


def run() -> None:
    contacts = disk_dao.read_contacts()
    groups = [group for group in disk_dao.read_groups() if group.sync]

    if not groups:
        LOG.info("No groups configured to sync")
        return

    pushed_groups: list[model.DiskGroup] = []

    for group in groups:
        new_ids = _run_query(group.query)
        ids_changed = set(new_ids) != set(group.ids or [])
        if ids_changed:
            group.ids = new_ids
            group.mtime = time.time()

        is_new = group.icloud is None
        if is_new:
            group.icloud = model.ICloudGroupMetadata(uuid=uuid_utils.generate())

        if not is_new and not ids_changed:
            LOG.info(f"Skipping group {group.name}, unchanged")
            continue

        if is_new:
            command_utils.write_new_group_to_icloud(group, contacts)
        else:
            command_utils.write_updated_group_to_icloud(group, contacts)

        pushed_groups.append(group)
        time.sleep(1)

    if pushed_groups:
        LOG.info("Pulling groups to sync etags")
        _refresh_etags(pushed_groups)
        disk_dao.update_groups(pushed_groups)


def _run_query(query: str) -> list[int]:
    return [int(row[0]) for row in disk_dao.run_readonly_query(query)]


def _refresh_etags(groups: list[model.DiskGroup]) -> None:
    icloud_groups_by_uuid = {
        icloud_group.icloud.uuid: icloud_group
        for icloud_group in command_utils.read_groups_from_icloud()
        if icloud_group.icloud is not None
    }

    for group in groups:
        icloud_metadata = cast(model.ICloudGroupMetadata, group.icloud)
        icloud_group = icloud_groups_by_uuid.get(icloud_metadata.uuid)
        if icloud_group is not None:
            icloud_metadata.etag = cast(
                model.ICloudGroupMetadata, icloud_group.icloud
            ).etag
