import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import type { Contact } from "../types";
import type { SelectedFilter } from "../filters";
import type { SyncDirection } from "./SyncReviewModal";
import { SearchBar } from "./SearchBar";
import { FilterDropdown } from "./FilterDropdown";
import { ContactList } from "./ContactList";
import { AlphaIndex } from "./AlphaIndex";
import { useThemeSettings, type AppearanceMode } from "../theme/ThemeSettingsContext";
import { PALETTE_LABELS, type PaletteName } from "../theme/palettes";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import TerminalIcon from "@mui/icons-material/Terminal";
import PaletteIcon from "@mui/icons-material/Palette";
import CheckIcon from "@mui/icons-material/Check";

const APPEARANCE_MODES: { value: AppearanceMode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const PALETTE_NAMES: PaletteName[] = ["default", "solarized", "rose-pine"];

function AppearanceMenu() {
  const { mode, setMode, palette, setPalette } = useThemeSettings();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  return (
    <>
      <Tooltip title="Appearance">
        <IconButton
          id="appearance-button"
          size="small"
          aria-label="Change appearance"
          onClick={(event) => setAnchorEl(event.currentTarget)}
        >
          <PaletteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.5, display: "block" }}>
          Appearance
        </Typography>
        {APPEARANCE_MODES.map(({ value, label }) => (
          <MenuItem
            key={value}
            selected={mode === value}
            onClick={() => {
              setMode(value);
              setAnchorEl(null);
            }}
          >
            <ListItemIcon>{mode === value ? <CheckIcon fontSize="small" /> : null}</ListItemIcon>
            <ListItemText>{label}</ListItemText>
          </MenuItem>
        ))}
        <Divider />
        <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.5, display: "block" }}>
          Palette
        </Typography>
        {PALETTE_NAMES.map((name) => (
          <MenuItem
            key={name}
            selected={palette === name}
            onClick={() => {
              setPalette(name);
              setAnchorEl(null);
            }}
          >
            <ListItemIcon>{palette === name ? <CheckIcon fontSize="small" /> : null}</ListItemIcon>
            <ListItemText>{PALETTE_LABELS[name]}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

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
  onOpenAdminConsole: () => void;
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
  onOpenAdminConsole,
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

  // Latest selectedContactId without being a dependency below, so clicking a
  // different contact later doesn't retrigger the scroll-into-view (that's
  // already visible from the click itself).
  const selectedContactIdRef = useRef(selectedContactId);
  useEffect(() => {
    selectedContactIdRef.current = selectedContactId;
  }, [selectedContactId]);

  // Scrolls the selected contact into view on page load, and again each
  // time the sidebar expands from collapsed (its contents fully unmount
  // while collapsed, so the scroll position is lost). Depends on `contacts`
  // rather than firing once, since filtering runs debounced through a Web
  // Worker — the selected item may not exist in the DOM yet on the first
  // pass after the initial fetch resolves.
  const didScrollToSelectionRef = useRef(false);
  useEffect(() => {
    if (collapsed) {
      didScrollToSelectionRef.current = false;
      return;
    }
    if (didScrollToSelectionRef.current || selectedContactIdRef.current === null) {
      return;
    }
    const item = listRef.current?.querySelector<HTMLElement>(
      `[data-contact-id="${selectedContactIdRef.current}"]`
    );
    if (item) {
      item.scrollIntoView({ block: "center" });
      didScrollToSelectionRef.current = true;
    }
  }, [collapsed, contacts, listRef]);

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

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
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
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
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
          <Tooltip title="Open admin console">
            <IconButton id="admin-console-button" size="small" aria-label="Open admin console" onClick={onOpenAdminConsole}>
              <TerminalIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <AppearanceMenu />
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
