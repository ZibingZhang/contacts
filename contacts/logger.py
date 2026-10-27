import logging
import os
from datetime import datetime


# https://stackoverflow.com/a/56944275
class CustomFormatter(logging.Formatter):
    """Logging Formatter to add colors and count warning / errors"""

    grey = "\x1b[38;21m"
    yellow = "\x1b[33;21m"
    red = "\x1b[31;21m"
    bold_red = "\x1b[31;1m"
    reset = "\x1b[0m"
    base_format = "%(message)s"
    # format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s (%(filename)s:%(lineno)d)"

    FORMATS = {
        logging.DEBUG: grey + base_format + reset,
        logging.INFO: grey + base_format + reset,
        logging.WARNING: yellow + base_format + reset,
        logging.ERROR: red + base_format + reset,
        logging.CRITICAL: bold_red + base_format + reset,
    }

    def format(self, record):
        log_fmt = self.FORMATS.get(record.levelno)
        formatter = logging.Formatter(log_fmt)
        return formatter.format(record)


LOG = logging.getLogger()


def _is_http_record(record: logging.LogRecord) -> bool:
    # icloud_session.request() logs request/response bodies via a
    # "<caller module>.http" child logger -- route those to file instead
    # of the terminal, since bodies can be huge.
    return record.name.endswith(".http")


ch = logging.StreamHandler()
ch.setLevel(logging.DEBUG)
ch.setFormatter(CustomFormatter())
ch.addFilter(lambda record: not _is_http_record(record))
LOG.addHandler(ch)

HTTP_LOG_PATH = None

if os.environ.get("CONTACTS_LOG_HTTP", "").lower() in ("1", "true", "yes"):
    _LOGS_DIR = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs"
    )
    os.makedirs(_LOGS_DIR, exist_ok=True)
    HTTP_LOG_PATH = os.path.join(
        _LOGS_DIR, datetime.now().strftime("run-%Y%m%d-%H%M%S.log")
    )

    fh = logging.FileHandler(HTTP_LOG_PATH)
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter("%(asctime)s %(name)s %(message)s"))
    fh.addFilter(_is_http_record)
    LOG.addHandler(fh)

    print(f"Logging HTTP requests/responses to {HTTP_LOG_PATH}")
