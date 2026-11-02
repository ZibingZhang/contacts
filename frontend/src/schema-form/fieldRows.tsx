import type { ReactNode } from "react";
import type { SchemaField } from "../types";
import { formatDate } from "../format";
import { fieldRow, type FieldRowData } from "../components/DetailSection";
import { ReferenceLink } from "./ReferenceLink";
import { renderDisplayRows } from "./displayRegistry";
import Box from "@mui/material/Box";

function scalarText(field: SchemaField, value: unknown): string {
  if (value == null || value === "") return "—";
  switch (field.type) {
    case "boolean":
      return value ? "Yes" : "No";
    case "date":
      return typeof value === "string" ? formatDate(value) ?? "—" : "—";
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

// A one-level-deep text summary of a field's value, used for nested display
// (inside a `many`/`object` row) where a full recursive React tree would be
// too noisy. Top-level fields get the richer `viewNode` rendering below.
function summarize(field: SchemaField, value: unknown): string {
  if (value == null) return "—";

  if (field.many) {
    const items = Array.isArray(value) ? value : [];
    if (!items.length) return "—";
    const elementField: SchemaField = { ...field, many: false };
    return items.map((item) => summarize(elementField, item)).join("; ");
  }

  if (field.type === "object") {
    const data = (value as Record<string, unknown>) ?? {};
    const parts = (field.fields ?? [])
      .map((nested) => {
        const nestedValue = data[nested.key];
        if (nestedValue == null || nestedValue === "" || (Array.isArray(nestedValue) && !nestedValue.length)) {
          return null;
        }
        return `${nested.label}: ${summarize(nested, nestedValue)}`;
      })
      .filter((part): part is string => part !== null);
    return parts.length ? parts.join(", ") : "—";
  }

  if (field.type === "any") {
    const entries = Object.entries((value as Record<string, unknown>) ?? {});
    return entries.length ? entries.map(([key, val]) => `${key}: ${val}`).join(", ") : "—";
  }

  return scalarText(field, value);
}

function viewNode(field: SchemaField, value: unknown): ReactNode {
  if (!field.many && field.type === "reference" && field.ref_type && typeof value === "number") {
    return <ReferenceLink objectType={field.ref_type} id={value} />;
  }
  if (!field.many && field.type === "long_text" && typeof value === "string" && value) {
    return (
      <Box
        component="pre"
        sx={{ m: 0, fontFamily: "monospace", fontSize: "0.85rem", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
      >
        {value}
      </Box>
    );
  }
  return summarize(field, value);
}

function isEmptyValue(field: SchemaField, value: unknown): boolean {
  if (value == null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (field.type === "object" && !field.many) return Object.keys((value as object) ?? {}).length === 0;
  if (field.type === "any") return Object.keys((value as object) ?? {}).length === 0;
  return false;
}

/**
 * DetailSection row(s) for a top-level field, or [] if there's nothing to
 * show. A field with a recognized `display` kind is dispatched to the
 * registry (which may produce more than one row, e.g. "rows_by_item");
 * otherwise this falls back to the generic summary unchanged.
 */
export function fieldRowsFor(field: SchemaField, data: Record<string, unknown>): FieldRowData[] {
  const value = data[field.key];
  if (isEmptyValue(field, value)) return [];

  if (field.display) {
    const rows = renderDisplayRows(field, value);
    if (rows !== null) return rows;
  }

  return [fieldRow(field.label, viewNode(field, value))];
}
