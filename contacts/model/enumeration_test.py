"""Tests for contacts.model.enumeration."""

from __future__ import annotations

from contacts.model.enumeration import Country, CountryCode


def test_country_labeled_values_uses_the_value_as_its_own_label() -> None:
    assert {"value": "Ireland", "label": "Ireland"} in Country.labeled_values()


def test_country_code_labeled_values_special_cases_nanp() -> None:
    assert {"value": 1, "label": "United States/Canada"} in (
        CountryCode.labeled_values()
    )


def test_country_code_labeled_values_title_cases_other_codes() -> None:
    assert {"value": 353, "label": "Ireland"} in CountryCode.labeled_values()
