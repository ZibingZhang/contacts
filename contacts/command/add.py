"""Command to add a contact."""
from __future__ import annotations

import time
from typing import cast

from contacts import model
from contacts.utils import command_utils, contact_utils, input_utils, uuid_utils


def run() -> None:
    new_contacts = command_utils.read_new_contacts_from_disk()
    contacts = command_utils.read_contacts_from_disk()

    for new_contact in new_contacts:
        new_contact_name = contact_utils.build_name_str(new_contact)
        for contact in contacts:
            if new_contact_name == contact_utils.build_name_str(contact):
                if not input_utils.yes_no_input(
                    f"A contact already exists with this name: {contact.to_json()}\n"
                    f"Do you want to continue?"
                ):
                    break
        else:
            new_contact.id = len(contacts) + 1
            new_contact.mtime = time.time()
            new_contact.icloud = model.ICloudMetadata(uuid=uuid_utils.generate())
            contacts.append(cast(model.DiskContact, new_contact))
            print(f"Adding new contact {new_contact_name}")
            command_utils.write_contacts_to_disk(contacts)