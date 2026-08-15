"""Tests for contacts.utils.json_utils."""
from __future__ import annotations

from contacts.utils import json_utils


def test_delegate_to_json_dumps() -> None:
    assert json_utils.dumps_indented({"key": "value"}) == '{\n  "key": "value"\n}'
