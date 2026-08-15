"""Command to push contacts to a remote source."""

from __future__ import annotations

import datetime

from contacts.dao import disk_dao
from contacts.logger import LOG


def run(*, days: int) -> None:
    disk_contacts = sorted(
        filter(lambda contact: contact.birthday is not None, disk_dao.read_contacts()),
        key=lambda contact: 100 * contact.birthday.month + contact.birthday.day,
    )
    min_day = datetime.date.today()
    max_day = min_day + datetime.timedelta(days=days)
    min_day_int = 100 * min_day.month + min_day.day
    max_day_int = 100 * max_day.month + max_day.day
    same_year = min_day.year == max_day.year

    contacts = []
    for contact in disk_contacts:
        birthday = 100 * contact.birthday.month + contact.birthday.day
        if same_year:
            if min_day_int <= birthday <= max_day_int:
                contacts.append(contact)
        else:
            if birthday >= min_day_int or birthday <= max_day_int:
                contacts.append(contact)

    max_name_length = max(
        1 + len(contact.name.first_name) + len(contact.name.last_name)
        for contact in contacts
    )
    for contact in contacts:
        LOG.info(
            f"{f'{contact.name.first_name} {contact.name.last_name}'.ljust(max_name_length)} -- {contact.birthday}"
        )
