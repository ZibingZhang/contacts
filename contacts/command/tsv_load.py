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
    dataclasses_utils,
    input_utils,
    json_utils,
    pretty_print_utils,
)


def run(write: bool) -> None:
    contacts = {contact.id: contact for contact in disk_dao.read_contacts()}
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
                contact = model.Contact(name=model.Name())
                _update_contact_properties(contact, properties[1:], values[1:])
                print(
                    pretty_print_utils.bordered(
                        json_utils.dumps_indented(contact.to_dict())
                    )
                )
                if input_utils.yes_no_input("Accept creation?"):
                    if write:
                        disk_dao.create_contacts([contact])
                    else:
                        LOG.info(
                            f"Would have created contact {contact_utils.build_name_str(contact)} to disk"
                        )
                continue

            contact_id = int(values[0])

            contact = contacts[contact_id]
            original_contact = copy.deepcopy(contact)
            _update_contact_properties(contact, properties[1:], values[1:])

            diff = dataclasses_utils.diff(original_contact, contact)

            if diff:
                current_contact_display = pretty_print_utils.bordered(
                    json_utils.dumps_indented(original_contact.to_dict())
                )
                diff_display = pretty_print_utils.bordered(
                    json_utils.dumps_indented(diff)
                )
                print(pretty_print_utils.besides(current_contact_display, diff_display))

                if input_utils.yes_no_input("Accept update?"):
                    contact.mtime = time.time()
                    if write:
                        disk_dao.update_contacts([contact])
                    else:
                        LOG.info(
                            f"Would have updated {contact_utils.build_name_str(contact)} to disk"
                        )


def _update_contact_properties(
    contact: model.Contact, properties: list[str], values: list[str]
) -> None:
    for property, value in zip(properties, values):
        _update_contact_property(contact, property, value)


def _update_contact_property(contact: model.Contact, property: str, value: str) -> None:
    if value == "":
        return
    fields = property.split(".")
    obj = contact
    for field in fields[:-1]:
        obj = getattr(obj, field)
        if obj is None:
            return
    try:
        setattr(obj, fields[-1], json.loads(value))
    except json.decoder.JSONDecodeError:
        setattr(obj, fields[-1], value)
