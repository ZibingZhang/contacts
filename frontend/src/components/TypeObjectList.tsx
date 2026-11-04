import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { SchemaObject } from "../types";
import { displayLabel } from "../schema-form/displayLabel";
import { filterByRelevance, letterOf } from "../search";
import { useDebouncedValue } from "../hooks";
import {
  useLetterGroupedVirtualList,
  letterHeaderSx,
  stickyLetterHeaderSx,
  type LetterGroupedListHandle,
} from "./useLetterGroupedVirtualList";
import { SearchBar } from "./SearchBar";
import { AlphaIndex } from "./AlphaIndex";
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
  // Omit the "All {plural}" row entirely -- for callers that already render
  // an equivalent "All X" row in an adjacent sidebar (ListsNav), where
  // showing it here too would just duplicate that row's label and count.
  hideAllRow?: boolean;
  // A composition-root overlay for a type-specific subtitle per row (e.g. a
  // list's member count) -- TypeObjectList itself stays schema-driven.
  subtitleFor?: (obj: TypeObject) => string;
  headerAction?: ReactNode;
  selectionMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
}

// Exact, measured heights of each row kind under the dense MUI theme this
// list always renders with -- see useLetterGroupedVirtualList for why
// these are fixed constants rather than dynamically measured.
const HEADER_HEIGHT = 26;
const ITEM_HEIGHT = 36;
const ITEM_HEIGHT_WITH_SUBTITLE = 60;

/**
 * The generic "browse objects of a type" sidebar -- the second-tier column
 * every object type gets (contacts included), mirroring Sidebar/ContactList:
 * a search box up top, an "All {plural}" row, rows titled via `displayLabel`
 * grouped under alphabetical headers while not searching, and an ABC#
 * quick-jump index. Search ranking (not just exact substring) is generic
 * here -- unlike the tag/field filtering on contacts, which stays
 * contact-specific. Rows are virtualized via `useLetterGroupedVirtualList`
 * (shared with ContactList) since this can run into the thousands of items.
 */
export function TypeObjectList({
  schema,
  objects,
  selectedId,
  onSelect,
  onSelectAll,
  hideAllRow = false,
  subtitleFor,
  headerAction,
  selectionMode,
  selectedIds,
  onToggleSelect,
}: TypeObjectListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 100);
  const trimmedQuery = debouncedSearchQuery.trim();
  const grouped = !trimmedQuery;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const listHandleRef = useRef<LetterGroupedListHandle>(null);

  const titled = useMemo(
    () => objects.map((obj) => ({ obj, title: displayLabel(schema, obj, obj.id) })),
    [objects, schema]
  );

  const ordered = useMemo(() => {
    if (grouped) {
      return [...titled].sort((a, b) => a.title.localeCompare(b.title));
    }
    return filterByRelevance(titled, trimmedQuery, (entry) => entry.title);
  }, [titled, grouped, trimmedQuery]);

  const lettersPresent = useMemo(() => new Set(ordered.map((entry) => letterOf(entry.title))), [ordered]);

  const { rows, virtualRows, totalSize, scrollMargin, activeLetter } = useLetterGroupedVirtualList({
    items: ordered,
    grouped,
    getId: (entry) => entry.obj.id,
    getLetter: (entry) => letterOf(entry.title),
    itemHeight: subtitleFor ? ITEM_HEIGHT_WITH_SUBTITLE : ITEM_HEIGHT,
    headerHeight: HEADER_HEIGHT,
    scrollContainerRef,
    leadingHeight: hideAllRow ? 0 : ITEM_HEIGHT,
    handleRef: listHandleRef,
  });

  const jumpToLetter = useCallback((letter: string) => {
    listHandleRef.current?.scrollToLetter(letter);
  }, []);

  return (
    <Box
      sx={{
        width: 280,
        flexShrink: 0,
        borderRight: 1,
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          p: 1,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 0.5,
        }}
      >
        <Box sx={{ flexGrow: 1 }}>
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={`Search ${schema.label.plural.toLowerCase()}…`}
          />
        </Box>
        {headerAction}
      </Box>

      <Box
        ref={scrollContainerRef}
        sx={{ display: "flex", alignItems: "flex-start", flexGrow: 1, overflow: "auto", position: "relative" }}
      >
        <List dense disablePadding sx={{ flexGrow: 1, alignSelf: "flex-start", minWidth: 0, py: 0 }}>
          {!hideAllRow && (
            <ListItemButton selected={selectedId === null} onClick={onSelectAll} sx={{ height: ITEM_HEIGHT }}>
              <ListItemText primary={`All ${schema.label.plural}`} slotProps={{ primary: { noWrap: true } }} />
              <Typography variant="caption" color="text.secondary">
                {objects.length}
              </Typography>
            </ListItemButton>
          )}
          {grouped && (
            <ListSubheader sx={stickyLetterHeaderSx}>{activeLetter || " "}</ListSubheader>
          )}

          <Box sx={{ position: "relative", width: "100%", height: totalSize }}>
            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <Box
                  key={virtualRow.key}
                  sx={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                  }}
                >
                  {row.kind === "header" ? (
                    <ListSubheader sx={letterHeaderSx}>{row.letter}</ListSubheader>
                  ) : (
                    <ListItemButton
                      selected={row.item.obj.id === selectedId}
                      onClick={() => (selectionMode ? onToggleSelect(row.item.obj.id) : onSelect(row.item.obj.id))}
                    >
                      {selectionMode && (
                        <ListItemIcon sx={{ minWidth: 0, mr: 1 }}>
                          <Checkbox
                            edge="start"
                            checked={selectedIds.has(row.item.obj.id)}
                            onChange={() => onToggleSelect(row.item.obj.id)}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`Select ${row.item.title}`}
                          />
                        </ListItemIcon>
                      )}
                      <ListItemText
                        primary={row.item.title}
                        secondary={subtitleFor?.(row.item.obj)}
                        slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }}
                      />
                    </ListItemButton>
                  )}
                </Box>
              );
            })}
          </Box>

          {objects.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
              No {schema.label.plural.toLowerCase()} yet.
            </Typography>
          )}
        </List>
        <AlphaIndex hidden={!grouped} lettersPresent={lettersPresent} onJumpToLetter={jumpToLetter} />
      </Box>

      <Box
        sx={{
          flexShrink: 0,
          borderTop: 1,
          borderColor: "divider",
          px: 1,
          py: 0.5,
          textAlign: "center",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {objects.length} {objects.length === 1 ? schema.label.singular.toLowerCase() : schema.label.plural.toLowerCase()}
        </Typography>
      </Box>
    </Box>
  );
}
