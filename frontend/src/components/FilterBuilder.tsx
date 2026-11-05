import { useMemo } from "react";
import type { SchemaObject } from "../types";
import {
  filterableFields,
  operatorsFor,
  type FilterOperator,
  type FilterPredicate,
} from "../filtering";
import { SchemaFieldEdit } from "../schema-form/SchemaFieldEdit";
import { RemovableRow } from "../schema-form/Rows";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  equals: "is",
  contains: "contains",
  is_set: "is set",
  is_empty: "is empty",
};

interface FilterBuilderProps {
  schema: SchemaObject;
  value: FilterPredicate[];
  onChange: (next: FilterPredicate[]) => void;
}

// A generic, schema-driven predicate editor: pick a field, pick an operator
// (narrowed to what makes sense for that field's type), pick a value --
// replacing a hand-typed SQL `query` with something anyone can build. Reused
// for any object type via `schema`, not just contacts.
export function FilterBuilder({ schema, value, onChange }: FilterBuilderProps) {
  const fields = useMemo(() => filterableFields(schema.fields), [schema]);
  const fieldsById = useMemo(() => new Map(fields.map((field) => [field.id, field])), [fields]);

  function updatePredicate(index: number, next: Partial<FilterPredicate>) {
    const predicates = [...value];
    predicates[index] = { ...predicates[index], ...next };
    onChange(predicates);
  }

  function removePredicate(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function addPredicate() {
    const first = fields[0];
    if (!first) return;
    onChange([...value, { field: first.id, operator: operatorsFor(first.kind)[0], value: "" }]);
  }

  if (fields.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2">
        {schema.label.singular} has no filterable fields.
      </Typography>
    );
  }

  return (
    <Box>
      {value.map((predicate, index) => {
        const field = fieldsById.get(predicate.field) ?? fields[0];
        const operators = operatorsFor(field.kind);
        const needsValue = predicate.operator === "equals" || predicate.operator === "contains";

        return (
          <RemovableRow key={index} onRemove={() => removePredicate(index)}>
            <TextField
              label="Field"
              size="small"
              select
              fullWidth
              value={field.id}
              onChange={(e) => {
                const nextField = fieldsById.get(e.target.value);
                if (!nextField) return;
                updatePredicate(index, { field: nextField.id, operator: operatorsFor(nextField.kind)[0], value: "" });
              }}
            >
              {fields.map((f) => (
                <MenuItem key={f.id} value={f.id}>
                  {f.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Operator"
              size="small"
              select
              fullWidth
              value={predicate.operator}
              onChange={(e) => updatePredicate(index, { operator: e.target.value as FilterOperator, value: "" })}
            >
              {operators.map((operator) => (
                <MenuItem key={operator} value={operator}>
                  {OPERATOR_LABELS[operator]}
                </MenuItem>
              ))}
            </TextField>

            {needsValue && (
              <SchemaFieldEdit
                field={{ ...field.valueField, label: "Value" }}
                value={predicate.value}
                onChange={(v) => updatePredicate(index, { value: v == null ? "" : String(v) })}
              />
            )}
          </RemovableRow>
        );
      })}
      <Button size="small" startIcon={<AddIcon />} onClick={addPredicate}>
        Add condition
      </Button>
    </Box>
  );
}
