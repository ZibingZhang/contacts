"""Tests for contacts.model.schema."""
from __future__ import annotations

import pytest

from contacts.model import builtin_schemas, schema
from contacts.model.schema import Field, Schema


def build_schema(*fields: Field) -> Schema:
    return Schema(name="widget", label={"singular": "Widget", "plural": "Widgets"}, fields=list(fields))


def test_validate_object_accepts_an_object_with_only_optional_fields_absent():
    widget = build_schema(Field("name", "Name", "text", required=True))

    schema.validate_object(widget, {"name": "a"})


def test_validate_object_rejects_an_unknown_field():
    widget = build_schema(Field("name", "Name", "text"))

    with pytest.raises(schema.SchemaValidationError, match="Unknown field"):
        schema.validate_object(widget, {"nickname": "a"})


def test_validate_object_names_the_full_path_of_an_unknown_nested_field():
    widget = build_schema(
        Field("name", "Name", "object", fields=[Field("first", "First", "text")])
    )

    with pytest.raises(schema.SchemaValidationError, match="name.middle"):
        schema.validate_object(widget, {"name": {"middle": "a"}})


def test_validate_object_rejects_a_missing_required_field():
    widget = build_schema(Field("name", "Name", "text", required=True))

    with pytest.raises(schema.SchemaValidationError, match="name is required"):
        schema.validate_object(widget, {})


def test_validate_object_treats_an_explicit_null_as_absent():
    widget = build_schema(Field("name", "Name", "text"))

    schema.validate_object(widget, {"name": None})


def test_validate_object_rejects_an_explicit_null_for_a_required_field():
    widget = build_schema(Field("name", "Name", "text", required=True))

    with pytest.raises(schema.SchemaValidationError, match="name is required"):
        schema.validate_object(widget, {"name": None})


def test_validate_object_rejects_a_non_string_for_text():
    widget = build_schema(Field("name", "Name", "text"))

    with pytest.raises(schema.SchemaValidationError, match="name must be a string"):
        schema.validate_object(widget, {"name": 1})


def test_validate_object_rejects_a_bool_for_integer():
    widget = build_schema(Field("count", "Count", "integer"))

    with pytest.raises(schema.SchemaValidationError, match="must be an integer"):
        schema.validate_object(widget, {"count": True})


def test_validate_object_accepts_an_int_for_number():
    widget = build_schema(Field("amount", "Amount", "number"))

    schema.validate_object(widget, {"amount": 3})


def test_validate_object_rejects_a_bool_for_number():
    widget = build_schema(Field("amount", "Amount", "number"))

    with pytest.raises(schema.SchemaValidationError, match="must be a number"):
        schema.validate_object(widget, {"amount": False})


def test_validate_object_rejects_an_int_for_boolean():
    widget = build_schema(Field("sync", "Sync", "boolean"))

    with pytest.raises(schema.SchemaValidationError, match="must be a boolean"):
        schema.validate_object(widget, {"sync": 1})


@pytest.mark.parametrize("value", ["1990-07-04", "1990-XX-XX", "XXXX-07-04"])
def test_validate_object_accepts_a_masked_date(value):
    widget = build_schema(Field("birthday", "Birthday", "date"))

    schema.validate_object(widget, {"birthday": value})


@pytest.mark.parametrize("value", ["1990-7-4", "07/04/1990", "1990", ""])
def test_validate_object_rejects_a_malformed_date(value):
    widget = build_schema(Field("birthday", "Birthday", "date"))

    with pytest.raises(schema.SchemaValidationError, match="must be a date"):
        schema.validate_object(widget, {"birthday": value})


def test_validate_object_accepts_a_select_value_from_options():
    widget = build_schema(Field("size", "Size", "select", options=["s", "l"]))

    schema.validate_object(widget, {"size": "s"})


def test_validate_object_rejects_a_select_value_outside_options():
    widget = build_schema(Field("size", "Size", "select", options=["s", "l"]))

    with pytest.raises(schema.SchemaValidationError, match="must be one of s, l"):
        schema.validate_object(widget, {"size": "m"})


def test_validate_object_resolves_select_options_from_a_named_source():
    widget = build_schema(Field("code", "Code", "select", options_from="country_code"))

    schema.validate_object(widget, {"code": 1})


def test_validate_object_rejects_a_value_outside_a_named_option_source():
    widget = build_schema(Field("code", "Code", "select", options_from="country_code"))

    with pytest.raises(schema.SchemaValidationError, match="must be one of"):
        schema.validate_object(widget, {"code": 999})


def test_option_pairs_labels_explicit_options_with_themselves():
    field = Field("size", "Size", "select", options=["s", "l"])

    assert field.option_pairs() == [
        {"value": "s", "label": "s"},
        {"value": "l", "label": "l"},
    ]


def test_option_pairs_resolves_labels_from_a_named_source():
    field = Field("code", "Code", "select", options_from="country_code")

    assert {"value": 1, "label": "United States/Canada"} in field.option_pairs()


def test_option_pairs_is_empty_for_a_non_select_field():
    field = Field("name", "Name", "text")

    assert field.option_pairs() == []


def test_validate_object_rejects_a_scalar_where_many_expects_a_list():
    widget = build_schema(Field("tags", "Tags", "text", many=True))

    with pytest.raises(schema.SchemaValidationError, match="tags must be a list"):
        schema.validate_object(widget, {"tags": "a"})


def test_validate_object_validates_each_item_of_a_many_field():
    widget = build_schema(Field("tags", "Tags", "text", many=True))

    with pytest.raises(schema.SchemaValidationError, match=r"tags\[1\] must be"):
        schema.validate_object(widget, {"tags": ["a", 2]})


def test_validate_object_rejects_a_null_item_in_a_many_field():
    widget = build_schema(Field("tags", "Tags", "text", many=True))

    with pytest.raises(schema.SchemaValidationError, match=r"tags\[0\]"):
        schema.validate_object(widget, {"tags": [None]})


def test_validate_object_validates_nested_fields_of_many_objects():
    widget = build_schema(
        Field(
            "phones",
            "Phones",
            "object",
            many=True,
            fields=[Field("number", "Number", "text", required=True)],
        )
    )

    with pytest.raises(
        schema.SchemaValidationError, match=r"phones\[0\].number is required"
    ):
        schema.validate_object(widget, {"phones": [{}]})


def test_validate_object_rejects_a_scalar_for_an_object_field():
    widget = build_schema(
        Field("name", "Name", "object", fields=[Field("first", "First", "text")])
    )

    with pytest.raises(schema.SchemaValidationError, match="name must be an object"):
        schema.validate_object(widget, {"name": "Ada"})


def test_validate_object_accepts_any_shape_inside_an_any_field():
    widget = build_schema(Field("favorite", "Favorites", "any"))

    schema.validate_object(widget, {"favorite": {"candy": "sour", "rank": 3}})


def test_validate_object_rejects_a_scalar_for_an_any_field():
    widget = build_schema(Field("favorite", "Favorites", "any"))

    with pytest.raises(schema.SchemaValidationError, match="must be an object"):
        schema.validate_object(widget, {"favorite": "sour"})


def test_validate_object_rejects_a_non_integer_reference():
    widget = build_schema(Field("company", "Company", "reference", ref_type="company"))

    with pytest.raises(schema.SchemaValidationError, match="integer id of a company"):
        schema.validate_object(widget, {"company": "acme"})


def test_validate_schema_parses_a_well_formed_schema():
    parsed = schema.validate_schema(
        {
            "name": "company",
            "label": {"singular": "Company", "plural": "Companies"},
            "fields": [{"key": "n", "type": "text"}],
        }
    )

    assert (parsed.name, parsed.fields[0].key) == ("company", "n")
    assert parsed.label == {"singular": "Company", "plural": "Companies"}


def test_validate_schema_defaults_a_field_label_to_its_key():
    parsed = schema.validate_schema(
        {"name": "company", "fields": [{"key": "domain", "type": "text"}]}
    )

    assert parsed.fields[0].label == "domain"


def test_validate_schema_defaults_a_missing_label_to_the_name():
    parsed = schema.validate_schema(
        {"name": "company", "fields": [{"key": "domain", "type": "text"}]}
    )

    # Naive pluralization, same known limitation the frontend used to paper
    # over with a client-side `label + "s"` concat.
    assert parsed.label == {"singular": "company", "plural": "companys"}


def test_validate_schema_defaults_a_missing_plural_from_the_singular():
    parsed = schema.validate_schema(
        {
            "name": "company",
            "label": {"singular": "Company"},
            "fields": [{"key": "domain", "type": "text"}],
        }
    )

    assert parsed.label == {"singular": "Company", "plural": "Companys"}


def test_validate_schema_rejects_an_unknown_attribute():
    with pytest.raises(schema.SchemaError, match="unknown attributes: colour"):
        schema.validate_schema(
            {
                "name": "company",
                "colour": "red",
                "fields": [{"key": "n", "type": "text"}],
            }
        )


def test_validate_schema_rejects_a_name_that_is_not_an_identifier():
    with pytest.raises(schema.SchemaError, match="must be a valid identifier"):
        schema.validate_schema(
            {"name": "my company", "fields": [{"key": "n", "type": "text"}]}
        )


def test_validate_schema_rejects_the_reserved_name_schema():
    with pytest.raises(schema.SchemaError, match="is reserved"):
        schema.validate_schema(
            {"name": "schema", "fields": [{"key": "n", "type": "text"}]}
        )


def test_validate_schema_parses_a_title_field():
    parsed = schema.validate_schema(
        {
            "name": "company",
            "fields": [{"key": "n", "type": "text"}],
            "title_field": "n",
        }
    )

    assert parsed.title_field == "n"


def test_validate_schema_rejects_a_title_field_that_is_not_one_of_its_fields():
    with pytest.raises(schema.SchemaError, match="title_field 'missing'"):
        schema.validate_schema(
            {
                "name": "company",
                "fields": [{"key": "n", "type": "text"}],
                "title_field": "missing",
            }
        )


def test_validate_schema_rejects_an_empty_field_list():
    with pytest.raises(schema.SchemaError, match="fields must be a non-empty list"):
        schema.validate_schema({"name": "company", "fields": []})


def test_validate_schema_rejects_duplicate_field_keys():
    with pytest.raises(schema.SchemaError, match="duplicate field keys: n"):
        schema.validate_schema(
            {
                "name": "company",
                "fields": [{"key": "n", "type": "text"}, {"key": "n", "type": "text"}],
            }
        )


def test_validate_schema_rejects_an_unknown_field_type():
    with pytest.raises(schema.SchemaError, match="field type must be one of"):
        schema.validate_schema(
            {"name": "company", "fields": [{"key": "n", "type": "colour"}]}
        )


def test_validate_schema_rejects_an_object_field_without_nested_fields():
    with pytest.raises(schema.SchemaError, match="require a non-empty fields"):
        schema.validate_schema(
            {"name": "company", "fields": [{"key": "n", "type": "object"}]}
        )


def test_validate_schema_rejects_nested_fields_on_a_non_object_field():
    with pytest.raises(schema.SchemaError, match="only object fields may declare"):
        schema.validate_schema(
            {
                "name": "company",
                "fields": [
                    {
                        "key": "n",
                        "type": "text",
                        "fields": [{"key": "x", "type": "text"}],
                    }
                ],
            }
        )


def test_validate_schema_rejects_a_select_field_with_no_options():
    with pytest.raises(schema.SchemaError, match="exactly one of"):
        schema.validate_schema(
            {"name": "company", "fields": [{"key": "n", "type": "select"}]}
        )


def test_validate_schema_rejects_a_select_field_with_both_option_sources():
    with pytest.raises(schema.SchemaError, match="exactly one of"):
        schema.validate_schema(
            {
                "name": "company",
                "fields": [
                    {
                        "key": "n",
                        "type": "select",
                        "options": ["a"],
                        "options_from": "country",
                    }
                ],
            }
        )


def test_validate_schema_rejects_an_unknown_options_source():
    with pytest.raises(schema.SchemaError, match="unknown options_from"):
        schema.validate_schema(
            {
                "name": "company",
                "fields": [{"key": "n", "type": "select", "options_from": "colour"}],
            }
        )


def test_validate_schema_rejects_a_reference_field_without_a_ref_type():
    with pytest.raises(schema.SchemaError, match="require a ref_type"):
        schema.validate_schema(
            {"name": "company", "fields": [{"key": "n", "type": "reference"}]}
        )


def test_validate_schema_rejects_a_ref_type_on_a_non_reference_field():
    with pytest.raises(schema.SchemaError, match="only reference fields"):
        schema.validate_schema(
            {
                "name": "company",
                "fields": [{"key": "n", "type": "text", "ref_type": "contact"}],
            }
        )


def test_validate_schema_parses_a_known_display_kind():
    parsed = schema.validate_schema(
        {
            "name": "company",
            "fields": [{"key": "n", "type": "text", "many": True, "display": "chips"}],
        }
    )

    assert parsed.fields[0].display == "chips"


def test_validate_schema_rejects_an_unknown_display_kind():
    with pytest.raises(schema.SchemaError, match="unknown display"):
        schema.validate_schema(
            {
                "name": "company",
                "fields": [{"key": "n", "type": "text", "display": "sparkles"}],
            }
        )


def test_validate_schema_rejects_display_options_without_display():
    with pytest.raises(schema.SchemaError, match="display_options requires display"):
        schema.validate_schema(
            {
                "name": "company",
                "fields": [
                    {"key": "n", "type": "text", "display_options": {"template": "x"}}
                ],
            }
        )


def test_validate_schema_rejects_non_dict_display_options():
    with pytest.raises(schema.SchemaError, match="display_options must be an object"):
        schema.validate_schema(
            {
                "name": "company",
                "fields": [
                    {
                        "key": "n",
                        "type": "text",
                        "display": "template",
                        "display_options": "nope",
                    }
                ],
            }
        )


def test_validate_schema_round_trips_display_options():
    parsed = schema.validate_schema(
        {
            "name": "company",
            "fields": [
                {
                    "key": "n",
                    "type": "text",
                    "display": "link",
                    "display_options": {"href_template": "https://x/{n}"},
                }
            ],
        }
    )

    assert parsed.fields[0].to_dict()["display_options"] == {
        "href_template": "https://x/{n}"
    }


def test_apply_defaults_fills_an_absent_top_level_field():
    widget = build_schema(Field("sync", "Sync", "boolean", default=False))

    applied = schema.apply_defaults(widget, {})

    assert applied == {"sync": False}


def test_apply_defaults_leaves_a_present_value_alone():
    widget = build_schema(Field("sync", "Sync", "boolean", default=False))

    applied = schema.apply_defaults(widget, {"sync": True})

    assert applied == {"sync": True}


def test_apply_defaults_fills_nested_fields_when_the_parent_is_present():
    widget = build_schema(
        Field(
            "phone",
            "Phone",
            "object",
            fields=[Field("code", "Code", "integer", default=1)],
        )
    )

    applied = schema.apply_defaults(widget, {"phone": {}})

    assert applied == {"phone": {"code": 1}}


def test_apply_defaults_does_not_materialize_an_absent_nested_object():
    widget = build_schema(
        Field(
            "phone",
            "Phone",
            "object",
            fields=[Field("code", "Code", "integer", default=1)],
        )
    )

    applied = schema.apply_defaults(widget, {})

    assert applied == {}


def test_apply_defaults_fills_nested_fields_of_each_many_item():
    widget = build_schema(
        Field(
            "phones",
            "Phones",
            "object",
            many=True,
            fields=[Field("code", "Code", "integer", default=1)],
        )
    )

    applied = schema.apply_defaults(widget, {"phones": [{"n": "1"}, {"code": 44}]})

    assert applied == {"phones": [{"n": "1", "code": 1}, {"code": 44}]}


def test_apply_defaults_does_not_mutate_the_input():
    widget = build_schema(Field("sync", "Sync", "boolean", default=False))
    data: dict = {}

    schema.apply_defaults(widget, data)

    assert data == {}


def test_strip_managed_removes_server_owned_fields():
    widget = build_schema(
        Field("name", "Name", "text"),
        Field(
            "icloud",
            "iCloud",
            "object",
            managed=True,
            fields=[Field("uuid", "UUID", "text")],
        ),
    )

    stripped = schema.strip_managed(widget, {"name": "a", "icloud": {"uuid": "u"}})

    assert stripped == {"name": "a"}


@pytest.mark.parametrize("name", sorted(builtin_schemas.BUILT_IN_SCHEMAS))
def test_built_in_schema_round_trips_through_validate_schema(name):
    built_in = builtin_schemas.BUILT_IN_SCHEMAS[name]

    reparsed = schema.validate_schema(built_in.to_dict())

    assert reparsed.to_dict() == built_in.to_dict()


def test_contact_schema_accepts_a_fully_populated_contact():
    contact = {
        "name": {"first_name": "Ada", "last_name": "Lovelace", "chinese_name": "阿达"},
        "birthday": "1815-12-10",
        "dated": {"start": "2020-01-01", "end": "2021-XX-XX"},
        "education": {
            "high_school": {"name": "Dover-Sherborn", "graduation_year": 1830},
            "bachelor": {"name": "Cambridge", "majors": ["Maths"], "minors": ["Music"]},
        },
        "email_addresses": [{"address": "ada@example.com", "label": "HOME"}],
        "favorite": {"colour": "blue"},
        "friends_friend": "Charles Babbage",
        "notes": "met at a lecture",
        "phone_numbers": [
            {"number": "5551234567", "country_code": 1, "label": "MOBILE"}
        ],
        "social_profiles": {
            "instagram": {"username": "ada", "finsta_usernames": ["ada2"]},
            "linkedin": {"username": "ada"},
        },
        "street_addresses": [
            {
                "label": "HOME",
                "country": "United States",
                "city": "Boston",
                "state": "MA",
                "postal_code": "02101",
                "street": ["1 Main St", "Apt 2"],
            }
        ],
        "tags": ["friend", "maths"],
        "icloud": {"uuid": "u", "etag": "e"},
    }

    schema.validate_object(builtin_schemas.CONTACT_SCHEMA, contact)


def test_contact_schema_rejects_majors_on_a_high_school():
    contact = {
        "name": {"first_name": "Ada"},
        "education": {"high_school": {"name": "Dover-Sherborn", "majors": ["Maths"]}},
    }

    with pytest.raises(
        schema.SchemaValidationError, match="education.high_school.majors"
    ):
        schema.validate_object(builtin_schemas.CONTACT_SCHEMA, contact)


def test_contact_schema_rejects_an_unsupported_country():
    contact = {
        "name": {"first_name": "Ada"},
        "street_addresses": [{"label": "HOME", "country": "Narnia"}],
    }

    with pytest.raises(schema.SchemaValidationError, match="country must be one of"):
        schema.validate_object(builtin_schemas.CONTACT_SCHEMA, contact)


def test_contact_schema_requires_a_name():
    with pytest.raises(schema.SchemaValidationError, match="name is required"):
        schema.validate_object(builtin_schemas.CONTACT_SCHEMA, {"tags": ["friend"]})
