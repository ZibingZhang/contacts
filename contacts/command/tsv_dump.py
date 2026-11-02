"""Command to dump a TSV file with contacts."""
from __future__ import annotations

import csv
import os

from contacts import model
from contacts.common import constant
from contacts.dao import disk_dao
from contacts.utils import json_utils, object_utils
from contacts.utils.object_utils import Object


def run(properties: list[str]) -> None:
    contacts = disk_dao.read_objects(model.TYPE_CONTACT)
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


def _write_contacts(tsv_writer, contacts: list[Object], properties: list[str]) -> None:
    for contact in sorted(contacts, key=lambda contact: contact["id"]):
        tsv_writer.writerow(
            [contact["id"]]
            + [_extract_property(contact, property) for property in properties]
        )


def _extract_property(contact: Object, property: str) -> str:
    value = object_utils.get_path(contact, property)

    if value is None:
        return ""
    if isinstance(value, str):
        return value

    return json_utils.dumps(value)
