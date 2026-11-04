"""Generic object CRUD, validated against each type's schema.

Every type goes through here, including contacts -- there is no
contact-specific code in this module. The special-cased types only differ in
the extra checks named in `_validate_for_type`.
"""

from __future__ import annotations

import time

from contacts.dao import disk_dao
from contacts.model import schema
from contacts.model.schema import Schema
from contacts.server import association_service, errors, schema_service
from contacts.utils import object_utils
from contacts.utils.object_utils import Object

# Set from the columns, never from a request body.
_SERVER_FIELDS = ("id", "ctime", "mtime")

_cache: dict[str, list[Object]] = {}


def invalidate_cache(object_type: str | None = None) -> None:
    """Drop cached objects so the next read goes back to disk.

    Args:
        object_type: The type to drop, or None to drop every type.
    """
    if object_type is None:
        _cache.clear()
    else:
        _cache.pop(object_type, None)


def list_objects(object_type: str) -> list[Object]:
    """List every object of a type, reading from disk only once per type.

    Args:
        object_type: The type to list.

    Returns:
        The objects, ordered by id.

    Raises:
        errors.NotFoundError: If no such type exists.
    """
    schema_service.get_schema(object_type)

    if object_type not in _cache:
        _cache[object_type] = disk_dao.read_objects(object_type)

    return _cache[object_type]


def get_object(object_type: str, object_id: int) -> Object | None:
    """Get one object.

    Args:
        object_type: The object's type.
        object_id: The object's id within its type.

    Returns:
        The object, or None if it doesn't exist.

    Raises:
        errors.NotFoundError: If no such type exists.
    """
    schema_service.get_schema(object_type)
    return disk_dao.read_object(object_type, object_id)


def require_object(object_type: str, object_id: int) -> Object:
    """Get one object, failing if it isn't there.

    Args:
        object_type: The object's type.
        object_id: The object's id within its type.

    Returns:
        The object.

    Raises:
        errors.NotFoundError: If the type or the object doesn't exist.
    """
    found = get_object(object_type, object_id)
    if found is None:
        raise errors.NotFoundError(f"{object_type} {object_id} not found")
    return found


def _validate_references(object_schema: Schema, data: Object) -> None:
    """Checks that every reference field points at an object that exists.

    Structural validation lives in the model layer, which has no database
    access, so existence is checked here instead.
    """
    for field in object_schema.fields:
        if field.type != "reference" or field.ref_type is None:
            continue

        value = data.get(field.key)
        if value is None:
            continue

        referenced_ids = value if field.many else [value]
        for referenced_id in referenced_ids:
            if disk_dao.read_object(field.ref_type, referenced_id) is None:
                raise errors.ValidationError(
                    f"{field.key} refers to {field.ref_type} {referenced_id}, "
                    "which does not exist"
                )


def _reject_schema_type(object_type: str) -> None:
    """Points a write to `type='schema'` at the dedicated schema endpoints.

    There is no schema row named "schema" to resolve (see model/schema.py),
    so this has to run before `schema_service.get_schema` -- otherwise the
    redirect below would be shadowed by a bare "unknown type" 404.
    """
    if object_type == schema.TYPE_SCHEMA:
        raise errors.ValidationError(
            "Schemas are managed through /api/schemas, not /api/objects/schema"
        )


def _validate_for_type(object_type: str, data: Object) -> None:
    """Applies the extra checks the special-cased types need."""
    if object_type == schema.TYPE_ASSOCIATION:
        association_service.validate(data)

    if object_type == schema.TYPE_LIST:
        member_type = data.get("member_type", schema.TYPE_CONTACT)
        # "schema" is deliberately absent from `type_names()` (see
        # model/schema.py), but schema rows are still ordinary rows a list
        # can hold members of -- allow it as a special case.
        if member_type != schema.TYPE_SCHEMA and member_type not in schema_service.type_names():
            raise errors.ValidationError(
                f"member_type refers to unknown object type {member_type!r}"
            )


def _prepare(object_schema: Schema, object_type: str, data: Object) -> Object:
    """Strips what clients may not set, then applies the schema to the rest."""
    prepared = {key: value for key, value in data.items() if key not in _SERVER_FIELDS}
    prepared = schema.strip_managed(object_schema, prepared)
    prepared = schema.apply_defaults(object_schema, prepared)
    prepared = schema.normalize_object(object_schema, prepared)
    prepared = object_utils.prune_none(prepared)

    try:
        schema.validate_object(object_schema, prepared)
    except schema.SchemaValidationError as e:
        raise errors.ValidationError(f"Invalid {object_type} data: {e}") from e

    _validate_references(object_schema, prepared)
    _validate_for_type(object_type, prepared)

    return prepared


def create_object(object_type: str, data: Object) -> Object:
    """Create an object of a type.

    Args:
        object_type: The type to create.
        data: The object's fields. Server-owned and managed fields are
            ignored rather than rejected.

    Returns:
        The created object, with its assigned id and timestamps.

    Raises:
        errors.NotFoundError: If no such type exists.
        errors.ValidationError: If the data doesn't match the type's schema.
    """
    _reject_schema_type(object_type)
    object_schema = schema_service.get_schema(object_type)
    prepared = _prepare(object_schema, object_type, data)

    [created] = disk_dao.create_objects(object_type, [prepared])
    invalidate_cache(object_type)

    return created


def update_object(object_type: str, object_id: int, data: Object) -> Object:
    """Replace an object's fields, keeping its id, ctime and managed fields.

    Args:
        object_type: The object's type.
        object_id: The object's id within its type.
        data: The object's new fields.

    Returns:
        The updated object.

    Raises:
        errors.NotFoundError: If the type or the object doesn't exist.
        errors.ValidationError: If the data doesn't match the type's schema.
    """
    _reject_schema_type(object_type)
    object_schema = schema_service.get_schema(object_type)
    existing = require_object(object_type, object_id)

    prepared = _prepare(object_schema, object_type, data)

    # Managed fields are the server's, so they survive a client's write.
    for field in object_schema.fields:
        if field.managed and existing.get(field.key) is not None:
            prepared[field.key] = existing[field.key]

    updated = {
        **prepared,
        "id": object_id,
        "ctime": existing.get("ctime"),
        "mtime": time.time(),
    }
    disk_dao.update_objects(object_type, [updated])
    invalidate_cache(object_type)

    return updated


def update_objects(object_type: str, updates: list[Object]) -> list[Object]:
    """Replace several objects' fields in one write, each keeping its id, ctime
    and managed fields.

    All-or-nothing: every id must already exist, or nothing is written.

    Args:
        object_type: The objects' type.
        updates: Each object's new fields, including its existing "id".

    Returns:
        The updated objects, in the order given by updates.

    Raises:
        errors.NotFoundError: If the type, or any of the ids, don't exist.
        errors.ValidationError: If any update doesn't match the type's schema.
    """
    _reject_schema_type(object_type)
    object_schema = schema_service.get_schema(object_type)

    existing_by_id = {
        update["id"]: require_object(object_type, update["id"]) for update in updates
    }

    updated_objects = []
    for update in updates:
        existing = existing_by_id[update["id"]]
        prepared = _prepare(object_schema, object_type, update)

        for field in object_schema.fields:
            if field.managed and existing.get(field.key) is not None:
                prepared[field.key] = existing[field.key]

        updated_objects.append(
            {
                **prepared,
                "id": update["id"],
                "ctime": existing.get("ctime"),
                "mtime": time.time(),
            }
        )

    disk_dao.update_objects(object_type, updated_objects)
    invalidate_cache(object_type)

    return updated_objects


def write_objects(object_type: str, objects: list[Object]) -> None:
    """Write already-validated objects straight through, bumping nothing.

    For internal callers that have built whole objects themselves, such as the
    iCloud sync path.

    Args:
        object_type: The objects' type.
        objects: The objects to write.
    """
    disk_dao.update_objects(object_type, objects)
    invalidate_cache(object_type)


def delete_object(object_type: str, object_id: int) -> int:
    """Delete an object, along with every association touching it.

    Args:
        object_type: The object's type.
        object_id: The object's id within its type.

    Returns:
        How many associations were deleted with it.

    Raises:
        errors.NotFoundError: If the type or the object doesn't exist.
    """
    require_object(object_type, object_id)

    deleted_associations = association_service.delete_for(object_type, object_id)

    disk_dao.delete_objects(object_type, [object_id])
    invalidate_cache(object_type)
    if deleted_associations:
        invalidate_cache(schema.TYPE_ASSOCIATION)

    return deleted_associations
