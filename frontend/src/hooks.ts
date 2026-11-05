import { useEffect, useRef, useState } from "react";
import type { Contact, SchemaObject } from "./types";
import type { SelectedFilter } from "./filters";
import type { FilterWorkerRequest, FilterWorkerResponse } from "./filterWorker";
import { compareByName } from "./search";

// True when a keyboard event's target is already a place the user types
// into, so single-key shortcuts know to stay out of its way.
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

// Mirrors `value`, but only after it's gone `delayMs` without changing again —
// lets a fast typist's keystrokes land without each one kicking off a filter
// pass immediately.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export interface FilteredContacts {
  ids: number[];
  // The query these ids were actually filtered/sorted against. Since the
  // worker replies asynchronously, this can momentarily lag behind the
  // `query` argument passed in on a fresh call — callers that decide
  // whether the list is alphabetically grouped should branch on *this*,
  // not on their own query state, so that decision never gets ahead of the
  // ids it's describing.
  query: string;
}

// Runs the (potentially expensive, over thousands of contacts) search/filter
// pass in a Web Worker so it never blocks the main thread or input
// responsiveness. Falls back to the unfiltered id list (tagged with
// whatever query was requested) until the worker's first response lands,
// to avoid a one-frame empty flash. While there's no query, that fallback
// is still alphabetized (matching what the worker would itself return for
// an empty query) rather than left in raw/insertion order -- callers that
// group by letter rely on the "same-letter contacts are contiguous"
// assumption documented on `FilteredContacts.query` below, and an
// unsorted fallback briefly violates it every time `contacts` first
// populates, which previously just logged a duplicate-key warning but
// now corrupts the virtualized contact list's cached row offsets.
export function useFilteredContactIds(
  contacts: Contact[],
  query: string,
  filters: SelectedFilter[],
  schema: SchemaObject | null
): FilteredContacts {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const [result, setResult] = useState<FilteredContacts | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("./filterWorker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<FilterWorkerResponse>) => {
      if (event.data.requestId === requestIdRef.current) {
        setResult({ ids: event.data.ids, query: event.data.query });
      }
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!schema) return;
    const message: FilterWorkerRequest = { type: "contacts", contacts, schema };
    workerRef.current?.postMessage(message);
  }, [contacts, schema]);

  useEffect(() => {
    if (!schema) return;
    requestIdRef.current += 1;
    const message: FilterWorkerRequest = { type: "query", requestId: requestIdRef.current, query, filters };
    workerRef.current?.postMessage(message);
  }, [contacts, query, filters, schema]);

  const fallbackContacts = query.trim() ? contacts : [...contacts].sort(compareByName);
  return result ?? { ids: fallbackContacts.map((contact) => contact.id), query };
}
