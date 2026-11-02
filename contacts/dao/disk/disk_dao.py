"""The disk data source.

Everything is stored in one `object` table, keyed by `(type, id)` with a
sequence per type, so a new object type needs no schema change. An object's
fields live in the `data` JSON blob; `id`, `ctime` and `mtime` are columns and
are merged back in when an object is read, so callers see one flat dict.
"""

from __future__ import annotations

import contextlib
import json
import os
import sqlite3
import time

from contacts.common import constant
from contacts.logger import LOG
from contacts.model import builtin_schemas, schema
from contacts.utils import json_utils, object_utils
from contacts.utils.object_utils import Object

# Fields that live in columns rather than in the `data` blob.
_COLUMN_FIELDS = ("id", "ctime", "mtime")


class DiskDao:
    PATH = os.path.join(constant.DATA_DIRECTORY, constant.CONTACTS_DB_FILE)

    @staticmethod
    def initialize() -> None:
        """Create the database if needed and seed built-in schemas.

        Called explicitly from the entrypoint rather than on import, so tests
        and tooling can import this module freely without touching disk.
        """
        if not os.path.exists(constant.DATA_DIRECTORY):
            os.makedirs(constant.DATA_DIRECTORY)

        with contextlib.closing(DiskDao._connect()) as connection, connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS object (
                    type  TEXT    NOT NULL,
                    id    INTEGER NOT NULL,
                    ctime REAL    NOT NULL,
                    mtime REAL,
                    data  TEXT    NOT NULL,
                    PRIMARY KEY (type, id)
                )
                """
            )
            DiskDao._create_association_indexes(connection)
            DiskDao._seed_builtin_schemas(connection)
            DiskDao._create_missing_views(connection)

    @staticmethod
    def _connect() -> sqlite3.Connection:
        return sqlite3.connect(DiskDao.PATH)

    @staticmethod
    def _create_association_indexes(connection: sqlite3.Connection) -> None:
        """Indexes both sides of an association.

        Associations are the one high-volume type -- one row per list member --
        and they're always looked up by one side, so without these every
        membership read is a full table scan.
        """
        for side in (1, 2):
            connection.execute(
                f"""
                CREATE INDEX IF NOT EXISTS idx_association_side_{side}
                ON object(
                    json_extract(data, '$.object_type_{side}'),
                    json_extract(data, '$.object_id_{side}')
                )
                WHERE type = '{schema.TYPE_ASSOCIATION}'
                """
            )

    @staticmethod
    def _seed_builtin_schemas(connection: sqlite3.Connection) -> None:
        """Writes the app-owned schemas, overwriting whatever is stored.

        Built-in schemas aren't user-editable, so code is the source of truth;
        rewriting them on startup keeps the stored copies from going stale when
        their definitions change.
        """
        rows = connection.execute(
            "SELECT id, data FROM object WHERE type = ?", (schema.TYPE_SCHEMA,)
        ).fetchall()
        id_by_name = {json.loads(data).get("name"): row_id for row_id, data in rows}
        next_id = max((row_id for row_id, _ in rows), default=0) + 1

        now = time.time()

        for built_in in builtin_schemas.BUILT_IN_SCHEMAS.values():
            data = json_utils.dumps(built_in.to_dict())
            existing_id = id_by_name.get(built_in.name)

            if existing_id is None:
                LOG.info(f"Seeding built-in schema {built_in.name}")
                connection.execute(
                    """
                    INSERT INTO object (type, id, ctime, mtime, data)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (schema.TYPE_SCHEMA, next_id, now, now, data),
                )
                next_id += 1
            else:
                connection.execute(
                    """
                    UPDATE object SET mtime = ?, data = ?
                    WHERE type = ? AND id = ? AND data != ?
                    """,
                    (now, data, schema.TYPE_SCHEMA, existing_id, data),
                )

    @staticmethod
    def _schema_names(connection: sqlite3.Connection) -> set[str]:
        return {
            json.loads(row[0]).get("name")
            for row in connection.execute(
                "SELECT data FROM object WHERE type = ?", (schema.TYPE_SCHEMA,)
            )
        }

    @staticmethod
    def _create_missing_views(connection: sqlite3.Connection) -> None:
        """Creates one view per type, so each type reads like its own table.

        This is what keeps a list's stored `query` (`SELECT id FROM contact
        WHERE ...`) and the admin console working unchanged.

        Only missing views are created. Views are never dropped here, since a
        stale one is harmless and the admin console lets views be created by
        hand.
        """
        existing = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'view'"
            )
        }

        for name in sorted(DiskDao._schema_names(connection) - existing):
            # A view definition is stored as text, so the type can't be bound
            # as a parameter. Safe to interpolate: schema names are validated
            # as identifiers, and the quotes below are escaped.
            LOG.info(f"Creating view {name}")
            literal = name.replace("'", "''")
            connection.execute(
                f'CREATE VIEW "{name}" AS SELECT id, ctime, mtime, data '
                f"FROM object WHERE type = '{literal}'"
            )

    @staticmethod
    def sync_views() -> None:
        """Creates any missing per-type view, after a schema is added."""
        with contextlib.closing(DiskDao._connect()) as connection, connection:
            DiskDao._create_missing_views(connection)

    @staticmethod
    def drop_view(view_name: str) -> None:
        """Drops a type's view, for when its schema is deleted or renamed.

        Args:
            view_name: The view to drop.
        """
        with contextlib.closing(DiskDao._connect()) as connection, connection:
            connection.execute(f'DROP VIEW IF EXISTS "{view_name}"')

    @staticmethod
    def _row_to_object(row: tuple) -> Object:
        object_id, ctime, mtime, data = row

        obj: Object = json.loads(data)
        obj["id"] = object_id
        obj["ctime"] = ctime
        if mtime is not None:
            obj["mtime"] = mtime

        return obj

    @staticmethod
    def _object_to_row(obj: Object) -> tuple[int, float, float | None, str]:
        data = {key: value for key, value in obj.items() if key not in _COLUMN_FIELDS}
        ctime = obj.get("ctime")

        return (
            obj["id"],
            ctime if ctime is not None else 0,
            obj.get("mtime"),
            json_utils.dumps(object_utils.prune_none(data)),
        )

    @staticmethod
    def read_objects(object_type: str) -> list[Object]:
        """Read every object of a type.

        Args:
            object_type: The type to read.

        Returns:
            The objects, ordered by id.
        """
        with contextlib.closing(DiskDao._connect()) as connection, connection:
            rows = connection.execute(
                """
                SELECT id, ctime, mtime, data FROM object
                WHERE type = ? ORDER BY id
                """,
                (object_type,),
            ).fetchall()

        LOG.info(f"Read {len(rows)} {object_type} objects from disk")

        return [DiskDao._row_to_object(row) for row in rows]

    @staticmethod
    def read_object(object_type: str, object_id: int) -> Object | None:
        """Read one object.

        Args:
            object_type: The object's type.
            object_id: The object's id within its type.

        Returns:
            The object, or None if it doesn't exist.
        """
        with contextlib.closing(DiskDao._connect()) as connection, connection:
            row = connection.execute(
                """
                SELECT id, ctime, mtime, data FROM object
                WHERE type = ? AND id = ?
                """,
                (object_type, object_id),
            ).fetchone()

        return DiskDao._row_to_object(row) if row is not None else None

    @staticmethod
    def create_objects(object_type: str, objects: list[Object]) -> list[Object]:
        """Create objects, assigning each an id from its type's sequence.

        Mutates each object in place to set `id`, `ctime` and `mtime`.

        Args:
            object_type: The type to create.
            objects: The objects to create.

        Returns:
            The created objects.
        """
        with contextlib.closing(DiskDao._connect()) as connection, connection:
            next_id = (
                connection.execute(
                    "SELECT COALESCE(MAX(id), 0) FROM object WHERE type = ?",
                    (object_type,),
                ).fetchone()[0]
                + 1
            )

            for obj in objects:
                LOG.info(f"Writing new {object_type} {next_id} to disk")

                obj["id"] = next_id
                obj["ctime"] = time.time()
                obj["mtime"] = obj["ctime"]

                object_id, ctime, mtime, data = DiskDao._object_to_row(obj)
                connection.execute(
                    """
                    INSERT INTO object (type, id, ctime, mtime, data)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (object_type, object_id, ctime, mtime, data),
                )
                next_id += 1

        return objects

    @staticmethod
    def update_objects(object_type: str, objects: list[Object]) -> None:
        """Write objects, inserting any that don't exist yet.

        Args:
            object_type: The objects' type.
            objects: The objects to write. Each must carry an `id`.
        """
        with contextlib.closing(DiskDao._connect()) as connection, connection:
            for obj in objects:
                LOG.info(f"Writing updated {object_type} {obj['id']} to disk")

                object_id, ctime, mtime, data = DiskDao._object_to_row(obj)
                connection.execute(
                    """
                    INSERT INTO object (type, id, ctime, mtime, data)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(type, id) DO UPDATE SET
                        mtime = excluded.mtime, data = excluded.data
                    """,
                    (object_type, object_id, ctime, mtime, data),
                )

    @staticmethod
    def delete_objects(object_type: str, object_ids: list[int]) -> None:
        """Delete objects by id.

        Args:
            object_type: The objects' type.
            object_ids: The ids to delete.
        """
        with contextlib.closing(DiskDao._connect()) as connection, connection:
            for object_id in object_ids:
                LOG.info(f"Deleting {object_type} {object_id} from disk")
                connection.execute(
                    "DELETE FROM object WHERE type = ? AND id = ?",
                    (object_type, object_id),
                )

    @staticmethod
    def read_associations_for(object_type: str, object_id: int) -> list[Object]:
        """Read every association with the given object on either side.

        Args:
            object_type: The object's type.
            object_id: The object's id.

        Returns:
            The matching associations, ordered by id.
        """
        with contextlib.closing(DiskDao._connect()) as connection, connection:
            # A plain OR across the two sides can't use either partial index
            # (SQLite won't pick an index for an OR of two different
            # expressions), so it falls back to a full scan. Splitting into a
            # UNION of two indexable SELECTs -- each pinned via INDEXED BY,
            # since this DB is never ANALYZE'd and the planner otherwise
            # defaults to the (type, id) primary key -- lets each side use
            # its matching idx_association_side_N index. UNION (not UNION
            # ALL) drops the duplicate that a self-association would
            # otherwise produce.
            rows = connection.execute(
                f"""
                SELECT id, ctime, mtime, data FROM object INDEXED BY idx_association_side_1
                WHERE type = '{schema.TYPE_ASSOCIATION}'
                  AND json_extract(data, '$.object_type_1') = ?
                  AND json_extract(data, '$.object_id_1') = ?
                UNION
                SELECT id, ctime, mtime, data FROM object INDEXED BY idx_association_side_2
                WHERE type = '{schema.TYPE_ASSOCIATION}'
                  AND json_extract(data, '$.object_type_2') = ?
                  AND json_extract(data, '$.object_id_2') = ?
                ORDER BY id
                """,
                (
                    object_type,
                    object_id,
                    object_type,
                    object_id,
                ),
            ).fetchall()

        return [DiskDao._row_to_object(row) for row in rows]

    @staticmethod
    def read_association_sides_2(object_type_1: str) -> list[tuple[int, str, int]]:
        """Read side 2 of every association whose side 1 is the given type.

        Projects out just the three scalar fields needed for membership
        grouping (e.g. in `list_service.all_member_ids`) instead of
        materializing full association objects -- the association table is
        the largest in the app (one row per list member), so parsing every
        row's full JSON blob there is the expensive part.

        Args:
            object_type_1: The type expected on side 1 (e.g. "list").

        Returns:
            Tuples of (object_id_1, object_type_2, object_id_2), ordered by id.
        """
        with contextlib.closing(DiskDao._connect()) as connection, connection:
            rows = connection.execute(
                f"""
                SELECT
                    json_extract(data, '$.object_id_1'),
                    json_extract(data, '$.object_type_2'),
                    json_extract(data, '$.object_id_2')
                FROM object INDEXED BY idx_association_side_1
                WHERE type = '{schema.TYPE_ASSOCIATION}'
                  AND json_extract(data, '$.object_type_1') = ?
                ORDER BY id
                """,
                (object_type_1,),
            ).fetchall()

        return [(row[0], row[1], row[2]) for row in rows]

    @staticmethod
    def run_readonly_query(sql: str) -> list[tuple]:
        """Runs a read-only SQL statement against data.db, e.g. to resolve a
        list's `query` into the object ids it currently matches.

        Args:
            sql: The SQL statement to run.

        Returns:
            The fetched rows.
        """
        with contextlib.closing(
            sqlite3.connect(f"file:{DiskDao.PATH}?mode=ro", uri=True)
        ) as connection:
            return connection.execute(sql).fetchall()
