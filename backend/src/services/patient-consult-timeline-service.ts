/**
 * rec-28 — doctor consult timeline (REC-D23 / REC5-D3).
 *
 * Read-only aggregate: ended sessions for one doctor+patient, plus
 * artifact *presence* from `recording_artifact_index`. Zero Twilio
 * calls. `patient_self_serve_visible` is not a doctor-side filter.
 *
 * hard_deleted_at: a deleted composition still surfaces as
 * `recordingDeleted: true` ("was recorded, since deleted under
 * retention"). Absence would lie to the clinician.
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { handleSupabaseError } from '../utils/db-helpers';
import { InternalError, NotFoundError } from '../utils/errors';
import { findPatientByIdWithAdmin } from './patient-service';

export const TIMELINE_PAGE_SIZE = 50;

export type ConsultTimelineModality = 'text' | 'voice' | 'video';

/** Status of the best `consultation_transcripts` row for this session. */
export type ConsultTranscriptStatus = 'completed' | 'processing' | 'queued' | 'failed';

export interface ConsultTimelineArtifacts {
  hasRecording: boolean;
  recordingDeleted: boolean;
  hasTranscript: boolean;
  hasPrescription: boolean;
  hasSnapshots: boolean;
}

export interface ConsultTimelineEntry {
  sessionId: string;
  appointmentId: string;
  consultedAt: string;
  modality: ConsultTimelineModality;
  durationSeconds: number | null;
  artifacts: ConsultTimelineArtifacts;
  /**
   * From `consultation_transcripts`, not `recording_artifact_index`.
   * `artifacts.hasTranscript` is the shipped rec-28 index flag and is
   * permanently false in production (nothing writes that kind). The
   * review offer gates on this field.
   */
  transcriptStatus: ConsultTranscriptStatus | null;
}

export interface ConsultTimelineResult {
  items: ConsultTimelineEntry[];
  hasMore: boolean;
}

export interface ListConsultTimelineInput {
  patientId: string;
  doctorId: string;
  correlationId: string;
  limit?: number;
  offset?: number;
}

/**
 * Raw `*_track` kinds count here too (cost-cut step 7): once replay
 * composes on demand, a session holding only raw tracks is just as
 * replayable as one that was composed up front, so the timeline should
 * not report it as having no recording.
 */
const RECORDING_KINDS = new Set([
  'audio_composition',
  'video_composition',
  'audio_track',
  'video_track',
]);

const TRANSCRIPT_STATUS_RANK: Record<ConsultTranscriptStatus, number> = {
  completed: 4,
  processing: 3,
  queued: 2,
  failed: 1,
};

function asTranscriptStatus(raw: unknown): ConsultTranscriptStatus | null {
  if (raw === 'completed' || raw === 'processing' || raw === 'queued' || raw === 'failed') {
    return raw;
  }
  return null;
}

function pickBetterStatus(
  current: ConsultTranscriptStatus | null,
  next: ConsultTranscriptStatus | null,
): ConsultTranscriptStatus | null {
  if (!next) return current;
  if (!current) return next;
  return TRANSCRIPT_STATUS_RANK[next] > TRANSCRIPT_STATUS_RANK[current] ? next : current;
}

function adminOrThrow(): NonNullable<ReturnType<typeof getSupabaseAdminClient>> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new InternalError('Service role client not available');
  }
  return admin;
}

function clampLimit(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw)) return TIMELINE_PAGE_SIZE;
  return Math.min(TIMELINE_PAGE_SIZE, Math.max(1, Math.floor(raw)));
}

function clampOffset(raw: number | undefined): number {
  if (raw === undefined || !Number.isFinite(raw) || raw < 0) return 0;
  return Math.floor(raw);
}

function durationSeconds(startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt || !endedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.floor((end - start) / 1000);
}

async function assertDoctorOwnsPatient(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  patientId: string,
  doctorId: string,
  correlationId: string,
): Promise<void> {
  const patient = await findPatientByIdWithAdmin(patientId, correlationId);
  if (!patient) {
    throw new NotFoundError('Patient not found');
  }

  const [
    { data: aptCheck, error: aptErr },
    { data: convCheck, error: convErr },
  ] = await Promise.all([
    admin
      .from('appointments')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('patient_id', patientId)
      .limit(1)
      .maybeSingle(),
    admin
      .from('conversations')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('patient_id', patientId)
      .limit(1)
      .maybeSingle(),
  ]);
  if (aptErr) handleSupabaseError(aptErr, correlationId);
  if (convErr) handleSupabaseError(convErr, correlationId);
  if (!aptCheck && !convCheck) {
    throw new NotFoundError('Patient not found');
  }
}

export async function listPatientConsultTimeline(
  input: ListConsultTimelineInput,
): Promise<ConsultTimelineResult> {
  const admin = adminOrThrow();
  const limit = clampLimit(input.limit);
  const offset = clampOffset(input.offset);

  await assertDoctorOwnsPatient(
    admin,
    input.patientId,
    input.doctorId,
    input.correlationId,
  );

  const { data: sessionRows, error: sessionErr } = await admin
    .from('consultation_sessions')
    .select(
      'id, appointment_id, modality, actual_started_at, actual_ended_at, scheduled_start_at',
    )
    .eq('patient_id', input.patientId)
    .eq('doctor_id', input.doctorId)
    .not('actual_ended_at', 'is', null)
    .order('actual_ended_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (sessionErr) handleSupabaseError(sessionErr, input.correlationId);

  const sessions = (sessionRows ?? []) as Array<{
    id: string;
    appointment_id: string;
    modality: ConsultTimelineModality;
    actual_started_at: string | null;
    actual_ended_at: string | null;
    scheduled_start_at: string | null;
  }>;

  const sessionIds = sessions.map((s) => s.id);
  const appointmentIds = sessions.map((s) => s.appointment_id).filter(Boolean);

  const emptyArtifacts = (): ConsultTimelineArtifacts => ({
    hasRecording: false,
    recordingDeleted: false,
    hasTranscript: false,
    hasPrescription: false,
    hasSnapshots: false,
  });

  const bySession = new Map<string, ConsultTimelineArtifacts>();
  for (const id of sessionIds) bySession.set(id, emptyArtifacts());
  const transcriptBySession = new Map<string, ConsultTranscriptStatus | null>();
  for (const id of sessionIds) transcriptBySession.set(id, null);

  if (sessionIds.length > 0) {
    const [artifactRes, rxRes, snapRes, transcriptRes] = await Promise.all([
      admin
        .from('recording_artifact_index')
        .select('session_id, artifact_kind, hard_deleted_at')
        .in('session_id', sessionIds),
      appointmentIds.length > 0
        ? admin
            .from('prescriptions')
            .select('appointment_id')
            .in('appointment_id', appointmentIds)
            .eq('doctor_id', input.doctorId)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from('consultation_messages')
        .select('session_id')
        .in('session_id', sessionIds)
        .eq('kind', 'attachment')
        .filter('metadata->>snapshot', 'eq', 'true'),
      admin
        .from('consultation_transcripts')
        .select('consultation_session_id, status')
        .in('consultation_session_id', sessionIds),
    ]);

    if (artifactRes.error) handleSupabaseError(artifactRes.error, input.correlationId);
    if (rxRes.error) handleSupabaseError(rxRes.error, input.correlationId);
    if (snapRes.error) handleSupabaseError(snapRes.error, input.correlationId);
    if (transcriptRes.error) handleSupabaseError(transcriptRes.error, input.correlationId);

    for (const raw of (artifactRes.data ?? []) as Array<{
      session_id: string;
      artifact_kind: string;
      hard_deleted_at: string | null;
    }>) {
      const bucket = bySession.get(raw.session_id);
      if (!bucket) continue;
      if (RECORDING_KINDS.has(raw.artifact_kind)) {
        if (raw.hard_deleted_at) {
          bucket.recordingDeleted = true;
        } else {
          bucket.hasRecording = true;
        }
      }
      if (raw.artifact_kind === 'transcript' && !raw.hard_deleted_at) {
        bucket.hasTranscript = true;
      }
    }

    const rxAppointments = new Set(
      ((rxRes.data ?? []) as Array<{ appointment_id: string }>).map(
        (r) => r.appointment_id,
      ),
    );
    for (const session of sessions) {
      if (rxAppointments.has(session.appointment_id)) {
        const bucket = bySession.get(session.id);
        if (bucket) bucket.hasPrescription = true;
      }
    }

    for (const raw of (snapRes.data ?? []) as Array<{ session_id: string }>) {
      const bucket = bySession.get(raw.session_id);
      if (bucket) bucket.hasSnapshots = true;
    }

    for (const raw of (transcriptRes.data ?? []) as Array<{
      consultation_session_id: string;
      status: unknown;
    }>) {
      const next = asTranscriptStatus(raw.status);
      transcriptBySession.set(
        raw.consultation_session_id,
        pickBetterStatus(transcriptBySession.get(raw.consultation_session_id) ?? null, next),
      );
    }
  }

  const items: ConsultTimelineEntry[] = sessions.map((session) => ({
    sessionId: session.id,
    appointmentId: session.appointment_id,
    consultedAt:
      session.actual_started_at ??
      session.scheduled_start_at ??
      session.actual_ended_at ??
      new Date(0).toISOString(),
    modality: session.modality,
    durationSeconds: durationSeconds(session.actual_started_at, session.actual_ended_at),
    artifacts: bySession.get(session.id) ?? emptyArtifacts(),
    transcriptStatus: transcriptBySession.get(session.id) ?? null,
  }));

  logger.info(
    {
      correlationId: input.correlationId,
      doctorId: input.doctorId,
      patientId: input.patientId,
      sessionCount: items.length,
      offset,
      limit,
    },
    'patient-consult-timeline: listed',
  );

  return {
    items,
    hasMore: sessions.length === limit,
  };
}
