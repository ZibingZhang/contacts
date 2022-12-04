"""iCloud contacts api wrapper."""
from __future__ import annotations

import json
import re
import uuid

from common import singleton
from utils import uuid_utils

from data import icloud


class ICloudContactManager(metaclass=singleton.Singleton):
    """Manages CRUD operations on iCloud contacts and groups."""

    def __init__(self, manager: icloud.ICloudManager) -> None:
        self._session = manager.session
        self._params = manager.params
        self._service_root = manager.get_webservice_url("contacts")
        self._contacts_endpoint = "%s/co" % self._service_root
        self._contacts_refresh_url = "%s/startup" % self._contacts_endpoint
        self._contacts_next_url = "%s/contacts" % self._contacts_endpoint
        self._contacts_changeset_url = "%s/changeset" % self._contacts_endpoint
        self._contacts_update_url = "%s/card" % self._contacts_next_url
        self._groups_endpoint = "%s/groups" % self._contacts_endpoint
        self._groups_update_url = "%s/card" % self._groups_endpoint

        self._pref_token = ""
        self._sync_token_prefix = ""
        self._sync_token_number = -1
        self._params.update(
            {
                "clientVersion": "2.1",
                "locale": "en_US",
                "order": "last,first",
            }
        )

    @property
    def sync_token(self) -> str:
        return f"{self._sync_token_prefix}{self._sync_token_number}"

    def create_contact(self, new_contact: icloud.ICloudContact) -> None:
        """Create a contact.

        Args:
            new_contact: The new contact.
        """
        self.create_contacts([new_contact])

    def create_contacts(self, new_contacts: list[icloud.ICloudContact]) -> None:
        """Create multiple contacts.

        Args:
            new_contacts: The new contacts.
        """
        self._generate_contact_uuids(new_contacts)
        body = self._build_contacts_request_body(new_contacts)
        params = dict(self._params)
        params.update(
            {
                "prefToken": self._pref_token,
                "syncToken": self.sync_token,
            }
        )
        resp = self._session.post(
            self._contacts_update_url,
            params=params,
            data=json.dumps(body),
        ).json()
        self._update_sync_token(resp["syncToken"])

    def update_contact(self, updated_contact: icloud.ICloudContact) -> None:
        """Update a contact.

        Args:
            updated_contact: The updated contact.
        """
        self.update_contacts([updated_contact])

    def update_contacts(self, updated_contacts: list[icloud.ICloudContact]) -> None:
        """Update multiple contacts.

        Args:
            updated_contacts: The updated contacts.
        """
        for updated_contact in updated_contacts:
            self._update_etag(updated_contact)
        body = self._build_contacts_request_body(updated_contacts)
        params = dict(self._params)
        params.update(
            {
                "method": "PUT",
                "prefToken": self._pref_token,
                "syncToken": self.sync_token,
            }
        )
        resp = self._session.post(
            self._contacts_update_url,
            params=params,
            data=json.dumps(body),
        ).json()
        self._update_sync_token(resp["syncToken"])

    def create_group(self, new_group: icloud.ICloudGroup) -> None:
        """Create a contact group.

        Args:
            new_group: The new contact group.
        """
        body = self._build_groups_request_body([new_group])
        params = dict(self._params)
        params.update(
            {
                "prefToken": self._pref_token,
                "syncToken": self.sync_token,
            }
        )
        resp = self._session.post(
            self._groups_update_url,
            params=params,
            data=json.dumps(body),
        ).json()
        self._update_sync_token(resp["syncToken"])

    def update_group(self, updated_group: icloud.ICloudGroup) -> None:
        """Update a contact group.

        Args:
            updated_group: The updated contact group.
        """
        body = self._build_groups_request_body([updated_group])
        params = dict(self._params)
        params.update(
            {
                "method": "PUT",
                "prefToken": self._pref_token,
                "syncToken": self.sync_token,
            }
        )
        resp = self._session.post(
            self._groups_update_url,
            params=params,
            data=json.dumps(body),
        ).json()
        self._update_sync_token(resp["syncToken"])

    def get_contacts_and_groups(
        self,
    ) -> tuple[list[icloud.ICloudContact], list[icloud.ICloudGroup]]:
        """Get all contact and contact groups.

        Returns:
            All the contacts and contact groups.
        """
        params_contacts = dict(self._params)
        params_contacts.update(
            {
                "order": "last,first",
            }
        )
        resp = self._session.get(
            self._contacts_refresh_url, params=params_contacts
        ).json()
        self._pref_token = resp["prefToken"]
        self._update_sync_token(resp["syncToken"])
        raw_groups = resp["groups"]

        params_contacts = dict(self._params)
        params_contacts.update(
            {
                "prefToken": self._pref_token,
                "syncToken": self.sync_token,
                "limit": "0",
                "offset": "0",
            }
        )
        resp = self._session.get(self._contacts_next_url, params=params_contacts).json()
        raw_contacts = resp["contacts"]

        contacts = [icloud.ICloudContact.from_dict(contact) for contact in raw_contacts]
        groups = [icloud.ICloudGroup.from_dict(group) for group in raw_groups]

        return contacts, groups

    def _update_etag(self, contact: icloud.ICloudContact) -> None:
        etag = contact.etag
        last_sync_number = int(re.search(r"(?<=^C=)\d+", etag)[0])
        if last_sync_number >= self._sync_token_number:
            etag = re.sub(r"^C=\d+", f"C={self._sync_token_number}", etag)
        contact.etag = etag

    def _update_sync_token(self, sync_token: str) -> None:
        self._sync_token_prefix = re.search(r"^.*S=", sync_token)[0]
        self._sync_token_number = int(re.search(r"\d+$", sync_token)[0])

    @staticmethod
    def _generate_contact_uuids(contacts: list[icloud.ICloudContact]) -> None:
        for contact in contacts:
            if contact.contactId is None:
                contact.contactId = uuid_utils.generate()

    @staticmethod
    def _build_contacts_request_body(contacts: list[icloud.ICloudContact]) -> dict:
        return {"contacts": [contact.to_dict() for contact in contacts]}

    @staticmethod
    def _build_groups_request_body(groups: list[icloud.ICloudGroup]) -> dict:
        return {"groups": [group.to_dict() for group in groups]}
