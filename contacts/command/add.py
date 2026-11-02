"""Command to add a contact."""

from __future__ import annotations

from contacts import model
from contacts.dao import disk_dao
from contacts.utils import (
    command_utils,
    contact_utils,
    input_utils,
    json_utils,
    uuid_utils,
)


def run() -> None:
    new_contacts = command_utils.read_new_contacts_from_disk()
    contacts = disk_dao.read_objects(model.TYPE_CONTACT)

    for new_contact in new_contacts:
        new_contact_name = contact_utils.build_name_str(new_contact)
        for contact in contacts:
            if new_contact_name == contact_utils.build_name_str(contact):
                if not input_utils.yes_no_input(
                    "A contact already exists with this name: "
                    f"{json_utils.dumps(contact)}\n"
                    f"Do you want to continue?"
                ):
                    break
        else:
            new_contact.setdefault("icloud", {})["uuid"] = uuid_utils.generate()
            print(f"Adding new contact {new_contact_name}")
            disk_dao.create_objects(model.TYPE_CONTACT, [new_contact])
            contacts.append(new_contact)
