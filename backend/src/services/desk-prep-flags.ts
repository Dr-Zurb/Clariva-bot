/**
 * Cheap visit-prep flags for GET /api/v1/appointments?date=.
 *
 * Derived from existing 087 / 233 / 234 tables. No PHI — only presence.
 */

export type DeskPrepFlags = {
  has_desk_vitals: boolean;
  has_history_submission: boolean;
  visit_document_count: number;
  has_visit_documents: boolean;
};

export const EMPTY_DESK_PREP_FLAGS: DeskPrepFlags = {
  has_desk_vitals: false,
  has_history_submission: false,
  visit_document_count: 0,
  has_visit_documents: false,
};

function asEmbedRows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter(
      (row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object'
    );
  }
  if (value && typeof value === 'object') {
    return [value as Record<string, unknown>];
  }
  return [];
}

/** True when the list select included the desk-prep embeds (even if empty). */
export function rowHasDeskPrepEmbeds(row: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(row, 'patient_vitals') ||
    Object.prototype.hasOwnProperty.call(row, 'patient_history_submissions') ||
    Object.prototype.hasOwnProperty.call(row, 'visit_documents')
  );
}

/**
 * Map PostgREST embeds on an appointment row to boolean / count flags.
 * Archived vitals do not count. Nested objects are never returned.
 */
export function deskPrepFlagsFromEmbeds(row: Record<string, unknown>): DeskPrepFlags {
  const vitals = asEmbedRows(row.patient_vitals).filter((item) => item.archived_at == null);
  const history = asEmbedRows(row.patient_history_submissions);
  const documents = asEmbedRows(row.visit_documents);
  const visit_document_count = documents.length;
  return {
    has_desk_vitals: vitals.length > 0,
    has_history_submission: history.length > 0,
    visit_document_count,
    has_visit_documents: visit_document_count > 0,
  };
}

/** Missing 233/234 relationship or table — retry the list without embeds. */
export function isDeskPrepRelationError(
  error: {
    code?: string | null;
    message?: string | null;
  } | null
): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  if (code === 'PGRST200' || code === '42P01') return true;
  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('patient_history_submissions') ||
    message.includes('visit_documents') ||
    message.includes('patient_vitals')
  );
}
