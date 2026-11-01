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

        DiskDao._migrate_file()

        with contextlib.closing(DiskDao._connect()) as connection, connection:
            connection.execute("PRAGMA journal_mode=WAL")
            DiskDao._migrate_table(connection)
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS contact (
                    id INTEGER PRIMARY KEY,
                    ctime REAL NOT NULL,
                    mtime REAL,
                    data TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS "group" (
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
    def _migrate_file() -> None:
        old_path = os.path.join(os.path.dirname(DiskDao.PATH), "contacts.db")
        if old_path == DiskDao.PATH or not os.path.exists(old_path):
            return
        if os.path.exists(DiskDao.PATH):
            return

        LOG.info(f"Migrating {old_path} to {DiskDao.PATH}")
        os.rename(old_path, DiskDao.PATH)
        for suffix in ("-wal", "-shm"):
            if os.path.exists(old_path + suffix):
                os.rename(old_path + suffix, DiskDao.PATH + suffix)

    @staticmethod
    def _migrate_table(connection: sqlite3.Connection) -> None:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        if "contacts" in tables and "contact" not in tables:
            LOG.info("Migrating table contacts to contact")
            connection.execute("ALTER TABLE contacts RENAME TO contact")

    @staticmethod
    def read_contacts() -> list[model.DiskContact]:
        LOG.info("Reading contacts from disk")

        with contextlib.closing(DiskDao._connect()) as connection, connection:
            rows = connection.execute("SELECT data FROM contact").fetchall()

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
                    "SELECT COALESCE(MAX(id), 0) FROM contact"
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
                    "INSERT INTO contact (id, ctime, mtime, data) VALUES (?, ?, ?, ?)",
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
                    INSERT INTO contact (id, ctime, mtime, data)
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

    @staticmethod
    def read_groups() -> list[model.DiskGroup]:
        LOG.info("Reading groups from disk")

        with contextlib.closing(DiskDao._connect()) as connection, connection:
            rows = connection.execute('SELECT data FROM "group"').fetchall()

        groups = [model.DiskGroup.from_json(row[0]) for row in rows]

        LOG.info(f"Read {len(groups)} groups")

        return sorted(groups, key=lambda group: group.id)

    @staticmethod
    def create_groups(groups: list[model.Group]) -> None:
        with contextlib.closing(DiskDao._connect()) as connection, connection:
            next_group_id = (
                connection.execute(
                    'SELECT COALESCE(MAX(id), 0) FROM "group"'
                ).fetchone()[0]
                + 1
            )

            for group in groups:
                LOG.info(f"Writing new group {group.name} to disk")

                group.id = next_group_id
                group.ctime = time.time()
                group.mtime = group.ctime
                connection.execute(
                    'INSERT INTO "group" (id, ctime, mtime, data) VALUES (?, ?, ?, ?)',
                    (group.id, group.ctime, group.mtime, group.to_json()),
                )
                next_group_id += 1

    @staticmethod
    def update_groups(groups: list[model.DiskGroup]) -> None:
        with contextlib.closing(DiskDao._connect()) as connection, connection:
            for group in groups:
                LOG.info(f"Writing updated group {group.name} to disk")

                connection.execute(
                    """
                    INSERT INTO "group" (id, ctime, mtime, data)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET mtime = excluded.mtime, data = excluded.data
                    """,
                    (
                        group.id,
                        group.ctime if group.ctime is not None else 0,
                        group.mtime,
                        group.to_json(),
                    ),
                )

    @staticmethod
    def run_readonly_query(sql: str) -> list[tuple]:
        """Runs a read-only SQL statement against data.db, e.g. to resolve a
        group's `query` into the contact ids it currently matches.

        Args:
            sql: The SQL statement to run.

        Returns:
            The fetched rows.
        """
        with contextlib.closing(
            sqlite3.connect(f"file:{DiskDao.PATH}?mode=ro", uri=True)
        ) as connection:
            return connection.execute(sql).fetchall()
