import type { ReactNode } from "react";
import type { SchemaObject } from "../types";
import { displayLabel } from "../schema-form/displayLabel";
import { letterOf } from "../search";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListSubheader from "@mui/material/ListSubheader";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";

type TypeObject = Record<string, unknown> & { id: number };

interface TypeObjectListProps {
  schema: SchemaObject;
  objects: TypeObject[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  // Click handler for the "All {plural}" row above the grouped list --
  // clears whatever is currently selected back to a neutral browsing state.
  onSelectAll: () => void;
  // Alphabetical sticky-letter grouping, like ContactList's. Defaults to on;
  // callers with a reason to show a flat list (none today) can opt out.
  grouped?: boolean;
  // A composition-root overlay for a type-specific subtitle per row (e.g. a
  // list's member count) -- TypeObjectList itself stays schema-driven.
  subtitleFor?: (obj: TypeObject) => string;
  headerAction?: ReactNode;
  selectionMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
}

/**
 * The generic "browse objects of a type" sidebar: an "All {plural}" row
 * followed by rows titled via `displayLabel`, grouped under sticky
 * alphabetical headers -- used for "list", "association", and any custom
 * type alike.
 */
export function TypeObjectList({
  schema,
  objects,
  selectedId,
  onSelect,
  onSelectAll,
  grouped = true,
  subtitleFor,
  headerAction,
  selectionMode,
  selectedIds,
  onToggleSelect,
}: TypeObjectListProps) {
  const sorted = [...objects].sort((a, b) =>
    displayLabel(schema, a, a.id).localeCompare(displayLabel(schema, b, b.id))
  );

  const items: ReactNode[] = [];
  let currentLetter: string | null = null;

  for (const obj of sorted) {
    const title = displayLabel(schema, obj, obj.id);

    if (grouped) {
      const letter = letterOf(title);
      if (letter !== currentLetter) {
        currentLetter = letter;
        items.push(
          <ListSubheader
            key={`header-${letter}`}
            sx={{
              position: "sticky",
              top: 0,
              zIndex: 1,
              lineHeight: "1.6rem",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "text.secondary",
              bgcolor: "background.default",
            }}
          >
            {letter}
          </ListSubheader>
        );
      }
    }

    items.push(
      <ListItemButton
        key={obj.id}
        selected={obj.id === selectedId}
        onClick={() => (selectionMode ? onToggleSelect(obj.id) : onSelect(obj.id))}
      >
        {selectionMode && (
          <ListItemIcon sx={{ minWidth: 0, mr: 1 }}>
            <Checkbox
              edge="start"
              checked={selectedIds.has(obj.id)}
              onChange={() => onToggleSelect(obj.id)}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Select ${title}`}
            />
          </ListItemIcon>
        )}
        <ListItemText primary={title} secondary={subtitleFor?.(obj)} />
      </ListItemButton>
    );
  }

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
        <Typography variant="subtitle1">{schema.label.plural}</Typography>
        {headerAction}
      </Box>
      <List dense sx={{ overflow: "auto", flexGrow: 1, py: 0 }}>
        <ListItemButton selected={selectedId === null} onClick={onSelectAll}>
          <ListItemText primary={`All ${schema.label.plural}`} />
          <Typography variant="caption" color="text.secondary">
            {objects.length}
          </Typography>
        </ListItemButton>
        {items}
        {objects.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
            No {schema.label.plural.toLowerCase()} yet.
          </Typography>
        )}
      </List>
    </Box>
  );
}
