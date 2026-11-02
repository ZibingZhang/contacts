"""Tests for contacts.server.admin_console_service."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator

import pytest

from contacts.dao.disk.disk_dao import DiskDao
from contacts.server import (
    admin_console_service,
    errors,
    object_service,
    schema_service,
)

_INSERT_CONTACT = (
    "INSERT INTO object (type, id, ctime, mtime, data) "
    "VALUES ('contact', 1, 0, 0, '{}')"
)


@pytest.fixture(autouse=True)
def _disk_dao(tmp_path, monkeypatch) -> Iterator[None]:
    monkeypatch.setattr(DiskDao, "PATH", str(tmp_path / "data.db"))
    DiskDao.initialize()
    object_service.invalidate_cache()
    schema_service.invalidate_cache()
    yield
    object_service.invalidate_cache()
    schema_service.invalidate_cache()


def test_run_readonly_query_returns_rows_and_columns() -> None:
    result = admin_console_service.run_readonly_query("SELECT 1 AS one, 2 AS two")

    assert result["columns"] == ["one", "two"]
    assert result["rows"] == [[1, 2]]
    assert result["rowcount"] == 1
    assert result["truncated"] is False


def test_run_readonly_query_rejects_writes() -> None:
    with pytest.raises(errors.ValidationError):
        admin_console_service.run_readonly_query(_INSERT_CONTACT)


def test_run_readonly_query_rejects_multiple_statements() -> None:
    with pytest.raises(errors.ValidationError):
        admin_console_service.run_readonly_query("SELECT 1; SELECT 2")


def test_run_query_writes_and_persists() -> None:
    admin_console_service.run_query(_INSERT_CONTACT)

    result = admin_console_service.run_readonly_query("SELECT id FROM contact")

    assert result["rows"] == [[1]]


def test_run_query_rejects_multiple_statements() -> None:
    with pytest.raises(errors.ValidationError):
        admin_console_service.run_query(
            _INSERT_CONTACT + "; "
            "INSERT INTO object (type, id, ctime, mtime, data) "
            "VALUES ('contact', 2, 0, 0, '{}')"
        )

    result = admin_console_service.run_readonly_query("SELECT COUNT(*) FROM contact")
    assert result["rows"] == [[0]]


def test_run_query_invalidates_the_object_cache() -> None:
    object_service.create_object("contact", {"name": {"first_name": "Ada"}})
    assert len(object_service.list_objects("contact")) == 1

    admin_console_service.run_query(
        "DELETE FROM object WHERE type = 'contact' AND id = 1"
    )

    assert object_service.list_objects("contact") == []


def test_run_query_invalidates_the_schema_cache() -> None:
    schema_service.create_schema(
        {"name": "company", "fields": [{"key": "name", "type": "text"}]}
    )
    assert schema_service.find_schema("company") is not None

    admin_console_service.run_query(
        "DELETE FROM object WHERE type = 'schema' "
        "AND json_extract(data, '$.name') = 'company'"
    )

    assert schema_service.find_schema("company") is None


def test_run_readonly_query_truncates_at_500_rows() -> None:
    with sqlite3.connect(DiskDao.PATH) as connection:
        connection.executemany(
            "INSERT INTO object (type, id, ctime, mtime, data) "
            "VALUES ('contact', ?, 0, 0, '{}')",
            [(i,) for i in range(501)],
        )

    result = admin_console_service.run_readonly_query("SELECT id FROM contact")

    rows = result["rows"]
    assert rows is not None and len(rows) == 500
    assert result["truncated"] is True


def test_the_contact_view_is_not_writable() -> None:
    """Writes have to name the object table; the per-type views are read-only."""
    with pytest.raises(errors.ValidationError):
        admin_console_service.run_query(
            "INSERT INTO contact (id, ctime, mtime, data) VALUES (1, 0, 0, '{}')"
        )
