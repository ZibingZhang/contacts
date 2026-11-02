"""Utilities for contact objects.

Contacts are plain dicts shaped by the contact schema, so these read and write
them by key rather than by attribute.
"""
from __future__ import annotations

import re
from collections.abc import Sequence

from contacts.utils import object_utils
from contacts.utils.object_utils import Object

# Fields that exist locally but are never pushed to iCloud.
_UNSYNCED_PATHS = (
    "name.deadname",
    "name.maiden_name",
    "social_profiles.instagram.finsta_usernames",
)

_EDUCATION_UNIVERSITY_LEVELS = ("bachelor", "master", "law", "medical", "phd")


def add_email_address_if_not_exists(
    contact: Object, email_address: str, label: str
) -> None:
    """Add an email address to a contact if the contact does not have the email address.

    Args:
        contact: The contact to add the email address to.
        email_address: The email address to add to the contact.
        label: The label of the email address.
    """
    assert email_address.count("@") == 1
    existing = contact.get("email_addresses")

    if existing is None:
        contact["email_addresses"] = [{"address": email_address, "label": label}]
        return

    for existing_email_address in existing:
        if existing_email_address.get("address") == email_address:
            return

    existing.append({"address": email_address, "label": label})


def add_phone_number_if_not_exists(
    contact: Object, country_code: int, number: str, label: str
) -> None:
    """Add a phone number to a contact if the contact does not have the phone number.

    Args:
        contact: The contact to add the phone number to.
        country_code: The country code of the phone number.
        number: The phone number without the country code.
        label: The label of the phone number.
    """
    assert re.match(r"^\d+$", number)
    new_phone_number = {
        "number": number,
        "country_code": country_code,
        "label": label,
    }
    existing = contact.get("phone_numbers")

    if existing is None:
        contact["phone_numbers"] = [new_phone_number]
        return

    for phone_number in existing:
        if (
            phone_number.get("country_code") == country_code
            and phone_number.get("number") == number
        ):
            return

    existing.append(new_phone_number)


def build_name_str(contact: Object) -> str:
    """Extract the name from a contact.

    Args:
        contact: A contact.

    Returns:
        The name of the contact.
    """
    name = contact.get("name") or {}

    name_parts = []
    if first_name := name.get("first_name"):
        name_parts.append(first_name)
    if last_name := name.get("last_name"):
        name_parts.append(last_name)

    return " ".join(name_parts)


def build_name_and_id_str(contact: Object) -> str:
    """Extract the name and id from a contact.

    Args:
        contact: A contact.

    Returns:
        The name and id of the contact.
    """
    return f"{build_name_str(contact)} ({contact.get('id')})"


def build_name_and_tags_str(contact: Object) -> str:
    """Extract the name and tags from a contact.

    Args:
        contact: A contact.

    Returns:
        The name and tags of the contact.
    """
    return f"{build_name_str(contact)} -- {contact.get('tags')}"


def search_contacts(contacts: Sequence[Object], query: str) -> list[Object]:
    """Find contacts whose name matches a free-text query.

    Args:
        contacts: The contacts to search.
        query: A free-text name query (case-insensitive substring match).

    Returns:
        The matching contacts.
    """
    query = " ".join(query.strip().split()).lower()
    matching_contacts = []

    if query.count(" ") == 1:
        first_name, last_name = query.split()
        for contact in contacts:
            name = contact.get("name") or {}
            if (
                first_name in f"{name.get('first_name')}".lower()
                or first_name in f"{name.get('nickname')}".lower()
            ) and last_name in f"{name.get('last_name')}".lower():
                matching_contacts.append(contact)
                continue

    for contact in contacts:
        name = contact.get("name") or {}
        contact_name = (
            f"{name.get('first_name')} "
            f"{name.get('nickname')} "
            f"{name.get('middle_name')} "
            f"{name.get('last_name')}"
        ).lower()
        if query in contact_name:
            matching_contacts.append(contact)

    return matching_contacts


def remove_unsynced_fields(contact: Object) -> None:
    """Strips fields that exist locally but should never be pushed to iCloud.

    Mutates the contact in place; does not persist the change to disk.

    Args:
        contact: The contact to strip fields from.
    """
    for path in _UNSYNCED_PATHS:
        object_utils.pop_path(contact, path)


def normalize_push_diff(diff: dict) -> dict:
    """Strips disk-only bookkeeping fields that always show up as noise when
    diffing an iCloud contact against its disk counterpart.

    Args:
        diff: A diff of (icloud_contact, disk_contact) from object_utils.diff.

    Returns:
        The diff with disk-only fields (id, ctime, mtime) removed from any
        $insert.
    """
    inserted = diff.get("$insert")
    if inserted is not None:
        for key in ("id", "ctime", "mtime"):
            inserted.pop(key, None)
        if not inserted:
            del diff["$insert"]

    return diff


def only_etag_updated(diff: dict) -> bool:
    """Returns True if a contact diff changes nothing but the iCloud etag.

    Args:
        diff: A diff of two contacts from object_utils.diff.

    Returns:
        True if the only change is to icloud.etag.
    """
    if set(diff.keys()) != {"$update"}:
        return False

    update = diff["$update"]
    if set(update.keys()) != {"icloud"}:
        return False

    icloud_diff = update["icloud"]
    if set(icloud_diff.keys()) == {"$update"}:
        return set(icloud_diff["$update"].keys()) == {"etag"}
    if set(icloud_diff.keys()) == {"$insert"}:
        return set(icloud_diff["$insert"].keys()) == {"etag"}

    return False


def extract_tags(contacts: Sequence[Object]) -> list[str]:
    """Extract all tags from the contacts.

    Args:
        contacts: The contacts.

    Returns:
        A list of all the tags the contacts have.
    """
    return sorted({tag for contact in contacts for tag in (contact.get("tags") or [])})


def extract_high_schools(contacts: Sequence[Object]) -> list[str]:
    """Extract all high school names from the contacts' education.

    Args:
        contacts: The contacts.

    Returns:
        A list of all the distinct high school names the contacts have.
    """
    return sorted(
        {
            name
            for contact in contacts
            if (name := object_utils.get_path(contact, "education.high_school.name"))
        }
    )


def extract_universities(contacts: Sequence[Object]) -> list[str]:
    """Extract all university names from the contacts' education.

    Args:
        contacts: The contacts.

    Returns:
        A list of all the distinct university names the contacts have.
    """
    return sorted(
        {
            name
            for contact in contacts
            for level in _EDUCATION_UNIVERSITY_LEVELS
            if (name := object_utils.get_path(contact, f"education.{level}.name"))
        }
    )
