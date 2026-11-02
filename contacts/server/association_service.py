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

    Direction-agnostic: it matches `related_type` on whichever side isn't
    the given object, which is the right behavior for a peer-to-peer link
    (e.g. two contacts associated with each other) where neither side is
    "the container". Containment -- where one side always plays that role,
    as with list membership -- needs `member_ids_of` instead; using this
    for that would conflate "an object this container belongs to" with "a
    member this container holds" whenever `object_type == related_type`.

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


def member_ids_of(
    container_type: str, container_id: int, member_type: str
) -> list[int]:
    """List a container's member ids -- the side-2 end of every association
    where side 1 is `(container_type, container_id)`.

    Unlike `related_ids`, this only follows associations in the direction
    they were created in (a container's membership association always has
    the container on side 1 and the member on side 2 -- see
    `list_service._reconcile`). That distinction only matters when
    `container_type == member_type` (e.g. a list whose members are
    themselves lists): `related_ids`'s "whichever side isn't me" lookup
    can't otherwise tell "a container this object belongs to" apart from "a
    member this container holds".

    Args:
        container_type: The container's type.
        container_id: The container's id.
        member_type: The type of member to collect.

    Returns:
        The member ids, in association order.
    """
    ids = []

    for association in list_for(container_type, container_id):
        if side(association, 1) != (container_type, container_id):
            continue
        member_side_type, member_id = side(association, 2)
        if member_side_type == member_type:
            ids.append(member_id)

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
