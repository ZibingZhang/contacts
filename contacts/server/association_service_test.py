"""Tests for contacts.server.association_service."""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from contacts import model
from contacts.dao.disk.disk_dao import DiskDao
from contacts.server import association_service, errors, object_service, schema_service


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
def contact() -> dict:
    return object_service.create_object(
        model.TYPE_CONTACT, {"name": {"first_name": "Ada"}}
    )


@pytest.fixture
def a_list() -> dict:
    return object_service.create_object(model.TYPE_LIST, {"name": "Friends"})


def associate(a_list: dict, contact: dict) -> dict:
    return object_service.create_object(
        model.TYPE_ASSOCIATION,
        {
            "object_type_1": model.TYPE_LIST,
            "object_id_1": a_list["id"],
            "object_type_2": model.TYPE_CONTACT,
            "object_id_2": contact["id"],
        },
    )


def test_side_reads_each_half(a_list, contact) -> None:
    association = associate(a_list, contact)

    assert association_service.side(association, 1) == (model.TYPE_LIST, a_list["id"])
    assert association_service.side(association, 2) == (
        model.TYPE_CONTACT,
        contact["id"],
    )


def test_other_side_from_the_first_half(a_list, contact) -> None:
    association = associate(a_list, contact)

    other = association_service.other_side(association, model.TYPE_LIST, a_list["id"])

    assert other == (model.TYPE_CONTACT, contact["id"])


def test_other_side_from_the_second_half(a_list, contact) -> None:
    association = associate(a_list, contact)

    other = association_service.other_side(
        association, model.TYPE_CONTACT, contact["id"]
    )

    assert other == (model.TYPE_LIST, a_list["id"])


def test_validate_accepts_two_existing_objects(a_list, contact) -> None:
    association_service.validate(
        {
            "object_type_1": model.TYPE_LIST,
            "object_id_1": a_list["id"],
            "object_type_2": model.TYPE_CONTACT,
            "object_id_2": contact["id"],
        }
    )


def test_validate_rejects_a_missing_first_side(contact) -> None:
    with pytest.raises(errors.ValidationError, match="object_type_1"):
        association_service.validate(
            {
                "object_type_1": model.TYPE_LIST,
                "object_id_1": 999,
                "object_type_2": model.TYPE_CONTACT,
                "object_id_2": contact["id"],
            }
        )


def test_validate_rejects_a_missing_second_side(a_list) -> None:
    with pytest.raises(errors.ValidationError, match="object_type_2"):
        association_service.validate(
            {
                "object_type_1": model.TYPE_LIST,
                "object_id_1": a_list["id"],
                "object_type_2": model.TYPE_CONTACT,
                "object_id_2": 999,
            }
        )


def test_find_matches_in_the_order_given(a_list, contact) -> None:
    created = associate(a_list, contact)

    found = association_service.find(
        model.TYPE_LIST, a_list["id"], model.TYPE_CONTACT, contact["id"]
    )

    assert found is not None and found["id"] == created["id"]


def test_find_matches_in_the_reverse_order(a_list, contact) -> None:
    created = associate(a_list, contact)

    found = association_service.find(
        model.TYPE_CONTACT, contact["id"], model.TYPE_LIST, a_list["id"]
    )

    assert found is not None and found["id"] == created["id"]


def test_find_returns_none_when_unrelated(a_list, contact) -> None:
    assert (
        association_service.find(
            model.TYPE_LIST, a_list["id"], model.TYPE_CONTACT, contact["id"]
        )
        is None
    )


def test_list_for_finds_associations_on_either_side(a_list, contact) -> None:
    associate(a_list, contact)

    assert len(association_service.list_for(model.TYPE_CONTACT, contact["id"])) == 1
    assert len(association_service.list_for(model.TYPE_LIST, a_list["id"])) == 1


def test_list_for_ignores_a_matching_id_of_another_type(a_list, contact) -> None:
    associate(a_list, contact)

    assert association_service.list_for("company", contact["id"]) == []


def test_related_ids_collects_only_the_requested_type(a_list, contact) -> None:
    associate(a_list, contact)

    ids = association_service.related_ids(
        model.TYPE_LIST, a_list["id"], model.TYPE_CONTACT
    )

    assert ids == [contact["id"]]


def test_related_ids_is_empty_for_a_type_with_no_links(a_list, contact) -> None:
    associate(a_list, contact)

    ids = association_service.related_ids(model.TYPE_LIST, a_list["id"], "company")

    assert ids == []


def test_member_ids_of_collects_only_side_2_of_matching_type(a_list, contact) -> None:
    associate(a_list, contact)

    ids = association_service.member_ids_of(
        model.TYPE_LIST, a_list["id"], model.TYPE_CONTACT
    )

    assert ids == [contact["id"]]


def test_member_ids_of_ignores_an_association_where_it_is_the_member_side() -> None:
    container = object_service.create_object(model.TYPE_LIST, {"name": "Container"})
    member = object_service.create_object(model.TYPE_LIST, {"name": "Member"})
    object_service.create_object(
        model.TYPE_ASSOCIATION,
        {
            "object_type_1": model.TYPE_LIST,
            "object_id_1": container["id"],
            "object_type_2": model.TYPE_LIST,
            "object_id_2": member["id"],
        },
    )

    # From `member`'s own perspective, it has no members -- unlike
    # `related_ids`, this must not resolve the association back to
    # `container` just because both sides are type "list".
    assert (
        association_service.member_ids_of(
            model.TYPE_LIST, member["id"], model.TYPE_LIST
        )
        == []
    )
    assert association_service.member_ids_of(
        model.TYPE_LIST, container["id"], model.TYPE_LIST
    ) == [member["id"]]


def test_delete_for_removes_every_association_touching_an_object(
    a_list, contact
) -> None:
    associate(a_list, contact)

    deleted = association_service.delete_for(model.TYPE_CONTACT, contact["id"])

    assert deleted == 1
    assert association_service.list_for(model.TYPE_LIST, a_list["id"]) == []


def test_delete_for_returns_zero_when_there_is_nothing_to_delete(contact) -> None:
    assert association_service.delete_for(model.TYPE_CONTACT, contact["id"]) == 0


def test_an_association_between_two_contacts_resolves_both_ways(contact) -> None:
    other = object_service.create_object(
        model.TYPE_CONTACT, {"name": {"first_name": "Bob"}}
    )
    object_service.create_object(
        model.TYPE_ASSOCIATION,
        {
            "object_type_1": model.TYPE_CONTACT,
            "object_id_1": contact["id"],
            "object_type_2": model.TYPE_CONTACT,
            "object_id_2": other["id"],
        },
    )

    ids = association_service.related_ids(
        model.TYPE_CONTACT, contact["id"], model.TYPE_CONTACT
    )

    assert ids == [other["id"]]
