"""Convert an icloud.model.ICloudContact into a contact object."""
from __future__ import annotations

import re

from contacts import model
from contacts.dao import icloud
from contacts.dao.icloud.model import notes as nt
from contacts.model import date as date_model
from contacts.utils import object_utils
from contacts.utils.object_utils import Object

PHONE_NUMBER_REGEX = re.compile(r"^\+\d+(;\d+)?$")
AMERICAN_NUMBER_REGEX = re.compile(r"\d{10}")

_UNIVERSITY_LEVELS = ("bachelor", "law", "master", "medical", "phd")


def icloud_contact_to_contact(
    icloud_contact: icloud.model.ICloudContact,
) -> Object:
    """Convert an icloud.model.ICloudContact into a contact object.

    Args:
        icloud_contact: The iCloud contact to transform.

    Returns:
        The transformed contact, shaped by the contact schema.
    """
    # TODO: add support for these fields
    if (
        icloud_contact.IMs
        or icloud_contact.dates
        or icloud_contact.department
        or icloud_contact.jobTitle
        or icloud_contact.phoneticCompanyName
        or icloud_contact.phoneticFirstName
        or icloud_contact.phoneticLastName
        or icloud_contact.relatedNames
        or icloud_contact.suffix
        or icloud_contact.urls
    ):
        raise ValueError(icloud_contact)

    contact: Object = {
        "name": {
            "prefix": icloud_contact.prefix,
            "first_name": icloud_contact.firstName,
            "nickname": icloud_contact.nickName,
            "middle_name": icloud_contact.middleName,
            "last_name": icloud_contact.lastName,
            "suffix": icloud_contact.suffix,
        },
        "birthday": date_model.encoder(icloud_contact.birthday),
        "icloud": {
            "uuid": icloud_contact.contactId,
            "etag": icloud_contact.etag,
            "photo": (
                icloud_contact.photo.to_dict()
                if icloud_contact.photo is not None
                else None
            ),
        },
    }

    if icloud_contact.companyName:
        contact["tags"] = icloud_contact.companyName.split(", ")

    if icloud_contact.emailAddresses:
        contact["email_addresses"] = _transform_email_addresses(
            icloud_contact.emailAddresses
        )

    if icloud_contact.phones:
        contact["phone_numbers"] = _transform_phone_numbers(icloud_contact.phones)

    if icloud_contact.profiles:
        contact["social_profiles"] = _transform_social_profiles(icloud_contact.profiles)

    if icloud_contact.streetAddresses:
        contact["street_addresses"] = _transform_street_addresses(
            icloud_contact.streetAddresses
        )

    if icloud_contact.notes:
        _extract_from_notes(contact, nt.Notes.from_string(icloud_contact.notes))

    return object_utils.prune_none(contact)


def _transform_email_addresses(
    icloud_email_addresses: list[icloud.model.EmailAddress],
) -> list[Object]:
    return [
        {
            "address": icloud_email_address.field,
            "label": icloud_email_address.label,
        }
        for icloud_email_address in icloud_email_addresses
    ]


def _transform_phone_numbers(
    icloud_phones: list[icloud.model.Phone],
) -> list[Object]:
    phone_numbers = []

    for icloud_phone in icloud_phones:
        # TODO: more permanent fix later
        icloud_phone.field = re.sub(r"[\s()-]", "", icloud_phone.field)

        if not PHONE_NUMBER_REGEX.match(icloud_phone.field):
            if AMERICAN_NUMBER_REGEX.match(icloud_phone.field):
                phone_numbers.append(
                    {
                        "number": icloud_phone.field,
                        "country_code": int(model.CountryCode.NANP),
                        "label": icloud_phone.label,
                    }
                )
                continue
            raise ValueError(f"Invalid phone number format: {icloud_phone.field}")

        for country_code in model.CountryCode:
            if not icloud_phone.field.startswith(f"+{country_code}"):
                continue
            phone_numbers.append(
                {
                    "number": icloud_phone.field.split(f"+{country_code}")[1],
                    "country_code": int(country_code),
                    "label": icloud_phone.label,
                }
            )
            break
        else:
            raise ValueError(f"Unsupported country code: {icloud_phone.field}")

    return phone_numbers


def _transform_social_profiles(
    icloud_profiles: list[icloud.model.Profile],
) -> Object:
    social_profiles: Object = {}

    for icloud_profile in icloud_profiles:
        match icloud_profile.label:
            case "FACEBOOK":
                social_profiles["facebook"] = {
                    "user_id": icloud_profile.userId,
                    "username": icloud_profile.user,
                }
            case "GAMECENTER":
                if icloud_profile.user is None:
                    raise ValueError("Missing username for Game Center profile")
                social_profiles["game_center"] = {
                    "link": icloud_profile.field,
                    "username": icloud_profile.user,
                }
            case "INSTAGRAM":
                if icloud_profile.user is None:
                    raise ValueError("Missing username for Instagram profile")
                social_profiles["instagram"] = {"username": icloud_profile.user}
            case "LINKEDIN":
                if icloud_profile.user is None:
                    raise ValueError("Missing username for LinkedIn profile")
                social_profiles["linkedin"] = {"username": icloud_profile.user}
            case "instagram.com":
                if icloud_profile.field is None:
                    raise ValueError("Missing username for Instagram profile")
                social_profiles["instagram"] = {"username": icloud_profile.field}
            case _:
                if icloud_profile.field.startswith("http://www.instagram.com"):
                    social_profiles["instagram"] = {
                        "username": icloud_profile.user or ""
                    }
                else:
                    raise ValueError(
                        f"Unsupported social profile label: {icloud_profile.label}"
                    )

    return social_profiles


def _transform_street_addresses(
    icloud_street_addresses: list[icloud.model.StreetAddress],
) -> list[Object]:
    street_addresses = []

    for icloud_street_address in icloud_street_addresses:
        field = icloud_street_address.field
        street_address: Object = {
            "label": icloud_street_address.label,
            "city": field.city,
            "postal_code": field.postalCode,
            "state": field.state,
            "street": (field.street.splitlines() if field.street is not None else None),
        }
        if field.country:
            street_address["country"] = str(model.Country(field.country))
        street_addresses.append(street_address)

    return street_addresses


def _transform_school(school: nt.School, *, university: bool) -> Object:
    transformed: Object = {"name": school.name}

    if school.grad_year:
        transformed["graduation_year"] = school.grad_year

    # A high school carries no majors or minors, per the contact schema.
    if university:
        if school.majors:
            transformed["majors"] = school.majors.split(", ")
        if school.minors:
            transformed["minors"] = school.minors.split(", ")

    return transformed


def _extract_from_notes(contact: Object, notes: nt.Notes) -> None:
    if notes.chinese_name:
        contact["name"]["chinese_name"] = notes.chinese_name
    if notes.comment:
        contact["notes"] = notes.comment
    if notes.favorite:
        contact["favorite"] = notes.favorite.to_dict()
    if notes.friends_friend:
        contact["friends_friend"] = notes.friends_friend
    if notes.partner:
        contact["dated"] = {
            "start": date_model.encoder(notes.partner.start),
            "end": date_model.encoder(notes.partner.end),
        }

    if not notes.education:
        return

    education: Object = {}

    if notes.education.high_school:
        education["high_school"] = _transform_school(
            notes.education.high_school, university=False
        )

    for level in _UNIVERSITY_LEVELS:
        school = getattr(notes.education, level)
        if school:
            education[level] = _transform_school(school, university=True)

    contact["education"] = education
