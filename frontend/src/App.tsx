import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchContacts,
  fetchTags,
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
import type { Contact, TagCount, SyncRequiresVerification, SyncReview, SyncResult } from "./types";
import { contactLetter } from "./search";
import { sameFilter, type SelectedFilter } from "./filters";
import { useDebouncedValue, useFilteredContactIds } from "./hooks";
import { Sidebar, type ListStatus } from "./components/Sidebar";
import { ContactDetail } from "./components/ContactDetail";
import { BatchTagModal } from "./components/BatchTagModal";
import { ContactForm } from "./components/ContactForm";
import { SyncVerificationModal } from "./components/SyncVerificationModal";
import { SyncReviewModal, type SyncDirection } from "./components/SyncReviewModal";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";

function networkErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return `Could not reach the contacts API at ${apiBaseUrl()} — is \`python -m contacts serve\` running?`;
}

function paramsFromLocation(): { query: string; filters: SelectedFilter[] } {
  const params = new URLSearchParams(window.location.search);
  const filters: SelectedFilter[] = [];
  for (const raw of params.getAll("filter")) {
    const separatorIndex = raw.indexOf("=");
    if (separatorIndex === -1) continue;
    filters.push({ field: raw.slice(0, separatorIndex), value: raw.slice(separatorIndex + 1) });
  }
  return {
    query: params.get("q") ?? "",
    filters,
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
  const [selectedFilters, setSelectedFilters] = useState<SelectedFilter[]>(() => paramsFromLocation().filters);
  const [searchQuery, setSearchQuery] = useState(() => paramsFromLocation().query);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
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

  const listRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setListStatus("loading");
    fetchContacts()
      .then((data) => {
        if (cancelled) return;
        setContacts(data.contacts);
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
    const queryString = params.toString();
    const newUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", newUrl);
  }, [searchQuery, selectedFilters]);

  // Debounced so fast typing doesn't kick off a filter pass per keystroke;
  // the actual filtering then runs in a Web Worker, off the main thread.
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 100);
  const { ids: visibleContactIds, query: appliedSearchQuery } = useFilteredContactIds(
    contacts,
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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const jumpToBoundary = event.metaKey || event.ctrlKey;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        jumpToBoundary ? selectBoundaryContact("last") : moveSelection(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        jumpToBoundary ? selectBoundaryContact("first") : moveSelection(-1);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visibleContacts, selectedContactId]);

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
    setContacts(contactsData.contacts);
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

  // Stable identity so it doesn't defeat ContactList's memoization on every
  // keystroke in the search box.
  const handleSelectContact = useCallback((id: number) => {
    setEditingContactId(null);
    setCopySourceContact(null);
    setSelectedContactId(id);
  }, []);

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

  return (
    <Box sx={{ display: "flex", height: "100vh" }}>
      <Sidebar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        allContacts={contacts}
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
        onToggleSelectionMode={toggleSelectionMode}
        selectedIds={selectedIds}
        onToggleSelect={toggleContactSelection}
        onSelectAllVisible={selectAllVisible}
        onClearSelection={() => setSelectedIds(new Set())}
        onAddTags={() => setShowBatchTagModal(true)}
        onNewContact={() => {
          setCopySourceContact(null);
          setEditingContactId("new");
        }}
        syncing={syncing}
        syncDirection={syncDirection}
        syncMessage={syncMessage}
        syncError={syncError}
        onPull={() => handleStartSync("pull")}
        onPush={() => handleStartSync("push")}
        onDismissSyncStatus={() => {
          setSyncMessage(null);
          setSyncError(null);
        }}
      />

      <Box component="main" id="contact-detail" sx={{ flexGrow: 1, overflow: "auto", p: 4 }}>
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
        ) : selectedContact ? (
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
    </Box>
  );
}
