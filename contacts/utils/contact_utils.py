"""Utilities for the contact model."""
from __future__ import annotations

import re
from collections.abc import Sequence

from contacts import model


def add_email_address_if_not_exists(
    contact: model.Contact, email_address: str, label: str
) -> None:
    """Add an email address to a contact if the contact does not have the email address.

    Args:
        contact: The contact to add the email address to.
        email_address: The email address to add to the contact.
        label: The label of the email address.
    """
    assert email_address.count("@") == 1
    new_email_address = model.EmailAddresss(address=email_address, label=label)

    if contact.email_addresses is None:
        contact.email_addresses = [new_email_address]
        return None

    for exisiting_email_address in contact.email_addresses:
        if exisiting_email_address.address == email_address:
            return None
    contact.email_addresses.append(new_email_address)


def add_phone_number_if_not_exists(
    contact: model.Contact, country_code: int, number: str, label: str
) -> None:
    """Add a phone number to a contact if the contact does not have the phone number.

    Args:
        contact: The contact to add the email address to.
        country_code: The country code of the phone number.
        number: The phone number without the country code.
        label: The label of the phone number.
    """
    assert re.match(r"^\d+$", number)
    new_phone_number = model.PhoneNumber(
        country_code=country_code, number=number, label=label
    )

    if contact.phone_numbers is None:
        contact.phone_numbers = [new_phone_number]
        return None

    for phone_number in contact.phone_numbers:
        if phone_number.country_code == country_code and phone_number.number == number:
            return None
    contact.phone_numbers.append(new_phone_number)


def build_name_str(contact: model.Contact) -> str:
    """Extract the name from a contact.

    Args:
        contact: A contact.

    Returns:
        The name of the contact.
    """
    name_parts = []
    if first_name := contact.name.first_name:
        name_parts.append(first_name)
    if last_name := contact.name.last_name:
        name_parts.append(last_name)
    return " ".join(name_parts)


def build_name_and_id_str(contact: model.Contact) -> str:
    """Extract the name and id from a contact.

    Args:
        contact: A contact.

    Returns:
        The name and id of the contact.
    """
    return f"{build_name_str(contact)} ({contact.id})"


def build_name_and_tags_str(contact: model.Contact) -> str:
    """Extract the name and tags from a contact.

    Args:
        contact: A contact.

    Returns:
        The name and tags of the contact.
    """
    return f"{build_name_str(contact)} -- {contact.tags}"


def search_contacts(
    contacts: Sequence[model.Contact], query: str
) -> list[model.Contact]:
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
            if (
                first_name in f"{contact.name.first_name}".lower()
                or first_name in f"{contact.name.nickname}".lower()
            ) and last_name in f"{contact.name.last_name}".lower():
                matching_contacts.append(contact)
                continue

    for contact in contacts:
        contact_name = (
            f"{contact.name.first_name} "
            f"{contact.name.nickname} "
            f"{contact.name.middle_name} "
            f"{contact.name.last_name}"
        ).lower()
        if query in contact_name:
            matching_contacts.append(contact)
    return matching_contacts


def remove_unsynced_fields(contact: model.DiskContact) -> None:
    """Strips fields that exist locally but should never be pushed to iCloud.

    Mutates the contact in place; does not persist the change to disk.

    Args:
        contact: The contact to strip fields from.
    """
    try:
        del contact.name.deadname  # type: ignore
    except AttributeError:
        pass
    try:
        del contact.social_profiles.instagram.finsta_usernames  # type: ignore
    except AttributeError:
        pass


def normalize_push_diff(diff: dict) -> dict:
    """Strips disk-only bookkeeping fields that always show up as noise when
    diffing an iCloud contact against its disk counterpart.

    Args:
        diff: A diff of (icloud_contact, disk_contact) from dataclasses_utils.diff.

    Returns:
        The diff with disk-only fields (id, mtime) removed from any $insert.
    """
    if diff.get("$insert") is not None:
        del diff["$insert"]["id"]
        del diff["$insert"]["mtime"]
        if not diff["$insert"]:
            del diff["$insert"]
    return diff


def only_etag_updated(diff: dict) -> bool:
    """Returns True if a contact diff changes nothing but the iCloud etag.

    Args:
        diff: A diff of two contacts from dataclasses_utils.diff.

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
        icloud_update = icloud_diff["$update"]
        return set(icloud_update.keys()) == {"etag"}
    if set(icloud_diff.keys()) == {"$insert"}:
        icloud_insert = icloud_diff["$insert"]
        return set(icloud_insert.keys()) == {"etag"}
    return False


def extract_tags(contacts: Sequence[model.Contact]) -> list[str]:
    """Extract all tags from the contacts.

    Args:
        contacts: The contacts.

    Returns:
        A list of all the tags the contacts have.
    """
    return list(
        sorted(set(tag for contact in contacts for tag in (contact.tags or [])))
    )
