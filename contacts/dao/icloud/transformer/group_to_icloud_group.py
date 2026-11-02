"""Convert a list object into an icloud.model.ICloudGroup."""
from __future__ import annotations

from contacts.dao import icloud
from contacts.utils import object_utils, uuid_utils
from contacts.utils.object_utils import Object


def group_to_icloud_group(
    a_list: Object,
    member_ids: list[int],
    contact_id_to_icloud_uuid: dict[int, str],
) -> icloud.model.ICloudGroup:
    """Convert a list object into an icloud.model.ICloudGroup.

    Membership is passed in rather than read off the list, since it lives in
    associations.

    Args:
        a_list: The list to transform.
        member_ids: The local contact ids belonging to the list.
        contact_id_to_icloud_uuid: Maps each of `member_ids` to its iCloud
            uuid. Contact ids with no entry (not yet synced to iCloud) are
            omitted from the resulting group.

    Returns:
        The transformed icloud.model.ICloudGroup.
    """
    contact_uuids = [
        contact_id_to_icloud_uuid[contact_id]
        for contact_id in member_ids
        if contact_id in contact_id_to_icloud_uuid
    ]

    uuid = object_utils.get_path(a_list, "icloud.uuid")

    return icloud.model.ICloudGroup(
        contactIds=contact_uuids,
        etag=object_utils.get_path(a_list, "icloud.etag"),
        groupId=uuid if uuid is not None else uuid_utils.generate(),
        name=a_list["name"],
        isGuardianApproved=False,
        whitelisted=False,
    )
