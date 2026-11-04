import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import type { Contact, ListObject, SchemaObject } from "../types";
import type { SelectedFilter } from "../filters";
import type { ListStatus } from "../useAppData";
import { useTypeObjectKeyboardNav } from "../useTypeObjectKeyboardNav";
import { ListsNav } from "./ListsNav";
import { TypeObjectList } from "./TypeObjectList";
import { FilterDropdown } from "./FilterDropdown";
import { contactLetter } from "../search";
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
  const listRef = useTypeObjectKeyboardNav<Contact>({
    items: visibleContacts,
    selectedId: selectedContactId,
    editingId: editingContactId,
    selectedItem: selectedContact,
    onSelect: onSelectContact,
    onCopy: onCopyContact,
    detailContainerId: "contact-detail",
  });

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
      {!sidebarCollapsed &&
        (contactSchema ? (
          <TypeObjectList
            ref={listRef}
            schema={contactSchema}
            objects={visibleContacts as unknown as (Record<string, unknown> & { id: number })[]}
            selectedId={selectedContactId}
            onSelect={onSelectContact}
            hideAllRow
            titleFor={(obj) => buildDisplayName((obj as unknown as Contact).name, { includeNickname: false }) || `Contact ${obj.id}`}
            getLetter={(obj) => contactLetter(obj as unknown as Contact)}
            headerAction={
              <FilterDropdown
                contacts={scopedContacts}
                selectedFilters={selectedFilters}
                onToggleFilter={onToggleFilter}
                onClear={onClearFilters}
              />
            }
            banner={
              <>
                {listStatus === "loading" && (
                  <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
                    Loading…
                  </Typography>
                )}
                {listStatus === "error" && loadError && (
                  <Box sx={{ px: 1, pt: 1 }}>
                    <Alert severity="error">{loadError}</Alert>
                  </Box>
                )}
                {(syncMessage || syncError) && (
                  <Box sx={{ px: 1, pt: 1 }}>
                    <Alert severity={syncError ? "error" : "success"} onClose={onDismissSyncStatus}>
                      {syncError ?? syncMessage}
                    </Alert>
                  </Box>
                )}
              </>
            }
            search={{ query: searchQuery, onQueryChange: onSearchChange, grouped }}
            widthStorageKey="contacts.sidebar.width"
            defaultWidth={320}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
          />
        ) : (
          <Box
            sx={{
              width: 320,
              flexShrink: 0,
              borderRight: 1,
              borderColor: "divider",
            }}
          />
        ))}

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
