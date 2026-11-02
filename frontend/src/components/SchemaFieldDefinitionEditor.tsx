import { useState } from "react";
import type { FieldType, SchemaField } from "../types";
import { FIELD_TYPES } from "../types";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

interface SchemaFieldDefinitionEditorProps {
  field: SchemaField;
  onChange: (field: SchemaField) => void;
  onRemove: () => void;
  // Caps nesting at one level: an "object" field may declare its own flat
  // sub-fields, but those sub-fields can't themselves be objects -- every
  // built-in schema only nests one level deep, and deeper shapes remain
  // reachable via the API directly.
  allowNested?: boolean;
}

export function SchemaFieldDefinitionEditor({
  field,
  onChange,
  onRemove,
  allowNested = true,
}: SchemaFieldDefinitionEditorProps) {
  const availableTypes = allowNested ? FIELD_TYPES : FIELD_TYPES.filter((type) => type !== "object");

  // Decoupled from `field.options` so the text box shows exactly what's
  // typed -- including a comma/space mid-entry -- rather than a value
  // re-derived by splitting on every keystroke, which would otherwise snap
  // back and swallow the separator the user just typed.
  const [optionsText, setOptionsText] = useState(() => (field.options ?? []).join(", "));

  function update(patch: Partial<SchemaField>) {
    onChange({ ...field, ...patch });
  }

  function addNestedField() {
    update({ fields: [...(field.fields ?? []), { key: "", label: "", type: "text" }] });
  }

  function updateNestedField(index: number, next: SchemaField) {
    const nested = [...(field.fields ?? [])];
    nested[index] = next;
    update({ fields: nested });
  }

  function removeNestedField(index: number) {
    const nested = [...(field.fields ?? [])];
    nested.splice(index, 1);
    update({ fields: nested });
  }

  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5, mb: 1.5 }}>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        <TextField
          size="small"
          label="Key"
          value={field.key}
          onChange={(event) => update({ key: event.target.value })}
          sx={{ width: 140 }}
        />
        <TextField
          size="small"
          label="Label"
          value={field.label}
          onChange={(event) => update({ label: event.target.value })}
          sx={{ width: 160 }}
        />
        <Select
          size="small"
          value={field.type}
          onChange={(event) => update({ type: event.target.value as FieldType })}
          sx={{ width: 150 }}
        >
          {availableTypes.map((type) => (
            <MenuItem key={type} value={type}>
              {type}
            </MenuItem>
          ))}
        </Select>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={Boolean(field.required)}
              onChange={(event) => update({ required: event.target.checked })}
            />
          }
          label="Required"
        />
        <FormControlLabel
          control={
            <Checkbox size="small" checked={Boolean(field.many)} onChange={(event) => update({ many: event.target.checked })} />
          }
          label="Many"
        />
        <IconButton size="small" aria-label="Remove field" onClick={onRemove} sx={{ ml: "auto" }}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>

      {field.type === "select" && (
        <TextField
          size="small"
          fullWidth
          label="Options (comma-separated)"
          value={optionsText}
          onChange={(event) => {
            const text = event.target.value;
            setOptionsText(text);
            update({
              options: text
                .split(",")
                .map((option) => option.trim())
                .filter((option) => option !== ""),
            });
          }}
          sx={{ mt: 1 }}
        />
      )}

      {field.type === "reference" && (
        <TextField
          size="small"
          label="Reference type"
          value={field.ref_type ?? ""}
          onChange={(event) => update({ ref_type: event.target.value })}
          sx={{ mt: 1 }}
        />
      )}

      {field.type === "object" && allowNested && (
        <Box sx={{ mt: 1.5, pl: 2, borderLeft: 1, borderColor: "divider" }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            Nested fields
          </Typography>
          {(field.fields ?? []).map((nested, index) => (
            <SchemaFieldDefinitionEditor
              key={index}
              field={nested}
              onChange={(next) => updateNestedField(index, next)}
              onRemove={() => removeNestedField(index)}
              allowNested={false}
            />
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={addNestedField}>
            Add nested field
          </Button>
        </Box>
      )}
    </Box>
  );
}
