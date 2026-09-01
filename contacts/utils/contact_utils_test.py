"""Tests for contacts.utils.contact_utils."""
from __future__ import annotations

import pytest

from contacts import model
from contacts.fixtures import contact_fixtures
from contacts.utils import contact_utils


def test_extract_name() -> None:
    assert (
        contact_utils.build_name_str(
            contact_fixtures.build(
                name=model.Name(first_name="John", last_name="Smith")
            )
        )
        == "John Smith"
    )


def test_extract_name_without_last_name() -> None:
    assert (
        contact_utils.build_name_str(
            contact_fixtures.build(name=model.Name(first_name="John"))
        )
        == "John"
    )


def test_add_email_address_to_contact() -> None:
    contact = contact_fixtures.build()
    email_address = "john.smith@gmail.com"
    label = "HOME"

    contact_utils.add_email_address_if_not_exists(contact, email_address, label)

    assert contact.email_addresses is not None
    assert len(contact.email_addresses) == 1
    assert contact.email_addresses[0] == model.EmailAddresss(
        address=email_address, label=label
    )


def test_add_email_address_to_contact_does_nothing_if_already_exists() -> None:
    email_address = "john.smith@gmail.com"
    label = "HOME"
    contact = contact_fixtures.build(
        email_addresses=[model.EmailAddresss(address=email_address, label=label)],
    )

    assert contact.email_addresses is not None
    assert len(contact.email_addresses) == 1

    contact_utils.add_email_address_if_not_exists(contact, email_address, label)

    assert len(contact.email_addresses) == 1


def test_add_email_address_error_if_multiple_at_characters() -> None:
    with pytest.raises(AssertionError):
        contact_utils.add_email_address_if_not_exists(
            contact_fixtures.build(), "email@with@ats", "HOME"
        )


def test_add_phone_number_to_contact() -> None:
    contact = contact_fixtures.build()
    country_code = model.CountryCode.NANP
    number = "911"
    label = "HOME"

    contact_utils.add_phone_number_if_not_exists(contact, country_code, number, label)

    assert contact.phone_numbers is not None
    assert len(contact.phone_numbers) == 1
    assert contact.phone_numbers[0] == model.PhoneNumber(
        country_code=country_code, number=number, label=label
    )


def test_add_phone_number_to_contact_does_nothing_if_already_exists() -> None:
    country_code = model.CountryCode.NANP
    number = "911"
    label = "HOME"
    contact = contact_fixtures.build(
        phone_numbers=[
            model.PhoneNumber(country_code=country_code, number=number, label=label)
        ],
    )

    assert contact.phone_numbers is not None
    assert len(contact.phone_numbers) == 1

    contact_utils.add_phone_number_if_not_exists(contact, country_code, number, label)

    assert len(contact.phone_numbers) == 1


def test_add_phone_number_error_if_number_not_all_digits() -> None:
    with pytest.raises(AssertionError):
        contact_utils.add_phone_number_if_not_exists(
            contact_fixtures.build(), model.CountryCode.NANP, "123a", "HOME"
        )


def test_search_contacts_by_full_name() -> None:
    john = contact_fixtures.build(name=model.Name(first_name="John", last_name="Smith"))
    jane = contact_fixtures.build(name=model.Name(first_name="Jane", last_name="Doe"))

    assert contact_utils.search_contacts([john, jane], "john smith") == [john]


def test_search_contacts_by_partial_name() -> None:
    john = contact_fixtures.build(name=model.Name(first_name="John", last_name="Smith"))
    jane = contact_fixtures.build(name=model.Name(first_name="Jane", last_name="Doe"))

    assert contact_utils.search_contacts([john, jane], "smith") == [john]


def test_search_contacts_by_nickname() -> None:
    john = contact_fixtures.build(
        name=model.Name(first_name="Jonathan", nickname="John", last_name="Smith")
    )

    assert contact_utils.search_contacts([john], "john smith") == [john]


def test_search_contacts_no_match() -> None:
    john = contact_fixtures.build(name=model.Name(first_name="John", last_name="Smith"))

    assert contact_utils.search_contacts([john], "nobody") == []
