// Generic deep get/set for a form's draft object, addressed by the chain of
// field keys from the schema root (e.g. ["name", "first_name"]). Only object
// nesting needs this -- a "many" field's rows are edited independently, each
// holding its own value, so a path never crosses a "many" boundary.

export type Draft = Record<string, unknown>;

export function getAtPath(data: Draft, path: string[]): unknown {
  let current: unknown = data;
  for (const key of path) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Draft)[key];
  }
  return current;
}

export function setAtPath(data: Draft, path: string[], value: unknown): Draft {
  if (path.length === 0) {
    return value as Draft;
  }
  const [head, ...rest] = path;
  if (rest.length === 0) {
    return { ...data, [head]: value };
  }
  const current = (data[head] as Draft | undefined) ?? {};
  return { ...data, [head]: setAtPath(current, rest, value) };
}
