import type { RefObject } from "react";
import type { Contact, TagCount } from "../types";
import { SearchBar } from "./SearchBar";
import { TagFilterDropdown } from "./TagFilterDropdown";
import { ContactList } from "./ContactList";
import { AlphaIndex } from "./AlphaIndex";

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
    <nav id="contact-nav" className="d-flex flex-column border-end flex-shrink-0">
      <div className="p-2 border-bottom d-flex align-items-start gap-2">
        <div className="flex-grow-1">
          <SearchBar value={searchQuery} onChange={onSearchChange} />
          <TagFilterDropdown tags={tags} selectedTags={selectedTags} onToggleTag={onToggleTag} onClear={onClearTags} />
        </div>
        <button
          id="selection-mode-toggle"
          type="button"
          className={`btn btn-sm${selectionMode ? " btn-secondary" : " btn-outline-secondary"}`}
          aria-pressed={selectionMode}
          onClick={onToggleSelectionMode}
        >
          {selectionMode ? "Done" : "Select"}
        </button>
      </div>

      {selectionMode && (
        <div id="selection-toolbar" className="px-2 py-2 border-bottom d-flex align-items-center gap-2 flex-wrap">
          <span className="small text-secondary">
            {selectedIds.size} selected
          </span>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onSelectAllVisible}>
            Select all
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={onClearSelection}
            disabled={selectedIds.size === 0}
          >
            Clear
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary ms-auto"
            onClick={onAddTags}
            disabled={selectedIds.size === 0}
          >
            Add tags…
          </button>
        </div>
      )}

      <div id="list-status" className="px-2 pt-2">
        {listStatus === "loading" && <div className="text-secondary small p-2">Loading…</div>}
        {listStatus === "error" && loadError && (
          <div className="alert alert-danger" role="alert">
            {loadError}
          </div>
        )}
      </div>

      <div id="contact-list-scroll" className="d-flex flex-grow-1 overflow-auto position-relative" ref={scrollContainerRef}>
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
      </div>

      <div id="contact-list-footer" className="border-top px-2 py-1 text-secondary small text-center">
        {contacts.length} contact{contacts.length === 1 ? "" : "s"}
      </div>
    </nav>
  );
}
