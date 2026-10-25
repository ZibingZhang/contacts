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

// Walks two JSON-shaped objects and collects the leaf fields that differ.
// Arrays are compared as opaque values (not diffed element-by-element) --
// good enough for a "here's what changed" review list.
export function diffFields(
  before: unknown,
  after: unknown,
  path = "",
  skipFields: ReadonlySet<string> = new Set()
): FieldDiff[] {
  if (valuesEqual(before, after)) {
    return [];
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
  return JSON.stringify(value);
}

export function prettifyFieldPath(path: string): string {
  return path
    .split(".")
    .map((part) => part.replace(/_/g, " "))
    .join(" → ");
}
