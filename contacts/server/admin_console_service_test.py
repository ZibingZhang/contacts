"""Tests for contacts.server.admin_console_service."""

from __future__ import annotations

import sqlite3

import pytest

from contacts.dao.disk.disk_dao import DiskDao
from contacts.server import admin_console_service, errors, service


@pytest.fixture(autouse=True)
def _disk_dao(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(DiskDao, "PATH", str(tmp_path / "contacts.db"))
    DiskDao()
    service.invalidate_contacts_cache()


def test_run_readonly_query_returns_rows_and_columns() -> None:
    result = admin_console_service.run_readonly_query("SELECT 1 AS one, 2 AS two")

    assert result["columns"] == ["one", "two"]
    assert result["rows"] == [[1, 2]]
    assert result["rowcount"] == 1
    assert result["truncated"] is False


def test_run_readonly_query_rejects_writes() -> None:
    with pytest.raises(errors.ValidationError):
        admin_console_service.run_readonly_query(
            "INSERT INTO contacts (id, ctime, mtime, data) VALUES (1, 0, 0, '{}')"
        )


def test_run_readonly_query_rejects_multiple_statements() -> None:
    with pytest.raises(errors.ValidationError):
        admin_console_service.run_readonly_query("SELECT 1; SELECT 2")


def test_run_query_writes_and_persists() -> None:
    admin_console_service.run_query(
        "INSERT INTO contacts (id, ctime, mtime, data) VALUES (1, 0, 0, '{}')"
    )

    result = admin_console_service.run_readonly_query("SELECT id FROM contacts")

    assert result["rows"] == [[1]]


def test_run_query_rejects_multiple_statements() -> None:
    with pytest.raises(errors.ValidationError):
        admin_console_service.run_query(
            "INSERT INTO contacts (id, ctime, mtime, data) VALUES (1, 0, 0, '{}'); "
            "INSERT INTO contacts (id, ctime, mtime, data) VALUES (2, 0, 0, '{}')"
        )

    result = admin_console_service.run_readonly_query("SELECT COUNT(*) FROM contacts")
    assert result["rows"] == [[0]]


def test_run_query_invalidates_contacts_cache(monkeypatch) -> None:
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: [])
    service.list_contacts()

    invalidated = []
    monkeypatch.setattr(service, "invalidate_contacts_cache", lambda: invalidated.append(True))

    admin_console_service.run_query(
        "INSERT INTO contacts (id, ctime, mtime, data) VALUES (1, 0, 0, '{}')"
    )

    assert invalidated == [True]


def test_run_readonly_query_truncates_at_500_rows() -> None:
    with sqlite3.connect(DiskDao.PATH) as connection:
        connection.executemany(
            "INSERT INTO contacts (id, ctime, mtime, data) VALUES (?, 0, 0, '{}')",
            [(i,) for i in range(501)],
        )

    result = admin_console_service.run_readonly_query("SELECT id FROM contacts")

    assert len(result["rows"]) == 500
    assert result["truncated"] is True
