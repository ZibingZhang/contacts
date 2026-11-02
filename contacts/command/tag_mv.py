"""Command to rename a tag."""
from __future__ import annotations

import time

from contacts.utils import command_utils, contact_utils, input_utils


def run(old: str, new: str) -> None:
    contacts = command_utils.read_contacts_from_disk()

    print(f"Changing tag from {old} to {new}.")

    all_tags = contact_utils.extract_tags(contacts)
    if new in all_tags:
        if not input_utils.yes_no_input("Tag already exists. Do you wish to continue?"):
            return None

    renamed = []
    for contact in contacts:
        tags = contact.get("tags")
        if tags is not None and old in tags:
            contact["tags"] = sorted(set(tag for tag in tags if tag != old) | {new})
            contact["mtime"] = time.time()
            renamed.append(contact)

    if input_utils.yes_no_input(f"Update {len(renamed)} contact(s)?"):
        command_utils.write_contacts_to_disk(renamed)
