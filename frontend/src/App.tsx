import { useEffect, useMemo, useRef, useState } from "react";
import { fetchContacts, fetchTags, batchAddTags, apiBaseUrl, ApiError } from "./api";
import type { Contact, TagCount } from "./types";
import { filterContacts, contactMatchesTags, contactLetter } from "./search";
import { Sidebar, type ListStatus } from "./components/Sidebar";
import { ContactDetail } from "./components/ContactDetail";
import { BatchTagModal } from "./components/BatchTagModal";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";

function networkErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return `Could not reach the contacts API at ${apiBaseUrl()} — is \`python -m contacts serve\` running?`;
}

function paramsFromLocation(): { query: string; tags: Set<string> } {
  const params = new URLSearchParams(window.location.search);
  return {
    query: params.get("q") ?? "",
    tags: new Set(params.getAll("tag")),
  };
}

export function App() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(() => paramsFromLocation().tags);
  const [searchQuery, setSearchQuery] = useState(() => paramsFromLocation().query);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [listStatus, setListStatus] = useState<ListStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBatchTagModal, setShowBatchTagModal] = useState(false);

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
    params.delete("tag");
    for (const tag of selectedTags) {
      params.append("tag", tag);
    }
    const queryString = params.toString();
    const newUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", newUrl);
  }, [searchQuery, selectedTags]);

  const tagFilteredContacts = useMemo(
    () => contacts.filter((contact) => contactMatchesTags(contact, selectedTags)),
    [contacts, selectedTags]
  );
  const visibleContacts = useMemo(
    () => filterContacts(tagFilteredContacts, searchQuery),
    [tagFilteredContacts, searchQuery]
  );

  // Letter sections and the alphabet index only make sense when contacts are
  // in alphabetical order; an active search re-ranks by relevance instead.
  const grouped = !searchQuery.trim();
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
  function jumpToLetter(letter: string) {
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
  }

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

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }

  function toggleSelectionMode() {
    setSelectionMode((prev) => {
      if (prev) {
        setSelectedIds(new Set());
      }
      return !prev;
    });
  }

  function toggleContactSelection(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds(new Set(visibleContacts.map((contact) => contact.id)));
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
        tags={tags}
        selectedTags={selectedTags}
        onToggleTag={toggleTag}
        onClearTags={() => setSelectedTags(new Set())}
        listStatus={listStatus}
        loadError={loadError}
        contacts={visibleContacts}
        grouped={grouped}
        selectedContactId={selectedContactId}
        onSelectContact={setSelectedContactId}
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
      />

      <Box component="main" id="contact-detail" sx={{ flexGrow: 1, overflow: "auto", p: 4 }}>
        {selectedContact ? (
          <ContactDetail contact={selectedContact} />
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
    </Box>
  );
}
