import type { ReactNode } from "react";
import type { SchemaField } from "../types";
import { renderTemplate, resolveLastPlaceholder, joinFields } from "./displayTemplate";
import { formatPhoneNumber } from "../format";
import { fieldRow, type FieldRowData } from "../components/DetailSection";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";

// Kinds that produce one DetailSection row each, for a top-level field --
// see `renderDisplayRows`. Exported so `SchemaDetail` can tell these apart
// from the single-row kinds for section-grouping purposes.
export const MULTI_ROW_DISPLAY_KINDS = new Set(["rows_by_item", "rows_by_field", "flatten_entries"]);

function asRecord(value: unknown): Record<string, unknown> {
  return (value as Record<string, unknown>) ?? {};
}

function asOptions(field: SchemaField): Record<string, unknown> {
  return field.display_options ?? {};
}

function ChipList({ items }: { items: string[] }) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
      {items.map((item) => (
        <Chip key={item} label={item} size="small" />
      ))}
    </Box>
  );
}

function LinkValue({ href, label }: { href: string; label: string }) {
  const isExternal = !href.startsWith("mailto:");
  return (
    <Link href={href} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noopener noreferrer" : undefined}>
      {label}
    </Link>
  );
}

// Resolves a `link` kind's href + label: `{a|b}` fallback and `{value}`
// (a scalar's own value) work the same as in `renderTemplate`; the label
// defaults to whatever the template's own placeholder(s) resolved to.
function renderLink(field: SchemaField, data: Record<string, unknown>): ReactNode {
  const options = asOptions(field);
  const hrefTemplate = options.href_template as string | undefined;
  if (!hrefTemplate) return null;

  const href = renderTemplate(hrefTemplate, field.fields, data);
  if (!href) return null;

  const labelField = options.label_field as string | undefined;
  const label = labelField
    ? renderTemplate(`{${labelField}}`, field.fields, data)
    : resolveLastPlaceholder(hrefTemplate, field.fields, data);

  return <LinkValue href={href} label={label || href} />;
}

function renderPhoneNumber(field: SchemaField, data: Record<string, unknown>): ReactNode {
  const options = asOptions(field);
  const numberKey = (options.number_field as string | undefined) ?? "number";
  const countryCodeKey = (options.country_code_field as string | undefined) ?? "country_code";
  const number = data[numberKey];
  const countryCode = data[countryCodeKey];
  if (typeof number !== "string" || typeof countryCode !== "number") return null;
  return formatPhoneNumber({ number, country_code: countryCode });
}

function renderLines(field: SchemaField, data: Record<string, unknown>): ReactNode {
  const options = asOptions(field);
  const lines = (options.lines as Record<string, unknown>[] | undefined) ?? [];
  const joinWith = (options.join_with as string | undefined) ?? "\n";

  const rendered = lines
    .map((line) => {
      if (line.template) {
        return renderTemplate(line.template as string, field.fields, data);
      }
      const fields = (line.fields as string[] | undefined) ?? [];
      const separator = (line.separator as string | undefined) ?? ", ";
      return joinFields(field.fields, data, fields, separator);
    })
    .filter(Boolean);

  if (!rendered.length) return null;
  if (joinWith === "\n") {
    return (
      <>
        {rendered.map((line, index) => (
          <Box key={index}>{line}</Box>
        ))}
      </>
    );
  }
  return rendered.join(joinWith);
}

/** Renders one `value_display` kind's result as a single node -- used standalone for a scalar/object field, or nested inside `rows_by_item`. */
function renderSingleValue(field: SchemaField, data: Record<string, unknown>): ReactNode {
  switch (field.display) {
    case "template":
      return renderTemplate((asOptions(field).template as string) ?? "", field.fields, data) || null;
    case "join_fields": {
      const options = asOptions(field);
      return joinFields(field.fields, data, (options.fields as string[]) ?? [], (options.separator as string) ?? ", ") || null;
    }
    case "lines":
      return renderLines(field, data);
    case "link":
      return renderLink(field, data);
    case "phone_number":
      return renderPhoneNumber(field, data);
    default:
      return null;
  }
}

function renderRowsByItem(field: SchemaField, value: unknown): FieldRowData[] {
  const items = Array.isArray(value) ? value : [];
  const options = asOptions(field);
  const labelFieldKey = (options.label_field as string | undefined) ?? "label";
  const valueDisplay = options.value_display as string | undefined;
  const valueDisplayOptions = options.value_display_options as Record<string, unknown> | undefined;

  return items.map((item, index) => {
    const data = asRecord(item);
    const rowLabel = (data[labelFieldKey] as string | undefined) || field.label;
    const itemField: SchemaField = {
      ...field,
      many: false,
      display: valueDisplay,
      display_options: valueDisplayOptions,
    };
    const node = valueDisplay ? renderSingleValue(itemField, data) : null;
    return fieldRow(rowLabel, node ?? "—", `${field.key}-${index}`);
  });
}

function renderRowsByField(field: SchemaField, value: unknown): FieldRowData[] {
  const data = asRecord(value);
  const rows: FieldRowData[] = [];
  for (const child of field.fields ?? []) {
    const childValue = data[child.key];
    if (childValue == null) continue;
    if (child.type === "object" && Object.keys(asRecord(childValue)).length === 0) continue;
    const node = child.display ? renderSingleValue(child, asRecord(childValue)) : null;
    if (node != null) {
      rows.push(fieldRow(child.label, node, child.key));
    }
  }
  return rows;
}

function renderFlattenEntries(field: SchemaField, value: unknown): FieldRowData[] {
  const options = asOptions(field);
  const prefix = (options.label_prefix as string | undefined) ?? field.label;
  const entries = Object.entries(asRecord(value));
  return entries.map(([key, val]) => fieldRow(`${prefix} ${capitalize(key)}`, String(val), key));
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Renders a top-level field's `display` kind as one or more DetailSection
 * rows. Returns `null` when the field has no `display` (or an unrecognized
 * one), signaling the caller to fall back to the generic renderer.
 */
export function renderDisplayRows(field: SchemaField, value: unknown): FieldRowData[] | null {
  switch (field.display) {
    case "chips": {
      const items = (Array.isArray(value) ? value : []).filter((item): item is string => typeof item === "string");
      return [fieldRow(field.label, <ChipList items={items} />)];
    }
    case "rows_by_item":
      return renderRowsByItem(field, value);
    case "rows_by_field":
      return renderRowsByField(field, value);
    case "flatten_entries":
      return renderFlattenEntries(field, value);
    case "template":
    case "join_fields":
    case "lines":
    case "link":
    case "phone_number": {
      const node = renderSingleValue(field, asRecord(value));
      return node == null ? null : [fieldRow(field.label, node)];
    }
    default:
      return null;
  }
}
