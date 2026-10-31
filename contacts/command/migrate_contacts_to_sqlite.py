"""One-off command to migrate contacts from data/contacts/*.json files into the
SQLite-backed DiskDao. Does not delete the source files.
"""

from __future__ import annotations

import os
import sqlite3

from contacts import model
from contacts.common import constant
from contacts.dao import disk_dao
from contacts.logger import LOG
from contacts.utils import file_io_utils

_CONTACT_FILES_DIRECTORY = os.path.join(
    constant.DATA_DIRECTORY, constant.CONTACT_FILES_DIRECTORY
)


def run() -> None:
    file_names = os.listdir(_CONTACT_FILES_DIRECTORY)
    LOG.info(f"Found {len(file_names)} contact files to migrate")

    contacts = [
        file_io_utils.read_json_object_as_dataclass_object(
            os.path.join(_CONTACT_FILES_DIRECTORY, file_name), model.DiskContact
        )
        for file_name in file_names
    ]

    # No creation time was ever recorded for these, so backfill with a 0
    # sentinel rather than guessing at one.
    for contact in contacts:
        contact.ctime = 0

    with sqlite3.connect(disk_dao.PATH) as connection:
        connection.execute("DELETE FROM contacts")
        connection.executemany(
            "INSERT INTO contacts (id, ctime, mtime, data) VALUES (?, ?, ?, ?)",
            [
                (contact.id, contact.ctime, contact.mtime, contact.to_json())
                for contact in contacts
            ],
        )

    _verify(contacts)

    LOG.info(f"Migrated {len(contacts)} contacts to {disk_dao.PATH}")


def _verify(contacts: list[model.DiskContact]) -> None:
    with sqlite3.connect(disk_dao.PATH) as connection:
        [(row_count,)] = connection.execute("SELECT COUNT(*) FROM contacts").fetchall()
        if row_count != len(contacts):
            raise RuntimeError(
                f"Expected {len(contacts)} migrated contacts, found {row_count}"
            )

        rows = connection.execute("SELECT id, data FROM contacts").fetchall()

    migrated_contacts_by_id = {id_: model.DiskContact.from_json(data) for id_, data in rows}
    for contact in contacts:
        migrated_contact = migrated_contacts_by_id[contact.id]
        if migrated_contact.to_dict() != contact.to_dict():
            raise RuntimeError(f"Mismatch migrating contact {contact.id}")
