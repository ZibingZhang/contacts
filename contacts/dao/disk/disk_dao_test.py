"""Tests for contacts.dao.disk.disk_dao."""

from __future__ import annotations

import json
import sqlite3

import pytest

from contacts.dao.disk.disk_dao import DiskDao
from contacts.model import schema


@pytest.fixture(autouse=True)
def _disk_dao(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(DiskDao, "PATH", str(tmp_path / "data.db"))
    DiskDao.initialize()


def build_legacy_database(path: str, contacts: list[dict], groups: list[dict]) -> None:
    """Writes a database in the pre-migration two-table shape."""
    connection = sqlite3.connect(path)
    with connection:
        connection.execute(
            "CREATE TABLE contact (id INTEGER PRIMARY KEY, ctime REAL NOT NULL,"
            " mtime REAL, data TEXT NOT NULL)"
        )
        connection.execute(
            'CREATE TABLE "group" (id INTEGER PRIMARY KEY, ctime REAL NOT NULL,'
            " mtime REAL, data TEXT NOT NULL)"
        )
        for contact in contacts:
            connection.execute(
                "INSERT INTO contact (id, ctime, mtime, data) VALUES (?, ?, ?, ?)",
                (contact["id"], 1.0, 2.0, json.dumps(contact)),
            )
        for group in groups:
            connection.execute(
                'INSERT INTO "group" (id, ctime, mtime, data) VALUES (?, ?, ?, ?)',
                (group["id"], 1.0, 2.0, json.dumps(group)),
            )
    connection.close()


def test_create_objects_assigns_id_starting_from_one_on_empty_table() -> None:
    contact: dict = {"name": {"first_name": "John"}}

    DiskDao.create_objects(schema.TYPE_CONTACT, [contact])

    assert contact["id"] == 1


def test_create_objects_continues_from_existing_max_id() -> None:
    DiskDao.create_objects(schema.TYPE_CONTACT, [{"name": {"first_name": "John"}}])
    second: dict = {"name": {"first_name": "Jane"}}

    DiskDao.create_objects(schema.TYPE_CONTACT, [second])

    assert second["id"] == 2


def test_create_objects_assigns_sequential_ids_within_one_call() -> None:
    first: dict = {"name": {"first_name": "John"}}
    second: dict = {"name": {"first_name": "Jane"}}

    DiskDao.create_objects(schema.TYPE_CONTACT, [first, second])

    assert (first["id"], second["id"]) == (1, 2)


def test_create_objects_keeps_a_separate_sequence_per_type() -> None:
    DiskDao.create_objects(schema.TYPE_CONTACT, [{"name": {"first_name": "John"}}])
    a_list: dict = {"name": "Friends"}

    DiskDao.create_objects(schema.TYPE_LIST, [a_list])

    assert a_list["id"] == 1


def test_create_objects_sets_ctime_and_mtime() -> None:
    contact: dict = {"name": {"first_name": "John"}}

    DiskDao.create_objects(schema.TYPE_CONTACT, [contact])

    assert contact["ctime"] == contact["mtime"]


def test_update_objects_overwrites_in_place_without_duplicating() -> None:
    contact: dict = {"name": {"first_name": "John"}}
    DiskDao.create_objects(schema.TYPE_CONTACT, [contact])

    contact["name"]["first_name"] = "Jonathan"
    DiskDao.update_objects(schema.TYPE_CONTACT, [contact])

    read_back = DiskDao.read_objects(schema.TYPE_CONTACT)
    assert [obj["name"]["first_name"] for obj in read_back] == ["Jonathan"]


def test_update_objects_preserves_original_ctime() -> None:
    contact: dict = {"name": {"first_name": "John"}}
    DiskDao.create_objects(schema.TYPE_CONTACT, [contact])
    original_ctime = contact["ctime"]

    contact["mtime"] = original_ctime + 100
    DiskDao.update_objects(schema.TYPE_CONTACT, [contact])

    [read_back] = DiskDao.read_objects(schema.TYPE_CONTACT)
    assert (read_back["ctime"], read_back["mtime"]) == (
        original_ctime,
        original_ctime + 100,
    )


def test_update_objects_inserts_an_object_that_does_not_exist_yet() -> None:
    DiskDao.update_objects(
        schema.TYPE_CONTACT, [{"id": 7, "ctime": 1.0, "name": {"first_name": "J"}}]
    )

    assert len(DiskDao.read_objects(schema.TYPE_CONTACT)) == 1


def test_read_objects_round_trips_nested_fields() -> None:
    contact: dict = {
        "name": {"first_name": "John", "last_name": "Smith"},
        "education": {
            "high_school": {"name": "Acton-Boxborough", "graduation_year": 2016},
            "bachelor": {"name": "Bowdoin", "graduation_year": 2019, "majors": ["CS"]},
        },
        "phone_numbers": [{"number": "9787276511", "country_code": 1}],
        "social_profiles": {"instagram": {"username": "purplecoral99"}},
        "tags": ["Boston"],
    }
    DiskDao.create_objects(schema.TYPE_CONTACT, [contact])

    [read_back] = DiskDao.read_objects(schema.TYPE_CONTACT)

    assert read_back == contact


def test_read_objects_is_ordered_by_id() -> None:
    DiskDao.update_objects(
        schema.TYPE_CONTACT,
        [{"id": 3, "ctime": 1.0, "name": {}}, {"id": 1, "ctime": 1.0, "name": {}}],
    )

    read_back = DiskDao.read_objects(schema.TYPE_CONTACT)

    assert [obj["id"] for obj in read_back] == [1, 3]


def test_read_objects_does_not_return_other_types() -> None:
    DiskDao.create_objects(schema.TYPE_LIST, [{"name": "Friends"}])

    assert DiskDao.read_objects(schema.TYPE_CONTACT) == []


def test_read_object_returns_none_for_a_missing_id() -> None:
    assert DiskDao.read_object(schema.TYPE_CONTACT, 1) is None


def test_read_object_returns_the_matching_object() -> None:
    DiskDao.create_objects(schema.TYPE_CONTACT, [{"name": {"first_name": "John"}}])

    read_back = DiskDao.read_object(schema.TYPE_CONTACT, 1)

    assert read_back is not None and read_back["name"]["first_name"] == "John"


def test_column_fields_are_not_duplicated_inside_the_data_blob() -> None:
    DiskDao.create_objects(schema.TYPE_CONTACT, [{"name": {"first_name": "John"}}])

    connection = sqlite3.connect(DiskDao.PATH)
    (data,) = connection.execute(
        "SELECT data FROM object WHERE type = 'contact' AND id = 1"
    ).fetchone()
    connection.close()

    assert set(json.loads(data)) == {"name"}


def test_delete_objects_removes_the_object() -> None:
    DiskDao.create_objects(schema.TYPE_CONTACT, [{"name": {"first_name": "John"}}])

    DiskDao.delete_objects(schema.TYPE_CONTACT, [1])

    assert DiskDao.read_objects(schema.TYPE_CONTACT) == []


def test_delete_objects_leaves_the_same_id_of_another_type_alone() -> None:
    DiskDao.create_objects(schema.TYPE_CONTACT, [{"name": {"first_name": "John"}}])
    DiskDao.create_objects(schema.TYPE_LIST, [{"name": "Friends"}])

    DiskDao.delete_objects(schema.TYPE_LIST, [1])

    assert len(DiskDao.read_objects(schema.TYPE_CONTACT)) == 1


def test_read_associations_for_matches_either_side() -> None:
    DiskDao.create_objects(
        schema.TYPE_ASSOCIATION,
        [
            {
                "object_type_1": "list",
                "object_id_1": 1,
                "object_type_2": "contact",
                "object_id_2": 5,
            },
            {
                "object_type_1": "contact",
                "object_id_1": 5,
                "object_type_2": "company",
                "object_id_2": 2,
            },
            {
                "object_type_1": "list",
                "object_id_1": 1,
                "object_type_2": "contact",
                "object_id_2": 6,
            },
        ],
    )

    found = DiskDao.read_associations_for("contact", 5)

    assert [association["id"] for association in found] == [1, 2]


def test_read_associations_for_ignores_a_matching_id_of_another_type() -> None:
    DiskDao.create_objects(
        schema.TYPE_ASSOCIATION,
        [
            {
                "object_type_1": "list",
                "object_id_1": 1,
                "object_type_2": "contact",
                "object_id_2": 5,
            }
        ],
    )

    assert DiskDao.read_associations_for("company", 5) == []


def test_initialize_seeds_the_built_in_schemas() -> None:
    names = {obj["name"] for obj in DiskDao.read_objects(schema.TYPE_SCHEMA)}

    assert names == {"contact", "list", "association"}


def test_initialize_creates_a_view_per_type() -> None:
    connection = sqlite3.connect(DiskDao.PATH)
    views = {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'view'"
        )
    }
    connection.close()

    assert views == {"contact", "list", "association"}


def test_a_type_view_reads_that_types_objects() -> None:
    DiskDao.create_objects(schema.TYPE_CONTACT, [{"name": {"first_name": "John"}}])
    DiskDao.create_objects(schema.TYPE_LIST, [{"name": "Friends"}])

    rows = DiskDao.run_readonly_query("SELECT id FROM contact")

    assert rows == [(1,)]


def test_a_stored_list_query_resolves_through_the_view() -> None:
    DiskDao.create_objects(
        schema.TYPE_CONTACT,
        [{"name": {}, "tags": ["CTY"]}, {"name": {}, "tags": ["other"]}],
    )

    rows = DiskDao.run_readonly_query(
        "SELECT id FROM contact WHERE EXISTS"
        " (SELECT 1 FROM json_each(data, '$.tags') WHERE value = 'CTY')"
    )

    assert rows == [(1,)]


def test_initialize_is_idempotent() -> None:
    DiskDao.create_objects(schema.TYPE_CONTACT, [{"name": {"first_name": "John"}}])

    DiskDao.initialize()

    assert len(DiskDao.read_objects(schema.TYPE_CONTACT)) == 1


def test_migration_moves_contacts_into_the_object_table(tmp_path, monkeypatch) -> None:
    path = str(tmp_path / "legacy.db")
    monkeypatch.setattr(DiskDao, "PATH", path)
    build_legacy_database(
        path,
        contacts=[{"id": 1, "ctime": 0, "mtime": 9.0, "name": {"first_name": "John"}}],
        groups=[],
    )

    DiskDao.initialize()

    [contact] = DiskDao.read_objects(schema.TYPE_CONTACT)
    assert (contact["id"], contact["name"]) == (1, {"first_name": "John"})


def test_migration_preserves_contact_ids(tmp_path, monkeypatch) -> None:
    path = str(tmp_path / "legacy.db")
    monkeypatch.setattr(DiskDao, "PATH", path)
    build_legacy_database(
        path,
        contacts=[{"id": 40, "name": {}}, {"id": 41, "name": {}}],
        groups=[],
    )

    DiskDao.initialize()

    assert [c["id"] for c in DiskDao.read_objects(schema.TYPE_CONTACT)] == [40, 41]


def test_migration_turns_group_ids_into_associations(tmp_path, monkeypatch) -> None:
    path = str(tmp_path / "legacy.db")
    monkeypatch.setattr(DiskDao, "PATH", path)
    build_legacy_database(
        path,
        contacts=[{"id": 1, "name": {}}, {"id": 2, "name": {}}],
        groups=[{"id": 1, "name": "CTY", "query": "", "ids": [1, 2]}],
    )

    DiskDao.initialize()

    associations = DiskDao.read_objects(schema.TYPE_ASSOCIATION)
    assert [a["object_id_2"] for a in associations] == [1, 2]


def test_migration_drops_the_ids_array_from_the_list(tmp_path, monkeypatch) -> None:
    path = str(tmp_path / "legacy.db")
    monkeypatch.setattr(DiskDao, "PATH", path)
    build_legacy_database(
        path,
        contacts=[],
        groups=[{"id": 1, "name": "CTY", "query": "", "ids": [1, 2]}],
    )

    DiskDao.initialize()

    [a_list] = DiskDao.read_objects(schema.TYPE_LIST)
    assert "ids" not in a_list


def test_migration_defaults_the_list_member_type(tmp_path, monkeypatch) -> None:
    path = str(tmp_path / "legacy.db")
    monkeypatch.setattr(DiskDao, "PATH", path)
    build_legacy_database(
        path, contacts=[], groups=[{"id": 1, "name": "CTY", "query": ""}]
    )

    DiskDao.initialize()

    [a_list] = DiskDao.read_objects(schema.TYPE_LIST)
    assert a_list["member_type"] == schema.TYPE_CONTACT


def test_migration_drops_the_legacy_tables(tmp_path, monkeypatch) -> None:
    path = str(tmp_path / "legacy.db")
    monkeypatch.setattr(DiskDao, "PATH", path)
    build_legacy_database(path, contacts=[{"id": 1, "name": {}}], groups=[])

    DiskDao.initialize()

    connection = sqlite3.connect(path)
    tables = {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )
    }
    connection.close()
    assert tables == {"object"}


def test_migration_backs_the_database_up_first(tmp_path, monkeypatch) -> None:
    path = str(tmp_path / "legacy.db")
    monkeypatch.setattr(DiskDao, "PATH", path)
    build_legacy_database(path, contacts=[{"id": 1, "name": {}}], groups=[])

    DiskDao.initialize()

    backup = sqlite3.connect(path + ".pre-crm-backup")
    count = backup.execute("SELECT COUNT(*) FROM contact").fetchone()[0]
    backup.close()
    assert count == 1


def test_migration_is_not_rerun_on_a_second_initialize(tmp_path, monkeypatch) -> None:
    path = str(tmp_path / "legacy.db")
    monkeypatch.setattr(DiskDao, "PATH", path)
    build_legacy_database(path, contacts=[{"id": 1, "name": {}}], groups=[])
    DiskDao.initialize()
    DiskDao.delete_objects(schema.TYPE_CONTACT, [1])

    DiskDao.initialize()

    assert DiskDao.read_objects(schema.TYPE_CONTACT) == []


def _seed_self_describing_schema(path: str) -> None:
    """Simulates the orphaned state left by the version that had this bug."""
    connection = sqlite3.connect(path)
    with connection:
        connection.execute(
            "INSERT INTO object (type, id, ctime, mtime, data) VALUES (?, 999, 0, 0, ?)",
            (schema.TYPE_SCHEMA, json.dumps({"name": "schema", "fields": []})),
        )
        connection.execute(
            'CREATE VIEW IF NOT EXISTS "schema" AS '
            "SELECT id, ctime, mtime, data FROM object WHERE type = 'schema'"
        )
    connection.close()


def test_initialize_removes_a_self_describing_schema_row(tmp_path, monkeypatch) -> None:
    path = str(tmp_path / "data.db")
    monkeypatch.setattr(DiskDao, "PATH", path)
    DiskDao.initialize()
    _seed_self_describing_schema(path)

    DiskDao.initialize()

    names = {obj["name"] for obj in DiskDao.read_objects(schema.TYPE_SCHEMA)}
    assert "schema" not in names


def test_initialize_drops_the_self_describing_schemas_view(
    tmp_path, monkeypatch
) -> None:
    path = str(tmp_path / "data.db")
    monkeypatch.setattr(DiskDao, "PATH", path)
    DiskDao.initialize()
    _seed_self_describing_schema(path)

    DiskDao.initialize()

    connection = sqlite3.connect(path)
    views = {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'view'"
        )
    }
    connection.close()
    assert views == {"contact", "list", "association"}


def test_initialize_leaves_other_schemas_alone_when_cleaning_up(
    tmp_path, monkeypatch
) -> None:
    path = str(tmp_path / "data.db")
    monkeypatch.setattr(DiskDao, "PATH", path)
    DiskDao.initialize()
    _seed_self_describing_schema(path)

    DiskDao.initialize()

    names = {obj["name"] for obj in DiskDao.read_objects(schema.TYPE_SCHEMA)}
    assert names == {"contact", "list", "association"}


def test_removing_the_self_describing_schema_is_idempotent(
    tmp_path, monkeypatch
) -> None:
    path = str(tmp_path / "data.db")
    monkeypatch.setattr(DiskDao, "PATH", path)
    DiskDao.initialize()
    _seed_self_describing_schema(path)
    DiskDao.initialize()

    DiskDao.initialize()

    names = {obj["name"] for obj in DiskDao.read_objects(schema.TYPE_SCHEMA)}
    assert names == {"contact", "list", "association"}
