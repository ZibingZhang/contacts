import type { ReactNode, RefObject } from "react";
import type { Contact } from "../types";
import { buildDisplayName } from "../format";
import { contactLetter } from "../search";

interface ContactListProps {
  contacts: Contact[];
  grouped: boolean;
  selectedContactId: number | null;
  onSelect: (id: number) => void;
  listRef: RefObject<HTMLDivElement | null>;
  selectionMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
}

// Renders the contact list. When `grouped` is set, contacts are assumed to
// already be sorted so that same-letter contacts are contiguous, and a
// sticky letter header is inserted before each new letter group.
export function ContactList({
  contacts,
  grouped,
  selectedContactId,
  onSelect,
  listRef,
  selectionMode,
  selectedIds,
  onToggleSelect,
}: ContactListProps) {
  const items: ReactNode[] = [];
  let currentLetter: string | null = null;

  for (const contact of contacts) {
    if (grouped) {
      const letter = contactLetter(contact);
      if (letter !== currentLetter) {
        currentLetter = letter;
        items.push(
          <div className="contact-letter-header" id={`contact-letter-${letter}`} key={`header-${letter}`}>
            {letter}
          </div>
        );
      }
    }

    const isChecked = selectedIds.has(contact.id);

    items.push(
      <a
        href="#"
        className={`list-group-item list-group-item-action d-flex align-items-center gap-2${
          contact.id === selectedContactId ? " active" : ""
        }`}
        data-contact-id={contact.id}
        key={contact.id}
        onClick={(event) => {
          event.preventDefault();
          selectionMode ? onToggleSelect(contact.id) : onSelect(contact.id);
        }}
      >
        {selectionMode && (
          <input
            type="checkbox"
            className="form-check-input mt-0 flex-shrink-0"
            checked={isChecked}
            onChange={() => onToggleSelect(contact.id)}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Select ${buildDisplayName(contact.name, { includeNickname: false }) || `Contact ${contact.id}`}`}
          />
        )}
        <div>{buildDisplayName(contact.name, { includeNickname: false }) || `Contact ${contact.id}`}</div>
      </a>
    );
  }

  return (
    <div className="list-group list-group-flush flex-grow-1" id="contact-list" ref={listRef}>
      {items}
    </div>
  );
}
