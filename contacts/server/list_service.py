"""Lists: a named set of objects, optionally kept in step with a SQL query.

Membership is held in associations, not on the list itself. A list with a
`query` can be refreshed, which re-runs the query and reconciles the
association rows to match; a list without one is maintained by hand.
"""

from __future__ import annotations

import sqlite3
import time

from contacts.dao import disk_dao
from contacts.logger import LOG
from contacts.model import schema
from contacts.server import association_service, errors, object_service
from contacts.utils.object_utils import Object


def _member_type(a_list: Object) -> str:
    return a_list.get("member_type", schema.TYPE_CONTACT)


def _require_member(member_type: str, member_id: int) -> None:
    """Checks a prospective member exists, for whichever `member_type`.

    `object_service.require_object` resolves the type through
    `schema_service.get_schema`, which 404s for `"schema"` by design (see
    model/schema.py) -- schema rows still exist in storage, so check for them
    directly instead, the same way `members()` below reads them back.
    """
    if member_type == schema.TYPE_SCHEMA:
        if disk_dao.read_object(member_type, member_id) is None:
            raise errors.NotFoundError(f"{member_type} {member_id} not found")
        return
    object_service.require_object(member_type, member_id)


def run_query(query: str) -> list[int]:
    """Run a list's `query` and return the object ids it matches.

    Args:
        query: A SQL statement whose first result column is an object id.

    Returns:
        The matching ids, in the order returned by the query.

    Raises:
        errors.ValidationError: If the query is invalid, or its first column
            isn't an object id.
    """
    try:
        rows = disk_dao.run_readonly_query(query)
    except sqlite3.Error as e:
        raise errors.ValidationError(f"Invalid list query: {e}") from e

    try:
        return [int(row[0]) for row in rows]
    except (IndexError, TypeError, ValueError) as e:
        raise errors.ValidationError(
            f"List query must return an object id as its first column: {e}"
        ) from e


def member_ids(list_id: int) -> list[int]:
    """List the ids of a list's members.

    Args:
        list_id: The list's id.

    Returns:
        The member object ids.

    Raises:
        errors.NotFoundError: If the list doesn't exist.
    """
    a_list = object_service.require_object(schema.TYPE_LIST, list_id)

    return association_service.member_ids_of(
        schema.TYPE_LIST, list_id, _member_type(a_list)
    )


def all_member_ids() -> dict[int, list[int]]:
    """List every list's membership in one pass.

    The nav needs a count for every list at once. Reads straight from
    `disk_dao` instead of going through `object_service.list_objects` for
    associations -- that would materialize every association as a full
    object just to look at three fields, and the association table is the
    largest in the app (one row per list member).

    Returns:
        A mapping of list id to its member ids.
    """
    lists = {
        a_list["id"]: _member_type(a_list)
        for a_list in object_service.list_objects(schema.TYPE_LIST)
    }
    members_by_list: dict[int, list[int]] = {list_id: [] for list_id in lists}

    # Only side 1 is ever the container (see `_reconcile`), and the query
    # already filters to side-1-is-a-list -- checking side 2 as well would
    # also count a list as its own member whenever it's instead a *member*
    # of another list of the same member_type.
    for container_id, member_type, member_id in disk_dao.read_association_sides_2(
        schema.TYPE_LIST
    ):
        if container_id not in lists:
            continue
        if member_type == lists[container_id]:
            members_by_list[container_id].append(member_id)

    return members_by_list


def members(list_id: int) -> list[Object]:
    """List a list's member objects.

    Args:
        list_id: The list's id.

    Returns:
        The member objects, in membership order. Members that no longer exist
        are skipped.

    Raises:
        errors.NotFoundError: If the list doesn't exist.
    """
    a_list = object_service.require_object(schema.TYPE_LIST, list_id)
    member_type = _member_type(a_list)

    found = []
    for member_id in association_service.member_ids_of(
        schema.TYPE_LIST, list_id, member_type
    ):
        member = disk_dao.read_object(member_type, member_id)
        if member is not None:
            found.append(member)

    return found


def _reconcile(a_list: Object, wanted_ids: list[int]) -> bool:
    """Makes the list's associations match `wanted_ids`.

    Returns:
        True if membership changed.
    """
    list_id = a_list["id"]
    member_type = _member_type(a_list)

    current_ids = association_service.member_ids_of(
        schema.TYPE_LIST, list_id, member_type
    )

    to_add = [
        member_id for member_id in wanted_ids if member_id not in set(current_ids)
    ]
    stale = set(current_ids) - set(wanted_ids)

    if not to_add and not stale:
        return False

    if to_add:
        disk_dao.create_objects(
            schema.TYPE_ASSOCIATION,
            [
                {
                    "object_type_1": schema.TYPE_LIST,
                    "object_id_1": list_id,
                    "object_type_2": member_type,
                    "object_id_2": member_id,
                }
                for member_id in to_add
            ],
        )

    if stale:
        # Only side 1 is ever the container -- otherwise, if member_type is
        # also "list", an association where this list is instead the
        # *member* side of some other list could be matched and deleted here.
        stale_pairs = {(member_type, member_id) for member_id in stale}
        stale_association_ids = [
            association["id"]
            for association in association_service.list_for(schema.TYPE_LIST, list_id)
            if association_service.side(association, 1) == (schema.TYPE_LIST, list_id)
            and association_service.side(association, 2) in stale_pairs
        ]
        disk_dao.delete_objects(schema.TYPE_ASSOCIATION, stale_association_ids)

    object_service.invalidate_cache(schema.TYPE_ASSOCIATION)

    LOG.info(f"List {a_list.get('name')}: +{len(to_add)} -{len(stale)} members")

    return True


def refresh_list(list_id: int) -> Object:
    """Re-run a list's query and reconcile its membership.

    The list's `mtime` is only bumped when membership actually changed, so a
    periodic refresh doesn't churn timestamps.

    Args:
        list_id: The list's id.

    Returns:
        The list.

    Raises:
        errors.NotFoundError: If the list doesn't exist.
        errors.ValidationError: If the list's query is invalid.
    """
    a_list = object_service.require_object(schema.TYPE_LIST, list_id)

    query = a_list.get("query")
    if not query:
        return a_list

    if _reconcile(a_list, run_query(query)):
        a_list["mtime"] = time.time()
        object_service.write_objects(schema.TYPE_LIST, [a_list])

    return a_list


def refresh_lists() -> list[Object]:
    """Re-run every list's query and reconcile membership.

    Returns:
        Every list, refreshed.

    Raises:
        errors.ValidationError: If any list's query is invalid.
    """
    return [
        refresh_list(a_list["id"])
        for a_list in object_service.list_objects(schema.TYPE_LIST)
    ]


def add_members(list_id: int, member_ids_to_add: list[int]) -> list[int]:
    """Add members to a list, ignoring any that are already members.

    Args:
        list_id: The list's id.
        member_ids_to_add: The ids of the objects to add.

    Returns:
        The list's member ids after the change.

    Raises:
        errors.NotFoundError: If the list doesn't exist.
        errors.ValidationError: If any id names an object that doesn't exist.
    """
    a_list = object_service.require_object(schema.TYPE_LIST, list_id)
    member_type = _member_type(a_list)

    for member_id in member_ids_to_add:
        _require_member(member_type, member_id)

    current = association_service.member_ids_of(schema.TYPE_LIST, list_id, member_type)
    _reconcile(
        a_list,
        current + [i for i in member_ids_to_add if i not in set(current)],
    )

    return member_ids(list_id)


def remove_members(list_id: int, member_ids_to_remove: list[int]) -> list[int]:
    """Remove members from a list, ignoring any that aren't members.

    Args:
        list_id: The list's id.
        member_ids_to_remove: The ids of the objects to remove.

    Returns:
        The list's member ids after the change.

    Raises:
        errors.NotFoundError: If the list doesn't exist.
    """
    a_list = object_service.require_object(schema.TYPE_LIST, list_id)
    member_type = _member_type(a_list)

    current = association_service.member_ids_of(schema.TYPE_LIST, list_id, member_type)
    removing = set(member_ids_to_remove)
    _reconcile(a_list, [i for i in current if i not in removing])

    return member_ids(list_id)
