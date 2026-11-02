import { useState } from "react";
import type { SyncDirection } from "./SyncReviewModal";
import { useThemeSettings, type AppearanceMode } from "../theme/ThemeSettingsContext";
import { PALETTE_LABELS, type PaletteName } from "../theme/palettes";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
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
import GroupsIcon from "@mui/icons-material/Groups";
import CakeIcon from "@mui/icons-material/Cake";
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

export type AppView = "contacts" | "lists" | "birthdays";

interface TopBarProps {
  view: AppView;
  onSelectView: (view: AppView) => void;
  sidebarCollapsed: boolean;
  onToggleSidebarCollapsed: () => void;
  onNewContact: () => void;
  onNewList: () => void;
  selectionMode: boolean;
  onToggleSelectionMode: () => void;
  selectedCount: number;
  onSelectAllVisible: () => void;
  onClearSelection: () => void;
  onAddTags: () => void;
  onExportSelected: () => void;
  syncing: boolean;
  syncDirection: SyncDirection | null;
  onPull: () => void;
  onPush: () => void;
  onOpenAdminConsole: () => void;
}

export function TopBar({
  view,
  onSelectView,
  sidebarCollapsed,
  onToggleSidebarCollapsed,
  onNewContact,
  onNewList,
  selectionMode,
  onToggleSelectionMode,
  selectedCount,
  onSelectAllVisible,
  onClearSelection,
  onAddTags,
  onExportSelected,
  syncing,
  syncDirection,
  onPull,
  onPush,
  onOpenAdminConsole,
}: TopBarProps) {
  const isContactsView = view === "contacts";
  return (
    <Box
      id="top-bar"
      sx={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1,
        py: 0.75,
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      <Tooltip title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
        <IconButton
          id="sidebar-collapse-toggle"
          size="small"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggleSidebarCollapsed}
        >
          {sidebarCollapsed ? <ChevronRightIcon fontSize="small" /> : <ChevronLeftIcon fontSize="small" />}
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />

      {isContactsView ? (
        <Button id="new-contact-button" size="small" variant="contained" onClick={onNewContact}>
          New Contact
        </Button>
      ) : (
        <Button id="new-list-button" size="small" variant="contained" onClick={onNewList}>
          New List
        </Button>
      )}
      {isContactsView && (
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
      )}

      {isContactsView && selectionMode && (
        <>
          <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
            {selectedCount} selected
          </Typography>
          <Button size="small" variant="outlined" color="inherit" onClick={onSelectAllVisible}>
            Select all
          </Button>
          <Button size="small" variant="outlined" color="inherit" onClick={onClearSelection} disabled={selectedCount === 0}>
            Clear
          </Button>
          <Button size="small" variant="outlined" color="inherit" onClick={onExportSelected} disabled={selectedCount === 0}>
            Export
          </Button>
          <Button size="small" variant="contained" onClick={onAddTags} disabled={selectedCount === 0}>
            Add tags…
          </Button>
        </>
      )}

      <Box sx={{ flexGrow: 1 }} />

      {isContactsView && (
        <>
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
        </>
      )}
      <Tooltip title={view === "lists" ? "Switch to Contacts" : "Switch to Lists"}>
        <IconButton
          id="lists-view-toggle"
          size="small"
          aria-label="Toggle Lists view"
          aria-pressed={view === "lists"}
          color={view === "lists" ? "primary" : "default"}
          onClick={() => onSelectView(view === "lists" ? "contacts" : "lists")}
        >
          <GroupsIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={view === "birthdays" ? "Switch to Contacts" : "View birthday calendar"}>
        <IconButton
          id="birthdays-view-toggle"
          size="small"
          aria-label="Toggle Birthdays view"
          aria-pressed={view === "birthdays"}
          color={view === "birthdays" ? "primary" : "default"}
          onClick={() => onSelectView(view === "birthdays" ? "contacts" : "birthdays")}
        >
          <CakeIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Open admin console">
        <IconButton id="admin-console-button" size="small" aria-label="Open admin console" onClick={onOpenAdminConsole}>
          <TerminalIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <AppearanceMenu />
    </Box>
  );
}
