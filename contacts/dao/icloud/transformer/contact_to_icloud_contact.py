"""Convert a model.Contact into an icloud.model.ICloudContact."""
from __future__ import annotations

from contacts import model
from contacts.common import constant
from contacts.dao import icloud
from contacts.dao.icloud.model import notes as nt
from contacts.utils import uuid_utils


def contact_to_icloud_contact(contact: model.Contact) -> icloud.model.ICloudContact:
    """Convert a model.Contact into an icloud.model.ICloudContact.

    Args:
        contact: The contact to transform.

    Returns:
        The transformed icloud.model.ICloudContact.
    """
    if contact.icloud is None:
        contact.icloud = model.ICloudMetadata(uuid=uuid_utils.generate())

    icloud_contact = icloud.model.ICloudContact(
        birthday=contact.birthday,
        contactId=contact.icloud.uuid,
        firstName=contact.name.first_name,
        isCompany=False,
        isGuardianApproved=False,
        lastName=contact.name.last_name,
        middleName=contact.name.middle_name,
        nickName=contact.name.nickname,
        photo=contact.icloud.photo,
        prefix=contact.name.prefix,
        suffix=contact.name.suffix,
        whitelisted=False,
    )

    if contact.icloud is not None:
        icloud_contact.etag = contact.icloud.etag

    if contact.tags is not None:
        icloud_contact.companyName = ", ".join(contact.tags)

    if contact.email_addresses is not None:
        icloud_contact.emailAddresses = _transform_email_addresses(
            contact.email_addresses
        )

    if contact.phone_numbers is not None:
        icloud_contact.phones = _transform_phone_numbers(contact.phone_numbers)

    if contact.social_profiles is not None:
        icloud_contact.profiles = _transform_social_profiles(contact.social_profiles)

    if contact.street_addresses is not None:
        icloud_contact.streetAddresses = _transform_street_addresses(
            contact.street_addresses
        )

    if (
        contact.dated
        or contact.education
        or contact.favorite
        or contact.friends_friend
        or contact.name.chinese_name
        or contact.notes
    ):
        icloud_contact.notes = nt.Notes.to_string(_extract_notes(contact))

    return icloud_contact


def _transform_email_addresses(
    email_addresses: list[model.EmailAddresss],
) -> list[icloud.model.EmailAddress]:
    icloud_email_addresses = []
    for email_address in email_addresses:
        icloud_email_addresses.append(
            icloud.model.EmailAddress(
                field=email_address.address,
                label=email_address.label,
            )
        )
    return icloud_email_addresses


def _transform_phone_numbers(
    phone_numbers: list[model.PhoneNumber],
) -> list[icloud.model.Phone]:
    icloud_phones = []
    for phone_number in phone_numbers:
        icloud_phones.append(
            icloud.model.Phone(
                field=f"+{phone_number.country_code}{phone_number.number}",
                label=phone_number.label,
            )
        )
    return icloud_phones


def _transform_social_profiles(
    social_profiles: model.SocialProfiles,
) -> list[icloud.model.Profile]:
    icloud_profiles = []
    if social_profiles.facebook is not None:
        facebook_profile = social_profiles.facebook
        icloud_profiles.append(
            icloud.model.Profile(
                field=(
                    f"http://www.facebook.com/"
                    f"{facebook_profile.username if facebook_profile.username else ''}"
                ),
                label="FACEBOOK",
                user=facebook_profile.username,
                userId=facebook_profile.user_id,
            )
        )
    if social_profiles.game_center is not None:
        game_center_profile = social_profiles.game_center
        icloud_profiles.append(
            icloud.model.Profile(
                field=game_center_profile.link,
                label="GAMECENTER",
                user=game_center_profile.username,
            )
        )
    if social_profiles.instagram is not None:
        instagram_profile = social_profiles.instagram
        icloud_profiles.append(
            icloud.model.Profile(
                field=f"http://www.instagram.com/{instagram_profile.username}",
                label="INSTAGRAM",
                user=instagram_profile.username,
            )
        )
    if social_profiles.linkedin is not None:
        linkedin_profile = social_profiles.linkedin
        icloud_profiles.append(
            icloud.model.Profile(
                field=f"https://www.linkedin.com/in/{linkedin_profile.username}",
                label="LINKEDIN",
                user=linkedin_profile.username,
            )
        )
    return icloud_profiles


def _transform_street_addresses(
    street_addresses: list[model.StreetAddress],
) -> list[icloud.model.StreetAddress]:
    icloud_street_addresses = []
    for street_address in street_addresses:
        icloud_street_address = icloud.model.StreetAddress(
            field=icloud.model.StreetAddressField(
                city=street_address.city,
                country=street_address.country,
                postalCode=street_address.postal_code,
                state=street_address.state,
            ),
            label=street_address.label,
        )
        if street_address.country is not None:
            icloud_street_address.field.countryCode = (
                constant.COUNTRY_TO_COUNTRY_CODE_MAP[street_address.country]
            )
        if street_address.street is not None:
            icloud_street_address.field.street = "\n".join(street_address.street)
        icloud_street_addresses.append(icloud_street_address)
    return icloud_street_addresses


def _extract_notes(contact: model.Contact) -> nt.Notes:
    notes = nt.Notes()
    if contact.name.chinese_name is not None:
        notes.chinese_name = contact.name.chinese_name
    if contact.notes is not None:
        notes.comment = contact.notes
    if contact.favorite is not None:
        notes.favorite = nt.Favorites.from_dict(contact.favorite)
    if contact.friends_friend is not None:
        notes.friends_friend = contact.friends_friend
    if contact.dated is not None:
        notes.partner = contact.dated

    if contact.education is not None:
        education = nt.Education()

        if contact.education.bachelor is not None:
            education.bachelor = nt.School(name=contact.education.bachelor.name)
            if contact.education.bachelor.graduation_year is not None:
                education.bachelor.grad_year = (
                    contact.education.bachelor.graduation_year
                )
            if contact.education.bachelor.majors is not None:
                education.bachelor.majors = ", ".join(contact.education.bachelor.majors)
            if contact.education.bachelor.minors is not None:
                education.bachelor.minors = ", ".join(contact.education.bachelor.minors)

        if contact.education.high_school is not None:
            education.high_school = nt.School(name=contact.education.high_school.name)
            if contact.education.high_school.graduation_year:
                education.high_school.grad_year = (
                    contact.education.high_school.graduation_year
                )

        if contact.education.master is not None:
            education.master = nt.School(name=contact.education.master.name)
            if contact.education.master.graduation_year is not None:
                education.master.grad_year = contact.education.master.graduation_year
            if contact.education.master.majors is not None:
                education.master.majors = ", ".join(contact.education.master.majors)
            if contact.education.master.minors is not None:
                education.master.minors = ", ".join(contact.education.master.minors)

        notes.education = education

    return notes
