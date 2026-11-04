"""Tests for contacts.server.list_service."""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from contacts import model
from contacts.dao.disk.disk_dao import DiskDao
from contacts.server import errors, list_service, object_service, schema_service

CTY_QUERY = (
    "SELECT id FROM contact WHERE EXISTS"
    " (SELECT 1 FROM json_each(data, '$.tags') WHERE value = 'CTY')"
)


@pytest.fixture(autouse=True)
def _database(tmp_path, monkeypatch) -> Iterator[None]:
    monkeypatch.setattr(DiskDao, "PATH", str(tmp_path / "data.db"))
    DiskDao.initialize()
    object_service.invalidate_cache()
    schema_service.invalidate_cache()
    yield
    object_service.invalidate_cache()
    schema_service.invalidate_cache()


@pytest.fixture
def contacts() -> list[dict]:
    return [
        object_service.create_object(
            model.TYPE_CONTACT, {"name": {"first_name": "Ada"}, "tags": ["CTY"]}
        ),
        object_service.create_object(
            model.TYPE_CONTACT, {"name": {"first_name": "Bob"}, "tags": ["CTY"]}
        ),
        object_service.create_object(
            model.TYPE_CONTACT, {"name": {"first_name": "Cid"}, "tags": ["other"]}
        ),
    ]


def make_list(**fields) -> dict:
    return object_service.create_object(model.TYPE_LIST, {"name": "CTY", **fields})


def test_a_new_list_starts_empty(contacts) -> None:
    a_list = make_list()

    assert list_service.member_ids(a_list["id"]) == []


def test_refresh_populates_membership_from_the_query(contacts) -> None:
    a_list = make_list(query=CTY_QUERY)

    list_service.refresh_list(a_list["id"])

    assert list_service.member_ids(a_list["id"]) == [1, 2]


def test_refresh_creates_one_association_per_member(contacts) -> None:
    a_list = make_list(query=CTY_QUERY)

    list_service.refresh_list(a_list["id"])

    assert len(object_service.list_objects(model.TYPE_ASSOCIATION)) == 2


def test_refresh_drops_members_that_no_longer_match(contacts) -> None:
    a_list = make_list(query=CTY_QUERY)
    list_service.refresh_list(a_list["id"])

    object_service.update_object(
        model.TYPE_CONTACT, 1, {"name": {"first_name": "Ada"}, "tags": ["other"]}
    )
    list_service.refresh_list(a_list["id"])

    assert list_service.member_ids(a_list["id"]) == [2]


def test_refresh_adds_members_that_newly_match(contacts) -> None:
    a_list = make_list(query=CTY_QUERY)
    list_service.refresh_list(a_list["id"])

    object_service.update_object(
        model.TYPE_CONTACT, 3, {"name": {"first_name": "Cid"}, "tags": ["CTY"]}
    )
    list_service.refresh_list(a_list["id"])

    assert sorted(list_service.member_ids(a_list["id"])) == [1, 2, 3]


def test_refresh_bumps_mtime_when_membership_changed(contacts) -> None:
    a_list = make_list(query=CTY_QUERY)
    original_mtime = a_list["mtime"]

    refreshed = list_service.refresh_list(a_list["id"])

    assert refreshed["mtime"] > original_mtime


def test_refresh_leaves_mtime_alone_when_membership_is_unchanged(contacts) -> None:
    a_list = make_list(query=CTY_QUERY)
    first = list_service.refresh_list(a_list["id"])

    second = list_service.refresh_list(a_list["id"])

    assert second["mtime"] == first["mtime"]


def test_refresh_is_a_no_op_for_a_list_with_no_query(contacts) -> None:
    a_list = make_list()
    list_service.add_members(a_list["id"], [3])

    list_service.refresh_list(a_list["id"])

    assert list_service.member_ids(a_list["id"]) == [3]


def test_refresh_rejects_an_invalid_query(contacts) -> None:
    a_list = make_list(query="SELECT nope FROM nowhere")

    with pytest.raises(errors.ValidationError, match="Invalid list query"):
        list_service.refresh_list(a_list["id"])


def test_refresh_rejects_a_query_whose_first_column_is_not_an_id(contacts) -> None:
    a_list = make_list(query="SELECT data FROM contact")

    with pytest.raises(errors.ValidationError, match="must return an object id"):
        list_service.refresh_list(a_list["id"])


def test_refresh_raises_for_a_missing_list() -> None:
    with pytest.raises(errors.NotFoundError):
        list_service.refresh_list(999)


def test_refresh_lists_refreshes_every_list(contacts) -> None:
    first = make_list(query=CTY_QUERY)
    second = object_service.create_object(
        model.TYPE_LIST, {"name": "All", "query": "SELECT id FROM contact"}
    )

    list_service.refresh_lists()

    assert list_service.member_ids(first["id"]) == [1, 2]
    assert list_service.member_ids(second["id"]) == [1, 2, 3]


def test_members_returns_the_member_objects(contacts) -> None:
    a_list = make_list(query=CTY_QUERY)
    list_service.refresh_list(a_list["id"])

    members = list_service.members(a_list["id"])

    assert [member["name"]["first_name"] for member in members] == ["Ada", "Bob"]


def test_members_skips_a_member_that_no_longer_exists(contacts) -> None:
    a_list = make_list(query=CTY_QUERY)
    list_service.refresh_list(a_list["id"])
    DiskDao.delete_objects(model.TYPE_CONTACT, [1])

    assert len(list_service.members(a_list["id"])) == 1


def test_add_members_adds_an_association(contacts) -> None:
    a_list = make_list()

    assert list_service.add_members(a_list["id"], [1, 3]) == [1, 3]


def test_add_members_ignores_an_existing_member(contacts) -> None:
    a_list = make_list()
    list_service.add_members(a_list["id"], [1])

    assert list_service.add_members(a_list["id"], [1]) == [1]


def test_add_members_rejects_an_object_that_does_not_exist(contacts) -> None:
    a_list = make_list()

    with pytest.raises(errors.NotFoundError):
        list_service.add_members(a_list["id"], [999])


def test_add_members_accepts_schema_rows_even_though_schema_is_reserved() -> None:
    a_list = make_list(member_type="schema")
    contact_schema_id = schema_service.get_schema_object("contact")["id"]

    assert list_service.add_members(a_list["id"], [contact_schema_id]) == [
        contact_schema_id
    ]


def test_add_members_rejects_a_schema_row_that_does_not_exist() -> None:
    a_list = make_list(member_type="schema")

    with pytest.raises(errors.NotFoundError):
        list_service.add_members(a_list["id"], [999])


def test_remove_members_removes_the_association(contacts) -> None:
    a_list = make_list()
    list_service.add_members(a_list["id"], [1, 2])

    assert list_service.remove_members(a_list["id"], [1]) == [2]


def test_remove_members_ignores_a_non_member(contacts) -> None:
    a_list = make_list()
    list_service.add_members(a_list["id"], [1])

    assert list_service.remove_members(a_list["id"], [3]) == [1]


def test_deleting_a_list_removes_its_membership_associations(contacts) -> None:
    a_list = make_list(query=CTY_QUERY)
    list_service.refresh_list(a_list["id"])

    object_service.delete_object(model.TYPE_LIST, a_list["id"])

    assert object_service.list_objects(model.TYPE_ASSOCIATION) == []


def test_deleting_a_member_removes_it_from_the_list(contacts) -> None:
    a_list = make_list(query=CTY_QUERY)
    list_service.refresh_list(a_list["id"])

    object_service.delete_object(model.TYPE_CONTACT, 1)

    assert list_service.member_ids(a_list["id"]) == [2]


def test_a_list_can_hold_a_user_defined_type(contacts) -> None:
    schema_service.create_schema(
        {"name": "company", "fields": [{"key": "name", "type": "text"}]}
    )
    company = object_service.create_object("company", {"name": "Acme"})
    a_list = object_service.create_object(
        model.TYPE_LIST, {"name": "Clients", "member_type": "company"}
    )

    list_service.add_members(a_list["id"], [company["id"]])

    assert list_service.members(a_list["id"])[0]["name"] == "Acme"


def test_membership_of_one_type_ignores_same_ids_of_another(contacts) -> None:
    schema_service.create_schema(
        {"name": "company", "fields": [{"key": "name", "type": "text"}]}
    )
    object_service.create_object("company", {"name": "Acme"})
    a_list = object_service.create_object(
        model.TYPE_LIST, {"name": "Clients", "member_type": "company"}
    )
    list_service.add_members(a_list["id"], [1])

    contact_list = object_service.create_object(
        model.TYPE_LIST, {"name": "People", "member_type": model.TYPE_CONTACT}
    )
    list_service.add_members(contact_list["id"], [1])

    assert list_service.members(a_list["id"])[0]["name"] == "Acme"


def test_a_list_of_lists_does_not_also_show_the_container_as_a_member_of_itself() -> None:
    container = object_service.create_object(
        model.TYPE_LIST, {"name": "Container", "member_type": model.TYPE_LIST}
    )
    member = object_service.create_object(
        model.TYPE_LIST, {"name": "Member", "member_type": model.TYPE_CONTACT}
    )

    list_service.add_members(container["id"], [member["id"]])

    assert list_service.member_ids(container["id"]) == [member["id"]]
    assert list_service.member_ids(member["id"]) == []


def test_all_member_ids_distinguishes_a_list_of_lists_from_its_member() -> None:
    container = object_service.create_object(
        model.TYPE_LIST, {"name": "Container", "member_type": model.TYPE_LIST}
    )
    member = object_service.create_object(
        model.TYPE_LIST, {"name": "Member", "member_type": model.TYPE_CONTACT}
    )

    list_service.add_members(container["id"], [member["id"]])

    all_ids = list_service.all_member_ids()
    assert all_ids[container["id"]] == [member["id"]]
    assert all_ids[member["id"]] == []


def test_refreshing_a_list_of_lists_does_not_detach_it_from_its_own_container() -> None:
    container = object_service.create_object(
        model.TYPE_LIST, {"name": "Container", "member_type": model.TYPE_LIST}
    )
    leaf = object_service.create_object(model.TYPE_LIST, {"name": "Leaf"})
    middle = object_service.create_object(
        model.TYPE_LIST,
        {
            "name": "Middle",
            "member_type": model.TYPE_LIST,
            "query": "SELECT id FROM list WHERE json_extract(data, '$.name') = 'Leaf'",
        },
    )
    list_service.add_members(container["id"], [middle["id"]])

    # Refreshing `middle`'s query must only reconcile *its own* membership
    # (picking up `leaf`), not the unrelated association that makes `middle`
    # itself a member of `container`.
    list_service.refresh_list(middle["id"])

    assert list_service.member_ids(container["id"]) == [middle["id"]]
    assert list_service.member_ids(middle["id"]) == [leaf["id"]]


def test_all_member_ids_covers_every_list(contacts) -> None:
    first = make_list(query=CTY_QUERY)
    second = object_service.create_object(
        model.TYPE_LIST, {"name": "All", "query": "SELECT id FROM contact"}
    )
    list_service.refresh_lists()

    all_ids = list_service.all_member_ids()

    assert all_ids == {first["id"]: [1, 2], second["id"]: [1, 2, 3]}


def test_all_member_ids_includes_empty_lists(contacts) -> None:
    a_list = make_list()

    assert list_service.all_member_ids() == {a_list["id"]: []}


def test_all_member_ids_ignores_non_membership_associations(contacts) -> None:
    a_list = make_list()
    list_service.add_members(a_list["id"], [1])
    object_service.create_object(
        model.TYPE_ASSOCIATION,
        {
            "object_type_1": model.TYPE_CONTACT,
            "object_id_1": 1,
            "object_type_2": model.TYPE_CONTACT,
            "object_id_2": 2,
        },
    )

    assert list_service.all_member_ids() == {a_list["id"]: [1]}
