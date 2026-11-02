"""Command to list all families."""
from __future__ import annotations

from contacts import model
from contacts.utils import command_utils, contact_utils
from contacts.utils.object_utils import Object


def run() -> None:
    contacts = command_utils.read_contacts_from_disk()
    families = command_utils.read_families_from_disk()
    contact_id_to_contact_map: dict[int, Object] = {
        contact["id"]: contact for contact in contacts
    }

    for family in families:
        print(50 * "=")
        _print_family(family, contact_id_to_contact_map)
    print(50 * "=")


# https://simonhessner.de/python-3-recursively-print-structured-tree-including-hierarchy-markers-using-depth-first-search/
def _print_family(
    family: model.Family | int,
    contact_id_to_contact_map: dict[int, Object],
    level_markers: tuple[bool, ...] = (),
) -> None:
    markers = "".join(map(lambda draw: "│  " if draw else "   ", level_markers[:-1]))

    if len(level_markers) > 0:
        if level_markers[-1]:
            markers += "├─ "
        else:
            markers += "└─ "

    if isinstance(family, int):
        line = contact_utils.build_name_and_id_str(contact_id_to_contact_map[family])
        print(f"{markers}{line}")
        return None

    if family.parents is None:
        print(f"{markers}-----")
    else:
        line = " ─ ".join(
            contact_utils.build_name_and_id_str(contact_id_to_contact_map[value])
            for value in family.parents
        )
        print(f"{markers}{line}")

    if family.children is None:
        return None

    for i, child in enumerate(family.children):
        is_last = i == len(family.children) - 1
        _print_family(child, contact_id_to_contact_map, (*level_markers, not is_last))
