"""Read-only query logic backing the HTTP API."""

from __future__ import annotations

import collections

from contacts import model
from contacts.dao import disk_dao
from contacts.utils import contact_utils

_contacts_cache: list[model.DiskContact] | None = None


def list_contacts() -> list[model.DiskContact]:
    """List all contacts, reading from disk only on the first call.

    Subsequent calls are served from an in-memory cache until
    invalidate_contacts_cache() is called.

    Returns:
        All contacts.
    """
    global _contacts_cache
    if _contacts_cache is None:
        _contacts_cache = disk_dao.read_contacts()
    return _contacts_cache


def invalidate_contacts_cache() -> None:
    """Clear the cached contacts so the next list_contacts() re-reads from disk."""
    global _contacts_cache
    _contacts_cache = None


def get_contact(contact_id: int) -> model.DiskContact | None:
    """Get a single contact by id.

    Args:
        contact_id: The id of the contact.

    Returns:
        The contact, or None if no contact with that id exists.
    """
    contacts_by_id = {contact.id: contact for contact in disk_dao.read_contacts()}
    return contacts_by_id.get(contact_id)


def list_tags() -> list[dict]:
    """List all tags along with how many contacts have each one.

    Returns:
        A list of {"tag": str, "count": int} dicts, sorted by tag name.
    """
    contacts = list_contacts()
    tag_counts: collections.Counter[str] = collections.Counter()
    for contact in contacts:
        tag_counts.update(contact.tags or [])

    return [
        {"tag": tag, "count": tag_counts[tag]}
        for tag in contact_utils.extract_tags(contacts)
    ]
