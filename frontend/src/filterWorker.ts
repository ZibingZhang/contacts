/// <reference lib="webworker" />
import type { SchemaObject } from "./types";
import type { SavedObject } from "./schema-form/SchemaForm";
import type { FilterField, SelectedFilter } from "./filters";
import { buildFilterCatalog, matchesFilters } from "./filters";
import { rankAndSort } from "./search";
import { searchTextOf, sortKeyOf } from "./searchStrategies";

export type FilterWorkerRequest =
  | { type: "objects"; objects: SavedObject[]; schema: SchemaObject }
  | { type: "query"; requestId: number; query: string; filters: SelectedFilter[] };

export interface FilterWorkerResponse {
  requestId: number;
  ids: number[];
  // Echoes back the query these ids were computed for, so the main thread
  // can key its "are we grouped/sorted alphabetically" decision off the
  // query that actually produced this result instead of off whatever the
  // input holds *now* — which may already have moved on by the time this
  // response arrives, breaking the "same-letter objects are contiguous"
  // assumption the grouped list relies on.
  query: string;
}

let objects: SavedObject[] = [];
let fieldsById = new Map<string, FilterField>();
let textOf: (obj: SavedObject) => string = () => "";
let sortKey: (obj: SavedObject) => string = () => "";

self.onmessage = (event: MessageEvent<FilterWorkerRequest>) => {
  const message = event.data;
  if (message.type === "objects") {
    objects = message.objects;
    fieldsById = buildFilterCatalog(message.schema).fieldsById;
    textOf = searchTextOf(message.schema);
    sortKey = sortKeyOf(message.schema);
    return;
  }

  const matching = objects.filter((obj) => matchesFilters(obj, message.filters, fieldsById));
  const visible = rankAndSort(matching, message.query, textOf, sortKey);
  const response: FilterWorkerResponse = {
    requestId: message.requestId,
    ids: visible.map((obj) => obj.id),
    query: message.query,
  };
  self.postMessage(response);
};
