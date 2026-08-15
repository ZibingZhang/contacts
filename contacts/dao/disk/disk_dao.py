"""The disk data source."""

from __future__ import annotations

import os
import time

from contacts import model
from contacts.common import constant
from contacts.logger import LOG
from contacts.utils import contact_utils, file_io_utils, uuid_utils


class DiskDao:
    DIRECTORY = os.path.join(constant.DATA_DIRECTORY, constant.CONTACT_FILES_DIRECTORY)

    def __init__(self):
        if not os.path.exists(DiskDao.DIRECTORY):
            os.makedirs(DiskDao.DIRECTORY)

    @staticmethod
    def read_contacts() -> list[model.DiskContact]:
        LOG.info("Reading contacts from disk")

        contacts = [
            file_io_utils.read_json_object_as_dataclass_object(
                os.path.join(DiskDao.DIRECTORY, file_name), model.DiskContact
            )
            for file_name in os.listdir(DiskDao.DIRECTORY)
        ]

        LOG.info(f"Read {len(contacts)} contacts")

        for contact in contacts:
            if contact.mtime is None:
                contact.mtime = time.time()
                DiskDao.update_contacts([contact])

            if contact.icloud is None:
                contact.icloud = model.ICloudMetadata(uuid=uuid_utils.generate())
                DiskDao.update_contacts([contact])

        return sorted(contacts, key=lambda contact: contact.id)

    @staticmethod
    def create_contacts(contacts: list[model.Contact]) -> None:
        next_contact_id = (
            max(
                int(file_name.split(".json")[0])
                for file_name in os.listdir(DiskDao.DIRECTORY)
            )
            + 1
        )
        for contact in contacts:
            LOG.info(
                f"Writing new contact {contact_utils.build_name_str(contact)} to disk"
            )

            contact.id = next_contact_id
            contact.mtime = time.time()
            path = os.path.join(DiskDao.DIRECTORY, f"{next_contact_id}.json")
            file_io_utils.write_contact_as_json_object(path, contact)
            next_contact_id += 1

    @staticmethod
    def update_contacts(contacts: list[model.DiskContact]) -> None:
        for contact in contacts:
            LOG.info(
                f"Writing updated contact {contact_utils.build_name_str(contact)} to disk"
            )

            file_io_utils.write_contact_as_json_object(
                os.path.join(DiskDao.DIRECTORY, f"{contact.id}.json"), contact
            )
