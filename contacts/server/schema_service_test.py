"""Tests for contacts.server.schema_service."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator

import pytest

from contacts import model
from contacts.dao.disk.disk_dao import DiskDao
from contacts.model import builtin_schemas
from contacts.server import errors, object_service, schema_service

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
    yield
    object_service.invalidate_cache()
    schema_service.invalidate_cache()


def view_names() -> set[str]:
    connection = sqlite3.connect(DiskDao.PATH)
    try:
        return {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'view'"
            )
        }
    finally:
        connection.close()


def test_list_schemas_returns_the_built_ins() -> None:
    names = {obj["name"] for obj in schema_service.list_schemas()}

    assert names == {"contact", "list", "association"}


def test_get_schema_parses_the_contact_schema() -> None:
    contact_schema = schema_service.get_schema(model.TYPE_CONTACT)

    assert contact_schema.field("name") is not None


def test_get_schema_raises_for_an_unknown_type() -> None:
    with pytest.raises(errors.NotFoundError, match="Unknown object type"):
        schema_service.get_schema("widget")


def test_get_schema_object_includes_the_builtin_title_field() -> None:
    assert schema_service.get_schema_object(model.TYPE_CONTACT)["title_field"] == "name"


def test_get_schema_object_resolves_a_nested_select_fields_options() -> None:
    contact_schema = schema_service.get_schema_object(model.TYPE_CONTACT)
    phone_numbers = next(
        field for field in contact_schema["fields"] if field["key"] == "phone_numbers"
    )
    country_code = next(
        field for field in phone_numbers["fields"] if field["key"] == "country_code"
    )

    assert {"value": 1, "label": "United States/Canada"} in country_code[
        "resolved_options"
    ]


def test_create_schema_resolves_a_select_fields_options() -> None:
    created = schema_service.create_schema(
        {
            **COMPANY_SCHEMA,
            "fields": [
                *COMPANY_SCHEMA["fields"],
                {"key": "size", "type": "select", "options": ["small", "large"]},
            ],
        }
    )

    size = next(field for field in created["fields"] if field["key"] == "size")
    assert size["resolved_options"] == [
        {"value": "small", "label": "small"},
        {"value": "large", "label": "large"},
    ]


def test_find_schema_returns_none_for_an_unknown_type() -> None:
    assert schema_service.find_schema("widget") is None


def test_create_schema_stores_a_new_type() -> None:
    created = schema_service.create_schema(COMPANY_SCHEMA)

    assert created["name"] == "company"
    assert schema_service.find_schema("company") is not None


def test_create_schema_creates_the_types_view() -> None:
    schema_service.create_schema(COMPANY_SCHEMA)

    assert "company" in view_names()


def test_the_new_types_view_reads_its_objects() -> None:
    schema_service.create_schema(COMPANY_SCHEMA)
    object_service.create_object("company", {"name": "Acme"})

    assert DiskDao.run_readonly_query("SELECT id FROM company") == [(1,)]


def test_create_schema_forces_builtin_off() -> None:
    created = schema_service.create_schema({**COMPANY_SCHEMA, "builtin": True})

    assert not created.get("builtin")


def test_create_schema_rejects_a_duplicate_name() -> None:
    schema_service.create_schema(COMPANY_SCHEMA)

    with pytest.raises(errors.ValidationError, match="already exists"):
        schema_service.create_schema(COMPANY_SCHEMA)


def test_create_schema_rejects_a_name_that_collides_with_a_built_in() -> None:
    with pytest.raises(errors.ValidationError, match="already exists"):
        schema_service.create_schema(
            {"name": "contact", "fields": [{"key": "n", "type": "text"}]}
        )


def test_create_schema_rejects_the_reserved_name_schema() -> None:
    with pytest.raises(errors.ValidationError, match="is reserved"):
        schema_service.create_schema(
            {"name": "schema", "fields": [{"key": "n", "type": "text"}]}
        )


def test_create_schema_rejects_a_malformed_schema() -> None:
    with pytest.raises(errors.ValidationError, match="Invalid schema"):
        schema_service.create_schema({"name": "company", "fields": []})


def test_update_schema_replaces_the_fields() -> None:
    schema_service.create_schema(COMPANY_SCHEMA)

    updated = schema_service.update_schema(
        "company",
        {"name": "company", "fields": [{"key": "name", "type": "text"}]},
    )

    assert [field["key"] for field in updated["fields"]] == ["name"]


def test_update_schema_keeps_the_same_id() -> None:
    created = schema_service.create_schema(COMPANY_SCHEMA)

    updated = schema_service.update_schema(
        "company", {"name": "company", "fields": [{"key": "name", "type": "text"}]}
    )

    assert updated["id"] == created["id"]


def test_update_schema_rejects_a_rename() -> None:
    schema_service.create_schema(COMPANY_SCHEMA)

    with pytest.raises(errors.ValidationError, match="Cannot rename"):
        schema_service.update_schema(
            "company", {"name": "org", "fields": [{"key": "name", "type": "text"}]}
        )


def test_update_schema_rejects_editing_a_built_in() -> None:
    with pytest.raises(errors.ValidationError, match="built in"):
        schema_service.update_schema(
            model.TYPE_CONTACT,
            {"name": "contact", "fields": [{"key": "name", "type": "text"}]},
        )


def test_update_schema_raises_for_an_unknown_type() -> None:
    with pytest.raises(errors.NotFoundError):
        schema_service.update_schema(
            "widget", {"name": "widget", "fields": [{"key": "n", "type": "text"}]}
        )


def test_delete_schema_removes_the_type() -> None:
    schema_service.create_schema(COMPANY_SCHEMA)

    schema_service.delete_schema("company")

    assert schema_service.find_schema("company") is None


def test_delete_schema_drops_the_types_view() -> None:
    schema_service.create_schema(COMPANY_SCHEMA)

    schema_service.delete_schema("company")

    assert "company" not in view_names()


def test_delete_schema_rejects_a_type_that_still_has_objects() -> None:
    schema_service.create_schema(COMPANY_SCHEMA)
    object_service.create_object("company", {"name": "Acme"})

    with pytest.raises(errors.ValidationError, match="still has 1 object"):
        schema_service.delete_schema("company")


def test_delete_schema_rejects_a_built_in() -> None:
    with pytest.raises(errors.ValidationError, match="built in"):
        schema_service.delete_schema(model.TYPE_CONTACT)


def test_type_names_includes_built_ins_and_user_types() -> None:
    schema_service.create_schema(COMPANY_SCHEMA)

    assert "company" in schema_service.type_names()
    assert model.TYPE_CONTACT in schema_service.type_names()


def test_seeding_refreshes_a_stale_built_in_schema() -> None:
    stored = schema_service.get_schema_object(model.TYPE_CONTACT)
    DiskDao.update_objects(
        model.TYPE_SCHEMA,
        [{**stored, "fields": [{"key": "name", "type": "text"}]}],
    )

    DiskDao.initialize()
    schema_service.invalidate_cache()

    refreshed = schema_service.get_schema(model.TYPE_CONTACT)
    assert len(refreshed.fields) == len(builtin_schemas.CONTACT_SCHEMA.fields)
