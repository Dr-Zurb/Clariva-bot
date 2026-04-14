/**
 * ARM-06: Durable pending staff service-review queue + resolution (service role).
 *
 * Workers and authenticated doctor APIs use this layer; DB access via admin client (RLS enforced
 * for JWT-based clients; backend uses service_role).
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { formatStaffReviewResolvedContinueBookingDm } from '../utils/staff-service-review-dm';
import {
  applyFinalCatalogServiceSelection,
  applyStaffReviewGateCancellationToConversationState,
  ConversationState,
  SERVICE_CATALOG_MATCH_REASON_CODES,
  ServiceCatalogMatchConfidence,
} from '../types/conversation';
import {
  findConversationById,
  getConversationState,
  updateConversationState,
} from './conversation-service';
import { getInstagramAccessTokenForDoctor } from './instagram-connect-service';
import { sendInstagramMessage } from './instagram-service';
import { createMessage } from './message-service';
import { getDoctorSettings, setMatcherHintsOnDoctorCatalogOffering } from './doctor-settings-service';
import { findServiceOfferingByKey, getActiveServiceCatalog } from '../utils/service-catalog-helpers';
import { handleSupabaseError } from '../utils/db-helpers';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '../utils/errors';
import { buildBookingPageUrl } from './slot-selection-service';
import { ingestServiceMatchLearningExample } from './service-match-learning-ingest';
import { recordShadowEvaluationForNewPendingReview } from './service-match-learning-shadow';
import { fetchAssistHintForReviewRow, type ServiceMatchAssistHint } from './service-match-learning-assist';

export type ServiceStaffReviewStatus =
  | 'pending'
  | 'confirmed'
  | 'reassigned'
  | 'cancelled_by_staff'
  | 'cancelled_timeout';

export interface ServiceStaffReviewRequestRow {
  id: string;
  doctor_id: string;
  conversation_id: string;
  patient_id: string | null;
  correlation_id: string | null;
  status: ServiceStaffReviewStatus;
  proposed_catalog_service_key: string;
  proposed_catalog_service_id: string | null;
  proposed_consultation_modality: 'text' | 'voice' | 'video' | null;
  match_confidence: ServiceCatalogMatchConfidence;
  match_reason_codes: unknown;
  candidate_labels: unknown;
  sla_deadline_at: string | null;
  sla_breached_at: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  final_catalog_service_key: string | null;
  final_catalog_service_id: string | null;
  final_consultation_modality: 'text' | 'voice' | 'video' | null;
  resolution_internal_note: string | null;
  sla_timeout_notified_at?: string | null;
}

export interface StaffReviewTimeoutJobResult {
  closed: number;
  notifySent: number;
  notifySkippedNonIg: number;
  notifySkippedNoConversation: number;
  notifyFailedNoToken: number;
  notifyFailedSend: number;
  phase2NotifyAttempts: number;
}

const NOTE_MAX = 2000;

function trimNote(note?: string | null): string | undefined {
  if (note == null || !String(note).trim()) return undefined;
  return String(note).trim().slice(0, NOTE_MAX);
}

function asJsonArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  return [];
}

async function insertAuditEvent(params: {
  reviewRequestId: string;
  eventType: 'created' | 'confirmed' | 'reassigned' | 'cancelled_by_staff' | 'cancelled_timeout';
  actorUserId: string | null;
  metadata: Record<string, unknown>;
  correlationId: string;
}): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');
  const { error } = await admin.from('service_staff_review_audit_events').insert({
    review_request_id: params.reviewRequestId,
    event_type: params.eventType,
    actor_user_id: params.actorUserId,
    metadata: params.metadata,
    correlation_id: params.correlationId,
  });
  if (error) handleSupabaseError(error, params.correlationId);
}

function mergeSlotStepAfterStaffResolution(state: ConversationState): ConversationState {
  if (state.step === 'awaiting_staff_service_confirmation') {
    return { ...state, step: 'awaiting_slot_selection' };
  }
  return state;
}

/**
 * Worker: ensure one pending review row per conversation (idempotent).
 */
export async function upsertPendingStaffServiceReviewRequest(params: {
  doctorId: string;
  conversationId: string;
  patientId?: string | null;
  correlationId: string;
  state: ConversationState;
  candidateLabels?: Array<{ service_key: string; label: string }>;
}): Promise<{ id: string }> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const key = params.state.matcherProposedCatalogServiceKey?.trim();
  if (!key) {
    throw new InternalError('upsertPendingStaffServiceReviewRequest: missing matcherProposedCatalogServiceKey');
  }

  const confidence = params.state.serviceCatalogMatchConfidence ?? 'medium';
  const proposedId = params.state.matcherProposedCatalogServiceId?.trim();
  const modality = params.state.matcherProposedConsultationModality;

  const { data: existing, error: selErr } = await admin
    .from('service_staff_review_requests')
    .select('id, status')
    .eq('conversation_id', params.conversationId)
    .eq('status', 'pending')
    .maybeSingle();

  if (selErr) handleSupabaseError(selErr, params.correlationId);
  if (existing?.id) {
    logger.info(
      {
        correlationId: params.correlationId,
        serviceStaffReviewRequestId: existing.id,
        conversationId: params.conversationId,
      },
      'service_staff_review_pending_exists'
    );
    return { id: existing.id as string };
  }

  const insertPayload = {
    doctor_id: params.doctorId,
    conversation_id: params.conversationId,
    patient_id: params.patientId ?? null,
    correlation_id: params.correlationId,
    status: 'pending' as const,
    proposed_catalog_service_key: key.toLowerCase(),
    proposed_catalog_service_id: proposedId || null,
    proposed_consultation_modality: modality ?? null,
    match_confidence: confidence,
    match_reason_codes: asJsonArray(params.state.serviceCatalogMatchReasonCodes),
    candidate_labels: (() => {
      if (params.candidateLabels?.length) return params.candidateLabels;
      if (params.state.matcherCandidateLabels?.length) return params.state.matcherCandidateLabels;
      return [];
    })(),
    sla_deadline_at: new Date(Date.now() + 30 * 60_000).toISOString(),
  };

  const { data: created, error: insErr } = await admin
    .from('service_staff_review_requests')
    .insert(insertPayload)
    .select('id')
    .single();

  if (insErr) {
    if ((insErr as { code?: string }).code === '23505') {
      const { data: again, error: againErr } = await admin
        .from('service_staff_review_requests')
        .select('id')
        .eq('conversation_id', params.conversationId)
        .eq('status', 'pending')
        .maybeSingle();
      if (againErr) handleSupabaseError(againErr, params.correlationId);
      if (again?.id) {
        return { id: again.id as string };
      }
    }
    handleSupabaseError(insErr, params.correlationId);
  }

  if (!created?.id) throw new InternalError('service_staff_review insert returned no id');

  await insertAuditEvent({
    reviewRequestId: created.id as string,
    eventType: 'created',
    actorUserId: null,
    metadata: { correlation_id: params.correlationId, conversation_id: params.conversationId },
    correlationId: params.correlationId,
  });

  logger.info(
    {
      correlationId: params.correlationId,
      serviceStaffReviewRequestId: created.id,
      conversationId: params.conversationId,
    },
    'service_staff_review_created'
  );

  try {
    await recordShadowEvaluationForNewPendingReview({
      doctorId: params.doctorId,
      conversationId: params.conversationId,
      reviewRequestId: created.id as string,
      state: params.state,
      candidateLabels: params.candidateLabels,
      correlationId: params.correlationId,
    });
  } catch (e) {
    logger.warn(
      {
        correlationId: params.correlationId,
        err: e instanceof Error ? e.message : String(e),
      },
      'service_match_shadow_record_failed'
    );
  }

  return { id: created.id as string };
}

export async function listPendingServiceStaffReviewRequestsForDoctor(
  doctorId: string,
  correlationId: string,
  status: ServiceStaffReviewStatus | ServiceStaffReviewStatus[] = 'pending'
): Promise<ServiceStaffReviewRequestRow[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const statuses = Array.isArray(status) ? status : [status];
  const pendingOnly = statuses.length === 1 && statuses[0] === 'pending';

  let q = admin
    .from('service_staff_review_requests')
    .select('*')
    .eq('doctor_id', doctorId)
    .in('status', statuses);
  q = pendingOnly
    ? q.order('created_at', { ascending: true })
    : q.order('resolved_at', { ascending: false });

  const { data, error } = await q;

  if (error) handleSupabaseError(error, correlationId);
  return (data ?? []) as ServiceStaffReviewRequestRow[];
}

/** ARM-07: list row + safe previews for doctor inbox (name + truncated reason from authorized stores). */
export interface ServiceStaffReviewListItem extends ServiceStaffReviewRequestRow {
  patient_display_name: string | null;
  reason_for_visit_preview: string | null;
  /** learn-05: prior-resolution hints for inbox assist (pending tab only; null when no data). */
  assist_hint?: ServiceMatchAssistHint | null;
}

const REASON_PREVIEW_MAX = 120;

function truncateReasonPreview(raw: unknown, max = REASON_PREVIEW_MAX): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const t = raw.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export async function listEnrichedServiceStaffReviewsForDoctor(
  doctorId: string,
  correlationId: string,
  status: ServiceStaffReviewStatus | ServiceStaffReviewStatus[] = 'pending'
): Promise<ServiceStaffReviewListItem[]> {
  const rows = await listPendingServiceStaffReviewRequestsForDoctor(doctorId, correlationId, status);
  if (rows.length === 0) return [];

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const patientIds = [
    ...new Set(rows.map((r) => r.patient_id).filter((id): id is string => Boolean(id))),
  ];
  const convIds = [...new Set(rows.map((r) => r.conversation_id))];

  // patients table has no doctor_id; scope via conversations (doctor_id + patient_id).
  const patientMap = new Map<string, string>();
  const reasonMap = new Map<string, string | null>();
  if (convIds.length > 0) {
    const { data: convs, error: cErr } = await admin
      .from('conversations')
      .select('id,metadata,patient_id')
      .eq('doctor_id', doctorId)
      .in('id', convIds);
    if (cErr) handleSupabaseError(cErr, correlationId);
    const patientIdsForDoctor = new Set<string>();
    for (const c of convs ?? []) {
      const row = c as { id: string; metadata: unknown; patient_id: string };
      patientIdsForDoctor.add(row.patient_id);
      const meta =
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as ConversationState)
          : null;
      reasonMap.set(row.id, truncateReasonPreview(meta?.reasonForVisit));
    }
    const safePatientIds = patientIds.filter((id) => patientIdsForDoctor.has(id));
    if (safePatientIds.length > 0) {
      const { data: patients, error: pErr } = await admin
        .from('patients')
        .select('id,name')
        .in('id', safePatientIds);
      if (pErr) handleSupabaseError(pErr, correlationId);
      for (const p of patients ?? []) {
        const pr = p as { id: string; name: string | null };
        if (pr.name?.trim()) patientMap.set(pr.id, pr.name.trim());
      }
    }
  }

  const pendingOnly =
    Array.isArray(status) && status.length === 1 && status[0] === 'pending'
      ? true
      : !Array.isArray(status) && status === 'pending';

  const settings = pendingOnly ? await getDoctorSettings(doctorId) : null;
  const catalog = settings ? getActiveServiceCatalog(settings) : null;
  const catalogLabelByKey = new Map<string, string>();
  if (catalog?.services?.length) {
    for (const s of catalog.services) {
      const k = s.service_key.trim().toLowerCase();
      catalogLabelByKey.set(k, s.label?.trim() || k);
    }
  }

  return Promise.all(
    rows.map(async (r) => {
      const base: ServiceStaffReviewListItem = {
        ...r,
        patient_display_name: r.patient_id ? patientMap.get(r.patient_id) ?? null : null,
        reason_for_visit_preview: reasonMap.get(r.conversation_id) ?? null,
      };
      if (!pendingOnly) {
        return { ...base, assist_hint: null };
      }
      const assist_hint = await fetchAssistHintForReviewRow({
        row: r,
        doctorId,
        correlationId,
        catalogLabelByKey,
      });
      return { ...base, assist_hint };
    })
  );
}

/**
 * Instagram: booking link DM after staff confirms or reassigns visit type (best-effort; DB update already succeeded).
 */
export async function sendInstagramBookingLinkAfterStaffReviewResolution(params: {
  doctorId: string;
  conversationId: string;
  correlationId: string;
  finalCatalogServiceKey: string;
  kind: 'confirmed' | 'reassigned' | 'learning_policy_autobook';
}): Promise<void> {
  const conv = await findConversationById(params.conversationId, params.correlationId);
  if (!conv || conv.platform !== 'instagram') {
    logger.info(
      { correlationId: params.correlationId, conversationId: params.conversationId },
      'staff_review_resolution_skip_dm_non_ig'
    );
    return;
  }
  const recipientId = conv.platform_conversation_id?.trim();
  if (!recipientId) {
    logger.warn(
      { correlationId: params.correlationId, conversationId: params.conversationId },
      'staff_review_resolution_skip_dm_no_recipient'
    );
    return;
  }

  const igToken = await getInstagramAccessTokenForDoctor(params.doctorId, params.correlationId);
  if (!igToken?.trim()) {
    logger.warn(
      { correlationId: params.correlationId, doctorId: params.doctorId },
      'staff_review_resolution_dm_no_ig_token'
    );
    return;
  }

  const settings = await getDoctorSettings(params.doctorId);
  const catalog = settings ? getActiveServiceCatalog(settings) : null;
  const offering = catalog ? findServiceOfferingByKey(catalog, params.finalCatalogServiceKey) : null;
  const visitLabel = offering?.label?.trim() || params.finalCatalogServiceKey;
  const bookingUrl = buildBookingPageUrl(params.conversationId, params.doctorId);
  const text = formatStaffReviewResolvedContinueBookingDm(
    settings,
    visitLabel,
    bookingUrl,
    params.kind
  );

  try {
    const res = await sendInstagramMessage(recipientId, text, params.correlationId, igToken.trim());
    await createMessage(
      {
        conversation_id: params.conversationId,
        platform_message_id: res.message_id,
        sender_type: 'system',
        content: text,
      },
      params.correlationId
    );
  } catch (e) {
    logger.warn(
      {
        correlationId: params.correlationId,
        err: e instanceof Error ? e.message : String(e),
      },
      'staff_review_resolution_dm_failed'
    );
  }
}

export async function getServiceStaffReviewRequestForDoctor(
  reviewId: string,
  doctorId: string,
  correlationId: string
): Promise<ServiceStaffReviewRequestRow> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data, error } = await admin
    .from('service_staff_review_requests')
    .select('*')
    .eq('id', reviewId)
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) handleSupabaseError(error, correlationId);
  if (!data) throw new NotFoundError('Service review request not found');
  return data as ServiceStaffReviewRequestRow;
}

export async function confirmServiceStaffReviewRequest(params: {
  doctorId: string;
  actorUserId: string;
  reviewId: string;
  correlationId: string;
  note?: string;
}): Promise<ServiceStaffReviewRequestRow> {
  const row = await getServiceStaffReviewRequestForDoctor(params.reviewId, params.doctorId, params.correlationId);
  if (row.status !== 'pending') {
    throw new ConflictError('Review request is not pending');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const now = new Date().toISOString();
  const note = trimNote(params.note);

  const { data: updated, error } = await admin
    .from('service_staff_review_requests')
    .update({
      status: 'confirmed',
      resolved_at: now,
      resolved_by_user_id: params.actorUserId,
      final_catalog_service_key: row.proposed_catalog_service_key,
      final_catalog_service_id: row.proposed_catalog_service_id,
      final_consultation_modality: row.proposed_consultation_modality,
      resolution_internal_note: note ?? null,
    })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('*')
    .single();

  if (error) handleSupabaseError(error, params.correlationId);
  if (!updated) throw new ConflictError('Could not confirm review (state changed?)');

  await insertAuditEvent({
    reviewRequestId: row.id,
    eventType: 'confirmed',
    actorUserId: params.actorUserId,
    metadata: {
      proposed_catalog_service_key: row.proposed_catalog_service_key,
      final_catalog_service_key: row.proposed_catalog_service_key,
      resolution_internal_note: note ?? null,
    },
    correlationId: params.correlationId,
  });

  const convState = await getConversationState(row.conversation_id, params.correlationId);
  let nextState = applyFinalCatalogServiceSelection(convState, {
    catalogServiceKey: row.proposed_catalog_service_key,
    catalogServiceId: row.proposed_catalog_service_id ?? undefined,
    consultationModality: row.proposed_consultation_modality ?? undefined,
    clearProposal: true,
    reasonCodesAppend: [SERVICE_CATALOG_MATCH_REASON_CODES.STAFF_CONFIRMED_PROPOSAL],
  });
  nextState = mergeSlotStepAfterStaffResolution(nextState);
  await updateConversationState(row.conversation_id, nextState, params.correlationId);

  await ingestServiceMatchLearningExample({
    row: updated as ServiceStaffReviewRequestRow,
    conversationStateAfterResolution: nextState,
    action: 'confirmed',
    correlationId: params.correlationId,
  });

  await sendInstagramBookingLinkAfterStaffReviewResolution({
    doctorId: params.doctorId,
    conversationId: row.conversation_id,
    correlationId: params.correlationId,
    finalCatalogServiceKey: row.proposed_catalog_service_key,
    kind: 'confirmed',
  });

  return updated as ServiceStaffReviewRequestRow;
}

export async function reassignServiceStaffReviewRequest(params: {
  doctorId: string;
  actorUserId: string;
  reviewId: string;
  correlationId: string;
  catalogServiceKey: string;
  catalogServiceId?: string;
  consultationModality?: 'text' | 'voice' | 'video';
  matcherHints: { keywords: string; include_when: string; exclude_when: string };
}): Promise<ServiceStaffReviewRequestRow> {
  const row = await getServiceStaffReviewRequestForDoctor(params.reviewId, params.doctorId, params.correlationId);
  if (row.status !== 'pending') {
    throw new ConflictError('Review request is not pending');
  }

  const settings = await getDoctorSettings(params.doctorId);
  const catalog = settings ? getActiveServiceCatalog(settings) : null;
  if (!catalog) {
    throw new ValidationError('Practice has no service catalog');
  }
  const offering = findServiceOfferingByKey(catalog, params.catalogServiceKey);
  if (!offering) {
    throw new ValidationError('catalogServiceKey is not in this practice catalog');
  }

  if (params.catalogServiceId?.trim()) {
    const want = params.catalogServiceId.trim().toLowerCase();
    if (want !== offering.service_id.trim().toLowerCase()) {
      throw new ValidationError('catalogServiceId does not match the selected catalogServiceKey');
    }
  }

  const catalogHintsUpdated = await setMatcherHintsOnDoctorCatalogOffering(
    params.doctorId,
    params.correlationId,
    offering.service_key,
    params.matcherHints
  );

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const now = new Date().toISOString();
  const modality = params.consultationModality ?? undefined;

  const { data: updated, error } = await admin
    .from('service_staff_review_requests')
    .update({
      status: 'reassigned',
      resolved_at: now,
      resolved_by_user_id: params.actorUserId,
      final_catalog_service_key: offering.service_key,
      final_catalog_service_id: offering.service_id,
      final_consultation_modality: modality ?? null,
      resolution_internal_note: null,
    })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('*')
    .single();

  if (error) handleSupabaseError(error, params.correlationId);
  if (!updated) throw new ConflictError('Could not reassign review (state changed?)');

  await insertAuditEvent({
    reviewRequestId: row.id,
    eventType: 'reassigned',
    actorUserId: params.actorUserId,
    metadata: {
      proposed_catalog_service_key: row.proposed_catalog_service_key,
      final_catalog_service_key: offering.service_key,
      final_catalog_service_id: offering.service_id,
      final_consultation_modality: modality ?? null,
      ...(catalogHintsUpdated ? { catalog_matcher_hints_updated: true } : {}),
    },
    correlationId: params.correlationId,
  });

  const convState = await getConversationState(row.conversation_id, params.correlationId);
  let nextState = applyFinalCatalogServiceSelection(convState, {
    catalogServiceKey: offering.service_key,
    catalogServiceId: offering.service_id,
    consultationModality: modality,
    clearProposal: true,
    reasonCodesAppend: [SERVICE_CATALOG_MATCH_REASON_CODES.STAFF_REASSIGNED_SERVICE],
  });
  nextState = mergeSlotStepAfterStaffResolution(nextState);
  await updateConversationState(row.conversation_id, nextState, params.correlationId);

  await ingestServiceMatchLearningExample({
    row: updated as ServiceStaffReviewRequestRow,
    conversationStateAfterResolution: nextState,
    action: 'reassigned',
    correlationId: params.correlationId,
  });

  await sendInstagramBookingLinkAfterStaffReviewResolution({
    doctorId: params.doctorId,
    conversationId: row.conversation_id,
    correlationId: params.correlationId,
    finalCatalogServiceKey: offering.service_key,
    kind: 'reassigned',
  });

  return updated as ServiceStaffReviewRequestRow;
}

export async function cancelServiceStaffReviewRequestByStaff(params: {
  doctorId: string;
  actorUserId: string;
  reviewId: string;
  correlationId: string;
  note?: string;
}): Promise<ServiceStaffReviewRequestRow> {
  const row = await getServiceStaffReviewRequestForDoctor(params.reviewId, params.doctorId, params.correlationId);
  if (row.status !== 'pending') {
    throw new ConflictError('Review request is not pending');
  }

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const now = new Date().toISOString();
  const note = trimNote(params.note);

  const { data: updated, error } = await admin
    .from('service_staff_review_requests')
    .update({
      status: 'cancelled_by_staff',
      resolved_at: now,
      resolved_by_user_id: params.actorUserId,
      resolution_internal_note: note ?? null,
    })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('*')
    .single();

  if (error) handleSupabaseError(error, params.correlationId);
  if (!updated) throw new ConflictError('Could not cancel review (state changed?)');

  await insertAuditEvent({
    reviewRequestId: row.id,
    eventType: 'cancelled_by_staff',
    actorUserId: params.actorUserId,
    metadata: {
      proposed_catalog_service_key: row.proposed_catalog_service_key,
      resolution_internal_note: note ?? null,
    },
    correlationId: params.correlationId,
  });

  const convState = await getConversationState(row.conversation_id, params.correlationId);
  const nextState = applyStaffReviewGateCancellationToConversationState(
    convState,
    SERVICE_CATALOG_MATCH_REASON_CODES.STAFF_REVIEW_CANCELLED_BY_STAFF
  );
  await updateConversationState(row.conversation_id, nextState, params.correlationId);

  return updated as ServiceStaffReviewRequestRow;
}

/**
 * SLA timeout: find pending reviews past sla_deadline_at, mark sla_breached_at, notify patient + staff.
 */
export async function runStaffReviewTimeoutJob(correlationId: string): Promise<StaffReviewTimeoutJobResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { closed: 0, notifySent: 0, notifySkippedNonIg: 0, notifySkippedNoConversation: 0, notifyFailedNoToken: 0, notifyFailedSend: 0, phase2NotifyAttempts: 0 };

  const { data: rows, error } = await admin
    .from('service_staff_review_requests')
    .select('id, doctor_id, conversation_id, proposed_catalog_service_key')
    .eq('status', 'pending')
    .not('sla_deadline_at', 'is', null)
    .is('sla_breached_at', null)
    .lt('sla_deadline_at', new Date().toISOString())
    .limit(50);

  if (error || !rows?.length) {
    if (error) logger.warn({ correlationId, err: error }, 'Staff review timeout query failed');
    return { closed: 0, notifySent: 0, notifySkippedNonIg: 0, notifySkippedNoConversation: 0, notifyFailedNoToken: 0, notifyFailedSend: 0, phase2NotifyAttempts: 0 };
  }

  let notifySent = 0;
  let notifySkippedNonIg = 0;
  let notifySkippedNoConversation = 0;
  let notifyFailedNoToken = 0;
  let notifyFailedSend = 0;

  for (const row of rows) {
    const r = row as { id: string; doctor_id: string; conversation_id: string; proposed_catalog_service_key: string | null };
    // Mark breached first (idempotent guard).
    await admin
      .from('service_staff_review_requests')
      .update({ sla_breached_at: new Date().toISOString() })
      .eq('id', r.id);

    if (!r.conversation_id) { notifySkippedNoConversation++; continue; }
    const conv = await findConversationById(r.conversation_id, correlationId);
    if (!conv) { notifySkippedNoConversation++; continue; }
    if (conv.platform !== 'instagram') { notifySkippedNonIg++; continue; }

    const token = await getInstagramAccessTokenForDoctor(r.doctor_id, correlationId);
    if (!token) { notifyFailedNoToken++; continue; }

    try {
      const ack = "Our team hasn't responded to your booking review yet — we're following up now. You can also try again later or ask to book.";
      await sendInstagramMessage(conv.platform_conversation_id, ack, correlationId, token);
      notifySent++;
    } catch (e) {
      logger.warn({ err: e, correlationId, reviewId: r.id }, 'Staff review timeout DM failed');
      notifyFailedSend++;
    }
  }

  return { closed: rows.length, notifySent, notifySkippedNonIg, notifySkippedNoConversation, notifyFailedNoToken, notifyFailedSend, phase2NotifyAttempts: 0 };
}

/**
 * ARM-08: idempotent timeout closer (cron / worker). Returns count of rows transitioned this tick.
 */
export async function closeTimedOutServiceStaffReviewRequests(correlationId: string): Promise<number> {
  const r = await runStaffReviewTimeoutJob(correlationId);
  return r.closed;
}
