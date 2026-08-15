"""iCloud contacts api wrapper."""

from __future__ import annotations

import json

from contacts.dao import icloud


class ICloudContactManager:
    """Manages CRUD operations on iCloud contacts and groups."""

    def __init__(self, session: icloud.manager.ICloudSession) -> None:
        self._session = session
        self._params = session.params
        self._service_root = session.get_webservice_url("contacts")
        self._contacts_endpoint = "%s/co" % self._service_root
        self._contacts_refresh_url = "%s/startup" % self._contacts_endpoint
        self._contacts_next_url = "%s/contacts" % self._contacts_endpoint
        self._contacts_changeset_url = "%s/changeset" % self._contacts_endpoint
        self._contacts_update_url = "%s/card" % self._contacts_next_url
        self._groups_endpoint = "%s/groups" % self._contacts_endpoint
        self._groups_update_url = "%s/card" % self._groups_endpoint

        self._pref_token = ""
        self._sync_token = ""
        # self._sync_token_prefix = ""
        # self._sync_token_number = -1
        self._params.update(
            {
                "clientVersion": "2.1",
                "locale": "en_US",
                "order": "last,first",
            }
        )

    @property
    def sync_token(self) -> str:
        return self._sync_token
        # return f"{self._sync_token_prefix}{self._sync_token_number}"

    def create_contacts(self, contacts: list[icloud.model.ICloudContact]) -> None:
        """Create multiple contacts.

        Args:
            contacts: The new contacts.
        """
        body = self._build_contacts_request_body(contacts)
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

    def update_contacts(self, contacts: list[icloud.model.ICloudContact]) -> None:
        """Update multiple contacts.

        Args:
            contacts: The updated contacts.
        """
        for contact in contacts:
            self._update_etag(contact)
        body = self._build_contacts_request_body(contacts)
        params = dict(self._params)
        params.update(
            {
                "method": "PUT",
                "prefToken": self._pref_token,
                "syncToken": self.sync_token,
            }
        )
        # resp =
        self._session.post(
            self._contacts_update_url,
            params=params,
            data=json.dumps(body),
        ).json()
        # self._update_sync_token(resp["syncToken"])

    def create_group(self, group: icloud.model.ICloudGroup) -> None:
        """Create a contact group.

        Args:
            group: The new contact group.
        """
        body = self._build_groups_request_body(group)
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

    def update_group(self, group: icloud.model.ICloudGroup) -> None:
        """Update a contact group.

        Args:
            group: The updated contact group.
        """
        body = self._build_groups_request_body(group)
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
    ) -> tuple[list[icloud.model.ICloudContact], list[icloud.model.ICloudGroup]]:
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

        contacts = [
            icloud.model.ICloudContact.from_dict(contact) for contact in raw_contacts
        ]
        for group in raw_groups:
            try:
                del group["headerPositions"]["#"]
            except KeyError:
                pass
        groups = [icloud.model.ICloudGroup.from_dict(group) for group in raw_groups]

        return contacts, groups

    def _update_etag(self, contact: icloud.model.ICloudContact) -> None:
        etag = contact.etag
        if etag is None:
            return None
        # last_sync_number = int(cast(re.Match, re.search(r"(?<=^C=)\d+", etag))[0])
        # if last_sync_number >= self._sync_token_number:
        #     etag = re.sub(r"^C=\d+", f"C={self._sync_token_number}", etag)
        contact.etag = etag

    def _update_sync_token(self, sync_token: str) -> None:
        self._sync_token = sync_token
        # try:
        # self._sync_token_prefix = cast(re.Match, re.search(r"^.*S=", sync_token))[0]
        # self._sync_token_number = int(cast(re.Match, re.search(r"\d+$", sync_token))[0])
        # except TypeError:
        #     pass

    @staticmethod
    def _build_contacts_request_body(
        contacts: list[icloud.model.ICloudContact],
    ) -> dict:
        return {"contacts": [contact.to_dict() for contact in contacts]}

    @staticmethod
    def _build_groups_request_body(group: icloud.model.ICloudGroup) -> dict:
        return {"groups": [group.to_dict()]}
