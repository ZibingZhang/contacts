"""Tests for contacts.server.routes."""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from contacts import model
from contacts.dao.disk.disk_dao import DiskDao
from contacts.server import object_service, schema_service, service
from contacts.server.app import create_app

COMPANY_SCHEMA = {
    "name": "company",
    "label": {"singular": "Company", "plural": "Companies"},
    "fields": [
        {"key": "name", "type": "text", "required": True},
        {"key": "domain", "type": "text"},
    ],
}


@pytest.fixture(autouse=True)
def _database(tmp_path, monkeypatch) -> Iterator[None]:
    monkeypatch.setattr(DiskDao, "PATH", str(tmp_path / "data.db"))
    DiskDao.initialize()
    object_service.invalidate_cache()
    schema_service.invalidate_cache()
    service._pending_sync = None
    service._pending_push = None
    yield
    object_service.invalidate_cache()
    schema_service.invalidate_cache()
    service._pending_sync = None
    service._pending_push = None


@pytest.fixture
def contacts() -> list[dict]:
    return [
        object_service.create_object(
            model.TYPE_CONTACT,
            {"name": {"first_name": "John", "last_name": "Smith"}, "tags": ["A"]},
        ),
        object_service.create_object(
            model.TYPE_CONTACT,
            {"name": {"first_name": "Jane", "last_name": "Doe"}, "tags": ["A", "B"]},
        ),
    ]


@pytest.fixture
def client():
    return create_app().test_client()


def test_health(client) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


# -- Objects ---------------------------------------------------------------


def test_list_objects(client, contacts) -> None:
    response = client.get("/api/objects/contact")

    assert response.status_code == 200
    body = response.get_json()
    assert body["total"] == 2
    assert [obj["id"] for obj in body["objects"]] == [1, 2]


def test_list_objects_of_an_unknown_type_is_404(client) -> None:
    response = client.get("/api/objects/widget")

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "not_found"


def test_get_object_found(client, contacts) -> None:
    response = client.get("/api/objects/contact/1")

    assert response.status_code == 200
    assert response.get_json()["name"]["first_name"] == "John"


def test_get_object_not_found(client, contacts) -> None:
    response = client.get("/api/objects/contact/999")

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "not_found"


def test_create_object(client) -> None:
    response = client.post("/api/objects/contact", json={"name": {"first_name": "Ada"}})

    assert response.status_code == 201
    assert response.get_json()["id"] == 1


def test_create_object_rejects_a_non_object_body(client) -> None:
    response = client.post("/api/objects/contact", json=["nope"])

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "invalid_request"


def test_create_object_rejects_an_unknown_field(client) -> None:
    response = client.post("/api/objects/contact", json={"name": {}, "nickname": "Ada"})

    assert response.status_code == 400


def test_update_object(client, contacts) -> None:
    response = client.put(
        "/api/objects/contact/1", json={"name": {"first_name": "Jonathan"}}
    )

    assert response.status_code == 200
    assert response.get_json()["name"]["first_name"] == "Jonathan"


def test_update_object_not_found(client, contacts) -> None:
    response = client.put("/api/objects/contact/999", json={"name": {}})

    assert response.status_code == 404


def test_delete_object(client, contacts) -> None:
    response = client.delete("/api/objects/contact/1")

    assert response.status_code == 200
    assert response.get_json()["status"] == "deleted"
    assert client.get("/api/objects/contact/1").status_code == 404


def test_delete_object_not_found(client, contacts) -> None:
    response = client.delete("/api/objects/contact/999")

    assert response.status_code == 404


def test_delete_object_reports_deleted_associations(client, contacts) -> None:
    a_list = client.post("/api/objects/list", json={"name": "Friends"}).get_json()
    client.post(f"/api/lists/{a_list['id']}/members", json={"ids": [1]})

    response = client.delete("/api/objects/contact/1")

    assert response.get_json()["deleted_associations"] == 1


# -- Contact aggregates ----------------------------------------------------


def test_list_tags(client, contacts) -> None:
    response = client.get("/api/tags")

    assert response.status_code == 200
    assert response.get_json()["tags"] == [
        {"tag": "A", "count": 2},
        {"tag": "B", "count": 1},
    ]


def test_batch_add_tags(client, contacts) -> None:
    response = client.post(
        "/api/objects/contact/batch/tags", json={"contact_ids": [1], "tags": ["C"]}
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["contacts"][0]["tags"] == ["A", "C"]


def test_batch_add_tags_rejects_empty_contact_ids(client, contacts) -> None:
    response = client.post(
        "/api/objects/contact/batch/tags", json={"contact_ids": [], "tags": ["C"]}
    )

    assert response.status_code == 400


def test_batch_add_tags_rejects_empty_tags(client, contacts) -> None:
    response = client.post(
        "/api/objects/contact/batch/tags", json={"contact_ids": [1], "tags": []}
    )

    assert response.status_code == 400


def test_batch_add_tags_missing_contact_is_404(client, contacts) -> None:
    response = client.post(
        "/api/objects/contact/batch/tags", json={"contact_ids": [999], "tags": ["C"]}
    )

    assert response.status_code == 404


# -- Schemas ---------------------------------------------------------------


def test_list_schemas(client) -> None:
    response = client.get("/api/schemas")

    assert response.status_code == 200
    names = {obj["name"] for obj in response.get_json()["schemas"]}
    assert names == {"contact", "list", "association"}


def test_get_schema(client) -> None:
    response = client.get("/api/schemas/contact")

    assert response.status_code == 200
    assert response.get_json()["name"] == "contact"


def test_get_schema_not_found(client) -> None:
    response = client.get("/api/schemas/widget")

    assert response.status_code == 404


def test_create_schema(client) -> None:
    response = client.post("/api/schemas", json=COMPANY_SCHEMA)

    assert response.status_code == 201
    assert response.get_json()["name"] == "company"


def test_create_schema_rejects_a_malformed_schema(client) -> None:
    response = client.post("/api/schemas", json={"name": "company", "fields": []})

    assert response.status_code == 400


def test_update_schema(client) -> None:
    client.post("/api/schemas", json=COMPANY_SCHEMA)

    response = client.put(
        "/api/schemas/company",
        json={"name": "company", "fields": [{"key": "name", "type": "text"}]},
    )

    assert response.status_code == 200
    assert len(response.get_json()["fields"]) == 1


def test_update_schema_rejects_a_built_in(client) -> None:
    response = client.put(
        "/api/schemas/contact",
        json={"name": "contact", "fields": [{"key": "name", "type": "text"}]},
    )

    assert response.status_code == 400


def test_delete_schema(client) -> None:
    client.post("/api/schemas", json=COMPANY_SCHEMA)

    response = client.delete("/api/schemas/company")

    assert response.status_code == 200
    assert client.get("/api/schemas/company").status_code == 404


def test_objects_of_a_created_type_round_trip(client) -> None:
    client.post("/api/schemas", json=COMPANY_SCHEMA)

    created = client.post("/api/objects/company", json={"name": "Acme"})

    assert created.status_code == 201
    assert client.get("/api/objects/company").get_json()["total"] == 1


# -- Lists -----------------------------------------------------------------


def test_list_members_is_empty_for_a_new_list(client, contacts) -> None:
    a_list = client.post("/api/objects/list", json={"name": "Friends"}).get_json()

    response = client.get(f"/api/lists/{a_list['id']}/members")

    assert response.status_code == 200
    assert response.get_json()["total"] == 0


def test_add_and_read_list_members(client, contacts) -> None:
    a_list = client.post("/api/objects/list", json={"name": "Friends"}).get_json()

    client.post(f"/api/lists/{a_list['id']}/members", json={"ids": [1, 2]})

    response = client.get(f"/api/lists/{a_list['id']}/member-ids")
    assert response.get_json()["ids"] == [1, 2]


def test_remove_list_members(client, contacts) -> None:
    a_list = client.post("/api/objects/list", json={"name": "Friends"}).get_json()
    client.post(f"/api/lists/{a_list['id']}/members", json={"ids": [1, 2]})

    response = client.delete(f"/api/lists/{a_list['id']}/members", json={"ids": [1]})

    assert response.get_json()["ids"] == [2]


def test_add_list_members_rejects_a_non_integer_id(client, contacts) -> None:
    a_list = client.post("/api/objects/list", json={"name": "Friends"}).get_json()

    response = client.post(f"/api/lists/{a_list['id']}/members", json={"ids": ["one"]})

    assert response.status_code == 400


def test_refresh_list_populates_membership_from_its_query(client, contacts) -> None:
    a_list = client.post(
        "/api/objects/list",
        json={
            "name": "A",
            "query": (
                "SELECT id FROM contact WHERE EXISTS"
                " (SELECT 1 FROM json_each(data, '$.tags') WHERE value = 'B')"
            ),
        },
    ).get_json()

    response = client.post(f"/api/lists/{a_list['id']}/refresh")

    assert response.status_code == 200
    assert client.get(f"/api/lists/{a_list['id']}/member-ids").get_json()["ids"] == [2]


def test_refresh_list_rejects_an_invalid_query(client, contacts) -> None:
    a_list = client.post(
        "/api/objects/list", json={"name": "A", "query": "SELECT nope FROM nowhere"}
    ).get_json()

    response = client.post(f"/api/lists/{a_list['id']}/refresh")

    assert response.status_code == 400


def test_refresh_lists_refreshes_all(client, contacts) -> None:
    client.post(
        "/api/objects/list", json={"name": "A", "query": "SELECT id FROM contact"}
    )

    response = client.post("/api/lists/refresh")

    assert response.status_code == 200
    assert response.get_json()["total"] == 1


def test_refresh_list_not_found(client) -> None:
    assert client.post("/api/lists/999/refresh").status_code == 404


# -- Associations ----------------------------------------------------------


def test_create_association(client, contacts) -> None:
    response = client.post(
        "/api/associations",
        json={
            "object_type_1": "contact",
            "object_id_1": 1,
            "object_type_2": "contact",
            "object_id_2": 2,
        },
    )

    assert response.status_code == 201
    assert response.get_json()["id"] == 1


def test_creating_the_same_association_twice_is_idempotent(client, contacts) -> None:
    body = {
        "object_type_1": "contact",
        "object_id_1": 1,
        "object_type_2": "contact",
        "object_id_2": 2,
    }
    first = client.post("/api/associations", json=body).get_json()

    second = client.post("/api/associations", json=body)

    assert second.status_code == 200
    assert second.get_json()["id"] == first["id"]


def test_create_association_rejects_a_missing_object(client, contacts) -> None:
    response = client.post(
        "/api/associations",
        json={
            "object_type_1": "contact",
            "object_id_1": 1,
            "object_type_2": "contact",
            "object_id_2": 999,
        },
    )

    assert response.status_code == 400


def test_list_associations_for_an_object(client, contacts) -> None:
    client.post(
        "/api/associations",
        json={
            "object_type_1": "contact",
            "object_id_1": 1,
            "object_type_2": "contact",
            "object_id_2": 2,
        },
    )

    response = client.get("/api/associations/contact/2")

    assert response.get_json()["total"] == 1


def test_delete_association(client, contacts) -> None:
    created = client.post(
        "/api/associations",
        json={
            "object_type_1": "contact",
            "object_id_1": 1,
            "object_type_2": "contact",
            "object_id_2": 2,
        },
    ).get_json()

    response = client.delete(f"/api/associations/{created['id']}")

    assert response.status_code == 200
    assert client.get("/api/associations/contact/1").get_json()["total"] == 0


# -- iCloud sync and push --------------------------------------------------


def test_sync_returns_the_service_result(client, monkeypatch) -> None:
    monkeypatch.setattr(
        service, "start_sync_from_icloud", lambda: {"status": "complete"}
    )

    response = client.post("/api/sync")

    assert response.status_code == 200
    assert response.get_json() == {"status": "complete"}


def test_sync_device_requires_an_integer(client) -> None:
    response = client.post("/api/sync/device", json={"device_index": "one"})

    assert response.status_code == 400


def test_sync_device_rejects_a_boolean(client) -> None:
    response = client.post("/api/sync/device", json={"device_index": True})

    assert response.status_code == 400


def test_sync_code_requires_a_non_empty_string(client) -> None:
    response = client.post("/api/sync/code", json={"code": "   "})

    assert response.status_code == 400


def test_sync_apply_rejects_non_string_ids(client) -> None:
    response = client.post("/api/sync/apply", json={"create_icloud_ids": [1]})

    assert response.status_code == 400


def test_sync_apply_without_pending_review_is_400(client) -> None:
    response = client.post("/api/sync/apply", json={})

    assert response.status_code == 400


def test_push_device_requires_an_integer(client) -> None:
    response = client.post("/api/push/device", json={"device_index": "one"})

    assert response.status_code == 400


def test_push_code_requires_a_non_empty_string(client) -> None:
    response = client.post("/api/push/code", json={})

    assert response.status_code == 400


def test_push_apply_without_pending_review_is_400(client) -> None:
    response = client.post("/api/push/apply", json={})

    assert response.status_code == 400


# -- Admin SQL console -----------------------------------------------------


def test_admin_query_runs_a_select(client, contacts) -> None:
    response = client.post(
        "/api/admin/query", json={"sql": "SELECT COUNT(*) FROM contact"}
    )

    assert response.status_code == 200
    assert response.get_json()["rows"] == [[2]]


def test_admin_query_rejects_a_write(client, contacts) -> None:
    response = client.post(
        "/api/admin/query", json={"sql": "DELETE FROM object WHERE type='contact'"}
    )

    assert response.status_code == 400


def test_admin_query_requires_sql(client) -> None:
    response = client.post("/api/admin/query", json={})

    assert response.status_code == 400


def test_admin_execute_runs_a_write(client, contacts) -> None:
    response = client.post(
        "/api/admin/execute",
        json={"sql": "DELETE FROM object WHERE type='contact' AND id=1"},
    )

    assert response.status_code == 200
    assert client.get("/api/objects/contact").get_json()["total"] == 1


def test_admin_execute_invalidates_the_object_cache(client, contacts) -> None:
    client.get("/api/objects/contact")

    client.post(
        "/api/admin/execute",
        json={"sql": "DELETE FROM object WHERE type='contact' AND id=1"},
    )

    assert client.get("/api/objects/contact").get_json()["total"] == 1


def test_refresh_uses_the_contact_view_after_migration(client, contacts) -> None:
    """The type views are what keep stored list queries working."""
    response = client.post(
        "/api/admin/query", json={"sql": "SELECT id FROM contact ORDER BY id"}
    )

    assert response.get_json()["rows"] == [[1], [2]]


def test_all_list_member_ids(client, contacts) -> None:
    a_list = client.post("/api/objects/list", json={"name": "Friends"}).get_json()
    client.post(f"/api/lists/{a_list['id']}/members", json={"ids": [1, 2]})

    response = client.get("/api/lists/member-ids")

    assert response.status_code == 200
    assert response.get_json()["member_ids"] == {str(a_list["id"]): [1, 2]}
