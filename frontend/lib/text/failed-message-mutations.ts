/**
 * Pure state updates for failed optimistic chat sends (text-A6).
 * Keeps retry/discard logic testable outside TextConsultRoom.
 */

export interface RetryableMessage {
  id: string;
  pending?: boolean;
  failed?: boolean;
  /**
   * text-D5 — preserved so the failed-bubble label / retry-gate logic
   * can read it; the helper clears it on retry so the new attempt
   * starts with no stale tag.
   */
  failureReason?: "rate-limited" | "unknown";
}

/** Re-enter pending on the same row — preserves list index (no re-append). */
export function markMessageRetrying<T extends RetryableMessage>(
  messages: T[],
  localId: string,
): T[] {
  return messages.map((m) =>
    m.id === localId
      ? { ...m, pending: true, failed: false, failureReason: undefined }
      : m,
  );
}

/** Drop a failed optimistic bubble (never persisted server-side). */
export function discardFailedMessage<T extends { id: string }>(
  messages: T[],
  localId: string,
): T[] {
  return messages.filter((m) => m.id !== localId);
}
