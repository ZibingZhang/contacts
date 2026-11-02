"""Tests for contacts.utils.contact_utils."""
from __future__ import annotations

import pytest

from contacts import model
from contacts.fixtures import contact_fixtures
from contacts.utils import contact_utils


def test_extract_name() -> None:
    contact = contact_fixtures.build(name={"first_name": "John", "last_name": "Smith"})

    assert contact_utils.build_name_str(contact) == "John Smith"


def test_extract_name_without_last_name() -> None:
    contact = contact_fixtures.build(name={"first_name": "John"})

    assert contact_utils.build_name_str(contact) == "John"


def test_extract_name_with_no_name_at_all() -> None:
    assert contact_utils.build_name_str(contact_fixtures.build()) == ""


def test_add_email_address_to_contact() -> None:
    contact = contact_fixtures.build()

    contact_utils.add_email_address_if_not_exists(
        contact, "john.smith@gmail.com", "HOME"
    )

    assert contact["email_addresses"] == [
        {"address": "john.smith@gmail.com", "label": "HOME"}
    ]


def test_add_email_address_to_contact_does_nothing_if_already_exists() -> None:
    contact = contact_fixtures.build(
        email_addresses=[{"address": "john.smith@gmail.com", "label": "HOME"}]
    )

    contact_utils.add_email_address_if_not_exists(
        contact, "john.smith@gmail.com", "WORK"
    )

    assert len(contact["email_addresses"]) == 1


def test_add_email_address_appends_a_different_address() -> None:
    contact = contact_fixtures.build(
        email_addresses=[{"address": "a@gmail.com", "label": "HOME"}]
    )

    contact_utils.add_email_address_if_not_exists(contact, "b@gmail.com", "WORK")

    assert len(contact["email_addresses"]) == 2


def test_add_email_address_error_if_multiple_at_characters() -> None:
    with pytest.raises(AssertionError):
        contact_utils.add_email_address_if_not_exists(
            contact_fixtures.build(), "email@with@ats", "HOME"
        )


def test_add_phone_number_to_contact() -> None:
    contact = contact_fixtures.build()

    contact_utils.add_phone_number_if_not_exists(
        contact, int(model.CountryCode.NANP), "911", "HOME"
    )

    assert contact["phone_numbers"] == [
        {"number": "911", "country_code": 1, "label": "HOME"}
    ]


def test_add_phone_number_to_contact_does_nothing_if_already_exists() -> None:
    contact = contact_fixtures.build(
        phone_numbers=[{"number": "911", "country_code": 1, "label": "HOME"}]
    )

    contact_utils.add_phone_number_if_not_exists(contact, 1, "911", "WORK")

    assert len(contact["phone_numbers"]) == 1


def test_add_phone_number_appends_the_same_number_in_another_country() -> None:
    contact = contact_fixtures.build(
        phone_numbers=[{"number": "911", "country_code": 1, "label": "HOME"}]
    )

    contact_utils.add_phone_number_if_not_exists(contact, 86, "911", "HOME")

    assert len(contact["phone_numbers"]) == 2


def test_add_phone_number_error_if_number_not_all_digits() -> None:
    with pytest.raises(AssertionError):
        contact_utils.add_phone_number_if_not_exists(
            contact_fixtures.build(), 1, "123a", "HOME"
        )


def test_search_contacts_by_full_name() -> None:
    john = contact_fixtures.build(name={"first_name": "John", "last_name": "Smith"})
    jane = contact_fixtures.build(name={"first_name": "Jane", "last_name": "Doe"})

    assert contact_utils.search_contacts([john, jane], "john smith") == [john]


def test_search_contacts_by_partial_name() -> None:
    john = contact_fixtures.build(name={"first_name": "John", "last_name": "Smith"})
    jane = contact_fixtures.build(name={"first_name": "Jane", "last_name": "Doe"})

    assert contact_utils.search_contacts([john, jane], "smith") == [john]


def test_search_contacts_by_nickname() -> None:
    john = contact_fixtures.build(
        name={"first_name": "Jonathan", "nickname": "John", "last_name": "Smith"}
    )

    assert contact_utils.search_contacts([john], "john smith") == [john]


def test_search_contacts_no_match() -> None:
    john = contact_fixtures.build(name={"first_name": "John", "last_name": "Smith"})

    assert contact_utils.search_contacts([john], "nobody") == []


def test_remove_unsynced_fields_strips_deadname_and_maiden_name() -> None:
    contact = contact_fixtures.build(
        name={"first_name": "J", "deadname": "X", "maiden_name": "Y"}
    )

    contact_utils.remove_unsynced_fields(contact)

    assert contact["name"] == {"first_name": "J"}


def test_remove_unsynced_fields_strips_finsta_usernames() -> None:
    contact = contact_fixtures.build(
        social_profiles={"instagram": {"username": "j", "finsta_usernames": ["j2"]}}
    )

    contact_utils.remove_unsynced_fields(contact)

    assert contact["social_profiles"]["instagram"] == {"username": "j"}


def test_remove_unsynced_fields_is_a_no_op_when_they_are_absent() -> None:
    contact = contact_fixtures.build(name={"first_name": "J"})

    contact_utils.remove_unsynced_fields(contact)

    assert contact["name"] == {"first_name": "J"}


def test_only_etag_updated_is_true_for_an_etag_only_update() -> None:
    diff = {"$update": {"icloud": {"$update": {"etag": "new"}}}}

    assert contact_utils.only_etag_updated(diff) is True


def test_only_etag_updated_is_true_for_an_etag_only_insert() -> None:
    diff = {"$update": {"icloud": {"$insert": {"etag": "new"}}}}

    assert contact_utils.only_etag_updated(diff) is True


def test_only_etag_updated_is_false_when_another_field_changed() -> None:
    diff = {"$update": {"icloud": {"$update": {"etag": "new"}}, "notes": "hi"}}

    assert contact_utils.only_etag_updated(diff) is False


def test_normalize_push_diff_strips_disk_only_inserted_fields() -> None:
    diff = {"$insert": {"id": 1, "ctime": 0.0, "mtime": 1.0, "notes": "hi"}}

    assert contact_utils.normalize_push_diff(diff) == {"$insert": {"notes": "hi"}}


def test_normalize_push_diff_drops_an_insert_left_empty() -> None:
    diff = {"$insert": {"id": 1, "mtime": 1.0}}

    assert contact_utils.normalize_push_diff(diff) == {}


def test_extract_tags_dedupes_and_sorts() -> None:
    contacts = [
        contact_fixtures.build(tags=["b", "a"]),
        contact_fixtures.build(tags=["a", "c"]),
    ]

    assert contact_utils.extract_tags(contacts) == ["a", "b", "c"]
