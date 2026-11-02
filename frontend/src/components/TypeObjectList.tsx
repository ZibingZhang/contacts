import type { ReactNode } from "react";
import type { SchemaObject } from "../types";
import { displayLabel } from "../schema-form/displayLabel";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";

interface TypeObjectListProps {
  schema: SchemaObject;
  objects: (Record<string, unknown> & { id: number })[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  // A composition-root overlay for a type-specific subtitle per row (e.g. a
  // list's member count) -- TypeObjectList itself stays schema-driven.
  subtitleFor?: (obj: Record<string, unknown> & { id: number }) => string;
  headerAction?: ReactNode;
}

/**
 * The generic "browse objects of a type" sidebar: a plain list of rows
 * titled via `displayLabel`, used for "list" and for any custom type alike.
 */
export function TypeObjectList({ schema, objects, selectedId, onSelect, subtitleFor, headerAction }: TypeObjectListProps) {
  return (
    <Box
      sx={{
        width: 260,
        flexShrink: 0,
        borderRight: 1,
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, py: 1.5 }}>
        <Typography variant="subtitle1">{schema.label}s</Typography>
        {headerAction}
      </Box>
      <List dense sx={{ overflow: "auto", flexGrow: 1 }}>
        {objects.map((obj) => (
          <ListItemButton key={obj.id} selected={obj.id === selectedId} onClick={() => onSelect(obj.id)}>
            <ListItemText primary={displayLabel(schema, obj, obj.id)} secondary={subtitleFor?.(obj)} />
          </ListItemButton>
        ))}
        {objects.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
            No {schema.label.toLowerCase()}s yet.
          </Typography>
        )}
      </List>
    </Box>
  );
}
