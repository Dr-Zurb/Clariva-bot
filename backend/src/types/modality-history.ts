/**
 * Consultation Modality History Types (Plan 09 · Task 46 · Decision 11 LOCKED)
 *
 * Shapes the Migration 075 schema extensions that light up Plan 09:
 *   - `modality_billing_action` ENUM (four values covering paid/free ×
 *     upgrade/downgrade) and `modality_initiator` ENUM (patient | doctor).
 *   - `consultation_sessions` new columns (`current_modality`,
 *     `upgrade_count`, `downgrade_count`) — the rate-limit counters and
 *     the denormalised-active-modality pointer Task 47's state machine
 *     reads in O(1).
 *   - `consultation_modality_history` row type + a discriminated-union
 *     view that narrows `amount_paise` / `razorpay_payment_id` /
 *     `razorpay_refund_id` per `billingAction`. Task 47 + Task 49 + Task 55
 *     consume the narrow union so the type system enforces the
 *     `modality_history_billing_shape` CHECK at compile time.
 *
 * Co-located here (rather than `types/database.ts`) to match the
 * consultation-era convention (see `consultation-transcript.ts`,
 * `consultation-session.ts`, `video-recording-audit.ts`) — `database.ts`
 * stays the home for the pre-consultation core domain (Appointment,
 * Patient, Conversation, …).
 *
 * Field names are camelCase at the service boundary; the persisted rows
 * use snake_case column names in Postgres. Query helpers in
 * `modality-history-queries.ts` map at the Supabase adapter boundary.
 *
 * @see backend/migrations/075_consultation_modality_history.sql
 * @see docs/Development/Daily-plans/April 2026/19-04-2026/Tasks/task-46-modality-history-schema-and-counters-migration.md
 */

import type { Modality } from './consultation-session';

// ============================================================================
// Enums — mirror the Postgres ENUMs + TEXT+CHECK shapes in Migration 075.
// ============================================================================

/**
 * Billing disposition of a modality transition (Decision 11's 2x2 matrix).
 *
 * The four values span upgrade/downgrade × paid/free:
 *   - `paid_upgrade`          — text/voice → voice/video with a price gap.
 *   - `free_upgrade`          — transition inside the same fee tier (rare;
 *                               e.g. same-priced text → voice under a flat-
 *                               rate catalog).
 *   - `no_refund_downgrade`   — voice/video → text/voice with no refund
 *                               (e.g. patient-initiated downgrade under a
 *                               package rate where the fee isn't tier-split).
 *   - `auto_refund_downgrade` — doctor-initiated downgrade that auto-
 *                               refunds the delta via Task 49's Razorpay
 *                               refund worker.
 *
 * Postgres ENUM `modality_billing_action`. Widens via `ALTER TYPE … ADD
 * VALUE` if a future billing scheme lands (monthly bundles, partial
 * refunds, promos). v1 pins the four values above.
 */
export type ModalityBillingAction =
  | 'paid_upgrade'
  | 'free_upgrade'
  | 'no_refund_downgrade'
  | 'auto_refund_downgrade';

/**
 * Who initiated the transition. Patient taps the in-consult
 * `<ModalityChangeButton>` (Plan 09 Task 50) for upgrades / downgrades;
 * doctor initiates via the doctor-side equivalent (Task 52).
 *
 * Postgres ENUM `modality_initiator`.
 */
export type ModalityInitiator = 'patient' | 'doctor';

/**
 * Preset-reason tag the initiator picks from a radio-button list. TEXT +
 * CHECK (not ENUM) in Migration 075 so new network/clinical reasons can
 * widen additively. `null` allowed at the row level for future non-modal
 * callers (Plan 10+ analytics may back-fill historical transitions
 * without a preset).
 *
 * Doctor-initiated reasons: `visible_symptom` / `need_to_hear_voice` /
 *   `patient_request` / `case_doesnt_need_modality`.
 * Patient-initiated reasons: `network_or_equipment` / `patient_environment` /
 *   `patient_request` (patient re-uses the doctor code for "I asked for
 *   the change").
 * Shared: `other` (free-text reason carries the specifics).
 */
export type ModalityPresetReasonCode =
  | 'visible_symptom'
  | 'need_to_hear_voice'
  | 'patient_request'
  | 'network_or_equipment'
  | 'case_doesnt_need_modality'
  | 'patient_environment'
  | 'other';

// ============================================================================
// Row shapes — camelCase mirrors of the Migration 075 tables.
// ============================================================================

/**
 * Mirror of `consultation_sessions` after Migration 075. Only the new
 * columns are typed here; existing columns live in
 * `types/consultation-session.ts` (`SessionRecord`). Task 47's state
 * machine merges both shapes when it reads the session row.
 */
export interface ConsultationSessionModalityCounters {
  /**
   * Denormalised pointer to the currently-active modality. Backfilled
   * from `modality` on existing rows at migration time. Updated by
   * Task 47's transition transaction alongside the matching
   * `consultation_modality_history` row.
   */
  currentModality: Modality;
  /**
   * Rate-limit counter for paid_upgrade + free_upgrade transitions.
   * Hard-capped at 1 by CHECK `consultation_sessions_upgrade_count_max_check`.
   */
  upgradeCount: number;
  /**
   * Rate-limit counter for auto_refund_downgrade + no_refund_downgrade
   * transitions. Hard-capped at 1 by CHECK
   * `consultation_sessions_downgrade_count_max_check`.
   */
  downgradeCount: number;
}

/**
 * Wide row shape as Supabase returns it after the snake→camel remap.
 * Includes every column — the DB-level `modality_history_billing_shape`
 * CHECK constrains which fields are set per `billingAction`, but at
 * this layer all four optional fields are typed as nullable.
 *
 * Prefer `ModalityHistoryEntry` (the discriminated union below) at
 * service boundaries — it carries the billing-shape invariant at the
 * type system level so downstream code doesn't re-check runtime.
 */
export interface ModalityHistoryRowWide {
  id: string;
  sessionId: string;
  fromModality: Modality;
  toModality: Modality;
  initiatedBy: ModalityInitiator;
  billingAction: ModalityBillingAction;
  amountPaise: number | null;
  razorpayPaymentId: string | null;
  razorpayRefundId: string | null;
  reason: string | null;
  presetReasonCode: ModalityPresetReasonCode | null;
  correlationId: string | null;
  occurredAt: string;
}

/**
 * Discriminated union view of `ModalityHistoryRowWide` that narrows the
 * billing-shape fields per `billingAction`. Mirrors the DB row-shape
 * CHECK `modality_history_billing_shape` in the type system:
 *
 *   | billingAction            | amountPaise | razorpayPaymentId | razorpayRefundId |
 *   |--------------------------|-------------|-------------------|------------------|
 *   | paid_upgrade             | number      | string            | null             |
 *   | auto_refund_downgrade    | number      | null              | string | null    |
 *   | free_upgrade             | null        | null              | null             |
 *   | no_refund_downgrade      | null        | null              | null             |
 *
 * Task 47 + 49 + 55 consume this narrowed type so the compiler catches
 * "read razorpayPaymentId on a free_upgrade row" bugs before they ship.
 */
export type ModalityHistoryEntry =
  | (ModalityHistoryShared & {
      billingAction: 'paid_upgrade';
      amountPaise: number;
      razorpayPaymentId: string;
      razorpayRefundId: null;
    })
  | (ModalityHistoryShared & {
      billingAction: 'auto_refund_downgrade';
      amountPaise: number;
      razorpayPaymentId: null;
      /** NULL during refund-retry; filled by Task 49's worker on Razorpay confirm. */
      razorpayRefundId: string | null;
    })
  | (ModalityHistoryShared & {
      billingAction: 'free_upgrade';
      amountPaise: null;
      razorpayPaymentId: null;
      razorpayRefundId: null;
    })
  | (ModalityHistoryShared & {
      billingAction: 'no_refund_downgrade';
      amountPaise: null;
      razorpayPaymentId: null;
      razorpayRefundId: null;
    });

/**
 * Fields shared across every `ModalityHistoryEntry` variant. Split out
 * so the variant declarations above stay readable.
 */
interface ModalityHistoryShared {
  id: string;
  sessionId: string;
  fromModality: Modality;
  toModality: Modality;
  initiatedBy: ModalityInitiator;
  reason: string | null;
  presetReasonCode: ModalityPresetReasonCode | null;
  correlationId: string | null;
  occurredAt: string;
}

// ============================================================================
// Insert / Update shapes — narrow payloads for the query helpers.
// ============================================================================

/**
 * Insert shape for Task 47's state machine. `id`, `occurredAt` default
 * at the DB layer; the caller supplies the transition context. The
 * billing-shape discriminated union is preserved here so bad payloads
 * fail at the TypeScript layer before they round-trip to Postgres.
 *
 * The "Shared" fields mirror `ModalityHistoryShared` minus `id` +
 * `occurredAt` (both default in the DB). `correlationId` is
 * intentionally required (not optional) — Task 47's state machine
 * always threads a correlation id; omitting it would break observability.
 */
export type InsertModalityHistoryRow =
  | (InsertModalityHistoryShared & {
      billingAction: 'paid_upgrade';
      amountPaise: number;
      razorpayPaymentId: string;
      razorpayRefundId?: null;
    })
  | (InsertModalityHistoryShared & {
      billingAction: 'auto_refund_downgrade';
      amountPaise: number;
      razorpayPaymentId?: null;
      /** Optional — typically NULL at insert, UPSERTed by Task 49's worker. */
      razorpayRefundId?: string | null;
    })
  | (InsertModalityHistoryShared & {
      billingAction: 'free_upgrade';
      amountPaise?: null;
      razorpayPaymentId?: null;
      razorpayRefundId?: null;
    })
  | (InsertModalityHistoryShared & {
      billingAction: 'no_refund_downgrade';
      amountPaise?: null;
      razorpayPaymentId?: null;
      razorpayRefundId?: null;
    });

interface InsertModalityHistoryShared {
  sessionId: string;
  fromModality: Modality;
  toModality: Modality;
  initiatedBy: ModalityInitiator;
  /**
   * Required for doctor-initiated rows AND patient-initiated downgrades;
   * optional for patient-initiated upgrades (enforced by the DB-level
   * `modality_history_reason_required` CHECK). Callers that pass
   * `undefined` for the latter case rely on the DB CHECK, not the
   * compiler, to catch the "doctor row missing reason" case.
   */
  reason?: string | null;
  presetReasonCode?: ModalityPresetReasonCode | null;
  correlationId: string;
}

/**
 * Update shape for Task 49's refund retry worker. Fills the `razorpay_refund_id`
 * on an existing `auto_refund_downgrade` row once Razorpay confirms.
 * Immutable everything else — modality history is append-only apart
 * from this one field.
 */
export interface UpdateModalityHistoryRefundId {
  id: string;
  razorpayRefundId: string;
}

// ============================================================================
// Response shape — GET /consultation/:sessionId/modality-change/history
// ============================================================================

/**
 * Session summary block returned alongside the timeline entries.
 * Frames the chronological list with the synthetic "started as" /
 * "ended at" anchors the UI renders above + below the actual
 * transition rows.
 */
export interface ModalityHistorySessionSummary {
  id: string;
  /** `consultation_sessions.modality` — the modality the consult started at. */
  initialModality: Modality;
  /**
   * `consultation_sessions.current_modality` — reflects the final state
   * on a completed consult (or the in-flight state if the endpoint is
   * called mid-consult, which v1 doesn't recommend).
   */
  currentModality: Modality;
  upgradeCount: number;
  downgradeCount: number;
  /** ISO-8601 — `actual_started_at`; falls back to `created_at`. */
  startedAt: string;
  /** ISO-8601 — `actual_ended_at`; `null` while the consult is live. */
  endedAt: string | null;
  /** `consultation_sessions.status` — 'live' / 'ended' / etc. */
  status: string;
}

/**
 * One row of the Task 55 timeline projection. Mirrors the
 * `ModalityHistoryRowWide` shape but drops `correlationId` (internal
 * observability; not surfaced to end users) and adds a derived
 * `refundFailedPermanent` flag the UI renders as the red "Support
 * contacted" badge when Task 49's retry worker has exhausted its
 * budget (`refund_retry_count >= REFUND_RETRY_PERMANENT_SENTINEL`).
 */
export interface ModalityHistoryTimelineEntry {
  id: string;
  fromModality: Modality;
  toModality: Modality;
  initiatedBy: ModalityInitiator;
  billingAction: ModalityBillingAction;
  amountPaise: number | null;
  razorpayPaymentId: string | null;
  /**
   * `null` when the refund is still pending (Task 49's retry worker has
   * not yet confirmed with Razorpay) or when the billing action is not
   * `auto_refund_downgrade`. Non-null only on settled refunds.
   */
  razorpayRefundId: string | null;
  /**
   * `true` iff Task 49's retry worker has written the permanent-failure
   * sentinel (`refund_retry_count = 99`) onto the row. The UI renders
   * the "Support contacted" badge + the red status. Only meaningful
   * for `auto_refund_downgrade` rows; always `false` for the other
   * three billing actions.
   */
  refundFailedPermanent: boolean;
  reason: string | null;
  presetReasonCode: ModalityPresetReasonCode | null;
  occurredAt: string;
}

/**
 * GET /consultation/:sessionId/modality-change/history envelope body.
 * Consumed by Task 55's `<ModalityHistoryTimeline>` component.
 */
export interface ModalityHistoryResponse {
  session: ModalityHistorySessionSummary;
  entries: ModalityHistoryTimelineEntry[];
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Direction classifier used by Task 47 + Task 55. Pinned here (not in
 * `consultation-session.ts`) because it depends on the modality-history
 * ENUM ordering contract — text < voice < video per Migration 049 line
 * 36. If the ENUM is ever ALTERed with `ADD VALUE BEFORE`, this helper
 * AND the DB-level `modality_history_reason_required` CHECK must be
 * rewritten together (see Migration 075 head comment for the refactor
 * path).
 *
 * Callers: Task 47 (rate-limit counter selection — upgrade vs downgrade);
 * Task 55 (timeline badge label); Task 50/52 (button-copy decision).
 */
export function classifyModalityDirection(
  from: Modality,
  to: Modality,
): 'upgrade' | 'downgrade' | 'noop' {
  const rank: Record<Modality, number> = { text: 0, voice: 1, video: 2 };
  if (rank[to] > rank[from]) return 'upgrade';
  if (rank[to] < rank[from]) return 'downgrade';
  return 'noop';
}
