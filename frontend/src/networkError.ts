import { apiBaseUrl, ApiError } from "./api";

export function networkErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return `Could not reach the contacts API at ${apiBaseUrl()} — is \`python -m contacts serve\` running?`;
}
