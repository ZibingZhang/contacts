"""Command to update remote contact groups."""
import time
from collections.abc import Callable

from contacts import model
from contacts.dao import disk_dao, icloud_dao
from contacts.utils import command_utils, uuid_utils


def run() -> None:
    contacts = disk_dao.read_contacts()
    _, icloud_groups = icloud_dao.read_contacts_and_groups()
    group_name_to_icloud_group_map: dict[str, model.Group] = {
        icloud_group.name: icloud_group for icloud_group in icloud_groups
    }

    new_groups: list[model.Group] = []
    updated_groups: list[model.Group] = []

    for name, predicate in GROUP_NAME_TO_PREDICATE_MAP.items():
        contact_uuids = [
            contact.icloud.uuid
            for contact in contacts
            if contact.icloud is not None and predicate(contact)
        ]
        if name not in group_name_to_icloud_group_map.keys():
            new_groups.append(
                model.Group(
                    icloud=model.group.ICloudGroupMetadata(
                        contact_uuids=contact_uuids,
                        uuid=uuid_utils.generate(),
                    ),
                    name=name,
                )
            )
        else:
            group = group_name_to_icloud_group_map[name]
            if set(contact_uuids) == set(group.icloud.contact_uuids):
                print(f"Skipping iCloud group {name}")
                continue
            group.icloud.contact_uuids = contact_uuids
            updated_groups.append(group)

    for group in new_groups:
        command_utils.write_new_group_to_icloud(group)
        time.sleep(1)
    for group in updated_groups:
        command_utils.write_updated_group_to_icloud(group)
        time.sleep(1)


def _has_tag_predicate_factory(tag: str) -> Callable[[model.Contact], bool]:
    return _has_any_tag_predicate_factory([tag])


def _has_any_tag_predicate_factory(tags: list[str]) -> Callable[[model.Contact], bool]:
    def has_any_tag_predicate(contact: model.Contact) -> bool:
        if contact.tags is None:
            return False
        for tag in tags:
            if tag in contact.tags:
                return True
        return False

    return has_any_tag_predicate


def _has_phone_number_predicate(contact: model.Contact) -> bool:
    return contact.phone_numbers is not None


GROUP_NAME_TO_PREDICATE_MAP: dict[str, Callable[[model.Contact], bool]] = {
    "CTY": _has_tag_predicate_factory("CTY"),
    "HubSpot": _has_tag_predicate_factory("HubSpot"),
    "Needham": _has_tag_predicate_factory("Needham"),
    "Northeastern": _has_tag_predicate_factory("NU"),
    "Phone Numbers": _has_phone_number_predicate,
    "PowerAdvocate": _has_tag_predicate_factory("PowerAdvocate"),
    "Sharks": _has_tag_predicate_factory("Sharks"),
}
