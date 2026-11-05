// A generic, schema-driven filter engine: given any `SchemaField[]` (a
// contact, a list's `member_type`, or any custom type), discovers which
// fields/paths can be filtered on, matches a predicate against an in-memory
// object, and compiles predicates into a SQL fragment the backend's existing
// (already type-agnostic) list query machinery can execute. Framework-free
// on purpose -- usable from a React component, a Web Worker, or a plain
// module.
import type { OptionPair, SchemaField } from "./types";

export type FilterableFieldKind = "scalar" | "many_scalar" | "object_presence" | "many_object";

// One field/path a user can filter on, discovered from a schema. `path` is
// the dotted route to it from the object's root (e.g. ["social_profiles",
// "linkedin", "username"]); `id` is the same thing joined with "." for use
// as a stable key in URLs/selection state.
export interface FilterableField {
  id: string;
  label: string;
  kind: FilterableFieldKind;
  path: string[];
  // The leaf schema field itself (type, resolved_options, ref_type, ...),
  // reusable to render a type-appropriate value picker. Always `many:
  // false` even if the field it was discovered through was `many` -- a
  // filter predicate always tests against one value at a time.
  valueField: SchemaField;
}

function label(path: { key: string; label: string }[]): string {
  return path.map((f) => f.label).join(" › ");
}

// Walks a schema's fields, discovering every filterable field/path:
//   - a top-level scalar (text, select, boolean, integer, number, date,
//     reference) -- filterable directly ("scalar").
//   - a `many` scalar field (tags, majors, ...) at any depth -- filterable
//     by membership ("many_scalar").
//   - a singular nested `object` field -- filterable by presence/absence
//     ("object_presence"), *and* recursed into for its own children, so a
//     multi-level chain (e.g. education -> bachelor -> name) surfaces both
//     "has a bachelor's" and "bachelor's name is X".
//   - one level into a `many` `object` field (email/phone/street addresses)
//     -- each nested leaf is filterable by membership across all entries
//     ("many_object"), e.g. "has a street address in this city".
// `managed` and `any` fields are skipped -- the former is server-owned
// (e.g. icloud metadata), the latter is deliberately unmodeled.
export function filterableFields(fields: SchemaField[], pathSoFar: { key: string; label: string }[] = []): FilterableField[] {
  const result: FilterableField[] = [];

  for (const field of fields) {
    if (field.managed || field.type === "any") continue;

    const path = [...pathSoFar, { key: field.key, label: field.label }];
    const id = path.map((p) => p.key).join(".");

    if (field.type === "object") {
      if (field.many) {
        for (const nested of field.fields ?? []) {
          if (nested.managed || nested.type === "object" || nested.type === "any") continue;
          const leafPath = [...path, { key: nested.key, label: nested.label }];
          result.push({
            id: `${id}.${nested.key}`,
            label: label(leafPath),
            kind: "many_object",
            path: leafPath.map((p) => p.key),
            valueField: { ...nested, many: false },
          });
        }
        continue;
      }

      result.push({
        id,
        label: label(path),
        kind: "object_presence",
        path: path.map((p) => p.key),
        valueField: { key: field.key, label: "Value", type: "boolean" },
      });
      result.push(...filterableFields(field.fields ?? [], path));
      continue;
    }

    result.push({
      id,
      label: label(path),
      kind: field.many ? "many_scalar" : "scalar",
      path: path.map((p) => p.key),
      valueField: { ...field, many: false },
    });
  }

  return result;
}

export type FilterOperator = "equals" | "contains" | "is_empty" | "is_set";

export function operatorsFor(kind: FilterableFieldKind): FilterOperator[] {
  switch (kind) {
    case "scalar":
      return ["equals", "is_set", "is_empty"];
    case "many_scalar":
    case "many_object":
      return ["contains", "is_set", "is_empty"];
    case "object_presence":
      return ["is_set", "is_empty"];
  }
}

export interface FilterPredicate {
  field: string;
  operator: FilterOperator;
  // Ignored for "is_set"/"is_empty".
  value: string;
}

function getPath(obj: unknown, path: string[]): unknown {
  let current = obj;
  for (const key of path) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

// The field/path's observed value(s) on one object, as strings -- empty
// when absent. Mirrors what the old hand-written `FilterField.values()`
// closures computed, but derived generically from `path`/`kind` so it works
// for any schema, not just Contact's.
export function extractValues(obj: unknown, field: FilterableField): string[] {
  if (field.kind === "object_presence") {
    const value = getPath(obj, field.path);
    return value != null ? ["Yes"] : [];
  }

  if (field.kind === "many_object") {
    const parentPath = field.path.slice(0, -1);
    const leafKey = field.path[field.path.length - 1];
    const array = getPath(obj, parentPath);
    if (!Array.isArray(array)) return [];
    return array
      .map((item) => (item != null && typeof item === "object" ? (item as Record<string, unknown>)[leafKey] : undefined))
      .filter((value): value is string | number => value != null && value !== "")
      .map(String);
  }

  const value = getPath(obj, field.path);
  if (field.kind === "many_scalar") {
    return Array.isArray(value) ? value.filter((item) => item != null && item !== "").map(String) : [];
  }
  return value != null && value !== "" ? [String(value)] : [];
}

export function matchesPredicate(obj: unknown, field: FilterableField, predicate: FilterPredicate): boolean {
  const values = extractValues(obj, field);
  switch (predicate.operator) {
    case "is_empty":
      return values.length === 0;
    case "is_set":
      return values.length > 0;
    case "equals":
    case "contains":
      return values.includes(predicate.value);
  }
}

export function matchesPredicates(
  obj: unknown,
  fieldsById: Map<string, FilterableField>,
  predicates: FilterPredicate[]
): boolean {
  return predicates.every((predicate) => {
    const field = fieldsById.get(predicate.field);
    return field !== undefined && matchesPredicate(obj, field, predicate);
  });
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function jsonPath(path: string[]): string {
  return `'$.${path.join(".")}'`;
}

// A predicate's comparison value as a SQL literal. `json_extract` returns a
// native SQLite INTEGER/REAL for a JSON number and 0/1 for a JSON boolean
// (never TEXT) -- SQLite's storage-class comparison rules mean a quoted
// string literal would never equal those, so only text/select/date/
// reference values get quoted.
function sqlLiteral(fieldType: SchemaField["type"], value: string): string {
  if (fieldType === "boolean") {
    return value === "true" || value === "1" ? "1" : "0";
  }
  if ((fieldType === "integer" || fieldType === "number") && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return value.trim();
  }
  return `'${escapeSqlString(value)}'`;
}

// One predicate's SQL fragment, against the `data` JSON column every stored
// object already has (see disk_dao.py) -- no backend changes needed, this
// is exactly what a hand-written `query` would contain.
export function compilePredicateSql(field: FilterableField, predicate: FilterPredicate): string {
  const extract = `json_extract(data, ${jsonPath(field.path)})`;
  const literal = (value: string) => sqlLiteral(field.valueField.type, value);

  if (field.kind === "many_scalar") {
    // Aliased rather than referencing the bare `json_each(...)` call as a
    // column qualifier -- SQLite accepts the latter as a FROM item but not
    // as a `<expr>.value` qualifier, since the parenthesized call isn't a
    // valid table/alias name there.
    const each = `json_each(data, ${jsonPath(field.path)}) AS je`;
    if (predicate.operator === "is_empty") {
      return `(${extract} IS NULL OR NOT EXISTS (SELECT 1 FROM ${each}))`;
    }
    if (predicate.operator === "is_set") {
      return `EXISTS (SELECT 1 FROM ${each})`;
    }
    return `EXISTS (SELECT 1 FROM ${each} WHERE je.value = ${literal(predicate.value)})`;
  }

  if (field.kind === "many_object") {
    const parentPath = field.path.slice(0, -1);
    const leafKey = field.path[field.path.length - 1];
    const each = `json_each(data, ${jsonPath(parentPath)}) AS je`;
    const leafExtract = `json_extract(je.value, '$.${leafKey}')`;
    if (predicate.operator === "is_empty") {
      return `NOT EXISTS (SELECT 1 FROM ${each} WHERE ${leafExtract} IS NOT NULL)`;
    }
    if (predicate.operator === "is_set") {
      return `EXISTS (SELECT 1 FROM ${each} WHERE ${leafExtract} IS NOT NULL)`;
    }
    return `EXISTS (SELECT 1 FROM ${each} WHERE ${leafExtract} = ${literal(predicate.value)})`;
  }

  if (field.kind === "object_presence") {
    return predicate.operator === "is_empty" ? `${extract} IS NULL` : `${extract} IS NOT NULL`;
  }

  // scalar
  if (predicate.operator === "is_empty") return `${extract} IS NULL`;
  if (predicate.operator === "is_set") return `${extract} IS NOT NULL`;
  return `${extract} = ${literal(predicate.value)}`;
}

// Compiles a full predicate list into the SQL a List's `query` field runs
// (see list_service.py's `run_query`): `SELECT id FROM "<type>" [WHERE ...]`.
// Empty predicates compile to "" (no query at all), not a select-all, to
// preserve the "absent query = hand-maintained list" distinction.
export function compileFiltersToSql(schemaName: string, fields: FilterableField[], predicates: FilterPredicate[]): string {
  if (predicates.length === 0) return "";

  const byId = new Map(fields.map((field) => [field.id, field]));
  const clauses = predicates.map((predicate) => {
    const field = byId.get(predicate.field);
    if (!field) throw new Error(`Unknown filter field: ${predicate.field}`);
    return compilePredicateSql(field, predicate);
  });

  return `SELECT id FROM "${schemaName}" WHERE ${clauses.join(" AND ")}`;
}

export function optionsForField(field: FilterableField): OptionPair[] {
  return field.valueField.resolved_options ?? [];
}
