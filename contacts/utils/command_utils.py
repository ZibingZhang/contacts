"""High-level utilities for commands."""

from __future__ import annotations

import os.path
from collections.abc import Sequence

from contacts import model
from contacts.common import constant
from contacts.dao import disk_dao, icloud_dao
from contacts.utils import contact_utils, file_io_utils, input_utils, progress_utils
from contacts.utils.object_utils import Object


@progress_utils.annotate("Reading contacts from disk")
def read_contacts_from_disk() -> list[Object]:
    contacts = disk_dao.read_objects(model.TYPE_CONTACT)
    progress_utils.message(f"Read {len(contacts)} contact(s)")
    return contacts


@progress_utils.annotate("Writing contacts to disk")
def write_contacts_to_disk(contacts: Sequence[Object]) -> None:
    disk_dao.update_objects(model.TYPE_CONTACT, list(contacts))
    progress_utils.message(f"Wrote {len(contacts)} contact(s)")


@progress_utils.annotate("Reading lists from disk")
def read_lists_from_disk() -> list[Object]:
    lists = disk_dao.read_objects(model.TYPE_LIST)
    progress_utils.message(f"Read {len(lists)} list(s)")
    return lists


@progress_utils.annotate("Reading new contacts from disk")
def read_new_contacts_from_disk(
    *, file_name: str = constant.NEW_CONTACTS_FILE_NAME
) -> list[Object]:
    contacts = file_io_utils.read_json_array(
        os.path.join(constant.DATA_DIRECTORY, file_name)
    )
    progress_utils.message(f"Read {len(contacts)} contact(s)")
    return contacts


@progress_utils.annotate("Reading contacts from iCloud")
def read_contacts_from_icloud(cached: bool = False) -> list[Object]:
    contacts, _ = icloud_dao.read_contacts_and_groups(cached=cached)
    progress_utils.message(f"Read {len(contacts)} contact(s)")
    return contacts


@progress_utils.annotate("Reading groups from iCloud")
def read_groups_from_icloud() -> list[Object]:
    _, groups = icloud_dao.read_contacts_and_groups()
    progress_utils.message(f"Read {len(groups)} groups(s)")
    return groups


@progress_utils.annotate("Creating new iCloud contacts")
def write_new_contacts_to_icloud(contacts: list[Object]) -> None:
    if len(contacts) > 0:
        icloud_dao.create_contacts(contacts)
    progress_utils.message(f"Created {len(contacts)} contact(s)")


@progress_utils.annotate("Updating iCloud contacts")
def write_updated_contacts_to_icloud(contacts: list[Object]) -> None:
    if len(contacts) > 0:
        icloud_dao.update_contacts(contacts)
    progress_utils.message(f"Updated {len(contacts)} contact(s)")


@progress_utils.annotate("Creating iCloud group")
def write_new_group_to_icloud(
    a_list: Object, member_ids: list[int], contacts: list[Object]
) -> None:
    icloud_dao.create_group(a_list, member_ids, contacts)
    progress_utils.message(
        f"Created group {a_list['name']} with {len(member_ids)} contact(s)"
    )


@progress_utils.annotate("Updating iCloud group")
def write_updated_group_to_icloud(
    a_list: Object, member_ids: list[int], contacts: list[Object]
) -> None:
    icloud_dao.update_group(a_list, member_ids, contacts)
    progress_utils.message(
        f"Updated group {a_list['name']} with {len(member_ids)} contact(s)"
    )


@progress_utils.annotate("Reading families")
def read_families_from_disk(
    *, file_name: str = constant.FAMILIES_FILE
) -> list[model.Family]:
    families = file_io_utils.read_json_array_as_dataclass_objects(
        os.path.join(constant.DATA_DIRECTORY, file_name),
        model.Family,
    )
    progress_utils.message(f"Read {len(families)} families(s)")
    return families


def get_contact_by_name(
    contacts: Sequence[Object], name: str | None = None
) -> Object | None:
    if name is None:
        name = input_utils.basic_input(
            "Enter the name of the contact to select", lower=True
        )
    else:
        name = name.lower()

    matching_contacts = contact_utils.search_contacts(contacts, name)
    if len(matching_contacts) == 0:
        return None
    elif len(matching_contacts) == 1:
        return matching_contacts[0]
    else:
        for i, contact in enumerate(matching_contacts):
            print(f"{i + 1}. {contact_utils.build_name_and_tags_str(contact)}")

        selection_inp = input_utils.input_with_skip("Select the contact")
        while True:
            try:
                selection = int(selection_inp)
                if selection < 1:
                    selection_inp = input_utils.input_with_skip(
                        "Too low. Select the contact"
                    )
                    continue
                if selection > len(matching_contacts):
                    selection_inp = input_utils.input_with_skip(
                        "Too high. Select the contact"
                    )
                    continue
                break
            except ValueError:
                selection_inp = input_utils.input_with_skip(
                    "Not a number. Select the contact"
                )

        return matching_contacts[selection - 1]
