/**
 * Webhook / receptionist observability (RBH-01).
 * Structured INFO logs for log-derived counters — same pattern as OPD metrics.
 * No PHI: never include message text, comment text, phone, or patient identifiers.
 *
 * @see docs/Reference/engineering/operations/OBSERVABILITY.md — Receptionist / Instagram webhook metrics
 */

import { logger } from '../config/logger';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../utils/errors';

const CONTEXT = 'webhook_metric' as const;

/** Instagram DM send failure class for dashboards (no raw error messages in metric field). */
export type InstagramDmFailureReason =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limit'
  | 'bad_request'
  | 'server_error'
  | 'service_unavailable'
  | 'unknown';

/**
 * Map thrown errors from sendInstagramMessage / Graph to a stable reason class.
 */
export function classifyInstagramDmFailureReason(err: unknown): InstagramDmFailureReason {
  if (err instanceof UnauthorizedError) return 'unauthorized';
  if (err instanceof ForbiddenError) return 'forbidden';
  if (err instanceof NotFoundError) return 'not_found';
  if (err instanceof TooManyRequestsError) return 'rate_limit';
  if (err instanceof ServiceUnavailableError) return 'service_unavailable';
  if (err instanceof AppError) {
    if (err.statusCode >= 500) return 'server_error';
    if (err.statusCode >= 400) return 'bad_request';
  }
  return 'unknown';
}

/** Job picked up from BullMQ (before branch-specific work). */
export function logWebhookJobDequeued(fields: {
  correlationId: string;
  eventId: string;
  provider: string;
  jobId?: string;
}): void {
  logger.info(
    {
      context: CONTEXT,
      metric: 'webhook_job_dequeued_total',
      correlationId: fields.correlationId,
      eventId: fields.eventId,
      provider: fields.provider,
      jobId: fields.jobId,
    },
    'webhook_metric_webhook_job_dequeued_total'
  );
}

/** Job finished successfully (worker wrapper — no inner branch). */
export function logWebhookJobWorkerSuccess(fields: {
  correlationId: string;
  eventId: string;
  provider: string;
  durationMs: number;
  jobId?: string;
}): void {
  logger.info(
    {
      context: CONTEXT,
      metric: 'webhook_job_worker_success_total',
      correlationId: fields.correlationId,
      eventId: fields.eventId,
      provider: fields.provider,
      durationMs: fields.durationMs,
      jobId: fields.jobId,
    },
    'webhook_metric_webhook_job_worker_success'
  );
}

/** Job failed (exception propagated from processWebhookJob). */
export function logWebhookJobWorkerFailure(fields: {
  correlationId: string;
  eventId: string;
  provider: string;
  durationMs: number;
  jobId?: string;
  attempt?: number;
}): void {
  logger.warn(
    {
      context: CONTEXT,
      metric: 'webhook_job_worker_failure_total',
      correlationId: fields.correlationId,
      eventId: fields.eventId,
      provider: fields.provider,
      durationMs: fields.durationMs,
      jobId: fields.jobId,
      attempt: fields.attempt,
    },
    'webhook_metric_webhook_job_worker_failure'
  );
}

/** Dead letter after max retries. */
export function logWebhookJobDeadLetter(fields: {
  correlationId: string;
  eventId: string;
  provider: string;
  attempts: number;
  errorClass: string;
}): void {
  logger.warn(
    {
      context: CONTEXT,
      metric: 'webhook_job_dead_letter_total',
      correlationId: fields.correlationId,
      eventId: fields.eventId,
      provider: fields.provider,
      attempts: fields.attempts,
      errorClass: fields.errorClass,
    },
    'webhook_metric_webhook_job_dead_letter_total'
  );
}

/** Instagram comment pipeline outcome (aggregates-safe booleans only). */
export function logWebhookCommentPipeline(fields: {
  correlationId: string;
  eventId: string;
  doctorId?: string;
  outcome: 'processed' | 'skipped';
  skipReason?: 'unparseable' | 'no_doctor' | 'own_bot' | 'low_intent' | 'no_token' | 'other';
  intent?: string;
  highIntent?: boolean;
  dmSent?: boolean;
  publicReplySent?: boolean;
  /** When highIntent, whether doctor had an Instagram token (outreach possible). */
  doctorTokenPresent?: boolean;
  /** High-intent comment outreach skipped (paused receptionist or daily private-reply cap). */
  automationSkipped?: 'receptionist_paused' | 'daily_cap';
}): void {
  logger.info(
    {
      context: CONTEXT,
      metric: 'webhook_comment_pipeline_total',
      correlationId: fields.correlationId,
      eventId: fields.eventId,
      doctorId: fields.doctorId,
      outcome: fields.outcome,
      skipReason: fields.skipReason,
      intent: fields.intent,
      highIntent: fields.highIntent,
      dmSent: fields.dmSent,
      publicReplySent: fields.publicReplySent,
      doctorTokenPresent: fields.doctorTokenPresent,
      automationSkipped: fields.automationSkipped,
    },
    'webhook_metric_webhook_comment_pipeline_total'
  );
}

/** DM delivery attempt after conversation flow (success or classified failure). */
export function logWebhookInstagramDmDelivery(fields: {
  correlationId: string;
  eventId: string;
  outcome: 'success' | 'failure';
  reason?: InstagramDmFailureReason;
  usedRecipientFallback?: boolean;
}): void {
  const level = fields.outcome === 'success' ? 'info' : 'warn';
  const payload = {
    context: CONTEXT,
    metric: 'webhook_instagram_dm_delivery_total',
    correlationId: fields.correlationId,
    eventId: fields.eventId,
    outcome: fields.outcome,
    reason: fields.reason,
    usedRecipientFallback: fields.usedRecipientFallback,
  };
  if (level === 'info') {
    logger.info(payload, 'webhook_metric_webhook_instagram_dm_delivery_total');
  } else {
    logger.warn(payload, 'webhook_metric_webhook_instagram_dm_delivery_total');
  }
}

export type WebhookThrottleSkipReason = 'send_lock' | 'reply_throttle';

export function logWebhookDmThrottleSkip(fields: {
  correlationId: string;
  eventId: string;
  reason: WebhookThrottleSkipReason;
}): void {
  logger.info(
    {
      context: CONTEXT,
      metric: 'webhook_dm_throttle_skip_total',
      correlationId: fields.correlationId,
      eventId: fields.eventId,
      throttleReason: fields.reason,
    },
    'webhook_metric_webhook_dm_throttle_skip_total'
  );
}

/**
 * Instagram DM pipeline timing (RBH-12). Metadata only — no message text, no patient identifiers.
 * Use for p50/p95 of intent vs generate vs IG send on staging/production logs.
 */
export function logWebhookInstagramDmPipelineTiming(fields: {
  correlationId: string;
  eventId: string;
  doctorId?: string;
  /** Classified intent (string enum). */
  intent: string;
  /** Time spent in classifyIntent (ms); 0 if skipped (should not happen in normal DM path). */
  intentMs: number;
  /** Sum of all generateResponse / generateResponseWithActions OpenAI calls in this handler (ms). */
  generateMs: number;
  /** Instagram send path duration (ms); omit if send not attempted. */
  igSendMs?: number;
  /** Wall time from handler try-start through state ready to send (approx. before IG). */
  handlerPreSendMs: number;
  /** True when RBH-12 greeting fast path avoided generateResponse. */
  greetingFastPath?: boolean;
  /** Reply skipped after DB write (throttle); IG not delivered. */
  throttleSkipped?: boolean;
}): void {
  logger.info(
    {
      context: CONTEXT,
      metric: 'webhook_instagram_dm_pipeline_timing',
      correlationId: fields.correlationId,
      eventId: fields.eventId,
      doctorId: fields.doctorId,
      intent: fields.intent,
      intentMs: fields.intentMs,
      generateMs: fields.generateMs,
      igSendMs: fields.igSendMs,
      handlerPreSendMs: fields.handlerPreSendMs,
      greetingFastPath: fields.greetingFastPath === true,
      throttleSkipped: fields.throttleSkipped === true,
    },
    'webhook_metric_webhook_instagram_dm_pipeline_timing'
  );
}

/**
 * Controller dropped a message_edit-only webhook without queueing (RBH-11).
 *
 * Product policy: we deliberately do not re-process patient edits. Meta also
 * echoes message_edit alongside message for the same send — queueing both races.
 *
 * Aggregate alert (ops): sustained high rate of this metric while
 * `webhook_job_dequeued_total` / DM delivery for the same provider is near zero
 * → Meta may be delivering real DMs as edit-only again (silent drop).
 * `numEdit` present separates genuine patient edits from Meta echo noise.
 */
export function logWebhookMessageEditDropped(fields: {
  correlationId: string;
  provider: string;
  /** True when message_edit.text is non-empty (never log the text). */
  hasText: boolean;
  /** True when messaging[].sender.id is present. */
  hasSender: boolean;
  /** True when message_edit.mid is present (never log the mid). */
  hasMid: boolean;
  /**
   * Meta's edit counter when present. Absent/undefined is typical for
   * Meta's same-send echo; a positive value suggests a genuine patient edit.
   */
  numEdit?: number;
}): void {
  logger.info(
    {
      context: CONTEXT,
      metric: 'webhook_message_edit_dropped_total',
      /** Stable marker for log alerts / dashboards. */
      alertMarker: 'rbh11_message_edit_dropped',
      correlationId: fields.correlationId,
      provider: fields.provider,
      hasText: fields.hasText,
      hasSender: fields.hasSender,
      hasMid: fields.hasMid,
      numEdit: fields.numEdit,
    },
    'webhook_metric_webhook_message_edit_dropped_total'
  );
}

/**
 * Post-112 emergency intent was downgraded to medical_query because the patient
 * message showed positive stability evidence (keywords / non-crisis BP).
 * No message text. Aggregate to watch false-downgrade vs false-repeat rates.
 */
export function logDmEmergencyIntentDowngraded(fields: {
  correlationId: string;
  reason: 'post_escalation_stability';
}): void {
  logger.info(
    {
      context: CONTEXT,
      metric: 'dm_emergency_intent_downgraded_total',
      alertMarker: 'dm_emergency_intent_downgraded',
      correlationId: fields.correlationId,
      reason: fields.reason,
    },
    'webhook_metric_dm_emergency_intent_downgraded_total'
  );
}

/**
 * Per-turn emergency safety decision (no message text).
 * Use to diagnose misses: regexHit vs classifierIntent vs whether the head gate actually fired.
 */
export function logDmEmergencySafetyDecision(fields: {
  correlationId: string;
  regexHit: boolean;
  classifierIntent: string;
  /** True when emergencyGate.fires(ctx) — eligible even if revoke won the head chain. */
  emergencyGateEligible: boolean;
  /** True when the head gate result was emergency_safety. */
  emergencyGateFired: boolean;
  inCollection: boolean;
  priorEscalationInWindow: boolean;
  /** Persisted open crisis window (`safety.escalatedAt` without newer clearedAt). */
  crisisOpen: boolean;
  /** Head-chain branch when a gate fired; null when none fired. */
  headBranch: string | null;
}): void {
  logger.info(
    {
      context: CONTEXT,
      metric: 'dm_emergency_safety_decision_total',
      alertMarker: 'dm_emergency_safety_decision',
      correlationId: fields.correlationId,
      regexHit: fields.regexHit,
      classifierIntent: fields.classifierIntent,
      emergencyGateEligible: fields.emergencyGateEligible,
      emergencyGateFired: fields.emergencyGateFired,
      inCollection: fields.inCollection,
      priorEscalationInWindow: fields.priorEscalationInWindow,
      crisisOpen: fields.crisisOpen,
      headBranch: fields.headBranch,
    },
    'webhook_metric_dm_emergency_safety_decision_total'
  );
}

/**
 * Outbound reply discussed emergency guidance without 112/108 — floor appended the
 * localized escalation line and opened the crisis window. No message text.
 */
export function logDmEmergencyNumberFloorApplied(fields: {
  correlationId: string;
  /** Stage/gate branch before the floor ran. */
  branch: string;
}): void {
  logger.info(
    {
      context: CONTEXT,
      metric: 'dm_emergency_number_floor_applied_total',
      alertMarker: 'dm_emergency_number_floor_applied',
      correlationId: fields.correlationId,
      branch: fields.branch,
    },
    'webhook_metric_dm_emergency_number_floor_applied_total'
  );
}

/**
 * Per-turn language decision (lang-18). Counts and locale codes only — never
 * message text or marker identities (LANG-D9).
 */
export function logDmLanguageDecision(fields: {
  correlationId: string;
  storedBefore: string | null;
  resolved: string;
  changed: boolean;
  reason: string;
  hiMarkerCount: number;
  paMarkerCount: number;
  paExclusiveCount: number;
  accumulationWindowSize: number;
  /** Present after lang-17; null until the classifier language signal ships. */
  classifierLanguage: string | null;
  /** null when classifierLanguage is null. */
  classifierAgreed: boolean | null;
}): void {
  logger.info(
    {
      context: CONTEXT,
      metric: 'dm_language_decision_total',
      alertMarker: 'dm_language_decision',
      correlationId: fields.correlationId,
      storedBefore: fields.storedBefore,
      resolved: fields.resolved,
      changed: fields.changed,
      reason: fields.reason,
      hiMarkerCount: fields.hiMarkerCount,
      paMarkerCount: fields.paMarkerCount,
      paExclusiveCount: fields.paExclusiveCount,
      accumulationWindowSize: fields.accumulationWindowSize,
      classifierLanguage: fields.classifierLanguage,
      classifierAgreed: fields.classifierAgreed,
    },
    'webhook_metric_dm_language_decision_total'
  );
}

/** Conflict recovery path after duplicate conversation / message. */
export function logWebhookConflictRecovery(fields: {
  correlationId: string;
  eventId: string;
  outcome: 'success' | 'failed' | 'send_skipped_throttle';
}): void {
  logger.info(
    {
      context: CONTEXT,
      metric: 'webhook_conflict_recovery_total',
      correlationId: fields.correlationId,
      eventId: fields.eventId,
      recoveryOutcome: fields.outcome,
    },
    'webhook_metric_webhook_conflict_recovery_total'
  );
}

/** Payment branch completed (no amounts logged). */
export function logWebhookPaymentJobCompleted(fields: {
  correlationId: string;
  eventId: string;
  provider: string;
  parsed: boolean;
  appointmentNotified?: boolean;
}): void {
  logger.info(
    {
      context: CONTEXT,
      metric: 'webhook_payment_job_completed_total',
      correlationId: fields.correlationId,
      eventId: fields.eventId,
      provider: fields.provider,
      parsed: fields.parsed,
      appointmentNotified: fields.appointmentNotified,
    },
    'webhook_metric_webhook_payment_job_completed_total'
  );
}
