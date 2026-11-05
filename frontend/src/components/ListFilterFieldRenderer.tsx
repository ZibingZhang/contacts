import { useEffect, useState } from "react";
import type { SchemaObject } from "../types";
import type { FieldRendererProps } from "../schema-form/SchemaForm";
import { fetchSchema } from "../api";
import { FilterBuilder } from "./FilterBuilder";
import { filterableFields, compileFiltersToSql, type FilterPredicate } from "../filtering";
import Typography from "@mui/material/Typography";

// List's `filter` field renderer: builds the predicate UI against whatever
// schema the list's `member_type` currently names, and -- since that's a
// sibling field, not this one -- also writes the compiled SQL straight into
// `query` so the backend's existing (already generic) query execution picks
// it up unchanged. `query` stays independently editable; this only
// overwrites it when the builder itself changes.
export function ListFilterFieldRenderer({ value, draft, setField }: FieldRendererProps) {
  const memberType = typeof draft.member_type === "string" && draft.member_type ? draft.member_type : "contact";
  const [targetSchema, setTargetSchema] = useState<SchemaObject | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTargetSchema(null);
    fetchSchema(memberType)
      .then((schema) => {
        if (!cancelled) setTargetSchema(schema);
      })
      .catch(() => {
        if (!cancelled) setTargetSchema(null);
      });
    return () => {
      cancelled = true;
    };
  }, [memberType]);

  if (!targetSchema) {
    return (
      <Typography color="text.secondary" variant="body2">
        Loading {memberType} fields…
      </Typography>
    );
  }

  const predicates = Array.isArray(value) ? (value as FilterPredicate[]) : [];

  return (
    <FilterBuilder
      schema={targetSchema}
      value={predicates}
      onChange={(next) => {
        setField("filter", next);
        setField("query", compileFiltersToSql(targetSchema.name, filterableFields(targetSchema.fields), next));
      }}
    />
  );
}
