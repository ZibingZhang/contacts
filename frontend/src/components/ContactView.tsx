import { useRef, type ReactNode, type RefObject } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import type { Contact, ListObject, SchemaObject } from "../types";
import type { SelectedFilter } from "../filters";
import { ListsNav } from "./ListsNav";
import { Sidebar, type ListStatus } from "./Sidebar";
import type { ContactListHandle } from "./ContactList";
import { SchemaDetail, type SchemaObjectData } from "../schema-form/SchemaDetail";
import { SchemaForm, type SavedObject } from "../schema-form/SchemaForm";
import { buildDisplayName, initials } from "../format";

// The one per-type cosmetic hook in the generic renderer: a contact's
// header keeps its avatar/initials and composed display name rather than
// going fully plain like every other type's title. Pure/stateless, so it
// lives outside the component rather than as a `useCallback`.
function renderContactHeader(contact: Contact): ReactNode {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
      <Avatar sx={{ width: 64, height: 64, fontSize: "1.25rem", fontWeight: 600 }}>{initials(contact.name)}</Avatar>
      <Box>
        <Typography variant="h5" sx={{ mb: 0.5 }}>
          {buildDisplayName(contact.name) || `Contact ${contact.id}`}
        </Typography>
        {contact.name?.chinese_name && <Typography color="text.secondary">{contact.name.chinese_name}</Typography>}
        {contact.tags && contact.tags.length > 0 && (
          <Box sx={{ mt: 1, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {contact.tags.map((tag) => (
              <Chip label={tag} size="small" key={tag} />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

interface ContactViewProps {
  sidebarCollapsed: boolean;
  listsForCurrentType: ListObject[];
  listMemberIds: Record<number, number[]>;
  scopingListId: number | null;
  onSelectList: (listId: number | null) => void;
  totalCount: number;
  listsRefreshing: boolean;
  onRefreshLists: () => void;

  contacts: Contact[];
  scopedContacts: Contact[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedFilters: SelectedFilter[];
  onToggleFilter: (filter: SelectedFilter) => void;
  onClearFilters: () => void;
  listStatus: ListStatus;
  loadError: string | null;
  visibleContacts: Contact[];
  grouped: boolean;
  selectedContactId: number | null;
  onSelectContact: (id: number) => void;
  lettersPresent: Set<string>;
  onJumpToLetter: (letter: string) => void;
  listRef: RefObject<ContactListHandle | null>;
  selectionMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  syncMessage: string | null;
  syncError: string | null;
  onDismissSyncStatus: () => void;

  contactSchema: SchemaObject | null;
  editingContactId: number | "new" | null;
  copySourceContact: Contact | null;
  onCancelEdit: () => void;
  onContactSaved: (contact: Contact) => void;
  selectedContact: Contact | null;
  onEditContact: () => void;
  onCopyContact: (contact: Contact) => void;
}

export function ContactView({
  sidebarCollapsed,
  listsForCurrentType,
  listMemberIds,
  scopingListId,
  onSelectList,
  totalCount,
  listsRefreshing,
  onRefreshLists,
  contacts,
  scopedContacts,
  searchQuery,
  onSearchChange,
  selectedFilters,
  onToggleFilter,
  onClearFilters,
  listStatus,
  loadError,
  visibleContacts,
  grouped,
  selectedContactId,
  onSelectContact,
  lettersPresent,
  onJumpToLetter,
  listRef,
  selectionMode,
  selectedIds,
  onToggleSelect,
  syncMessage,
  syncError,
  onDismissSyncStatus,
  contactSchema,
  editingContactId,
  copySourceContact,
  onCancelEdit,
  onContactSaved,
  selectedContact,
  onEditContact,
  onCopyContact,
}: ContactViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  return (
    <Box sx={{ display: "flex", flexGrow: 1, overflow: "hidden" }}>
      {!sidebarCollapsed && (
        <ListsNav
          lists={listsForCurrentType}
          memberIds={listMemberIds}
          selectedListId={scopingListId}
          onSelectList={onSelectList}
          allLabel="All Contacts"
          totalCount={totalCount}
          refreshing={listsRefreshing}
          onRefresh={onRefreshLists}
        />
      )}
      {!sidebarCollapsed && (
        <Sidebar
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          allContacts={scopedContacts}
          selectedFilters={selectedFilters}
          onToggleFilter={onToggleFilter}
          onClearFilters={onClearFilters}
          listStatus={listStatus}
          loadError={loadError}
          contacts={visibleContacts}
          grouped={grouped}
          selectedContactId={selectedContactId}
          onSelectContact={onSelectContact}
          lettersPresent={lettersPresent}
          onJumpToLetter={onJumpToLetter}
          listRef={listRef}
          scrollContainerRef={scrollContainerRef}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          syncMessage={syncMessage}
          syncError={syncError}
          onDismissSyncStatus={onDismissSyncStatus}
        />
      )}

      <Box component="main" id="contact-detail" sx={{ flexGrow: 1, overflow: "auto", px: 4, pb: 4 }}>
        {!contactSchema ? (
          <Alert severity="error" sx={{ mt: 4 }}>
            Could not load the contact schema.
          </Alert>
        ) : editingContactId !== null ? (
          <SchemaForm
            key={editingContactId}
            schema={contactSchema}
            value={
              editingContactId === "new" ? null : (contacts.find((c) => c.id === editingContactId) as unknown as SavedObject | undefined) ?? null
            }
            initialDraft={editingContactId === "new" ? (copySourceContact as unknown as Record<string, unknown>) ?? undefined : undefined}
            onCancel={onCancelEdit}
            onSaved={(saved) => onContactSaved(saved as unknown as Contact)}
          />
        ) : (
          <Box sx={{ pt: 4 }}>
            {selectedContact ? (
              <SchemaDetail
                key={selectedContact.id}
                schema={contactSchema}
                data={selectedContact as unknown as SchemaObjectData}
                onEdit={onEditContact}
                renderHeader={() => renderContactHeader(selectedContact)}
                extraActions={
                  <Button variant="outlined" size="small" onClick={() => onCopyContact(selectedContact)}>
                    Copy
                  </Button>
                }
              />
            ) : selectedContactId !== null ? (
              <Alert severity="error">Contact not found.</Alert>
            ) : (
              <Typography color="text.secondary">Select a contact to see their details.</Typography>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
