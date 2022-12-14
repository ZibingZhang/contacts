"""Utilities for YAML formatted data."""
from __future__ import annotations

from typing import Any

import yaml

from contacts.utils import dataclasses_utils

INDENT_SIZE = 4
INDENT = " " * INDENT_SIZE


def load(obj: str) -> Any:
    """Load YAML formatted data as a Python object.

    Args:
        obj: YAML formatted data.

    Returns:
        A Python object representation of the data.
    """
    return yaml.load(obj, Loader=yaml.Loader)


def dump(obj: dataclasses_utils.DataClassJsonMixin) -> str:
    """Convert a dataclass into YAML formatted data.

    Args:
        obj: A dataclass.

    Returns:
        YAML formatted representation of the data.
    """
    return yaml.dump(_remove_none(obj.to_dict()), allow_unicode=True, indent=4)


def _remove_none(dct: Any) -> dict:
    if issubclass(dct.__class__, dict):
        return {k: _remove_none(v) for k, v in dct.items() if v is not None}
    return dct
