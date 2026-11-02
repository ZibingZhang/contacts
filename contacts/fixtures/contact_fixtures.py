"""Test fixture for contacts."""
from __future__ import annotations

from contacts.utils import object_utils, uuid_utils
from contacts.utils.object_utils import Object


def build(**kwargs) -> Object:
    """Builds a contact object.

    Args:
        **kwargs: The contact fields.

    Returns:
        A contact, shaped by the contact schema.
    """
    if "name" not in kwargs:
        kwargs["name"] = {}
    if "icloud" not in kwargs:
        kwargs["icloud"] = {"uuid": uuid_utils.generate()}
    return object_utils.prune_none(kwargs)
