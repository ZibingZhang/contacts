"""Command to start the tag repl."""

from __future__ import annotations

import time
from collections.abc import Sequence

from contacts import model
from contacts.common import error
from contacts.dao import disk_dao
from contacts.utils import command_utils, contact_utils, input_utils
from contacts.utils.object_utils import Object


def run(tags: list[str]) -> None:
    if tags:
        print(f"Adding {tags} tags to contacts...")
    else:
        print("Adding tags to contacts...")
    while True:
        try:
            contacts = disk_dao.read_objects(model.TYPE_CONTACT)
            _add_tags_to_contact(contacts, tags)
        except error.CommandSkipError:
            print("Skipping...")


def _add_tags_to_contact(contacts: Sequence[Object], tags: list[str]) -> None:
    contact = command_utils.get_contact_by_name(contacts)
    if contact is None:
        return None

    print(contact_utils.build_name_and_tags_str(contact))
    while True:
        new_tags = tags or [
            tag.strip()
            for tag in input_utils.input_with_skip("Enter the tags to add").split(",")
        ]
        tags = sorted(set((contact.get("tags") or []) + new_tags))

        print(f"tags: {tags}")
        if input_utils.yes_no_input("Continue with this set of tags?"):
            contact["tags"] = tags
            contact["mtime"] = time.time()
            disk_dao.update_objects(model.TYPE_CONTACT, [contact])
            break
