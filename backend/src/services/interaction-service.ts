/**
 * Interactions Inbox — doctor-scoped list/detail (ibi-06…ibi-08).
 *
 * Signal predicate (IBI-D3): a conversation is "signal" when it has ≥1 of:
 *   - a linked comment_lead
 *   - an appointment
 *   - any service_staff_review_request
 *   - booking state past greeting (step beyond `responded`, or service-match /
 *     fee-quote / staff-pending markers in metadata)
 * Unlinked comment_leads are always signal (IB4).
 *
 * Fused status (most advanced wins):
 *   paid > booked > needs_review > booking_pending > in_conversation > new_lead
 * `new_lead` = early on the booking path (comment or DM) — not past greeting yet.
 * Channel is a badge, not the definition of "new".
 *
 * Mixed list (IBI-D2): conversations + unlinked comment_leads merged in service.
 * Cursor is opaque `{ updated_at, id }` applied to both sources (leads use created_at).
 *
 * List snippets: one `messages` row per conversation (`limit(1)`), not an unbounded
 * page SELECT — PostgREST max-rows would otherwise drop quieter threads' snippets.
 *
 * All rail vs Needs review: pending staff-review rows are omitted from the unfiltered
 * list and from `counts.all` (pinned Needs review lane owns them). Explicit
 * `status` / `statuses` filters still return `needs_review` when requested.
 *
 * PHI: never log patient names, phones, message snippets, or comment_text.
 */

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { readConversationState } from '../types/conversation-state-io';
import type { ConversationState } from '../types/conversation';
import type { AppointmentStatus, ConversationPlatform } from '../types/database';
import { InternalError, NotFoundError } from '../utils/errors';
import { handleSupabaseError } from '../utils/db-helpers';
import { logDataAccess } from '../utils/audit-logger';
import { getCachedPlatformAvatars } from './platform-avatar-cache';

export type InteractionKind = 'conversation' | 'comment_lead';

export type InteractionFusedStatus =
  | 'new_lead'
  | 'in_conversation'
  | 'needs_review'
  | 'booking_pending'
  | 'booked'
  | 'paid'
  | 'cancelled'
  | 'no_show';

export type InteractionScope = 'signal' | 'all';

export type InteractionTimelineStepType =
  | 'comment_captured'
  | 'first_dm'
  | 'booking_started'
  | 'slot_selected'
  | 'needs_review'
  | 'booked'
  | 'paid'
  | 'rescheduled';

export interface InteractionTimelineStep {
  type: InteractionTimelineStepType;
  at: string;
  comment_lead_id?: string;
  conversation_id?: string;
  appointment_id?: string;
  review_id?: string;
}

/** Funnel rail counts within the current channel/date/scope window (before status filter). */
export type InteractionStageCounts = {
  all: number;
  new_lead: number;
  in_conversation: number;
  booking_pending: number;
  booked: number;
  paid: number;
  cancelled: number;
  needs_review: number;
};

/** Lifecycle stages shown in the Inbox funnel (excludes no_show — post-appointment). */
export const INBOX_FUNNEL_STATUSES = [
  'new_lead',
  'in_conversation',
  'booking_pending',
  'booked',
  'paid',
  'cancelled',
] as const satisfies readonly InteractionFusedStatus[];

export interface InteractionListItem {
  id: string;
  kind: InteractionKind;
  channel: ConversationPlatform;
  /** Conversation chatter patient (IG/FB placeholder or registered). */
  patient_id: string | null;
  patient_display_name: string | null;
  medical_record_number: string | null;
  /** Pre-MRN label, e.g. "Instagram lead" / "Facebook chat" (no opaque user ids). */
  lead_label: string;
  last_message_snippet: string | null;
  status: InteractionFusedStatus;
  has_comment_lead: boolean;
  needs_review: boolean;
  appointment_id: string | null;
  /**
   * Patient the latest appointment is for (may differ from `patient_id` when
   * booking for a family member). Null when no appointment.
   */
  appointment_patient_id: string | null;
  appointment_patient_display_name: string | null;
  appointment_patient_mrn: string | null;
  platform_external_id: string | null;
  /** Public @handle / display name from Meta (for profile deep links). */
  platform_username: string | null;
  /** Cached Meta profile_pic CDN URL (may be null / expired). */
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Doctor-facing profile links for an interaction.
 * - Chatter profile only when registered (MRN).
 * - Separate "booked for" when the appointment patient ≠ the IG/FB chatter.
 */
export function resolveInteractionProfileLinks(item: {
  patient_id: string | null;
  medical_record_number: string | null;
  appointment_patient_id: string | null;
  appointment_patient_display_name: string | null;
  appointment_patient_mrn: string | null;
}): {
  chatterProfilePatientId: string | null;
  bookedForPatientId: string | null;
  bookedForLabel: string | null;
} {
  const chatterMrn = item.medical_record_number?.trim() || null;
  const chatterProfilePatientId =
    item.patient_id && chatterMrn ? item.patient_id : null;

  const aptPid = item.appointment_patient_id?.trim() || null;
  const bookedForSomeoneElse = Boolean(
    aptPid && (!item.patient_id || aptPid !== item.patient_id)
  );

  if (!bookedForSomeoneElse) {
    return {
      chatterProfilePatientId,
      bookedForPatientId: null,
      bookedForLabel: null,
    };
  }

  const name = item.appointment_patient_display_name?.trim() || null;
  const mrn = item.appointment_patient_mrn?.trim() || null;
  const bookedForLabel = name || mrn || 'Patient';

  return {
    chatterProfilePatientId,
    bookedForPatientId: aptPid,
    bookedForLabel,
  };
}

export interface InteractionDetail extends InteractionListItem {
  timeline: InteractionTimelineStep[];
  /** Full comment body when kind=comment_lead (doctor-facing; never log). */
  comment_text?: string | null;
}

export interface ListInteractionsQuery {
  scope?: InteractionScope;
  channel?: ConversationPlatform;
  /** Single status (legacy) or multi via `statuses`. */
  status?: InteractionFusedStatus;
  /** Multi-select lifecycle statuses (ibi-12). */
  statuses?: InteractionFusedStatus[];
  /** Inclusive lower bound on activity time (ISO). Conversations: updated_at; leads: created_at. */
  dateFrom?: string;
  /** Inclusive upper bound on activity time (ISO). */
  dateTo?: string;
  cursor?: string;
  limit?: number;
  /**
   * When false, skip the full-window stage scan (polls / load-more).
   * Default: true when no cursor; always skipped when a list cursor is present.
   */
  includeCounts?: boolean;
}

export interface ListInteractionsResult {
  interactions: InteractionListItem[];
  nextCursor: string | null;
  /** Null when the stage scan was skipped (`includeCounts=false` or paginating). */
  counts: InteractionStageCounts | null;
}

export function emptyInteractionStageCounts(): InteractionStageCounts {
  return {
    all: 0,
    new_lead: 0,
    in_conversation: 0,
    booking_pending: 0,
    booked: 0,
    paid: 0,
    cancelled: 0,
    needs_review: 0,
  };
}

export function countInteractionStages(
  items: ReadonlyArray<{ status: InteractionFusedStatus }>
): InteractionStageCounts {
  const counts = emptyInteractionStageCounts();
  counts.all = items.length;
  for (const item of items) {
    switch (item.status) {
      case 'new_lead':
        counts.new_lead += 1;
        break;
      case 'in_conversation':
        counts.in_conversation += 1;
        break;
      case 'booking_pending':
        counts.booking_pending += 1;
        break;
      case 'booked':
        counts.booked += 1;
        break;
      case 'paid':
        counts.paid += 1;
        break;
      case 'cancelled':
        counts.cancelled += 1;
        break;
      case 'needs_review':
        counts.needs_review += 1;
        break;
      default:
        break;
    }
  }
  return counts;
}

/**
 * All-rail count: Needs review is pinned above the funnel and must not be
 * double-counted in `all` (same lead would appear under Needs review and All).
 * Stage buckets are unchanged — `needs_review` keeps its own count.
 */
export function omitNeedsReviewFromAllLaneCount(
  counts: InteractionStageCounts
): InteractionStageCounts {
  return {
    ...counts,
    all: Math.max(0, counts.all - counts.needs_review),
  };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const SNIPPET_MAX = 120;
/** Page size when scanning the window for funnel counts (independent of list page). */
const COUNT_PAGE_SIZE = 500;
/** Hard cap so a huge inbox cannot blow memory; log when hit. */
const COUNT_SCAN_MAX = 5000;
/** Supabase `.in()` chunk size for related-row lookups. */
const IN_CHUNK = 100;
const PLACEHOLDER_NAME = /^placeholder$/i;

interface CursorPayload {
  updated_at: string;
  id: string;
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): CursorPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as CursorPayload;
    if (
      typeof parsed?.updated_at === 'string' &&
      typeof parsed?.id === 'string' &&
      parsed.updated_at.length > 0 &&
      parsed.id.length > 0
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function toIso(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

function truncateSnippet(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const t = raw.trim().replace(/\s+/g, ' ');
  return t.length <= SNIPPET_MAX ? t : `${t.slice(0, SNIPPET_MAX)}…`;
}

/** Prefer @handle; FB display names (with spaces) shown as-is. */
function formatPlatformIdentity(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  if (/\s/.test(t)) return t;
  return t.startsWith('@') ? t : `@${t}`;
}

/** Human list title when no patient name/MRN yet. Prefer public username over opaque ids. */
function buildLeadLabel(
  platform: ConversationPlatform,
  kind: InteractionKind = 'conversation',
  username?: string | null
): string {
  const handle = formatPlatformIdentity(username);
  if (handle) return handle;
  if (platform === 'instagram') {
    return kind === 'comment_lead' ? 'Instagram lead' : 'Instagram chat';
  }
  if (platform === 'facebook') {
    return kind === 'comment_lead' ? 'Facebook lead' : 'Facebook chat';
  }
  if (platform === 'whatsapp') {
    return 'WhatsApp chat';
  }
  return kind === 'comment_lead' ? 'Lead' : 'Chat';
}

function bookingPastGreeting(state: ConversationState): boolean {
  const step = state.step;
  if (step && step !== 'responded') return true;
  const sm = state.serviceMatch;
  if (
    sm?.pendingStaffServiceReview ||
    sm?.serviceSelectionFinalized ||
    sm?.catalogServiceKey ||
    sm?.matcherProposedCatalogServiceKey
  ) {
    return true;
  }
  const pk = state.lastPromptKind;
  return (
    pk === 'fee_quote' ||
    pk === 'staff_service_pending' ||
    pk === 'collect_details' ||
    pk === 'consent' ||
    pk === 'confirm_details' ||
    pk === 'match_pick'
  );
}

function bookingInProgress(state: ConversationState): boolean {
  const step = state.step;
  if (!step || step === 'responded') {
    return (
      state.lastPromptKind === 'fee_quote' ||
      Boolean(state.serviceMatch?.serviceSelectionFinalized) ||
      Boolean(state.serviceMatch?.catalogServiceKey)
    );
  }
  return (
    step.startsWith('collecting_') ||
    step === 'confirm_details' ||
    step === 'consent' ||
    step === 'awaiting_date_time' ||
    step === 'awaiting_slot_selection' ||
    step === 'awaiting_match_confirmation' ||
    step === 'awaiting_complaint_clarification' ||
    step === 'awaiting_followup_service_confirmation'
  );
}

export function fuseInteractionStatus(input: {
  appointmentStatus: AppointmentStatus | null;
  needsReview: boolean;
  state: ConversationState;
  /** Kept for callers; no longer required for `new_lead` (channel-agnostic). */
  hasCommentLead: boolean;
}): InteractionFusedStatus {
  const { appointmentStatus, needsReview, state } = input;
  // Appointment terminal states first (ibi-12) — was incorrectly fused as `booked`.
  if (appointmentStatus === 'cancelled') {
    return 'cancelled';
  }
  if (appointmentStatus === 'no_show') {
    return 'no_show';
  }
  if (appointmentStatus === 'confirmed' || appointmentStatus === 'completed') {
    return 'paid';
  }
  if (appointmentStatus) {
    return 'booked';
  }
  if (needsReview) {
    return 'needs_review';
  }
  if (bookingInProgress(state) || state.step === 'awaiting_staff_service_confirmation') {
    return 'booking_pending';
  }
  // Early journey (comment or DM) — not past greeting / booking kickoff yet.
  if (!bookingPastGreeting(state)) {
    return 'new_lead';
  }
  return 'in_conversation';
}

export function isSignalInteraction(input: {
  hasCommentLead: boolean;
  hasAppointment: boolean;
  hasReview: boolean;
  state: ConversationState;
}): boolean {
  return (
    input.hasCommentLead ||
    input.hasAppointment ||
    input.hasReview ||
    bookingPastGreeting(input.state)
  );
}

function sortInteractionsDesc(a: InteractionListItem, b: InteractionListItem): number {
  if (a.updated_at !== b.updated_at) {
    return a.updated_at < b.updated_at ? 1 : -1;
  }
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Build pre-consult timeline (ibi-08). No PHI text — ids + timestamps only.
 */
export function buildInteractionTimeline(input: {
  conversationId: string | null;
  commentLead?: { id: string; created_at: string } | null;
  firstPatientMessageAt?: string | null;
  state?: ConversationState | null;
  pendingReview?: { id: string; created_at: string } | null;
  appointment?: {
    id: string;
    status: AppointmentStatus;
    created_at: string;
    related_appointment_id?: string | null;
  } | null;
  /** Extra appointments on the conversation (newest-first). Used to detect reschedule. */
  priorAppointments?: ReadonlyArray<{
    id: string;
    created_at: string;
    related_appointment_id?: string | null;
  }>;
}): InteractionTimelineStep[] {
  const steps: InteractionTimelineStep[] = [];
  const convId = input.conversationId ?? undefined;

  if (input.commentLead) {
    steps.push({
      type: 'comment_captured',
      at: toIso(input.commentLead.created_at),
      comment_lead_id: input.commentLead.id,
      conversation_id: convId,
    });
  }

  if (input.firstPatientMessageAt && convId) {
    steps.push({
      type: 'first_dm',
      at: toIso(input.firstPatientMessageAt),
      conversation_id: convId,
    });
  }

  const state = input.state ?? {};
  if (bookingPastGreeting(state) && convId) {
    const at = state.updatedAt ?? input.firstPatientMessageAt ?? new Date(0).toISOString();
    steps.push({
      type: 'booking_started',
      at: toIso(at),
      conversation_id: convId,
    });
  }

  if (
    convId &&
    (state.step === 'awaiting_slot_selection' || Boolean(state.booking?.slotToConfirm))
  ) {
    steps.push({
      type: 'slot_selected',
      at: toIso(state.updatedAt ?? input.firstPatientMessageAt ?? new Date(0).toISOString()),
      conversation_id: convId,
    });
  }

  if (input.pendingReview) {
    steps.push({
      type: 'needs_review',
      at: toIso(input.pendingReview.created_at),
      conversation_id: convId,
      review_id: input.pendingReview.id,
    });
  }

  if (input.appointment) {
    steps.push({
      type: 'booked',
      at: toIso(input.appointment.created_at),
      conversation_id: convId,
      appointment_id: input.appointment.id,
    });
    if (
      input.appointment.status === 'confirmed' ||
      input.appointment.status === 'completed'
    ) {
      steps.push({
        type: 'paid',
        at: toIso(input.appointment.created_at),
        conversation_id: convId,
        appointment_id: input.appointment.id,
      });
    }
  }

  // Reschedule is a Path event, not a list filter (IBI5-D4).
  const rescheduleApt =
    input.appointment?.related_appointment_id
      ? input.appointment
      : (input.priorAppointments ?? []).find((a) => Boolean(a.related_appointment_id)) ??
        ((input.priorAppointments?.length ?? 0) >= 1 && input.appointment
          ? input.appointment
          : null);
  const multiAppt =
    Boolean(input.appointment) && (input.priorAppointments?.length ?? 0) >= 1;
  if (convId && rescheduleApt && (rescheduleApt.related_appointment_id || multiAppt)) {
    steps.push({
      type: 'rescheduled',
      at: toIso(rescheduleApt.created_at),
      conversation_id: convId,
      appointment_id: rescheduleApt.id,
    });
  }

  steps.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return steps;
}

interface ConvRow {
  id: string;
  doctor_id: string;
  patient_id: string | null;
  platform: ConversationPlatform;
  platform_conversation_id: string;
  status: string;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}

interface UnlinkedLeadRow {
  id: string;
  doctor_id: string;
  commenter_ig_id: string;
  platform: 'instagram' | 'facebook';
  comment_text?: string | null;
  commenter_username?: string | null;
  created_at: string;
  updated_at?: string;
}

function mapUnlinkedLead(
  row: UnlinkedLeadRow,
  avatarUrl: string | null = null
): InteractionListItem {
  const channel = row.platform as ConversationPlatform;
  const at = toIso(row.updated_at ?? row.created_at);
  // Doctor-facing preview of the comment (never log comment_text).
  const snippet =
    truncateSnippet(row.comment_text) ?? 'Commented on a post';
  const username = row.commenter_username?.trim() || null;
  return {
    id: row.id,
    kind: 'comment_lead',
    channel,
    patient_id: null,
    patient_display_name: null,
    medical_record_number: null,
    lead_label: buildLeadLabel(channel, 'comment_lead', username),
    last_message_snippet: snippet,
    status: 'new_lead',
    has_comment_lead: true,
    needs_review: false,
    appointment_id: null,
    appointment_patient_id: null,
    appointment_patient_display_name: null,
    appointment_patient_mrn: null,
    platform_external_id: row.commenter_ig_id,
    platform_username: username,
    avatar_url: avatarUrl,
    created_at: toIso(row.created_at),
    updated_at: at,
  };
}

/**
 * Latest message snippet per conversation for Inbox list rows.
 * One `limit(1)` query per id — avoids unbounded SELECT that hits PostgREST
 * max-rows and silently nulls snippets for quieter threads on the page.
 */
async function fetchLatestMessageSnippetsByConversation(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  convIds: string[],
  correlationId: string
): Promise<Map<string, string | null>> {
  const snippetByConv = new Map<string, string | null>();
  if (convIds.length === 0) return snippetByConv;

  const rows = await Promise.all(
    convIds.map(async (conversationId) => {
      const { data, error } = await admin
        .from('messages')
        .select('conversation_id, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) handleSupabaseError(error, correlationId);
      return data as { conversation_id: string; content: string } | null;
    })
  );

  for (const row of rows) {
    if (!row?.conversation_id) continue;
    snippetByConv.set(row.conversation_id, truncateSnippet(row.content));
  }
  return snippetByConv;
}

async function enrichConversationRows(
  doctorId: string,
  convs: ConvRow[],
  correlationId: string
): Promise<InteractionListItem[]> {
  if (convs.length === 0) return [];

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const convIds = convs.map((c) => c.id);
  const chatterPatientIds = [
    ...new Set(convs.map((c) => c.patient_id).filter((id): id is string => Boolean(id))),
  ];

  const [
    { data: leads, error: leadErr },
    { data: reviews, error: reviewErr },
    { data: appointments, error: aptErr },
    snippetByConv,
  ] = await Promise.all([
    admin
      .from('comment_leads')
      .select('id, conversation_id, commenter_username')
      .eq('doctor_id', doctorId)
      .in('conversation_id', convIds),
    admin
      .from('service_staff_review_requests')
      .select('id, conversation_id, status')
      .eq('doctor_id', doctorId)
      .in('conversation_id', convIds),
    admin
      .from('appointments')
      .select('id, conversation_id, status, created_at, patient_id, patient_name')
      .eq('doctor_id', doctorId)
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false }),
    fetchLatestMessageSnippetsByConversation(admin, convIds, correlationId),
  ]);

  if (leadErr) handleSupabaseError(leadErr, correlationId);
  if (reviewErr) handleSupabaseError(reviewErr, correlationId);
  if (aptErr) handleSupabaseError(aptErr, correlationId);

  const leadUsernameByConv = new Map<string, string>();
  const leadConvIds = new Set<string>();
  for (const r of leads ?? []) {
    const row = r as {
      conversation_id: string | null;
      commenter_username?: string | null;
    };
    if (!row.conversation_id) continue;
    leadConvIds.add(row.conversation_id);
    const u = row.commenter_username?.trim();
    if (u && !leadUsernameByConv.has(row.conversation_id)) {
      leadUsernameByConv.set(row.conversation_id, u);
    }
  }

  const pendingReviewConvIds = new Set<string>();
  for (const r of reviews ?? []) {
    const row = r as { conversation_id: string; status: string };
    if (row.status === 'pending') pendingReviewConvIds.add(row.conversation_id);
  }

  type LatestApt = {
    id: string;
    status: AppointmentStatus;
    patient_id: string | null;
    patient_name: string | null;
  };
  const latestAptByConv = new Map<string, LatestApt>();
  for (const a of appointments ?? []) {
    const row = a as {
      id: string;
      conversation_id: string | null;
      status: AppointmentStatus;
      patient_id?: string | null;
      patient_name?: string | null;
    };
    if (!row.conversation_id || latestAptByConv.has(row.conversation_id)) continue;
    latestAptByConv.set(row.conversation_id, {
      id: row.id,
      status: row.status,
      patient_id: row.patient_id ?? null,
      patient_name: row.patient_name?.trim() || null,
    });
  }

  const aptPatientIds = [
    ...new Set(
      [...latestAptByConv.values()]
        .map((a) => a.patient_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  // IDs come from doctor-scoped conversations/appointments. Include appointment
  // patients that may lack doctor_id (booking-for-other create path).
  const allPatientIds = [...new Set([...chatterPatientIds, ...aptPatientIds])];

  const { data: patients, error: patientErr } =
    allPatientIds.length > 0
      ? await admin
          .from('patients')
          .select(
            'id, name, medical_record_number, platform, platform_external_id, platform_username'
          )
          .in('id', allPatientIds)
      : { data: [], error: null };

  if (patientErr) handleSupabaseError(patientErr, correlationId);

  const patientById = new Map<
    string,
    {
      name: string | null;
      medical_record_number: string | null;
      platform_external_id: string | null;
      platform_username: string | null;
    }
  >();
  for (const p of patients ?? []) {
    const row = p as {
      id: string;
      name: string | null;
      medical_record_number: string | null;
      platform_external_id: string | null;
      platform_username?: string | null;
    };
    patientById.set(row.id, {
      name: row.name,
      medical_record_number: row.medical_record_number,
      platform_external_id: row.platform_external_id,
      platform_username: row.platform_username ?? null,
    });
  }

  const avatarRefs = convs.map((c) => {
    const patient = c.patient_id ? patientById.get(c.patient_id) : undefined;
    const platformExternalId =
      patient?.platform_external_id ?? c.platform_conversation_id ?? null;
    return {
      channel: c.platform,
      platformExternalId: platformExternalId ?? '',
    };
  });
  const avatars = await getCachedPlatformAvatars(avatarRefs);

  return convs.map((c) => {
    const state = readConversationState(c.metadata);
    const hasCommentLead = leadConvIds.has(c.id);
    const needsReview = pendingReviewConvIds.has(c.id);
    const apt = latestAptByConv.get(c.id) ?? null;
    const patient = c.patient_id ? patientById.get(c.patient_id) : undefined;
    const rawName = patient?.name?.trim() ?? null;
    const displayName =
      rawName && !PLACEHOLDER_NAME.test(rawName) ? rawName : null;
    const platformExternalId =
      patient?.platform_external_id ?? c.platform_conversation_id ?? null;
    const username =
      patient?.platform_username ?? leadUsernameByConv.get(c.id) ?? null;
    const leadLabel = buildLeadLabel(c.platform, 'conversation', username);
    const status = fuseInteractionStatus({
      appointmentStatus: apt?.status ?? null,
      needsReview,
      state,
      hasCommentLead,
    });

    const aptPatientId = apt?.patient_id ?? null;
    const aptPatient = aptPatientId ? patientById.get(aptPatientId) : undefined;
    const aptRawName = aptPatient?.name?.trim() || apt?.patient_name || null;
    const aptDisplayName =
      aptRawName && !PLACEHOLDER_NAME.test(aptRawName) ? aptRawName : null;
    const avatarKey =
      platformExternalId != null && platformExternalId !== ''
        ? `${c.platform}:${platformExternalId}`
        : null;

    return {
      id: c.id,
      kind: 'conversation' as const,
      channel: c.platform,
      patient_id: c.patient_id,
      patient_display_name: displayName,
      medical_record_number: patient?.medical_record_number ?? null,
      lead_label: leadLabel,
      last_message_snippet: snippetByConv.get(c.id) ?? null,
      status,
      has_comment_lead: hasCommentLead,
      needs_review: needsReview,
      appointment_id: apt?.id ?? null,
      appointment_patient_id: aptPatientId,
      appointment_patient_display_name: aptDisplayName,
      appointment_patient_mrn: aptPatient?.medical_record_number ?? null,
      platform_external_id: platformExternalId,
      platform_username: username,
      avatar_url: avatarKey ? avatars.get(avatarKey) ?? null : null,
      created_at: toIso(c.created_at),
      updated_at: toIso(c.updated_at),
    };
  });
}

async function fetchUnlinkedCommentLeads(
  doctorId: string,
  opts: {
    channel?: ConversationPlatform;
    cursor: CursorPayload | null;
    limit: number;
    correlationId: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<InteractionListItem[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  // WhatsApp has no comment leads
  if (opts.channel === 'whatsapp') return [];

  let q = admin
    .from('comment_leads')
    .select(
      'id, doctor_id, commenter_ig_id, platform, comment_text, commenter_username, created_at, updated_at'
    )
    .eq('doctor_id', doctorId)
    .is('conversation_id', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(opts.limit);

  if (opts.channel === 'instagram' || opts.channel === 'facebook') {
    q = q.eq('platform', opts.channel);
  }
  if (opts.dateFrom) {
    q = q.gte('created_at', opts.dateFrom);
  }
  if (opts.dateTo) {
    q = q.lte('created_at', opts.dateTo);
  }
  if (opts.cursor) {
    q = q.or(
      `created_at.lt.${opts.cursor.updated_at},and(created_at.eq.${opts.cursor.updated_at},id.lt.${opts.cursor.id})`
    );
  }

  const { data, error } = await q;
  if (error) handleSupabaseError(error, opts.correlationId);
  const rows = (data ?? []) as UnlinkedLeadRow[];
  const avatars = await getCachedPlatformAvatars(
    rows.map((r) => ({
      channel: r.platform,
      platformExternalId: r.commenter_ig_id,
    }))
  );
  return rows.map((r) =>
    mapUnlinkedLead(
      r,
      avatars.get(`${r.platform}:${r.commenter_ig_id}`) ?? null
    )
  );
}

async function countUnlinkedCommentLeads(
  doctorId: string,
  opts: {
    channel?: ConversationPlatform;
    dateFrom?: string;
    dateTo?: string;
    correlationId: string;
  }
): Promise<number> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');
  if (opts.channel === 'whatsapp') return 0;

  let q = admin
    .from('comment_leads')
    .select('id', { count: 'exact', head: true })
    .eq('doctor_id', doctorId)
    .is('conversation_id', null);

  if (opts.channel === 'instagram' || opts.channel === 'facebook') {
    q = q.eq('platform', opts.channel);
  }
  if (opts.dateFrom) q = q.gte('created_at', opts.dateFrom);
  if (opts.dateTo) q = q.lte('created_at', opts.dateTo);

  const { count, error } = await q;
  if (error) handleSupabaseError(error, opts.correlationId);
  return count ?? 0;
}

/**
 * Scan conversations in the channel/date window (no list cursor) and fuse statuses
 * for the funnel rail. Caps at COUNT_SCAN_MAX.
 */
async function fetchConversationsForCounts(
  doctorId: string,
  opts: {
    channel?: ConversationPlatform;
    dateFrom?: string;
    dateTo?: string;
    correlationId: string;
  }
): Promise<ConvRow[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const rows: ConvRow[] = [];
  let from = 0;
  while (rows.length < COUNT_SCAN_MAX) {
    const pageEnd = Math.min(from + COUNT_PAGE_SIZE - 1, COUNT_SCAN_MAX - 1);
    let q = admin
      .from('conversations')
      .select(
        'id, doctor_id, patient_id, platform, platform_conversation_id, status, metadata, created_at, updated_at'
      )
      .eq('doctor_id', doctorId)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, pageEnd);

    if (opts.channel) q = q.eq('platform', opts.channel);
    if (opts.dateFrom) q = q.gte('updated_at', opts.dateFrom);
    if (opts.dateTo) q = q.lte('updated_at', opts.dateTo);

    const { data, error } = await q;
    if (error) handleSupabaseError(error, opts.correlationId);
    const batch = (data ?? []) as ConvRow[];
    rows.push(...batch);
    if (batch.length < COUNT_PAGE_SIZE) break;
    from += COUNT_PAGE_SIZE;
  }

  if (rows.length >= COUNT_SCAN_MAX) {
    logger.warn(
      { correlationId: opts.correlationId, doctorId, cappedAt: COUNT_SCAN_MAX },
      'Interactions stage counts capped at scan max'
    );
  }
  return rows;
}

interface FusedConvForCount {
  status: InteractionFusedStatus;
  signal: boolean;
}

/** Lightweight fuse for counts — no patient names / message snippets. */
async function fuseConversationStatusesForCounts(
  doctorId: string,
  convs: ConvRow[],
  correlationId: string
): Promise<FusedConvForCount[]> {
  if (convs.length === 0) return [];

  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const leadConvIds = new Set<string>();
  const anyReviewConvIds = new Set<string>();
  const pendingReviewConvIds = new Set<string>();
  const latestAptByConv = new Map<string, AppointmentStatus>();

  for (let i = 0; i < convs.length; i += IN_CHUNK) {
    const chunk = convs.slice(i, i + IN_CHUNK).map((c) => c.id);
    const [
      { data: leads, error: leadErr },
      { data: reviews, error: reviewErr },
      { data: appointments, error: aptErr },
    ] = await Promise.all([
      admin
        .from('comment_leads')
        .select('conversation_id')
        .eq('doctor_id', doctorId)
        .in('conversation_id', chunk),
      admin
        .from('service_staff_review_requests')
        .select('conversation_id, status')
        .eq('doctor_id', doctorId)
        .in('conversation_id', chunk),
      admin
        .from('appointments')
        .select('conversation_id, status, created_at')
        .eq('doctor_id', doctorId)
        .in('conversation_id', chunk)
        .order('created_at', { ascending: false }),
    ]);
    if (leadErr) handleSupabaseError(leadErr, correlationId);
    if (reviewErr) handleSupabaseError(reviewErr, correlationId);
    if (aptErr) handleSupabaseError(aptErr, correlationId);

    for (const r of leads ?? []) {
      const id = (r as { conversation_id: string | null }).conversation_id;
      if (id) leadConvIds.add(id);
    }
    for (const r of reviews ?? []) {
      const row = r as { conversation_id: string; status: string };
      anyReviewConvIds.add(row.conversation_id);
      if (row.status === 'pending') pendingReviewConvIds.add(row.conversation_id);
    }
    for (const a of appointments ?? []) {
      const row = a as {
        conversation_id: string | null;
        status: AppointmentStatus;
      };
      if (!row.conversation_id || latestAptByConv.has(row.conversation_id)) continue;
      latestAptByConv.set(row.conversation_id, row.status);
    }
  }

  return convs.map((c) => {
    const state = readConversationState(c.metadata);
    const hasCommentLead = leadConvIds.has(c.id);
    const aptStatus = latestAptByConv.get(c.id) ?? null;
    const status = fuseInteractionStatus({
      appointmentStatus: aptStatus,
      needsReview: pendingReviewConvIds.has(c.id),
      state,
      hasCommentLead,
    });
    const signal = isSignalInteraction({
      hasCommentLead,
      hasAppointment: aptStatus != null,
      hasReview: anyReviewConvIds.has(c.id),
      state,
    });
    return { status, signal };
  });
}

/**
 * True funnel counts for the channel/date/scope window (ignores status filter + list cursor).
 */
export async function computeInteractionStageCounts(
  doctorId: string,
  opts: {
    scope: InteractionScope;
    channel?: ConversationPlatform;
    dateFrom?: string;
    dateTo?: string;
  },
  correlationId: string
): Promise<InteractionStageCounts> {
  const [convs, unlinkedLeadCount] = await Promise.all([
    fetchConversationsForCounts(doctorId, {
      channel: opts.channel,
      dateFrom: opts.dateFrom,
      dateTo: opts.dateTo,
      correlationId,
    }),
    countUnlinkedCommentLeads(doctorId, {
      channel: opts.channel,
      dateFrom: opts.dateFrom,
      dateTo: opts.dateTo,
      correlationId,
    }),
  ]);

  const fused = await fuseConversationStatusesForCounts(doctorId, convs, correlationId);
  const statuses: Array<{ status: InteractionFusedStatus }> = [];
  for (const row of fused) {
    if (opts.scope === 'signal' && !row.signal) continue;
    statuses.push({ status: row.status });
  }
  const counts = countInteractionStages(statuses);
  // Unlinked comment leads are always signal (IB4) and always new_lead.
  counts.new_lead += unlinkedLeadCount;
  counts.all += unlinkedLeadCount;
  // Needs review stays counted in `needs_review` only — not in All.
  return omitNeedsReviewFromAllLaneCount(counts);
}

/**
 * List interactions for a doctor. Default scope = signal.
 * Merges conversation rows + unlinked comment_leads (ibi-07).
 */
export async function listInteractionsForDoctor(
  doctorId: string,
  query: ListInteractionsQuery,
  correlationId: string
): Promise<ListInteractionsResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const scope: InteractionScope = query.scope ?? 'signal';
  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const fetchLimit = scope === 'signal' ? Math.min(limit * 3, MAX_LIMIT) : limit;

  let cursor: CursorPayload | null = null;
  if (query.cursor) {
    cursor = decodeCursor(query.cursor);
    if (!cursor) {
      logger.warn({ correlationId }, 'Interactions list: invalid cursor ignored');
    }
  }

  let q = admin
    .from('conversations')
    .select(
      'id, doctor_id, patient_id, platform, platform_conversation_id, status, metadata, created_at, updated_at'
    )
    .eq('doctor_id', doctorId)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(fetchLimit);

  if (query.channel) {
    q = q.eq('platform', query.channel);
  }
  if (query.dateFrom) {
    q = q.gte('updated_at', query.dateFrom);
  }
  if (query.dateTo) {
    q = q.lte('updated_at', query.dateTo);
  }
  if (cursor) {
    q = q.or(
      `updated_at.lt.${cursor.updated_at},and(updated_at.eq.${cursor.updated_at},id.lt.${cursor.id})`
    );
  }

  // Full-window stage scan is expensive — only on first page when requested.
  // Polls send includeCounts=false; load-more has a cursor.
  const shouldCount = !cursor && query.includeCounts !== false;

  const [{ data, error }, leadItems, counts] = await Promise.all([
    q,
    fetchUnlinkedCommentLeads(doctorId, {
      channel: query.channel,
      cursor,
      limit: fetchLimit,
      correlationId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    }),
    shouldCount
      ? computeInteractionStageCounts(
          doctorId,
          {
            scope,
            channel: query.channel,
            dateFrom: query.dateFrom,
            dateTo: query.dateTo,
          },
          correlationId
        )
      : Promise.resolve(null),
  ]);
  if (error) handleSupabaseError(error, correlationId);

  const convs = (data ?? []) as ConvRow[];
  const stateById = new Map(
    convs.map((c) => [c.id, readConversationState(c.metadata)] as const)
  );

  const anyReviewConvIds = new Set<string>();
  if (convs.length > 0) {
    const { data: allReviews, error: rErr } = await admin
      .from('service_staff_review_requests')
      .select('conversation_id')
      .eq('doctor_id', doctorId)
      .in(
        'conversation_id',
        convs.map((c) => c.id)
      );
    if (rErr) handleSupabaseError(rErr, correlationId);
    for (const r of allReviews ?? []) {
      anyReviewConvIds.add((r as { conversation_id: string }).conversation_id);
    }
  }

  let convItems = await enrichConversationRows(doctorId, convs, correlationId);

  if (scope === 'signal') {
    convItems = convItems.filter((item) =>
      isSignalInteraction({
        hasCommentLead: item.has_comment_lead,
        hasAppointment: Boolean(item.appointment_id),
        hasReview: anyReviewConvIds.has(item.id),
        state: stateById.get(item.id) ?? {},
      })
    );
  }

  // Unlinked leads are always signal; include for both scopes (IB4).
  let items = [...convItems, ...leadItems];
  items.sort(sortInteractionsDesc);

  const statusFilter = new Set<InteractionFusedStatus>();
  if (query.statuses?.length) {
    for (const s of query.statuses) statusFilter.add(s);
  } else if (query.status) {
    statusFilter.add(query.status);
  }
  if (statusFilter.size > 0) {
    items = items.filter((i) => statusFilter.has(i.status));
  } else {
    // All rail: Needs review has its own pinned lane — omit here to avoid duplicates.
    items = items.filter((i) => i.status !== 'needs_review');
  }

  const page = items.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    page.length === limit && last
      ? encodeCursor({ updated_at: last.updated_at, id: last.id })
      : null;

  await logDataAccess(correlationId, doctorId, 'interaction_list');

  return { interactions: page, nextCursor, counts };
}

async function buildTimelineForConversation(
  doctorId: string,
  conv: ConvRow,
  correlationId: string
): Promise<InteractionTimelineStep[]> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const [
    { data: leads, error: leadErr },
    { data: firstMsg, error: msgErr },
    { data: reviews, error: reviewErr },
    { data: appointments, error: aptErr },
  ] = await Promise.all([
    admin
      .from('comment_leads')
      .select('id, created_at')
      .eq('doctor_id', doctorId)
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })
      .limit(1),
    admin
      .from('messages')
      .select('created_at')
      .eq('conversation_id', conv.id)
      .eq('sender_type', 'patient')
      .order('created_at', { ascending: true })
      .limit(1),
    admin
      .from('service_staff_review_requests')
      .select('id, status, created_at')
      .eq('doctor_id', doctorId)
      .eq('conversation_id', conv.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1),
    admin
      .from('appointments')
      .select('id, status, created_at, related_appointment_id')
      .eq('doctor_id', doctorId)
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  if (leadErr) handleSupabaseError(leadErr, correlationId);
  if (msgErr) handleSupabaseError(msgErr, correlationId);
  if (reviewErr) handleSupabaseError(reviewErr, correlationId);
  if (aptErr) handleSupabaseError(aptErr, correlationId);

  const lead = (leads?.[0] as { id: string; created_at: string } | undefined) ?? null;
  const firstPatient = (firstMsg?.[0] as { created_at: string } | undefined) ?? null;
  const pending = (reviews?.[0] as { id: string; created_at: string } | undefined) ?? null;
  type AptRow = {
    id: string;
    status: AppointmentStatus;
    created_at: string;
    related_appointment_id?: string | null;
  };
  const aptRows = (appointments ?? []) as AptRow[];
  const apt = aptRows[0] ?? null;
  const priorAppointments = aptRows.slice(1);

  return buildInteractionTimeline({
    conversationId: conv.id,
    commentLead: lead,
    firstPatientMessageAt: firstPatient?.created_at ?? null,
    state: readConversationState(conv.metadata),
    pendingReview: pending,
    appointment: apt,
    priorAppointments,
  });
}

export async function getInteractionForDoctor(
  doctorId: string,
  interactionId: string,
  correlationId: string
): Promise<InteractionDetail> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new InternalError('Service role client not available');

  const { data, error } = await admin
    .from('conversations')
    .select(
      'id, doctor_id, patient_id, platform, platform_conversation_id, status, metadata, created_at, updated_at'
    )
    .eq('id', interactionId)
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) handleSupabaseError(error, correlationId);

  if (data) {
    const [item] = await enrichConversationRows(doctorId, [data as ConvRow], correlationId);
    if (!item) throw new NotFoundError('Interaction not found');
    const timeline = await buildTimelineForConversation(
      doctorId,
      data as ConvRow,
      correlationId
    );
    await logDataAccess(correlationId, doctorId, 'interaction', interactionId);
    return { ...item, timeline };
  }

  // ibi-07: comment-only lead detail
  const { data: lead, error: leadErr } = await admin
    .from('comment_leads')
    .select(
      'id, doctor_id, commenter_ig_id, platform, comment_text, commenter_username, created_at, updated_at, conversation_id'
    )
    .eq('id', interactionId)
    .eq('doctor_id', doctorId)
    .is('conversation_id', null)
    .maybeSingle();

  if (leadErr) handleSupabaseError(leadErr, correlationId);
  if (!lead) throw new NotFoundError('Interaction not found');

  const leadRow = lead as UnlinkedLeadRow;
  const avatars = await getCachedPlatformAvatars([
    {
      channel: leadRow.platform,
      platformExternalId: leadRow.commenter_ig_id,
    },
  ]);
  const item = mapUnlinkedLead(
    leadRow,
    avatars.get(`${leadRow.platform}:${leadRow.commenter_ig_id}`) ?? null
  );
  const timeline = buildInteractionTimeline({
    conversationId: null,
    commentLead: { id: item.id, created_at: item.created_at },
  });

  await logDataAccess(correlationId, doctorId, 'interaction', interactionId);
  return {
    ...item,
    timeline,
    // Full body for detail panel (still never log).
    comment_text:
      typeof leadRow.comment_text === 'string' ? leadRow.comment_text : null,
  };
}
