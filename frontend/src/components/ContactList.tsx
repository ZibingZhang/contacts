import { forwardRef, memo, type RefObject } from "react";
import type { Contact } from "../types";
import { buildDisplayName } from "../format";
import { contactLetter } from "../search";
import {
  useLetterGroupedVirtualList,
  letterHeaderSx,
  stickyLetterHeaderSx,
  type LetterGroupedListHandle,
} from "./useLetterGroupedVirtualList";
import Box from "@mui/material/Box";
import ListSubheader from "@mui/material/ListSubheader";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Checkbox from "@mui/material/Checkbox";

export type { LetterGroupedListHandle as ContactListHandle } from "./useLetterGroupedVirtualList";

interface ContactListProps {
  contacts: Contact[];
  grouped: boolean;
  selectedContactId: number | null;
  onSelect: (id: number) => void;
  // The scrollable ancestor (owned by Sidebar) the virtualizer measures
  // against -- unlike TypeObjectList, that Box lives outside this
  // component, so it has to come in as a prop rather than an internal ref.
  scrollContainerRef: RefObject<HTMLDivElement | null>;
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

const ITEM_HEIGHT = 36;

// Its own memoized component so that selecting a contact — which changes
// `isSelected` for exactly two rows out of what can be on screen — only
// re-renders those two.
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
      dense
      sx={{ height: ITEM_HEIGHT, py: 0 }}
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
// letter header is inserted before each new letter group. Virtualized via
// `useLetterGroupedVirtualList` (shared with TypeObjectList) since this can
// run into the thousands of contacts.
export const ContactList = forwardRef<LetterGroupedListHandle, ContactListProps>(function ContactList(
  { contacts, grouped, selectedContactId, onSelect, scrollContainerRef, selectionMode, selectedIds, onToggleSelect },
  ref
) {
  const { rows, virtualRows, totalSize, scrollMargin, activeLetter } = useLetterGroupedVirtualList({
    items: contacts,
    grouped,
    getId: (contact) => contact.id,
    getLetter: contactLetter,
    itemHeight: ITEM_HEIGHT,
    scrollContainerRef,
    handleRef: ref,
  });

  return (
    <Box id="contact-list" sx={{ flexGrow: 1, alignSelf: "flex-start", minWidth: 0 }}>
      {grouped && (
        <ListSubheader sx={stickyLetterHeaderSx}>{activeLetter || " "}</ListSubheader>
      )}
      <Box sx={{ position: "relative", width: "100%", height: totalSize }}>
        {virtualRows.map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <Box
              key={virtualRow.key}
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
              }}
            >
              {row.kind === "header" ? (
                <ListSubheader sx={letterHeaderSx}>{row.letter}</ListSubheader>
              ) : (
                <ContactRow
                  contact={row.item}
                  isSelected={row.item.id === selectedContactId}
                  isChecked={selectedIds.has(row.item.id)}
                  selectionMode={selectionMode}
                  onSelect={onSelect}
                  onToggleSelect={onToggleSelect}
                />
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
});
