import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { fetchSchemas } from "./api";
import type { SchemaObject } from "./types";

export interface SchemaObjectsBrowser {
  schemaObjects: SchemaObject[];
  setSchemaObjects: Dispatch<SetStateAction<SchemaObject[]>>;
  editingSchemaId: "new" | null;
  setEditingSchemaId: (id: "new" | null) => void;
}

// Schemas get their own dedicated branch (like "list"), not the generic
// type browser -- there's no schema-object literally named "schema" (see
// schemaMeta.ts), and schema's own edit surface (SchemaEditor) has a
// different shape than SchemaForm/SchemaDetail (self-referential field
// list, dynamic title_field options, builtin-read-only handling).
export function useSchemaObjects(typeName: string): SchemaObjectsBrowser {
  const [schemaObjects, setSchemaObjects] = useState<SchemaObject[]>([]);
  const [editingSchemaId, setEditingSchemaId] = useState<"new" | null>(null);

  useEffect(() => {
    if (typeName !== "schema") return;
    let cancelled = false;
    fetchSchemas()
      .then((data) => {
        if (!cancelled) setSchemaObjects(data.schemas);
      })
      .catch(() => {
        if (!cancelled) setSchemaObjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [typeName]);

  useEffect(() => {
    setEditingSchemaId(null);
  }, [typeName]);

  return { schemaObjects, setSchemaObjects, editingSchemaId, setEditingSchemaId };
}
