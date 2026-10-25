import type { RefObject } from "react";
import type { Contact, TagCount } from "../types";
import { SearchBar } from "./SearchBar";
import { TagFilterDropdown } from "./TagFilterDropdown";
import { ContactList } from "./ContactList";
import { AlphaIndex } from "./AlphaIndex";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";

export type ListStatus = "loading" | "error" | "ready";

interface SidebarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  tags: TagCount[];
  selectedTags: Set<string>;
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
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
}

export function Sidebar({
  searchQuery,
  onSearchChange,
  tags,
  selectedTags,
  onToggleTag,
  onClearTags,
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
}: SidebarProps) {
  return (
    <Box
      component="nav"
      id="contact-nav"
      sx={{
        width: 320,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: 1,
        borderColor: "divider",
      }}
    >
      <Box
        sx={{
          p: 1,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "flex-start",
          gap: 1,
        }}
      >
        <Box sx={{ flexGrow: 1 }}>
          <SearchBar value={searchQuery} onChange={onSearchChange} />
          <TagFilterDropdown tags={tags} selectedTags={selectedTags} onToggleTag={onToggleTag} onClear={onClearTags} />
        </Box>
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
            variant="contained"
            onClick={onAddTags}
            disabled={selectedIds.size === 0}
            sx={{ ml: "auto" }}
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
