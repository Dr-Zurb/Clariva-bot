/**
 * ARM-06: Durable pending staff service-review queue + resolution (service role).
 *
 * Workers and authenticated doctor APIs use this layer; DB access via admin client (RLS enforced
 * for JWT-based clients; backend uses service_role).
 */

import { getSupabaseAdminClient } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { formatStaffServiceReviewSlaTimeoutDm } from '../utils/staff-service-review-dm';
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
import { getDoctorSettings } from './doctor-settings-service';
import { findServiceOfferingByKey, getActiveServiceCatalog } from '../utils/service-catalog-helpers';
import { handleSupabaseError } from '../utils/db-helpers';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '../utils/errors';

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
  sla_deadline_at: string;
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

export type StaffReviewTimeoutNotifyOutcome =
  | 'sent'
  | 'skipped_non_ig'
  | 'skipped_no_conversation'
  | 'failed_no_token'
  | 'failed_send';

export interface StaffReviewTimeoutJobResult {
  closed: number;
  notifySent: number;
  notifySkippedNonIg: number;
  notifySkippedNoConversation: number;
  notifyFailedNoToken: number;
  notifyFailedSend: number;
  phase2NotifyAttempts: number;
}

async function markStaffReviewSlaTimeoutNotified(
  reviewRequestId: string,
  correlationId: string
): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from('service_staff_review_requests')
    .update({ sla_timeout_notified_at: nowIso })
    .eq('id', reviewRequestId)
    .is('sla_timeout_notified_at', null)
    .select('id')
    .maybeSingle();

  if (error) handleSupabaseError(error, correlationId);
  return !!data?.id;
}

/**
 * ARM-08: one proactive Instagram DM when SLA timed out (or mark N/A for non-Instagram / missing channel).
 * Does not transition row status (expects caller already set cancelled_timeout).
 */
async function deliverStaffReviewTimeoutPatientNotify(
  params: { reviewRequestId: string; conversationId: string; doctorId: string },
  correlationId: string
): Promise<StaffReviewTimeoutNotifyOutcome> {
  const conv = await findConversationById(params.conversationId, correlationId);
  if (!conv) {
    await markStaffReviewSlaTimeoutNotified(params.reviewRequestId, correlationId);
    return 'skipped_no_conversation';
  }
  if (conv.platform !== 'instagram') {
    await markStaffReviewSlaTimeoutNotified(params.reviewRequestId, correlationId);
    return 'skipped_non_ig';
  }
  const recipientId = conv.platform_conversation_id?.trim();
  if (!recipientId) {
    await markStaffReviewSlaTimeoutNotified(params.reviewRequestId, correlationId);
    return 'skipped_no_conversation';
  }

  const token = await getInstagramAccessTokenForDoctor(params.doctorId, correlationId);
  if (!token?.trim()) {
    logger.warn(
      { correlationId, reviewRequestId: params.reviewRequestId, doctorId: params.doctorId },
      'staff_review_timeout_notify_failed_no_token'
    );
    return 'failed_no_token';
  }

  const settings = await getDoctorSettings(params.doctorId);
  const text = formatStaffServiceReviewSlaTimeoutDm(settings);

  try {
    const res = await sendInstagramMessage(recipientId, text, correlationId, token.trim());
    await markStaffReviewSlaTimeoutNotified(params.reviewRequestId, correlationId);
    try {
      await createMessage(
        {
          conversation_id: params.conversationId,
          platform_message_id: res.message_id,
          sender_type: 'system',
          content: text,
        },
        correlationId
      );
    } catch (e) {
      logger.warn(
        { correlationId, reviewRequestId: params.reviewRequestId, err: e },
        'staff_review_timeout_notify_message_persist_failed'
      );
    }
    return 'sent';
  } catch (e) {
    logger.warn(
      {
        correlationId,
        reviewRequestId: params.reviewRequestId,
        err: e instanceof Error ? e.message : String(e),
      },
      'staff_review_timeout_notify_send_failed'
    );
    return 'failed_send';
  }
}

function accumulateStaffReviewNotifyMetrics(
  result: StaffReviewTimeoutJobResult,
  outcome: StaffReviewTimeoutNotifyOutcome
): void {
  switch (outcome) {
    case 'sent':
      result.notifySent += 1;
      break;
    case 'skipped_non_ig':
      result.notifySkippedNonIg += 1;
      break;
    case 'skipped_no_conversation':
      result.notifySkippedNoConversation += 1;
      break;
    case 'failed_no_token':
      result.notifyFailedNoToken += 1;
      break;
    case 'failed_send':
      result.notifyFailedSend += 1;
      break;
    default:
      break;
  }
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
  slaDeadlineIso: string;
  candidateLabels?: Array<{ service_key: string; label: string }>;
}): Promise<{ id: string; slaDeadlineIso: string }> {
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
    .select('id, sla_deadline_at, status')
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
    return { id: existing.id as string, slaDeadlineIso: existing.sla_deadline_at as string };
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
    candidate_labels: params.candidateLabels?.length ? params.candidateLabels : [],
    sla_deadline_at: params.slaDeadlineIso,
  };

  const { data: created, error: insErr } = await admin
    .from('service_staff_review_requests')
    .insert(insertPayload)
    .select('id, sla_deadline_at')
    .single();

  if (insErr) {
    if ((insErr as { code?: string }).code === '23505') {
      const { data: again, error: againErr } = await admin
        .from('service_staff_review_requests')
        .select('id, sla_deadline_at')
        .eq('conversation_id', params.conversationId)
        .eq('status', 'pending')
        .maybeSingle();
      if (againErr) handleSupabaseError(againErr, params.correlationId);
      if (again?.id) {
        return { id: again.id as string, slaDeadlineIso: again.sla_deadline_at as string };
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

  return { id: created.id as string, slaDeadlineIso: created.sla_deadline_at as string };
}

export async function listPendingServiceStaffReviewRequestsForDoctor(
  doctorId: string,
  correlationId: string,
  status: ServiceStaffReviewStatus = 'pending'
): Promise<ServiceStaffReviewRequestRow[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data, error } = await admin
    .from('service_staff_review_requests')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('status', status)
    .order('sla_deadline_at', { ascending: true });

  if (error) handleSupabaseError(error, correlationId);
  return (data ?? []) as ServiceStaffReviewRequestRow[];
}

/** ARM-07: list row + safe previews for doctor inbox (name + truncated reason from authorized stores). */
export interface ServiceStaffReviewListItem extends ServiceStaffReviewRequestRow {
  patient_display_name: string | null;
  reason_for_visit_preview: string | null;
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
  status: ServiceStaffReviewStatus = 'pending'
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

  return rows.map((r) => ({
    ...r,
    patient_display_name: r.patient_id ? patientMap.get(r.patient_id) ?? null : null,
    reason_for_visit_preview: reasonMap.get(r.conversation_id) ?? null,
  }));
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
  note?: string;
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

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const now = new Date().toISOString();
  const note = trimNote(params.note);
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
      resolution_internal_note: note ?? null,
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
      resolution_internal_note: note ?? null,
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
 * ARM-08: batch timeout closer + patient notify (Instagram), retry-safe across ticks.
 *
 * Phase 1: pending + past SLA → cancelled_timeout, audit, conversation unlock, notify attempt.
 * Phase 2: cancelled_timeout with sla_timeout_notified_at still null → retry notify only (crash recovery).
 */
export async function runStaffReviewTimeoutJob(correlationId: string): Promise<StaffReviewTimeoutJobResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const batch = env.STAFF_REVIEW_TIMEOUT_BATCH_SIZE;
  const nowIso = new Date().toISOString();
  const result: StaffReviewTimeoutJobResult = {
    closed: 0,
    notifySent: 0,
    notifySkippedNonIg: 0,
    notifySkippedNoConversation: 0,
    notifyFailedNoToken: 0,
    notifyFailedSend: 0,
    phase2NotifyAttempts: 0,
  };

  const phase1Ids = new Set<string>();

  const { data: pendingExpired, error: selErr } = await admin
    .from('service_staff_review_requests')
    .select('id, conversation_id, doctor_id, proposed_catalog_service_key')
    .eq('status', 'pending')
    .lt('sla_deadline_at', nowIso)
    .order('sla_deadline_at', { ascending: true })
    .limit(batch);

  if (selErr) handleSupabaseError(selErr, correlationId);

  for (const raw of pendingExpired ?? []) {
    const r = raw as {
      id: string;
      conversation_id: string;
      doctor_id: string;
      proposed_catalog_service_key: string;
    };
    phase1Ids.add(r.id);

    const { data: updated, error: updErr } = await admin
      .from('service_staff_review_requests')
      .update({
        status: 'cancelled_timeout',
        resolved_at: nowIso,
        resolved_by_user_id: null,
      })
      .eq('id', r.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (updErr) handleSupabaseError(updErr, correlationId);
    if (!updated?.id) continue;

    result.closed += 1;
    await insertAuditEvent({
      reviewRequestId: r.id,
      eventType: 'cancelled_timeout',
      actorUserId: null,
      metadata: {
        proposed_catalog_service_key: r.proposed_catalog_service_key,
      },
      correlationId,
    });

    try {
      const convState = await getConversationState(r.conversation_id, correlationId);
      const nextState = applyStaffReviewGateCancellationToConversationState(
        convState,
        SERVICE_CATALOG_MATCH_REASON_CODES.STAFF_REVIEW_TIMED_OUT
      );
      await updateConversationState(r.conversation_id, nextState, correlationId);
    } catch (e) {
      logger.error(
        { correlationId, conversationId: r.conversation_id, reviewId: r.id, err: e },
        'service_staff_review_timeout_conversation_sync_failed'
      );
    }

    const notifyOutcome = await deliverStaffReviewTimeoutPatientNotify(
      {
        reviewRequestId: r.id,
        conversationId: r.conversation_id,
        doctorId: r.doctor_id,
      },
      correlationId
    );
    accumulateStaffReviewNotifyMetrics(result, notifyOutcome);
  }

  const { data: retryRows, error: retryErr } = await admin
    .from('service_staff_review_requests')
    .select('id, conversation_id, doctor_id')
    .eq('status', 'cancelled_timeout')
    .is('sla_timeout_notified_at', null)
    .order('resolved_at', { ascending: true })
    .limit(batch);

  if (retryErr) handleSupabaseError(retryErr, correlationId);

  for (const raw of retryRows ?? []) {
    const r = raw as { id: string; conversation_id: string; doctor_id: string };
    if (phase1Ids.has(r.id)) continue;
    result.phase2NotifyAttempts += 1;
    const notifyOutcome = await deliverStaffReviewTimeoutPatientNotify(
      { reviewRequestId: r.id, conversationId: r.conversation_id, doctorId: r.doctor_id },
      correlationId
    );
    accumulateStaffReviewNotifyMetrics(result, notifyOutcome);
  }

  if (
    result.closed > 0 ||
    result.notifySent > 0 ||
    result.phase2NotifyAttempts > 0 ||
    result.notifyFailedNoToken > 0 ||
    result.notifyFailedSend > 0
  ) {
    logger.info(
      {
        correlationId,
        staff_review_timeout_closed: result.closed,
        staff_review_timeout_notify_sent: result.notifySent,
        staff_review_timeout_notify_skipped_non_ig: result.notifySkippedNonIg,
        staff_review_timeout_notify_skipped_no_conversation: result.notifySkippedNoConversation,
        staff_review_timeout_notify_failed_no_token: result.notifyFailedNoToken,
        staff_review_timeout_notify_failed_send: result.notifyFailedSend,
        staff_review_timeout_phase2_attempts: result.phase2NotifyAttempts,
      },
      'staff_review_timeout_job'
    );
  }

  return result;
}

/**
 * ARM-08: idempotent timeout closer (cron / worker). Returns count of rows transitioned this tick.
 */
export async function closeTimedOutServiceStaffReviewRequests(correlationId: string): Promise<number> {
  const r = await runStaffReviewTimeoutJob(correlationId);
  return r.closed;
}
