import type { ConsultationMessage } from "@/lib/text/types";

export type MessageGroup =
  | { type: "single"; message: ConsultationMessage }
  | { type: "batch"; messages: ConsultationMessage[]; batchId: string };

/**
 * Group consecutive attachment rows that share `batch_id` and `senderId`.
 * Single-attachment rows (no batch_id or sole member of a batch_id) stay as singles.
 */
export function groupMessages(messages: ConsultationMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let i = 0;
  while (i < messages.length) {
    const m = messages[i];
    if (m.kind === "attachment" && m.batch_id) {
      const batchMessages: ConsultationMessage[] = [m];
      const batchId = m.batch_id;
      const senderId = m.senderId;
      i += 1;
      while (i < messages.length) {
        const next = messages[i];
        if (
          next.kind === "attachment" &&
          next.batch_id === batchId &&
          next.senderId === senderId
        ) {
          batchMessages.push(next);
          i += 1;
        } else {
          break;
        }
      }
      if (batchMessages.length > 1) {
        groups.push({ type: "batch", messages: batchMessages, batchId });
      } else {
        groups.push({ type: "single", message: batchMessages[0] });
      }
    } else {
      groups.push({ type: "single", message: m });
      i += 1;
    }
  }
  return groups;
}
