import { useState } from "react";
import { RemovableRow } from "./Rows";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import AddIcon from "@mui/icons-material/Add";

interface AnyMapFieldProps {
  value: unknown;
  onChange: (value: Record<string, unknown>) => void;
}

/** A plain, order-preserving key -> string-value editor for the "any" field type. */
export function AnyMapField({ value, onChange }: AnyMapFieldProps) {
  const entries = Object.entries((value as Record<string, unknown>) ?? {});
  // Local draft of each row's key, so retyping a key doesn't reorder/merge
  // entries mid-edit; the committed value is rebuilt from these on change.
  const [keyDrafts, setKeyDrafts] = useState<Record<number, string>>({});

  function commit(nextEntries: [string, unknown][]) {
    onChange(Object.fromEntries(nextEntries));
  }

  function updateValue(index: number, newValue: string) {
    const next = [...entries];
    next[index] = [next[index][0], newValue];
    commit(next);
  }

  function updateKey(index: number, newKey: string) {
    setKeyDrafts((prev) => ({ ...prev, [index]: newKey }));
    const next = [...entries];
    next[index] = [newKey, next[index][1]];
    commit(next);
  }

  function remove(index: number) {
    commit(entries.filter((_, i) => i !== index));
    setKeyDrafts({});
  }

  function add() {
    commit([...entries, ["", ""]]);
  }

  return (
    <Box>
      {entries.map(([key, val], index) => (
        <RemovableRow key={index} onRemove={() => remove(index)}>
          <TextField
            label="Key"
            size="small"
            value={keyDrafts[index] ?? key}
            onChange={(e) => updateKey(index, e.target.value)}
          />
          <TextField
            label="Value"
            size="small"
            value={String(val ?? "")}
            onChange={(e) => updateValue(index, e.target.value)}
          />
        </RemovableRow>
      ))}
      <Button size="small" startIcon={<AddIcon />} onClick={add}>
        Add
      </Button>
    </Box>
  );
}
