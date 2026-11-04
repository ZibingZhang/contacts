import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  fetchContacts,
  fetchTags,
  fetchLists,
  fetchAllListMemberIds,
  refreshLists,
  fetchSchemas,
  fetchSchema,
} from "./api";
import type { Contact, ListObject, SchemaObject, TagCount } from "./types";
import { SCHEMA_META_SCHEMA } from "./schemaMeta";
import { networkErrorMessage } from "./networkError";

export type ListStatus = "loading" | "error" | "ready";

/** JSON object keys are strings, so turn them back into list ids. */
function parseMemberIds(raw: Record<string, number[]>): Record<number, number[]> {
  const parsed: Record<number, number[]> = {};
  for (const [listId, ids] of Object.entries(raw)) {
    parsed[Number(listId)] = ids;
  }
  return parsed;
}

export interface AppData {
  contacts: Contact[];
  setContacts: Dispatch<SetStateAction<Contact[]>>;
  tags: TagCount[];
  setTags: Dispatch<SetStateAction<TagCount[]>>;
  lists: ListObject[];
  setLists: Dispatch<SetStateAction<ListObject[]>>;
  // List id -> its member object ids, loaded alongside the lists themselves
  // since membership now lives in associations rather than on the list.
  listMemberIds: Record<number, number[]>;
  refetchListMemberIds: () => Promise<void>;
  // The member-type picker on the list form needs the available types.
  // "schema" is injected synthetically (see schemaMeta.ts) since the backend
  // never returns a schema-object literally named "schema".
  memberTypes: string[];
  listSchema: SchemaObject | null;
  contactSchema: SchemaObject | null;
  listStatus: ListStatus;
  loadError: string | null;
  listsRefreshing: boolean;
  handleRefreshLists: () => Promise<void>;
}

// All the app-wide data every view (contacts, lists, schemas, generic
// types) reads from: the initial contacts/tags/lists/schemas fetches plus
// the handful of refresh paths that mutate them afterward. Kept separate
// from the sync flow, the generic-type browser, and the schema-object
// browser below -- each of those has its own fetch/cache lifecycle layered
// on top of this base data rather than folded into it.
export function useAppData(): AppData {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [lists, setLists] = useState<ListObject[]>([]);
  const [listMemberIds, setListMemberIds] = useState<Record<number, number[]>>({});
  const [memberTypes, setMemberTypes] = useState<string[]>(["contact"]);
  const [listSchema, setListSchema] = useState<SchemaObject | null>(null);
  const [contactSchema, setContactSchema] = useState<SchemaObject | null>(null);
  const [listStatus, setListStatus] = useState<ListStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [listsRefreshing, setListsRefreshing] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  useEffect(() => {
    let cancelled = false;
    fetchSchemas()
      .then((data) => {
        if (cancelled) return;
        setMemberTypes(
          data.schemas
            .map((schema) => schema.name)
            .filter((name) => name !== "association")
            .concat(SCHEMA_META_SCHEMA.name)
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

  async function refetchListMemberIds() {
    setListMemberIds(parseMemberIds((await fetchAllListMemberIds()).member_ids));
  }

  async function handleRefreshLists() {
    setListsRefreshing(true);
    try {
      const data = await refreshLists();
      setLists(data.objects);
      // Refreshing re-runs each query, so membership has to be re-read.
      await refetchListMemberIds();
    } catch {
      // Keep the existing lists if the refresh fails.
    } finally {
      setListsRefreshing(false);
    }
  }

  return {
    contacts,
    setContacts,
    tags,
    setTags,
    lists,
    setLists,
    listMemberIds,
    refetchListMemberIds,
    memberTypes,
    listSchema,
    contactSchema,
    listStatus,
    loadError,
    listsRefreshing,
    handleRefreshLists,
  };
}
