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
    service._pending_sync = None
    service._pending_push = None
    yield
    service.invalidate_contacts_cache()
    service._pending_sync = None
    service._pending_push = None


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


def test_contact_options(client) -> None:
    response = client.get("/api/contacts/options")

    assert response.status_code == 200
    body = response.get_json()
    assert "Ireland" in body["countries"]
    assert {"code": 1, "label": "United States/Canada"} in body["country_codes"]


def test_create_contact(client, monkeypatch) -> None:
    written = []
    monkeypatch.setattr(service.disk_dao, "create_contacts", written.append)

    response = client.post(
        "/api/contacts",
        json={"name": {"first_name": "New", "last_name": "Person"}},
    )

    assert response.status_code == 201
    body = response.get_json()
    assert body["name"] == {"first_name": "New", "last_name": "Person"}
    assert len(written) == 1


def test_create_contact_ignores_client_supplied_id_and_icloud(client, monkeypatch) -> None:
    written = []
    monkeypatch.setattr(service.disk_dao, "create_contacts", written.append)

    response = client.post(
        "/api/contacts",
        json={"id": 999, "icloud": {"uuid": "fake"}, "name": {"first_name": "New"}},
    )

    assert response.status_code == 201
    assert response.get_json()["icloud"]["uuid"] != "fake"


def test_create_contact_invalid_data(client) -> None:
    response = client.post(
        "/api/contacts",
        json={"name": {}, "unexpected_field": "value"},
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "invalid_request"


def test_update_contact(client, monkeypatch) -> None:
    written = []
    monkeypatch.setattr(service.disk_dao, "update_contacts", written.append)

    response = client.put(
        "/api/contacts/1",
        json={"name": {"first_name": "Johnny", "last_name": "Smith"}},
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["id"] == 1
    assert body["name"] == {"first_name": "Johnny", "last_name": "Smith"}
    assert len(written) == 1


def test_update_contact_ignores_client_supplied_id_and_icloud(client, monkeypatch) -> None:
    monkeypatch.setattr(service.disk_dao, "update_contacts", lambda _: None)

    response = client.put(
        "/api/contacts/1",
        json={"id": 999, "icloud": {"uuid": "fake"}, "name": {"first_name": "Johnny"}},
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["id"] == 1
    assert body["icloud"]["uuid"] != "fake"


def test_update_contact_not_found(client) -> None:
    response = client.put("/api/contacts/999", json={"name": {}})

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "not_found"


def test_update_contact_invalid_data(client) -> None:
    response = client.put(
        "/api/contacts/1",
        json={"name": {}, "unexpected_field": "value"},
    )

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "invalid_request"


def test_list_tags(client) -> None:
    response = client.get("/api/tags")

    assert response.status_code == 200
    assert response.get_json() == {
        "tags": [{"tag": "A", "count": 2}, {"tag": "B", "count": 1}]
    }


def test_batch_add_tags(client, monkeypatch) -> None:
    written = []
    monkeypatch.setattr(service.disk_dao, "update_contacts", written.append)

    response = client.post("/api/contacts/batch/tags", json={"contact_ids": [1, 2], "tags": ["C"]})

    assert response.status_code == 200
    body = response.get_json()
    assert [contact["tags"] for contact in body["contacts"]] == [["A", "C"], ["A", "B", "C"]]
    assert body["tags"] == [
        {"tag": "A", "count": 2},
        {"tag": "B", "count": 1},
        {"tag": "C", "count": 2},
    ]
    assert len(written) == 1


def test_batch_add_tags_missing_contact(client) -> None:
    response = client.post("/api/contacts/batch/tags", json={"contact_ids": [999], "tags": ["C"]})

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "not_found"


@pytest.mark.parametrize(
    "body",
    [
        {"contact_ids": [], "tags": ["C"]},
        {"contact_ids": ["1"], "tags": ["C"]},
        {"tags": ["C"]},
        {"contact_ids": [1], "tags": []},
        {"contact_ids": [1], "tags": [""]},
        {"contact_ids": [1], "tags": [123]},
        {"contact_ids": [1]},
    ],
)
def test_batch_add_tags_invalid_request(client, body) -> None:
    response = client.post("/api/contacts/batch/tags", json=body)

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "invalid_request"


def test_sync(client, monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "start_sync_from_icloud",
        lambda: {"status": "complete", "created": 1, "updated": 2},
    )

    response = client.post("/api/sync")

    assert response.status_code == 200
    assert response.get_json() == {"status": "complete", "created": 1, "updated": 2}


def test_sync_requires_verification(client, monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "start_sync_from_icloud",
        lambda: {
            "status": "requires_verification",
            "verification_kind": "device_and_code",
            "devices": ["iPhone"],
        },
    )

    response = client.post("/api/sync")

    assert response.status_code == 200
    assert response.get_json() == {
        "status": "requires_verification",
        "verification_kind": "device_and_code",
        "devices": ["iPhone"],
    }


def test_sync_failure(client, monkeypatch) -> None:
    def fail():
        raise service.errors.SyncError("Failed to authenticate with iCloud: boom")

    monkeypatch.setattr(service, "start_sync_from_icloud", fail)

    response = client.post("/api/sync")

    assert response.status_code == 502
    assert response.get_json()["error"]["code"] == "sync_failed"


def test_sync_device(client, monkeypatch) -> None:
    received = []
    monkeypatch.setattr(
        service,
        "submit_sync_device",
        lambda device_index: received.append(device_index)
        or {"status": "requires_verification", "verification_kind": "code", "devices": []},
    )

    response = client.post("/api/sync/device", json={"device_index": 1})

    assert response.status_code == 200
    assert received == [1]
    assert response.get_json() == {
        "status": "requires_verification",
        "verification_kind": "code",
        "devices": [],
    }


@pytest.mark.parametrize("body", [{}, {"device_index": "1"}, {"device_index": True}])
def test_sync_device_invalid_request(client, body) -> None:
    response = client.post("/api/sync/device", json=body)

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "invalid_request"


def test_sync_code(client, monkeypatch) -> None:
    received = []
    monkeypatch.setattr(
        service,
        "submit_sync_code",
        lambda code: received.append(code)
        or {"status": "complete", "created": 0, "updated": 0},
    )

    response = client.post("/api/sync/code", json={"code": "123456"})

    assert response.status_code == 200
    assert received == ["123456"]
    assert response.get_json() == {"status": "complete", "created": 0, "updated": 0}


@pytest.mark.parametrize("body", [{}, {"code": ""}, {"code": "  "}, {"code": 123456}])
def test_sync_code_invalid_request(client, body) -> None:
    response = client.post("/api/sync/code", json=body)

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "invalid_request"


def test_sync_apply(client, monkeypatch) -> None:
    received = []
    monkeypatch.setattr(
        service,
        "apply_icloud_sync",
        lambda create_ids, update_ids: received.append((create_ids, update_ids))
        or {"status": "complete", "created": 1, "updated": 1},
    )

    response = client.post(
        "/api/sync/apply",
        json={"create_icloud_ids": ["a"], "update_icloud_ids": ["b"]},
    )

    assert response.status_code == 200
    assert received == [(["a"], ["b"])]
    assert response.get_json() == {"status": "complete", "created": 1, "updated": 1}


def test_sync_apply_defaults_to_empty_lists(client, monkeypatch) -> None:
    received = []
    monkeypatch.setattr(
        service,
        "apply_icloud_sync",
        lambda create_ids, update_ids: received.append((create_ids, update_ids))
        or {"status": "complete", "created": 0, "updated": 0},
    )

    response = client.post("/api/sync/apply", json={})

    assert response.status_code == 200
    assert received == [([], [])]


@pytest.mark.parametrize(
    "body",
    [
        {"create_icloud_ids": "a"},
        {"create_icloud_ids": [1]},
        {"update_icloud_ids": "b"},
        {"update_icloud_ids": [1]},
    ],
)
def test_sync_apply_invalid_request(client, body) -> None:
    response = client.post("/api/sync/apply", json=body)

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "invalid_request"


def test_sync_apply_without_pending_review(client) -> None:
    response = client.post("/api/sync/apply", json={})

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "invalid_request"


def test_push(client, monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "start_push_to_icloud",
        lambda: {"status": "complete", "created": 1, "updated": 2},
    )

    response = client.post("/api/push")

    assert response.status_code == 200
    assert response.get_json() == {"status": "complete", "created": 1, "updated": 2}


def test_push_requires_verification(client, monkeypatch) -> None:
    monkeypatch.setattr(
        service,
        "start_push_to_icloud",
        lambda: {
            "status": "requires_verification",
            "verification_kind": "device_and_code",
            "devices": ["iPhone"],
        },
    )

    response = client.post("/api/push")

    assert response.status_code == 200
    assert response.get_json() == {
        "status": "requires_verification",
        "verification_kind": "device_and_code",
        "devices": ["iPhone"],
    }


def test_push_failure(client, monkeypatch) -> None:
    def fail():
        raise service.errors.SyncError("Failed to authenticate with iCloud: boom")

    monkeypatch.setattr(service, "start_push_to_icloud", fail)

    response = client.post("/api/push")

    assert response.status_code == 502
    assert response.get_json()["error"]["code"] == "sync_failed"


def test_push_device(client, monkeypatch) -> None:
    received = []
    monkeypatch.setattr(
        service,
        "submit_push_device",
        lambda device_index: received.append(device_index)
        or {"status": "requires_verification", "verification_kind": "code", "devices": []},
    )

    response = client.post("/api/push/device", json={"device_index": 1})

    assert response.status_code == 200
    assert received == [1]
    assert response.get_json() == {
        "status": "requires_verification",
        "verification_kind": "code",
        "devices": [],
    }


@pytest.mark.parametrize("body", [{}, {"device_index": "1"}, {"device_index": True}])
def test_push_device_invalid_request(client, body) -> None:
    response = client.post("/api/push/device", json=body)

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "invalid_request"


def test_push_code(client, monkeypatch) -> None:
    received = []
    monkeypatch.setattr(
        service,
        "submit_push_code",
        lambda code: received.append(code)
        or {"status": "complete", "created": 0, "updated": 0},
    )

    response = client.post("/api/push/code", json={"code": "123456"})

    assert response.status_code == 200
    assert received == ["123456"]
    assert response.get_json() == {"status": "complete", "created": 0, "updated": 0}


@pytest.mark.parametrize("body", [{}, {"code": ""}, {"code": "  "}, {"code": 123456}])
def test_push_code_invalid_request(client, body) -> None:
    response = client.post("/api/push/code", json=body)

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "invalid_request"


def test_push_apply(client, monkeypatch) -> None:
    received = []
    monkeypatch.setattr(
        service,
        "apply_icloud_push",
        lambda create_ids, update_ids: received.append((create_ids, update_ids))
        or {"status": "complete", "created": 1, "updated": 1},
    )

    response = client.post(
        "/api/push/apply",
        json={"create_icloud_ids": ["a"], "update_icloud_ids": ["b"]},
    )

    assert response.status_code == 200
    assert received == [(["a"], ["b"])]
    assert response.get_json() == {"status": "complete", "created": 1, "updated": 1}


def test_push_apply_defaults_to_empty_lists(client, monkeypatch) -> None:
    received = []
    monkeypatch.setattr(
        service,
        "apply_icloud_push",
        lambda create_ids, update_ids: received.append((create_ids, update_ids))
        or {"status": "complete", "created": 0, "updated": 0},
    )

    response = client.post("/api/push/apply", json={})

    assert response.status_code == 200
    assert received == [([], [])]


@pytest.mark.parametrize(
    "body",
    [
        {"create_icloud_ids": "a"},
        {"create_icloud_ids": [1]},
        {"update_icloud_ids": "b"},
        {"update_icloud_ids": [1]},
    ],
)
def test_push_apply_invalid_request(client, body) -> None:
    response = client.post("/api/push/apply", json=body)

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "invalid_request"


def test_push_apply_without_pending_review(client) -> None:
    response = client.post("/api/push/apply", json={})

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "invalid_request"


def test_cors_header_present(client) -> None:
    response = client.get("/api/health", headers={"Origin": "http://localhost:5173"})

    assert response.headers.get("Access-Control-Allow-Origin") is not None
