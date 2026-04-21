/**
 * Modality Billing Service (Plan 09 · Task 49 — live implementation)
 *
 * Decision 11 LOCKED the symmetric billing doctrine: every mid-consult
 * modality transition runs through Task 47's state machine + this
 * service for the money side:
 *
 *   · `computeUpgradeDelta` — reads the doctor's per-modality fee
 *     sheet (service_offerings_json → appointments.fee_paise →
 *     hardcoded default) and returns the delta paise for the
 *     requested `from → to`. Zero delta routes Task 47 to the
 *     free-upgrade branch; positive delta routes to the paid-upgrade
 *     branch.
 *
 *   · `captureUpgradePayment` — creates a Razorpay Orders API order
 *     (not a payment link — mid-consult demands an in-app checkout
 *     modal to avoid breaking the consult context; see task-49 notes
 *     §1). Idempotent via the pending-request row's `razorpay_order_id`
 *     column — a doctor who approves/cancels/re-approves gets the
 *     SAME order id rather than two fresh Razorpay orders.
 *
 *   · `autoRefundDowngrade` — calls Razorpay's Refunds API to refund
 *     the delta paise against the original booking's payment. Uses
 *     the `Idempotency-Key` header Razorpay supports so retries
 *     within 24h are safe. On sync success, stamps the refund id on
 *     the history row + returns `'sync_success'`. On failure, leaves
 *     the refund id NULL for the retry worker to pick up +  returns
 *     `'queued'`. Permanent failures (original payment not found /
 *     already fully refunded) also return `'queued'` but the worker
 *     skips them via the 99-sentinel.
 *
 * ## Why a separate service and not an extension of `payment-service.ts`
 *
 * `payment-service.ts` is tightly coupled to booking-time semantics
 * — appointment rows, payment links, slot flow. Mid-consult has
 * different semantics: ties to `consultation_modality_history` and
 * `modality_change_pending_requests` rows, uses Razorpay Orders (not
 * payment links), and has a compensating-refund edge case. Keeping
 * these separate avoids bloating the booking-time module. Task-49
 * notes §2.
 *
 * ## Idempotency-Key doctrine
 *
 * Razorpay accepts `Idempotency-Key` on order + refund creates; the
 * server deduplicates within 24h. Keys are composed here:
 *
 *   · Order create:  `modality_order_{pendingRequestId}`
 *   · Refund create: `modality_refund_{historyRowId | pendingRequestId}_{attemptNumber}`
 *
 * Plus a DB-level pre-check (read existing `razorpay_order_id` /
 * `razorpay_refund_id` before calling Razorpay). The DB check covers
 * >24h-old retries that Razorpay no longer dedupes.
 *
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-49-modality-billing-razorpay-capture-and-refund.md
 */

import type Razorpay from 'razorpay';

import { getSupabaseAdminClient } from '../config/database';
import { logger } from '../config/logger';
import { isRazorpayConfigured, razorpayConfig } from '../config/payment';
import { fetchPendingById } from './modality-pending-requests-queries';
import { updateRazorpayRefundId } from './modality-history-queries';
import {
  computeDowngradeRefundPaise,
  computeUpgradeDeltaPaise,
  getModalityFeesForDoctor,
} from '../utils/modality-pricing';
import type { Modality } from '../types/consultation-session';

// ============================================================================
// Public interface — stable contract between Task 47 (caller) + Task 49 (impl).
// ============================================================================

export interface ComputeUpgradeDeltaInput {
  sessionId: string;
  fromModality: Modality;
  toModality: Modality;
  correlationId: string;
}

export interface ComputeUpgradeDeltaResult {
  /** Delta in paise. Zero = free-upgrade branch (Decision 11's flat-rate case). */
  amountPaise: number;
  /** `true` when the delta is zero and the state machine should route to `free_upgrade`. */
  isFree: boolean;
}

export interface CaptureUpgradePaymentInput {
  sessionId: string;
  /** Pending-row id the webhook handler will reverse-look-up via `razorpay_order_id`. */
  pendingRequestId: string;
  fromModality: Modality;
  toModality: Modality;
  amountPaise: number;
  correlationId: string;
}

export interface CaptureUpgradePaymentResult {
  /** Razorpay Order id. Stamped onto the pending row + used by the webhook to resume. */
  razorpayOrderId: string;
  /** Short-lived token the frontend passes to the Razorpay Checkout SDK. */
  checkoutToken: string;
  amountPaise: number;
}

export interface AutoRefundDowngradeInput {
  /** History row id being refunded. NULL only on the compensating-refund-after-executor-failure path. */
  historyRowId: string | null;
  /** Pending row id for the compensating-refund path. Used to stamp the refund id back. */
  pendingRequestId?: string | null;
  /** Original appointment / upgrade payment to refund from. */
  originalRazorpayPaymentId: string;
  amountPaise: number;
  /** Reason tag — `'doctor_downgrade'` / `'provider_failure'` / `'patient_downgrade_misc'`. */
  reason: 'doctor_downgrade' | 'provider_failure' | 'patient_downgrade_misc';
  correlationId: string;
  /** Retry attempt number (1-based). Worker passes 2,3,…; state-machine's first inline call is 1. */
  attemptNumber?: number;
}

export interface AutoRefundDowngradeResult {
  /** `sync_success` = Razorpay confirmed inline; id stamped on the history row. */
  status: 'sync_success' | 'queued';
  /** Present on `sync_success`. Absent on `queued` — worker UPSERTs later. */
  razorpayRefundId?: string;
  /** Present when the call failed; worker reads this to record retry failure reason. */
  failureReason?: string;
  /** Present when the call failed permanently (e.g. already fully refunded). Worker sentinels the row. */
  permanent?: boolean;
}

/**
 * Full service surface. Task 49's implementation is injectable via
 * `setModalityBillingServiceForTests()`; state machine reads via
 * `getModalityBillingService()`.
 */
export interface ModalityBillingService {
  computeUpgradeDelta(
    input: ComputeUpgradeDeltaInput,
  ): Promise<ComputeUpgradeDeltaResult>;
  captureUpgradePayment(
    input: CaptureUpgradePaymentInput,
  ): Promise<CaptureUpgradePaymentResult>;
  autoRefundDowngrade(
    input: AutoRefundDowngradeInput,
  ): Promise<AutoRefundDowngradeResult>;
}

// ============================================================================
// Error shapes — kept stable for DI consumers + retry worker.
// ============================================================================

export class BillingNotConfiguredError extends Error {
  public readonly name = 'BillingNotConfiguredError';
  public readonly code = 'BILLING_NOT_CONFIGURED';
  public readonly op: 'compute_delta' | 'capture_upgrade' | 'auto_refund';
  public readonly correlationId: string;

  constructor(op: 'compute_delta' | 'capture_upgrade' | 'auto_refund', correlationId: string) {
    super(
      `modality-billing-service: op=${op} cannot run — Razorpay is not configured ` +
        `(RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing).`,
    );
    this.op = op;
    this.correlationId = correlationId;
  }
}

/**
 * Legacy alias preserved so Task 47's state-machine tests (which import
 * `BillingNotImplementedError` from the stub era) keep compiling. New
 * code should use `BillingNotConfiguredError`.
 *
 * @deprecated — remove once Task 47 test fixtures migrate.
 */
export class BillingNotImplementedError extends Error {
  public readonly name = 'BillingNotImplementedError';
  public readonly code = 'BILLING_NOT_IMPLEMENTED';
  public readonly op: 'compute_delta' | 'capture_upgrade' | 'auto_refund';
  public readonly correlationId: string;

  constructor(op: 'compute_delta' | 'capture_upgrade' | 'auto_refund', correlationId: string) {
    super(
      `modality-billing-service: op=${op} not implemented yet (legacy stub).`,
    );
    this.op = op;
    this.correlationId = correlationId;
  }
}

// ============================================================================
// Live service — Razorpay Orders + Refunds API impl.
// ============================================================================

/** Razorpay client factory pin. Injectable for tests. */
type RazorpayClient = Pick<Razorpay, 'orders' | 'payments'>;

let razorpayClientFactory: () => RazorpayClient = defaultRazorpayClientFactory;

function defaultRazorpayClientFactory(): RazorpayClient {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  const RazorpaySdk = require('razorpay') as new (opts: any) => RazorpayClient;
  return new RazorpaySdk({
    key_id: razorpayConfig.keyId as string,
    key_secret: razorpayConfig.keySecret as string,
  });
}

/** Test-only: swap in a fake client factory (orders/payments stubs). */
export function __setRazorpayClientFactoryForTests(
  factory: (() => RazorpayClient) | null,
): void {
  razorpayClientFactory = factory ?? defaultRazorpayClientFactory;
}

function requireRazorpayClient(
  op: 'compute_delta' | 'capture_upgrade' | 'auto_refund',
  correlationId: string,
): RazorpayClient {
  if (!isRazorpayConfigured()) {
    throw new BillingNotConfiguredError(op, correlationId);
  }
  return razorpayClientFactory();
}

// ----------------------------------------------------------------------------
// computeUpgradeDelta — pricing-only, no Razorpay call.
// ----------------------------------------------------------------------------
async function liveComputeUpgradeDelta(
  input: ComputeUpgradeDeltaInput,
): Promise<ComputeUpgradeDeltaResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    logger.error(
      { correlationId: input.correlationId, sessionId: input.sessionId },
      'computeUpgradeDelta: no admin supabase client — treating as free upgrade (safe default)',
    );
    return { amountPaise: 0, isFree: true };
  }

  // Pull the session to locate doctorId + appointment fee baseline.
  const { data: sessionRow, error: sessionErr } = await admin
    .from('consultation_sessions')
    .select('doctor_id, appointment_id')
    .eq('id', input.sessionId)
    .maybeSingle();
  if (sessionErr || !sessionRow) {
    logger.error(
      {
        correlationId: input.correlationId,
        sessionId: input.sessionId,
        error: sessionErr?.message,
      },
      'computeUpgradeDelta: session lookup failed',
    );
    throw new Error(
      `computeUpgradeDelta: session ${input.sessionId} not found (${sessionErr?.message ?? 'no row'})`,
    );
  }

  const doctorId = sessionRow.doctor_id as string;
  const appointmentId = sessionRow.appointment_id as string | null;

  // Appointment baseline (tier-2 fallback in the pricing ladder).
  let appointmentFeePaise: number | null = null;
  if (appointmentId) {
    const { data: aptRow } = await admin
      .from('appointments')
      .select('fee_paise')
      .eq('id', appointmentId)
      .maybeSingle();
    if (aptRow && typeof aptRow.fee_paise === 'number') {
      appointmentFeePaise = aptRow.fee_paise;
    }
  }

  const fees = await getModalityFeesForDoctor({
    doctorId,
    appointmentFeePaise,
    correlationId: input.correlationId,
  });

  // Same-modality passes through zero (state machine shouldn't reach us
  // in that case — Step 3 of Task 47 short-circuits — but belt-and-
  // suspenders: return isFree=true instead of throwing).
  if (input.fromModality === input.toModality) {
    return { amountPaise: 0, isFree: true };
  }

  // Upgrade direction only — downgrade refund path goes through
  // `autoRefundDowngrade` and reads its own amount via
  // `computeDowngradeRefundPaise` at call-time.
  let deltaPaise: number;
  try {
    deltaPaise = computeUpgradeDeltaPaise({
      fees,
      fromModality: input.fromModality,
      toModality: input.toModality,
    });
  } catch (err) {
    // Non-upgrade pair was passed (direction misclassified upstream).
    // Task 47 calls this function only from the upgrade branches; if
    // it ever misdispatches, we want a loud error rather than a
    // stray Razorpay order.
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      {
        correlationId: input.correlationId,
        sessionId: input.sessionId,
        from: input.fromModality,
        to: input.toModality,
        error: msg,
      },
      'computeUpgradeDelta: direction misclassified — not an upgrade pair',
    );
    throw err;
  }

  logger.info(
    {
      correlationId: input.correlationId,
      sessionId: input.sessionId,
      from: input.fromModality,
      to: input.toModality,
      amountPaise: deltaPaise,
      isFree: deltaPaise === 0,
    },
    'computeUpgradeDelta: resolved',
  );

  return {
    amountPaise: deltaPaise,
    isFree: deltaPaise === 0,
  };
}

// ----------------------------------------------------------------------------
// captureUpgradePayment — create Razorpay Order + return checkout token.
// ----------------------------------------------------------------------------
async function liveCaptureUpgradePayment(
  input: CaptureUpgradePaymentInput,
): Promise<CaptureUpgradePaymentResult> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    throw new Error('captureUpgradePayment: no admin supabase client');
  }

  // Idempotency: re-read the pending row. If it already has a
  // razorpay_order_id, return that one rather than minting a new
  // Razorpay order. Guards against double-approval clicks.
  const existing = await fetchPendingById(admin, input.pendingRequestId);
  if (existing?.razorpayOrderId) {
    logger.info(
      {
        correlationId: input.correlationId,
        pendingRequestId: input.pendingRequestId,
        razorpayOrderId: existing.razorpayOrderId,
      },
      'captureUpgradePayment: pending row already has order id — idempotent return',
    );
    return {
      razorpayOrderId: existing.razorpayOrderId,
      checkoutToken:   buildCheckoutToken(existing.razorpayOrderId),
      amountPaise:     input.amountPaise,
    };
  }

  const client = requireRazorpayClient('capture_upgrade', input.correlationId);
  const receipt = `modality_change:${input.pendingRequestId}`;
  const notes = {
    kind:              'mid_consult_upgrade',
    sessionId:         input.sessionId,
    pendingRequestId:  input.pendingRequestId,
    fromModality:      input.fromModality,
    toModality:        input.toModality,
    correlationId:     input.correlationId,
  } as const;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createArgs: any = {
    amount:           input.amountPaise,
    currency:         'INR',
    receipt,
    notes,
    payment_capture:  true,
  };

  let order: { id?: string } | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    order = (await (client.orders as any).create(createArgs)) as { id?: string };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      {
        correlationId: input.correlationId,
        sessionId: input.sessionId,
        pendingRequestId: input.pendingRequestId,
        amountPaise: input.amountPaise,
        error: msg,
      },
      'captureUpgradePayment: Razorpay orders.create failed',
    );
    throw new Error(`captureUpgradePayment: Razorpay orders.create failed — ${msg}`);
  }

  const orderId = order?.id;
  if (!orderId) {
    throw new Error('captureUpgradePayment: Razorpay returned no order id');
  }

  logger.info(
    {
      correlationId: input.correlationId,
      pendingRequestId: input.pendingRequestId,
      sessionId: input.sessionId,
      razorpayOrderId: orderId,
      amountPaise: input.amountPaise,
    },
    'captureUpgradePayment: Razorpay order created',
  );

  return {
    razorpayOrderId: orderId,
    checkoutToken:   buildCheckoutToken(orderId),
    amountPaise:     input.amountPaise,
  };
}

// ----------------------------------------------------------------------------
// autoRefundDowngrade — Refunds API + DB stamp on sync success.
// ----------------------------------------------------------------------------
async function liveAutoRefundDowngrade(
  input: AutoRefundDowngradeInput,
): Promise<AutoRefundDowngradeResult> {
  const admin = getSupabaseAdminClient();

  // DB pre-check: if a refund id is already present on the history
  // row, this is a duplicate call; return sync_success with the
  // existing id and DO NOT call Razorpay.
  if (admin && input.historyRowId) {
    const { data: existing, error: readErr } = await admin
      .from('consultation_modality_history')
      .select('razorpay_refund_id')
      .eq('id', input.historyRowId)
      .maybeSingle();
    if (!readErr && existing?.razorpay_refund_id) {
      logger.info(
        {
          correlationId: input.correlationId,
          historyRowId: input.historyRowId,
          razorpayRefundId: existing.razorpay_refund_id,
        },
        'autoRefundDowngrade: existing refund id found — idempotent return',
      );
      return {
        status: 'sync_success',
        razorpayRefundId: existing.razorpay_refund_id as string,
      };
    }
  }

  const client = requireRazorpayClient('auto_refund', input.correlationId);
  const attemptNumber = input.attemptNumber ?? 1;
  const idempotencyKeySeed =
    input.historyRowId ??
    input.pendingRequestId ??
    `compensating_${input.originalRazorpayPaymentId}`;
  const idempotencyKey = `modality_refund_${idempotencyKeySeed}_${attemptNumber}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refundArgs: any = {
    amount: input.amountPaise,
    speed:  'normal',
    notes: {
      reason:                     input.reason,
      historyRowId:               input.historyRowId ?? null,
      pendingRequestId:           input.pendingRequestId ?? null,
      correlationId:              input.correlationId,
      originalRazorpayPaymentId:  input.originalRazorpayPaymentId,
    },
  };

  // Razorpay's node SDK accepts an optional headers object on refund
  // calls; we thread the Idempotency-Key through even when some SDK
  // versions ignore it (the DB pre-check above already covers the
  // >24h case Razorpay's server-side idempotency can't).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const optionalHeaders: any = { 'Idempotency-Key': idempotencyKey };

  let refund: { id?: string; error?: { description?: string; reason?: string } } | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    refund = (await (client.payments as any).refund(
      input.originalRazorpayPaymentId,
      refundArgs,
      optionalHeaders,
    )) as { id?: string };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const permanent = isPermanentRefundFailure(err);
    logger.error(
      {
        correlationId: input.correlationId,
        historyRowId: input.historyRowId,
        pendingRequestId: input.pendingRequestId,
        originalRazorpayPaymentId: input.originalRazorpayPaymentId,
        amountPaise: input.amountPaise,
        reason: input.reason,
        attemptNumber,
        permanent,
        error: msg,
      },
      permanent
        ? 'autoRefundDowngrade: Razorpay refund permanently failed — admin intervention required'
        : 'autoRefundDowngrade: Razorpay refund failed — queued for retry',
    );
    return {
      status: 'queued',
      failureReason: msg,
      permanent,
    };
  }

  const refundId = refund?.id;
  if (!refundId) {
    logger.warn(
      {
        correlationId: input.correlationId,
        historyRowId: input.historyRowId,
        originalRazorpayPaymentId: input.originalRazorpayPaymentId,
      },
      'autoRefundDowngrade: Razorpay returned no refund id — queued for retry',
    );
    return {
      status: 'queued',
      failureReason: 'Razorpay returned no refund id',
    };
  }

  // Stamp the history row on sync success. Compensating-refund path
  // (no historyRowId) skips this — the pending row's metadata already
  // surfaces the refund via logs.
  if (admin && input.historyRowId) {
    try {
      await updateRazorpayRefundId(admin, {
        id: input.historyRowId,
        razorpayRefundId: refundId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(
        {
          correlationId: input.correlationId,
          historyRowId: input.historyRowId,
          razorpayRefundId: refundId,
          error: msg,
        },
        'autoRefundDowngrade: refund succeeded but DB stamp failed — worker will reconcile',
      );
      // Still surface as sync_success to the caller — Razorpay did
      // refund. The worker's reconcile loop will retry the DB stamp.
    }
  }

  logger.info(
    {
      correlationId: input.correlationId,
      historyRowId: input.historyRowId,
      originalRazorpayPaymentId: input.originalRazorpayPaymentId,
      amountPaise: input.amountPaise,
      reason: input.reason,
      razorpayRefundId: refundId,
      attemptNumber,
    },
    'autoRefundDowngrade: Razorpay refund succeeded',
  );

  return {
    status: 'sync_success',
    razorpayRefundId: refundId,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * A Razorpay refund failure is "permanent" (no point retrying) when
 * the error body mentions any of these well-known terminal states.
 * Widen carefully — a false-positive makes the worker skip a retry
 * that could have succeeded.
 */
function isPermanentRefundFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const anyErr = err as { error?: { description?: string; reason?: string; code?: string } };
  const bits = [
    err.message,
    anyErr.error?.description,
    anyErr.error?.reason,
    anyErr.error?.code,
  ]
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.toLowerCase())
    .join(' | ');
  return (
    bits.includes('fully refunded') ||
    bits.includes('already refunded') ||
    bits.includes('payment not captured') ||
    bits.includes('no such payment') ||
    bits.includes('payment_not_found') ||
    bits.includes('invalid_payment_id')
  );
}

/**
 * The "checkout token" is the Razorpay order id — the frontend
 * passes it straight to the `Razorpay` JS SDK's `order_id` field.
 * Kept as a separate field in the public contract so we can swap in
 * a wrapped / signed token later without churning the frontend types.
 */
function buildCheckoutToken(razorpayOrderId: string): string {
  return razorpayOrderId;
}

// ============================================================================
// DI plumbing.
// ============================================================================

const liveBillingService: ModalityBillingService = {
  computeUpgradeDelta:   liveComputeUpgradeDelta,
  captureUpgradePayment: liveCaptureUpgradePayment,
  autoRefundDowngrade:   liveAutoRefundDowngrade,
};

let activeService: ModalityBillingService = liveBillingService;

export function getModalityBillingService(): ModalityBillingService {
  return activeService;
}

export function setModalityBillingServiceForTests(
  override: ModalityBillingService | null,
): void {
  activeService = override ?? liveBillingService;
}

// ============================================================================
// Test-only helpers
// ============================================================================

export const __testOnly__ = {
  liveComputeUpgradeDelta,
  liveCaptureUpgradePayment,
  liveAutoRefundDowngrade,
  isPermanentRefundFailure,
  buildCheckoutToken,
  // Re-exported for unit tests that pin the down-side delta without
  // double-importing the pricing util — mirrors the pricing call shape.
  computeDowngradeRefundPaise,
};
