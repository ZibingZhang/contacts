import type { SchemaField } from "../types";
import { DateField } from "./DateField";
import { ReferencePicker } from "./ReferencePicker";
import { AnyMapField } from "./AnyMapField";
import { RowGrid, RemovableRow } from "./Rows";
import { Section } from "./Section";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Button from "@mui/material/Button";
import Autocomplete from "@mui/material/Autocomplete";
import AddIcon from "@mui/icons-material/Add";

function emptyElementValue(field: SchemaField): unknown {
  if (field.type === "object") return {};
  if (field.type === "boolean") return false;
  if (field.type === "integer" || field.type === "number") return 0;
  return "";
}

interface FieldEditProps {
  field: SchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
}

interface SchemaFieldEditProps extends FieldEditProps {
  // True for a field SchemaForm renders directly -- it's already wrapped in
  // a `<Section title={field.label}>`, so an "object" field skips its own
  // (otherwise identical) label to avoid a duplicate heading. A nested
  // object field (e.g. one education level inside "education") has no such
  // outer label, so it renders its own.
  topLevel?: boolean;
}

function ScalarEdit({ field, value, onChange }: FieldEditProps) {
  switch (field.type) {
    case "boolean":
      return (
        <FormControlLabel
          control={<Checkbox checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />}
          label={field.label}
        />
      );
    case "date":
      return <DateField label={field.label} value={typeof value === "string" ? value : ""} onChange={onChange} />;
    case "select": {
      const options = field.resolved_options ?? [];
      const current = value != null ? String(value) : "";
      return (
        <TextField label={field.label} size="small" fullWidth select value={current} onChange={(e) => {
          const match = options.find((option) => String(option.value) === e.target.value);
          onChange(match ? match.value : e.target.value);
        }}>
          {options.map((option) => (
            <MenuItem key={String(option.value)} value={String(option.value)}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      );
    }
    case "reference":
      return <ReferencePicker field={field} value={value} onChange={onChange} />;
    case "integer":
    case "number":
      return (
        <TextField
          label={field.label}
          size="small"
          fullWidth
          type="number"
          value={value == null ? "" : String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === "" ? null : field.type === "integer" ? parseInt(raw, 10) : parseFloat(raw));
          }}
        />
      );
    case "long_text":
      return (
        <TextField
          label={field.label}
          size="small"
          fullWidth
          multiline
          minRows={3}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          sx={{ "& textarea": { fontFamily: "monospace", fontSize: "0.85rem" } }}
        />
      );
    default:
      return (
        <TextField
          label={field.label}
          size="small"
          fullWidth
          value={typeof value === "string" ? value : value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

function ManyFieldEdit({ field, value, onChange }: FieldEditProps) {
  const items = Array.isArray(value) ? value : [];

  function updateItem(index: number, itemValue: unknown) {
    const next = [...items];
    next[index] = itemValue;
    onChange(next);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function addItem() {
    onChange([...items, emptyElementValue(field)]);
  }

  if (field.type === "text" || field.type === "long_text") {
    // Chip entry: type a value, press Enter/comma, click x to remove.
    const stringItems = items.filter((item): item is string => typeof item === "string");
    return (
      <Autocomplete
        multiple
        freeSolo
        options={[]}
        value={stringItems}
        onChange={(_event, newValue) => {
          const cleaned = newValue.map((v) => v.trim()).filter(Boolean);
          onChange(field.unique ? Array.from(new Set(cleaned)).sort() : cleaned);
        }}
        renderInput={(params) => (
          <TextField {...params} label={field.label} size="small" placeholder="Type a value and press Enter…" />
        )}
      />
    );
  }

  const elementField: SchemaField = { ...field, many: false };

  return (
    <Box>
      {items.map((item, index) =>
        field.type === "object" ? (
          <RemovableRow key={index} onRemove={() => removeItem(index)}>
            {(field.fields ?? []).map((nested) => (
              <SchemaFieldEdit
                key={nested.key}
                field={nested}
                value={(item as Record<string, unknown> | undefined)?.[nested.key]}
                onChange={(nestedValue) =>
                  updateItem(index, { ...(item as Record<string, unknown>), [nested.key]: nestedValue })
                }
              />
            ))}
          </RemovableRow>
        ) : (
          <RemovableRow key={index} onRemove={() => removeItem(index)}>
            <SchemaFieldEdit field={elementField} value={item} onChange={(v) => updateItem(index, v)} />
          </RemovableRow>
        )
      )}
      <Button size="small" startIcon={<AddIcon />} onClick={addItem}>
        Add {field.label}
      </Button>
    </Box>
  );
}

/**
 * Renders one field's edit control, recursing into nested/many shapes to
 * arbitrary depth. Driven only by the field's `type`/`many` -- no per-type
 * special-casing. A `managed` field renders nothing (the backend strips it
 * from writes anyway).
 */
export function SchemaFieldEdit({ field, value, onChange, topLevel = false }: SchemaFieldEditProps) {
  if (field.managed) {
    return null;
  }

  if (field.readOnly) {
    return (
      <TextField
        label={field.label}
        size="small"
        fullWidth
        disabled
        value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
      />
    );
  }

  if (field.many) {
    return <ManyFieldEdit field={field} value={value} onChange={onChange} />;
  }

  if (field.type === "object") {
    const objectValue = (value as Record<string, unknown>) ?? {};
    const children = (field.fields ?? []).map((nested) => (
      <SchemaFieldEdit
        key={nested.key}
        field={nested}
        value={objectValue[nested.key]}
        onChange={(nestedValue) => onChange({ ...objectValue, [nested.key]: nestedValue })}
      />
    ));
    // A "group of groups" (its children are themselves object fields with
    // their own <Section> sub-heading, e.g. education's six levels or
    // social profiles' four providers) reads top to bottom, one full-width
    // sub-group per row -- RowGrid's horizontal auto-fill columns are only
    // right for a *flat* object whose children are plain scalar fields
    // (e.g. name's prefix/first_name/..., or one phone entry's fields).
    const isGroupOfGroups = (field.fields ?? []).some((nested) => nested.type === "object" && !nested.many);
    // No `gap` here -- each child is a <Section>, which already adds its
    // own `mt` between siblings (see Section.tsx's "& + &" rule); adding a
    // flex gap on top of that doubled the spacing.
    const grid = isGroupOfGroups ? (
      <Box sx={{ display: "flex", flexDirection: "column" }}>{children}</Box>
    ) : (
      <RowGrid>{children}</RowGrid>
    );
    // Nested (not top-level) object fields label themselves, since nothing
    // outside already labeled them -- e.g. each education level inside the
    // top-level "education" field.
    return topLevel ? grid : <Section title={field.label}>{grid}</Section>;
  }

  if (field.type === "any") {
    return <AnyMapField value={value} onChange={onChange as (value: Record<string, unknown>) => void} />;
  }

  return <ScalarEdit field={field} value={value} onChange={onChange} />;
}
