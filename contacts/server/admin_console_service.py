"""Backing logic for the admin SQL console.

A deliberate escape hatch for running arbitrary SQL against data/data.db,
separate from the structured Contact CRUD API in service.py. Read-only mode is
enforced by SQLite itself (opening the connection in `mode=ro`), not by
inspecting the SQL text, so it can't be bypassed by unusual statement wording.
"""

from __future__ import annotations

import sqlite3
from typing import TypedDict

from contacts.dao import disk_dao
from contacts.server import errors, service

_MAX_ROWS = 500


class QueryResult(TypedDict):
    columns: list[str] | None
    rows: list[list] | None
    rowcount: int
    truncated: bool


def run_readonly_query(sql: str) -> QueryResult:
    """Runs a SQL statement against a read-only connection.

    Args:
        sql: The SQL statement to run.

    Returns:
        The query result.

    Raises:
        errors.ValidationError: If the statement is invalid, or attempts a
            write (SQLite itself rejects writes against a read-only
            connection).
    """
    try:
        connection = sqlite3.connect(f"file:{disk_dao.PATH}?mode=ro", uri=True)
    except sqlite3.Error as e:
        raise errors.ValidationError(str(e)) from e

    try:
        return _execute(connection, sql)
    finally:
        connection.close()


def run_query(sql: str) -> QueryResult:
    """Runs a SQL statement against a normal read-write connection.

    Args:
        sql: The SQL statement to run.

    Returns:
        The query result.

    Raises:
        errors.ValidationError: If the statement is invalid.
    """
    connection = sqlite3.connect(disk_dao.PATH)
    try:
        result = _execute(connection, sql)
        connection.commit()
    finally:
        connection.close()

    # We don't know which table a write touched, so always invalidate rather
    # than letting service._contacts_cache silently go stale.
    service.invalidate_contacts_cache()

    return result


def _execute(connection: sqlite3.Connection, sql: str) -> QueryResult:
    try:
        cursor = connection.execute(sql)
    except sqlite3.Error as e:
        raise errors.ValidationError(str(e)) from e

    if cursor.description is None:
        return QueryResult(columns=None, rows=None, rowcount=cursor.rowcount, truncated=False)

    columns = [column[0] for column in cursor.description]
    rows = [list(row) for row in cursor.fetchmany(_MAX_ROWS + 1)]
    truncated = len(rows) > _MAX_ROWS
    if truncated:
        rows = rows[:_MAX_ROWS]

    return QueryResult(columns=columns, rows=rows, rowcount=len(rows), truncated=truncated)
