import type { ReactNode, RefObject } from "react";
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

    const isChecked = selectedIds.has(contact.id);
    const displayName = buildDisplayName(contact.name, { includeNickname: false }) || `Contact ${contact.id}`;

    items.push(
      <ListItemButton
        component="a"
        href="#"
        selected={contact.id === selectedContactId}
        data-contact-id={contact.id}
        key={contact.id}
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
        <ListItemText primary={displayName} />
      </ListItemButton>
    );
  }

  return (
    <List
      component="div"
      id="contact-list"
      disablePadding
      sx={{ flexGrow: 1, alignSelf: "flex-start", width: "100%" }}
      ref={listRef}
    >
      {items}
    </List>
  );
}
