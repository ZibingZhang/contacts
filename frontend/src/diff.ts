export interface FieldDiff {
  path: string;
  before: unknown;
  after: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Disk-only bookkeeping fields that should never be surfaced as a "change"
// when reviewing a push to iCloud -- mirrors normalize_push_diff() in
// contacts/utils/contact_utils.py.
const UNSYNCED_PUSH_FIELDS = new Set(["id", "mtime"]);

// Compares two arrays as multisets (order doesn't matter) and returns the
// items that were added/removed, matching elements by deep equality.
function arrayDiff<T>(before: T[], after: T[]): { added: T[]; removed: T[] } {
  const remaining = new Map<string, { count: number; value: T }>();
  for (const item of before) {
    const key = JSON.stringify(item);
    const entry = remaining.get(key);
    if (entry) entry.count++;
    else remaining.set(key, { count: 1, value: item });
  }

  const added: T[] = [];
  for (const item of after) {
    const key = JSON.stringify(item);
    const entry = remaining.get(key);
    if (entry && entry.count > 0) {
      entry.count--;
    } else {
      added.push(item);
    }
  }

  const removed: T[] = [];
  for (const { count, value } of remaining.values()) {
    for (let i = 0; i < count; i++) removed.push(value);
  }

  return { added, removed };
}

// Walks two JSON-shaped objects and collects the leaf fields that differ.
// Arrays are diffed as multisets, emitting one FieldDiff per added/removed
// item (before=undefined for an addition, after=undefined for a removal)
// rather than dumping the whole before/after array.
export function diffFields(
  before: unknown,
  after: unknown,
  path = "",
  skipFields: ReadonlySet<string> = new Set()
): FieldDiff[] {
  if (valuesEqual(before, after)) {
    return [];
  }

  if (Array.isArray(before) || Array.isArray(after)) {
    const { added, removed } = arrayDiff(
      Array.isArray(before) ? before : [],
      Array.isArray(after) ? after : []
    );
    return [
      ...removed.map((item) => ({ path, before: item, after: undefined })),
      ...added.map((item) => ({ path, before: undefined, after: item })),
    ];
  }

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const diffs: FieldDiff[] = [];
    for (const key of keys) {
      if (!path && skipFields.has(key)) continue;
      diffs.push(
        ...diffFields(before[key], after[key], path ? `${path}.${key}` : key, skipFields)
      );
    }
    return diffs;
  }

  return [{ path, before, after }];
}

export function diffPushFields(before: unknown, after: unknown): FieldDiff[] {
  return diffFields(before, after, "", UNSYNCED_PUSH_FIELDS);
}

export function formatDiffValue(value: unknown): string {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (isPlainObject(value)) return formatDiffObject(value);
  return JSON.stringify(value);
}

// Renders a list-item object (EmailAddress, PhoneNumber, StreetAddress, ...)
// as "<main value> (<label>)" instead of a raw JSON dump. `label` and
// `country_code` are treated as decoration rather than main content.
function formatDiffObject(value: Record<string, unknown>): string {
  const { label, country_code, ...rest } = value;
  const main = Object.values(rest)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter((v) => v !== null && v !== undefined && v !== "")
    .map(String)
    .join(", ");

  if (main && label) return `${main} (${label})`;
  if (main) return main;
  if (label) return String(label);
  return JSON.stringify(value);
}

export function prettifyFieldPath(path: string): string {
  return path
    .split(".")
    .map((part) => part.replace(/_/g, " "))
    .join(" → ");
}
