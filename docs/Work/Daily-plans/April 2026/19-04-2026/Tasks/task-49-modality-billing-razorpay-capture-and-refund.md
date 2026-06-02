# Task 49: `modality-billing-service.ts` — Razorpay mid-consult capture + auto-refund + retry worker (Decision 11 LOCKED · **payment-correctness critical**)

## 19 April 2026 — Plan [Mid-consult modality switching](../Plans/plan-09-mid-consult-modality-switching.md) — Phase A

---

## Task overview

Decision 11 LOCKED the symmetric billing doctrine. This task implements the payment side:

- **`captureUpgradePayment`** — mid-consult Razorpay order creation. Patient pays → webhook fires → Task 47's state machine commits the transition. The existing `payment-service.ts#createPaymentLink` model is *booking-time* only; mid-consult needs an in-app checkout flow (shorter UX, same trust surface) so this task introduces a **novel Razorpay Orders API** integration — not reusing payment links.
- **`autoRefundDowngrade`** — doctor-initiated downgrade refunds the delta via Razorpay Refunds API. Idempotent (won't double-refund if called twice with the same `historyRowId`).
- **`modality-refund-retry-worker.ts`** — every 15 min, scans `consultation_modality_history` rows with `billing_action='auto_refund_downgrade' AND razorpay_refund_id IS NULL`; retries with exponential backoff (1m → 5m → 15m → 1h → 6h → 24h); after 24h, surfaces in admin dashboard.
- **Compensating refund path** — when a paid upgrade succeeds at Razorpay but Task 48's executor fails, this task's `autoRefundDowngrade` is invoked by Task 47 with `reason: 'provider_failure'` to auto-undo the charge.
- **Pricing helper** — single source of truth for "what's the delta between modality X and modality Y for this doctor" (plan open question #7: `service_offerings_json.services[].fee`). Shared with Task 47 + Task 51 + Task 55.

**Critical dependency gap (flagged up-front):**

1. **No existing refund functionality in `payment-service.ts`.** Current code: `createPaymentLink` + `processPaymentSuccess` + getters. No `refund` / `createRefund` / `cancelPayment` anywhere. This task introduces **new Razorpay SDK usage** for refunds.
2. **No existing Razorpay Orders API integration.** Current flow is payment links only. This task introduces Orders-API-based capture for mid-consult UX.
3. **Pricing source is not yet crisp.** Plan open question #7 says "probably `service_offerings_json.services[].fee`"; this task **makes that decision crisp** and ships a helper function that Task 47 + 51 + 55 all call. If the schema differs, the helper is the single place to adjust.
4. **No existing retry-worker infrastructure** for this codebase (per prior Plan 05 Task 25 exploration). Task 49 either bootstraps the worker runner itself or adopts whatever Plan 05 / 08 shipped — **decision deferred to implementation time**; coordinated with Plan 05 Task 25's worker-runner if it's landed.

**Estimated time:** ~5 hours (above the plan's 4h estimate — the Orders API integration + idempotent-refund + retry worker + pricing helper + PaymentOps-facing admin dashboard surface + the compensating-refund edge case all cumulatively push above 4h).

**Status:** ✅ **Code-complete (2026-04-19).** Migration 077 + pricing helper + live billing service + refund retry worker + webhook router extension + cron route + DM copy + unit tests (14/14 + 20/20 + 11/11) + skip-gated sandbox integration scaffold all green. `tsc --noEmit` clean, ESLint clean on all touched src files, full backend suite 147/147 passing (1966 tests, 13 skipped — sandbox gates). **Owner-confirmed payment ops review strongly recommended before merge.**

### Status notes (post-implementation)

- **Pricing helper v1 simplification** — multi-service catalogs use the **MAX price across enabled services** for each modality (conservative). A follow-up task will read `session.service_key` (once Plan 09 threads it through) to pick the exact service row. Captured in `capture/inbox.md` · "modality pricing: per-service resolution when session carries service_key".
- **Admin alerts endpoint deferred** — Migration 077 ships the `admin_payment_alerts` table + the worker writes `refund_stuck_24h` rows, but the `GET /admin/payment-alerts` + acknowledge endpoint is deferred to Task 52's PaymentOps dashboard. Captured in inbox as "admin payment-alerts read/acknowledge endpoint + dashboard card".
- **Razorpay sandbox integration tests are skip-gated** (`RAZORPAY_SANDBOX_TEST=1`) matching the Task 48 pattern. When CI gets a sandbox project + teardown, lift the gate — see `tests/integration/modality-billing-against-razorpay-sandbox.test.ts` for the matrix (6 cells: Orders API happy path + idempotency, Refunds API happy path + Idempotency-Key + permanent-fail classification + DB stamp).
- **`BillingNotImplementedError` retained** as a deprecated alias so Task 47's state-machine tests (which import it from the stub era) keep compiling. Remove once Task 47 fixtures migrate to `BillingNotConfiguredError`.

**Depends on:**

- Task 46 (hard — `consultation_modality_history` table for refund state + partial index `idx_modality_history_refund_pending`).
- Task 47 (hard — caller for all functions in this task).
- Existing `payment-service.ts` (soft — new refund functions coexist; no refactor).
- Existing `backend/src/adapters/razorpay-route-adapter.ts` + `backend/src/utils/razorpay-verification.ts` (hard — signature verification reused).
- Existing `doctor_settings.service_offerings_json` schema (hard — pricing source).

**Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md)

---

## Acceptance criteria

### Pricing helper — single source of truth

- [ ] **`backend/src/utils/modality-pricing.ts`** (NEW):
  ```ts
  export interface ModalityFeeRow {
    modality:    Modality;
    feePaise:    number;            // INR → paise (multiply by 100)
    source:      'service_offerings_json' | 'appointments.fee_paise' | 'fallback_default';
  }

  export async function getModalityFeesForDoctor(input: {
    doctorId:   string;
    db?:        SupabaseClient;
  }): Promise<{ text: ModalityFeeRow; voice: ModalityFeeRow; video: ModalityFeeRow }>;
  // 1. Reads doctor_settings.service_offerings_json
  // 2. Finds services matching each modality (by a mapping of modality → service.consultation_type)
  // 3. Returns { text, voice, video } fee rows.
  // 4. Fallback ordering:
  //    a. service_offerings_json matching service
  //    b. appointments.fee_paise (original booking fee) as baseline — uncommon fallback
  //    c. Hardcoded defaults (₹100 text / ₹200 voice / ₹500 video) with warning log.

  export function computeUpgradeDeltaPaise(input: {
    fees:         { text: ModalityFeeRow; voice: ModalityFeeRow; video: ModalityFeeRow };
    fromModality: Modality;
    toModality:   Modality;
  }): number;
  // Positive when upgrade (to > from); throws if downgrade or same.

  export function computeDowngradeRefundPaise(input: {
    fees:         { ... };
    fromModality: Modality;
    toModality:   Modality;
  }): number;
  // Positive when downgrade (from > to); throws if upgrade or same.
  ```
- [ ] **Schema probe at PR time:** confirm the exact shape of `service_offerings_json.services[].consultation_type` (or `modality`) field and how it maps to `'text' | 'voice' | 'video'`. The plan open question #7 flagged this as "probably"; this task resolves.
- [ ] **Fallback warning log** when falling back to hardcoded defaults so ops can correct the `service_offerings_json`.
- [ ] **`getModalityFeesForDoctor` caches per-request** (request-scoped memo) but not across requests — doctors occasionally edit pricing and the first request post-edit should see the new value.

### `modality-billing-service.ts` — public API

- [ ] **`backend/src/services/modality-billing-service.ts`** (NEW):
  ```ts
  import Razorpay from 'razorpay';
  import { getRazorpayClient } from '../config/payment';

  export interface UpgradePaymentIntent {
    razorpayOrderId: string;
    amountPaise:     number;
    currency:        'INR';
    checkoutToken:   string;                    // used by frontend Razorpay SDK
    expiresAt:       Date;                      // Razorpay order expiry
  }

  export async function captureUpgradePayment(input: {
    sessionId:      string;
    fromModality:   Modality;
    toModality:     Modality;
    amountPaise:    number;                     // supplied by Task 47 after `computeUpgradeDeltaPaise`
    patientId:      string;
    doctorId:       string;
    correlationId:  string;
  }): Promise<UpgradePaymentIntent>;
  ```
  - Creates Razorpay order via `razorpay.orders.create({ amount, currency: 'INR', receipt: 'modality_change:${pendingRequestId}', notes: { sessionId, fromModality, toModality, correlationId, kind: 'mid_consult_upgrade' } })`.
  - `receipt` prefix `modality_change:` distinguishes these orders from booking-time payment links in ops reporting.
  - `notes.kind = 'mid_consult_upgrade'` lets the webhook controller route to the mid-consult branch.
  - Returns order_id + frontend-consumable metadata.

- [ ] **Idempotency guard.** `captureUpgradePayment` is called from Task 47's paid-approval path. If the doctor approves, cancels, re-approves, the order would be created twice. Task 47's pending-request row guards against this: the `razorpay_order_id` column is set on first create; subsequent attempts read that value + return the existing order. The billing service takes `correlationId` + checks pending row; if `razorpay_order_id IS NOT NULL`, returns the existing order's metadata rather than creating a new one.

- [ ] **Refund API:**
  ```ts
  export interface RefundResult {
    razorpayRefundId: string | null;            // null if sync call failed; enqueued for retry
    status:           'processed' | 'pending_retry' | 'failed_permanent';
    failureReason?:   string;
  }

  export async function autoRefundDowngrade(input: {
    historyRowId:              string;          // consultation_modality_history.id
    originalRazorpayPaymentId: string;          // pulled from appointments.razorpay_payment_id by Task 47
    amountPaise:               number;          // refund amount (can be partial; Razorpay supports)
    reason:                    'downgrade' | 'provider_failure';
    correlationId:             string;
  }): Promise<RefundResult>;
  ```
  - Calls Razorpay Refunds API: `razorpay.payments.refund(paymentId, { amount, speed: 'normal', notes: { reason, historyRowId, correlationId } })`.
  - **Idempotency via Razorpay's API-level idempotency key:** Razorpay refunds accept an `Idempotency-Key` header. Use `'refund_' + historyRowId + '_' + attemptNumber` as the key.
    - First attempt: key = `refund_{historyRowId}_1`.
    - Retry attempt N: key = `refund_{historyRowId}_{N}`.
    - Razorpay deduplicates within 24h on the same key, so double-fire within a retry iteration is safe.
  - **On success:** update `consultation_modality_history SET razorpay_refund_id = ? WHERE id = ?` (outside transaction; the history row is already committed by Task 47).
  - **On synchronous failure (Razorpay API returns 4xx / 5xx):** return `{ razorpayRefundId: null, status: 'pending_retry', failureReason }`. The retry worker picks it up.
  - **On permanent failure (e.g. original payment not found, already fully refunded):** return `{ status: 'failed_permanent', failureReason }` + emit a critical log for ops intervention. Task 47 / worker should NOT auto-retry permanent failures.

- [ ] **Double-refund prevention:**
  - Before calling Razorpay, SELECT the history row: if `razorpay_refund_id IS NOT NULL`, return early with `{ razorpayRefundId: existing, status: 'processed' }`. Race condition where two workers call simultaneously handled by Razorpay's idempotency key.
  - Additional guard: Razorpay's API prevents refunding more than the original captured amount. Our refund is always the *delta*, strictly less than the original capture — safe.

### Webhook controller extension

- [ ] **`backend/src/controllers/webhook-controller.ts`** (EXTEND): new branch in the `payment.captured` handler:
  ```
  if (webhook.payload.payment.notes.kind === 'mid_consult_upgrade') {
    await consultationSessionService.handleMidConsultPaymentWebhook({
      razorpayOrderId:    webhook.payload.payment.order_id,
      razorpayPaymentId:  webhook.payload.payment.id,
      sessionId:          webhook.payload.payment.notes.sessionId,
      correlationId:      webhook.payload.payment.notes.correlationId,
      signatureVerified:  true,       // already verified upstream in the webhook controller
    });
    return;
  }
  // existing booking-time payment link handling continues below
  ```
- [ ] **Signature verification reuses existing `backend/src/utils/razorpay-verification.ts`.** No new signature logic.
- [ ] **Webhook retry safety:** Razorpay retries webhooks. `handleMidConsultPaymentWebhook` is idempotent (Task 47's webhook handler re-checks "history row already exists" per this task's spec above).

### Retry worker

- [ ] **`backend/src/workers/modality-refund-retry-worker.ts`** (NEW):
  - **Schedule:** every 15 minutes (registered in the worker runner; if runner doesn't yet exist, bootstrap it here with coordination note for Plan 05 Task 25 to merge).
  - **Scan query:**
    ```sql
    SELECT id, amount_paise, razorpay_payment_id_snapshot, correlation_id
    FROM   consultation_modality_history
           -- plus a join to pull appointment's razorpay_payment_id if we didn't snapshot it
    WHERE  billing_action = 'auto_refund_downgrade'
      AND  razorpay_refund_id IS NULL
      AND  occurred_at < now() - interval '1 minute'        -- don't retry same-minute inserts
    ORDER BY occurred_at ASC
    LIMIT 50;                                               -- batch cap
    ```
    Uses partial index `idx_modality_history_refund_pending` from Task 46.
  - **Backoff schedule:** per-row `retry_attempt_count` tracking — add a column `refund_retry_count INT NOT NULL DEFAULT 0` to `consultation_modality_history` in a small bundled migration.
    - Attempt 1: retry ≥1 min after original.
    - Attempt 2: ≥5 min.
    - Attempt 3: ≥15 min.
    - Attempt 4: ≥1 hour.
    - Attempt 5: ≥6 hours.
    - Attempt 6: ≥24 hours.
    - Worker's query filters by `retry_attempt_count < 7 AND occurred_at < now() - interval '{schedule}'` to enforce the backoff.
  - **After 7 failed attempts (spans 24h+):** update `refund_retry_count = 99` (sentinel) + insert into `admin_payment_alerts` table (NEW — bundled migration).
  - **Admin alert table:**
    ```sql
    CREATE TABLE IF NOT EXISTS admin_payment_alerts (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      alert_kind          TEXT NOT NULL CHECK (alert_kind IN (
        'refund_stuck_24h',
        'payment_signature_mismatch',
        'mid_consult_order_orphaned'
      )),
      related_entity_id   UUID,                            -- history row or pending request
      context_json        JSONB NOT NULL,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      acknowledged_at     TIMESTAMPTZ,
      acknowledged_by     UUID
    );
    ```
  - **Copy to chat:** on attempt-1 failure, emit a system message "Refund of ₹X processing — expect within 3 business days." (Decision 11 resilience copy, plan line 246). This message fires once, not per retry.
  - **PagerDuty alert hook:** plan open question #6 resolves: after 24h of failure, fire PagerDuty via existing integration (if present; else log `critical` severity for Plan 2.x alerting pipeline to pick up). Inbox item for routing.

- [ ] **Bundled migration** `backend/migrations/0PP_modality_refund_retry_and_admin_alerts.sql`:
  - `consultation_modality_history.refund_retry_count INT NOT NULL DEFAULT 0`.
  - `consultation_modality_history.refund_retry_last_attempt_at TIMESTAMPTZ` — for observability.
  - `consultation_modality_history.refund_retry_failure_reason TEXT` — last retry's Razorpay error message.
  - `admin_payment_alerts` table.
  - Extend `idx_modality_history_refund_pending` to also filter `refund_retry_count < 99` (sentinel-out of permanent failures).

### Admin surface

- [ ] **Lightweight admin-only endpoint** `GET /admin/payment-alerts` (existing admin-role RLS; reuse if present, else minimal-scope new endpoint) returning unacknowledged rows. v1 is a read-only JSON surface; no dashboard UI.
- [ ] `POST /admin/payment-alerts/:id/acknowledge` marks as `acknowledged_at`.
- [ ] **If Plan 09 lands ahead of an admin dashboard UI**, this endpoint feeds into whatever ops tool exists (logs? Supabase console query? Simple JSON inspector). Document in inbox.md as a Plan 2.x UI follow-up.

### DM copy extensions (extend `dm-copy.ts`)

- [ ] `buildRefundProcessingDm({ amountInr, expectedDays })` — "Your refund of ₹{amountInr} is processing and should reach you in {expectedDays} business days."
- [ ] `buildRefundFailedDm({ amountInr, supportUrl })` — "We couldn't automatically refund ₹{amountInr}. Our team is looking into it. Contact support if you don't see a refund in 3 business days."
- [ ] Fired by Task 47 (success path sends no DM — it's visible in chat) / retry worker (attempt-1 failure sends processing DM; 24h failure sends failed DM).

### Observability + telemetry

- [ ] Metrics:
  - `modality_upgrade_order_created_total{}`.
  - `modality_upgrade_payment_captured_total{}`.
  - `modality_downgrade_refund_attempted_total{reason}` (`'downgrade' | 'provider_failure'`).
  - `modality_downgrade_refund_succeeded_total{attempt_count}`.
  - `modality_downgrade_refund_failed_total{reason, permanent}`.
  - `modality_refund_worker_stuck_total{}` — gauge of rows with `refund_retry_count >= 7`.
  - `modality_refund_latency_seconds` — from commit to successful refund.
- [ ] Structured logs threaded by `correlationId`.
- [ ] Alerts:
  - `modality_refund_worker_stuck_total > 0` → critical; ops must review `admin_payment_alerts`.
  - `modality_downgrade_refund_failed_total{permanent=true} > 0 in 1h` → PagerDuty.

### Unit + integration tests

- [ ] **`backend/tests/unit/services/modality-billing-service.test.ts`** (NEW):
  - `captureUpgradePayment` creates a Razorpay order with correct `notes.kind='mid_consult_upgrade'`.
  - Second call with same `correlationId` returns existing order (idempotency via pending-row check).
  - `autoRefundDowngrade` calls Razorpay refund with correct Idempotency-Key header.
  - Second call on same `historyRowId` returns existing refund without re-calling Razorpay.
  - Sync failure → `pending_retry` status.
  - Permanent failure (Razorpay returns "already_fully_refunded") → `failed_permanent` + admin alert inserted + critical log.
  - `computeUpgradeDeltaPaise` correctness across all 3 upgrade pairs (text→voice, text→video, voice→video).
  - `computeDowngradeRefundPaise` correctness across all 3 downgrade pairs.
  - Fallback to hardcoded defaults when `service_offerings_json` is missing → warning log.
- [ ] **`backend/tests/unit/workers/modality-refund-retry-worker.test.ts`** (NEW):
  - Row at retry_count=0 + age >1min → attempted.
  - Row at retry_count=1 + age <5min → skipped (backoff).
  - Row at retry_count=1 + age ≥5min → attempted; count incremented.
  - Row at retry_count=7 → skipped; admin alert inserted if not already.
  - Concurrent workers: atomic UPDATE-guard ensures each row is processed exactly once per scheduling cycle.
- [ ] **`backend/tests/unit/utils/modality-pricing.test.ts`** (NEW):
  - Happy path `service_offerings_json` read.
  - Missing modality in offerings → fallback to `appointments.fee_paise`.
  - Total fallback → hardcoded defaults + warning log fired.
- [ ] **`backend/tests/integration/modality-billing-against-razorpay-sandbox.test.ts`** (NEW; `skip` unless `RAZORPAY_SANDBOX_TEST=1`):
  - Create order → simulate payment → webhook handler → captures `razorpay_payment_id`.
  - Create order → simulate cancel → no capture; order expires.
  - Refund a real sandbox payment; verify refund appears in Razorpay dashboard.
  - Double-refund attempt → second call is a no-op per Idempotency-Key.

### Type-check + lint clean

- [ ] Backend `tsc --noEmit` exit 0. Unit tests green; integration tests skip-gated.

---

## Out of scope

- **Razorpay Subscriptions / Tokens / Stored-cards.** Decision 11 explicitly defers stored payment methods to v2. Every mid-consult payment is a fresh checkout.
- **Partial-refund for mid-consult downgrade** (pro-rated by time in modality). Decision 11 LOCKED: **full delta regardless of timing within slot**. No pro-rating.
- **Currency other than INR.** v1 assumes INR. Multi-currency is a Plan 10+ concern.
- **Booking-time payment link flow changes.** `payment-service.ts#createPaymentLink` untouched.
- **Razorpay Settlement API integration** (for doctor payout reconciliation post-upgrade). Existing `payout-service.ts` handles doctor payouts; this task doesn't touch that pipeline. Upgrade revenue flows through the same settlement as the original booking — doctor payout math must be **re-verified at PR review** to ensure upgrade deltas correctly add to doctor earnings. **Captured as a Payment Ops review item.**
- **UI for the admin payment alerts.** v1 is a JSON endpoint; Plan 2.x builds UI.
- **Chargeback handling.** If a patient disputes a mid-consult upgrade charge via their bank, existing dispute workflows apply. Out of scope.
- **Frontend integration** — Task 50 handles patient Razorpay checkout pop; this task provides the backend.

---

## Files expected to touch

**Backend (new):**

- `backend/src/services/modality-billing-service.ts` — capture + refund.
- `backend/src/workers/modality-refund-retry-worker.ts` — retry loop.
- `backend/src/utils/modality-pricing.ts` — pricing source of truth.
- `backend/migrations/0PP_modality_refund_retry_and_admin_alerts.sql` — retry columns + admin alerts table.

**Backend (extend):**

- `backend/src/controllers/webhook-controller.ts` — mid-consult branch.
- `backend/src/utils/dm-copy.ts` — three new copy helpers.
- `backend/src/routes/api/v1/admin.ts` (or whichever admin route file exists) — add `/payment-alerts` GET + acknowledge POST.
- `backend/src/config/payment.ts` — verify `getRazorpayClient` export; add if missing.

**Tests:** listed above.

**No frontend changes** in this task. Task 50 consumes `checkoutToken` on the patient side.

---

## Notes / open decisions

1. **Why Razorpay Orders API (not Payment Links) for mid-consult.** Payment Links open a new browser window / redirect — disruptive mid-consult (patient loses the chat/voice context). Orders + Razorpay Checkout SDK pop an in-app modal that overlays the consult UI. Friction-matched to Decision 11's acceptance criteria ("patient tolerates this because the rest of the product is good").
2. **Why the existing `payment-service.ts` isn't extended.** `payment-service.ts` is booking-time semantics — ties to appointment rows, uses payment links, handles slot-booking flow. Mid-consult has different semantics: ties to `consultation_modality_history` rows, uses orders + in-app checkout, and has the compensating-refund edge case. Mixing would bloat `payment-service.ts`. Keep concerns separate.
3. **Idempotency-Key for Razorpay refunds.** Razorpay's API supports this header on refunds. Double-check API version at PR review (Razorpay occasionally changes header naming). If the version in use doesn't support it, fall back to local idempotency via the pre-call DB check.
4. **Why `modality-pricing.ts` is a separate util, not inside the billing service.** Task 47 reads pricing for all four handler branches (even free ones need to know the delta to record in the history row even if `amount_paise` is NULL for free_upgrade). Task 51 reads it to display "₹X difference" in the approval modal. Task 55 reads it to display fees in the timeline. Shared util.
5. **Fallback ordering rationale.** `service_offerings_json` is authoritative; if a doctor hasn't configured per-modality fees, fall back to the original booking fee (unprincipled default but conservative); then hardcoded defaults. Each layer logs a warning so ops can push doctors to configure properly.
6. **Payment Ops review.** The doctor-payout math — does the upgrade delta correctly add to the doctor's settlement amount? — lives in `payout-service.ts` and depends on how Razorpay aggregates the booking payment + mid-consult order. At PR review, the ops reviewer should verify: (a) the upgrade order is tagged `doctor_id` in its `notes` so payout attribution works; (b) the refund correctly reduces the doctor's payout for that session. If (b) doesn't work automatically, a compensating payout-adjustment entry needs writing — capture in inbox.md.
7. **Receipt naming `modality_change:{pending_request_id}`.** Makes ops reporting crisp ("Razorpay order with receipt `modality_change:*` = mid-consult; receipt `booking:*` = original booking"). Razorpay's receipt field is free-form; this convention is solely for our analytics.
8. **`speed: 'normal'`** on Razorpay refunds. `'normal'` is 5–7 business days; `'optimum'` (instant) costs extra. v1 uses `'normal'` per cost doctrine; upgrade to `'optimum'` is a Plan 10+ UX decision.
9. **Compensating refund for `provider_failure` reason.** This is the edge case from Task 47 Notes #5: patient paid, provider failed, auto-refund fires. Same billing service function, different `reason` tag. Important for ops to distinguish "doctor downgraded" refunds from "system failed" refunds in dashboards.
10. **Why no Razorpay webhook-signature re-verification in this task.** The webhook controller at the existing layer already verifies signatures before dispatching. Downstream consumers trust the controller's contract. If we ever handle webhooks bypassing the controller, re-verify.
11. **Pricing cache staleness.** The `getModalityFeesForDoctor` helper is request-scoped — no cross-request cache. A doctor editing pricing during a live consult is an edge case; the current consult's `amount_paise` is locked-in at `consultation_modality_history` INSERT time. Subsequent consults see the new price.
12. **`doctor_dashboard_events` event for refund success.** Should the doctor see a "₹X refund issued on session Y" banner? Decision: NO in v1 — the chat system message is enough visibility. If ops / product later wants a bell-icon entry, additive row type in Plan 07 Task 30's `event_kind` CHECK.

---

## References

- **Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md) — Razorpay section lines 213–247 + open question #7.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 11 LOCKED symmetric billing doctrine.
- **Task 46 — `consultation_modality_history.razorpay_refund_id` column this task writes:** [task-46-modality-history-schema-and-counters-migration.md](./task-46-modality-history-schema-and-counters-migration.md).
- **Task 47 — caller:** [task-47-request-modality-change-state-machine.md](./task-47-request-modality-change-state-machine.md).
- **Task 55 — consumer of pricing helper for timeline display:** [task-55-post-consult-modality-history-timeline.md](./task-55-post-consult-modality-history-timeline.md).
- **Existing `payment-service.ts`** — not extended; reference for the existing booking-time flow.
- **Existing `payout-service.ts`** — Payment Ops review item for upgrade/refund settlement math.
- **Razorpay Orders API:** https://razorpay.com/docs/api/orders (verify API version at PR time).
- **Razorpay Refunds API:** https://razorpay.com/docs/api/refunds.

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Not started — Plan 09's payment-correctness critical deliverable. Hard-blocks on Tasks 46 + 47. Owner-confirmed Payment Ops review (upgrade→payout attribution + compensating-refund path) strongly recommended before merge.
