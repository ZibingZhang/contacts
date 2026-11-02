"""Utilities for dataclasses.

Only the iCloud wire models are dataclasses now -- objects are plain dicts,
handled by `object_utils`.
"""
from __future__ import annotations

from collections.abc import Callable
from typing import Any, TypeVar

import dataclasses_json

_TDataClassJsonMixin = TypeVar("_TDataClassJsonMixin", bound="DataClassJsonMixin")


def _is_none(obj) -> bool:
    return obj is None


class DataClassJsonMixin(dataclasses_json.DataClassJsonMixin):
    # https://github.com/lidatong/dataclasses-json/issues/187#issuecomment-919992503
    dataclass_json_config = dataclasses_json.config(  # type: ignore
        exclude=_is_none, undefined=dataclasses_json.Undefined.RAISE  # type: ignore
    )["dataclasses_json"]

    def to_json(
        self: _TDataClassJsonMixin,
        *,
        skipkeys: bool = False,
        ensure_ascii: bool = False,
        check_circular: bool = True,
        allow_nan: bool = True,
        indent: int | str | None = None,
        separators: tuple[str, str] | None = None,
        default: Callable[..., Any] | None = None,
        sort_keys: bool = False,
        **kw,
    ) -> str:
        return super().to_json(
            skipkeys=skipkeys,
            ensure_ascii=ensure_ascii,
            check_circular=check_circular,
            allow_nan=allow_nan,
            indent=indent,
            separators=separators,  # type: ignore
            default=default,  # type: ignore
            sort_keys=sort_keys,
            **kw,
        )

    def __repr__(self) -> str:
        dict_repr = ", ".join(
            f"{k}={v!r}"
            for k, v in filter(lambda item: item[1] is not None, self.__dict__.items())
        )
        return f"{self.__class__.__name__}({dict_repr})"
