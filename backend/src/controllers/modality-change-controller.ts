/**
 * Modality-change HTTP controllers (Plan 09 · Task 47).
 *
 * Four endpoints wire into the state-machine service:
 *   · POST /consultation/:sessionId/modality-change/request         — Step-9 dispatcher.
 *   · POST /consultation/:sessionId/modality-change/approve         — doctor decision.
 *   · POST /consultation/:sessionId/modality-change/patient-consent — patient consent.
 *   · GET  /consultation/:sessionId/modality-change/state           — derived state read.
 *
 * Plus `handleModalityChangePaymentCapturedHook` — a plain function
 * (not an Express handler) exported so `webhook-worker.ts` can invoke
 * it from the async Razorpay webhook dispatcher after signature
 * verification + idempotency check. Task 49 wires this into the
 * worker dispatch switch.
 *
 * AuthN: routes gate on `authenticateToken` (JWT sub lands in
 * `req.user.id`). AuthZ: delegated to the service — the state machine
 * re-checks the seat vs `initiatedBy` and returns `forbidden` on
 * mismatch. Always returns 200 with the `ModalityChangeResult`
 * envelope — success and failure share the same shape so the Task
 * 50/51/52 modals branch on `result.kind` + `result.reason`.
 *
 * @see backend/src/services/modality-change-service.ts
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-47-request-modality-change-state-machine.md
 */

import type { Request, Response } from 'express';

import { asyncHandler } from '../utils/async-handler';
import { successResponse } from '../utils/response';
import {
  ForbiddenError,
  InternalError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors';

import {
  getModalityChangeState,
  getModalityHistory,
  handleDoctorApprovalOfPatientUpgrade,
  handlePatientConsentForDoctorUpgrade,
  handleModalityChangePaymentCaptured,
  requestModalityChange,
} from '../services/modality-change-service';
import type {
  ModalityChangeRequest,
  ModalityChangeResult,
  ModalityInitiator,
  ModalityPaymentCapturedInput,
  ModalityPresetReasonCode,
} from '../types/modality-change';
import type { Modality } from '../types/consultation-session';

// ============================================================================
// Helpers
// ============================================================================

const VALID_MODALITY = new Set<Modality>(['text', 'voice', 'video']);
const VALID_INITIATOR = new Set<ModalityInitiator>(['patient', 'doctor']);
const VALID_PRESET = new Set<ModalityPresetReasonCode>([
  'visible_symptom',
  'need_to_hear_voice',
  'patient_request',
  'network_or_equipment',
  'case_doesnt_need_modality',
  'patient_environment',
  'other',
]);

function parseSessionId(req: Request): string {
  const sessionId = (req.params as { sessionId?: string }).sessionId?.trim();
  if (!sessionId) throw new ValidationError('sessionId path param is required');
  return sessionId;
}

function parseModality(value: unknown, field: string): Modality {
  if (typeof value !== 'string' || !VALID_MODALITY.has(value as Modality)) {
    throw new ValidationError(`${field} must be one of: text | voice | video`);
  }
  return value as Modality;
}

function parseInitiator(value: unknown, field: string): ModalityInitiator {
  if (typeof value !== 'string' || !VALID_INITIATOR.has(value as ModalityInitiator)) {
    throw new ValidationError(`${field} must be one of: patient | doctor`);
  }
  return value as ModalityInitiator;
}

function parseOptionalPreset(value: unknown, field: string): ModalityPresetReasonCode | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !VALID_PRESET.has(value as ModalityPresetReasonCode)) {
    throw new ValidationError(`${field} is not a recognised preset reason code`);
  }
  return value as ModalityPresetReasonCode;
}

// ============================================================================
// POST /consultation/:sessionId/modality-change/request
// ============================================================================

export const modalityChangeRequestHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Authentication required');
    const sessionId = parseSessionId(req);

    const body = req.body as
      | {
          requestedModality?: unknown;
          initiatedBy?:       unknown;
          reason?:            unknown;
          presetReasonCode?:  unknown;
          correlationId?:     unknown;
        }
      | undefined;

    const requestedModality = parseModality(body?.requestedModality, 'requestedModality');
    const initiatedBy = parseInitiator(body?.initiatedBy, 'initiatedBy');
    const presetReasonCode = parseOptionalPreset(body?.presetReasonCode, 'presetReasonCode');
    const reason = typeof body?.reason === 'string' ? body.reason : undefined;
    const correlationId =
      typeof body?.correlationId === 'string' && body.correlationId.trim()
        ? body.correlationId.trim()
        : req.correlationId;

    const input: ModalityChangeRequest = {
      sessionId,
      requestedModality,
      initiatedBy,
      reason,
      presetReasonCode,
      correlationId,
      requestingUserId: userId,
      requestingRole: initiatedBy,
    };

    const result = await requestModalityChange(input);
    res.status(200).json(successResponse<ModalityChangeResult>(result, req));
  },
);

// ============================================================================
// POST /consultation/:sessionId/modality-change/approve   (doctor-only)
// ============================================================================

export const modalityChangeApproveHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Authentication required');
    parseSessionId(req);

    const body = req.body as
      | {
          approvalRequestId?: unknown;
          decision?:          unknown;
          amountPaise?:       unknown;
          declineReason?:     unknown;
          correlationId?:     unknown;
        }
      | undefined;

    const approvalRequestId =
      typeof body?.approvalRequestId === 'string' ? body.approvalRequestId.trim() : '';
    if (!approvalRequestId) {
      throw new ValidationError('approvalRequestId is required');
    }
    const decisionRaw = typeof body?.decision === 'string' ? body.decision.trim() : '';
    if (decisionRaw !== 'paid' && decisionRaw !== 'free' && decisionRaw !== 'decline') {
      throw new ValidationError('decision must be one of: paid | free | decline');
    }
    const amountPaise =
      typeof body?.amountPaise === 'number' && Number.isFinite(body.amountPaise)
        ? body.amountPaise
        : undefined;
    if (decisionRaw === 'paid' && (!amountPaise || amountPaise <= 0)) {
      throw new ValidationError('amountPaise must be a positive number for paid approval');
    }
    const declineReason =
      typeof body?.declineReason === 'string' && body.declineReason.trim()
        ? body.declineReason.trim()
        : undefined;

    const result = await handleDoctorApprovalOfPatientUpgrade({
      approvalRequestId,
      decision: decisionRaw,
      amountPaise,
      declineReason,
      requestingUserId: userId,
      correlationId:
        typeof body?.correlationId === 'string' && body.correlationId.trim()
          ? body.correlationId.trim()
          : req.correlationId,
    });
    res.status(200).json(successResponse<ModalityChangeResult>(result, req));
  },
);

// ============================================================================
// POST /consultation/:sessionId/modality-change/patient-consent   (patient-only)
// ============================================================================

export const modalityChangePatientConsentHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Authentication required');
    parseSessionId(req);

    const body = req.body as
      | {
          consentRequestId?: unknown;
          decision?:         unknown;
          declineReason?:    unknown;
          correlationId?:    unknown;
        }
      | undefined;

    const consentRequestId =
      typeof body?.consentRequestId === 'string' ? body.consentRequestId.trim() : '';
    if (!consentRequestId) {
      throw new ValidationError('consentRequestId is required');
    }
    const decisionRaw = typeof body?.decision === 'string' ? body.decision.trim() : '';
    if (decisionRaw !== 'allow' && decisionRaw !== 'decline') {
      throw new ValidationError('decision must be one of: allow | decline');
    }
    const declineReason =
      typeof body?.declineReason === 'string' && body.declineReason.trim()
        ? body.declineReason.trim()
        : undefined;

    const result = await handlePatientConsentForDoctorUpgrade({
      consentRequestId,
      decision: decisionRaw,
      declineReason,
      requestingUserId: userId,
      correlationId:
        typeof body?.correlationId === 'string' && body.correlationId.trim()
          ? body.correlationId.trim()
          : req.correlationId,
    });
    res.status(200).json(successResponse<ModalityChangeResult>(result, req));
  },
);

// ============================================================================
// GET /consultation/:sessionId/modality-change/state
// ============================================================================

export const modalityChangeStateHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Authentication required');
    const sessionId = parseSessionId(req);

    const state = await getModalityChangeState(sessionId);
    if (!state) {
      // 200 with nulls on the state surface keeps the UI's state machine
      // simple — the launcher greys out if `state === null`.
      res.status(200).json(successResponse({ state: null }, req));
      return;
    }
    res.status(200).json(successResponse({ state }, req));
  },
);

// ============================================================================
// GET /consultation/:sessionId/modality-change/history   (Plan 09 · Task 55)
// ============================================================================

/**
 * Post-consult modality-history timeline read. Returns the full
 * chronological transition list + session summary so the frontend can
 * render the synthetic "Started as X" / "Consult ended" anchors.
 *
 * AuthZ: session participants only (doctor OR patient). Service
 * re-checks `requestingUserId` against the session's seats; the DB's
 * `modality_history_select_participants` RLS policy is the secondary
 * line of defence (service role bypasses RLS; application-layer
 * check is the load-bearing one here).
 */
export const modalityChangeHistoryHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Authentication required');
    const sessionId = parseSessionId(req);

    const result = await getModalityHistory(sessionId, userId);
    if (!result.ok) {
      switch (result.error) {
        case 'session_not_found':
          throw new NotFoundError('Consultation session not found');
        case 'forbidden':
          throw new ForbiddenError('You are not a participant of this session');
        case 'internal_error':
        default:
          throw new InternalError(
            `Could not load modality history${result.detail ? `: ${result.detail}` : ''}`,
          );
      }
    }
    res.status(200).json(successResponse(result.data, req));
  },
);

// ============================================================================
// Non-Express hook: Razorpay mid-consult `payment.captured` dispatch.
// ============================================================================

/**
 * Called from `webhook-worker.ts` after signature verification +
 * idempotency check. Task 49 wires this into the dispatch switch:
 *
 *   if (event.event === 'payment.captured') {
 *     const orderId = event.payload.payment.entity.order_id;
 *     const mid = await fetchPendingByRazorpayOrderId(admin, orderId);
 *     if (mid) { await handleModalityChangePaymentCapturedHook({ ... }); }
 *   }
 *
 * The hook re-opens the state-machine's commit branch for the paid-
 * upgrade flow. Failure surfaces as a `provider_failure` rejection +
 * compensating refund — logged; the worker's dead-letter queue
 * doesn't need to retry (the compensating-refund path handles it).
 */
export async function handleModalityChangePaymentCapturedHook(
  input: ModalityPaymentCapturedInput,
): Promise<ModalityChangeResult> {
  return handleModalityChangePaymentCaptured(input);
}
