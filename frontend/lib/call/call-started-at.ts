/**
 * Persisted call-duration anchor — survives page refresh so the mm:ss
 * chip continues from session start instead of resetting to 00:00.
 *
 * Resolution order for a live room:
 *   1. Server `consultation_sessions.actual_started_at` (prop)
 *   2. sessionStorage for this session id (same-tab refresh)
 *   3. `new Date()` on first Twilio connect (then written to storage)
 */

const STORAGE_PREFIX = "call-started-at-";

export function parseCallStartedAt(
  value?: string | Date | null,
): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function callStartedAtStorageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`;
}

export function readStoredCallStartedAt(
  sessionId: string | null | undefined,
): Date | null {
  if (!sessionId || typeof window === "undefined") return null;
  try {
    return parseCallStartedAt(
      window.sessionStorage.getItem(callStartedAtStorageKey(sessionId)),
    );
  } catch {
    return null;
  }
}

export function storeCallStartedAt(
  sessionId: string | null | undefined,
  at: Date,
): void {
  if (!sessionId || typeof window === "undefined") return;
  if (Number.isNaN(at.getTime())) return;
  try {
    window.sessionStorage.setItem(
      callStartedAtStorageKey(sessionId),
      at.toISOString(),
    );
  } catch {
    // private mode / quota — timer still works for this mount
  }
}

/**
 * Best available start timestamp before/on connect. Null means the
 * room should wait for Twilio connect and then use `new Date()`.
 */
export function resolveCallStartedAt(options: {
  sessionStartedAt?: string | Date | null;
  sessionId?: string | null;
}): Date | null {
  return (
    parseCallStartedAt(options.sessionStartedAt) ??
    readStoredCallStartedAt(options.sessionId)
  );
}

/**
 * Pick the earlier of two anchors (server truth wins over a later
 * "first connect" guess after refresh hydration).
 */
export function earlierCallStartedAt(
  a: Date | null,
  b: Date | null,
): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}
