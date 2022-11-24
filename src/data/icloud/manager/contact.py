"""iCloud contacts api wrapper."""
from __future__ import annotations

import json
import re
import typing
import uuid

from data import icloud

if typing.TYPE_CHECKING:
    from data.icloud.manager.session import ICloudSessionManager


class ICloudContactManager:
    """
    The 'Contacts' iCloud manager, connects to iCloud and returns contacts.
    """

    def __init__(self, session_manager: ICloudSessionManager) -> None:
        self.session = session_manager.session
        self.params = session_manager.params
        self._service_root = session_manager.get_webservice_url("contacts")
        self._contacts_endpoint = "%s/co" % self._service_root
        self._contacts_refresh_url = "%s/startup" % self._contacts_endpoint
        self._contacts_next_url = "%s/contacts" % self._contacts_endpoint
        self._contacts_changeset_url = "%s/changeset" % self._contacts_endpoint
        self._contacts_update_url = "%s/card" % self._contacts_next_url
        self._groups_endpoint = "%s/groups" % self._contacts_endpoint
        self._groups_update_url = "%s/card" % self._groups_endpoint

        self.pref_token = ""
        self.sync_token_prefix = ""
        self.sync_token_number = -1
        self.params.update(
            {
                "clientVersion": "2.1",
                "locale": "en_US",
                "order": "last,first",
            }
        )

    @property
    def sync_token(self) -> str:
        return f"{self.sync_token_prefix}{self.sync_token_number}"

    def create_contact(self, new_contact: dict) -> None:
        """Create a contact.

        Args:
            new_contact: the new contact
        """
        body = self._singleton_contact_body(new_contact)
        params = dict(self.params)
        params.update(
            {
                "prefToken": self.pref_token,
                "syncToken": self.sync_token,
            }
        )
        resp = self.session.post(
            self._contacts_update_url,
            params=params,
            data=json.dumps(body),
        ).json()
        self._update_sync_token(resp["syncToken"])

    def update_contact(self, updated_contact: dict) -> None:
        """Update a contact.

        Args:
            updated_contact: the updated contact
        """
        self._update_etag(updated_contact)
        body = self._singleton_contact_body(updated_contact)
        params = dict(self.params)
        params.update(
            {
                "method": "PUT",
                "prefToken": self.pref_token,
                "syncToken": self.sync_token,
            }
        )
        resp = self.session.post(
            self._contacts_update_url,
            params=params,
            data=json.dumps(body),
        ).json()
        self._update_sync_token(resp["syncToken"])

    def create_group(self, contact_group: dict) -> None:
        """Create a contact group.

        Args:
            contact_group: the new contact group
        """
        contact_group["groupId"] = str(uuid.uuid4())
        body = self._singleton_group_body(contact_group)
        params = dict(self.params)
        params.update(
            {
                "prefToken": self.pref_token,
                "syncToken": self.sync_token,
            }
        )
        resp = self.session.post(
            self._groups_update_url,
            params=params,
            data=json.dumps(body),
        ).json()
        self._update_sync_token(resp["syncToken"])

    def delete_group(self, contact_group: dict) -> None:
        """Delete a contact group.

        Args:
            contact_group: the deleted contact group
        """
        self._update_etag(contact_group)
        body = self._singleton_group_body(contact_group)
        params = dict(self.params)
        params.update(
            {
                "method": "DELETE",
                "prefToken": self.pref_token,
                "syncToken": self.sync_token,
            }
        )
        resp = self.session.post(
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
        params_contacts = dict(self.params)
        params_contacts.update(
            {
                "order": "last,first",
            }
        )
        resp = self.session.get(
            self._contacts_refresh_url, params=params_contacts
        ).json()
        self.pref_token = resp["prefToken"]
        self._update_sync_token(resp["syncToken"])
        raw_groups = resp["groups"]

        params_contacts = dict(self.params)
        params_contacts.update(
            {
                "prefToken": self.pref_token,
                "syncToken": self.sync_token,
                "limit": "0",
                "offset": "0",
            }
        )
        resp = self.session.get(self._contacts_next_url, params=params_contacts).json()
        raw_contacts = resp["contacts"]

        contacts = [icloud.ICloudContact.from_dict(contact) for contact in raw_contacts]
        groups = [icloud.ICloudGroup.from_dict(group) for group in raw_groups]

        return contacts, groups

    def _update_sync_token(self, sync_token: str) -> None:
        self.sync_token_prefix = re.search(r"^.*S=", sync_token)[0]
        self.sync_token_number = int(re.search(r"\d+$", sync_token)[0])

    def _update_etag(self, obj: dict) -> None:
        etag = obj["etag"]
        last_sync_number = int(re.search(r"(?<=^C=)\d+", etag)[0])
        if last_sync_number >= self.sync_token_number:
            etag = re.sub(r"^C=\d+", f"C={self.sync_token_number}", etag)
            obj.update({"etag": etag})

    @staticmethod
    def _singleton_contact_body(contact: dict) -> dict:
        return {"contacts": [contact]}

    @staticmethod
    def _singleton_group_body(contact_group: dict) -> dict:
        return {"groups": [contact_group]}
