import type { SchemaField } from "../types";
import { resolveFieldDisplayText } from "./resolveFieldText";

function resolveOne(field: SchemaField | undefined, raw: unknown): string {
  return field ? resolveFieldDisplayText(field, raw) : raw != null && raw !== "" ? String(raw) : "";
}

// Resolves a (possibly dotted, e.g. "name.first_name") key against nested
// object fields, descending into each path segment's own sibling
// definitions and data in turn.
function resolveKeyPath(path: string, fields: SchemaField[] | undefined, data: Record<string, unknown>): string {
  const [key, ...rest] = path.split(".");
  const field = fields?.find((f) => f.key === key);
  const raw = data[key];
  if (rest.length === 0) {
    return resolveOne(field, raw);
  }
  if (!field?.fields || raw == null || typeof raw !== "object") {
    return "";
  }
  return resolveKeyPath(rest.join("."), field.fields, raw as Record<string, unknown>);
}

// Resolves one placeholder against an object field's sibling definitions
// (dotted paths descend into nested object fields), or a bare
// `{value: ...}` context for a scalar's own value (used by many-scalar
// "link" fields, e.g. each item of a list of usernames). "{a|b}" tries `a`
// first, falling back to `b` if empty.
function resolvePlaceholder(
  expr: string,
  fields: SchemaField[] | undefined,
  data: Record<string, unknown>
): string {
  for (const key of expr.split("|")) {
    const resolved = key === "value" ? resolveOne(undefined, data.value) : resolveKeyPath(key, fields, data);
    if (resolved) return resolved;
  }
  return "";
}

const PLACEHOLDER_RE = /\{([^{}]+)\}/g;

// Substitutes every `{...}` placeholder in `text`, reporting whether any
// of them resolved empty (used to decide whether to drop a `[...]`
// segment wrapping this text).
function substitute(
  text: string,
  fields: SchemaField[] | undefined,
  data: Record<string, unknown>
): { text: string; hasEmptyPlaceholder: boolean } {
  let hasEmptyPlaceholder = false;
  const result = text.replace(PLACEHOLDER_RE, (_match, expr: string) => {
    const resolved = resolvePlaceholder(expr, fields, data);
    if (!resolved) hasEmptyPlaceholder = true;
    return resolved;
  });
  return { text: result, hasEmptyPlaceholder };
}

const SEGMENT_RE = /\[([^[\]]*)\]/g;

/**
 * Renders a template like `"{name}[ ({graduation_year})][ — {majors}]"`
 * against an object's own field definitions (resolving `{key}`
 * placeholders type-aware, e.g. a date formats via `formatDate`) and its
 * raw data (or `{value: ...}` for a scalar's own value). A bracketed
 * `[...]` segment is dropped entirely if any placeholder inside it
 * resolves empty.
 */
export function renderTemplate(
  template: string,
  fields: SchemaField[] | undefined,
  data: Record<string, unknown>
): string {
  const withSegments = template.replace(SEGMENT_RE, (_match, inner: string) => {
    const { text, hasEmptyPlaceholder } = substitute(inner, fields, data);
    return hasEmptyPlaceholder ? "" : text;
  });
  return substitute(withSegments, fields, data).text.trim();
}

/**
 * Resolves just the last `{...}` placeholder in a template (ignoring
 * surrounding literal text) -- every `link` kind's `href_template` has
 * exactly one placeholder group at the end (e.g. "mailto:{address}",
 * "https://x.com/{username|id}"), and that resolved value is what a link
 * without an explicit `label_field` shows as its visible text.
 */
export function resolveLastPlaceholder(
  template: string,
  fields: SchemaField[] | undefined,
  data: Record<string, unknown>
): string {
  const matches = [...template.matchAll(/\{([^{}]+)\}/g)];
  if (!matches.length) return "";
  return resolvePlaceholder(matches[matches.length - 1][1], fields, data);
}

/** Joins named sibling fields' resolved values with `separator`, skipping empty ones. */
export function joinFields(
  fields: SchemaField[] | undefined,
  data: Record<string, unknown>,
  keys: string[],
  separator: string
): string {
  return keys
    .map((key) => resolveOne(fields?.find((f) => f.key === key), data[key]))
    .filter(Boolean)
    .join(separator);
}
