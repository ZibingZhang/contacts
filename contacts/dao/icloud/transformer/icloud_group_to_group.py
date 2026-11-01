"""Convert an icloud.model.ICloudGroup into a model.Group."""
from __future__ import annotations

from contacts import model
from contacts.dao import icloud


def icloud_group_to_group(icloud_group: icloud.model.ICloudGroup) -> model.Group:
    """Convert an icloud.model.ICloudGroup into a model.Group.

    This only carries enough to identify the group on iCloud (name, uuid,
    etag) -- iCloud's membership (contactIds) is intentionally dropped, since
    a disk-backed model.Group's membership comes from running its own
    `query`, not from iCloud.

    Args:
        icloud_group: The iCloud group to transform.

    Returns:
        The transformed model.Group.
    """
    return model.Group(
        name=icloud_group.name,
        query="",
        icloud=model.group.ICloudGroupMetadata(
            etag=icloud_group.etag,
            uuid=icloud_group.groupId,
        ),
    )
