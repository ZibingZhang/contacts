"""Convert a model.Group into an icloud.model.ICloudGroup."""
from __future__ import annotations

from contacts import model
from contacts.dao import icloud
from contacts.utils import uuid_utils


def group_to_icloud_group(
    group: model.Group, contact_id_to_icloud_uuid: dict[int, str]
) -> icloud.model.ICloudGroup:
    """Convert a model.Group into an icloud.model.ICloudGroup.

    Args:
        group: The group to transform.
        contact_id_to_icloud_uuid: Maps each of `group`'s local contact ids to
            its iCloud uuid. Contact ids with no entry (not yet synced to
            iCloud) are omitted from the resulting group.

    Returns:
        The transformed icloud.model.ICloudGroup.
    """
    contact_uuids = [
        contact_id_to_icloud_uuid[contact_id]
        for contact_id in group.ids or []
        if contact_id in contact_id_to_icloud_uuid
    ]

    return icloud.model.ICloudGroup(
        contactIds=contact_uuids,
        etag=group.icloud.etag if group.icloud is not None else None,
        groupId=group.icloud.uuid if group.icloud is not None else uuid_utils.generate(),
        name=group.name,
        isGuardianApproved=False,
        whitelisted=False,
    )
