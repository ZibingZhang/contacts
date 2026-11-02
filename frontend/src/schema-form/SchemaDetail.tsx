import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import type { SchemaField, SchemaObject } from "../types";
import { displayLabel } from "./displayLabel";
import { fieldRowsFor } from "./fieldRows";
import { MULTI_ROW_DISPLAY_KINDS } from "./displayRegistry";
import { DetailSection, fieldRow, type FieldRowData } from "../components/DetailSection";
import { isTypingTarget } from "../hooks";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

function formatTimestamp(seconds: number | undefined): string {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleString();
}

function rowsFor(fields: SchemaField[], data: Record<string, unknown>): FieldRowData[] {
  return fields.flatMap((field) => fieldRowsFor(field, data));
}

// A field normally gets its own DetailSection when it's `many` or an
// `object` -- unless its `display` kind overrides that: a *multi-row* kind
// (e.g. "rows_by_item") always gets its own section even otherwise, and a
// *single-row* kind (e.g. "template") folds into "Details" like a plain
// scalar instead, even though the field itself is `many`/`object`.
function isGroupedField(field: SchemaField): boolean {
  if (field.display) {
    return MULTI_ROW_DISPLAY_KINDS.has(field.display);
  }
  return Boolean(field.many || field.type === "object");
}

export interface SchemaObjectData {
  id: number;
  ctime?: number;
  mtime?: number;
  [key: string]: unknown;
}

interface SchemaDetailProps {
  schema: SchemaObject;
  data: SchemaObjectData;
  onEdit: () => void;
  // Per-type composition-root hooks -- the only way a specific type (e.g.
  // contact) may customize this otherwise fully generic view.
  renderHeader?: (data: SchemaObjectData, defaultTitle: string) => ReactNode;
  extraActions?: ReactNode;
  extraSections?: ReactNode;
}

/**
 * Renders any object's detail view off its schema alone: a title, one
 * DetailSection per `many`/`object` field, a "Details" section grouping the
 * remaining scalars, a "System" section for managed fields, and timestamps.
 */
export function SchemaDetail({
  schema,
  data,
  onEdit,
  renderHeader,
  extraActions,
  extraSections,
}: SchemaDetailProps) {
  const title = displayLabel(schema, data, data.id);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === "e" || event.key === "E") {
        event.preventDefault();
        onEdit();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onEdit]);

  const groupedFields = useMemo(
    () => schema.fields.filter((field) => !field.managed && isGroupedField(field)),
    [schema]
  );
  const managedFields = useMemo(() => schema.fields.filter((field) => field.managed), [schema]);
  const scalarFields = useMemo(
    () => schema.fields.filter((field) => !field.managed && !isGroupedField(field)),
    [schema]
  );
  const scalarRows = useMemo(() => rowsFor(scalarFields, data), [scalarFields, data]);
  const managedRows = useMemo(() => rowsFor(managedFields, data), [managedFields, data]);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 4 }}>
        {renderHeader ? renderHeader(data, title) : <Typography variant="h5">{title}</Typography>}
        <Box sx={{ display: "flex", gap: 1 }}>
          {extraActions}
          <Button variant="outlined" size="small" onClick={onEdit}>
            Edit
          </Button>
        </Box>
      </Box>

      {groupedFields.map((field) => (
        <DetailSection key={field.key} title={field.label} rows={fieldRowsFor(field, data)} />
      ))}

      <DetailSection title="Details" rows={scalarRows} />

      {extraSections}

      <DetailSection title="System" rows={managedRows} />

      <DetailSection
        title="Timestamps"
        rows={[fieldRow("Created", formatTimestamp(data.ctime)), fieldRow("Updated", formatTimestamp(data.mtime))]}
      />
    </Box>
  );
}
