"""The model for a contact."""
from __future__ import annotations

import dataclasses
from typing import Any

import dataclasses_json

from contacts.model import date, enumeration
from contacts.utils import dataclasses_utils


@dataclasses.dataclass(repr=False)
class HighSchool(dataclasses_utils.DataClassJsonMixin):
    name: str
    graduation_year: int | None = None

    def __post_init__(self):
        assert self.name in enumeration.HighSchoolName.values()


@dataclasses.dataclass(repr=False)
class University(dataclasses_utils.DataClassJsonMixin):
    name: str
    graduation_year: int | None = None
    majors: list[str] | None = None
    minors: list[str] | None = None

    def __post_init__(self):
        assert self.name in enumeration.UniversityName.values()


@dataclasses.dataclass(repr=False)
class Education(dataclasses_utils.DataClassJsonMixin):
    bachelor: University | None = None
    high_school: HighSchool | None = None
    law: University | None = None
    master: University | None = None
    medical: University | None = None
    phd: University | None = None


@dataclasses.dataclass(repr=False)
class EmailAddress(dataclasses_utils.DataClassJsonMixin):
    address: str
    label: str


@dataclasses.dataclass(repr=False)
class ICloudPhotoCrop(dataclasses_utils.DataClassJsonMixin):
    height: int
    width: int
    x: int
    y: int


@dataclasses.dataclass(repr=False)
class ICloudPhoto(dataclasses_utils.DataClassJsonMixin):
    url: str
    crop: ICloudPhotoCrop | None = None
    signature: str | None = None
    whitelisted: bool | None = None


@dataclasses.dataclass(repr=False)
class ICloudContactMetadata(dataclasses_utils.DataClassJsonMixin):
    uuid: str
    etag: str | None = None
    photo: ICloudPhoto | None = None


@dataclasses.dataclass(repr=False)
class Name(dataclasses_utils.DataClassJsonMixin):
    prefix: str | None = None
    first_name: str | None = None
    nickname: str | None = None
    middle_name: str | None = None
    last_name: str | None = None
    suffix: str | None = None
    chinese_name: str | None = None


@dataclasses.dataclass(repr=False)
class PhoneNumber(dataclasses_utils.DataClassJsonMixin):
    number: str
    country_code: int = enumeration.CountryCode.NANP.value
    label: str | None = None

    def __post_init__(self):
        assert self.country_code in enumeration.CountryCode.values()


# https://www.facebook.com/help/211813265517027
@dataclasses.dataclass(repr=False)
class FacebookProfile(dataclasses_utils.DataClassJsonMixin):
    user_id: str | None = None
    username: str | None = None


@dataclasses.dataclass(repr=False)
class GameCenterProfile(dataclasses_utils.DataClassJsonMixin):
    link: str
    username: str


@dataclasses.dataclass(repr=False)
class InstagramProfile(dataclasses_utils.DataClassJsonMixin):
    username: str
    finsta_usernames: list[str] | None = None


@dataclasses.dataclass(repr=False)
class SocialProfiles(dataclasses_utils.DataClassJsonMixin):
    facebook: FacebookProfile | None = None
    game_center: GameCenterProfile | None = None
    instagram: InstagramProfile | None = None


@dataclasses.dataclass(repr=False)
class StreetAddress(dataclasses_utils.DataClassJsonMixin):
    label: str
    country: str | None = None
    city: str | None = None
    postal_code: str | None = None
    state: str | None = None
    street: list[str] | None = None

    def __post_init__(self):
        assert self.country is None or self.country in enumeration.Country.values()


@dataclasses.dataclass(repr=False)
class Contact(dataclasses_utils.DataClassJsonMixin):
    # Required
    name: Name

    # Unique id
    id: int | None = None

    # Information
    birthday: date.Date | None = dataclasses.field(
        default=None,
        metadata=dataclasses_json.config(
            decoder=date.decoder,
            encoder=date.encoder,
        ),
    )
    dated: date.DateRange | None = None
    education: Education | None = None
    email_addresses: list[EmailAddress] | None = None
    favorite: dict | None = None
    friends_friend: str | None = None
    notes: str | None = None
    phone_numbers: list[PhoneNumber] | None = None
    social_profiles: SocialProfiles | None = None
    street_addresses: list[StreetAddress] | None = None
    tags: list[str] | None = None

    # Meta information
    mtime: float | None = None

    # iCloud specific
    icloud: ICloudContactMetadata | None = None

    def __setattr__(self, key: str, value: Any) -> None:
        if key == "email_addresses" and value is not None:
            super().__setattr__(
                key,
                sorted(value, key=lambda email_address: email_address.address),
            )
        elif key == "tags" and value is not None:
            super().__setattr__(key, list(sorted(set(value))))
        else:
            super().__setattr__(key, value)


class DiskContact(Contact):
    id: int
