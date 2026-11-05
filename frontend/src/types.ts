export interface Name {
  prefix?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  nickname?: string;
  maiden_name?: string;
  deadname?: string;
  suffix?: string;
  chinese_name?: string;
}

export interface PhoneNumber {
  label?: string;
  country_code: number;
  number: string;
}

export interface EmailAddress {
  label?: string;
  address: string;
}

export interface StreetAddress {
  label?: string;
  street?: string[];
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

export interface EducationEntry {
  name: string;
  graduation_year?: number;
  majors?: string[];
  minors?: string[];
}

export type EducationLevel = "high_school" | "bachelor" | "master" | "law" | "medical" | "phd";

export type Education = Partial<Record<EducationLevel, EducationEntry>>;

export interface FacebookProfile {
  username?: string;
  user_id?: string;
}

export interface GameCenterProfile {
  username: string;
  link?: string;
}

export interface InstagramProfile {
  username: string;
  finsta_usernames?: string[];
}

export interface LinkedInProfile {
  username: string;
}

export interface SocialProfiles {
  facebook?: FacebookProfile;
  game_center?: GameCenterProfile;
  instagram?: InstagramProfile;
  linkedin?: LinkedInProfile;
}

export interface DateRange {
  start?: string;
  end?: string;
}

export interface Contact {
  id: number;
  name?: Name;
  tags?: string[];
  birthday?: string;
  phone_numbers?: PhoneNumber[];
  email_addresses?: EmailAddress[];
  street_addresses?: StreetAddress[];
  education?: Education;
  social_profiles?: SocialProfiles;
  notes?: string;
  friends_friend?: string;
  dated?: DateRange;
  favorite?: Record<string, unknown>;
}

export interface TagCount {
  tag: string;
  count: number;
}

// The generic object envelope every /api/objects/<type> endpoint returns.
export interface ObjectsResponse<T> {
  objects: T[];
  total: number;
}

export type ContactsResponse = ObjectsResponse<Contact>;

export interface TagsResponse {
  tags: TagCount[];
}

export interface BatchObjectsResponse<T> {
  objects: T[];
}

export type SyncVerificationKind = "code" | "device_and_code";

export interface SyncComplete {
  status: "complete";
  created: number;
  updated: number;
}

export interface SyncRequiresVerification {
  status: "requires_verification";
  verification_kind: SyncVerificationKind;
  devices: string[];
}

// A contact fresh from iCloud, not yet created on disk, so it has no `id` yet.
export type UnsavedContact = Omit<Contact, "id"> & { id?: number };

export interface SyncReviewCreatedItem {
  icloud_id: string;
  contact: UnsavedContact;
}

export interface SyncReviewUpdatedItem {
  icloud_id: string;
  before: Contact;
  after: Contact;
}

export interface SyncReview {
  status: "review";
  created: SyncReviewCreatedItem[];
  updated: SyncReviewUpdatedItem[];
}

export type SyncResult = SyncComplete | SyncRequiresVerification | SyncReview;

export interface QueryResult {
  columns: string[] | null;
  rows: unknown[][] | null;
  rowcount: number;
  truncated: boolean;
}

export interface ICloudGroupMetadata {
  uuid: string;
  etag?: string;
}

// An object type definition. Field types mirror contacts/model/schema.py.
export type FieldType =
  | "text"
  | "long_text"
  | "integer"
  | "number"
  | "boolean"
  | "date"
  | "select"
  | "reference"
  | "object"
  | "any";

// Every FieldType value, for building a type picker -- kept in lockstep by
// hand with the union above and with FIELD_TYPES in contacts/model/schema.py.
export const FIELD_TYPES: FieldType[] = [
  "text",
  "long_text",
  "integer",
  "number",
  "boolean",
  "date",
  "select",
  "reference",
  "object",
  "any",
];

export interface OptionPair {
  value: string | number;
  label: string;
}

export interface SchemaField {
  key: string;
  label: string;
  type: FieldType;
  many?: boolean;
  required?: boolean;
  managed?: boolean;
  default?: unknown;
  fields?: SchemaField[];
  options?: (string | number)[];
  options_from?: string;
  // Server-resolved {value, label} pairs for a "select" field, covering
  // both `options` and `options_from` -- always present on a select field
  // in an API response, so the frontend never needs its own label tables.
  resolved_options?: OptionPair[];
  ref_type?: string;
  unique?: boolean;
  order_by?: string;
  // A named presentation hint for viewing this field's value (e.g. "chips",
  // "link"); see contacts/model/schema.py's DISPLAY_KINDS for the full set.
  // Purely cosmetic, consumed only by schema-form/fieldRows.tsx.
  display?: string;
  display_options?: Record<string, unknown>;
  // Whether a text search should match against this field's value, beyond
  // whatever it already matches on an object's display title -- e.g. a
  // contact's nickname or Chinese name. Purely a hint for search-ranking
  // text; see contacts/model/schema.py's `Field.searchable`.
  searchable?: boolean;
  // Frontend-only: a composition-root overlay marking a field read-only in
  // the edit form without hiding it (unlike `managed`, which strips it
  // entirely) -- e.g. a list's member_type once the list exists. Never set
  // by the backend.
  readOnly?: boolean;
}

export interface SchemaLabel {
  singular: string;
  plural: string;
}

export interface SchemaObject {
  id: number;
  name: string;
  label: SchemaLabel;
  fields: SchemaField[];
  builtin?: boolean;
  // The key of the top-level field to use as an object's display title.
  title_field?: string;
  // A template (same `{field}`/`[optional segment]` syntax as a field's
  // `display: "template"`, dotted paths allowed) to sort/group objects by
  // when there's no search query. See searchStrategies.ts's `sortKeyOf`.
  sort_template?: string;
  ctime?: number;
  mtime?: number;
}

export interface SchemasResponse {
  schemas: SchemaObject[];
  total: number;
}

// A named set of objects. Membership lives in associations, not here, so
// there is no `ids` field -- read it from /api/lists/<id>/member-ids.
export interface ListObject {
  id: number;
  name: string;
  // Absent means the list is maintained by hand rather than by a query.
  query?: string;
  member_type: string;
  sync: boolean;
  ctime?: number;
  mtime?: number;
  icloud?: ICloudGroupMetadata;
}

export type ListsResponse = ObjectsResponse<ListObject>;

// List id -> its member object ids.
export interface ListMemberIdsResponse {
  member_ids: Record<string, number[]>;
}

export interface MemberIdsResponse {
  ids: number[];
  total: number;
}

// A link between any two objects, in either direction.
export interface Association {
  id: number;
  object_type_1: string;
  object_id_1: number;
  object_type_2: string;
  object_id_2: number;
  ctime?: number;
  mtime?: number;
}

export type AssociationsResponse = ObjectsResponse<Association>;
