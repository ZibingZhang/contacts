"""Associations: the link between any two objects.

An association names both sides by type and id, which is how list membership
and cross-type references are expressed without either side knowing about the
other.
"""

from __future__ import annotations

from contacts.dao import disk_dao
from contacts.model import schema
from contacts.server import errors
from contacts.utils.object_utils import Object

_SIDES = (1, 2)


def side(association: Object, index: int) -> tuple[str, int]:
    """Read one side of an association.

    Args:
        association: The association.
        index: 1 or 2.

    Returns:
        The side's (type, id).
    """
    return (
        association[f"object_type_{index}"],
        association[f"object_id_{index}"],
    )


def other_side(
    association: Object, object_type: str, object_id: int
) -> tuple[str, int]:
    """Read whichever side of an association isn't the one given.

    Args:
        association: The association.
        object_type: The type of the side to look away from.
        object_id: The id of the side to look away from.

    Returns:
        The opposite side's (type, id). If both sides are the same object,
        that object is returned.
    """
    if side(association, 1) == (object_type, object_id):
        return side(association, 2)
    return side(association, 1)


def validate(data: Object) -> None:
    """Check that both sides of an association exist.

    Args:
        data: The association's fields.

    Raises:
        errors.ValidationError: If either side names an object that doesn't
            exist.
    """
    for index in _SIDES:
        object_type, object_id = side(data, index)

        if disk_dao.read_object(object_type, object_id) is None:
            raise errors.ValidationError(
                f"object_type_{index}/object_id_{index} refers to "
                f"{object_type} {object_id}, which does not exist"
            )


def find(
    object_type_1: str, object_id_1: int, object_type_2: str, object_id_2: int
) -> Object | None:
    """Find an existing association between two objects, in either direction.

    Args:
        object_type_1: The first side's type.
        object_id_1: The first side's id.
        object_type_2: The second side's type.
        object_id_2: The second side's id.

    Returns:
        The matching association, or None.
    """
    wanted = {(object_type_1, object_id_1), (object_type_2, object_id_2)}

    for association in disk_dao.read_associations_for(object_type_1, object_id_1):
        if {side(association, 1), side(association, 2)} == wanted:
            return association

    return None


def list_for(object_type: str, object_id: int) -> list[Object]:
    """List every association touching an object.

    Args:
        object_type: The object's type.
        object_id: The object's id.

    Returns:
        The matching associations, ordered by id.
    """
    return disk_dao.read_associations_for(object_type, object_id)


def related_ids(object_type: str, object_id: int, related_type: str) -> list[int]:
    """List the ids of one type of object associated with another object.

    Args:
        object_type: The object's type.
        object_id: The object's id.
        related_type: The type of related object to collect.

    Returns:
        The related objects' ids, in association order.
    """
    ids = []

    for association in list_for(object_type, object_id):
        other_type, other_id = other_side(association, object_type, object_id)
        if other_type == related_type:
            ids.append(other_id)

    return ids


def delete_for(object_type: str, object_id: int) -> int:
    """Delete every association touching an object.

    Used when the object itself is deleted, so no association is left dangling.

    Args:
        object_type: The object's type.
        object_id: The object's id.

    Returns:
        How many associations were deleted.
    """
    associations = list_for(object_type, object_id)
    if not associations:
        return 0

    disk_dao.delete_objects(
        schema.TYPE_ASSOCIATION, [association["id"] for association in associations]
    )

    return len(associations)
