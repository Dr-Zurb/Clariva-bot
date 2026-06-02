import { shouldShowMessageTimestamp } from "@/components/consultation/MessageBubble";
import { formatDateISO } from "@/lib/format-date";
import { formatDayLabel } from "@/lib/text/format-day-label";
import { groupMessages } from "@/lib/text/group-messages";
import type { ConsultationMessage } from "@/lib/text/types";

/** Activate Virtuoso when a session exceeds this many messages (text-D3). */
export const MESSAGE_LIST_VIRTUALIZATION_THRESHOLD = 100;

export type MessageSeparatorRow = {
  __type: "separator";
  key: string;
  label: string;
  dateISO: string;
};

export type MessageSingleRow = {
  __type: "single";
  key: string;
  message: ConsultationMessage;
  showTimestamp: boolean;
};

export type MessageBatchRow = {
  __type: "batch";
  key: string;
  messages: ConsultationMessage[];
  batchId: string;
  showTimestamp: boolean;
};

export type MessageRow = MessageSeparatorRow | MessageSingleRow | MessageBatchRow;

/**
 * Flatten grouped messages into render rows with day separators interleaved (text-A4 + B8).
 * Memoised by callers on `messages` reference change.
 */
export function buildMessageRows(messages: ConsultationMessage[]): MessageRow[] {
  const groups = groupMessages(messages);
  const rows: MessageRow[] = [];
  let lastRenderedDate: string | null = null;
  let prevFlatMessage: ConsultationMessage | undefined;

  for (const group of groups) {
    const head = group.type === "single" ? group.message : group.messages[0];
    const messageDate = formatDateISO(head.createdAt);
    const showDaySeparator = messageDate !== lastRenderedDate;
    if (showDaySeparator) {
      lastRenderedDate = messageDate;
      rows.push({
        __type: "separator",
        key: `day-sep-${messageDate}-${head.id}`,
        label: formatDayLabel(head.createdAt),
        dateISO: messageDate,
      });
    }

    const showTs = shouldShowMessageTimestamp(prevFlatMessage, head);
    prevFlatMessage =
      group.type === "single"
        ? group.message
        : group.messages[group.messages.length - 1];

    if (group.type === "batch") {
      rows.push({
        __type: "batch",
        key: `batch-${group.batchId}`,
        messages: group.messages,
        batchId: group.batchId,
        showTimestamp: showTs,
      });
    } else {
      rows.push({
        __type: "single",
        key: group.message.id ?? group.message.local_id ?? `msg-${rows.length}`,
        message: group.message,
        showTimestamp: showTs,
      });
    }
  }

  return rows;
}

/** Count message bubbles represented by rows (excludes day separators). */
export function countMessagesInRows(rows: MessageRow[]): number {
  let count = 0;
  for (const row of rows) {
    if (row.__type === "separator") continue;
    count += row.__type === "batch" ? row.messages.length : 1;
  }
  return count;
}

export function shouldVirtualizeMessageList(rows: MessageRow[]): boolean {
  return countMessagesInRows(rows) > MESSAGE_LIST_VIRTUALIZATION_THRESHOLD;
}

/** Row index for scrollToMessage — matches singles and batch members (text-B4). */
export function findMessageRowIndex(rows: MessageRow[], messageId: string): number {
  return rows.findIndex((row) => {
    if (row.__type === "single") return row.message.id === messageId;
    if (row.__type === "batch") {
      return row.messages.some((m) => m.id === messageId);
    }
    return false;
  });
}
