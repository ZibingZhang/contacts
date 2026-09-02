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
}

// Renders the contact list. When `grouped` is set, contacts are assumed to
// already be sorted so that same-letter contacts are contiguous, and a
// sticky letter header is inserted before each new letter group.
export function ContactList({ contacts, grouped, selectedContactId, onSelect, listRef }: ContactListProps) {
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

    items.push(
      <a
        href="#"
        className={`list-group-item list-group-item-action${contact.id === selectedContactId ? " active" : ""}`}
        data-contact-id={contact.id}
        key={contact.id}
        onClick={(event) => {
          event.preventDefault();
          onSelect(contact.id);
        }}
      >
        <div>{buildDisplayName(contact.name) || `Contact ${contact.id}`}</div>
      </a>
    );
  }

  return (
    <div className="list-group list-group-flush flex-grow-1" id="contact-list" ref={listRef}>
      {items}
    </div>
  );
}
