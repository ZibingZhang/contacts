"""Models.

Objects -- contacts, lists, associations, and any user-defined type -- are
plain dicts described by a `Schema`, not dataclasses. What's left here is the
machinery that describes them, plus the few value types the iCloud wire models
still need.
"""
from contacts.model import date, enumeration, family, schema

Date = date.Date
DateRange = date.DateRange

Country = enumeration.Country
CountryCode = enumeration.CountryCode

Family = family.Family

Field = schema.Field
Schema = schema.Schema
SchemaError = schema.SchemaError
SchemaValidationError = schema.SchemaValidationError

TYPE_ASSOCIATION = schema.TYPE_ASSOCIATION
TYPE_CONTACT = schema.TYPE_CONTACT
TYPE_LIST = schema.TYPE_LIST
TYPE_SCHEMA = schema.TYPE_SCHEMA

# The concrete built-in schemas are deliberately not re-exported here --
# `builtin_schemas` imports `schema`, which imports this package, so pulling
# them up creates a cycle. Import `contacts.model.builtin_schemas` directly.
