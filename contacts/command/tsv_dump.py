"""Command to dump a TSV file with contacts."""
from __future__ import annotations

import csv
import dataclasses
import json
import os
import typing

from contacts.common import constant
from contacts.dao import disk_dao
from contacts.utils import json_utils

if typing.TYPE_CHECKING:
    from typing import Any

    from contacts import model


def run(properties: list[str]) -> None:
    contacts = disk_dao.read_contacts()
    with open(
        os.path.join(constant.DATA_DIRECTORY, constant.TSV_FILE), "w", encoding="UTF8"
    ) as tsv_file:
        tsv_writer = csv.writer(
            tsv_file,
            delimiter="\t",
            escapechar="\\",
            quotechar="|",
            quoting=csv.QUOTE_NONE,
        )
        tsv_writer.writerow(["id"] + properties)
        _write_contacts(tsv_writer, contacts, properties)


def _write_contacts(
    tsv_writer, contacts: list[model.DiskContact], properties: list[str]
) -> None:
    for contact in sorted(contacts, key=lambda contact: contact.id):
        tsv_writer.writerow(
            [contact.id] + _extract_properties_from_contact(contact, properties)
        )


def _extract_properties_from_contact(
    contact: model.DiskContact, properties: list[str]
) -> list[str]:
    return [
        _extract_property_from_contact(contact, property) for property in properties
    ]


def _extract_property_from_contact(contact: model.DiskContact, property: str) -> str:
    fields = property.split(".")
    obj = contact
    for field in fields:
        obj = getattr(obj, field)
        if obj is None:
            return ""
    if type(obj) == str:
        return obj
    # if type(obj) == list:
    #     print(json.dumps_indented([obj[0].to_json()]))
    #     return str([item.to_json() for item in obj])
    # return obj.to_json()
    return json_utils.dumps(obj, cls=_JSONEncoder)


class _JSONEncoder(json.JSONEncoder):
    def default(self, o: Any) -> Any:
        dict = dataclasses.asdict(o)
        null_keys = set()
        items = dict.items()
        for key, value in items:
            if value is None:
                null_keys.add(key)
        for key in null_keys:
            del dict[key]
        return dict
