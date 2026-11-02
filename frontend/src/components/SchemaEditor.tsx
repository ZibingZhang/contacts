import { useState } from "react";
import type { SchemaField, SchemaObject } from "../types";
import { ApiError, createSchema, deleteSchema, updateSchema } from "../api";
import { SchemaFieldDefinitionEditor } from "./SchemaFieldDefinitionEditor";
import { Section } from "../schema-form/Section";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import AddIcon from "@mui/icons-material/Add";

interface SchemaEditorProps {
  // null means create mode.
  schema: SchemaObject | null;
  onCancel: () => void;
  onSaved: (saved: SchemaObject) => void;
  onDeleted: (name: string) => void;
}

/**
 * Hand-built editor for a schema *definition* -- not SchemaForm, which edits
 * object *data* against a dynamic schema. There's no schema-object literally
 * named "schema" describing {name, label, fields, title_field} (schemas
 * describe other types, never themselves), so this fixed-shape form can't be
 * driven generically the way every other object type's form is.
 */
// A fetched schema's select fields carry server-computed `resolved_options`
// (see schema_service._with_resolved_options) -- not a valid input
// attribute, so editing and resubmitting an existing schema verbatim would
// otherwise bounce off the backend's unknown-attribute check.
function stripServerComputed(field: SchemaField): SchemaField {
  const { resolved_options: _resolved_options, ...rest } = field;
  return { ...rest, fields: field.fields?.map(stripServerComputed) };
}

export function SchemaEditor({ schema, onCancel, onSaved, onDeleted }: SchemaEditorProps) {
  const readOnly = Boolean(schema?.builtin);
  const [name, setName] = useState(schema?.name ?? "");
  const [singular, setSingular] = useState(schema?.label.singular ?? "");
  const [plural, setPlural] = useState(schema?.label.plural ?? "");
  const [titleField, setTitleField] = useState(schema?.title_field ?? "");
  const [fields, setFields] = useState<SchemaField[]>(
    schema?.fields ?? [{ key: "name", label: "Name", type: "text", required: true }]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function updateField(index: number, next: SchemaField) {
    setFields((prev) => prev.map((field, i) => (i === index ? next : field)));
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  function addField() {
    setFields((prev) => [...prev, { key: "", label: "", type: "text" }]);
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);
    const payload: Record<string, unknown> = {
      name,
      label: plural.trim() ? { singular, plural } : { singular },
      fields: fields.map(stripServerComputed),
      ...(titleField ? { title_field: titleField } : {}),
    };
    try {
      const saved = schema ? await updateSchema(schema.name, payload) : await createSchema(payload);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${schema ? "save" : "create"} schema`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!schema) return;
    setDeleteError(null);
    try {
      await deleteSchema(schema.name);
      onDeleted(schema.name);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Failed to delete schema");
    }
  }

  if (readOnly && schema) {
    return (
      <Box>
        <Typography variant="h5" sx={{ mb: 2 }}>
          {schema.label.singular}
        </Typography>
        <Alert severity="info" sx={{ mb: 3 }}>
          Built-in schemas can't be edited.
        </Alert>
        <Section title="Fields">
          {schema.fields.map((field) => (
            <Box key={field.key} sx={{ display: "flex", gap: 2, py: 0.5 }}>
              <Typography sx={{ width: 160 }}>{field.label}</Typography>
              <Typography color="text.secondary" sx={{ width: 160 }}>
                {field.key}
              </Typography>
              <Typography color="text.secondary">{field.type}</Typography>
            </Box>
          ))}
        </Section>
        <Box sx={{ mt: 3 }}>
          <Button onClick={onCancel}>Close</Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>
        {schema ? `Edit ${schema.label.singular}` : "New Schema"}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Section title="Type">
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 1 }}>
          <TextField
            size="small"
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={Boolean(schema)}
            helperText={schema ? "Can't be changed" : "Lowercase identifier, e.g. company"}
            sx={{ width: 200 }}
          />
          <TextField
            size="small"
            label="Singular label"
            value={singular}
            onChange={(event) => setSingular(event.target.value)}
            sx={{ width: 200 }}
          />
          <TextField
            size="small"
            label="Plural label"
            value={plural}
            onChange={(event) => setPlural(event.target.value)}
            helperText="Defaults from singular if left blank"
            sx={{ width: 200 }}
          />
          <FormControl size="small" sx={{ width: 200 }}>
            <InputLabel>Title field</InputLabel>
            <Select value={titleField} label="Title field" onChange={(event) => setTitleField(event.target.value)}>
              <MenuItem value="">None</MenuItem>
              {fields
                .filter((field) => field.key)
                .map((field) => (
                  <MenuItem key={field.key} value={field.key}>
                    {field.key}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
        </Box>
      </Section>

      <Section title="Fields">
        {fields.map((field, index) => (
          <SchemaFieldDefinitionEditor
            key={index}
            field={field}
            onChange={(next) => updateField(index, next)}
            onRemove={() => removeField(index)}
          />
        ))}
        <Button size="small" startIcon={<AddIcon />} onClick={addField}>
          Add field
        </Button>
      </Section>

      <Box sx={{ display: "flex", gap: 1, mt: 3 }}>
        <Button variant="contained" onClick={handleSubmit} disabled={isSubmitting || !name.trim() || !singular.trim() || fields.length === 0}>
          Save
        </Button>
        <Button onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        {schema && (
          <Button color="error" onClick={handleDelete} sx={{ ml: "auto" }}>
            Delete
          </Button>
        )}
      </Box>

      {deleteError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {deleteError}
        </Alert>
      )}
    </Box>
  );
}
