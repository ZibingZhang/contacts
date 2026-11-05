/// <reference lib="webworker" />
import type { Contact, SchemaObject } from "./types";
import type { FilterField, SelectedFilter } from "./filters";
import { buildFilterCatalog, matchesFilters } from "./filters";
import { filterContacts } from "./search";

export type FilterWorkerRequest =
  | { type: "contacts"; contacts: Contact[]; schema: SchemaObject }
  | { type: "query"; requestId: number; query: string; filters: SelectedFilter[] };

export interface FilterWorkerResponse {
  requestId: number;
  ids: number[];
  // Echoes back the query these ids were computed for, so the main thread
  // can key its "are we grouped/sorted alphabetically" decision off the
  // query that actually produced this result instead of off whatever the
  // input holds *now* — which may already have moved on by the time this
  // response arrives, breaking the "same-letter contacts are contiguous"
  // assumption the grouped contact list relies on.
  query: string;
}

let contacts: Contact[] = [];
let fieldsById = new Map<string, FilterField>();

self.onmessage = (event: MessageEvent<FilterWorkerRequest>) => {
  const message = event.data;
  if (message.type === "contacts") {
    contacts = message.contacts;
    fieldsById = buildFilterCatalog(message.schema).fieldsById;
    return;
  }

  const matchingFilters = contacts.filter((contact) => matchesFilters(contact, message.filters, fieldsById));
  const visible = filterContacts(matchingFilters, message.query);
  const response: FilterWorkerResponse = {
    requestId: message.requestId,
    ids: visible.map((contact) => contact.id),
    query: message.query,
  };
  self.postMessage(response);
};
