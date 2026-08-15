"""Constants."""

from contacts import model

CACHE_DIRECTORY = "cache"
DATA_DIRECTORY = "data"
CONFIG_FILE = "config.ini"

CONTACT_FILES_DIRECTORY = "contacts"
CONTACTS_FILE_NAME = "contacts.json"
LOADED_CONTACT_FILE_NAME = "loaded-contact.json"
NEW_CONTACTS_FILE_NAME = "new-contacts.json"
TSV_FILE = "contacts.tsv"

FAMILIES_FILE = "families.json"

ICLOUD_CONTACTS_FILE = "icloud-contacts.json"
ICLOUD_GROUPS_FILE = "icloud-groups.json"

COUNTRY_TO_COUNTRY_CODE_MAP = {
    model.Country.IRELAND.value: "ie",
    model.Country.UNITED_STATES.value: "us",
}

VERBOSE = 15
