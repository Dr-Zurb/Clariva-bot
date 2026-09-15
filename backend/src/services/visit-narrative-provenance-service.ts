/**
 * Append-only visit-narrative provenance (vnt-01 / vnt-04 §4).
 *
 * Never blocks the clinical accept. Insert failure is logged as a count
 * and returned as `{ recorded: false }`.
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { InternalError, NotFoundError } from '../utils/errors';
import { findSessionById } from './consultation-session-service';
import { assertVisitNarrativeActorIsDoctor } from './visit-narrative-extraction-service';
import type { VisitNarrativeProvenanceTargetKind } from '../types/database';

export interface RecordVisitNarrativeProvenanceInput {
  consultationSessionId: string;
  transcriptId: string;
  spanStart: number;
  spanEnd: number;
  targetKind: VisitNarrativeProvenanceTargetKind;
  createdRowId?: string;
  doctorId: string;
  correlationId: string;
  actorRole?: unknown;
}

export interface RecordVisitNarrativeProvenanceResult {
  recorded: boolean;
  id: string | null;
}

export interface RecordVisitNarrativeProvenanceDeps {
  loadSession?: (sessionId: string) => Promise<{
    doctorId: string;
    appointmentId: string;
    patientId: string | null;
  } | null>;
  insertRow?: (row: Record<string, unknown>) => Promise<{ id: string } | null>;
}

async function defaultLoadSession(
  sessionId: string,
): Promise<{ doctorId: string; appointmentId: string; patientId: string | null } | null> {
  const session = await findSessionById(sessionId);
  if (!session) return null;
  return {
    doctorId: session.doctorId,
    appointmentId: session.appointmentId,
    patientId: session.patientId,
  };
}

async function defaultInsertRow(row: Record<string, unknown>): Promise<{ id: string } | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }
  const { data, error } = await admin
    .from('visit_narrative_provenance')
    .insert(row)
    .select('id')
    .single();
  if (error || !data) {
    logger.warn(
      { code: error?.code, hasId: Boolean(data) },
      'visit_narrative_provenance: insert failed',
    );
    return null;
  }
  return { id: data.id as string };
}

export async function recordVisitNarrativeProvenance(
  input: RecordVisitNarrativeProvenanceInput,
  deps: RecordVisitNarrativeProvenanceDeps = {},
): Promise<RecordVisitNarrativeProvenanceResult> {
  assertVisitNarrativeActorIsDoctor(input.actorRole);

  const loadSession = deps.loadSession ?? defaultLoadSession;
  const insertRow = deps.insertRow ?? defaultInsertRow;

  const session = await loadSession(input.consultationSessionId);
  if (!session || session.doctorId !== input.doctorId) {
    throw new NotFoundError('Consultation not found');
  }

  try {
    const inserted = await insertRow({
      doctor_id: input.doctorId,
      patient_id: session.patientId,
      appointment_id: session.appointmentId,
      consultation_session_id: input.consultationSessionId,
      transcript_id: input.transcriptId,
      span_start: input.spanStart,
      span_end: input.spanEnd,
      target_kind: input.targetKind,
      created_row_id: input.createdRowId ?? null,
      accepted_by: input.doctorId,
    });
    if (!inserted) {
      logger.info(
        { correlationId: input.correlationId, targetKind: input.targetKind },
        'visit_narrative_provenance: skipped',
      );
      return { recorded: false, id: null };
    }
    logger.info(
      { correlationId: input.correlationId, targetKind: input.targetKind },
      'visit_narrative_provenance: recorded',
    );
    return { recorded: true, id: inserted.id };
  } catch (err) {
    logger.warn(
      { correlationId: input.correlationId, err: err instanceof Error ? err.name : 'unknown' },
      'visit_narrative_provenance: insert threw',
    );
    return { recorded: false, id: null };
  }
}
