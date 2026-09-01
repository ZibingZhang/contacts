"""Tests for contacts.server.routes."""

from __future__ import annotations

import pytest

from contacts import model
from contacts.fixtures import contact_fixtures
from contacts.server import service
from contacts.server.app import create_app


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
    ]


@pytest.fixture
def client(monkeypatch, contacts):
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: contacts)
    return create_app().test_client()


def test_health(client) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_list_contacts(client) -> None:
    response = client.get("/api/contacts")

    assert response.status_code == 200
    body = response.get_json()
    assert body["total"] == 2
    assert [contact["id"] for contact in body["contacts"]] == [1, 2]


def test_get_contact_found(client) -> None:
    response = client.get("/api/contacts/1")

    assert response.status_code == 200
    assert response.get_json()["id"] == 1


def test_get_contact_not_found(client) -> None:
    response = client.get("/api/contacts/999")

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "not_found"


def test_list_tags(client) -> None:
    response = client.get("/api/tags")

    assert response.status_code == 200
    assert response.get_json() == {
        "tags": [{"tag": "A", "count": 2}, {"tag": "B", "count": 1}]
    }


def test_cors_header_present(client) -> None:
    response = client.get("/api/health", headers={"Origin": "http://localhost:5173"})

    assert response.headers.get("Access-Control-Allow-Origin") is not None
