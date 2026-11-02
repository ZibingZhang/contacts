"""The schemas this app owns.

These are seeded into the database at startup if absent, and are marked
`builtin` so their fields aren't editable. The contact schema deliberately
mirrors the shape the contact blobs already have on disk, so no stored data
has to change.
"""
from __future__ import annotations

from contacts.model import schema
from contacts.model.schema import Field, Schema

# "Name (Year) — Majors (minor: Minors)" -- matches the old formatEducationEntry.
# `_high_school_fields()` has no majors/minors key at all, so those bracketed
# segments simply resolve as absent and drop, leaving "Name (Year)".
_EDUCATION_ENTRY_TEMPLATE = (
    "{name}[ ({graduation_year})][ — {majors}][ (minor: {minors})]"
)


def _university_fields() -> list[Field]:
    return [
        Field("name", "Name", "text", required=True),
        Field("graduation_year", "Graduation year", "integer"),
        Field("majors", "Majors", "text", many=True),
        Field("minors", "Minors", "text", many=True),
    ]


def _high_school_fields() -> list[Field]:
    # Deliberately narrower than a university: no majors or minors.
    return [
        Field("name", "Name", "text", required=True),
        Field("graduation_year", "Graduation year", "integer"),
    ]


def _icloud_fields() -> list[Field]:
    return [
        Field("uuid", "UUID", "text", required=True),
        Field("etag", "ETag", "text"),
        Field(
            "photo",
            "Photo",
            "object",
            fields=[
                Field("url", "URL", "text", required=True),
                Field(
                    "crop",
                    "Crop",
                    "object",
                    fields=[
                        Field("height", "Height", "integer", required=True),
                        Field("width", "Width", "integer", required=True),
                        Field("x", "X", "integer", required=True),
                        Field("y", "Y", "integer", required=True),
                    ],
                ),
                Field("signature", "Signature", "text"),
                Field("whitelisted", "Whitelisted", "boolean"),
            ],
        ),
    ]


CONTACT_SCHEMA = Schema(
    name=schema.TYPE_CONTACT,
    label="Contact",
    builtin=True,
    title_field="name",
    fields=[
        Field(
            "name",
            "Name",
            "object",
            required=True,
            fields=[
                Field("prefix", "Prefix", "text"),
                Field("first_name", "First name", "text"),
                Field("nickname", "Nickname", "text"),
                Field("deadname", "Deadname", "text"),
                Field("maiden_name", "Maiden name", "text"),
                Field("middle_name", "Middle name", "text"),
                Field("last_name", "Last name", "text"),
                Field("suffix", "Suffix", "text"),
                Field("chinese_name", "Chinese name", "text"),
            ],
        ),
        Field("birthday", "Birthday", "date"),
        Field(
            "dated",
            "Dated",
            "object",
            fields=[
                Field("start", "Start", "date", required=True),
                Field("end", "End", "date", required=True),
            ],
            display="template",
            display_options={"template": "[{start}][ – {end}]"},
        ),
        Field(
            "education",
            "Education",
            "object",
            fields=[
                Field(
                    "high_school",
                    "High school",
                    "object",
                    fields=_high_school_fields(),
                    display="template",
                    display_options={"template": _EDUCATION_ENTRY_TEMPLATE},
                ),
                Field(
                    "bachelor",
                    "Bachelor's",
                    "object",
                    fields=_university_fields(),
                    display="template",
                    display_options={"template": _EDUCATION_ENTRY_TEMPLATE},
                ),
                Field(
                    "master",
                    "Master's",
                    "object",
                    fields=_university_fields(),
                    display="template",
                    display_options={"template": _EDUCATION_ENTRY_TEMPLATE},
                ),
                Field(
                    "law",
                    "Law",
                    "object",
                    fields=_university_fields(),
                    display="template",
                    display_options={"template": _EDUCATION_ENTRY_TEMPLATE},
                ),
                Field(
                    "medical",
                    "Medical",
                    "object",
                    fields=_university_fields(),
                    display="template",
                    display_options={"template": _EDUCATION_ENTRY_TEMPLATE},
                ),
                Field(
                    "phd",
                    "PhD",
                    "object",
                    fields=_university_fields(),
                    display="template",
                    display_options={"template": _EDUCATION_ENTRY_TEMPLATE},
                ),
            ],
            display="rows_by_field",
        ),
        Field(
            "email_addresses",
            "Email addresses",
            "object",
            many=True,
            order_by="address",
            fields=[
                Field("address", "Address", "text", required=True),
                Field("label", "Label", "text", required=True),
            ],
            display="rows_by_item",
            display_options={
                "value_display": "link",
                "value_display_options": {"href_template": "mailto:{address}"},
            },
        ),
        Field(
            "favorite",
            "Favorites",
            "any",
            display="flatten_entries",
            display_options={"label_prefix": "Favorite"},
        ),
        Field("friends_friend", "Friend's friend", "text"),
        Field("notes", "Notes", "long_text"),
        Field(
            "phone_numbers",
            "Phone numbers",
            "object",
            many=True,
            fields=[
                Field("number", "Number", "text", required=True),
                Field(
                    "country_code",
                    "Country code",
                    "select",
                    options_from="country_code",
                    default=1,
                ),
                Field("label", "Label", "text"),
            ],
            display="rows_by_item",
            display_options={"value_display": "phone_number"},
        ),
        Field(
            "social_profiles",
            "Social profiles",
            "object",
            fields=[
                Field(
                    "facebook",
                    "Facebook",
                    "object",
                    fields=[
                        Field("user_id", "User id", "text"),
                        Field("username", "Username", "text"),
                    ],
                    display="link",
                    display_options={
                        "href_template": "https://www.facebook.com/{username|user_id}"
                    },
                ),
                Field(
                    "game_center",
                    "Game Center",
                    "object",
                    fields=[
                        Field("link", "Link", "text", required=True),
                        Field("username", "Username", "text", required=True),
                    ],
                    display="template",
                    display_options={"template": "{username}"},
                ),
                Field(
                    "instagram",
                    "Instagram",
                    "object",
                    fields=[
                        Field("username", "Username", "text", required=True),
                        Field(
                            "finsta_usernames",
                            "Finsta usernames",
                            "text",
                            many=True,
                            display="link",
                            display_options={
                                "href_template": "https://www.instagram.com/{value}"
                            },
                        ),
                    ],
                    display="link",
                    display_options={
                        "href_template": "https://www.instagram.com/{username}"
                    },
                ),
                Field(
                    "linkedin",
                    "LinkedIn",
                    "object",
                    fields=[
                        Field("username", "Username", "text", required=True),
                    ],
                    display="link",
                    display_options={
                        "href_template": "https://www.linkedin.com/in/{username}"
                    },
                ),
            ],
            display="rows_by_field",
        ),
        Field(
            "street_addresses",
            "Street addresses",
            "object",
            many=True,
            fields=[
                Field("label", "Label", "text", required=True),
                Field("country", "Country", "select", options_from="country"),
                Field("city", "City", "text"),
                Field("postal_code", "Postal code", "text"),
                Field("state", "State", "text"),
                Field("street", "Street", "text", many=True),
            ],
            display="rows_by_item",
            display_options={
                "value_display": "lines",
                "value_display_options": {
                    "lines": [
                        {"fields": ["street"]},
                        {"fields": ["city", "state", "postal_code"], "separator": ", "},
                        {"fields": ["country"]},
                    ],
                    "join_with": " · ",
                },
            },
        ),
        Field("tags", "Tags", "text", many=True, unique=True, display="chips"),
        Field("icloud", "iCloud", "object", managed=True, fields=_icloud_fields()),
    ],
)


LIST_SCHEMA = Schema(
    name=schema.TYPE_LIST,
    label="List",
    builtin=True,
    title_field="name",
    fields=[
        Field("name", "Name", "text", required=True),
        # Optional: a list with no query is maintained by hand. With one, the
        # refresh action re-runs it and reconciles membership.
        Field("query", "Query", "long_text"),
        Field("member_type", "Member type", "text", default=schema.TYPE_CONTACT),
        Field("sync", "Sync to iCloud", "boolean", default=False),
        Field(
            "icloud",
            "iCloud",
            "object",
            managed=True,
            fields=[
                Field("uuid", "UUID", "text", required=True),
                Field("etag", "ETag", "text"),
            ],
        ),
    ],
)


ASSOCIATION_SCHEMA = Schema(
    name=schema.TYPE_ASSOCIATION,
    label="Association",
    builtin=True,
    fields=[
        Field("object_type_1", "Object type 1", "text", required=True),
        Field("object_id_1", "Object id 1", "integer", required=True),
        Field("object_type_2", "Object type 2", "text", required=True),
        Field("object_id_2", "Object id 2", "integer", required=True),
    ],
)


# Deliberately no schema describes schema objects themselves. "schema" is
# the row-type tag every schema definition is stored under (including these
# three) -- it names a storage convention, not an addressable object type, so
# it is never itself one of the types below. `schema.validate_schema` is what
# actually validates a schema object, in code, with no stored schema backing
# it; see schema.py for why.
BUILT_IN_SCHEMAS: dict[str, Schema] = {
    CONTACT_SCHEMA.name: CONTACT_SCHEMA,
    LIST_SCHEMA.name: LIST_SCHEMA,
    ASSOCIATION_SCHEMA.name: ASSOCIATION_SCHEMA,
}
