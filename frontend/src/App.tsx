import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { fetchTags, batchAddTags, ApiError, refreshList } from "./api";
import type { Contact, ListObject, SchemaField } from "./types";
import { contactLetter } from "./search";
import { sameFilter, type SelectedFilter } from "./filters";
import { useDebouncedValue, useFilteredContactIds } from "./hooks";
import { useAppData } from "./useAppData";
import { useGenericTypeBrowser } from "./useGenericTypeBrowser";
import { useSchemaObjects } from "./useSchemaObjects";
import { useSyncFlow } from "./useSyncFlow";
import { useContactKeyboardNav } from "./useContactKeyboardNav";
import { ContactView } from "./components/ContactView";
import { ListView } from "./components/ListView";
import { SchemaView } from "./components/SchemaView";
import { GenericTypeView } from "./components/GenericTypeView";
import { TopBar } from "./components/TopBar";
import { BirthdayView } from "./components/BirthdayView";
import { BatchTagModal } from "./components/BatchTagModal";
import { SyncVerificationModal } from "./components/SyncVerificationModal";
import { SyncReviewModal } from "./components/SyncReviewModal";
import { AdminConsoleModal } from "./components/AdminConsoleModal";
import { NavigateToObjectContext } from "./schema-form/navigation";
import Box from "@mui/material/Box";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "contacts.sidebar.collapsed";

function readStoredSidebarCollapsed(): boolean {
  return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
}

// The route shape is `/types/:typeName/:id?` for every browsable type
// (contact, list, or custom) plus `/birthdays` for the calendar. Parsed by
// hand rather than via react-router's `useParams` because `App` is mounted
// at one catch-all route (see main.tsx) so it never unmounts/remounts the
// app-wide state (contacts, tags, sync modals, ...) as the path changes.
function parseAppPath(pathname: string): { typeName: string; id: number | null } {
  const match = pathname.match(/^\/types\/([^/]+)(?:\/(\d+))?\/?$/);
  if (!match) {
    return { typeName: "contact", id: null };
  }
  return { typeName: match[1], id: match[2] ? Number(match[2]) : null };
}

function filtersFromSearchParams(searchParams: URLSearchParams): SelectedFilter[] {
  const filters: SelectedFilter[] = [];
  for (const raw of searchParams.getAll("filter")) {
    const separatorIndex = raw.indexOf("=");
    if (separatorIndex === -1) continue;
    filters.push({ field: raw.slice(0, separatorIndex), value: raw.slice(separatorIndex + 1) });
  }
  return filters;
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isBirthdays = location.pathname === "/birthdays";
  const { typeName, id: routeId } = parseAppPath(location.pathname);
  const selectedContactId = typeName === "contact" ? routeId : null;
  const selectedListId = typeName === "list" ? routeId : null;
  // Which list scopes the contacts sidebar -- independent of `selectedListId`
  // (the Lists type-browser's own selection), since scoping is a filter on
  // the *contacts* route, not a navigation to the list's own detail page.
  const scopingListIdRaw = searchParams.get("list");
  const scopingListId = scopingListIdRaw && /^\d+$/.test(scopingListIdRaw) ? Number(scopingListIdRaw) : null;
  const searchQuery = searchParams.get("q") ?? "";
  const selectedFilters = useMemo(() => filtersFromSearchParams(searchParams), [searchParams]);

  function setSearchQuery(value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set("q", value);
        else next.delete("q");
        return next;
      },
      { replace: true }
    );
  }

  function setSelectedFilters(updater: SelectedFilter[] | ((prev: SelectedFilter[]) => SelectedFilter[])) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const current = filtersFromSearchParams(prev);
        const updated = typeof updater === "function" ? updater(current) : updater;
        next.delete("filter");
        for (const filter of updated) next.append("filter", `${filter.field}=${filter.value}`);
        return next;
      },
      { replace: true }
    );
  }

  const appData = useAppData();
  const { contacts, setContacts, tags, setTags, lists, setLists, listMemberIds, memberTypes, listSchema, contactSchema } = appData;

  // Browsing state for any type that isn't "contact", "list", or "schema" --
  // the generic type browser.
  const isGenericType = !isBirthdays && typeName !== "contact" && typeName !== "list" && typeName !== "schema";
  const genericBrowser = useGenericTypeBrowser(typeName, isGenericType);
  const schemaObjectsBrowser = useSchemaObjects(typeName);
  const { schemaObjects, setSchemaObjects } = schemaObjectsBrowser;

  const [editingListId, setEditingListId] = useState<number | "new" | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBatchTagModal, setShowBatchTagModal] = useState(false);
  const [editingContactId, setEditingContactId] = useState<number | "new" | null>(null);
  const [copySourceContact, setCopySourceContact] = useState<Contact | null>(null);
  const [showAdminConsole, setShowAdminConsole] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readStoredSidebarCollapsed);
  const [selectedListRefreshing, setSelectedListRefreshing] = useState(false);
  const [selectedListRefreshError, setSelectedListRefreshError] = useState<string | null>(null);

  const sync = useSyncFlow(setContacts, setTags);

  // A selection made while browsing one type shouldn't silently carry over
  // (and be exportable) after navigating to a different one.
  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, [typeName]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Leaving an edit/create form behind when navigating to a different path
  // (a different object, a different type, back/forward, ...) rather than
  // leaving it stranded showing stale data.
  useEffect(() => {
    setEditingContactId(null);
    setCopySourceContact(null);
    setEditingListId(null);
  }, [location.pathname]);

  // Overlays `member_type` on top of the plain schema: a `select` fed by the
  // live type registry when creating a list, read-only once it exists (a
  // list's member_type can't change after creation). SchemaForm itself has
  // no idea member_type is special.
  const overlayListFields = useCallback(
    (fields: SchemaField[], isEditing: boolean): SchemaField[] =>
      fields.map((field) => {
        if (field.key !== "member_type") return field;
        return isEditing
          ? { ...field, readOnly: true }
          : { ...field, type: "select", resolved_options: memberTypes.map((type) => ({ value: type, label: type })) };
      }),
    [memberTypes]
  );

  // react-router keeps the URL in sync with navigation automatically, and
  // re-renders with the new location on back/forward -- no manual
  // pushState/popstate bookkeeping needed (see main.tsx for why `App` is
  // still only ever one component instance across all of that).

  // The list that scopes the current type's second-tier sidebar -- the
  // current "view" that search/filters/the alpha index all then narrow
  // further. A missing/deleted list falls back to "all objects of this
  // type" rather than showing an empty list. Distinct from `selectedListId`
  // (the Lists type-browser's own selection) -- see where `scopingListId` is
  // derived above.
  const selectedList = lists.find((list) => list.id === selectedListId) ?? null;
  const scopingList = lists.find((list) => list.id === scopingListId) ?? null;
  const scopedContacts = useMemo(() => {
    if (scopingList === null) {
      return contacts;
    }
    const idSet = new Set(listMemberIds[scopingList.id] ?? []);
    return contacts.filter((contact) => idSet.has(contact.id));
  }, [contacts, scopingList, listMemberIds]);

  // The Lists-tier nav only ever shows lists whose member_type matches the
  // type currently being browsed -- a list of companies has no business
  // showing up while browsing contacts, and vice versa.
  const listsForCurrentType = useMemo(() => lists.filter((list) => list.member_type === typeName), [lists, typeName]);

  function scopeObjectsByList<T extends { id: number }>(allObjects: T[]): T[] {
    if (scopingList === null) {
      return allObjects;
    }
    const idSet = new Set(listMemberIds[scopingList.id] ?? []);
    return allObjects.filter((obj) => idSet.has(obj.id));
  }

  const scopedLists = useMemo(() => scopeObjectsByList(lists), [lists, scopingList, listMemberIds]);
  const scopedGenericObjects = useMemo(
    () => scopeObjectsByList(genericBrowser.genericObjects),
    [genericBrowser.genericObjects, scopingList, listMemberIds]
  );
  const scopedSchemaObjects = useMemo(
    () => scopeObjectsByList(schemaObjects),
    [schemaObjects, scopingList, listMemberIds]
  );

  // Debounced so fast typing doesn't kick off a filter pass per keystroke;
  // the actual filtering then runs in a Web Worker, off the main thread.
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 100);
  const { ids: visibleContactIds, query: appliedSearchQuery } = useFilteredContactIds(
    scopedContacts,
    debouncedSearchQuery,
    selectedFilters
  );
  const contactsById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);
  const visibleContacts = useMemo(
    () => visibleContactIds.flatMap((id) => (contactsById.has(id) ? [contactsById.get(id)!] : [])),
    [visibleContactIds, contactsById]
  );

  // Letter sections and the alphabet index only make sense when contacts are
  // in alphabetical order; an active search re-ranks by relevance instead.
  // Keyed off the query the *worker* actually applied (not the debounced
  // input directly) so this never flips ahead of `visibleContacts` itself —
  // otherwise a list still in relevance order from the previous query could
  // briefly render as "grouped", scattering stray one-contact letter headers.
  const grouped = !appliedSearchQuery.trim();
  const lettersPresent = useMemo(() => new Set(visibleContacts.map(contactLetter)), [visibleContacts]);

  const selectedContact = contacts.find((contact) => contact.id === selectedContactId) ?? null;

  // react-router's `navigate` (from plain `<BrowserRouter>`, not a data
  // router) gets a new identity on every route change -- it's internally
  // named `useNavigateUnstable` -- which would otherwise force
  // `handleSelectContact` to a new identity on every click too, defeating
  // `ContactRow`'s memoization for every one of the ~1000 rows just to
  // select one. Refs hold the latest values so the callback itself can stay
  // referentially stable across renders.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const locationSearchRef = useRef(location.search);
  locationSearchRef.current = location.search;

  // Stable identity so it doesn't defeat ContactList's memoization on every
  // keystroke in the search box. Preserves the current search/filter/list
  // scoping query params -- only the selected contact itself changes.
  const handleSelectContact = useCallback((id: number) => {
    navigateRef.current({ pathname: `/types/contact/${id}`, search: locationSearchRef.current });
  }, []);

  function handleCopyContact(contact: Contact) {
    setCopySourceContact(contact);
    setEditingContactId("new");
  }

  const { listRef, jumpToLetter } = useContactKeyboardNav(
    visibleContacts,
    selectedContactId,
    editingContactId,
    selectedContact,
    handleSelectContact,
    handleCopyContact
  );

  // Jumps from the birthdays calendar straight to a contact's detail view.
  const handleSelectContactFromBirthdays = useCallback((id: number) => {
    navigateRef.current(`/types/contact/${id}`);
  }, []);

  // How the generic renderer (reference fields, the Lists section, list
  // member rows) navigates to another object -- generic by construction,
  // since every type (including "list") is just `/types/<name>/<id>` now.
  const navigateToObject = useCallback(
    (objectType: string, id: number) => {
      navigate(`/types/${objectType}/${id}`);
    },
    [navigate]
  );

  // Scoping the current type's sidebar to a list (like switching a mailbox
  // folder) resets the search/filter/selection state, rather than carrying
  // it over from whatever was previously scoped.
  function handleSelectList(listId: number | null) {
    const next = new URLSearchParams();
    if (listId !== null) next.set("list", String(listId));
    navigate({ pathname: `/types/${typeName}`, search: next.toString() });
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function toggleFilter(filter: SelectedFilter) {
    setSelectedFilters((prev) =>
      prev.some((selected) => sameFilter(selected, filter))
        ? prev.filter((selected) => !sameFilter(selected, filter))
        : [...prev, filter]
    );
  }

  function toggleSelectionMode() {
    setSelectionMode((prev) => {
      if (prev) {
        setSelectedIds(new Set());
      }
      return !prev;
    });
  }

  // Stable identity so it doesn't defeat ContactList's memoization on every
  // keystroke in the search box.
  const toggleObjectSelection = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // The objects selection/export acts on, for whichever view is active.
  function selectableObjects(): (Record<string, unknown> & { id: number })[] {
    if (typeName === "contact") return contacts as unknown as (Record<string, unknown> & { id: number })[];
    if (typeName === "list") return lists as unknown as (Record<string, unknown> & { id: number })[];
    if (typeName === "schema") return schemaObjects as unknown as (Record<string, unknown> & { id: number })[];
    return genericBrowser.genericObjects;
  }

  function selectAllVisible() {
    const ids = typeName === "contact" ? visibleContacts.map((contact) => contact.id) : selectableObjects().map((obj) => obj.id);
    setSelectedIds(new Set(ids));
  }

  async function handleContactSaved(contact: Contact) {
    setContacts((prev: Contact[]) => {
      const exists = prev.some((c) => c.id === contact.id);
      return exists ? prev.map((c) => (c.id === contact.id ? contact : c)) : [...prev, contact];
    });
    setEditingContactId(null);
    setCopySourceContact(null);
    navigate({ pathname: `/types/contact/${contact.id}`, search: location.search });
    try {
      const tagsData = await fetchTags();
      setTags(tagsData.tags);
    } catch {
      // Keep the existing tag list if the refresh fails; it'll catch up
      // next time tags are reloaded.
    }
  }

  function handleNewList() {
    setEditingListId("new");
  }

  async function handleListSaved(list: ListObject) {
    setLists((prev: ListObject[]) => {
      const exists = prev.some((l) => l.id === list.id);
      return exists ? prev.map((l) => (l.id === list.id ? list : l)) : [...prev, list];
    });
    // Saving a list runs/changes its query server-side, so re-read membership.
    try {
      await appData.refetchListMemberIds();
    } catch {
      // Counts will catch up on the next load.
    }
    setEditingListId(null);
    navigate(`/types/list/${list.id}`);
  }

  function handleListRefreshed(list: ListObject) {
    setLists((prev: ListObject[]) => prev.map((l) => (l.id === list.id ? list : l)));
    appData.refetchListMemberIds().catch(() => {
      // Counts will catch up on the next load.
    });
  }

  async function handleRefreshSelectedList(listId: number) {
    if (selectedListRefreshing) return;
    setSelectedListRefreshing(true);
    setSelectedListRefreshError(null);
    try {
      handleListRefreshed(await refreshList(listId));
    } catch (err) {
      setSelectedListRefreshError(err instanceof ApiError ? err.message : "Failed to refresh list");
    } finally {
      setSelectedListRefreshing(false);
    }
  }

  async function handleBatchAddTags(newTags: string[]) {
    const response = await batchAddTags([...selectedIds], newTags);
    const updatedById = new Map(response.contacts.map((contact) => [contact.id, contact]));
    setContacts(contacts.map((contact) => updatedById.get(contact.id) ?? contact));
    setTags(response.tags);
    setShowBatchTagModal(false);
    setSelectedIds(new Set());
    setSelectionMode(false);
  }

  function handleExportSelected() {
    const selected = selectableObjects().filter((obj) => selectedIds.has(obj.id));
    const lines = selected.map((obj) => "  " + JSON.stringify(obj));
    const json = "[\n" + lines.join(",\n") + "\n]";
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${typeName ?? "objects"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <NavigateToObjectContext.Provider value={navigateToObject}>
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <TopBar
        typeName={isBirthdays ? null : typeName}
        onSelectType={(nextTypeName) => navigate(`/types/${nextTypeName}`)}
        isBirthdays={isBirthdays}
        onToggleBirthdays={() => navigate(isBirthdays ? "/types/contact" : "/birthdays")}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebarCollapsed={() => setSidebarCollapsed((prev) => !prev)}
        onNewContact={() => {
          setCopySourceContact(null);
          setEditingContactId("new");
        }}
        onNewList={handleNewList}
        genericTypeLabel={isGenericType ? genericBrowser.genericSchema?.label.singular : typeName === "schema" ? "Schema" : undefined}
        onNewGenericObject={
          isGenericType
            ? () => genericBrowser.setEditingGenericId("new")
            : typeName === "schema"
              ? () => schemaObjectsBrowser.setEditingSchemaId("new")
              : undefined
        }
        canSelect={!isBirthdays}
        selectionMode={selectionMode}
        onToggleSelectionMode={toggleSelectionMode}
        selectedCount={selectedIds.size}
        onSelectAllVisible={selectAllVisible}
        onClearSelection={() => setSelectedIds(new Set())}
        onAddTags={() => setShowBatchTagModal(true)}
        onExportSelected={handleExportSelected}
        syncing={sync.syncing}
        syncDirection={sync.syncDirection}
        onPull={() => sync.handleStartSync("pull")}
        onPush={() => sync.handleStartSync("push")}
        onOpenAdminConsole={() => setShowAdminConsole(true)}
      />

      {isBirthdays ? (
        <BirthdayView contacts={contacts} onSelectContact={handleSelectContactFromBirthdays} />
      ) : typeName === "contact" ? (
        <ContactView
          sidebarCollapsed={sidebarCollapsed}
          listsForCurrentType={listsForCurrentType}
          listMemberIds={listMemberIds}
          scopingListId={scopingListId}
          onSelectList={handleSelectList}
          totalCount={contacts.length}
          listsRefreshing={appData.listsRefreshing}
          onRefreshLists={appData.handleRefreshLists}
          contacts={contacts}
          scopedContacts={scopedContacts}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedFilters={selectedFilters}
          onToggleFilter={toggleFilter}
          onClearFilters={() => setSelectedFilters([])}
          listStatus={appData.listStatus}
          loadError={appData.loadError}
          visibleContacts={visibleContacts}
          grouped={grouped}
          selectedContactId={selectedContactId}
          onSelectContact={handleSelectContact}
          lettersPresent={lettersPresent}
          onJumpToLetter={jumpToLetter}
          listRef={listRef}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleObjectSelection}
          syncMessage={sync.syncMessage}
          syncError={sync.syncError}
          onDismissSyncStatus={sync.dismissSyncStatus}
          contactSchema={contactSchema}
          editingContactId={editingContactId}
          copySourceContact={copySourceContact}
          onCancelEdit={() => {
            setEditingContactId(null);
            setCopySourceContact(null);
          }}
          onContactSaved={handleContactSaved}
          selectedContact={selectedContact}
          onEditContact={() => selectedContact && setEditingContactId(selectedContact.id)}
          onCopyContact={handleCopyContact}
        />
      ) : typeName === "list" ? (
        <ListView
          sidebarCollapsed={sidebarCollapsed}
          listsForCurrentType={listsForCurrentType}
          listMemberIds={listMemberIds}
          scopingListId={scopingListId}
          onSelectList={handleSelectList}
          listsRefreshing={appData.listsRefreshing}
          onRefreshLists={appData.handleRefreshLists}
          lists={lists}
          scopedLists={scopedLists}
          listSchema={listSchema}
          selectedListId={selectedListId}
          navigate={navigate}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleObjectSelection}
          overlayListFields={overlayListFields}
          editingListId={editingListId}
          onCancelEditList={() => setEditingListId(null)}
          onListSaved={handleListSaved}
          selectedList={selectedList}
          onEditList={() => selectedList && setEditingListId(selectedList.id)}
          onRefreshSelectedList={handleRefreshSelectedList}
          selectedListRefreshing={selectedListRefreshing}
          selectedListRefreshError={selectedListRefreshError}
        />
      ) : typeName === "schema" ? (
        <SchemaView
          sidebarCollapsed={sidebarCollapsed}
          listsForCurrentType={listsForCurrentType}
          listMemberIds={listMemberIds}
          scopingListId={scopingListId}
          onSelectList={handleSelectList}
          listsRefreshing={appData.listsRefreshing}
          onRefreshLists={appData.handleRefreshLists}
          schemaObjects={schemaObjects}
          setSchemaObjects={setSchemaObjects}
          scopedSchemaObjects={scopedSchemaObjects}
          routeId={routeId}
          navigate={navigate}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleObjectSelection}
          editingSchemaId={schemaObjectsBrowser.editingSchemaId}
          setEditingSchemaId={schemaObjectsBrowser.setEditingSchemaId}
        />
      ) : (
        <GenericTypeView
          sidebarCollapsed={sidebarCollapsed}
          listsForCurrentType={listsForCurrentType}
          listMemberIds={listMemberIds}
          scopingListId={scopingListId}
          onSelectList={handleSelectList}
          listsRefreshing={appData.listsRefreshing}
          onRefreshLists={appData.handleRefreshLists}
          typeName={typeName}
          routeId={routeId}
          navigate={navigate}
          genericSchema={genericBrowser.genericSchema}
          genericObjects={genericBrowser.genericObjects}
          scopedGenericObjects={scopedGenericObjects}
          genericReady={genericBrowser.genericReady}
          genericLoading={genericBrowser.genericLoading}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleObjectSelection}
          editingGenericId={genericBrowser.editingGenericId}
          setEditingGenericId={genericBrowser.setEditingGenericId}
          saveGenericObject={genericBrowser.saveGenericObject}
        />
      )}

      {showBatchTagModal && (
        <BatchTagModal
          contactCount={selectedIds.size}
          allTags={tags}
          onCancel={() => setShowBatchTagModal(false)}
          onSubmit={handleBatchAddTags}
        />
      )}

      {sync.syncChallenge && (
        <SyncVerificationModal
          challenge={sync.syncChallenge}
          onCancel={sync.handleSyncCancel}
          onSelectDevice={sync.handleSyncSelectDevice}
          onSubmitCode={sync.handleSyncSubmitCode}
        />
      )}

      {sync.syncReview && sync.syncDirection && (
        <SyncReviewModal
          review={sync.syncReview}
          direction={sync.syncDirection}
          onCancel={sync.handleSyncReviewCancel}
          onApply={sync.handleSyncReviewApply}
        />
      )}

      {showAdminConsole && <AdminConsoleModal onClose={() => setShowAdminConsole(false)} />}
    </Box>
    </NavigateToObjectContext.Provider>
  );
}
