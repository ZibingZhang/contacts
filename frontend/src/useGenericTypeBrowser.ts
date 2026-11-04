import { useEffect, useState } from "react";
import { fetchSchema, fetchObjects } from "./api";
import type { SchemaObject } from "./types";
import type { SavedObject } from "./schema-form/SchemaForm";

const EMPTY_GENERIC_OBJECTS: SavedObject[] = [];

export interface GenericTypeBrowser {
  genericSchema: SchemaObject | null;
  genericObjects: SavedObject[];
  // Whether the data for the type being browsed right now is in cache.
  genericReady: boolean;
  genericLoading: boolean;
  editingGenericId: number | "new" | null;
  setEditingGenericId: (id: number | "new" | null) => void;
  saveGenericObject: (saved: SavedObject) => void;
}

// Browsing state for any type that isn't "contact", "list", or "schema" --
// the generic type browser. Separate from the list-specific state in
// useAppData (which predates this and has needs layered on top, like
// listMemberIds) rather than unifying the two, to avoid risking the
// already-working list path while adding this.
export function useGenericTypeBrowser(typeName: string, isGenericType: boolean): GenericTypeBrowser {
  // Keyed by type name so switching back to a type already browsed this
  // session (e.g. Contact -> Association -> Contact -> Association) renders
  // instantly from cache instead of flashing an empty sidebar through a cold
  // refetch every time -- the effect below still refreshes it in the
  // background, it just doesn't block the render on it.
  const [genericCache, setGenericCache] = useState<Record<string, { schema: SchemaObject; objects: SavedObject[] }>>({});
  const [genericFailedTypes, setGenericFailedTypes] = useState<Set<string>>(new Set());
  const [editingGenericId, setEditingGenericId] = useState<number | "new" | null>(null);

  // A selection made while browsing one type shouldn't silently carry over
  // (and be exportable) after navigating to a different one -- handled by
  // the caller's own typeName-keyed reset effect for selectionMode, but
  // editingGenericId is this hook's own state so it resets here too.
  useEffect(() => {
    setEditingGenericId(null);
  }, [typeName]);

  useEffect(() => {
    if (!isGenericType) return;
    let cancelled = false;
    // Always refetch on visiting a type -- even one already cached -- so the
    // cache stays current, but never clear it first: a cached entry keeps
    // rendering (via genericSchema/genericObjects below) the whole time
    // this is in flight, so there's nothing to flash.
    Promise.all([fetchSchema(typeName), fetchObjects<SavedObject>(typeName)])
      .then(([schemaData, objectsData]) => {
        if (cancelled) return;
        setGenericCache((prev) => ({ ...prev, [typeName]: { schema: schemaData, objects: objectsData.objects } }));
        setGenericFailedTypes((prev) => {
          if (!prev.has(typeName)) return prev;
          const next = new Set(prev);
          next.delete(typeName);
          return next;
        });
      })
      .catch(() => {
        if (cancelled) return;
        // Only surfaces as an error if this type was never cached -- a
        // background refresh failing shouldn't blow away data already on
        // screen.
        setGenericFailedTypes((prev) => (prev.has(typeName) ? prev : new Set(prev).add(typeName)));
      });
    return () => {
      cancelled = true;
    };
  }, [isGenericType, typeName]);

  const cachedGenericData = genericCache[typeName] ?? null;
  const genericSchema = isGenericType ? cachedGenericData?.schema ?? null : null;
  // Stable empty-array reference (rather than a fresh `[]` literal every
  // render) so memos keyed on genericObjects don't recompute every render
  // while nothing's cached yet.
  const genericObjects = (isGenericType ? cachedGenericData?.objects : undefined) ?? EMPTY_GENERIC_OBJECTS;
  const genericReady = isGenericType && cachedGenericData !== null;
  // Derived straight from the route vs. cache, not from a `loading` flag the
  // fetch effect sets one render later -- otherwise there's a tick right
  // after navigating where neither this nor genericReady is true, and the
  // "Unknown object type" error flashes before the spinner does.
  const genericLoading = isGenericType && !genericReady && !genericFailedTypes.has(typeName);

  function saveGenericObject(saved: SavedObject) {
    setGenericCache((prev) => {
      const existing = prev[typeName];
      if (!existing) return prev;
      const exists = existing.objects.some((o) => o.id === saved.id);
      const objects = exists ? existing.objects.map((o) => (o.id === saved.id ? saved : o)) : [...existing.objects, saved];
      return { ...prev, [typeName]: { ...existing, objects } };
    });
  }

  return {
    genericSchema,
    genericObjects,
    genericReady,
    genericLoading,
    editingGenericId,
    setEditingGenericId,
    saveGenericObject,
  };
}
