"""The iCloud data source."""
from __future__ import annotations

import configparser
import os.path

import contacts
from contacts.common import constant
from contacts.dao.icloud import manager, model, transformer
from contacts.logger import LOG
from contacts.utils import file_io_utils

_ALERT_UUIDS = [
    "4B949DAF-F587-47DF-95C2-857B85800ADC",
    "0A4DED51-0751-4B30-AD58-27E8556D5D91",
]
_TEST_CONTACT_UUIDS = [
    "129C6305-F868-4711-B139-C209B4AF3852",
    "50786E4F-651F-4393-8F9C-060C40A22BB5",
    "623AE0B7-EB13-47BB-8CCF-09F2EAE2E4A3",
]
_OTHER_UUIDS = [
    "FAB3DDA6-7529-4D3C-8714-35EF820DCCA8",  # italkbb
]
_IGNORED_UUIDS = _ALERT_UUIDS + _TEST_CONTACT_UUIDS + _OTHER_UUIDS


class ICloudDao:
    _contact_manager: manager.ICloudContactManager | None = None
    _authenticated: bool = False
    _init_sync_token: bool = False

    def authenticate(self) -> None:
        if self._authenticated:
            return

        config = configparser.ConfigParser()
        config.read(constant.CONFIG_FILE)
        username = config["login"]["username"]
        password = config["login"]["password"]
        icloud_session = manager.ICloudSession(username, password)
        icloud_session.login()
        self._authenticated = True
        self._contact_manager = icloud_session.contact_manager

    def read_contacts_and_groups(
        self,
        *,
        cached: bool = False,
    ) -> tuple[list[contacts.model.Contact], list[contacts.model.Group]]:
        LOG.info("Reading contacts and groups from iCloud")

        if cached:
            if not os.path.isdir(constant.CACHE_DIRECTORY):
                raise ValueError(
                    f"Cache path is not a directory, {constant.CACHE_DIRECTORY}"
                )

            contacts_file_path = os.path.join(
                constant.CACHE_DIRECTORY, constant.ICLOUD_CONTACTS_FILE_NAME
            )
            if not os.path.isfile(contacts_file_path):
                raise ValueError(f"Contacts file does not exist, {contacts_file_path}")

            groups_file_path = os.path.join(
                constant.CACHE_DIRECTORY, constant.ICLOUD_GROUPS_FILE_NAME
            )
            if not os.path.isfile(contacts_file_path):
                raise ValueError(f"Groups file does not exist, {groups_file_path}")

            icloud_contacts = file_io_utils.read_json_array_as_dataclass_objects(
                contacts_file_path,
                model.ICloudContact,
            )
            icloud_groups = file_io_utils.read_json_array_as_dataclass_objects(
                groups_file_path,
                model.ICloudGroup,
            )

        else:
            contact_manager = self._get_contact_manager()
            icloud_contacts, icloud_groups = contact_manager.get_contacts_and_groups()

            file_io_utils.write_dataclass_objects_as_json_array(
                os.path.join(
                    constant.CACHE_DIRECTORY, constant.ICLOUD_CONTACTS_FILE_NAME
                ),
                icloud_contacts,
            )
            file_io_utils.write_dataclass_objects_as_json_array(
                os.path.join(
                    constant.CACHE_DIRECTORY, constant.ICLOUD_GROUPS_FILE_NAME
                ),
                icloud_groups,
            )

        contacts = [
            transformer.icloud_contact_to_contact(icloud_contact)
            for icloud_contact in icloud_contacts
            if icloud_contact.contactId not in _IGNORED_UUIDS
        ]
        groups = [
            transformer.icloud_group_to_group(icloud_group)
            for icloud_group in icloud_groups
        ]

        LOG.info(f"Read {len(contacts)} contacts")
        LOG.info(f"Read {len(groups)} groups")

        return contacts, groups

    def create_contacts(self, contacts: list[contacts.model.Contact]) -> None:
        if len(contacts) == 0:
            return

        LOG.info(f"Writing {len(contacts)} new contacts to iCloud")

        contact_manager = self._get_contact_manager()
        icloud_contacts = [
            transformer.contact_to_icloud_contact(contact) for contact in contacts
        ]
        contact_manager.create_contacts(icloud_contacts)

        LOG.info(f"Wrote {len(contacts)} new contacts to iCloud")

    def update_contacts(self, contacts: list[contacts.model.Contact]) -> None:
        if len(contacts) == 0:
            return

        LOG.info(f"Writing {len(contacts)} updated contacts to iCloud")

        contact_manager = self._get_contact_manager()
        icloud_contacts = [
            transformer.contact_to_icloud_contact(contact) for contact in contacts
        ]
        contact_manager.update_contacts(icloud_contacts)

        LOG.info(f"Wrote {len(contacts)} updated contacts to iCloud")

    def create_group(self, group: contacts.model.Group) -> None:
        contact_manager = self._get_contact_manager()
        contact_manager.create_group(transformer.group_to_icloud_group(group))

    def update_group(self, group: contacts.model.Group) -> None:
        contact_manager = self._get_contact_manager()
        contact_manager.update_group(transformer.group_to_icloud_group(group))

    def _get_contact_manager(self) -> manager.ICloudContactManager:
        if self._contact_manager is None:
            raise RuntimeError("Authentication required")
        return self._contact_manager
