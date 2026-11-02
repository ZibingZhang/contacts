"""Command to list upcoming birthdays."""

from __future__ import annotations

import datetime
import sys

from contacts import model
from contacts.dao import disk_dao
from contacts.logger import LOG
from contacts.utils import contact_utils
from contacts.utils.object_utils import Object


def run(*, days: int) -> None:
    disk_contacts = sorted(
        filter(contact_has_birthday, disk_dao.read_objects(model.TYPE_CONTACT)),
        key=format_birthday_as_mmdd,
    )
    min_day = datetime.date.today()
    max_day = min_day + datetime.timedelta(days=days)
    min_day_int = format_date_as_mmdd(min_day)
    max_day_int = format_date_as_mmdd(max_day)
    same_year = min_day.year == max_day.year

    contacts = []
    for contact in disk_contacts:
        birthday = format_birthday_as_mmdd(contact)
        if same_year:
            if min_day_int <= birthday <= max_day_int:
                contacts.append(contact)
        else:
            if birthday >= min_day_int or birthday <= max_day_int:
                contacts.append(contact)

    if not contacts:
        return

    max_name_length = max(
        len(contact_utils.build_name_str(contact)) for contact in contacts
    )
    for contact in contacts:
        name = contact_utils.build_name_str(contact).ljust(max_name_length)
        LOG.info(f"{name} -- {contact['birthday']}")


def contact_has_birthday(contact: Object) -> bool:
    return contact.get("birthday") is not None


def format_birthday_as_mmdd(contact: Object) -> int:
    """Sorts a contact by the month and day of its birthday.

    Args:
        contact: The contact.

    Returns:
        The birthday as MMDD, or sys.maxsize when either part is masked.
    """
    birthday = contact.get("birthday")
    if birthday is None:
        return sys.maxsize

    month, day = birthday[5:7], birthday[8:10]
    if not month.isdigit() or not day.isdigit():
        return sys.maxsize

    return 100 * int(month) + int(day)


def format_date_as_mmdd(date: datetime.date) -> int:
    return 100 * date.month + date.day
