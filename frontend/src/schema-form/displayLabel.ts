import type { SchemaField, SchemaObject } from "../types";

function collectLeafText(fields: SchemaField[], value: unknown): string[] {
  if (value == null || typeof value !== "object") {
    return [];
  }
  const data = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const field of fields) {
    if (field.many) continue;
    const fieldValue = data[field.key];
    if (field.type === "object" && field.fields) {
      parts.push(...collectLeafText(field.fields, fieldValue));
    } else if (typeof fieldValue === "string" && fieldValue.trim()) {
      parts.push(fieldValue.trim());
    } else if (typeof fieldValue === "number") {
      parts.push(String(fieldValue));
    }
  }
  return parts;
}

/**
 * An object's display title: the schema's declared `title_field` if it
 * resolves to something non-empty (joining an `object` field's leaf text
 * values in schema order), otherwise the first non-empty top-level
 * text-like field, otherwise `#<id>`.
 */
export function displayLabel(
  schema: SchemaObject,
  data: Record<string, unknown>,
  id?: number
): string {
  const titleField = schema.title_field
    ? schema.fields.find((field) => field.key === schema.title_field)
    : undefined;

  if (titleField) {
    const value = data[titleField.key];
    if (titleField.type === "object" && titleField.fields) {
      const joined = collectLeafText(titleField.fields, value).join(" ");
      if (joined) return joined;
    } else if (typeof value === "string" && value.trim()) {
      return value.trim();
    } else if (typeof value === "number") {
      return String(value);
    }
  }

  const fallback = schema.fields.find(
    (field) =>
      !field.many &&
      (field.type === "text" || field.type === "long_text" || field.type === "select") &&
      typeof data[field.key] === "string" &&
      (data[field.key] as string).trim() !== ""
  );
  if (fallback) {
    return (data[fallback.key] as string).trim();
  }

  return id != null ? `#${id}` : "#?";
}
