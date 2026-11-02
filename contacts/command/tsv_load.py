"""Command to load a TSV file with contacts."""
from __future__ import annotations

import copy
import csv
import json
import os
import time

from contacts import model
from contacts.common import constant
from contacts.dao import disk_dao
from contacts.logger import LOG
from contacts.utils import (
    contact_utils,
    input_utils,
    json_utils,
    object_utils,
    pretty_print_utils,
)
from contacts.utils.object_utils import Object


def run(write: bool) -> None:
    contacts = {
        contact["id"]: contact for contact in disk_dao.read_objects(model.TYPE_CONTACT)
    }
    with open(
        os.path.join(constant.DATA_DIRECTORY, constant.TSV_FILE), "r", encoding="UTF8"
    ) as tsv_file:
        tsv_reader = csv.reader(
            tsv_file,
            delimiter="\t",
            escapechar="\\",
            quotechar=None,
            quoting=csv.QUOTE_NONE,
        )
        properties = next(tsv_reader)

        if properties[0] != "id":
            raise ValueError(
                f"Expected id to be the first column, found {properties[0]}"
            )

        for values in tsv_reader:
            if values[0] == "":
                contact: Object = {"name": {}}
                _update_contact_properties(contact, properties[1:], values[1:])
                print(pretty_print_utils.bordered(json_utils.dumps_indented(contact)))
                if input_utils.yes_no_input("Accept creation?"):
                    if write:
                        disk_dao.create_objects(model.TYPE_CONTACT, [contact])
                    else:
                        name = contact_utils.build_name_str(contact)
                        LOG.info(f"Would have created contact {name} to disk")
                continue

            contact_id = int(values[0])

            if contact_id not in contacts:
                raise ValueError(f"Unknown contact id {contact_id}")
            contact = contacts[contact_id]
            original_contact = copy.deepcopy(contact)
            _update_contact_properties(contact, properties[1:], values[1:])

            diff = object_utils.diff(original_contact, contact)

            if diff:
                current_contact_display = pretty_print_utils.bordered(
                    json_utils.dumps_indented(original_contact)
                )
                diff_display = pretty_print_utils.bordered(
                    json_utils.dumps_indented(diff)
                )
                print(pretty_print_utils.besides(current_contact_display, diff_display))

                if input_utils.yes_no_input("Accept update?"):
                    contact["mtime"] = time.time()
                    if write:
                        disk_dao.update_objects(model.TYPE_CONTACT, [contact])
                    else:
                        name = contact_utils.build_name_str(contact)
                        LOG.info(f"Would have updated {name} to disk")


def _update_contact_properties(
    contact: Object, properties: list[str], values: list[str]
) -> None:
    for property, value in zip(properties, values):
        _update_contact_property(contact, property, value)


def _update_contact_property(contact: Object, property: str, value: str) -> None:
    if value == "":
        return

    try:
        parsed = json.loads(value)
    except json.decoder.JSONDecodeError:
        parsed = value

    object_utils.set_path(contact, property, parsed)
