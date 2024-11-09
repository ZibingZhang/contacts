"""Command to list all tags."""
from __future__ import annotations

from contacts.dao import disk_dao
from contacts.utils import contact_utils


def run(tags: list[str]) -> None:
    contacts = disk_dao.read_contacts()

    if not tags:
        all_tags = contact_utils.extract_tags(contacts)
        all_tags_by_row = [all_tags[i : i + 5] for i in range(0, len(all_tags), 5)]
        for row in all_tags_by_row:
            for tag in row:
                print(tag.ljust(20), end="")
            print("")
    else:
        count = 0
        for contact in contacts:
            if contact.tags and all(tag in contact.tags for tag in tags):
                print(contact_utils.build_name_and_tags_str(contact))
                count += 1

        print("===============")
        print(f"total: {count}")
