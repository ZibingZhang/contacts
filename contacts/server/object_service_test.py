"""Tests for contacts.server.object_service."""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from contacts import model
from contacts.dao.disk.disk_dao import DiskDao
from contacts.server import errors, object_service, schema_service

COMPANY_SCHEMA = {
    "name": "company",
    "label": {"singular": "Company", "plural": "Companies"},
    "fields": [
        {"key": "name", "type": "text", "required": True},
        {"key": "domain", "type": "text"},
        {"key": "owner", "type": "reference", "ref_type": "contact"},
    ],
}


@pytest.fixture(autouse=True)
def _database(tmp_path, monkeypatch) -> Iterator[None]:
    monkeypatch.setattr(DiskDao, "PATH", str(tmp_path / "data.db"))
    DiskDao.initialize()
    object_service.invalidate_cache()
    schema_service.invalidate_cache()
    yield
    object_service.invalidate_cache()
    schema_service.invalidate_cache()


def test_create_object_assigns_an_id_and_timestamps() -> None:
    created = object_service.create_object(
        model.TYPE_CONTACT, {"name": {"first_name": "Ada"}}
    )

    assert created["id"] == 1
    assert created["ctime"] == created["mtime"]


def test_create_object_rejects_an_unknown_type() -> None:
    with pytest.raises(errors.NotFoundError, match="Unknown object type"):
        object_service.create_object("widget", {})


def test_create_object_rejects_data_that_does_not_match_the_schema() -> None:
    with pytest.raises(errors.ValidationError, match="Unknown field"):
        object_service.create_object(
            model.TYPE_CONTACT, {"name": {}, "nickname": "Ada"}
        )


def test_create_object_rejects_a_missing_required_field() -> None:
    with pytest.raises(errors.ValidationError, match="name is required"):
        object_service.create_object(model.TYPE_CONTACT, {"tags": ["friend"]})


def test_create_object_ignores_a_client_supplied_id() -> None:
    created = object_service.create_object(
        model.TYPE_CONTACT, {"id": 99, "name": {"first_name": "Ada"}}
    )

    assert created["id"] == 1


def test_create_object_strips_managed_fields() -> None:
    created = object_service.create_object(
        model.TYPE_CONTACT,
        {"name": {"first_name": "Ada"}, "icloud": {"uuid": "spoofed"}},
    )

    assert "icloud" not in created


def test_create_object_applies_schema_defaults() -> None:
    created = object_service.create_object(
        model.TYPE_CONTACT,
        {"name": {}, "phone_numbers": [{"number": "5551234"}]},
    )

    assert created["phone_numbers"][0]["country_code"] == 1


def test_create_object_dedupes_and_sorts_a_unique_field() -> None:
    created = object_service.create_object(
        model.TYPE_CONTACT, {"name": {}, "tags": ["b", "a", "b"]}
    )

    assert created["tags"] == ["a", "b"]


def test_create_object_orders_an_order_by_field() -> None:
    created = object_service.create_object(
        model.TYPE_CONTACT,
        {
            "name": {},
            "email_addresses": [
                {"address": "b@x.com", "label": "HOME"},
                {"address": "a@x.com", "label": "WORK"},
            ],
        },
    )

    assert [e["address"] for e in created["email_addresses"]] == [
        "a@x.com",
        "b@x.com",
    ]


def test_create_object_drops_null_valued_fields() -> None:
    created = object_service.create_object(
        model.TYPE_CONTACT, {"name": {"first_name": "Ada"}, "notes": None}
    )

    assert "notes" not in created


def test_list_objects_returns_created_objects() -> None:
    object_service.create_object(model.TYPE_CONTACT, {"name": {"first_name": "Ada"}})

    assert len(object_service.list_objects(model.TYPE_CONTACT)) == 1


def test_list_objects_rejects_an_unknown_type() -> None:
    with pytest.raises(errors.NotFoundError):
        object_service.list_objects("widget")


def test_get_object_returns_none_when_absent() -> None:
    assert object_service.get_object(model.TYPE_CONTACT, 1) is None


def test_require_object_raises_when_absent() -> None:
    with pytest.raises(errors.NotFoundError, match="contact 1 not found"):
        object_service.require_object(model.TYPE_CONTACT, 1)


def test_update_object_replaces_fields() -> None:
    created = object_service.create_object(
        model.TYPE_CONTACT, {"name": {"first_name": "Ada"}, "notes": "old"}
    )

    updated = object_service.update_object(
        model.TYPE_CONTACT, created["id"], {"name": {"first_name": "Ada"}}
    )

    assert "notes" not in updated


def test_update_object_preserves_ctime() -> None:
    created = object_service.create_object(model.TYPE_CONTACT, {"name": {}})

    updated = object_service.update_object(
        model.TYPE_CONTACT, created["id"], {"name": {"first_name": "Ada"}}
    )

    assert updated["ctime"] == created["ctime"]


def test_update_object_ignores_a_client_supplied_ctime() -> None:
    created = object_service.create_object(model.TYPE_CONTACT, {"name": {}})

    updated = object_service.update_object(
        model.TYPE_CONTACT, created["id"], {"name": {}, "ctime": 0.0}
    )

    assert updated["ctime"] == created["ctime"]


def test_update_object_preserves_managed_fields() -> None:
    created = object_service.create_object(model.TYPE_CONTACT, {"name": {}})
    created["icloud"] = {"uuid": "real-uuid"}
    object_service.write_objects(model.TYPE_CONTACT, [created])

    updated = object_service.update_object(
        model.TYPE_CONTACT, created["id"], {"name": {"first_name": "Ada"}}
    )

    assert updated["icloud"] == {"uuid": "real-uuid"}


def test_update_object_raises_for_a_missing_object() -> None:
    with pytest.raises(errors.NotFoundError):
        object_service.update_object(model.TYPE_CONTACT, 999, {"name": {}})


def test_update_object_rejects_invalid_data() -> None:
    created = object_service.create_object(model.TYPE_CONTACT, {"name": {}})

    with pytest.raises(errors.ValidationError):
        object_service.update_object(model.TYPE_CONTACT, created["id"], {"name": "Ada"})


def test_update_objects_replaces_fields_for_each() -> None:
    ada = object_service.create_object(model.TYPE_CONTACT, {"name": {"first_name": "Ada"}})
    bo = object_service.create_object(model.TYPE_CONTACT, {"name": {"first_name": "Bo"}})

    updated = object_service.update_objects(
        model.TYPE_CONTACT,
        [
            {"id": ada["id"], "name": {"first_name": "Ada"}, "tags": ["x"]},
            {"id": bo["id"], "name": {"first_name": "Bo"}, "tags": ["y"]},
        ],
    )

    assert [obj["tags"] for obj in updated] == [["x"], ["y"]]


def test_update_objects_preserves_ctime_and_managed_fields() -> None:
    created = object_service.create_object(model.TYPE_CONTACT, {"name": {}})
    created["icloud"] = {"uuid": "real-uuid"}
    object_service.write_objects(model.TYPE_CONTACT, [created])

    [updated] = object_service.update_objects(
        model.TYPE_CONTACT, [{"id": created["id"], "name": {"first_name": "Ada"}}]
    )

    assert updated["ctime"] == created["ctime"]
    assert updated["icloud"] == {"uuid": "real-uuid"}


def test_update_objects_is_all_or_nothing_for_a_missing_id() -> None:
    created = object_service.create_object(model.TYPE_CONTACT, {"name": {}})

    with pytest.raises(errors.NotFoundError):
        object_service.update_objects(
            model.TYPE_CONTACT,
            [{"id": created["id"], "name": {}}, {"id": 999, "name": {}}],
        )

    # Nothing was written, including the valid update.
    assert object_service.require_object(model.TYPE_CONTACT, created["id"])["name"] == {}


def test_update_objects_rejects_invalid_data() -> None:
    created = object_service.create_object(model.TYPE_CONTACT, {"name": {}})

    with pytest.raises(errors.ValidationError):
        object_service.update_objects(
            model.TYPE_CONTACT, [{"id": created["id"], "name": "Ada"}]
        )


def test_delete_object_removes_it() -> None:
    created = object_service.create_object(model.TYPE_CONTACT, {"name": {}})

    object_service.delete_object(model.TYPE_CONTACT, created["id"])

    assert object_service.list_objects(model.TYPE_CONTACT) == []


def test_delete_object_raises_for_a_missing_object() -> None:
    with pytest.raises(errors.NotFoundError):
        object_service.delete_object(model.TYPE_CONTACT, 999)


def test_delete_object_also_deletes_its_associations() -> None:
    contact = object_service.create_object(model.TYPE_CONTACT, {"name": {}})
    a_list = object_service.create_object(model.TYPE_LIST, {"name": "Friends"})
    object_service.create_object(
        model.TYPE_ASSOCIATION,
        {
            "object_type_1": model.TYPE_LIST,
            "object_id_1": a_list["id"],
            "object_type_2": model.TYPE_CONTACT,
            "object_id_2": contact["id"],
        },
    )

    deleted = object_service.delete_object(model.TYPE_CONTACT, contact["id"])

    assert deleted == 1
    assert object_service.list_objects(model.TYPE_ASSOCIATION) == []


def test_creating_an_association_to_a_missing_object_is_rejected() -> None:
    a_list = object_service.create_object(model.TYPE_LIST, {"name": "Friends"})

    with pytest.raises(errors.ValidationError, match="does not exist"):
        object_service.create_object(
            model.TYPE_ASSOCIATION,
            {
                "object_type_1": model.TYPE_LIST,
                "object_id_1": a_list["id"],
                "object_type_2": model.TYPE_CONTACT,
                "object_id_2": 999,
            },
        )


def test_schemas_cannot_be_created_through_the_object_api() -> None:
    with pytest.raises(errors.ValidationError, match="/api/schemas"):
        object_service.create_object(
            model.TYPE_SCHEMA, {"name": "widget", "fields": []}
        )


def test_schemas_cannot_be_updated_through_the_object_api() -> None:
    with pytest.raises(errors.ValidationError, match="/api/schemas"):
        object_service.update_object(
            model.TYPE_SCHEMA, 1, {"name": "widget", "fields": []}
        )


def test_a_list_with_an_unknown_member_type_is_rejected() -> None:
    with pytest.raises(errors.ValidationError, match="unknown object type"):
        object_service.create_object(
            model.TYPE_LIST, {"name": "Friends", "member_type": "widget"}
        )


def test_a_list_defaults_its_member_type_to_contact() -> None:
    created = object_service.create_object(model.TYPE_LIST, {"name": "Friends"})

    assert created["member_type"] == model.TYPE_CONTACT


def test_a_list_of_schemas_is_accepted_even_though_schema_is_reserved() -> None:
    created = object_service.create_object(
        model.TYPE_LIST, {"name": "Built-in schemas", "member_type": "schema"}
    )

    assert created["member_type"] == "schema"


def test_a_reference_to_an_existing_object_is_accepted() -> None:
    contact = object_service.create_object(model.TYPE_CONTACT, {"name": {}})
    schema_service.create_schema(COMPANY_SCHEMA)

    created = object_service.create_object(
        "company", {"name": "Acme", "owner": contact["id"]}
    )

    assert created["owner"] == contact["id"]


def test_a_reference_to_a_missing_object_is_rejected() -> None:
    schema_service.create_schema(COMPANY_SCHEMA)

    with pytest.raises(errors.ValidationError, match="does not exist"):
        object_service.create_object("company", {"name": "Acme", "owner": 999})


def test_objects_of_a_user_defined_type_round_trip() -> None:
    schema_service.create_schema(COMPANY_SCHEMA)

    object_service.create_object("company", {"name": "Acme", "domain": "acme.com"})

    [company] = object_service.list_objects("company")
    assert (company["name"], company["domain"]) == ("Acme", "acme.com")


def test_each_type_has_its_own_id_sequence() -> None:
    contact = object_service.create_object(model.TYPE_CONTACT, {"name": {}})
    a_list = object_service.create_object(model.TYPE_LIST, {"name": "Friends"})

    assert (contact["id"], a_list["id"]) == (1, 1)
