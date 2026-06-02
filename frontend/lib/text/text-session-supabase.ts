/**
 * text-B6 — client-side projection for consultation_messages Realtime rows.
 *
 * Realtime subscribes to the underlying TABLE, not `consultation_messages_view`.
 * Mirror the view's soft-delete projection so deleted rows never leak body text
 * into React state (PHI minimization on the client).
 *
 * @see backend/migrations/107_text_t2_chat_polish.sql (view definition)
 */

export interface ConsultationMessageProjectionRow {
  body: string | null;
  deleted_at?: string | null;
  attachment_url?: string | null;
  attachment_mime_type?: string | null;
  attachment_byte_size?: number | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Applies the same NULL projection as `consultation_messages_view` for soft-deleted rows.
 */
export function projectConsultationMessageRow<T extends ConsultationMessageProjectionRow>(
  row: T,
): T {
  if (!row.deleted_at) return row;
  return {
    ...row,
    body: null,
    attachment_url: null,
    attachment_mime_type: null,
    attachment_byte_size: null,
    metadata: null,
  };
}
