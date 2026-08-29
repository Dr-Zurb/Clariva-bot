/**
 * Delivery ticks on own-message bubbles.
 * Sent ✓ → Delivered ✓✓ → Read ✓✓ (brand blue).
 */

import { Check, CheckCheck } from "lucide-react";
import { formatTime } from "@/lib/format-date";
import {
  MESSAGE_META_CLASS,
  MESSAGE_READ_TICK_CLASS,
  MESSAGE_TICK_CLASS,
} from "@/lib/text/message-bubble-theme";

export type MessageDeliveryStatus = "none" | "sent" | "delivered" | "read";

export function deriveMessageDeliveryStatus(msg: {
  pending?: boolean;
  failed?: boolean;
  seen?: boolean;
}): MessageDeliveryStatus {
  if (msg.failed) return "none";
  if (msg.pending) return "sent";
  if (msg.seen) return "read";
  return "delivered";
}

export interface MessageStatusProps {
  status: MessageDeliveryStatus;
}

export function MessageStatus({
  status,
}: MessageStatusProps): JSX.Element | null {
  if (status === "none") return null;
  const read = status === "read";
  const Icon = status === "sent" ? Check : CheckCheck;
  const label =
    status === "sent" ? "Sent" : status === "read" ? "Read" : "Delivered";
  return (
    <span
      className={
        "inline-flex shrink-0 " +
        (read ? MESSAGE_READ_TICK_CLASS : MESSAGE_TICK_CLASS)
      }
      data-delivery={status}
      aria-label={label}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
    </span>
  );
}

export interface MessageBubbleMetaProps {
  createdAt: string;
  edited?: boolean;
  status: MessageDeliveryStatus;
  /** Last-line float. Off when the parent already right-aligns. */
  floated?: boolean;
}

/**
 * Time (+ ticks on own messages) floated to the last line of the bubble
 * so meta shares the text row instead of taking one of its own.
 */
export function MessageBubbleMeta({
  createdAt,
  edited = false,
  status,
  floated = true,
}: MessageBubbleMetaProps): JSX.Element {
  return (
    <span
      data-testid="message-bubble-meta"
      className={
        "inline-flex items-center gap-0.5 " +
        (floated ? "float-right ml-2 mt-1 " : "") +
        MESSAGE_META_CLASS
      }
    >
      {edited ? (
        <span className="text-[10px] italic leading-none">edited</span>
      ) : null}
      <time className="text-[11px] leading-none tabular-nums">
        {formatTime(createdAt)}
      </time>
      {status !== "none" ? (
        <span data-testid="message-delivery-ticks" className="inline-flex">
          <MessageStatus status={status} />
        </span>
      ) : null}
    </span>
  );
}
