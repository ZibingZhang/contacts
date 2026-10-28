import type { Contact, EducationLevel } from "./types";
import { EDUCATION_LABELS } from "./format";

export interface FilterField {
  id: string;
  label: string;
  values: (contact: Contact) => string[];
}

function nonEmpty(values: (string | undefined)[]): string[] {
  return values.filter((value): value is string => Boolean(value));
}

const EDUCATION_FIELDS: FilterField[] = (Object.keys(EDUCATION_LABELS) as EducationLevel[]).map((level) => ({
  id: `education:${level}`,
  label: EDUCATION_LABELS[level],
  values: (contact) => nonEmpty([contact.education?.[level]?.name]),
}));

// The field catalogue for the filter dropdown: a top-level list of fields,
// each with its own way of pulling matchable values out of a contact.
export const FILTER_FIELDS: FilterField[] = [
  {
    id: "tag",
    label: "Tag",
    values: (contact) => contact.tags ?? [],
  },
  ...EDUCATION_FIELDS,
  {
    id: "city",
    label: "City",
    values: (contact) => nonEmpty((contact.street_addresses ?? []).map((address) => address.city)),
  },
  {
    id: "state",
    label: "State",
    values: (contact) => nonEmpty((contact.street_addresses ?? []).map((address) => address.state)),
  },
  {
    id: "country",
    label: "Country",
    values: (contact) => nonEmpty((contact.street_addresses ?? []).map((address) => address.country)),
  },
];

export const FILTER_FIELDS_BY_ID = new Map(FILTER_FIELDS.map((field) => [field.id, field]));

export interface SelectedFilter {
  field: string;
  value: string;
}

export interface FilterValueCount {
  value: string;
  count: number;
}

// Sentinel standing in for "this contact has no value for this field" so it
// can flow through the same {field, value} shape as every real value.
// Unlikely to collide with real contact data.
export const NONE_FILTER_VALUE = "__none__";

export function isNoneFilterValue(value: string): boolean {
  return value === NONE_FILTER_VALUE;
}

export function sameFilter(a: SelectedFilter, b: SelectedFilter): boolean {
  return a.field === b.field && a.value === b.value;
}

// Distinct values (with counts) a field takes across `contacts`, sorted by
// how common they are so the most useful filters surface first. Contacts
// with no value for the field are counted under NONE_FILTER_VALUE so "no
// value" can be filtered on like any other value.
export function countFilterValues(contacts: Contact[], field: FilterField): FilterValueCount[] {
  const counts = new Map<string, number>();
  let noneCount = 0;
  for (const contact of contacts) {
    const values = field.values(contact);
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
// `contacts`, so opening the dropdown's value picker for any field is just a
// map lookup instead of a fresh scan — callers should compute this once
// (e.g. in a `useMemo` keyed on `contacts`) rather than per field click.
export function countAllFilterValues(contacts: Contact[]): Map<string, FilterValueCount[]> {
  return new Map(FILTER_FIELDS.map((field) => [field.id, countFilterValues(contacts, field)]));
}

// A contact matches the filter facet if it has every selected {field,
// value} pair (AND across all selections, regardless of which field each
// one belongs to), or if nothing is selected at all.
export function contactMatchesFilters(contact: Contact, filters: SelectedFilter[]): boolean {
  if (filters.length === 0) {
    return true;
  }
  return filters.every(({ field, value }) => {
    const definition = FILTER_FIELDS_BY_ID.get(field);
    if (definition === undefined) {
      return false;
    }
    const values = definition.values(contact);
    return value === NONE_FILTER_VALUE ? values.length === 0 : values.includes(value);
  });
}
