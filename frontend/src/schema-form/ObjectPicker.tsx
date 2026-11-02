import { useEffect, useState } from "react";
import { fetchObjects, fetchSchema } from "../api";
import { displayLabel } from "./displayLabel";
import { filterBySubsequence } from "../search";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";

interface Candidate {
  id: number;
  label: string;
}

interface ObjectPickerProps {
  objectType: string;
  excludeIds?: number[];
  placeholder?: string;
  onSelect: (id: number) => void;
}

/** A searchable picker over every object of a type, for "add to"/"add member" controls. */
export function ObjectPicker({ objectType, excludeIds, placeholder, onSelect }: ObjectPickerProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchObjects<Record<string, unknown>>(objectType), fetchSchema(objectType)])
      .then(([objectsData, schema]) => {
        if (cancelled) return;
        setCandidates(
          objectsData.objects.map((obj) => ({
            id: obj.id as number,
            label: displayLabel(schema, obj, obj.id as number),
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [objectType]);

  const excluded = new Set(excludeIds ?? []);
  const options = candidates.filter((candidate) => !excluded.has(candidate.id));

  return (
    <Autocomplete
      options={options}
      getOptionLabel={(candidate) => candidate.label}
      value={null}
      filterOptions={(opts, state) => {
        const matching = new Set(filterBySubsequence(opts.map((option) => option.label), state.inputValue));
        return opts.filter((option) => matching.has(option.label));
      }}
      onChange={(_event, newValue) => {
        if (newValue) onSelect(newValue.id);
      }}
      renderInput={(params) => <TextField {...params} size="small" placeholder={placeholder} />}
      sx={{ minWidth: 220 }}
    />
  );
}
