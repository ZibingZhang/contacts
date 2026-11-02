"""Tests for contacts.utils.object_utils."""
from __future__ import annotations

from contacts.utils import object_utils


def test_prune_none_drops_none_valued_keys():
    pruned = object_utils.prune_none({"a": 1, "b": None})

    assert pruned == {"a": 1}


def test_prune_none_recurses_into_nested_dicts():
    pruned = object_utils.prune_none({"name": {"first": "Ada", "last": None}})

    assert pruned == {"name": {"first": "Ada"}}


def test_prune_none_recurses_into_dicts_inside_lists():
    pruned = object_utils.prune_none({"phones": [{"number": "1", "label": None}]})

    assert pruned == {"phones": [{"number": "1"}]}


def test_prune_none_preserves_empty_containers():
    pruned = object_utils.prune_none({"favorite": {}, "tags": []})

    assert pruned == {"favorite": {}, "tags": []}


def test_prune_none_preserves_false_and_zero():
    pruned = object_utils.prune_none({"sync": False, "count": 0})

    assert pruned == {"sync": False, "count": 0}


def test_deep_merge_adds_keys_missing_from_base():
    merged = object_utils.deep_merge({"a": 1}, {"b": 2})

    assert merged == {"a": 1, "b": 2}


def test_deep_merge_ignores_none_patch_values():
    merged = object_utils.deep_merge({"a": 1}, {"a": None})

    assert merged == {"a": 1}


def test_deep_merge_recurses_into_nested_dicts():
    merged = object_utils.deep_merge(
        {"name": {"first": "Ada", "last": "Lovelace"}}, {"name": {"first": "Augusta"}}
    )

    assert merged == {"name": {"first": "Augusta", "last": "Lovelace"}}


def test_deep_merge_overwrites_lists_wholesale():
    merged = object_utils.deep_merge({"tags": ["a", "b"]}, {"tags": ["c"]})

    assert merged == {"tags": ["c"]}


def test_deep_merge_does_not_mutate_base():
    base = {"name": {"first": "Ada"}}

    object_utils.deep_merge(base, {"name": {"first": "Augusta"}})

    assert base == {"name": {"first": "Ada"}}


def test_deep_merge_does_not_alias_patch_values_into_the_result():
    patch = {"tags": ["a"]}

    merged = object_utils.deep_merge({}, patch)
    merged["tags"].append("b")

    assert patch == {"tags": ["a"]}


def test_diff_marks_changed_values_with_an_explicit_update():
    diff = object_utils.diff({"a": 1}, {"a": 2})

    assert diff == {"$update": {"a": 2}}


def test_diff_of_identical_objects_is_empty():
    diff = object_utils.diff({"a": 1}, {"a": 1})

    assert diff == {}


def test_get_path_reads_a_nested_value():
    value = object_utils.get_path({"name": {"first_name": "Ada"}}, "name.first_name")

    assert value == "Ada"


def test_get_path_returns_the_default_for_a_missing_segment():
    value = object_utils.get_path({"name": {}}, "name.first_name", "unknown")

    assert value == "unknown"


def test_get_path_returns_the_default_when_a_segment_is_not_a_dict():
    value = object_utils.get_path({"name": "Ada"}, "name.first_name", "unknown")

    assert value == "unknown"


def test_set_path_creates_intermediate_dicts():
    obj: dict = {}

    object_utils.set_path(obj, "name.first_name", "Ada")

    assert obj == {"name": {"first_name": "Ada"}}


def test_set_path_replaces_a_non_dict_intermediate_value():
    obj: dict = {"name": "Ada"}

    object_utils.set_path(obj, "name.first_name", "Augusta")

    assert obj == {"name": {"first_name": "Augusta"}}


def test_pop_path_removes_and_returns_a_nested_value():
    obj = {"name": {"first_name": "Ada", "deadname": "X"}}

    popped = object_utils.pop_path(obj, "name.deadname")

    assert (popped, obj) == ("X", {"name": {"first_name": "Ada"}})


def test_pop_path_is_a_no_op_for_a_missing_path():
    obj = {"name": {}}

    popped = object_utils.pop_path(obj, "name.deadname")

    assert (popped, obj) == (None, {"name": {}})
