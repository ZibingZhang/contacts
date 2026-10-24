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


def test_add_tags_to_contacts_unions_with_existing_tags(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: contacts)
    written = []
    monkeypatch.setattr(service.disk_dao, "update_contacts", written.append)

    updated = service.add_tags_to_contacts([1, 3], ["B", "C"])

    assert [contact.tags for contact in updated] == [["A", "B", "C"], ["B", "C"]]
    assert len(written) == 1


def test_add_tags_to_contacts_invalidates_cache(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: contacts)
    monkeypatch.setattr(service.disk_dao, "update_contacts", lambda _: None)

    service.list_contacts()
    service.add_tags_to_contacts([1], ["C"])

    read_calls = 0

    def read_contacts():
        nonlocal read_calls
        read_calls += 1
        return contacts

    monkeypatch.setattr(service.disk_dao, "read_contacts", read_contacts)
    service.list_contacts()

    assert read_calls == 1


def test_add_tags_to_contacts_missing_id_raises(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: contacts)

    with pytest.raises(service.errors.NotFoundError):
        service.add_tags_to_contacts([1, 999], ["C"])
