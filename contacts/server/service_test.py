"""Tests for contacts.server.service."""

from __future__ import annotations

import pytest

from contacts import model
from contacts.fixtures import contact_fixtures
from contacts.server import service


@pytest.fixture(autouse=True)
def reset_contacts_cache():
    service.invalidate_contacts_cache()
    yield
    service.invalidate_contacts_cache()


@pytest.fixture
def contacts() -> list[model.Contact]:
    return [
        contact_fixtures.build(
            id=1, name=model.Name(first_name="John", last_name="Smith"), tags=["A"]
        ),
        contact_fixtures.build(
            id=2, name=model.Name(first_name="Jane", last_name="Doe"), tags=["A", "B"]
        ),
        contact_fixtures.build(
            id=3, name=model.Name(first_name="Jack", last_name="Doe")
        ),
    ]


def test_list_contacts(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: contacts)

    assert service.list_contacts() == contacts


def test_list_contacts_caches_after_first_read(monkeypatch, contacts) -> None:
    read_calls = 0

    def read_contacts():
        nonlocal read_calls
        read_calls += 1
        return contacts

    monkeypatch.setattr(service.disk_dao, "read_contacts", read_contacts)

    service.list_contacts()
    service.list_contacts()

    assert read_calls == 1


def test_invalidate_contacts_cache_forces_reread(monkeypatch, contacts) -> None:
    read_calls = 0

    def read_contacts():
        nonlocal read_calls
        read_calls += 1
        return contacts

    monkeypatch.setattr(service.disk_dao, "read_contacts", read_contacts)

    service.list_contacts()
    service.invalidate_contacts_cache()
    service.list_contacts()

    assert read_calls == 2


def test_get_contact_found(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: contacts)

    assert service.get_contact(2) == contacts[1]


def test_get_contact_not_found(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: contacts)

    assert service.get_contact(999) is None


def test_list_tags(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: contacts)

    assert service.list_tags() == [{"tag": "A", "count": 2}, {"tag": "B", "count": 1}]
