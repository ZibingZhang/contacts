"""Convert a contact object into an icloud.model.ICloudContact."""
from __future__ import annotations

from contacts import model
from contacts.common import constant
from contacts.dao import icloud
from contacts.dao.icloud.model import notes as nt
from contacts.model import date as date_model
from contacts.utils import object_utils, uuid_utils
from contacts.utils.object_utils import Object

_UNIVERSITY_LEVELS = ("bachelor", "law", "master", "medical", "phd")


def contact_to_icloud_contact(contact: Object) -> icloud.model.ICloudContact:
    """Convert a contact object into an icloud.model.ICloudContact.

    A contact with no iCloud uuid yet is given one here, mutating the contact
    so the caller persists it alongside the push.

    Args:
        contact: The contact to transform.

    Returns:
        The transformed icloud.model.ICloudContact.
    """
    if object_utils.get_path(contact, "icloud.uuid") is None:
        object_utils.set_path(contact, "icloud.uuid", uuid_utils.generate())

    name = contact.get("name") or {}
    photo = object_utils.get_path(contact, "icloud.photo")

    icloud_contact = icloud.model.ICloudContact(
        birthday=date_model.decoder(contact.get("birthday")),
        contactId=object_utils.get_path(contact, "icloud.uuid"),
        etag=object_utils.get_path(contact, "icloud.etag"),
        firstName=name.get("first_name"),
        isCompany=False,
        isGuardianApproved=False,
        lastName=name.get("last_name"),
        middleName=name.get("middle_name"),
        nickName=name.get("nickname"),
        photo=(icloud.model.Photo.from_dict(photo) if photo is not None else None),
        prefix=name.get("prefix"),
        suffix=name.get("suffix"),
        whitelisted=False,
    )

    if contact.get("tags") is not None:
        icloud_contact.companyName = ", ".join(contact["tags"])

    if contact.get("email_addresses") is not None:
        icloud_contact.emailAddresses = _transform_email_addresses(
            contact["email_addresses"]
        )

    if contact.get("phone_numbers") is not None:
        icloud_contact.phones = _transform_phone_numbers(contact["phone_numbers"])

    if contact.get("social_profiles") is not None:
        icloud_contact.profiles = _transform_social_profiles(contact["social_profiles"])

    if contact.get("street_addresses") is not None:
        icloud_contact.streetAddresses = _transform_street_addresses(
            contact["street_addresses"]
        )

    if (
        contact.get("dated")
        or contact.get("education")
        or contact.get("favorite")
        or contact.get("friends_friend")
        or name.get("chinese_name")
        or contact.get("notes")
    ):
        icloud_contact.notes = nt.Notes.to_string(_extract_notes(contact))

    return icloud_contact


def _transform_email_addresses(
    email_addresses: list[Object],
) -> list[icloud.model.EmailAddress]:
    return [
        icloud.model.EmailAddress(
            field=email_address["address"],
            label=email_address["label"],
        )
        for email_address in email_addresses
    ]


def _transform_phone_numbers(
    phone_numbers: list[Object],
) -> list[icloud.model.Phone]:
    return [
        icloud.model.Phone(
            field=f"+{phone_number.get('country_code')}{phone_number['number']}",
            label=phone_number.get("label"),
        )
        for phone_number in phone_numbers
    ]


def _transform_social_profiles(
    social_profiles: Object,
) -> list[icloud.model.Profile]:
    icloud_profiles = []

    if (facebook := social_profiles.get("facebook")) is not None:
        username = facebook.get("username")
        icloud_profiles.append(
            icloud.model.Profile(
                field=f"http://www.facebook.com/{username if username else ''}",
                label="FACEBOOK",
                user=username,
                userId=facebook.get("user_id"),
            )
        )

    if (game_center := social_profiles.get("game_center")) is not None:
        icloud_profiles.append(
            icloud.model.Profile(
                field=game_center["link"],
                label="GAMECENTER",
                user=game_center["username"],
            )
        )

    if (instagram := social_profiles.get("instagram")) is not None:
        icloud_profiles.append(
            icloud.model.Profile(
                field=f"http://www.instagram.com/{instagram['username']}",
                label="INSTAGRAM",
                user=instagram["username"],
            )
        )

    if (linkedin := social_profiles.get("linkedin")) is not None:
        icloud_profiles.append(
            icloud.model.Profile(
                field=f"https://www.linkedin.com/in/{linkedin['username']}",
                label="LINKEDIN",
                user=linkedin["username"],
            )
        )

    return icloud_profiles


def _transform_street_addresses(
    street_addresses: list[Object],
) -> list[icloud.model.StreetAddress]:
    icloud_street_addresses = []

    for street_address in street_addresses:
        country = street_address.get("country")
        street = street_address.get("street")

        icloud_street_addresses.append(
            icloud.model.StreetAddress(
                field=icloud.model.StreetAddressField(
                    city=street_address.get("city"),
                    country=country,
                    countryCode=(
                        constant.COUNTRY_TO_COUNTRY_CODE_MAP[country]
                        if country is not None
                        else None
                    ),
                    postalCode=street_address.get("postal_code"),
                    state=street_address.get("state"),
                    street="\n".join(street) if street is not None else None,
                ),
                label=street_address["label"],
            )
        )

    return icloud_street_addresses


def _transform_school(school: Object) -> nt.School:
    note_school = nt.School(name=school["name"])

    if school.get("graduation_year") is not None:
        note_school.grad_year = school["graduation_year"]
    if school.get("majors") is not None:
        note_school.majors = ", ".join(school["majors"])
    if school.get("minors") is not None:
        note_school.minors = ", ".join(school["minors"])

    return note_school


def _extract_notes(contact: Object) -> nt.Notes:
    name = contact.get("name") or {}
    notes = nt.Notes()

    if name.get("chinese_name") is not None:
        notes.chinese_name = name["chinese_name"]
    if contact.get("notes") is not None:
        notes.comment = contact["notes"]
    if contact.get("favorite") is not None:
        notes.favorite = nt.Favorites.from_dict(contact["favorite"])
    if contact.get("friends_friend") is not None:
        notes.friends_friend = contact["friends_friend"]
    if contact.get("dated") is not None:
        notes.partner = model.DateRange.from_dict(contact["dated"])

    education = contact.get("education")
    if education is None:
        return notes

    note_education = nt.Education()

    if education.get("high_school") is not None:
        note_education.high_school = _transform_school(education["high_school"])

    for level in _UNIVERSITY_LEVELS:
        if education.get(level) is not None:
            setattr(note_education, level, _transform_school(education[level]))

    notes.education = note_education

    return notes
