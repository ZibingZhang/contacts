import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import type { Contact } from "../types";
import type { SelectedFilter } from "../filters";
import type { SyncDirection } from "./SyncReviewModal";
import { SearchBar } from "./SearchBar";
import { FilterDropdown } from "./FilterDropdown";
import { ContactList } from "./ContactList";
import { AlphaIndex } from "./AlphaIndex";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";

export type ListStatus = "loading" | "error" | "ready";

const WIDTH_STORAGE_KEY = "contacts.sidebar.width";
const COLLAPSED_STORAGE_KEY = "contacts.sidebar.collapsed";
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 240;
const MAX_WIDTH = 520;
const COLLAPSED_WIDTH = 56;

function readStoredWidth(): number {
  const raw = Number(localStorage.getItem(WIDTH_STORAGE_KEY));
  return Number.isFinite(raw) && raw >= MIN_WIDTH && raw <= MAX_WIDTH ? raw : DEFAULT_WIDTH;
}

function readStoredCollapsed(): boolean {
  return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true";
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
  listRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  selectionMode: boolean;
  onToggleSelectionMode: () => void;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
  onAddTags: () => void;
  onExportSelected: () => void;
  onNewContact: () => void;
  syncing: boolean;
  syncDirection: SyncDirection | null;
  syncMessage: string | null;
  syncError: string | null;
  onPull: () => void;
  onPush: () => void;
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
  onToggleSelectionMode,
  selectedIds,
  onToggleSelect,
  onSelectAllVisible,
  onClearSelection,
  onAddTags,
  onExportSelected,
  onNewContact,
  syncing,
  syncDirection,
  syncMessage,
  syncError,
  onPull,
  onPush,
  onDismissSyncStatus,
}: SidebarProps) {
  const [width, setWidth] = useState(readStoredWidth);
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
  }, [width]);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

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

  if (collapsed) {
    return (
      <Box
        key="sidebar-collapsed"
        component="nav"
        id="contact-nav"
        sx={{
          width: COLLAPSED_WIDTH,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          borderRight: 1,
          borderColor: "divider",
          py: 1,
        }}
      >
        <Tooltip title="Expand sidebar" placement="right">
          <IconButton id="sidebar-collapse-toggle" size="small" aria-label="Expand sidebar" onClick={() => setCollapsed(false)}>
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    );
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
          flexDirection: "column",
          gap: 1,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Tooltip title="Collapse sidebar">
            <IconButton id="sidebar-collapse-toggle" size="small" aria-label="Collapse sidebar" onClick={() => setCollapsed(true)}>
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
          </Tooltip>
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

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Button id="new-contact-button" size="small" variant="contained" onClick={onNewContact}>
            New Contact
          </Button>
          <Button
            id="selection-mode-toggle"
            size="small"
            variant={selectionMode ? "contained" : "outlined"}
            color={selectionMode ? "secondary" : "inherit"}
            aria-pressed={selectionMode}
            onClick={onToggleSelectionMode}
          >
            {selectionMode ? "Done" : "Select"}
          </Button>

          <Box sx={{ flexGrow: 1 }} />

          <Tooltip title="Pull new/changed contacts from iCloud to review here.">
            <span>
              <IconButton id="pull-button" size="small" aria-label="Pull from iCloud" disabled={syncing} onClick={onPull}>
                {syncing && syncDirection === "pull" ? <CircularProgress size={18} /> : <CloudDownloadIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Push new/changed local contacts to iCloud to review there.">
            <span>
              <IconButton id="push-button" size="small" aria-label="Push to iCloud" disabled={syncing} onClick={onPush}>
                {syncing && syncDirection === "push" ? <CircularProgress size={18} /> : <CloudUploadIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {(syncMessage || syncError) && (
        <Box id="sync-status" sx={{ px: 1, pt: 1 }}>
          <Alert severity={syncError ? "error" : "success"} onClose={onDismissSyncStatus}>
            {syncError ?? syncMessage}
          </Alert>
        </Box>
      )}

      {selectionMode && (
        <Box
          id="selection-toolbar"
          sx={{
            px: 1,
            py: 1,
            borderBottom: 1,
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {selectedIds.size} selected
          </Typography>
          <Button size="small" variant="outlined" color="inherit" onClick={onSelectAllVisible}>
            Select all
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            onClick={onClearSelection}
            disabled={selectedIds.size === 0}
          >
            Clear
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            onClick={onExportSelected}
            disabled={selectedIds.size === 0}
            sx={{ ml: "auto" }}
          >
            Export
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={onAddTags}
            disabled={selectedIds.size === 0}
          >
            Add tags…
          </Button>
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
          contacts={contacts}
          grouped={grouped}
          selectedContactId={selectedContactId}
          onSelect={onSelectContact}
          listRef={listRef}
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
