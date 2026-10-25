"""The iCloud data source."""

from __future__ import annotations

import configparser
import dataclasses
import os.path
from typing import Literal, Sequence

import contacts
from contacts.common import constant
from contacts.dao.icloud import manager, model, transformer
from contacts.dao.icloud.manager import exception
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


@dataclasses.dataclass
class AuthChallenge:
    """Describes a two-factor/two-step authentication challenge in progress.

    "code": modern two-factor auth (HSA2). Apple has already pushed a
        verification code to the account's trusted devices; the caller only
        needs to submit it via `submit_verification_code`.
    "device_and_code": legacy two-step auth (HSA1). The caller must first
        pick a device from `devices` via `submit_verification_device`, then
        submit the code that gets sent to it.
    """

    kind: Literal["code", "device_and_code"]
    devices: list[str] = dataclasses.field(default_factory=list)


class ICloudDao:
    _contact_manager: manager.ICloudContactManager | None = None
    _init_sync_token: bool = False
    _pending_session: manager.ICloudSession | None = None
    _pending_device: dict | None = None

    def authenticate(self, *, interactive: bool = True) -> AuthChallenge | None:
        """Authenticate with iCloud.

        Args:
            interactive: If True (the CLI default), two-factor/two-step
                authentication is handled by blocking on terminal `input()`
                calls, as before. If False, this never blocks: when a
                challenge is needed it is returned instead, and the caller
                must drive it to completion via `submit_verification_device`
                / `submit_verification_code`.

        Returns:
            None if authentication completed (either no 2FA/2SA was needed,
            or there was already a trusted session). Otherwise (only
            possible when interactive=False), an AuthChallenge describing
            what the caller must submit via `submit_verification_device` /
            `submit_verification_code` before authentication can complete.
        """
        # Always re-validates, deliberately not cached: the iCloud contacts
        # webservice grant expires well before a long-lived server process
        # would, so reusing an old session here (cheap, reloads the
        # persisted session token/cookies -- not a full re-login) avoids
        # requests silently starting to 421 after sitting idle a while.
        config = configparser.ConfigParser()
        config.read(constant.CONFIG_FILE)
        username = config["login"]["username"]
        password = config["login"]["password"]
        icloud_session = manager.ICloudSession(username, password)

        if interactive:
            icloud_session.login()
            self._complete_authentication(icloud_session)
            return None

        if icloud_session.requires_2fa:
            icloud_session.request_2fa_code()
            self._pending_session = icloud_session
            return AuthChallenge(kind="code")

        if icloud_session.requires_2sa:
            self._pending_session = icloud_session
            devices = icloud_session.trusted_devices
            return AuthChallenge(
                kind="device_and_code",
                devices=[
                    device.get("deviceName", "SMS to %s" % device.get("phoneNumber"))
                    for device in devices
                ],
            )

        self._complete_authentication(icloud_session)
        return None

    def submit_verification_device(self, device_index: int) -> None:
        """Picks which trusted device a two-step verification code is sent to.

        Only applicable when `authenticate()` returned an AuthChallenge with
        kind "device_and_code"; modern two-factor auth pushes a code
        automatically and has no device selection step.

        Args:
            device_index: Index into the `devices` list from the AuthChallenge.

        Raises:
            RuntimeError: If there is no pending two-step challenge.
            ValueError: If device_index is out of range.
            exception.ICloudFailedLoginException: If sending the code fails.
        """
        icloud_session = self._require_pending_session()
        devices = icloud_session.trusted_devices
        if device_index < 0 or device_index >= len(devices):
            raise ValueError(f"Invalid device index: {device_index}")

        device = devices[device_index]
        if not icloud_session.send_verification_code(device):
            raise exception.ICloudFailedLoginException(
                "Failed to send verification code"
            )
        self._pending_device = device

    def submit_verification_code(self, code: str) -> None:
        """Completes authentication with a two-factor/two-step verification code.

        Args:
            code: The verification code received on a trusted device.

        Raises:
            RuntimeError: If there is no pending challenge, or (for two-step
                auth) if `submit_verification_device` hasn't been called yet.
            exception.ICloudFailedLoginException: If the code is invalid.
        """
        icloud_session = self._require_pending_session()

        if icloud_session.requires_2fa:
            if not icloud_session.validate_2fa_code(code):
                raise exception.ICloudFailedLoginException(
                    "Failed to verify security code"
                )
        else:
            if self._pending_device is None:
                raise RuntimeError("No device selected for verification")
            if not icloud_session.validate_verification_code(
                self._pending_device, code
            ):
                raise exception.ICloudFailedLoginException(
                    "Failed to verify verification code"
                )

        self._complete_authentication(icloud_session)

    def _require_pending_session(self) -> manager.ICloudSession:
        if self._pending_session is None:
            raise RuntimeError("No pending iCloud authentication challenge")
        return self._pending_session

    def _complete_authentication(self, icloud_session: manager.ICloudSession) -> None:
        self._contact_manager = icloud_session.contact_manager
        self._pending_session = None
        self._pending_device = None

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
                constant.CACHE_DIRECTORY, constant.ICLOUD_CONTACTS_FILE
            )
            if not os.path.isfile(contacts_file_path):
                raise ValueError(f"Contacts file does not exist, {contacts_file_path}")

            groups_file_path = os.path.join(
                constant.CACHE_DIRECTORY, constant.ICLOUD_GROUPS_FILE
            )
            if not os.path.isfile(groups_file_path):
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
                os.path.join(constant.CACHE_DIRECTORY, constant.ICLOUD_CONTACTS_FILE),
                icloud_contacts,
            )
            file_io_utils.write_dataclass_objects_as_json_array(
                os.path.join(constant.CACHE_DIRECTORY, constant.ICLOUD_GROUPS_FILE),
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

    def create_contacts(self, contacts: Sequence[contacts.model.Contact]) -> None:
        if len(contacts) == 0:
            return

        LOG.info(f"Writing {len(contacts)} new contacts to iCloud")

        contact_manager = self._get_contact_manager()
        icloud_contacts = [
            transformer.contact_to_icloud_contact(contact) for contact in contacts
        ]
        contact_manager.create_contacts(icloud_contacts)

        LOG.info(f"Wrote {len(contacts)} new contacts to iCloud")

    def update_contacts(self, contacts: Sequence[contacts.model.Contact]) -> None:
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
