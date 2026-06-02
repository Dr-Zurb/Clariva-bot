/**
 * text-A7 — WhatsApp-style delivery ticks on own-message bubbles.
 * Delivered ✓ (server-acked) → Seen ✓✓ (counterparty viewed bottom).
 */

export type MessageDeliveryStatus = "none" | "delivered" | "seen";

export function deriveMessageDeliveryStatus(msg: {
  pending?: boolean;
  failed?: boolean;
  seen?: boolean;
}): MessageDeliveryStatus {
  if (msg.failed || msg.pending) return "none";
  if (msg.seen) return "seen";
  return "delivered";
}

export interface MessageStatusProps {
  status: MessageDeliveryStatus;
}

export function MessageStatus({ status }: MessageStatusProps): JSX.Element | null {
  if (status === "none") return null;
  if (status === "seen") {
    return (
      <span className="text-blue-500 text-xs ml-1 shrink-0" aria-label="Seen">
        ✓✓
      </span>
    );
  }
  return (
    <span className="text-gray-500 text-xs ml-1 shrink-0" aria-label="Delivered">
      ✓
    </span>
  );
}
