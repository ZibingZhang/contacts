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
}: SidebarProps) {
  return (
    <nav id="contact-nav" className="d-flex flex-column border-end flex-shrink-0">
      <div className="p-2 border-bottom">
        <SearchBar value={searchQuery} onChange={onSearchChange} />
        <TagFilterDropdown tags={tags} selectedTags={selectedTags} onToggleTag={onToggleTag} onClear={onClearTags} />
      </div>

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
        />
        <AlphaIndex hidden={!grouped} lettersPresent={lettersPresent} onJumpToLetter={onJumpToLetter} />
      </div>

      <div id="contact-list-footer" className="border-top px-2 py-1 text-secondary small text-center">
        {contacts.length} contact{contacts.length === 1 ? "" : "s"}
      </div>
    </nav>
  );
}
