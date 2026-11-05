"""The model for object type schemas.

A schema describes an object type: its name, and the fields objects of that
type may carry. Schemas are themselves stored as objects (type "schema"), so
they are listable and editable through the same machinery as everything
else -- with one deliberate exception: there is no schema describing schema
objects. "schema" is the row-type tag every schema definition is stored
under; treating it as just another addressable type would let a schema
describe (and a bad edit corrupt) the very mechanism that validates it. What
actually validates a schema object is `validate_schema` below, in code, with
no stored schema backing it and no such regress to stop.
"""
from __future__ import annotations

import dataclasses
from collections.abc import Callable
from typing import Any, Literal, get_args

from contacts.model import date, enumeration
from contacts.utils.object_utils import Object

TYPE_SCHEMA = "schema"
TYPE_CONTACT = "contact"
TYPE_LIST = "list"
TYPE_ASSOCIATION = "association"

FieldType = Literal[
    "text",
    "long_text",
    "integer",
    "number",
    "boolean",
    # A date string whose unknown parts are masked, e.g. "1990-XX-XX".
    "date",
    # A scalar constrained to `options` or `options_from`.
    "select",
    # Another object, referenced by its id within `ref_type`.
    "reference",
    # A nested record, shaped by `fields`.
    "object",
    # An open map, for data this app deliberately doesn't model.
    "any",
]

FIELD_TYPES: tuple[str, ...] = get_args(FieldType)

# Option sets a `select` field can draw on by name, rather than restating
# them in every schema that needs them.
OPTION_SOURCES: dict[str, Callable[[], list]] = {
    "country": enumeration.Country.values,
    "country_code": enumeration.CountryCode.values,
}

# Labeled counterparts of OPTION_SOURCES, for clients that want a display
# label alongside each allowed value (e.g. a country name for a country
# code) rather than just the bare value.
OPTION_LABELS: dict[str, Callable[[], list[dict]]] = {
    "country": enumeration.Country.labeled_values,
    "country_code": enumeration.CountryCode.labeled_values,
}

# Named presentation hints a field's `display` may select -- purely a
# frontend concern (a small, reusable renderer per kind), never consulted
# while validating or storing an object. `display_options` carries each
# kind's own parameters and isn't validated beyond "is a dict", the same
# way `default`'s shape isn't validated against the field's own type.
DISPLAY_KINDS = frozenset(
    {
        "chips",
        "template",
        "join_fields",
        "lines",
        "link",
        "phone_number",
        "rows_by_item",
        "rows_by_field",
        "flatten_entries",
    }
)


class SchemaError(Exception):
    """Raised when a schema itself is malformed."""


class SchemaValidationError(Exception):
    """Raised when an object doesn't conform to its schema."""


_FIELD_ATTRIBUTES = frozenset(
    {
        "key",
        "label",
        "type",
        "many",
        "required",
        "managed",
        "default",
        "fields",
        "options",
        "options_from",
        "ref_type",
        "unique",
        "order_by",
        "display",
        "display_options",
        "searchable",
    }
)

_SCHEMA_ATTRIBUTES = frozenset({"name", "label", "fields", "builtin", "title_field", "sort_template"})


@dataclasses.dataclass
class Field:
    """One field in a schema.

    Attributes:
        key: The field's key in the object's data.
        label: The field's display name.
        type: The field's type.
        many: Whether the field holds a list of `type` rather than one.
        required: Whether the field must be present.
        managed: Whether the server owns the field, in which case it is
            stripped from writes rather than accepted from a client.
        default: A value applied when the field is absent.
        fields: The nested record's shape, when `type` is "object".
        options: The allowed values, when `type` is "select".
        options_from: The name of an entry in `OPTION_SOURCES` supplying the
            allowed values, when `type` is "select".
        ref_type: The referenced object's type, when `type` is "reference".
        unique: Whether to dedupe and sort the values of a scalar `many`
            field, e.g. a contact's tags.
        order_by: The nested key to sort an object `many` field's items by,
            e.g. a contact's email addresses by address.
        display: A named presentation hint for a client to render this
            field's value with (e.g. "chips", "link"), one of
            `DISPLAY_KINDS`. Purely cosmetic -- never consulted here.
        display_options: Parameters for `display`, shaped per kind (e.g. a
            `link`'s `href_template`). Opaque to this module.
        searchable: Whether a client's text search should match against
            this field's value, in addition to whatever it already matches
            on an object's display title. Never consulted here -- purely a
            hint for the frontend's search-ranking text.
    """

    key: str
    label: str
    type: FieldType
    many: bool = False
    required: bool = False
    managed: bool = False
    default: Any = None
    fields: list[Field] | None = None
    options: list[Any] | None = None
    options_from: str | None = None
    ref_type: str | None = None
    unique: bool = False
    order_by: str | None = None
    display: str | None = None
    display_options: dict | None = None
    searchable: bool = False

    def to_dict(self) -> dict:
        """Serialize the field, omitting anything left at its default.

        Returns:
            The field as a plain dict.
        """
        data: dict[str, Any] = {
            "key": self.key,
            "label": self.label,
            "type": self.type,
        }

        if self.many:
            data["many"] = True
        if self.required:
            data["required"] = True
        if self.managed:
            data["managed"] = True
        if self.default is not None:
            data["default"] = self.default
        if self.fields is not None:
            data["fields"] = [field.to_dict() for field in self.fields]
        if self.options is not None:
            data["options"] = list(self.options)
        if self.options_from is not None:
            data["options_from"] = self.options_from
        if self.ref_type is not None:
            data["ref_type"] = self.ref_type
        if self.unique:
            data["unique"] = True
        if self.order_by is not None:
            data["order_by"] = self.order_by
        if self.display is not None:
            data["display"] = self.display
        if self.display_options is not None:
            data["display_options"] = dict(self.display_options)
        if self.searchable:
            data["searchable"] = True

        return data

    def allowed_options(self) -> list:
        """Resolve the field's allowed values.

        Returns:
            The allowed values for a "select" field, empty otherwise.
        """
        if self.options is not None:
            return self.options
        if self.options_from is not None:
            return OPTION_SOURCES[self.options_from]()
        return []

    def option_pairs(self) -> list[dict]:
        """Resolve the field's allowed values as labeled pairs, for display.

        Returns:
            `{"value": ..., "label": str}` for each allowed value of a
            "select" field, empty otherwise. An explicit `options` list has
            no label information beyond the value itself; `options_from`
            sources may supply a friendlier label (e.g. a country name for
            a country code).
        """
        if self.options is not None:
            return [{"value": option, "label": str(option)} for option in self.options]
        if self.options_from is not None:
            return OPTION_LABELS[self.options_from]()
        return []


@dataclasses.dataclass
class Schema:
    """An object type definition.

    Attributes:
        name: The type key, e.g. "contact". Used as the object's `type`.
        label: The type's display name, as {"singular": ..., "plural": ...}.
        fields: The fields objects of this type may carry.
        builtin: Whether the app owns this schema, in which case its fields
            are not editable.
        title_field: The key of the top-level field a client should use as
            an object's display title, e.g. "name". Optional -- a client is
            expected to fall back to some heuristic of its own when absent.
        sort_template: A template string (same `{field}`/`[optional segment]`
            syntax as a field's `display: "template"`, dotted paths allowed,
            e.g. "{name.first_name} {name.last_name}") a client should
            render and sort/group objects by when no search query is active.
            Optional -- a client is expected to fall back to its own title
            heuristic when absent. Purely a hint for the frontend -- never
            consulted here.
    """

    name: str
    label: dict[str, str]
    fields: list[Field]
    builtin: bool = False
    title_field: str | None = None
    sort_template: str | None = None

    def to_dict(self) -> Object:
        """Serialize the schema.

        Returns:
            The schema as a plain dict, suitable for an object's `data`.
        """
        data: Object = {
            "name": self.name,
            "label": dict(self.label),
            "fields": [field.to_dict() for field in self.fields],
        }
        if self.builtin:
            data["builtin"] = True
        if self.title_field is not None:
            data["title_field"] = self.title_field
        if self.sort_template is not None:
            data["sort_template"] = self.sort_template
        return data

    def field(self, key: str) -> Field | None:
        """Look a field up by key.

        Args:
            key: The field key to look for.

        Returns:
            The matching field, or None.
        """
        for field in self.fields:
            if field.key == key:
                return field
        return None


def _parse_field(data: Any, path: str) -> Field:
    if not isinstance(data, dict):
        raise SchemaError(f"{path}: field must be an object")

    unknown = sorted(set(data) - _FIELD_ATTRIBUTES)
    if unknown:
        raise SchemaError(f"{path}: unknown field attributes: {', '.join(unknown)}")

    key = data.get("key")
    if not isinstance(key, str) or not key:
        raise SchemaError(f"{path}: field key must be a non-empty string")

    field_path = f"{path}.{key}" if path else key

    label = data.get("label", key)
    if not isinstance(label, str):
        raise SchemaError(f"{field_path}: field label must be a string")

    field_type = data.get("type")
    if field_type not in FIELD_TYPES:
        raise SchemaError(
            f"{field_path}: field type must be one of {', '.join(FIELD_TYPES)}"
        )

    for flag in ("many", "required", "managed", "unique", "searchable"):
        if flag in data and not isinstance(data[flag], bool):
            raise SchemaError(f"{field_path}: {flag} must be a boolean")

    many = bool(data.get("many", False))
    if data.get("unique") and not many:
        raise SchemaError(f"{field_path}: only many fields may be unique")

    nested: list[Field] | None = None
    if field_type == "object":
        raw_nested = data.get("fields")
        if not isinstance(raw_nested, list) or not raw_nested:
            raise SchemaError(f"{field_path}: object fields require a non-empty fields")
        nested = _parse_fields(raw_nested, field_path)
    elif "fields" in data:
        raise SchemaError(f"{field_path}: only object fields may declare fields")

    options = data.get("options")
    options_from = data.get("options_from")
    if field_type == "select":
        if (options is None) == (options_from is None):
            raise SchemaError(
                f"{field_path}: select fields need exactly one of "
                "options or options_from"
            )
        if options is not None and (not isinstance(options, list) or not options):
            raise SchemaError(f"{field_path}: options must be a non-empty list")
        if options_from is not None and options_from not in OPTION_SOURCES:
            raise SchemaError(
                f"{field_path}: unknown options_from {options_from!r}; "
                f"expected one of {', '.join(sorted(OPTION_SOURCES))}"
            )
    elif options is not None or options_from is not None:
        raise SchemaError(f"{field_path}: only select fields may declare options")

    ref_type = data.get("ref_type")
    if field_type == "reference":
        if not isinstance(ref_type, str) or not ref_type:
            raise SchemaError(f"{field_path}: reference fields require a ref_type")
    elif ref_type is not None:
        raise SchemaError(f"{field_path}: only reference fields may declare ref_type")

    order_by = data.get("order_by")
    if order_by is not None:
        if not many or field_type != "object":
            raise SchemaError(
                f"{field_path}: only object many fields may declare order_by"
            )
        if order_by not in {nested_field.key for nested_field in nested or []}:
            raise SchemaError(
                f"{field_path}: order_by {order_by!r} is not one of its fields"
            )

    display = data.get("display")
    if display is not None and display not in DISPLAY_KINDS:
        raise SchemaError(
            f"{field_path}: unknown display {display!r}; "
            f"expected one of {', '.join(sorted(DISPLAY_KINDS))}"
        )

    display_options = data.get("display_options")
    if display_options is not None and not isinstance(display_options, dict):
        raise SchemaError(f"{field_path}: display_options must be an object")
    if display_options is not None and display is None:
        raise SchemaError(f"{field_path}: display_options requires display")

    return Field(
        key=key,
        label=label,
        type=field_type,
        many=many,
        required=bool(data.get("required", False)),
        managed=bool(data.get("managed", False)),
        default=data.get("default"),
        fields=nested,
        options=options,
        options_from=options_from,
        ref_type=ref_type,
        unique=bool(data.get("unique", False)),
        order_by=order_by,
        display=display,
        display_options=display_options,
        searchable=bool(data.get("searchable", False)),
    )


def _parse_fields(data: list, path: str) -> list[Field]:
    fields = [_parse_field(item, path) for item in data]

    keys = [field.key for field in fields]
    duplicates = sorted({key for key in keys if keys.count(key) > 1})
    if duplicates:
        raise SchemaError(
            f"{path or 'schema'}: duplicate field keys: {', '.join(duplicates)}"
        )

    return fields


def validate_schema(data: Any) -> Schema:
    """Parse and validate a schema object's data.

    This is what actually checks `type='schema'` objects. There is no stored
    schema driving this -- see the module docstring for why.

    Args:
        data: A schema object's data.

    Returns:
        The parsed schema.

    Raises:
        SchemaError: If the schema is malformed.
    """
    if not isinstance(data, dict):
        raise SchemaError("Schema must be an object")

    unknown = sorted(set(data) - _SCHEMA_ATTRIBUTES)
    if unknown:
        raise SchemaError(f"schema: unknown attributes: {', '.join(unknown)}")

    name = data.get("name")
    if not isinstance(name, str) or not name:
        raise SchemaError("schema: name must be a non-empty string")
    if not name.isidentifier():
        raise SchemaError(
            f"schema: name {name!r} must be a valid identifier, since it names "
            "the type's SQL view"
        )
    if name == TYPE_SCHEMA:
        raise SchemaError(
            f"schema: name {name!r} is reserved -- it tags every schema "
            "definition's storage row and can't also name one"
        )

    raw_label = data.get("label")
    if raw_label is None:
        label = {"singular": name, "plural": f"{name}s"}
    else:
        if not isinstance(raw_label, dict):
            raise SchemaError(f"{name}: label must be an object")
        unknown_label_keys = sorted(set(raw_label) - {"singular", "plural"})
        if unknown_label_keys:
            raise SchemaError(
                f"{name}: unknown label attributes: {', '.join(unknown_label_keys)}"
            )
        singular = raw_label.get("singular")
        if not isinstance(singular, str) or not singular:
            raise SchemaError(f"{name}: label.singular must be a non-empty string")
        plural = raw_label.get("plural", f"{singular}s")
        if not isinstance(plural, str) or not plural:
            raise SchemaError(f"{name}: label.plural must be a non-empty string")
        label = {"singular": singular, "plural": plural}

    builtin = data.get("builtin", False)
    if not isinstance(builtin, bool):
        raise SchemaError(f"{name}: builtin must be a boolean")

    raw_fields = data.get("fields")
    if not isinstance(raw_fields, list) or not raw_fields:
        raise SchemaError(f"{name}: fields must be a non-empty list")

    fields = _parse_fields(raw_fields, "")

    title_field = data.get("title_field")
    if title_field is not None:
        if not isinstance(title_field, str):
            raise SchemaError(f"{name}: title_field must be a string")
        if title_field not in {field.key for field in fields}:
            raise SchemaError(
                f"{name}: title_field {title_field!r} is not one of its fields"
            )

    # Not validated against `fields` beyond being a string -- like a field's
    # own `display_options.template`, its placeholders (including dotted
    # paths into nested fields) are opaque here and resolved client-side.
    sort_template = data.get("sort_template")
    if sort_template is not None and not isinstance(sort_template, str):
        raise SchemaError(f"{name}: sort_template must be a string")

    return Schema(
        name=name,
        label=label,
        fields=fields,
        builtin=builtin,
        title_field=title_field,
        sort_template=sort_template,
    )


def _join(path: str, key: str) -> str:
    return f"{path}.{key}" if path else key


def _validate_scalar(field: Field, value: Any, path: str) -> None:
    match field.type:
        case "text" | "long_text":
            if not isinstance(value, str):
                raise SchemaValidationError(f"{path} must be a string")
        case "integer":
            if not isinstance(value, int) or isinstance(value, bool):
                raise SchemaValidationError(f"{path} must be an integer")
        case "number":
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                raise SchemaValidationError(f"{path} must be a number")
        case "boolean":
            if not isinstance(value, bool):
                raise SchemaValidationError(f"{path} must be a boolean")
        case "date":
            if not isinstance(value, str) or not date.PATTERN.match(value):
                raise SchemaValidationError(
                    f"{path} must be a date like YYYY-MM-DD, where unknown "
                    "parts are masked as XXXX-XX-XX"
                )
        case "select":
            options = field.allowed_options()
            if value not in options:
                allowed = ", ".join(str(option) for option in options)
                raise SchemaValidationError(f"{path} must be one of {allowed}")
        case "reference":
            if not isinstance(value, int) or isinstance(value, bool):
                raise SchemaValidationError(
                    f"{path} must be the integer id of a {field.ref_type}"
                )
        case "object":
            if not isinstance(value, dict):
                raise SchemaValidationError(f"{path} must be an object")
            _validate_fields(field.fields or [], value, path)
        case "any":
            if not isinstance(value, dict):
                raise SchemaValidationError(f"{path} must be an object")


def _validate_value(field: Field, value: Any, path: str) -> None:
    if not field.many:
        _validate_scalar(field, value, path)
        return

    if not isinstance(value, list):
        raise SchemaValidationError(f"{path} must be a list")

    for index, item in enumerate(value):
        item_path = f"{path}[{index}]"
        if item is None:
            raise SchemaValidationError(f"{item_path} must not be null")
        _validate_scalar(field, item, item_path)


def _validate_fields(fields: list[Field], data: Any, path: str) -> None:
    if not isinstance(data, dict):
        raise SchemaValidationError(f"{path or 'object'} must be an object")

    by_key = {field.key: field for field in fields}

    unknown = sorted(set(data) - set(by_key))
    if unknown:
        joined = ", ".join(_join(path, key) for key in unknown)
        raise SchemaValidationError(f"Unknown field(s): {joined}")

    for field in fields:
        value = data.get(field.key)
        field_path = _join(path, field.key)

        if value is None:
            if field.required:
                raise SchemaValidationError(f"{field_path} is required")
            continue

        _validate_value(field, value, field_path)


def validate_object(schema: Schema, data: Any) -> None:
    """Check an object's data against its schema.

    Unknown keys are rejected, which is what the old dataclasses'
    `Undefined.RAISE` config used to do.

    Args:
        schema: The schema to validate against.
        data: The object's data.

    Raises:
        SchemaValidationError: If the data doesn't conform.
    """
    _validate_fields(schema.fields, data, "")


def _apply_field_defaults(fields: list[Field], data: Object) -> Object:
    result = dict(data)

    for field in fields:
        value = result.get(field.key)

        if value is None:
            if field.default is not None:
                result[field.key] = field.default
            continue

        if field.type != "object" or field.fields is None:
            continue

        # Only fill nested defaults where the parent is actually present, so
        # absent nested records aren't materialized out of nothing.
        if field.many and isinstance(value, list):
            result[field.key] = [
                _apply_field_defaults(field.fields, item)
                if isinstance(item, dict)
                else item
                for item in value
            ]
        elif not field.many and isinstance(value, dict):
            result[field.key] = _apply_field_defaults(field.fields, value)

    return result


def apply_defaults(schema: Schema, data: Object) -> Object:
    """Fill in defaults for fields the data doesn't carry.

    Args:
        schema: The schema supplying the defaults.
        data: The object's data. Not mutated.

    Returns:
        A new object with defaults applied.
    """
    return _apply_field_defaults(schema.fields, data)


def _normalize_fields(fields: list[Field], data: Object) -> Object:
    result = dict(data)

    for field in fields:
        value = result.get(field.key)
        if value is None:
            continue

        if field.many and isinstance(value, list):
            if field.unique:
                # Matches what the old Contact.__setattr__ did for tags:
                # dedupe and sort in one step.
                value = sorted(set(value))
            elif field.order_by is not None:
                order_by = field.order_by
                value = sorted(
                    value,
                    key=lambda item: (
                        item.get(order_by, "") if isinstance(item, dict) else ""
                    ),
                )

            if field.type == "object" and field.fields is not None:
                value = [
                    _normalize_fields(field.fields, item)
                    if isinstance(item, dict)
                    else item
                    for item in value
                ]

            result[field.key] = value
        elif (
            not field.many
            and field.type == "object"
            and field.fields is not None
            and isinstance(value, dict)
        ):
            result[field.key] = _normalize_fields(field.fields, value)

    return result


def normalize_object(schema: Schema, data: Object) -> Object:
    """Apply a schema's ordering and uniqueness rules to an object's data.

    These are stored-data invariants, so they're applied on every write rather
    than left to callers.

    Args:
        schema: The schema declaring the rules.
        data: The object's data. Not mutated.

    Returns:
        A new object with `unique` fields deduped and sorted, and `order_by`
        fields ordered.
    """
    return _normalize_fields(schema.fields, data)


def strip_managed(schema: Schema, data: Object) -> Object:
    """Remove server-owned fields from client-supplied data.

    Args:
        schema: The schema declaring which fields are managed.
        data: The object's data. Not mutated.

    Returns:
        A new object without the managed fields.
    """
    managed = {field.key for field in schema.fields if field.managed}
    return {key: value for key, value in data.items() if key not in managed}
