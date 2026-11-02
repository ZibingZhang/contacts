"""The schema registry.

Schemas are stored as objects of type "schema", but this module reaches the
database directly rather than going through `object_service` -- the latter
needs a schema to validate anything, so the registry has to sit underneath it.
"""

from __future__ import annotations

import time

from contacts.dao import disk_dao
from contacts.model import builtin_schemas, schema
from contacts.model.schema import Field, Schema
from contacts.server import errors
from contacts.utils import object_utils
from contacts.utils.object_utils import Object

_schemas_cache: dict[str, Object] | None = None


def invalidate_cache() -> None:
    """Clear the cached schemas so the next read goes back to disk."""
    global _schemas_cache
    _schemas_cache = None


def _schemas_by_name() -> dict[str, Object]:
    global _schemas_cache
    if _schemas_cache is None:
        _schemas_cache = {
            obj["name"]: obj for obj in disk_dao.read_objects(schema.TYPE_SCHEMA)
        }
    return _schemas_cache


def list_schemas() -> list[Object]:
    """List every schema.

    Returns:
        The schema objects, ordered by name, each with resolved option
        labels on its "select" fields.
    """
    return [
        _with_resolved_options(obj)
        for obj in sorted(_schemas_by_name().values(), key=lambda obj: obj["name"])
    ]


def find_schema(name: str) -> Schema | None:
    """Look a schema up by type name.

    Args:
        name: The type name, e.g. "contact".

    Returns:
        The parsed schema, or None if no such type exists.
    """
    stored = _schemas_by_name().get(name)
    if stored is None:
        return None

    return schema.validate_schema(_without_columns(stored))


def get_schema(name: str) -> Schema:
    """Look a schema up by type name.

    Args:
        name: The type name, e.g. "contact".

    Returns:
        The parsed schema.

    Raises:
        errors.NotFoundError: If no such type exists.
    """
    found = find_schema(name)
    if found is None:
        raise errors.NotFoundError(f"Unknown object type {name!r}")
    return found


def get_schema_object(name: str) -> Object:
    """Get a schema in its stored form, for the API to return.

    Args:
        name: The type name, e.g. "contact".

    Returns:
        The schema object, including its id and timestamps, with resolved
        option labels on its "select" fields.

    Raises:
        errors.NotFoundError: If no such type exists.
    """
    stored = _schemas_by_name().get(name)
    if stored is None:
        raise errors.NotFoundError(f"Unknown object type {name!r}")
    return _with_resolved_options(stored)


def type_names() -> set[str]:
    """List every known type name.

    Returns:
        The names of all registered types.
    """
    return set(_schemas_by_name())


def _without_columns(stored: Object) -> Object:
    return {
        key: value
        for key, value in stored.items()
        if key not in ("id", "ctime", "mtime")
    }


def _field_with_resolved_options(field: Field) -> Object:
    data = field.to_dict()
    if field.type == "select":
        data["resolved_options"] = field.option_pairs()
    if field.fields is not None:
        data["fields"] = [
            _field_with_resolved_options(nested) for nested in field.fields
        ]
    return data


def _with_resolved_options(stored: Object) -> Object:
    """Adds a `resolved_options` labeled-pairs list to every "select" field.

    Computed at serve time rather than stored, so it can't go stale if an
    `options_from` source (e.g. a country code) ever changes.
    """
    parsed = schema.validate_schema(_without_columns(stored))
    return {
        **stored,
        "fields": [_field_with_resolved_options(field) for field in parsed.fields],
    }


def _validate(data: Object) -> Schema:
    try:
        return schema.validate_schema(data)
    except schema.SchemaError as e:
        raise errors.ValidationError(f"Invalid schema: {e}") from e


def create_schema(data: Object) -> Object:
    """Create a new object type.

    Args:
        data: The schema's fields. `builtin` is forced off -- only the app
            defines built-in types.

    Returns:
        The created schema object.

    Raises:
        errors.ValidationError: If the schema is malformed or its name is
            already taken.
    """
    data = {**data, "builtin": False}
    parsed = _validate(data)

    if parsed.name in _schemas_by_name():
        raise errors.ValidationError(f"Type {parsed.name!r} already exists")

    [created] = disk_dao.create_objects(
        schema.TYPE_SCHEMA, [object_utils.prune_none(parsed.to_dict())]
    )
    invalidate_cache()

    # Give the new type its own view, so its objects read like their own table.
    disk_dao.sync_views()

    return _with_resolved_options(created)


def update_schema(name: str, data: Object) -> Object:
    """Replace an existing object type's definition.

    Renaming a type moves its view but leaves its objects' `type` untouched,
    so a rename is not supported.

    Args:
        name: The type name to update.
        data: The schema's new fields.

    Returns:
        The updated schema object.

    Raises:
        errors.NotFoundError: If no such type exists.
        errors.ValidationError: If the schema is malformed, renames the type,
            or edits a built-in.
    """
    existing = get_schema_object(name)

    if existing.get("builtin"):
        raise errors.ValidationError(f"Type {name!r} is built in and cannot be edited")

    data = {**data, "builtin": False}
    parsed = _validate(data)

    if parsed.name != name:
        raise errors.ValidationError(
            f"Cannot rename type {name!r} to {parsed.name!r}; "
            "create the new type and move its objects instead"
        )

    updated = {
        **object_utils.prune_none(parsed.to_dict()),
        "id": existing["id"],
        "ctime": existing.get("ctime"),
        "mtime": time.time(),
    }
    disk_dao.update_objects(schema.TYPE_SCHEMA, [updated])
    invalidate_cache()

    return _with_resolved_options(updated)


def delete_schema(name: str) -> None:
    """Delete an object type, which must have no objects left.

    Args:
        name: The type name to delete.

    Raises:
        errors.NotFoundError: If no such type exists.
        errors.ValidationError: If the type is built in or still has objects.
    """
    existing = get_schema_object(name)

    if existing.get("builtin"):
        raise errors.ValidationError(f"Type {name!r} is built in and cannot be deleted")

    remaining = disk_dao.read_objects(name)
    if remaining:
        raise errors.ValidationError(
            f"Type {name!r} still has {len(remaining)} object(s); " "delete them first"
        )

    disk_dao.drop_view(name)
    disk_dao.delete_objects(schema.TYPE_SCHEMA, [existing["id"]])
    invalidate_cache()


def is_builtin(name: str) -> bool:
    """Whether a type is one the app owns.

    Args:
        name: The type name.

    Returns:
        True if the type is built in.
    """
    return name in builtin_schemas.BUILT_IN_SCHEMAS
