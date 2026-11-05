import type { SchemaField, SchemaObject } from "./types";
import { displayLabel } from "./schema-form/displayLabel";
import { renderTemplate } from "./schema-form/displayTemplate";

// Leaf text of every field the schema marks `searchable`, recursing through
// (non-many) object fields regardless of their own `searchable` flag -- only
// the leaves need to opt in. Mirrors `displayLabel`'s leaf-collection shape,
// but gated by `searchable` instead of "looks like a text-ish field".
function collectSearchableText(fields: SchemaField[], value: unknown): string[] {
  if (value == null || typeof value !== "object") {
    return [];
  }
  const data = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const field of fields) {
    if (field.many) continue;
    const fieldValue = data[field.key];
    if (field.type === "object" && field.fields) {
      parts.push(...collectSearchableText(field.fields, fieldValue));
    } else if (field.searchable) {
      if (typeof fieldValue === "string" && fieldValue.trim()) {
        parts.push(fieldValue.trim());
      } else if (typeof fieldValue === "number") {
        parts.push(String(fieldValue));
      }
    }
  }
  return parts;
}

// The text an object is matched/ranked against for a search query: every
// field the schema marks `searchable` (e.g. a contact's nickname or Chinese
// name, matchable even though they're not part of its display title).
// Falls back to the object's display title for schemas that haven't marked
// any field searchable yet, so search still works before a type opts in.
export function searchTextOf<T extends { id: number }>(schema: SchemaObject): (obj: T) => string {
  return (obj) => {
    const data = obj as unknown as Record<string, unknown>;
    const fromFields = collectSearchableText(schema.fields, data).join(" ");
    return fromFields || displayLabel(schema, data, obj.id);
  };
}

// The key an object is alphabetized by when there's no search query. A
// schema can declare `sort_template` (same `{field}`/`[optional segment]`
// syntax as a field's `display: "template"`, dotted paths allowed) to pick
// a lead field other than its display title -- e.g. Contact's `name`
// fields are declared in a cosmetic form order (prefix before first name,
// see builtin_schemas.py) that doesn't match the first/last-name-led
// grouping `ContactView` derives via `contactLetter`, so its schema leads
// the sort key with `{name.first_name} {name.last_name}` instead. Falls
// back to the object's display title for schemas that haven't set one.
export function sortKeyOf<T extends { id: number }>(schema: SchemaObject): (obj: T) => string {
  return (obj) => {
    const data = obj as unknown as Record<string, unknown>;
    if (schema.sort_template) {
      const rendered = renderTemplate(schema.sort_template, schema.fields, data);
      if (rendered) return rendered;
    }
    return displayLabel(schema, data, obj.id);
  };
}
