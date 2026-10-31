"""A dataclass representation of the data stored in an iCloud contact notes field."""
from __future__ import annotations

import dataclasses

from contacts import model
from contacts.utils import dataclasses_utils, yaml_utils


@dataclasses.dataclass(repr=False)
class School(dataclasses_utils.DataClassJsonMixin):
    name: str
    grad_year: int | None = None
    majors: str | None = None
    minors: str | None = None


@dataclasses.dataclass(repr=False)
class Education(dataclasses_utils.DataClassJsonMixin):
    bachelor: School | None = None
    high_school: School | None = None
    law: School | None = None
    master: School | None = None
    medical: School | None = None
    phd: School | None = None


@dataclasses.dataclass(repr=False)
class Favorites(dataclasses_utils.DataClassJsonMixin):
    candy: str | None = None
    color: str | None = None


@dataclasses.dataclass(repr=False)
class Notes(dataclasses_utils.DataClassJsonMixin):
    chinese_name: str | None = None
    comment: str | None = None
    education: Education | None = None
    favorite: Favorites | None = None
    friends_friend: str | None = None
    partner: model.DateRange | None = None

    @staticmethod
    def from_string(notes: str) -> Notes:
        parsed = yaml_utils.load(notes)
        if not isinstance(parsed, dict):
            # Freeform text (not one of this app's YAML key: value notes) --
            # treat the whole thing as a comment rather than failing to parse.
            return Notes(comment=notes)
        return Notes.from_dict(parsed)

    @staticmethod
    def to_string(notes: Notes) -> str:
        return yaml_utils.dump(notes)
