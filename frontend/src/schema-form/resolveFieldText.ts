import type { SchemaField } from "../types";
import { formatDate } from "../format";

/**
 * Type-aware scalar stringification shared by the display-kind registry
 * (templates, joins, links, ...): a date formats via `formatDate`, a
 * select resolves its label, etc. Returns "" for an absent/empty value,
 * since callers use that to decide whether to drop an optional segment.
 */
export function resolveFieldText(field: SchemaField, value: unknown): string {
  if (value == null || value === "") return "";
  switch (field.type) {
    case "boolean":
      return value ? "Yes" : "No";
    case "date":
      return typeof value === "string" ? formatDate(value) ?? "" : "";
    case "select": {
      const pair = field.resolved_options?.find((option) => String(option.value) === String(value));
      return pair ? pair.label : String(value);
    }
    case "reference":
      return `#${value}`;
    default:
      return String(value);
  }
}

/** Joins a many field's array items (each resolved per `resolveFieldText`) with ", ". */
export function resolveFieldDisplayText(field: SchemaField, value: unknown): string {
  if (field.many) {
    const items = Array.isArray(value) ? value : [];
    const elementField: SchemaField = { ...field, many: false };
    return items
      .map((item) => resolveFieldText(elementField, item))
      .filter(Boolean)
      .join(", ");
  }
  return resolveFieldText(field, value);
}
