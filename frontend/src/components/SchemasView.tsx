import type { SchemaObject } from "../types";
import { TypeObjectList } from "./TypeObjectList";
import { SchemaEditor } from "./SchemaEditor";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

// A client-side-only stand-in schema, purely so TypeObjectList (which is
// schema-driven) can title/group/pluralize rows of actual schema objects.
// Never sent to the server -- there's no schema-object literally named
// "schema" (see SchemaEditor's module doc for why).
const META_SCHEMA: SchemaObject = {
  id: 0,
  name: "schema",
  label: { singular: "Schema", plural: "Schemas" },
  fields: [{ key: "name", label: "Name", type: "text", required: true }],
  title_field: "name",
};

interface SchemasViewProps {
  schemas: SchemaObject[];
  selectedName: string | "new" | null;
  selectionMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onSelect: (name: string | "new" | null) => void;
  onSaved: (saved: SchemaObject) => void;
  onDeleted: (name: string) => void;
  onCancel: () => void;
}

export function SchemasView({
  schemas,
  selectedName,
  selectionMode,
  selectedIds,
  onToggleSelect,
  onSelect,
  onSaved,
  onDeleted,
  onCancel,
}: SchemasViewProps) {
  const selected =
    selectedName && selectedName !== "new" ? schemas.find((s) => s.name === selectedName) ?? null : null;

  return (
    <Box sx={{ display: "flex", flexGrow: 1, overflow: "hidden" }}>
      <TypeObjectList
        schema={META_SCHEMA}
        objects={schemas as unknown as (Record<string, unknown> & { id: number })[]}
        selectedId={selected?.id ?? null}
        onSelect={(id) => {
          const match = schemas.find((s) => s.id === id);
          if (match) onSelect(match.name);
        }}
        onSelectAll={() => onSelect(null)}
        subtitleFor={(obj) => (obj.builtin ? "Built-in" : "Custom")}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onToggleSelect={onToggleSelect}
      />
      <Box component="main" sx={{ flexGrow: 1, overflow: "auto", px: 4, pb: 4 }}>
        <Box sx={{ pt: 4 }}>
          {selectedName === "new" ? (
            <SchemaEditor schema={null} onCancel={onCancel} onSaved={onSaved} onDeleted={onDeleted} />
          ) : selected ? (
            <SchemaEditor key={selected.name} schema={selected} onCancel={onCancel} onSaved={onSaved} onDeleted={onDeleted} />
          ) : (
            <Typography color="text.secondary">Select a schema to see its details.</Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}
