import type { SchemaObject } from "./types";
import { extractValues, filterableFields, type FilterableField } from "./filtering";

export interface FilterField {
  id: string;
  label: string;
  values: (obj: unknown) => string[];
  // Excluded from the dropdown's top-level "search reaches into group
  // fields" listing — shown only as the group's dedicated None row, so it
  // doesn't appear as a duplicate, indistinguishable "None" entry alongside
  // the other groups' None rows.
  hidden?: boolean;
}

function toFilterField(field: FilterableField): FilterField {
  return { id: field.id, label: field.label, values: (obj) => extractValues(obj, field) };
}

// A group-wide "None" field: matches objects that have no value in any of
// the group's fields (e.g. no education entries at all, rather than just no
// bachelor's degree). Reuses the existing NONE_FILTER_VALUE sentinel — the
// field reports ["Yes"] once any member field has a value, so selecting
// NONE_FILTER_VALUE on it falls through to "no member field had a value".
function groupNoneField(groupId: string, fields: FilterField[]): FilterField {
  return {
    id: `${groupId}:none`,
    label: "None",
    values: (obj) => (fields.some((field) => field.values(obj).length > 0) ? ["Yes"] : []),
    hidden: true,
  };
}

export interface FilterFieldGroup {
  id: string;
  label: string;
  fields: FilterField[];
  // Directly-toggleable "has none of this group's fields" filter, shown as
  // a top sub-option above the group's fields rather than a field you drill
  // into.
  noneField: FilterField;
}

export type FilterMenuEntry = FilterField | FilterFieldGroup;

export function isFilterFieldGroup(entry: FilterMenuEntry): entry is FilterFieldGroup {
  return "fields" in entry;
}

export interface FilterCatalog {
  fields: FilterField[];
  fieldsById: Map<string, FilterField>;
  menu: FilterMenuEntry[];
}

// Builds the filter catalogue from a schema: every field/path `filtering.ts`
// discovers becomes a selectable entry, with fields sharing a common
// top-level ancestor (e.g. education's six degree levels, social profiles'
// four platforms) grouped under it exactly like a hand-curated dropdown
// would, but derived from the schema instead of hand-authored per field —
// so it stays correct as the schema gains or loses fields.
export function buildFilterCatalog(schema: SchemaObject): FilterCatalog {
  const discovered = filterableFields(schema.fields);

  // A field with descendants (e.g. "name", which also has "name.first_name",
  // "name.last_name", ...) becomes a group -- its own top-level entry folds
  // into that group as a member instead of *also* standing alone in the
  // top-level menu under the same label, which would otherwise show "Name"
  // twice: once to drill in, once as a confusingly-identical standalone row.
  const topLevelFields = discovered.filter((field) => field.path.length === 1);
  const hasDescendants = new Set(
    discovered.filter((field) => field.path.length > 1).map((field) => field.path[0])
  );

  const standalone = topLevelFields.filter((field) => !hasDescendants.has(field.path[0]));
  const byTopKey = new Map<string, FilterableField[]>();
  for (const field of discovered) {
    if (field.path.length === 1 && !hasDescendants.has(field.path[0])) continue;
    const topKey = field.path[0];
    const group = byTopKey.get(topKey) ?? [];
    group.push(field);
    byTopKey.set(topKey, group);
  }

  const fields: FilterField[] = standalone.map(toFilterField);
  const menu: FilterMenuEntry[] = [...fields];

  for (const [topKey, groupMembers] of byTopKey) {
    const memberFields = groupMembers.map(toFilterField);
    const noneField = groupNoneField(`group:${topKey}`, memberFields);
    fields.push(...memberFields, noneField);
    menu.push({
      id: `group:${topKey}`,
      label: groupMembers[0].label.split(" › ")[0],
      fields: memberFields,
      noneField,
    });
  }

  return { fields, fieldsById: new Map(fields.map((field) => [field.id, field])), menu };
}

export interface SelectedFilter {
  field: string;
  value: string;
}

export interface FilterValueCount {
  value: string;
  count: number;
}

// Sentinel standing in for "this object has no value for this field" so it
// can flow through the same {field, value} shape as every real value.
// Unlikely to collide with real data.
export const NONE_FILTER_VALUE = "__none__";

export function isNoneFilterValue(value: string): boolean {
  return value === NONE_FILTER_VALUE;
}

export function sameFilter(a: SelectedFilter, b: SelectedFilter): boolean {
  return a.field === b.field && a.value === b.value;
}

// Distinct values (with counts) a field takes across `objects`, sorted by
// how common they are so the most useful filters surface first. Objects
// with no value for the field are counted under NONE_FILTER_VALUE so "no
// value" can be filtered on like any other value.
export function countFilterValues(objects: unknown[], field: FilterField): FilterValueCount[] {
  const counts = new Map<string, number>();
  let noneCount = 0;
  for (const obj of objects) {
    const values = field.values(obj);
    if (values.length === 0) {
      noneCount++;
      continue;
    }
    for (const value of values) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  const result = Array.from(counts.entries()).map(([value, count]) => ({ value, count }));
  if (noneCount > 0) {
    result.push({ value: NONE_FILTER_VALUE, count: noneCount });
  }
  return result.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

// Precomputes `countFilterValues` for every field in one pass over
// `objects`, so opening the dropdown's value picker for any field is just a
// map lookup instead of a fresh scan — callers should compute this once
// (e.g. in a `useMemo` keyed on `objects`) rather than per field click.
export function countAllFilterValues(objects: unknown[], fields: FilterField[]): Map<string, FilterValueCount[]> {
  return new Map(fields.map((field) => [field.id, countFilterValues(objects, field)]));
}

// An object matches the filter facet if it has every selected {field,
// value} pair (AND across all selections, regardless of which field each
// one belongs to), or if nothing is selected at all.
export function matchesFilters(obj: unknown, filters: SelectedFilter[], fieldsById: Map<string, FilterField>): boolean {
  if (filters.length === 0) {
    return true;
  }
  return filters.every(({ field, value }) => {
    const definition = fieldsById.get(field);
    if (definition === undefined) {
      return false;
    }
    const values = definition.values(obj);
    return value === NONE_FILTER_VALUE ? values.length === 0 : values.includes(value);
  });
}
