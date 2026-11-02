"""Command to validate contacts."""

from __future__ import annotations

import collections
import copy
import re
from collections.abc import Sequence
from typing import Literal

from contacts import model
from contacts.dao import disk_dao
from contacts.logger import LOG
from contacts.utils import contact_utils, object_utils
from contacts.utils.object_utils import Object

_PATTERN_TO_HIGH_SCHOOL_NAME_MAP = {
    re.compile(r"^ABRSH$"): "Acton-Boxborough Regional High School",
    re.compile(r"^LHS$"): "Lexington High School",
    re.compile(r"^NHS\d{2}$"): "Needham High School",
}

_PATTERN_TO_EXPECTED_TAG_MAP = {
    re.compile(r"^Climbing-.+$"): "Climbing",
    re.compile(r"^CTY.+$"): "CTY",
    re.compile(r"^HubSpot.+$"): "HubSpot",
    re.compile(r"^NHS.*$"): "NHS",
    re.compile(r"^NHS$"): "NPS",
    re.compile(r"^NPS.*$"): "NPS",
    re.compile(r"^(NHS|NPS).*$"): "Needham",
    re.compile(r"^NU.+$"): "NU",
    re.compile(r"^PowerAdvocate.+$"): "PowerAdvocate",
    re.compile(r"^ROPO\d+$"): "ROPO",
    re.compile(r"^SAB$"): "Boston",
    re.compile(r"^Sharks.+$"): "Sharks",
}


def run(should_fix: bool) -> None:
    if should_fix:
        LOG.info("Fixing contacts")
    else:
        LOG.info("Validating contacts")

    contacts = disk_dao.read_objects(model.TYPE_CONTACT)
    original_by_id = {contact["id"]: copy.deepcopy(contact) for contact in contacts}

    _validate_names(contacts)
    for contact in contacts:
        _validate_email_addresses(contact)
        _validate_education(contact, should_fix)
        _validate_tags(contact, should_fix)

    if should_fix:
        changed = [
            contact
            for contact in contacts
            if object_utils.diff(original_by_id[contact["id"]], contact)
        ]
        disk_dao.update_objects(model.TYPE_CONTACT, changed)


def _validate_names(contacts: Sequence[Object]) -> None:
    names_counter: collections.Counter[str] = collections.Counter()
    for contact in contacts:
        names_counter[contact_utils.build_name_str(contact)] += 1
    for name in sorted(names_counter.keys()):
        if names_counter[name] > 1:
            LOG.info(f"Duplicate name {name}")


def _validate_email_addresses(contact: Object) -> None:
    email_addresses = contact.get("email_addresses")
    if email_addresses is None:
        return None

    normalized_email_addresses = {
        email_address["address"].lower().replace(".", "")
        for email_address in email_addresses
    }
    if len(normalized_email_addresses) < len(email_addresses):
        LOG.info(
            f"{contact_utils.build_name_str(contact)} has duplicate email addresses"
        )


def _validate_education(contact: Object, should_fix: bool) -> None:
    tags = contact.get("tags")
    if not tags:
        return None

    for pattern in _PATTERN_TO_HIGH_SCHOOL_NAME_MAP:
        if tag := _any_tag_matches_pattern(tags, pattern):
            _expect_high_school(
                contact, tag, _PATTERN_TO_HIGH_SCHOOL_NAME_MAP[pattern], should_fix
            )

    high_school = object_utils.get_path(contact, "education.high_school") or {}
    if high_school.get("name") == "Needham High School":
        _expect_tag(contact, "NHS", should_fix)
        if (year := high_school.get("graduation_year")) is not None:
            _expect_tag(contact, "NHS" + str(year)[2:], should_fix)


def _expect_high_school(
    contact: Object, tag: str, high_school_name: str, should_fix: bool
) -> None:
    contact_name = contact_utils.build_name_str(contact)

    if match := re.match(r"^.*(\d{2})$", tag):
        graduation_year = 2000 + int(match.groups()[0])
    else:
        graduation_year = None

    education = contact.get("education")
    high_school = (education or {}).get("high_school")

    if education is None:
        LOG.info(f"Adding education to {contact_name}")
        contact["education"] = {
            "high_school": object_utils.prune_none(
                {"name": high_school_name, "graduation_year": graduation_year}
            )
        }
    elif high_school is None:
        LOG.info(f"Adding high school to {contact_name}")
        education["high_school"] = object_utils.prune_none(
            {"name": high_school_name, "graduation_year": graduation_year}
        )
    elif high_school.get("name") != high_school_name:
        LOG.warn(f"{contact_name} high school is not {high_school_name}")
    elif graduation_year is not None:
        if high_school.get("graduation_year") is None:
            LOG.info(f"Adding high school graduation year to {contact_name}")
            high_school["graduation_year"] = graduation_year
        elif graduation_year != high_school["graduation_year"]:
            LOG.warn(f"{contact_name} mismatched high school graduation year")


def _validate_tags(contact: Object, should_fix: bool) -> None:
    tags = contact.get("tags")
    if not tags:
        return None

    for pattern in _PATTERN_TO_EXPECTED_TAG_MAP:
        if _any_tag_matches_pattern(tags, pattern):
            _expect_tag(contact, _PATTERN_TO_EXPECTED_TAG_MAP[pattern], should_fix)


def _expect_tag(contact: Object, tag: str, should_fix: bool) -> None:
    tags = contact.get("tags")
    if tags is not None and tag in tags:
        return

    LOG.info(f"Adding {tag} tag to {contact_utils.build_name_str(contact)}")

    if should_fix:
        contact["tags"] = sorted(set((tags or []) + [tag]))


def _any_tag_matches_pattern(
    tags: list[str], pattern: re.Pattern
) -> str | Literal[False]:
    for tag in tags:
        if pattern.match(tag):
            return tag
    return False
