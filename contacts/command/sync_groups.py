from typing import Callable

import model
from utils import command_utils, uuid_utils

from data import icloud


def run(*, cache_path: str, data_path: str) -> None:
    contacts = command_utils.read_contacts_from_disk(data_path=data_path)
    icloud_groups = command_utils.read_groups_from_icloud(
        cache_path=cache_path, cached=False
    )
    icloud_group_name_to_icloud_group_map = {
        icloud_group.name: icloud_group for icloud_group in icloud_groups
    }

    for name, predicate in GROUP_NAME_TO_PREDICATE_MAP.items():
        contact_ids = [
            contact.icloud.uuid for contact in contacts if predicate(contact)
        ]
        if name not in icloud_group_name_to_icloud_group_map.keys():
            command_utils.write_new_group_to_icloud(
                icloud.ICloudGroup(
                    contactIds=contact_ids, groupId=uuid_utils.generate(), name=name
                )
            )
        else:
            icloud_group = icloud_group_name_to_icloud_group_map.get(name)
            icloud_group.contactIds = contact_ids
            command_utils.write_updated_group_to_icloud(icloud_group)


def _has_tag_predicate_factory(tag: str) -> Callable[[model.Contact], bool]:
    def has_tag_predicate(contact: model.Contact) -> bool:
        return contact.tags and tag in contact.tags

    return has_tag_predicate


def _has_phone_number_predicate(contact: model.Contact) -> bool:
    return bool(contact.phone_numbers)


GROUP_NAME_TO_PREDICATE_MAP: dict[str, Callable[[model.Contact], bool]] = {
    "CTY": _has_tag_predicate_factory("CTY"),
    "HubSpot": _has_tag_predicate_factory("HubSpot"),
    "Needham": _has_tag_predicate_factory("Needham"),
    "Northeastern": _has_tag_predicate_factory("NU"),
    "Phone Numbers": _has_phone_number_predicate,
    "PowerAdvocate": _has_tag_predicate_factory("PowerAdvocate"),
    "Sharks": _has_tag_predicate_factory("Sharks"),
}