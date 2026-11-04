import type { SchemaObject } from "./types";

// A client-side-only stand-in schema, purely so the generic, schema-driven
// sidebar/title machinery (TypeObjectList, TypeNav) can title/group/pluralize
// rows of actual schema objects. Never sent to the server -- the backend
// deliberately has no schema-object literally named "schema" (a schema
// describing schema rows' own shape could let an edit corrupt the validation
// mechanism it depends on), so this can't be fetched the normal way.
export const SCHEMA_META_SCHEMA: SchemaObject = {
  id: 0,
  name: "schema",
  label: { singular: "Schema", plural: "Schemas" },
  fields: [{ key: "name", label: "Name", type: "text", required: true }],
  title_field: "name",
};
