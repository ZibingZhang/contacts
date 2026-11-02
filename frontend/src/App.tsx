import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchContacts,
  fetchTags,
  fetchLists,
  fetchAllListMemberIds,
  refreshLists,
  fetchSchemas,
  batchAddTags,
  startSync,
  submitSyncDevice,
  submitSyncCode,
  applySyncReview,
  startPush,
  submitPushDevice,
  submitPushCode,
  applyPushReview,
  apiBaseUrl,
  ApiError,
} from "./api";
import type {
  Contact,
  ListObject,
  TagCount,
  SyncRequiresVerification,
  SyncReview,
  SyncResult,
} from "./types";
import { contactLetter } from "./search";
import { sameFilter, type SelectedFilter } from "./filters";
import { useDebouncedValue, useFilteredContactIds, isTypingTarget } from "./hooks";
import { Sidebar, type ListStatus } from "./components/Sidebar";
import { ListsNav } from "./components/ListsNav";
import { ListsPanel } from "./components/ListsPanel";
import { ListDetail } from "./components/ListDetail";
import { ListForm } from "./components/ListForm";
import { TopBar, type AppView } from "./components/TopBar";
import { ContactDetail } from "./components/ContactDetail";
import { BirthdayView } from "./components/BirthdayView";
import { BatchTagModal } from "./components/BatchTagModal";
import { ContactForm } from "./components/ContactForm";
import { SyncVerificationModal } from "./components/SyncVerificationModal";
import { SyncReviewModal, type SyncDirection } from "./components/SyncReviewModal";
import { AdminConsoleModal } from "./components/AdminConsoleModal";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";

function networkErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return `Could not reach the contacts API at ${apiBaseUrl()} — is \`python -m contacts serve\` running?`;
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = "contacts.sidebar.collapsed";

/** JSON object keys are strings, so turn them back into list ids. */
function parseMemberIds(raw: Record<string, number[]>): Record<number, number[]> {
  const parsed: Record<number, number[]> = {};
  for (const [listId, ids] of Object.entries(raw)) {
    parsed[Number(listId)] = ids;
  }
  return parsed;
}

function readStoredSidebarCollapsed(): boolean {
  return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
}

function paramsFromLocation(): {
  query: string;
  filters: SelectedFilter[];
  contactId: number | null;
  listId: number | null;
  view: AppView;
} {
  const params = new URLSearchParams(window.location.search);
  const filters: SelectedFilter[] = [];
  for (const raw of params.getAll("filter")) {
    const separatorIndex = raw.indexOf("=");
    if (separatorIndex === -1) continue;
    filters.push({ field: raw.slice(0, separatorIndex), value: raw.slice(separatorIndex + 1) });
  }
  const contactParam = params.get("contact");
  const contactId = contactParam !== null && /^\d+$/.test(contactParam) ? Number(contactParam) : null;
  const listParam = params.get("list");
  const listId = listParam !== null && /^\d+$/.test(listParam) ? Number(listParam) : null;
  const viewParam = params.get("view");
  const view: AppView = viewParam === "lists" || viewParam === "birthdays" ? viewParam : "contacts";
  return {
    query: params.get("q") ?? "",
    filters,
    view,
    contactId,
    listId,
  };
}

interface SyncApi {
  start: () => Promise<SyncResult>;
  submitDevice: (deviceIndex: number) => Promise<SyncResult>;
  submitCode: (code: string) => Promise<SyncResult>;
  applyReview: (createIcloudIds: string[], updateIcloudIds: string[]) => Promise<SyncResult>;
}

const SYNC_API: Record<SyncDirection, SyncApi> = {
  pull: { start: startSync, submitDevice: submitSyncDevice, submitCode: submitSyncCode, applyReview: applySyncReview },
  push: { start: startPush, submitDevice: submitPushDevice, submitCode: submitPushCode, applyReview: applyPushReview },
};

export function App() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [lists, setLists] = useState<ListObject[]>([]);
  // List id -> its member object ids, loaded alongside the lists themselves
  // since membership now lives in associations rather than on the list.
  const [listMemberIds, setListMemberIds] = useState<Record<number, number[]>>({});
  const [memberTypes, setMemberTypes] = useState<string[]>(["contact"]);
  const [listsRefreshing, setListsRefreshing] = useState(false);
  const [selectedListId, setSelectedListId] = useState<number | null>(() => paramsFromLocation().listId);
  const [editingListId, setEditingListId] = useState<number | "new" | null>(null);
  const [view, setView] = useState<AppView>(() => paramsFromLocation().view);
  const [selectedFilters, setSelectedFilters] = useState<SelectedFilter[]>(() => paramsFromLocation().filters);
  const [searchQuery, setSearchQuery] = useState(() => paramsFromLocation().query);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(() => paramsFromLocation().contactId);
  const [listStatus, setListStatus] = useState<ListStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBatchTagModal, setShowBatchTagModal] = useState(false);
  const [editingContactId, setEditingContactId] = useState<number | "new" | null>(null);
  const [copySourceContact, setCopySourceContact] = useState<Contact | null>(null);
  const [syncDirection, setSyncDirection] = useState<SyncDirection | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncChallenge, setSyncChallenge] = useState<SyncRequiresVerification | null>(null);
  const [syncReview, setSyncReview] = useState<SyncReview | null>(null);
  const [showAdminConsole, setShowAdminConsole] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readStoredSidebarCollapsed);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const listRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Tracks the contact id the URL was last synced with, so the history
  // effect can tell "navigated to a different contact" (push, so back/
  // forward moves through contacts viewed) apart from "search/filter
  // changed while on the same contact" (replace, so typing doesn't spam
  // history).
  const syncedContactIdRef = useRef<number | null>(selectedContactId);
  // Same idea as syncedContactIdRef, but for the selected list -- switching
  // which list scopes/is shown pushes a history entry (like switching a
  // mailbox folder), so back/forward moves between lists too.
  const syncedListIdRef = useRef<number | null>(selectedListId);
  // ...and for the top-level contacts/lists view itself.
  const syncedViewRef = useRef<AppView>(view);

  useEffect(() => {
    let cancelled = false;
    setListStatus("loading");
    fetchContacts()
      .then((data) => {
        if (cancelled) return;
        setContacts(data.objects);
        setListStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(networkErrorMessage(error));
        setListStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchTags()
      .then((data) => {
        if (!cancelled) setTags(data.tags);
      })
      .catch(() => {
        if (!cancelled) setTags([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchLists(), fetchAllListMemberIds()])
      .then(([listsData, memberIdsData]) => {
        if (cancelled) return;
        setLists(listsData.objects);
        setListMemberIds(parseMemberIds(memberIdsData.member_ids));
      })
      .catch(() => {
        if (cancelled) return;
        setLists([]);
        setListMemberIds({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The member-type picker on the list form needs the available types.
  useEffect(() => {
    let cancelled = false;
    fetchSchemas()
      .then((data) => {
        if (cancelled) return;
        setMemberTypes(
          data.schemas
            .map((schema) => schema.name)
            .filter((name) => name !== "schema" && name !== "association")
            .sort()
        );
      })
      .catch(() => {
        if (!cancelled) setMemberTypes(["contact"]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRefreshLists() {
    setListsRefreshing(true);
    try {
      const data = await refreshLists();
      setLists(data.objects);
      // Refreshing re-runs each query, so membership has to be re-read.
      setListMemberIds(parseMemberIds((await fetchAllListMemberIds()).member_ids));
    } catch {
      // Keep the existing lists if the refresh fails.
    } finally {
      setListsRefreshing(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (searchQuery) {
      params.set("q", searchQuery);
    } else {
      params.delete("q");
    }
    params.delete("filter");
    for (const filter of selectedFilters) {
      params.append("filter", `${filter.field}=${filter.value}`);
    }
    if (selectedContactId !== null) {
      params.set("contact", String(selectedContactId));
    } else {
      params.delete("contact");
    }
    if (selectedListId !== null) {
      params.set("list", String(selectedListId));
    } else {
      params.delete("list");
    }
    if (view === "lists" || view === "birthdays") {
      params.set("view", view);
    } else {
      params.delete("view");
    }
    const queryString = params.toString();
    const newUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;
    if (
      selectedContactId !== syncedContactIdRef.current ||
      selectedListId !== syncedListIdRef.current ||
      view !== syncedViewRef.current
    ) {
      window.history.pushState(null, "", newUrl);
    } else {
      window.history.replaceState(null, "", newUrl);
    }
    syncedContactIdRef.current = selectedContactId;
    syncedListIdRef.current = selectedListId;
    syncedViewRef.current = view;
  }, [searchQuery, selectedFilters, selectedContactId, selectedListId, view]);

  // Restores search/filter/selection state when the user navigates with the
  // browser's back/forward buttons.
  useEffect(() => {
    function handlePopState() {
      const { query, filters, contactId, listId, view: poppedView } = paramsFromLocation();
      syncedContactIdRef.current = contactId;
      syncedListIdRef.current = listId;
      syncedViewRef.current = poppedView;
      setSearchQuery(query);
      setSelectedFilters(filters);
      setSelectedContactId(contactId);
      setSelectedListId(listId);
      setView(poppedView);
      setEditingContactId(null);
      setCopySourceContact(null);
      setEditingListId(null);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // The current "view" -- all contacts, or just the selected list's members
  // -- that search/filters/the alpha index all then narrow further. A
  // missing/deleted list falls back to all contacts rather than showing an
  // empty list.
  const selectedList = lists.find((list) => list.id === selectedListId) ?? null;
  const scopedContacts = useMemo(() => {
    if (selectedList === null) {
      return contacts;
    }
    const idSet = new Set(listMemberIds[selectedList.id] ?? []);
    return contacts.filter((contact) => idSet.has(contact.id));
  }, [contacts, selectedList, listMemberIds]);

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

  function findListItem(id: number): HTMLElement | null {
    return listRef.current?.querySelector<HTMLElement>(`[data-contact-id="${id}"]`) ?? null;
  }

  // Scrolls `item` to the top of the list, then nudges past any sticky letter
  // header immediately above it so the header doesn't end up pinned on top
  // of (and hiding) the item itself.
  function scrollListItemToTop(item: HTMLElement) {
    item.scrollIntoView({ block: "start" });
    const prev = item.previousElementSibling as HTMLElement | null;
    if (prev && prev.classList.contains("contact-letter-header") && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop -= prev.offsetHeight;
    }
  }

  // Scrolls via the header's first contact item rather than the header
  // itself. The header is `position: sticky`, so once it's been scrolled
  // past, browsers report its position/rect as wherever it's currently
  // pinned rather than its true document position — scrollIntoView on it is
  // then a no-op, which is why jumping to an earlier letter (up) silently
  // failed while jumping to a later one (down) worked. Contact items aren't
  // sticky, so their position is always reported accurately.
  // Stable identity (it only ever touches refs/the DOM) so it doesn't defeat
  // AlphaIndex's memoization on every keystroke.
  const jumpToLetter = useCallback((letter: string) => {
    const header = document.getElementById(`contact-letter-${letter}`);
    if (!header) {
      return;
    }
    const firstItem = header.nextElementSibling as HTMLElement | null;
    if (firstItem) {
      scrollListItemToTop(firstItem);
    } else {
      header.scrollIntoView({ block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Moves the selection by `delta` positions within the currently displayed
  // list, wrapping to the first/last contact if nothing is selected yet.
  function moveSelection(delta: number) {
    if (!visibleContacts.length) {
      return;
    }
    const currentIndex = visibleContacts.findIndex((c) => c.id === selectedContactId);
    const nextIndex = currentIndex === -1 ? (delta > 0 ? 0 : visibleContacts.length - 1) : currentIndex + delta;
    if (nextIndex < 0 || nextIndex >= visibleContacts.length) {
      return;
    }
    const nextContact = visibleContacts[nextIndex];
    setSelectedContactId(nextContact.id);
    findListItem(nextContact.id)?.scrollIntoView({ block: "nearest" });
  }

  // Jumps the selection straight to the first or last contact in the
  // currently displayed list.
  function selectBoundaryContact(position: "first" | "last") {
    if (!visibleContacts.length) {
      return;
    }
    const contact = position === "first" ? visibleContacts[0] : visibleContacts[visibleContacts.length - 1];
    setSelectedContactId(contact.id);
    const item = findListItem(contact.id);
    if (!item) {
      return;
    }
    if (position === "first") {
      scrollListItemToTop(item);
    } else {
      item.scrollIntoView({ block: "end" });
    }
  }

  // Scrolls the edit form's container all the way to its top or bottom.
  function scrollEditFormToBoundary(position: "top" | "bottom") {
    const container = document.getElementById("contact-detail");
    if (!container) {
      return;
    }
    container.scrollTo({ top: position === "top" ? 0 : container.scrollHeight });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const jumpToBoundary = event.metaKey || event.ctrlKey;
      // While editing, Cmd/Ctrl+Up/Down scrolls the form instead of jumping
      // the (hidden) list selection out from under the contact being edited.
      if (editingContactId !== null && jumpToBoundary && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        scrollEditFormToBoundary(event.key === "ArrowDown" ? "bottom" : "top");
        return;
      }
      if (editingContactId !== null) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        jumpToBoundary ? selectBoundaryContact("last") : moveSelection(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        jumpToBoundary ? selectBoundaryContact("first") : moveSelection(-1);
      } else if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        document.getElementById("search-input")?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visibleContacts, selectedContactId, editingContactId]);

  // Switching views (like switching a mailbox folder) resets the search/
  // filter/selection state scoped to the previous view, rather than
  // carrying it over into the new one.
  function handleSelectList(listId: number | null) {
    setSelectedListId(listId);
    setSearchQuery("");
    setSelectedFilters([]);
    setSelectedContactId(null);
    setEditingContactId(null);
    setCopySourceContact(null);
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
  const toggleContactSelection = useCallback((id: number) => {
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

  function selectAllVisible() {
    setSelectedIds(new Set(visibleContacts.map((contact) => contact.id)));
  }

  async function finishSync(direction: SyncDirection, result: SyncResult) {
    if (result.status === "requires_verification") {
      setSyncChallenge(result);
      return;
    }
    if (result.status === "review") {
      setSyncChallenge(null);
      setSyncReview(result);
      return;
    }
    setSyncChallenge(null);
    setSyncReview(null);
    setSyncing(false);
    const [contactsData, tagsData] = await Promise.all([fetchContacts(), fetchTags()]);
    setContacts(contactsData.objects);
    setTags(tagsData.tags);
    const verb = direction === "pull" ? "Pulled from" : "Pushed to";
    setSyncMessage(
      result.created === 0 && result.updated === 0
        ? "Already up to date with iCloud."
        : `${verb} iCloud: ${result.created} created, ${result.updated} updated.`
    );
  }

  async function handleStartSync(direction: SyncDirection) {
    setSyncDirection(direction);
    setSyncing(true);
    setSyncError(null);
    setSyncMessage(null);
    try {
      await finishSync(direction, await SYNC_API[direction].start());
    } catch (error) {
      setSyncError(networkErrorMessage(error));
      setSyncing(false);
    }
  }

  async function handleSyncSelectDevice(deviceIndex: number) {
    if (!syncDirection) return;
    const result = await SYNC_API[syncDirection].submitDevice(deviceIndex);
    if (result.status === "requires_verification") {
      setSyncChallenge(result);
    }
  }

  async function handleSyncSubmitCode(code: string) {
    if (!syncDirection) return;
    await finishSync(syncDirection, await SYNC_API[syncDirection].submitCode(code));
  }

  function handleSyncCancel() {
    setSyncChallenge(null);
    setSyncing(false);
    setSyncDirection(null);
  }

  async function handleSyncReviewApply(createIcloudIds: string[], updateIcloudIds: string[]) {
    if (!syncDirection) return;
    await finishSync(syncDirection, await SYNC_API[syncDirection].applyReview(createIcloudIds, updateIcloudIds));
  }

  function handleSyncReviewCancel() {
    setSyncReview(null);
    setSyncing(false);
    setSyncDirection(null);
  }

  async function handleContactSaved(contact: Contact) {
    setContacts((prev) => {
      const exists = prev.some((c) => c.id === contact.id);
      return exists ? prev.map((c) => (c.id === contact.id ? contact : c)) : [...prev, contact];
    });
    setSelectedContactId(contact.id);
    setEditingContactId(null);
    setCopySourceContact(null);
    try {
      const tagsData = await fetchTags();
      setTags(tagsData.tags);
    } catch {
      // Keep the existing tag list if the refresh fails; it'll catch up
      // next time tags are reloaded.
    }
  }

  function handleSelectView(nextView: AppView) {
    setView(nextView);
  }

  function handleNewList() {
    setEditingListId("new");
  }

  async function handleListSaved(list: ListObject) {
    setLists((prev) => {
      const exists = prev.some((l) => l.id === list.id);
      return exists ? prev.map((l) => (l.id === list.id ? list : l)) : [...prev, list];
    });
    // Saving a list runs/changes its query server-side, so re-read membership.
    try {
      setListMemberIds(parseMemberIds((await fetchAllListMemberIds()).member_ids));
    } catch {
      // Counts will catch up on the next load.
    }
    setSelectedListId(list.id);
    setEditingListId(null);
  }

  function handleListRefreshed(list: ListObject) {
    setLists((prev) => prev.map((l) => (l.id === list.id ? list : l)));
    fetchAllListMemberIds()
      .then((data) => setListMemberIds(parseMemberIds(data.member_ids)))
      .catch(() => {
        // Counts will catch up on the next load.
      });
  }

  // Stable identity so it doesn't defeat ContactList's memoization on every
  // keystroke in the search box.
  const handleSelectContact = useCallback((id: number) => {
    setEditingContactId(null);
    setCopySourceContact(null);
    setSelectedContactId(id);
  }, []);

  // Jumps from the birthdays calendar straight to a contact's detail view.
  const handleSelectContactFromBirthdays = useCallback(
    (id: number) => {
      setView("contacts");
      handleSelectContact(id);
    },
    [handleSelectContact]
  );

  function handleCopyContact(contact: Contact) {
    setCopySourceContact(contact);
    setEditingContactId("new");
  }

  async function handleBatchAddTags(newTags: string[]) {
    const response = await batchAddTags([...selectedIds], newTags);
    const updatedById = new Map(response.contacts.map((contact) => [contact.id, contact]));
    setContacts((prev) => prev.map((contact) => updatedById.get(contact.id) ?? contact));
    setTags(response.tags);
    setShowBatchTagModal(false);
    setSelectedIds(new Set());
    setSelectionMode(false);
  }

  function handleExportSelected() {
    const selected = contacts.filter((contact) => selectedIds.has(contact.id));
    const lines = selected.map((contact) => "  " + JSON.stringify(contact));
    const json = "[\n" + lines.join(",\n") + "\n]";
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "contacts.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <TopBar
        view={view}
        onSelectView={handleSelectView}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebarCollapsed={() => setSidebarCollapsed((prev) => !prev)}
        onNewContact={() => {
          setCopySourceContact(null);
          setEditingContactId("new");
        }}
        onNewList={handleNewList}
        selectionMode={selectionMode}
        onToggleSelectionMode={toggleSelectionMode}
        selectedCount={selectedIds.size}
        onSelectAllVisible={selectAllVisible}
        onClearSelection={() => setSelectedIds(new Set())}
        onAddTags={() => setShowBatchTagModal(true)}
        onExportSelected={handleExportSelected}
        syncing={syncing}
        syncDirection={syncDirection}
        onPull={() => handleStartSync("pull")}
        onPush={() => handleStartSync("push")}
        onOpenAdminConsole={() => setShowAdminConsole(true)}
      />

      {view === "contacts" ? (
        <Box sx={{ display: "flex", flexGrow: 1, overflow: "hidden" }}>
          {!sidebarCollapsed && (
            <ListsNav
              lists={lists}
              memberIds={listMemberIds}
              selectedListId={selectedListId}
              onSelectList={handleSelectList}
              totalContactCount={contacts.length}
              refreshing={listsRefreshing}
              onRefresh={handleRefreshLists}
            />
          )}
          {!sidebarCollapsed && (
            <Sidebar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              allContacts={scopedContacts}
              selectedFilters={selectedFilters}
              onToggleFilter={toggleFilter}
              onClearFilters={() => setSelectedFilters([])}
              listStatus={listStatus}
              loadError={loadError}
              contacts={visibleContacts}
              grouped={grouped}
              selectedContactId={selectedContactId}
              onSelectContact={handleSelectContact}
              lettersPresent={lettersPresent}
              onJumpToLetter={jumpToLetter}
              listRef={listRef}
              scrollContainerRef={scrollContainerRef}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleContactSelection}
              syncMessage={syncMessage}
              syncError={syncError}
              onDismissSyncStatus={() => {
                setSyncMessage(null);
                setSyncError(null);
              }}
            />
          )}

          <Box component="main" id="contact-detail" sx={{ flexGrow: 1, overflow: "auto", px: 4, pb: 4 }}>
            {editingContactId !== null ? (
              <ContactForm
                key={editingContactId}
                contact={editingContactId === "new" ? null : contacts.find((c) => c.id === editingContactId) ?? null}
                prefillFrom={editingContactId === "new" ? copySourceContact : null}
                allTags={tags}
                onCancel={() => {
                  setEditingContactId(null);
                  setCopySourceContact(null);
                }}
                onSaved={handleContactSaved}
              />
            ) : (
              <Box sx={{ pt: 4 }}>
                {selectedContact ? (
                  <ContactDetail
                    contact={selectedContact}
                    onEdit={() => setEditingContactId(selectedContact.id)}
                    onCopy={() => handleCopyContact(selectedContact)}
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
      ) : view === "birthdays" ? (
        <BirthdayView contacts={contacts} onSelectContact={handleSelectContactFromBirthdays} />
      ) : (
        <Box sx={{ display: "flex", flexGrow: 1, overflow: "hidden" }}>
          {!sidebarCollapsed && (
            <ListsPanel
              lists={lists}
              memberIds={listMemberIds}
              selectedListId={selectedListId}
              onSelectList={(listId) => {
                setSelectedListId(listId);
                setEditingListId(null);
              }}
              refreshing={listsRefreshing}
              onRefresh={handleRefreshLists}
            />
          )}

          <Box component="main" id="list-detail" sx={{ flexGrow: 1, overflow: "auto", px: 4, pb: 4 }}>
            {editingListId !== null ? (
              <ListForm
                key={editingListId}
                list={editingListId === "new" ? null : lists.find((l) => l.id === editingListId) ?? null}
                memberTypes={memberTypes}
                onCancel={() => setEditingListId(null)}
                onSaved={handleListSaved}
              />
            ) : (
              <Box sx={{ pt: 4 }}>
                {selectedList ? (
                  <ListDetail
                    list={selectedList}
                    memberCount={listMemberIds[selectedList.id]?.length ?? 0}
                    onEdit={() => setEditingListId(selectedList.id)}
                    onRefreshed={handleListRefreshed}
                  />
                ) : selectedListId !== null ? (
                  <Alert severity="error">List not found.</Alert>
                ) : (
                  <Typography color="text.secondary">Select a list to see its details.</Typography>
                )}
              </Box>
            )}
          </Box>
        </Box>
      )}

      {showBatchTagModal && (
        <BatchTagModal
          contactCount={selectedIds.size}
          allTags={tags}
          onCancel={() => setShowBatchTagModal(false)}
          onSubmit={handleBatchAddTags}
        />
      )}

      {syncChallenge && (
        <SyncVerificationModal
          challenge={syncChallenge}
          onCancel={handleSyncCancel}
          onSelectDevice={handleSyncSelectDevice}
          onSubmitCode={handleSyncSubmitCode}
        />
      )}

      {syncReview && syncDirection && (
        <SyncReviewModal
          review={syncReview}
          direction={syncDirection}
          onCancel={handleSyncReviewCancel}
          onApply={handleSyncReviewApply}
        />
      )}

      {showAdminConsole && <AdminConsoleModal onClose={() => setShowAdminConsole(false)} />}
    </Box>
  );
}
