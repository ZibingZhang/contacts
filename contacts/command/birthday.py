"""Command to push contacts to a remote source."""

from __future__ import annotations

import datetime
import sys

from contacts import model
from contacts.dao import disk_dao
from contacts.logger import LOG


def run(*, days: int) -> None:
    disk_contacts = sorted(
        filter(contact_has_birthday, disk_dao.read_contacts()),
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

    max_name_length = max(
        1 + len(contact.name.first_name or "") + len(contact.name.last_name or "")
        for contact in contacts
    )
    for contact in contacts:
        LOG.info(
            f"{f'{contact.name.first_name} {contact.name.last_name}'.ljust(max_name_length)} -- {contact.birthday}"
        )


def contact_has_birthday(contact: model.Contact) -> bool:
    return contact.birthday is not None


def format_birthday_as_mmdd(contact: model.Contact) -> int:
    if (
        contact.birthday is None
        or contact.birthday.day is None
        or contact.birthday.month is None
    ):
        return sys.maxsize
    return 100 * contact.birthday.month + contact.birthday.day


def format_date_as_mmdd(date: datetime.date) -> int:
    return 100 * date.month + date.day
