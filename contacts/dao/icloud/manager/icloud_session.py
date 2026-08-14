"""General iCloud api wrapper."""

from __future__ import annotations

import base64
import dataclasses
import functools
import getpass
import hashlib
import http.cookiejar as cookielib
import inspect
import json
import logging
import os.path
import re
import tempfile
import uuid
from typing import Any, NoReturn, cast

import requests
import srp

from contacts.dao import icloud
from contacts.dao.icloud.manager import exception

LOG = logging.getLogger(__name__)


HEADER_DATA = {
    "X-Apple-ID-Account-Country": "account_country",
    "X-Apple-ID-Session-Id": "session_id",
    "X-Apple-Auth-Attributes": "auth_attributes",
    "X-Apple-Session-Token": "session_token",
    "X-Apple-TwoSV-Trust-Token": "trust_token",
    "X-Apple-TwoSV-Trust-Eligible": "trust_eligible",
    "X-Apple-OAuth-Grant-Code": "grant_code",
    "X-Apple-I-Rscd": "apple_rscd",
    "X-Apple-I-Ercd": "apple_ercd",
    "scnt": "scnt",
}

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3.1 Safari/605.1.15"
)


class ICloudSession(requests.Session):
    """iCloud session.

    Handles the authentication required to access iCloud services.
    """

    AUTH_ENDPOINT = "https://idmsa.apple.com/appleauth/auth"
    HOME_ENDPOINT = "https://www.icloud.com"
    SETUP_ENDPOINT = "https://setup.icloud.com/setup/ws/1"

    def __init__(
        self,
        apple_id: str | None = None,
        password: str | None = None,
        cookie_directory: str | None = None,
        verify: bool = True,
        client_id: str | None = None,
        with_family: bool = True,
        china_mainland: bool = False,
    ) -> None:
        super().__init__()

        if apple_id is None or password is None:
            raise ValueError(
                "'apple_id' and 'password' required for initial instantiation"
            )
        if china_mainland:
            self.AUTH_ENDPOINT = "https://idmsa.apple.com.cn/appleauth/auth"
            self.HOME_ENDPOINT = "https://www.icloud.com.cn"
            self.SETUP_ENDPOINT = "https://setup.icloud.com.cn/setup/ws/1"

        self.user = _User(account_name=apple_id, password=password)
        self.data: dict[str, Any] = {}
        self.params: dict[str, str] = {}
        self.client_id = client_id or ("auth-%s" % str(uuid.uuid1()).lower())
        self.with_family = with_family
        self.verify = verify
        self.headers.update(
            {"Origin": self.HOME_ENDPOINT, "Referer": "%s/" % self.HOME_ENDPOINT}
        )

        self.password_filter = _PasswordFilter(password)
        LOG.addFilter(self.password_filter)

        cookie_directory = ICloudSession._init_cookie_directory(cookie_directory)
        account_file_name = "".join(
            [c for c in self.user.account_name if re.match(r"\w", c)]
        )
        self.cookiejar_path = os.path.join(cookie_directory, account_file_name)
        self.session_path = os.path.join(
            cookie_directory, account_file_name + ".session"
        )

        self.session_data = ICloudSession._load_session_data(self.session_path)

        if client_id := self.session_data.get("client_id"):
            self.client_id = client_id
        else:
            self.session_data.update({"client_id": self.client_id})

        LOG.debug("Using session file %s" % self.session_path)

        self.cookies: cookielib.LWPCookieJar = ICloudSession._load_cookies(
            self.cookiejar_path
        )  # type: ignore

        self._webservices: dict[str, dict[str, str]] = {}
        self.authenticate()

    @functools.cached_property
    def contact_manager(self) -> icloud.manager.ICloudContactManager:
        return icloud.manager.ICloudContactManager(self)

    @property
    def requires_2sa(self) -> bool:
        """Returns True if two-step authentication is required."""
        return self.data.get("dsInfo", {}).get("hsaVersion", 0) >= 1 and (
            self.data.get("hsaChallengeRequired", False) or not self.is_trusted_session
        )

    @property
    def requires_2fa(self) -> bool:
        """Returns True if two-factor authentication is required."""
        return self.data["dsInfo"].get("hsaVersion", 0) == 2 and (
            self.data.get("hsaChallengeRequired", False) or not self.is_trusted_session
        )

    @property
    def is_trusted_session(self) -> bool:
        """Returns True if the session is trusted."""
        return self.data.get("hsaTrustedBrowser", False)

    @property
    def trusted_devices(self) -> dict:
        """Returns devices trusted for two-step authentication."""
        request = self.get("%s/listDevices" % self.SETUP_ENDPOINT, params=self.params)
        return request.json().get("devices")

    def _request_2fa_code(self) -> None:
        """Actively push a 2FA notification to trusted devices.

        Apple does not automatically push a code for non-browser (API) sessions
        after SRP. This method triggers the push explicitly.
        """
        headers = self._get_auth_headers({"Accept": "application/json"})
        try:
            self.get(
                "%s/verify/trusteddevice" % self.AUTH_ENDPOINT,
                headers=headers,
            )
            LOG.debug("Requested 2FA code via trusted device push")
        except Exception:
            LOG.debug("Could not request 2FA device push")

    def login(self) -> None:
        if self.requires_2fa:
            self._request_2fa_code()
            LOG.info("Two-factor authentication required.")
            code = input(
                "Enter the code you received of one of your approved devices: "
            )
            result = self._validate_2fa_code(code)
            LOG.info("Code validation result: %s" % result)

            if not result:
                raise exception.ICloudFailedLoginException(
                    "Failed to verify security code"
                )

            if not self.is_trusted_session:
                LOG.info("Session is not trusted. Requesting trust...")
                result = self._trust_session()
                LOG.info("Session trust result %s" % result)

                if not result:
                    LOG.info(
                        "Failed to request trust. You will likely be prompted for the"
                        " code again in the coming weeks"
                    )
        elif self.requires_2sa:
            LOG.info("Two-step authentication required. Your trusted devices are:")

            devices = self.trusted_devices
            for i, device in enumerate(devices):
                LOG.info(
                    "  %s: %s"
                    % (
                        i,
                        device.get(
                            "deviceName", "SMS to %s" % device.get("phoneNumber")
                        ),
                    )
                )

            device = input("Which device would you like to use?")
            device = devices[device]
            if not self._send_verification_code(device):
                raise exception.ICloudFailedLoginException(
                    "Failed to send verification code"
                )

            code = input("Please enter validation code")
            if not self._validate_verification_code(device, code):
                raise exception.ICloudFailedLoginException(
                    "Failed to verify verification code"
                )

    def authenticate(
        self, force_refresh: bool = False, service: str | None = None
    ) -> None:
        """
        Handles authentication, and persists cookies so that
        subsequent logins will not cause additional e-mails from Apple.
        """
        login_successful = False
        if self.session_data.get("session_token") and not force_refresh:
            LOG.debug("Checking session token validity")
            try:
                self.data = self._validate_token()
                login_successful = True
            except exception.ICloudAPIResponseException:
                LOG.debug("Invalid authentication token, will log in from scratch.")

        if not login_successful and service is not None:
            app = self.data["apps"][service]
            if (
                "canLaunchWithOneFactor" in app
                and app["canLaunchWithOneFactor"] is True
            ):
                LOG.debug(
                    "Authenticating as %s for %s" % (self.user.account_name, service)
                )
                try:
                    self._authenticate_with_credentials_service(service)
                    login_successful = True
                except exception.ICloudFailedLoginException:
                    LOG.debug("Could not log into manager. Attempting brand new login.")

        if not login_successful:
            LOG.debug("Authenticating as %s" % self.user.account_name)

            headers = self._get_auth_headers()

            try:
                self.get(
                    "%s/authorize/signin" % self.AUTH_ENDPOINT,
                    params={
                        "frame_id": self.client_id,
                        "skVersion": "7",
                        "iframeid": self.client_id,
                        "client_id": "d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d",
                        "response_type": "code",
                        "redirect_uri": self.HOME_ENDPOINT,
                        "response_mode": "web_message",
                        "state": self.client_id,
                        "authVersion": "latest",
                    },
                )
                headers = self._get_auth_headers()
            except Exception:
                LOG.debug("authorize/signin pre-step failed; continuing with SRP")

            srp_password = _SrpPassword(self.user.password)
            srp.rfc5054_enable()
            srp.no_username_in_x()
            usr = srp.User(
                self.user.account_name,
                srp_password,
                hash_alg=srp.SHA256,
                ng_type=srp.NG_2048,
            )
            uname, a = usr.start_authentication()
            data = {
                "a": base64.b64encode(a).decode(),
                "accountName": uname,
                "protocols": ["s2k", "s2k_fo"],
            }
            try:
                response = self.post(
                    "%s/signin/init" % self.AUTH_ENDPOINT,
                    data=json.dumps(data),
                    headers=headers,
                )
                response.raise_for_status()
            except exception.ICloudAPIResponseException as error:
                msg = "Failed to initiate srp authentication."
                raise exception.ICloudFailedLoginException(msg, error) from error
            body = response.json()
            salt = base64.b64decode(body["salt"])
            b = base64.b64decode(body["b"])
            c = body["c"]
            iterations = body["iteration"]
            protocol = body.get("protocol", "s2k")
            key_length = 32
            srp_password.set_encrypt_info(salt, iterations, key_length, protocol)
            m1 = usr.process_challenge(salt, b)
            m2 = usr.H_AMK
            data = {
                "accountName": uname,
                "c": c,
                "m1": base64.b64encode(m1).decode(),
                "m2": base64.b64encode(m2).decode(),
                "rememberMe": True,
                "trustTokens": [],
            }
            if self.session_data.get("trust_token"):
                data["trustTokens"] = [self.session_data.get("trust_token")]

            try:
                self.post(
                    "%s/signin/complete" % self.AUTH_ENDPOINT,
                    params={"isRememberMeEnabled": "true"},
                    data=json.dumps(data),
                    headers=headers,
                )
            except exception.ICloudAPIResponseException as error:
                msg = "Invalid email/password combination."
                raise exception.ICloudFailedLoginException(msg, error)

            self._authenticate_with_token()

        self.params.update({"dsid": self.data["dsInfo"]["dsid"]})

        self._webservices = self.data["webservices"]

        LOG.debug("Authentication completed successfully")

    def get_webservice_url(self, ws_key: str) -> str:
        """Get webservice URL, raise an exception if not exists."""
        if self._webservices.get(ws_key) is None:
            raise exception.ICloudServiceNotActivatedException(
                "Webservice not available", ws_key
            )
        return self._webservices[ws_key]["url"]

    def _authenticate_with_token(self) -> None:
        """Authenticate using session token."""
        data = {
            "accountCountryCode": self.session_data.get("account_country"),
            "dsWebAuthToken": self.session_data.get("session_token"),
            "extended_login": True,
            "trustToken": self.session_data.get("trust_token", ""),
        }

        try:
            req = self.post(
                "%s/accountLogin" % self.SETUP_ENDPOINT, data=json.dumps(data)
            )
            self.data = req.json()
        except exception.ICloudAPIResponseException as error:
            msg = "Invalid authentication token."
            raise exception.ICloudFailedLoginException(msg, error)

    def _authenticate_with_credentials_service(self, service: str) -> None:
        """Authenticate to a specific manager using credentials."""
        data = {
            "appName": service,
            "apple_id": self.user.account_name,
            "password": self.user.password,
        }

        try:
            self.post("%s/accountLogin" % self.SETUP_ENDPOINT, data=json.dumps(data))

            self.data = self._validate_token()
        except exception.ICloudAPIResponseException as error:
            msg = "Invalid email/password combination."
            raise exception.ICloudFailedLoginException(msg, error)

    def _validate_token(self) -> dict:
        """Checks if the current access token is still valid."""
        LOG.debug("Checking session token validity")
        try:
            req = self.post("%s/validate" % self.SETUP_ENDPOINT, data="null")
            LOG.debug("Session token is still valid")
            return req.json()
        except exception.ICloudAPIResponseException as error:
            LOG.debug("Invalid authentication token")
            raise error

    def _get_auth_headers(self, overrides=None) -> dict[str, str]:
        headers = {
            "Accept": "application/json, text/javascript",
            "Content-Type": "application/json",
            "User-Agent": _USER_AGENT,
            "X-Apple-FD-Client-Info": json.dumps(
                {"U": _USER_AGENT, "L": "en-US", "Z": "GMT+00:00", "V": "1.1", "F": ""},
                separators=(",", ":"),
            ),
            "X-Apple-OAuth-Client-Id": (
                "d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d"
            ),
            "X-Apple-OAuth-Client-Type": "firstPartyAuth",
            "X-Apple-OAuth-Redirect-URI": self.HOME_ENDPOINT,
            "X-Apple-OAuth-Require-Grant-Code": "true",
            "X-Apple-OAuth-Response-Mode": "web_message",
            "X-Apple-OAuth-Response-Type": "code",
            "X-Apple-OAuth-State": self.client_id,
            "X-Apple-Frame-Id": self.client_id,
            "X-Apple-Widget-Key": (
                "d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d"
            ),
            "Referer": "https://idmsa.apple.com",
        }

        if scnt := self.session_data.get("scnt"):
            headers["scnt"] = scnt

        if session_id := self.session_data.get("session_id"):
            headers["X-Apple-ID-Session-Id"] = session_id

        if auth_attributes := self.session_data.get("auth_attributes"):
            headers["X-Apple-Auth-Attributes"] = auth_attributes

        if overrides:
            headers.update(overrides)
        return headers

    def _send_verification_code(self, device: dict) -> bool:
        """Requests that a verification code is sent to the given device."""
        data = json.dumps(device)
        request = self.post(
            "%s/sendVerificationCode" % self.SETUP_ENDPOINT,
            params=self.params,
            data=data,
        )
        return request.json().get("success", False)

    def _validate_verification_code(self, device: dict, code: str) -> bool:
        """Verifies a verification code received on a trusted device."""
        device.update({"verificationCode": code, "trustBrowser": True})
        data = json.dumps(device)

        try:
            self.post(
                "%s/validateVerificationCode" % self.SETUP_ENDPOINT,
                params=self.params,
                data=data,
            )
        except exception.ICloudAPIResponseException as error:
            if error.code == -21669:
                # Wrong verification code
                return False
            raise

        self._trust_session()

        return not self.requires_2sa

    def _validate_2fa_code(self, code: str) -> bool:
        """Verifies a verification code received via Apple's 2FA system (HSA2)."""
        data = {"securityCode": {"code": code}}

        headers = self._get_auth_headers({"Accept": "application/json"})

        try:
            self.post(
                "%s/verify/trusteddevice/securitycode" % self.AUTH_ENDPOINT,
                data=json.dumps(data),
                headers=headers,
            )
        except exception.ICloudAPIResponseException as error:
            if error.code == -21669:
                # Wrong verification code
                LOG.error("Code verification failed.")
                return False
            raise

        LOG.debug("Code verification successful.")

        self._trust_session()
        return not self.requires_2sa

    def _trust_session(self) -> bool:
        """Request session trust to avoid user log in going forward."""
        headers = self._get_auth_headers()

        try:
            self.get(
                "%s/2sv/trust" % self.AUTH_ENDPOINT,
                headers=headers,
            )
            self._authenticate_with_token()
            return True
        except exception.ICloudAPIResponseException:
            LOG.error("Session trust failed.")
            return False

    def request(  # type: ignore
        self, method: str | bytes, url: str | bytes, **kwargs
    ) -> requests.Response:
        # Change logging to the right manager endpoint
        callee = inspect.stack()[2]
        module = inspect.getmodule(callee[0])
        request_logger = logging.getLogger(
            module.__name__ if module is not None else ""
        ).getChild("http")
        if self.password_filter not in request_logger.filters:
            request_logger.addFilter(self.password_filter)

        request_logger.debug("%r %r %s" % (method, url, kwargs.get("data", "")))

        has_retried = kwargs.get("retried")
        kwargs.pop("retried", None)
        response = super().request(method, url, **kwargs)

        content_type = response.headers.get("Content-Type", "").split(";")[0]
        json_mimetypes = ["application/json", "text/json"]

        for header in HEADER_DATA:
            if response.headers.get(header):
                session_arg = HEADER_DATA[header]
                self.session_data.update({session_arg: response.headers.get(header)})

        # Save session_data to file
        with open(self.session_path, "w") as outfile:
            json.dump(self.session_data, outfile)
            LOG.debug("Saved session data to file")

        # Save cookies to file
        cast(cookielib.LWPCookieJar, self.cookies).save(
            ignore_discard=True, ignore_expires=True
        )
        LOG.debug("Cookies saved to %s", self.cookiejar_path)

        if not response.ok and (
            content_type not in json_mimetypes
            or response.status_code in [421, 450, 500]
        ):
            try:
                fmip_url = self.get_webservice_url("findme")
                if (
                    has_retried is None
                    and response.status_code == 450
                    and fmip_url in url
                ):
                    # Handle re-authentication for Find My iPhone
                    LOG.debug("Re-authenticating Find My iPhone manager")
                    try:
                        self.authenticate(True, "find")
                    except exception.ICloudAPIResponseException:
                        LOG.debug("Re-authentication failed")
                    kwargs["retried"] = True
                    return self.request(method, url, **kwargs)
            except Exception:
                pass

            if has_retried is None and response.status_code in [421, 450, 500]:
                api_error = exception.ICloudAPIResponseException(
                    response.reason, response.status_code, retry=True
                )
                request_logger.debug(api_error)
                kwargs["retried"] = True
                return self.request(method, url, **kwargs)

            self._raise_error(response.status_code, response.reason)

        if content_type not in json_mimetypes:
            return response

        try:
            data = response.json()
        except requests.JSONDecodeError:
            request_logger.warning("Failed to parse response with JSON mimetype")
            return response

        request_logger.debug(data)

        if isinstance(data, dict):
            reason = data.get("errorMessage")
            reason = reason or data.get("reason")
            reason = reason or data.get("errorReason")
            if not reason and isinstance(data.get("error"), str):
                reason = data.get("error")
            if not reason and data.get("error"):
                reason = "Unknown reason"

            code = data.get("errorCode")
            if not code and data.get("serverErrorCode"):
                code = data.get("serverErrorCode")

            if reason:
                self._raise_error(code, reason)

        return response

    def _raise_error(self, code: int | str | None, reason: str) -> NoReturn:
        if self.requires_2sa and reason == "Missing X-APPLE-WEBAUTH-TOKEN cookie":
            raise exception.ICloud2SARequiredException(self.user.account_name)
        if code in ("ZONE_NOT_FOUND", "AUTHENTICATION_FAILED"):
            reason = (
                "Please log into https://icloud.com/ to manually "
                "finish setting up your iCloud manager"
            )
            api_error: exception.ICloudException = (
                exception.ICloudServiceNotActivatedException(reason, code)
            )
            LOG.error(api_error)

            raise api_error
        if code == "ACCESS_DENIED":
            reason = (
                reason + ".  Please wait a few minutes then try again."
                "The remote servers might be trying to throttle requests."
            )
        if code in [421, 450, 500]:
            reason = "Authentication required for Account."

        api_error = exception.ICloudAPIResponseException(reason, code)
        LOG.error(api_error)
        raise api_error

    @staticmethod
    def _init_cookie_directory(cookie_directory: str | None) -> str:
        if cookie_directory:
            cookie_directory = os.path.expanduser(os.path.normpath(cookie_directory))
            if not os.path.exists(cookie_directory):
                os.mkdir(cookie_directory, 0o700)
        else:
            topdir = os.path.join(tempfile.gettempdir(), "pyicloud")
            cookie_directory = os.path.join(topdir, getpass.getuser())
            if not os.path.exists(topdir):
                os.mkdir(topdir, 0o777)
            if not os.path.exists(cookie_directory):
                os.mkdir(cookie_directory, 0o700)
        return cookie_directory

    @staticmethod
    def _load_session_data(session_path: str) -> dict:
        try:
            with open(session_path) as file:
                return json.load(file)
        except FileNotFoundError:
            LOG.debug("Session file does not exist")
            return {}

    @staticmethod
    def _load_cookies(cookiejar_path: str) -> cookielib.LWPCookieJar:
        cookies = cookielib.LWPCookieJar(filename=cookiejar_path)
        if os.path.exists(cookiejar_path):
            try:
                cookies.load(ignore_discard=True, ignore_expires=True)
                LOG.debug("Read cookies from %s" % cookiejar_path)
            except (FileNotFoundError, ValueError):
                # Most likely a pickled cookiejar from earlier versions.
                # The cookiejar will get replaced with a valid one after
                # successful authentication.
                LOG.warning("Failed to read cookiejar %s" % cookiejar_path)
        return cookies


@dataclasses.dataclass
class _User:
    account_name: str
    password: str


class _SrpPassword:
    def __init__(self, password: str):
        self._password_hash = hashlib.sha256(password.encode("utf-8")).digest()
        self.salt = b""
        self.iterations = 0
        self.key_length = 0
        self.protocol = "s2k"

    def set_encrypt_info(
        self, salt: bytes, iterations: int, key_length: int, protocol: str = "s2k"
    ):
        self.salt = salt
        self.iterations = iterations
        self.key_length = key_length
        self.protocol = protocol

    def encode(self):
        if self.protocol == "s2k_fo":
            password_digest = self._password_hash.hex().encode()
        else:
            password_digest = self._password_hash
        return hashlib.pbkdf2_hmac(
            "sha256", password_digest, self.salt, self.iterations, self.key_length
        )


class _PasswordFilter(logging.Filter):
    """Hides the password when logging."""

    def __init__(self, password: str) -> None:
        super().__init__(password)

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        if self.name in message:
            record.msg = message.replace(self.name, "*" * 8)
            record.args = ()
        return True
