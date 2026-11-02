"""Convert an icloud.model.ICloudGroup into a list object."""
from __future__ import annotations

from contacts.dao import icloud
from contacts.utils.object_utils import Object


def icloud_group_to_group(icloud_group: icloud.model.ICloudGroup) -> Object:
    """Convert an icloud.model.ICloudGroup into a list object.

    This only carries enough to identify the group on iCloud (name, uuid,
    etag) -- iCloud's membership (contactIds) is intentionally dropped, since
    a local list's membership comes from its own associations, not from iCloud.

    Args:
        icloud_group: The iCloud group to transform.

    Returns:
        The transformed list object.
    """
    return {
        "name": icloud_group.name,
        "icloud": {
            "uuid": icloud_group.groupId,
            "etag": icloud_group.etag,
        },
    }
