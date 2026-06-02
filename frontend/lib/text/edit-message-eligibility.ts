import type { ConsultationMessage } from "@/lib/text/types";

const EDIT_DELETE_WINDOW_MS = 60_000;

/** text-B6 / text-C6 — whether a message is still inside the sender edit/delete window. */
export function isWithinEditDeleteWindow(
  message: ConsultationMessage,
  nowMs: number = Date.now(),
): boolean {
  const created = new Date(message.createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return nowMs - created < EDIT_DELETE_WINDOW_MS;
}

/**
 * text-C6 integration — most recent own, non-deleted text message still in the 60s window.
 * Pass the result to `setEditingMessageId(message.id)` in TextConsultRoom.
 */
export function findLastEditableOwnMessage(
  messages: ConsultationMessage[],
  currentUserId: string,
  nowMs: number = Date.now(),
): ConsultationMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.senderId !== currentUserId) continue;
    if (m.deleted_at || m.kind === "system" || m.kind === "attachment") continue;
    if (m.pending || m.failed) continue;
    if (!isWithinEditDeleteWindow(m, nowMs)) continue;
    return m;
  }
  return null;
}
