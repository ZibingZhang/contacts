"""Utilities for file I/O."""
from __future__ import annotations

import json
import textwrap
from collections.abc import Sequence
from typing import Type, TypeVar

from contacts import model
from contacts.utils import dataclasses_utils

T = TypeVar("T", bound=dataclasses_utils.DataClassJsonMixin)


def read_json_object_as_dataclass_object(path: str, cls: Type[T]) -> T:
    """Read a dataclass object from a file.

    Read a json object from a file and transform it to a dataclass object.

    Args:
        path: The path of the file containing the json object.
        cls: The dataclass to convert the json object to.

    Returns:
        A dataclass object.
    """
    with open(path, encoding="utf-8") as f:
        obj = json.loads(f.read().strip())
    return cls.from_dict(obj)


def read_json_array_as_dataclass_objects(path: str, cls: Type[T]) -> list[T]:
    """Read dataclass objects from a file.

    Read a json array of objects from a file and transform them to a list of dataclass
    objects.

    Args:
        path: The path of the file containing the json array of objects.
        cls: The dataclass to convert the json objects to.

    Returns:
        A list of dataclass objects.
    """
    with open(path, encoding="utf-8") as f:
        objects = json.loads(f.read().strip())
    return [cls.from_dict(obj) for obj in objects]


def write_contact_as_json_object(path: str, contact: model.Contact) -> None:
    """Write a contact to a file.

    Transform a contact to a json object write it to a file.

    Args:
        path: The path of the file to write to.
        contact: The contact to write to the file.
    """
    with open(path, mode="w+", encoding="utf-8") as f:
        f.write(contact.to_json(indent=2))


def write_contacts_as_json_array(path: str, contacts: Sequence[model.Contact]) -> None:
    """Write contacts to a file.

    Transform a sequence of contacts to a json array of objects and write them to a
    file.

    Args:
        path: The path of the file to write to.
        contacts: The contacts to write to the file.
    """
    sorted_contacts = sorted(contacts, key=_contact_key)
    write_dataclass_objects_as_json_array(path, sorted_contacts)


def write_dataclass_objects_as_json_array(
    path: str, objects: Sequence[dataclasses_utils.DataClassJsonMixin]
) -> None:
    """Write dataclass objects to a file.

    Transform a sequence of dataclass objects to a json array of objects and write them
    to a file.

    Args:
        path: The path of the file to write to.
        objects: The dataclass objects to write to the file.
    """
    output = ""
    with open(path, mode="w", encoding="utf-8") as f:
        output += "[\n"
        output += textwrap.indent(",\n".join(obj.to_json() for obj in objects), "    ")
        output += "\n]\n"
        f.write(output)


def _contact_key(contact: model.Contact) -> str:
    return f"{contact.name.last_name or ' '}{contact.name.first_name}{contact.tags}"
