"""Utilities for plain-dict objects.

Objects are stored as JSON blobs and handled as plain dicts rather than
dataclasses, so these replace what `dataclasses_utils.DataClassJsonMixin`
provided for the old typed models: sparse serialization, recursive merging,
and diffing.
"""
from __future__ import annotations

import copy
from typing import Any

import jsondiff

# A stored object's `data`, i.e. its fields without the id/ctime/mtime columns.
Object = dict[str, Any]


def prune_none(value: Any) -> Any:
    """Recursively drop keys whose value is None.

    Mirrors the old `exclude=_is_none` serialization config, which is what
    keeps stored blobs sparse -- an absent field is absent from the JSON
    rather than present as null.

    Args:
        value: Any JSON-compatible value.

    Returns:
        The value with None-valued dict keys removed. Empty dicts and lists
        are preserved; only None itself is dropped.
    """
    if isinstance(value, dict):
        return {k: prune_none(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [prune_none(item) for item in value]
    return value


def deep_merge(base: Object, patch: Object) -> Object:
    """Recursively merge `patch` into `base`, ignoring None patch values.

    Replaces `DataClassJsonMixin.patch`. Nested dicts are merged key by key;
    every other value, lists included, is overwritten wholesale.

    Args:
        base: The object to merge into. Not mutated.
        patch: The object whose non-None values take precedence.

    Returns:
        A new merged object.
    """
    merged = copy.deepcopy(base)

    for key, patch_value in patch.items():
        if patch_value is None:
            continue

        base_value = merged.get(key)
        if isinstance(base_value, dict) and isinstance(patch_value, dict):
            merged[key] = deep_merge(base_value, patch_value)
        else:
            merged[key] = copy.deepcopy(patch_value)

    return merged


def diff(object_1: Object, object_2: Object) -> dict:
    """Diff two objects.

    Uses the same options as the old `dataclasses_utils.diff`, so the result
    keeps the explicit `$insert`/`$update`/`$delete` markers that
    `contact_utils.only_etag_updated` and `normalize_push_diff` match on.

    Args:
        object_1: The object to diff from.
        object_2: The object to diff to.

    Returns:
        The diff, with explicit change markers.
    """
    return jsondiff.diff(object_1, object_2, marshal=True, syntax="explicit")


def get_path(obj: Object, path: str, default: Any = None) -> Any:
    """Read a dotted path out of a nested object.

    Args:
        obj: The object to read from.
        path: A dotted field path, e.g. "name.first_name".
        default: The value to return if any segment is missing.

    Returns:
        The value at `path`, or `default` if it isn't present.
    """
    current: Any = obj

    for segment in path.split("."):
        if not isinstance(current, dict) or segment not in current:
            return default
        current = current[segment]

    return current if current is not None else default


def set_path(obj: Object, path: str, value: Any) -> None:
    """Write a dotted path into a nested object, creating intermediate dicts.

    Mutates `obj` in place.

    Args:
        obj: The object to write into.
        path: A dotted field path, e.g. "name.first_name".
        value: The value to set.
    """
    segments = path.split(".")
    current = obj

    for segment in segments[:-1]:
        existing = current.get(segment)
        if not isinstance(existing, dict):
            existing = {}
            current[segment] = existing
        current = existing

    current[segments[-1]] = value


def pop_path(obj: Object, path: str) -> Any:
    """Remove a dotted path from a nested object.

    Args:
        obj: The object to remove from. Mutated in place.
        path: A dotted field path, e.g. "name.deadname".

    Returns:
        The removed value, or None if the path wasn't present.
    """
    segments = path.split(".")
    current: Any = obj

    for segment in segments[:-1]:
        if not isinstance(current, dict) or segment not in current:
            return None
        current = current[segment]

    if not isinstance(current, dict):
        return None
    return current.pop(segments[-1], None)
