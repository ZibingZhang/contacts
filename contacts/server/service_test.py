"""Tests for contacts.server.service."""

from __future__ import annotations

import pytest

from contacts import model
from contacts.fixtures import contact_fixtures
from contacts.server import service


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


def test_get_contact_found(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: contacts)

    assert service.get_contact(2) == contacts[1]


def test_get_contact_not_found(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: contacts)

    assert service.get_contact(999) is None


def test_list_tags(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: contacts)

    assert service.list_tags() == [{"tag": "A", "count": 2}, {"tag": "B", "count": 1}]
