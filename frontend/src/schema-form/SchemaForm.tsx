import { useEffect, useState } from "react";
import type { SchemaObject } from "../types";
import { SchemaFieldEdit } from "./SchemaFieldEdit";
import { setAtPath, type Draft } from "./pathUtils";
import { ApiError, createObject, updateObject } from "../api";
import { Section } from "./Section";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";

export interface SavedObject {
  id: number;
  [key: string]: unknown;
}

interface SchemaFormProps {
  schema: SchemaObject;
  // null means create mode.
  value: SavedObject | null;
  onCancel: () => void;
  onSaved: (saved: SavedObject) => void;
  // A composition-root overlay on the schema's own fields -- e.g. turning
  // `list.member_type` into a `select` populated from the live type
  // registry, or marking a field read-only once created. SchemaForm itself
  // stays schema-driven and has no idea any of this is happening.
  overlayFields?: (fields: SchemaObject["fields"], isEditing: boolean) => SchemaObject["fields"];
  // Seeds the draft when creating (ignored once `value` is set), without
  // affecting the create-vs-update decision -- used by a "Copy" action.
  initialDraft?: Record<string, unknown>;
}

export function SchemaForm({ schema, value, onCancel, onSaved, overlayFields, initialDraft }: SchemaFormProps) {
  const [draft, setDraft] = useState<Draft>(() => value ?? initialDraft ?? {});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateAtPath(path: string[], newValue: unknown) {
    setDraft((prev) => setAtPath(prev, path, newValue));
  }

  const fields = overlayFields ? overlayFields(schema.fields, value !== null) : schema.fields;
  const editableFields = fields.filter((field) => !field.managed);

  const requiredMissing = editableFields.some(
    (field) => field.required && (draft[field.key] == null || draft[field.key] === "")
  );

  async function handleSubmit() {
    if (isSubmitting || requiredMissing) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = { ...draft };
      const saved = value
        ? await updateObject<SavedObject>(schema.name, value.id, payload)
        : await createObject<SavedObject>(schema.name, payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${value ? "save" : "create"} ${schema.label}`);
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!isSubmitting && !requiredMissing) handleSubmit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (!isSubmitting) onCancel();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 2,
          pt: 4,
          mb: 4,
          backgroundColor: "background.paper",
        }}
      >
        <Typography variant="h5">{value ? `Edit ${schema.label}` : `New ${schema.label}`}</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSubmit} disabled={isSubmitting || requiredMissing}>
            {isSubmitting ? "Saving…" : "Save"}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {editableFields.map((field) => (
        <Section key={field.key} title={field.label}>
          <SchemaFieldEdit
            field={field}
            value={draft[field.key]}
            onChange={(newValue) => updateAtPath([field.key], newValue)}
            topLevel
          />
        </Section>
      ))}
    </Box>
  );
}
