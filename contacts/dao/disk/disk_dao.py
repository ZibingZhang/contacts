"""The disk data source."""

from __future__ import annotations

import contextlib
import os
import sqlite3
import time

from contacts import model
from contacts.common import constant
from contacts.logger import LOG
from contacts.utils import contact_utils, uuid_utils


class DiskDao:
    PATH = os.path.join(constant.DATA_DIRECTORY, constant.CONTACTS_DB_FILE)

    def __init__(self):
        if not os.path.exists(constant.DATA_DIRECTORY):
            os.makedirs(constant.DATA_DIRECTORY)

        with contextlib.closing(DiskDao._connect()) as connection, connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS contacts (
                    id INTEGER PRIMARY KEY,
                    ctime REAL NOT NULL,
                    mtime REAL,
                    data TEXT NOT NULL
                )
                """
            )

    @staticmethod
    def _connect() -> sqlite3.Connection:
        return sqlite3.connect(DiskDao.PATH)

    @staticmethod
    def read_contacts() -> list[model.DiskContact]:
        LOG.info("Reading contacts from disk")

        with contextlib.closing(DiskDao._connect()) as connection, connection:
            rows = connection.execute("SELECT data FROM contacts").fetchall()

        contacts = [model.DiskContact.from_json(row[0]) for row in rows]

        LOG.info(f"Read {len(contacts)} contacts")

        for contact in contacts:
            if contact.mtime is None:
                contact.mtime = time.time()
                DiskDao.update_contacts([contact])

            if contact.icloud is None:
                contact.icloud = model.ICloudMetadata(uuid=uuid_utils.generate())
                DiskDao.update_contacts([contact])

        return sorted(contacts, key=lambda contact: contact.id)

    @staticmethod
    def create_contacts(contacts: list[model.Contact]) -> None:
        with contextlib.closing(DiskDao._connect()) as connection, connection:
            next_contact_id = (
                connection.execute(
                    "SELECT COALESCE(MAX(id), 0) FROM contacts"
                ).fetchone()[0]
                + 1
            )

            for contact in contacts:
                LOG.info(
                    f"Writing new contact {contact_utils.build_name_str(contact)} to disk"
                )

                contact.id = next_contact_id
                contact.ctime = time.time()
                contact.mtime = contact.ctime
                connection.execute(
                    "INSERT INTO contacts (id, ctime, mtime, data) VALUES (?, ?, ?, ?)",
                    (contact.id, contact.ctime, contact.mtime, contact.to_json()),
                )
                next_contact_id += 1

    @staticmethod
    def update_contacts(contacts: list[model.DiskContact]) -> None:
        with contextlib.closing(DiskDao._connect()) as connection, connection:
            for contact in contacts:
                LOG.info(
                    f"Writing updated contact {contact_utils.build_name_str(contact)} to disk"
                )

                connection.execute(
                    """
                    INSERT INTO contacts (id, ctime, mtime, data)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET mtime = excluded.mtime, data = excluded.data
                    """,
                    (
                        contact.id,
                        contact.ctime if contact.ctime is not None else 0,
                        contact.mtime,
                        contact.to_json(),
                    ),
                )
