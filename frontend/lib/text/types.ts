/**
 * Text consult message shape — shared between TextConsultRoom and MessageBubble.
 *
 * Optional T2 columns (migration 107) are present on the type for B3–B8;
 * the B2 render path does not use them yet.
 */

export type ConsultationMessageKind = "text" | "attachment" | "system";

export interface ConsultationMessage {
  /** Server-acked id (UUID), or the optimistic client-generated UUID. */
  id: string;
  /** Optimistic client id when distinct from server id (future / retry paths). */
  local_id?: string;
  sessionId: string;
  senderId: string;
  senderRole: "doctor" | "patient" | "system";
  body: string;
  createdAt: string;
  kind: ConsultationMessageKind;
  attachmentUrl?: string | null;
  attachmentMimeType?: string | null;
  attachmentByteSize?: number | null;
  systemEvent?: string | null;
  metadata?: Record<string, unknown> | null;
  pending?: boolean;
  failed?: boolean;
  /**
   * text-D5 — reason the optimistic send failed. Drives the failed
   * bubble's label (`'Rate limit hit'` vs the default `'Failed to
   * send'`) and gates auto-retry: when set to `'rate-limited'`, the
   * A6 retry must wait for the cooldown to clear.
   *
   * `'unknown'` matches the pre-D5 default (legacy A6 path).
   */
  failureReason?: "rate-limited" | "unknown";
  retryBody?: string;
  /** text-A7 — counterparty viewed bottom through this timestamp (local only). */
  seen?: boolean;
  /** migration 107 — reply parent (B4). */
  reply_to_id?: string | null;
  /** migration 107 — edit tombstone (B6). */
  edited_at?: string | null;
  deleted_at?: string | null;
  pinned_at?: string | null;
  pinned_by?: string | null;
  batch_id?: string | null;
}
