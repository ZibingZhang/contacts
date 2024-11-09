"""Command to validate contacts."""
from __future__ import annotations

import collections
import re
from collections.abc import Sequence
from typing import Literal

from contacts import model
from contacts.dao import disk_dao
from contacts.logger import LOG
from contacts.utils import contact_utils

_PATTERN_TO_HIGH_SCHOOL_NAME_MAP = {
    re.compile(r"^ABRSH$"): model.HighSchoolName.ACTON_BOXBOROUGH_REGIONAL_HIGH_SCHOOL,
    re.compile(r"^LHS$"): model.HighSchoolName.LEXINGTON_HIGH_SCHOOL,
    re.compile(r"^NHS\d{2}$"): model.HighSchoolName.NEEDHAM_HIGH_SCHOOL,
}

_PATTERN_TO_EXPECTED_TAG_MAP = {
    re.compile(r"^Climbing-.+$"): "Climbing",
    re.compile(r"^CTY.+$"): "CTY",
    re.compile(r"^HubSpot.+$"): "HubSpot",
    re.compile(r"^NHS.*$"): "NHS",
    re.compile(r"^NHS$"): "NPS",
    re.compile(r"^NPS.*$"): "NPS",
    re.compile(r"^(NHS|NPS).+$"): "Needham",
    re.compile(r"^NU.+$"): "NU",
    re.compile(r"^PowerAdvocate.+$"): "PowerAdvocate",
    re.compile(r"^SAB$"): "Boston",
    re.compile(r"^Sharks.+$"): "Sharks",
}


def run(should_fix: bool) -> None:
    if should_fix:
        LOG.info("Fixing contacts")
    else:
        LOG.info("Validating contacts")

    contacts = disk_dao.read_contacts()
    _validate_names(contacts)
    for contact in contacts:
        _validate_email_addresses(contact)
        _validate_education(contact, should_fix)
        _validate_tags(contact, should_fix)

    if should_fix:
        updated_contacts = {contact.id: contact for contact in contacts}
        current_contacts = {contact.id: contact for contact in disk_dao.read_contacts()}

        disk_dao.update_contacts(
            [
                updated_contacts[contact_id]
                for contact_id in updated_contacts.keys()
                if updated_contacts[contact_id] != current_contacts[contact_id]
            ]
        )


def _validate_names(contacts: Sequence[model.Contact]) -> None:
    names_counter: collections.Counter[str] = collections.Counter()
    for contact in contacts:
        names_counter[contact_utils.build_name_str(contact)] += 1
    for name in sorted(names_counter.keys()):
        if names_counter[name] > 1:
            LOG.info(f"Duplicate name {name}")


def _validate_email_addresses(contact: model.Contact) -> None:
    if contact.email_addresses is None:
        return None

    normalized_email_addresses = set()
    for email_address in contact.email_addresses:
        normalized_email_addresses.add(email_address.address.lower().replace(".", ""))
    if len(normalized_email_addresses) < len(contact.email_addresses):
        LOG.info(
            f"{contact_utils.build_name_str(contact)} has duplicate email addresses"
        )


def _validate_education(contact: model.Contact, should_fix: bool) -> None:
    if not contact.tags:
        return None

    for pattern in _PATTERN_TO_HIGH_SCHOOL_NAME_MAP:
        if tag := _any_tag_matches_pattern(contact.tags, pattern):
            _expect_high_school(
                contact, tag, _PATTERN_TO_HIGH_SCHOOL_NAME_MAP[pattern], should_fix
            )


def _expect_high_school(
    contact: model.Contact, tag: str, high_school_name: str, should_fix: bool
) -> None:
    contact_name = contact_utils.build_name_str(contact)

    if match := re.match(r"^.*(\d{2})$", tag):
        graduation_year = 2000 + int(match.groups()[0])
    else:
        graduation_year = None

    if contact.education is None:
        LOG.info(f"{contact_name} missing education")
        contact.education = model.Education(
            high_school=model.HighSchool(
                name=high_school_name, graduation_year=graduation_year
            )
        )
    elif contact.education.high_school is None:
        LOG.info(f"{contact_name} missing high school")
        contact.education.high_school = model.HighSchool(
                name=high_school_name, graduation_year=graduation_year
            )
    elif contact.education.high_school.name == high_school_name is None:
        LOG.warn(f"{contact_name} high school is not {high_school_name}")
    elif graduation_year is not None:
        if contact.education.high_school.graduation_year is None:
            LOG.info(f"{contact_name} missing high school graduation year")
            contact.education.high_school.graduation_year = graduation_year
        elif graduation_year != contact.education.high_school.graduation_year:
            LOG.warn(f"{contact_name} mismatched high school graduation year")


def _validate_tags(contact: model.Contact, should_fix: bool) -> None:
    if not contact.tags:
        return None

    for pattern in _PATTERN_TO_EXPECTED_TAG_MAP:
        if _any_tag_matches_pattern(contact.tags, pattern):
            _expect_tag(contact, _PATTERN_TO_EXPECTED_TAG_MAP[pattern], should_fix)


def _expect_tag(contact: model.Contact, tag: str, should_fix: bool) -> None:
    if contact.tags is not None and tag in contact.tags:
        return

    if should_fix:
        LOG.info(f"Adding {tag} tag to {contact_utils.build_name_str(contact)}")
    else:
        LOG.info(f"{contact_utils.build_name_str(contact)} missing {tag} tag")

    contact.tags = (contact.tags or []) + [tag]


def _any_tag_matches_pattern(
    tags: list[str], pattern: re.Pattern
) -> str | Literal[False]:
    for tag in tags:
        if pattern.match(tag):
            return tag
    return False
