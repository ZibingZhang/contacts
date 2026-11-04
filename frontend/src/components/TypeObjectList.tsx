import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
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

// A caller-controlled search box -- bypasses the internal uncontrolled
// search/debounce/relevance-ranking entirely and trusts `objects` is
// already in its final display order (e.g. Contact's URL-synced search
// query, filtered/sorted externally via a Web Worker). Omit this prop for
// the default, self-contained search-and-rank-internally behavior.
interface ControlledSearch {
  query: string;
  onQueryChange: (value: string) => void;
  // Whether `objects` is already alpha-sorted (same-letter items
  // contiguous) vs. relevance-ranked -- mirrors the internal `grouped` flag,
  // just supplied by the caller instead of computed here.
  grouped: boolean;
}

interface TypeObjectListProps {
  schema: SchemaObject;
  objects: TypeObject[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  // Click handler for the "All {plural}" row above the grouped list --
  // clears whatever is currently selected back to a neutral browsing state.
  // Dead when `hideAllRow` is set.
  onSelectAll?: () => void;
  // Omit the "All {plural}" row entirely -- for callers that already render
  // an equivalent "All X" row in an adjacent sidebar (ListsNav), where
  // showing it here too would just duplicate that row's label and count.
  hideAllRow?: boolean;
  // A composition-root overlay for a type-specific subtitle per row (e.g. a
  // list's member count) -- TypeObjectList itself stays schema-driven.
  subtitleFor?: (obj: TypeObject) => string;
  headerAction?: ReactNode;
  // Rendered below the search/headerAction row -- opaque to this component
  // (loading/error state, a sync-status alert, or nothing).
  banner?: ReactNode;
  selectionMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;

  // Row title/grouping overrides -- default to the schema-driven
  // `displayLabel`/`letterOf`. A caller with its own notion of "title" (e.g.
  // Contact's composed name) can override either independently.
  titleFor?: (obj: TypeObject) => string;
  getLetter?: (obj: TypeObject) => string;

  // A caller-controlled search box; see `ControlledSearch` above.
  search?: ControlledSearch;

  // Resizable width, on by default for every type (persisted per schema
  // unless `widthStorageKey` is overridden). `resizable={false}` falls back
  // to a fixed `defaultWidth`.
  resizable?: boolean;
  widthStorageKey?: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

// Exact, measured heights of each row kind under the dense MUI theme this
// list always renders with -- see useLetterGroupedVirtualList for why
// these are fixed constants rather than dynamically measured.
const HEADER_HEIGHT = 26;
const ITEM_HEIGHT = 36;
const ITEM_HEIGHT_WITH_SUBTITLE = 60;

const DEFAULT_WIDTH = 280;
const DEFAULT_MIN_WIDTH = 240;
const DEFAULT_MAX_WIDTH = 520;

function readStoredWidth(storageKey: string, defaultWidth: number, minWidth: number, maxWidth: number): number {
  const raw = Number(localStorage.getItem(storageKey));
  return Number.isFinite(raw) && raw >= minWidth && raw <= maxWidth ? raw : defaultWidth;
}

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
export const TypeObjectList = forwardRef<LetterGroupedListHandle, TypeObjectListProps>(function TypeObjectList(
  {
    schema,
    objects,
    selectedId,
    onSelect,
    onSelectAll,
    hideAllRow = false,
    subtitleFor,
    headerAction,
    banner,
    selectionMode,
    selectedIds,
    onToggleSelect,
    titleFor,
    getLetter,
    search,
    resizable = true,
    widthStorageKey,
    defaultWidth = DEFAULT_WIDTH,
    minWidth = DEFAULT_MIN_WIDTH,
    maxWidth = DEFAULT_MAX_WIDTH,
  },
  forwardedRef
) {
  const effectiveWidthStorageKey = widthStorageKey ?? `objectList.width.${schema.name}`;
  const [internalQuery, setInternalQuery] = useState("");
  const debouncedInternalQuery = useDebouncedValue(internalQuery, 100);
  const query = search ? search.query : internalQuery;
  const onQueryChange = search ? search.onQueryChange : setInternalQuery;
  const grouped = search ? search.grouped : !debouncedInternalQuery.trim();
  const trimmedInternalQuery = debouncedInternalQuery.trim();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const listHandleRef = useRef<LetterGroupedListHandle>(null);
  const navRef = useRef<HTMLDivElement>(null);

  const [width, setWidth] = useState(() =>
    resizable ? readStoredWidth(effectiveWidthStorageKey, defaultWidth, minWidth, maxWidth) : defaultWidth
  );

  useEffect(() => {
    if (resizable) {
      localStorage.setItem(effectiveWidthStorageKey, String(width));
    }
  }, [resizable, effectiveWidthStorageKey, width]);

  // Mutates the nav element's width directly, bypassing React state, so a
  // drag doesn't trigger a re-render (and full reconciliation of a
  // thousand-row list) on every pointer move. The width is only committed
  // to state -- and persisted -- once the drag ends.
  function handleResizeMouseDown(event: ReactMouseEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    let latestWidth = startWidth;
    let frame = 0;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMouseMove(moveEvent: MouseEvent) {
      latestWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + (moveEvent.clientX - startX)));
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (navRef.current) {
            navRef.current.style.width = `${latestWidth}px`;
          }
        });
      }
    }
    function onMouseUp() {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (navRef.current) {
        navRef.current.style.width = "";
      }
      setWidth(latestWidth);
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  const titled = useMemo(
    () => objects.map((obj) => ({ obj, title: titleFor ? titleFor(obj) : displayLabel(schema, obj, obj.id) })),
    [objects, schema, titleFor]
  );

  const ordered = useMemo(() => {
    if (search) {
      // The caller has already filtered/sorted `objects` into final order.
      return titled;
    }
    if (grouped) {
      return [...titled].sort((a, b) => a.title.localeCompare(b.title));
    }
    return filterByRelevance(titled, trimmedInternalQuery, (entry) => entry.title);
  }, [titled, grouped, trimmedInternalQuery, search]);

  const entryLetter = useCallback(
    (entry: (typeof titled)[number]) => (getLetter ? getLetter(entry.obj) : letterOf(entry.title)),
    [getLetter]
  );

  const lettersPresent = useMemo(() => new Set(ordered.map(entryLetter)), [ordered, entryLetter]);

  const { rows, virtualRows, totalSize, scrollMargin, activeLetter } = useLetterGroupedVirtualList({
    items: ordered,
    grouped,
    getId: (entry) => entry.obj.id,
    getLetter: entryLetter,
    itemHeight: subtitleFor ? ITEM_HEIGHT_WITH_SUBTITLE : ITEM_HEIGHT,
    headerHeight: HEADER_HEIGHT,
    scrollContainerRef,
    leadingHeight: hideAllRow ? 0 : ITEM_HEIGHT,
    handleRef: listHandleRef,
  });

  const jumpToLetter = useCallback((letter: string) => {
    listHandleRef.current?.scrollToLetter(letter);
  }, []);

  useImperativeHandle(
    forwardedRef,
    () => ({
      scrollToId: (id, align) => listHandleRef.current?.scrollToId(id, align) ?? false,
      scrollToLetter: (letter) => listHandleRef.current?.scrollToLetter(letter),
    }),
    []
  );

  // Scrolls the selected row into view on mount, and again each time this
  // remounts (e.g. the sidebar fully unmounts while a parent collapses it,
  // losing scroll position). Depends on `objects` rather than firing once,
  // since a controlled search's final order can still be in flight when this
  // first mounts. Debounced rather than reacting to every change directly:
  // an in-progress reorder can otherwise be scrolled into mid-shuffle,
  // corrupting the virtualizer's cached row offsets.
  const settledObjects = useDebouncedValue(objects, 100);
  const didScrollToSelectionRef = useRef(false);
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    if (didScrollToSelectionRef.current || selectedIdRef.current === null) {
      return;
    }
    if (listHandleRef.current?.scrollToId(selectedIdRef.current, "center")) {
      didScrollToSelectionRef.current = true;
    }
  }, [settledObjects]);

  return (
    <Box
      ref={navRef}
      sx={{
        width,
        flexShrink: 0,
        borderRight: 1,
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {resizable && (
        <Box
          onMouseDown={handleResizeMouseDown}
          sx={{
            position: "absolute",
            top: 0,
            bottom: 0,
            right: -3,
            width: 6,
            cursor: "col-resize",
            zIndex: 2,
            "&:hover": { bgcolor: "action.hover" },
          }}
        />
      )}

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
            value={query}
            onChange={onQueryChange}
            placeholder={`Search ${schema.label.plural.toLowerCase()}…`}
          />
        </Box>
        {headerAction}
      </Box>

      {banner}

      <Box
        ref={scrollContainerRef}
        sx={{ display: "flex", alignItems: "flex-start", flexGrow: 1, overflow: "auto", position: "relative" }}
      >
        <List dense disablePadding sx={{ flexGrow: 1, alignSelf: "flex-start", minWidth: 0, py: 0 }}>
          {!hideAllRow && onSelectAll && (
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
});
