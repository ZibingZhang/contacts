import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  fetchContacts,
  fetchTags,
  fetchLists,
  fetchAllListMemberIds,
  refreshLists,
  refreshList,
  fetchSchemas,
  fetchSchema,
  fetchObjects,
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
  SchemaField,
  SchemaObject,
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
import { TypeObjectList } from "./components/TypeObjectList";
import { TopBar } from "./components/TopBar";
import { BirthdayView } from "./components/BirthdayView";
import { SchemasView } from "./components/SchemasView";
import { BatchTagModal } from "./components/BatchTagModal";
import { SyncVerificationModal } from "./components/SyncVerificationModal";
import { SyncReviewModal, type SyncDirection } from "./components/SyncReviewModal";
import { AdminConsoleModal } from "./components/AdminConsoleModal";
import { SchemaDetail, type SchemaObjectData } from "./schema-form/SchemaDetail";
import { ListMembersSection } from "./schema-form/ListMembersSection";
import { SchemaForm, type SavedObject } from "./schema-form/SchemaForm";
import { NavigateToObjectContext } from "./schema-form/navigation";
import { buildDisplayName, initials } from "./format";
import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import SyncIcon from "@mui/icons-material/Sync";

function networkErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return `Could not reach the contacts API at ${apiBaseUrl()} — is \`python -m contacts serve\` running?`;
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = "contacts.sidebar.collapsed";

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
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isBirthdays = location.pathname === "/birthdays";
  const isSchemasView = location.pathname === "/schemas";
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

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [lists, setLists] = useState<ListObject[]>([]);
  // List id -> its member object ids, loaded alongside the lists themselves
  // since membership now lives in associations rather than on the list.
  const [listMemberIds, setListMemberIds] = useState<Record<number, number[]>>({});
  const [memberTypes, setMemberTypes] = useState<string[]>(["contact"]);
  const [listSchema, setListSchema] = useState<SchemaObject | null>(null);
  const [contactSchema, setContactSchema] = useState<SchemaObject | null>(null);
  const [listsRefreshing, setListsRefreshing] = useState(false);
  const [selectedListRefreshing, setSelectedListRefreshing] = useState(false);
  const [selectedListRefreshError, setSelectedListRefreshError] = useState<string | null>(null);
  const [editingListId, setEditingListId] = useState<number | "new" | null>(null);
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

  // Browsing state for any type that isn't "contact" or "list" -- the
  // generic type browser. Separate from `lists`' own state above (which
  // predates this and has list-specific needs layered on top, like
  // `listMemberIds`) rather than unifying the two, to avoid risking the
  // already-working list path while adding this.
  const isGenericType = !isBirthdays && !isSchemasView && typeName !== "contact" && typeName !== "list";
  const [genericSchema, setGenericSchema] = useState<SchemaObject | null>(null);
  const [genericObjects, setGenericObjects] = useState<SavedObject[]>([]);
  const [editingGenericId, setEditingGenericId] = useState<number | "new" | null>(null);

  // Hand-built Schemas page -- there's no schema-object named "schema" (see
  // SchemasView), so this can't go through the generic type browser above.
  const [schemas, setSchemas] = useState<SchemaObject[]>([]);
  const [editingSchemaName, setEditingSchemaName] = useState<string | "new" | null>(null);

  useEffect(() => {
    if (!isSchemasView) return;
    let cancelled = false;
    fetchSchemas()
      .then((data) => {
        if (!cancelled) setSchemas(data.schemas);
      })
      .catch(() => {
        if (!cancelled) setSchemas([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isSchemasView]);

  // A selection made while browsing one type shouldn't silently carry over
  // (and be exportable) after navigating to a different one.
  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, [typeName, isSchemasView]);

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
    setEditingGenericId(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!isGenericType) {
      setGenericSchema(null);
      setGenericObjects([]);
      return;
    }
    let cancelled = false;
    Promise.all([fetchSchema(typeName), fetchObjects<SavedObject>(typeName)])
      .then(([schemaData, objectsData]) => {
        if (cancelled) return;
        setGenericSchema(schemaData);
        setGenericObjects(objectsData.objects);
      })
      .catch(() => {
        if (cancelled) return;
        setGenericSchema(null);
        setGenericObjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isGenericType, typeName]);

  const listRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    let cancelled = false;
    fetchSchema("list")
      .then((schema) => {
        if (!cancelled) setListSchema(schema);
      })
      .catch(() => {
        // The lists view shows an error state while this is missing.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSchema("contact")
      .then((schema) => {
        if (!cancelled) setContactSchema(schema);
      })
      .catch(() => {
        // The contacts view shows an error state while this is missing.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  // react-router keeps the URL in sync with navigation automatically, and
  // re-renders with the new location on back/forward -- no manual
  // pushState/popstate bookkeeping needed (see main.tsx for why `App` is
  // still only ever one component instance across all of that).

  // The list that scopes the contacts sidebar -- the current "view" that
  // search/filters/the alpha index all then narrow further. A missing/
  // deleted list falls back to all contacts rather than showing an empty
  // list. Distinct from `selectedListId` (the Lists type-browser's own
  // selection) -- see where `scopingListId` is derived above.
  const selectedList = lists.find((list) => list.id === selectedListId) ?? null;
  const scopingList = lists.find((list) => list.id === scopingListId) ?? null;
  const scopedContacts = useMemo(() => {
    if (scopingList === null) {
      return contacts;
    }
    const idSet = new Set(listMemberIds[scopingList.id] ?? []);
    return contacts.filter((contact) => idSet.has(contact.id));
  }, [contacts, scopingList, listMemberIds]);

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
    handleSelectContact(nextContact.id);
    findListItem(nextContact.id)?.scrollIntoView({ block: "nearest" });
  }

  // Jumps the selection straight to the first or last contact in the
  // currently displayed list.
  function selectBoundaryContact(position: "first" | "last") {
    if (!visibleContacts.length) {
      return;
    }
    const contact = position === "first" ? visibleContacts[0] : visibleContacts[visibleContacts.length - 1];
    handleSelectContact(contact.id);
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
      } else if (
        (event.key === "c" || event.key === "C") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isTypingTarget(event.target) &&
        selectedContact
      ) {
        event.preventDefault();
        handleCopyContact(selectedContact);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visibleContacts, selectedContactId, editingContactId, selectedContact]);

  // Scoping the contacts sidebar to a list (like switching a mailbox
  // folder) resets the search/filter/selection state, rather than carrying
  // it over from whatever was previously scoped.
  function handleSelectList(listId: number | null) {
    const next = new URLSearchParams();
    if (listId !== null) next.set("list", String(listId));
    navigate({ pathname: "/types/contact", search: next.toString() });
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
    if (isSchemasView) return schemas as unknown as (Record<string, unknown> & { id: number })[];
    return genericObjects;
  }

  function selectAllVisible() {
    const ids = typeName === "contact" ? visibleContacts.map((contact) => contact.id) : selectableObjects().map((obj) => obj.id);
    setSelectedIds(new Set(ids));
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
    setEditingListId(null);
    navigate(`/types/list/${list.id}`);
  }

  function handleListRefreshed(list: ListObject) {
    setLists((prev) => prev.map((l) => (l.id === list.id ? list : l)));
    fetchAllListMemberIds()
      .then((data) => setListMemberIds(parseMemberIds(data.member_ids)))
      .catch(() => {
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

  // Stable identity so it doesn't defeat ContactList's memoization on every
  // keystroke in the search box. Preserves the current search/filter/list
  // scoping query params -- only the selected contact itself changes.
  const handleSelectContact = useCallback(
    (id: number) => {
      navigate({ pathname: `/types/contact/${id}`, search: location.search });
    },
    [navigate, location.search]
  );

  // Jumps from the birthdays calendar straight to a contact's detail view.
  const handleSelectContactFromBirthdays = useCallback(
    (id: number) => {
      navigate(`/types/contact/${id}`);
    },
    [navigate]
  );

  // How the generic renderer (reference fields, the Lists section, list
  // member rows) navigates to another object -- generic by construction,
  // since every type (including "list") is just `/types/<name>/<id>` now.
  const navigateToObject = useCallback(
    (objectType: string, id: number) => {
      navigate(`/types/${objectType}/${id}`);
    },
    [navigate]
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
    const selected = selectableObjects().filter((obj) => selectedIds.has(obj.id));
    const lines = selected.map((obj) => "  " + JSON.stringify(obj));
    const json = "[\n" + lines.join(",\n") + "\n]";
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${isSchemasView ? "schemas" : typeName ?? "objects"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <NavigateToObjectContext.Provider value={navigateToObject}>
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <TopBar
        typeName={isBirthdays || isSchemasView ? null : typeName}
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
        genericTypeLabel={isGenericType ? genericSchema?.label.singular : undefined}
        onNewGenericObject={isGenericType ? () => setEditingGenericId("new") : undefined}
        canSelect={!isBirthdays}
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
        isSchemasView={isSchemasView}
        onToggleSchemas={() => navigate(isSchemasView ? "/types/contact" : "/schemas")}
        onNewSchema={() => setEditingSchemaName("new")}
      />

      {isBirthdays ? (
        <BirthdayView contacts={contacts} onSelectContact={handleSelectContactFromBirthdays} />
      ) : isSchemasView ? (
        <SchemasView
          schemas={schemas}
          selectedName={editingSchemaName}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleObjectSelection}
          onSelect={setEditingSchemaName}
          onSaved={(saved) => {
            setSchemas((prev) => {
              const exists = prev.some((s) => s.name === saved.name);
              return exists ? prev.map((s) => (s.name === saved.name ? saved : s)) : [...prev, saved];
            });
            setEditingSchemaName(saved.name);
          }}
          onDeleted={(name) => {
            setSchemas((prev) => prev.filter((s) => s.name !== name));
            setEditingSchemaName(null);
          }}
          onCancel={() => setEditingSchemaName(null)}
        />
      ) : typeName === "contact" ? (
        <Box sx={{ display: "flex", flexGrow: 1, overflow: "hidden" }}>
          {!sidebarCollapsed && (
            <ListsNav
              lists={lists}
              memberIds={listMemberIds}
              selectedListId={scopingListId}
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
              onToggleSelect={toggleObjectSelection}
              syncMessage={syncMessage}
              syncError={syncError}
              onDismissSyncStatus={() => {
                setSyncMessage(null);
                setSyncError(null);
              }}
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
                  editingContactId === "new"
                    ? null
                    : (contacts.find((c) => c.id === editingContactId) as unknown as SavedObject | undefined) ?? null
                }
                initialDraft={editingContactId === "new" ? (copySourceContact as unknown as Record<string, unknown>) ?? undefined : undefined}
                onCancel={() => {
                  setEditingContactId(null);
                  setCopySourceContact(null);
                }}
                onSaved={(saved) => handleContactSaved(saved as unknown as Contact)}
              />
            ) : (
              <Box sx={{ pt: 4 }}>
                {selectedContact ? (
                  <SchemaDetail
                    key={selectedContact.id}
                    schema={contactSchema}
                    data={selectedContact as unknown as SchemaObjectData}
                    onEdit={() => setEditingContactId(selectedContact.id)}
                    renderHeader={() => renderContactHeader(selectedContact)}
                    extraActions={
                      <Button variant="outlined" size="small" onClick={() => handleCopyContact(selectedContact)}>
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
      ) : typeName === "list" ? (
        <Box sx={{ display: "flex", flexGrow: 1, overflow: "hidden" }}>
          {!sidebarCollapsed && listSchema && (
            <TypeObjectList
              schema={listSchema}
              objects={lists as unknown as (Record<string, unknown> & { id: number })[]}
              selectedId={selectedListId}
              onSelect={(id) => navigate(`/types/list/${id}`)}
              onSelectAll={() => navigate("/types/list")}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleObjectSelection}
              subtitleFor={(obj) => `${listMemberIds[obj.id]?.length ?? 0} member${listMemberIds[obj.id]?.length === 1 ? "" : "s"}`}
              headerAction={
                <Tooltip title="Re-run each list's query to refresh its membership">
                  <span>
                    <IconButton size="small" aria-label="Refresh lists" onClick={handleRefreshLists} disabled={listsRefreshing}>
                      {listsRefreshing ? <CircularProgress size={18} /> : <SyncIcon fontSize="small" />}
                    </IconButton>
                  </span>
                </Tooltip>
              }
            />
          )}

          <Box component="main" id="list-detail" sx={{ flexGrow: 1, overflow: "auto", px: 4, pb: 4 }}>
            {!listSchema ? (
              <Alert severity="error" sx={{ mt: 4 }}>
                Could not load the list schema.
              </Alert>
            ) : editingListId !== null ? (
              <SchemaForm
                key={editingListId}
                schema={listSchema}
                value={editingListId === "new" ? null : (lists.find((l) => l.id === editingListId) as SavedObject | undefined) ?? null}
                overlayFields={overlayListFields}
                onCancel={() => setEditingListId(null)}
                onSaved={(saved) => handleListSaved(saved as unknown as ListObject)}
              />
            ) : (
              <Box sx={{ pt: 4 }}>
                {selectedList ? (
                  <SchemaDetail
                    key={selectedList.id}
                    schema={listSchema}
                    data={selectedList as unknown as SchemaObjectData}
                    onEdit={() => setEditingListId(selectedList.id)}
                    extraSections={<ListMembersSection list={selectedList} />}
                    extraActions={
                      selectedList.query ? (
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleRefreshSelectedList(selectedList.id)}
                          disabled={selectedListRefreshing}
                        >
                          {selectedListRefreshing ? "Refreshing…" : "Refresh"}
                        </Button>
                      ) : undefined
                    }
                  />
                ) : selectedListId !== null ? (
                  <Alert severity="error">List not found.</Alert>
                ) : (
                  <Typography color="text.secondary">Select a list to see its details.</Typography>
                )}
                {selectedListRefreshError && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {selectedListRefreshError}
                  </Alert>
                )}
              </Box>
            )}
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexGrow: 1, overflow: "hidden" }}>
          {!sidebarCollapsed && genericSchema && (
            <TypeObjectList
              schema={genericSchema}
              objects={genericObjects}
              selectedId={routeId}
              onSelect={(id) => navigate(`/types/${typeName}/${id}`)}
              onSelectAll={() => navigate(`/types/${typeName}`)}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleObjectSelection}
              subtitleFor={
                typeName === "association"
                  ? (obj) => `${obj.object_type_1} #${obj.object_id_1} ↔ ${obj.object_type_2} #${obj.object_id_2}`
                  : undefined
              }
            />
          )}

          <Box component="main" sx={{ flexGrow: 1, overflow: "auto", px: 4, pb: 4 }}>
            {!genericSchema ? (
              <Alert severity="error" sx={{ mt: 4 }}>
                Unknown object type "{typeName}".
              </Alert>
            ) : editingGenericId !== null ? (
              <SchemaForm
                key={editingGenericId}
                schema={genericSchema}
                value={editingGenericId === "new" ? null : genericObjects.find((o) => o.id === editingGenericId) ?? null}
                onCancel={() => setEditingGenericId(null)}
                onSaved={(saved) => {
                  setGenericObjects((prev) => {
                    const exists = prev.some((o) => o.id === saved.id);
                    return exists ? prev.map((o) => (o.id === saved.id ? saved : o)) : [...prev, saved];
                  });
                  setEditingGenericId(null);
                  navigate(`/types/${typeName}/${saved.id}`);
                }}
              />
            ) : (
              <Box sx={{ pt: 4 }}>
                {(() => {
                  const selectedGenericObject = genericObjects.find((o) => o.id === routeId) ?? null;
                  return selectedGenericObject ? (
                    <SchemaDetail
                      key={selectedGenericObject.id}
                      schema={genericSchema}
                      data={selectedGenericObject as unknown as SchemaObjectData}
                      onEdit={() => setEditingGenericId(selectedGenericObject.id)}
                    />
                  ) : routeId !== null ? (
                    <Alert severity="error">Not found.</Alert>
                  ) : (
                    <Typography color="text.secondary">
                      Select a {genericSchema.label.singular.toLowerCase()} to see its details.
                    </Typography>
                  );
                })()}
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
    </NavigateToObjectContext.Provider>
  );
}
