import type { ContactsResponse, TagsResponse } from "./types";

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

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(API_BASE_URL + path);

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

export function fetchContacts(): Promise<ContactsResponse> {
  return apiGet<ContactsResponse>("/contacts");
}

export function fetchTags(): Promise<TagsResponse> {
  return apiGet<TagsResponse>("/tags");
}

export function apiBaseUrl(): string {
  return API_BASE_URL;
}
