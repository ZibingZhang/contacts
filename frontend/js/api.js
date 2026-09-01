import { API_BASE_URL } from "./config.js";

export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function apiGet(path, params = {}) {
  const url = new URL(API_BASE_URL + path);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
    } else {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url);

  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const error = body && body.error;
    throw new ApiError(error ? error.message : `Request failed (${response.status})`, {
      status: response.status,
      code: error ? error.code : undefined,
    });
  }

  return body;
}

export async function fetchContacts() {
  return apiGet("/contacts");
}

export async function fetchTags() {
  return apiGet("/tags");
}
