import { memo, type ReactNode, type RefObject } from "react";
import type { Contact } from "../types";
import { buildDisplayName } from "../format";
import { contactLetter } from "../search";
import List from "@mui/material/List";
import ListSubheader from "@mui/material/ListSubheader";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Checkbox from "@mui/material/Checkbox";

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

interface ContactRowProps {
  contact: Contact;
  isSelected: boolean;
  isChecked: boolean;
  selectionMode: boolean;
  onSelect: (id: number) => void;
  onToggleSelect: (id: number) => void;
}

// Its own memoized component so that selecting a contact — which changes
// `isSelected` for exactly two rows out of what can be thousands — only
// re-renders those two. Without this, ContactList's own memo bails as a
// whole (see below) only when nothing changed; a selection change can't
// bail that way since `selectedContactId` itself is the thing that
// changed, so every row would otherwise re-run its MUI/emotion styling on
// every click.
const ContactRow = memo(function ContactRow({
  contact,
  isSelected,
  isChecked,
  selectionMode,
  onSelect,
  onToggleSelect,
}: ContactRowProps) {
  const displayName = buildDisplayName(contact.name, { includeNickname: false }) || `Contact ${contact.id}`;

  return (
    <ListItemButton
      component="a"
      href="#"
      selected={isSelected}
      data-contact-id={contact.id}
      onClick={(event) => {
        event.preventDefault();
        selectionMode ? onToggleSelect(contact.id) : onSelect(contact.id);
      }}
    >
      {selectionMode && (
        <ListItemIcon sx={{ minWidth: 0, mr: 1 }}>
          <Checkbox
            edge="start"
            checked={isChecked}
            onChange={() => onToggleSelect(contact.id)}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Select ${displayName}`}
          />
        </ListItemIcon>
      )}
      <ListItemText primary={displayName} slotProps={{ primary: { noWrap: true } }} />
    </ListItemButton>
  );
});

// Renders the contact list. When `grouped` is set, contacts are assumed to
// already be sorted so that same-letter contacts are contiguous, and a
// sticky letter header is inserted before each new letter group.
//
// Memoized because this list can run into the thousands of items — each a
// handful of MUI components — so re-running this on every keystroke in the
// search box (which re-renders the whole sidebar) is a visible jank source
// even when `contacts` itself hasn't changed yet (e.g. while debounced
// filtering is still pending). Callers must pass stable callback
// references (e.g. via `useCallback`) or this bailout does nothing.
export const ContactList = memo(function ContactList({
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
          <ListSubheader
            className="contact-letter-header"
            id={`contact-letter-${letter}`}
            key={`header-${letter}`}
            sx={{
              position: "sticky",
              top: 0,
              zIndex: 1,
              lineHeight: "1.6rem",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "text.secondary",
              bgcolor: "background.default",
            }}
          >
            {letter}
          </ListSubheader>
        );
      }
    }

    items.push(
      <ContactRow
        contact={contact}
        isSelected={contact.id === selectedContactId}
        isChecked={selectedIds.has(contact.id)}
        selectionMode={selectionMode}
        onSelect={onSelect}
        onToggleSelect={onToggleSelect}
        key={contact.id}
      />
    );
  }

  return (
    <List
      component="div"
      id="contact-list"
      disablePadding
      sx={{ flexGrow: 1, alignSelf: "flex-start", minWidth: 0 }}
      ref={listRef}
    >
      {items}
    </List>
  );
});
