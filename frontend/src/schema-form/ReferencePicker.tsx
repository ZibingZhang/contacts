import { useEffect, useState } from "react";
import type { SchemaField } from "../types";
import { fetchObjects, fetchSchema } from "../api";
import { displayLabel } from "./displayLabel";
import { filterBySubsequence } from "../search";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";

interface Candidate {
  id: number;
  label: string;
}

// Cached per ref_type for the lifetime of the page, so opening several
// reference pickers for the same type doesn't each refetch every candidate.
const candidateCache = new Map<string, Promise<Candidate[]>>();

function loadCandidates(refType: string): Promise<Candidate[]> {
  let cached = candidateCache.get(refType);
  if (!cached) {
    cached = Promise.all([
      fetchObjects<Record<string, unknown>>(refType),
      fetchSchema(refType),
    ]).then(([objectsData, schema]) =>
      objectsData.objects.map((obj) => ({
        id: obj.id as number,
        label: displayLabel(schema, obj, obj.id as number),
      }))
    );
    candidateCache.set(refType, cached);
  }
  return cached;
}

interface ReferencePickerProps {
  field: SchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function ReferencePicker({ field, value, onChange }: ReferencePickerProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!field.ref_type) return;
    let cancelled = false;
    loadCandidates(field.ref_type).then((result) => {
      if (!cancelled) {
        setCandidates(result);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [field.ref_type]);

  const selected = candidates.find((candidate) => candidate.id === value) ?? null;

  return (
    <Autocomplete
      options={candidates}
      getOptionLabel={(candidate) => candidate.label}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      value={selected}
      loading={!loaded}
      filterOptions={(options, state) => {
        const matchingLabels = new Set(
          filterBySubsequence(options.map((option) => option.label), state.inputValue)
        );
        return options.filter((option) => matchingLabels.has(option.label));
      }}
      onChange={(_event, newValue) => onChange(newValue ? newValue.id : null)}
      renderInput={(params) => <TextField {...params} label={field.label} size="small" />}
    />
  );
}
