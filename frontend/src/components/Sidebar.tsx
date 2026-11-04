import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "../hooks";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import type { Contact } from "../types";
import type { SelectedFilter } from "../filters";
import { SearchBar } from "./SearchBar";
import { FilterDropdown } from "./FilterDropdown";
import { ContactList, type ContactListHandle } from "./ContactList";
import { AlphaIndex } from "./AlphaIndex";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";

export type ListStatus = "loading" | "error" | "ready";

const WIDTH_STORAGE_KEY = "contacts.sidebar.width";
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 240;
const MAX_WIDTH = 520;

function readStoredWidth(): number {
  const raw = Number(localStorage.getItem(WIDTH_STORAGE_KEY));
  return Number.isFinite(raw) && raw >= MIN_WIDTH && raw <= MAX_WIDTH ? raw : DEFAULT_WIDTH;
}

interface SidebarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  allContacts: Contact[];
  selectedFilters: SelectedFilter[];
  onToggleFilter: (filter: SelectedFilter) => void;
  onClearFilters: () => void;
  listStatus: ListStatus;
  loadError: string | null;
  contacts: Contact[];
  grouped: boolean;
  selectedContactId: number | null;
  onSelectContact: (id: number) => void;
  lettersPresent: Set<string>;
  onJumpToLetter: (letter: string) => void;
  listRef: RefObject<ContactListHandle | null>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  selectionMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  syncMessage: string | null;
  syncError: string | null;
  onDismissSyncStatus: () => void;
}

export function Sidebar({
  searchQuery,
  onSearchChange,
  allContacts,
  selectedFilters,
  onToggleFilter,
  onClearFilters,
  listStatus,
  loadError,
  contacts,
  grouped,
  selectedContactId,
  onSelectContact,
  lettersPresent,
  onJumpToLetter,
  listRef,
  scrollContainerRef,
  selectionMode,
  selectedIds,
  onToggleSelect,
  syncMessage,
  syncError,
  onDismissSyncStatus,
}: SidebarProps) {
  const [width, setWidth] = useState(readStoredWidth);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
  }, [width]);

  // Latest selectedContactId without being a dependency below, so clicking a
  // different contact later doesn't retrigger the scroll-into-view (that's
  // already visible from the click itself).
  const selectedContactIdRef = useRef(selectedContactId);
  useEffect(() => {
    selectedContactIdRef.current = selectedContactId;
  }, [selectedContactId]);

  // Scrolls the selected contact into view on page load, and again each
  // time the sidebar mounts (it fully unmounts while the parent collapses
  // it, so the scroll position is lost). Depends on `contacts` rather than
  // firing once, since filtering runs debounced through a Web Worker — the
  // selected contact may not exist in `contacts` yet on the first pass
  // after the initial fetch resolves. Debounced rather than reacting to
  // every `contacts` change directly: the very first non-empty value is a
  // synchronous, not-yet-alphabetized fallback (see useFilteredContactIds)
  // that the real, sorted result supersedes a moment later -- scrolling
  // into a list mid-reorder like that corrupts the virtualizer's internal
  // offset cache (rows end up scattered with huge gaps), so this waits for
  // `contacts` to stop changing before ever scrolling at all.
  const settledContacts = useDebouncedValue(contacts, 100);
  const didScrollToSelectionRef = useRef(false);
  useEffect(() => {
    if (didScrollToSelectionRef.current || selectedContactIdRef.current === null) {
      return;
    }
    if (listRef.current?.scrollToId(selectedContactIdRef.current, "center")) {
      didScrollToSelectionRef.current = true;
    }
  }, [settledContacts, listRef]);

  // Mutates the nav element's width directly, bypassing React state, so a
  // drag doesn't trigger a re-render (and full reconciliation of the
  // thousand-item contact list) on every pointer move. The width is only
  // committed to state — and persisted — once the drag ends.
  function handleResizeMouseDown(event: ReactMouseEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    let latestWidth = startWidth;
    let frame = 0;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMouseMove(moveEvent: MouseEvent) {
      latestWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (moveEvent.clientX - startX)));
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

  return (
    <Box
      key="sidebar-expanded"
      component="nav"
      id="contact-nav"
      ref={navRef}
      sx={{
        width,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: 1,
        borderColor: "divider",
        position: "relative",
      }}
    >
      <Box
        id="sidebar-resize-handle"
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
          <SearchBar value={searchQuery} onChange={onSearchChange} />
        </Box>
        <FilterDropdown
          contacts={allContacts}
          selectedFilters={selectedFilters}
          onToggleFilter={onToggleFilter}
          onClear={onClearFilters}
        />
      </Box>

      {(syncMessage || syncError) && (
        <Box id="sync-status" sx={{ px: 1, pt: 1 }}>
          <Alert severity={syncError ? "error" : "success"} onClose={onDismissSyncStatus}>
            {syncError ?? syncMessage}
          </Alert>
        </Box>
      )}

      <Box id="list-status" sx={{ px: 1, pt: 1 }}>
        {listStatus === "loading" && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
            Loading…
          </Typography>
        )}
        {listStatus === "error" && loadError && <Alert severity="error">{loadError}</Alert>}
      </Box>

      <Box
        id="contact-list-scroll"
        ref={scrollContainerRef}
        sx={{
          display: "flex",
          alignItems: "flex-start",
          flexGrow: 1,
          overflow: "auto",
          position: "relative",
        }}
      >
        <ContactList
          ref={listRef}
          contacts={contacts}
          grouped={grouped}
          selectedContactId={selectedContactId}
          onSelect={onSelectContact}
          scrollContainerRef={scrollContainerRef}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
        />
        <AlphaIndex hidden={!grouped} lettersPresent={lettersPresent} onJumpToLetter={onJumpToLetter} />
      </Box>

      <Box
        id="contact-list-footer"
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
          {contacts.length} contact{contacts.length === 1 ? "" : "s"}
        </Typography>
      </Box>
    </Box>
  );
}
