/**
 * Inbox Path bar expand/collapse preference (doctor UI chrome only — no PHI).
 * Default: compact (false).
 */

export const INBOX_PATH_EXPANDED_KEY = "inbox/path-expanded";

export function readInboxPathExpandedFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(INBOX_PATH_EXPANDED_KEY) === "true";
}

export function writeInboxPathExpandedToStorage(expanded: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(INBOX_PATH_EXPANDED_KEY, expanded ? "true" : "false");
}
