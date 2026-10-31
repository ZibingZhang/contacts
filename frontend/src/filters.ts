import type { Contact, EducationLevel } from "./types";
import { EDUCATION_LABELS } from "./format";

export interface FilterField {
  id: string;
  label: string;
  values: (contact: Contact) => string[];
  // Excluded from the dropdown's top-level "search reaches into group
  // fields" listing — shown only as the group's dedicated None row, so it
  // doesn't appear as a duplicate, indistinguishable "None" entry alongside
  // the other groups' None rows.
  hidden?: boolean;
}

function nonEmpty(values: (string | undefined)[]): string[] {
  return values.filter((value): value is string => Boolean(value));
}

const EDUCATION_FIELDS: FilterField[] = (Object.keys(EDUCATION_LABELS) as EducationLevel[]).map((level) => ({
  id: `education:${level}`,
  label: EDUCATION_LABELS[level],
  values: (contact) => nonEmpty([contact.education?.[level]?.name]),
}));

// One existence filter per platform: "Yes" if the contact has that profile,
// otherwise no value (so the NONE sentinel reads as "doesn't exist") — not
// the usernames themselves, since those are mostly unique and not a useful
// grouping.
const SOCIAL_PROFILE_FIELDS: { id: string; label: string; has: (contact: Contact) => boolean }[] = [
  { id: "social:facebook", label: "Facebook", has: (contact) => Boolean(contact.social_profiles?.facebook) },
  { id: "social:game_center", label: "Game Center", has: (contact) => Boolean(contact.social_profiles?.game_center) },
  { id: "social:instagram", label: "Instagram", has: (contact) => Boolean(contact.social_profiles?.instagram) },
  { id: "social:linkedin", label: "LinkedIn", has: (contact) => Boolean(contact.social_profiles?.linkedin) },
];

const SOCIAL_FIELDS: FilterField[] = SOCIAL_PROFILE_FIELDS.map(({ id, label, has }) => ({
  id,
  label,
  values: (contact) => (has(contact) ? ["Yes"] : []),
}));

const TAG_FIELD: FilterField = {
  id: "tag",
  label: "Tag",
  values: (contact) => contact.tags ?? [],
};

const CITY_FIELD: FilterField = {
  id: "city",
  label: "City",
  values: (contact) => nonEmpty((contact.street_addresses ?? []).map((address) => address.city)),
};

const STATE_FIELD: FilterField = {
  id: "state",
  label: "State",
  values: (contact) => nonEmpty((contact.street_addresses ?? []).map((address) => address.state)),
};

const COUNTRY_FIELD: FilterField = {
  id: "country",
  label: "Country",
  values: (contact) => nonEmpty((contact.street_addresses ?? []).map((address) => address.country)),
};

const ADDRESS_FIELDS: FilterField[] = [CITY_FIELD, STATE_FIELD, COUNTRY_FIELD];

// A group-wide "None" field: matches contacts that have no value in any of
// the group's fields (e.g. no education entries at all, rather than just no
// bachelor's degree). Reuses the existing NONE_FILTER_VALUE sentinel — the
// field reports ["Yes"] once any member field has a value, so selecting
// NONE_FILTER_VALUE on it falls through to "no member field had a value".
function groupNoneField(groupId: string, fields: FilterField[]): FilterField {
  return {
    id: `${groupId}:none`,
    label: "None",
    values: (contact) => (fields.some((field) => field.values(contact).length > 0) ? ["Yes"] : []),
    hidden: true,
  };
}

const EDUCATION_NONE_FIELD = groupNoneField("group:education", EDUCATION_FIELDS);
const SOCIAL_NONE_FIELD = groupNoneField("group:social", SOCIAL_FIELDS);
const ADDRESS_NONE_FIELD = groupNoneField("group:address", ADDRESS_FIELDS);

// The flat field catalogue backing filter matching and value counting — every
// leaf field, regardless of how the dropdown groups it for display.
export const FILTER_FIELDS: FilterField[] = [
  TAG_FIELD,
  ...EDUCATION_FIELDS,
  EDUCATION_NONE_FIELD,
  ...SOCIAL_FIELDS,
  SOCIAL_NONE_FIELD,
  CITY_FIELD,
  STATE_FIELD,
  COUNTRY_FIELD,
  ADDRESS_NONE_FIELD,
];

export const FILTER_FIELDS_BY_ID = new Map(FILTER_FIELDS.map((field) => [field.id, field]));

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

// The dropdown's top-level menu: standalone fields alongside groups (e.g.
// Education, Social Profile) that nest their fields one level deeper, so
// related fields don't clutter the top-level list.
export const FILTER_MENU: FilterMenuEntry[] = [
  TAG_FIELD,
  { id: "group:education", label: "Education", fields: EDUCATION_FIELDS, noneField: EDUCATION_NONE_FIELD },
  { id: "group:social", label: "Social Profile", fields: SOCIAL_FIELDS, noneField: SOCIAL_NONE_FIELD },
  { id: "group:address", label: "Address", fields: ADDRESS_FIELDS, noneField: ADDRESS_NONE_FIELD },
];

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
