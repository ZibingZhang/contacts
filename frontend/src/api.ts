import type {
  Association,
  AssociationsResponse,
  BatchAddTagsResponse,
  Contact,
  ContactFieldOptions,
  ContactsResponse,
  ListMemberIdsResponse,
  ListObject,
  ListsResponse,
  MemberIdsResponse,
  ObjectsResponse,
  QueryResult,
  SchemaObject,
  SchemasResponse,
  SyncResult,
  TagsResponse,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

export class ApiError extends Error {
  status?: number;
  code?: string;

  constructor(message: string, { status, code }: { status?: number; code?: string } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  let body: { error?: { message?: string; code?: string } } | null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const error = body && body.error;
    throw new ApiError(error?.message ?? `Request failed (${response.status})`, {
      status: response.status,
      code: error?.code,
    });
  }

  return body as T;
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(API_BASE_URL + path);
  return readJsonResponse<T>(response);
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(API_BASE_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJsonResponse<T>(response);
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(API_BASE_URL + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJsonResponse<T>(response);
}

async function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(API_BASE_URL + path, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return readJsonResponse<T>(response);
}

// -- Generic objects -------------------------------------------------------

export function fetchObjects<T>(objectType: string): Promise<ObjectsResponse<T>> {
  return apiGet<ObjectsResponse<T>>(`/objects/${objectType}`);
}

export function fetchObject<T>(objectType: string, objectId: number): Promise<T> {
  return apiGet<T>(`/objects/${objectType}/${objectId}`);
}

export function createObject<T>(objectType: string, payload: Record<string, unknown>): Promise<T> {
  return apiPost<T>(`/objects/${objectType}`, payload);
}

export function updateObject<T>(
  objectType: string,
  objectId: number,
  payload: Record<string, unknown>
): Promise<T> {
  return apiPut<T>(`/objects/${objectType}/${objectId}`, payload);
}

export function deleteObject(objectType: string, objectId: number): Promise<{ status: string }> {
  return apiDelete<{ status: string }>(`/objects/${objectType}/${objectId}`);
}

// -- Schemas ---------------------------------------------------------------

export function fetchSchemas(): Promise<SchemasResponse> {
  return apiGet<SchemasResponse>("/schemas");
}

export function fetchSchema(name: string): Promise<SchemaObject> {
  return apiGet<SchemaObject>(`/schemas/${name}`);
}

export function createSchema(payload: Record<string, unknown>): Promise<SchemaObject> {
  return apiPost<SchemaObject>("/schemas", payload);
}

export function updateSchema(name: string, payload: Record<string, unknown>): Promise<SchemaObject> {
  return apiPut<SchemaObject>(`/schemas/${name}`, payload);
}

export function deleteSchema(name: string): Promise<{ status: string }> {
  return apiDelete<{ status: string }>(`/schemas/${name}`);
}

// -- Contacts --------------------------------------------------------------

export function fetchContacts(): Promise<ContactsResponse> {
  return apiGet<ContactsResponse>("/objects/contact");
}

export function fetchTags(): Promise<TagsResponse> {
  return apiGet<TagsResponse>("/tags");
}

export function fetchContactFieldOptions(): Promise<ContactFieldOptions> {
  return apiGet<ContactFieldOptions>("/objects/contact/options");
}

export function createContact(payload: Record<string, unknown>): Promise<Contact> {
  return createObject<Contact>("contact", payload);
}

export function updateContact(contactId: number, payload: Record<string, unknown>): Promise<Contact> {
  return updateObject<Contact>("contact", contactId, payload);
}

export function deleteContact(contactId: number): Promise<{ status: string }> {
  return deleteObject("contact", contactId);
}

export function batchAddTags(contactIds: number[], tags: string[]): Promise<BatchAddTagsResponse> {
  return apiPost<BatchAddTagsResponse>("/objects/contact/batch/tags", {
    contact_ids: contactIds,
    tags,
  });
}

export function startSync(): Promise<SyncResult> {
  return apiPost<SyncResult>("/sync", {});
}

export function submitSyncDevice(deviceIndex: number): Promise<SyncResult> {
  return apiPost<SyncResult>("/sync/device", { device_index: deviceIndex });
}

export function submitSyncCode(code: string): Promise<SyncResult> {
  return apiPost<SyncResult>("/sync/code", { code });
}

export function applySyncReview(createIcloudIds: string[], updateIcloudIds: string[]): Promise<SyncResult> {
  return apiPost<SyncResult>("/sync/apply", {
    create_icloud_ids: createIcloudIds,
    update_icloud_ids: updateIcloudIds,
  });
}

export function startPush(): Promise<SyncResult> {
  return apiPost<SyncResult>("/push", {});
}

export function submitPushDevice(deviceIndex: number): Promise<SyncResult> {
  return apiPost<SyncResult>("/push/device", { device_index: deviceIndex });
}

export function submitPushCode(code: string): Promise<SyncResult> {
  return apiPost<SyncResult>("/push/code", { code });
}

export function applyPushReview(createIcloudIds: string[], updateIcloudIds: string[]): Promise<SyncResult> {
  return apiPost<SyncResult>("/push/apply", {
    create_icloud_ids: createIcloudIds,
    update_icloud_ids: updateIcloudIds,
  });
}

// -- Lists -----------------------------------------------------------------

export function fetchLists(): Promise<ListsResponse> {
  return fetchObjects<ListObject>("list");
}

export function createList(payload: Record<string, unknown>): Promise<ListObject> {
  return createObject<ListObject>("list", payload);
}

export function updateList(listId: number, payload: Record<string, unknown>): Promise<ListObject> {
  return updateObject<ListObject>("list", listId, payload);
}

export function deleteList(listId: number): Promise<{ status: string }> {
  return deleteObject("list", listId);
}

/** Every list's membership in one request -- the nav needs all the counts. */
export function fetchAllListMemberIds(): Promise<ListMemberIdsResponse> {
  return apiGet<ListMemberIdsResponse>("/lists/member-ids");
}

export function fetchListMemberIds(listId: number): Promise<MemberIdsResponse> {
  return apiGet<MemberIdsResponse>(`/lists/${listId}/member-ids`);
}

export function fetchListMembers<T>(listId: number): Promise<ObjectsResponse<T>> {
  return apiGet<ObjectsResponse<T>>(`/lists/${listId}/members`);
}

export function addListMembers(listId: number, ids: number[]): Promise<{ ids: number[] }> {
  return apiPost<{ ids: number[] }>(`/lists/${listId}/members`, { ids });
}

export function removeListMembers(listId: number, ids: number[]): Promise<{ ids: number[] }> {
  return apiDelete<{ ids: number[] }>(`/lists/${listId}/members`, { ids });
}

export function refreshList(listId: number): Promise<ListObject> {
  return apiPost<ListObject>(`/lists/${listId}/refresh`, {});
}

export function refreshLists(): Promise<ListsResponse> {
  return apiPost<ListsResponse>("/lists/refresh", {});
}

// -- Associations ----------------------------------------------------------

export function fetchAssociations(objectType: string, objectId: number): Promise<AssociationsResponse> {
  return apiGet<AssociationsResponse>(`/associations/${objectType}/${objectId}`);
}

export function createAssociation(
  objectType1: string,
  objectId1: number,
  objectType2: string,
  objectId2: number
): Promise<Association> {
  return apiPost<Association>("/associations", {
    object_type_1: objectType1,
    object_id_1: objectId1,
    object_type_2: objectType2,
    object_id_2: objectId2,
  });
}

export function deleteAssociation(associationId: number): Promise<{ status: string }> {
  return apiDelete<{ status: string }>(`/associations/${associationId}`);
}

export function runReadonlyQuery(sql: string): Promise<QueryResult> {
  return apiPost<QueryResult>("/admin/query", { sql });
}

export function runQuery(sql: string): Promise<QueryResult> {
  return apiPost<QueryResult>("/admin/execute", { sql });
}

export function apiBaseUrl(): string {
  return API_BASE_URL;
}
