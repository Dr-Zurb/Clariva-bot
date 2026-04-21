# Task 47: `consultation-session-service.ts#requestModalityChange()` — single-entry state machine with 4 handlers + transactional rollback + rate-limit + reason-capture (Decision 11 LOCKED · **v1's single most important state machine**)

## 19 April 2026 — Plan [Mid-consult modality switching](../Plans/plan-09-mid-consult-modality-switching.md) — Phase A

---

## Task overview

Decision 11 LOCKED the single-entry doctrine: **one public function** (`requestModalityChange`) handles every one of the four branches in the 2×2 matrix:

|               | **Upgrade** (from < to) | **Downgrade** (from > to) |
|---------------|-------------------------|---------------------------|
| **Patient**   | → doctor approval modal (90s) → paid vs free branch → transition | → immediate transition (no refund; reason required) |
| **Doctor**    | → patient consent modal (60s) → always-free → transition           | → immediate transition + auto-refund difference (reason required) |

Why a single public entry point (rather than four separate `request*Upgrade` / `request*Downgrade` APIs):

1. **One place to enforce invariants.** Rate limits (`upgrade_count <= 1`, `downgrade_count <= 1`), reason validation, direction derivation, serialisable-isolation lock — all in one function.
2. **One public contract for the HTTP route, doctor UI, and patient UI.** Task 50/51/52's modals all POST to `/modality-change/request` with an `initiatedBy` + `requestedModality` body.
3. **Testing simplicity.** The four handler branches are private — covered by the public function's test matrix.

**This is v1's most critical state machine.** Bugs cause:

- **Double-billing** (race: patient's Razorpay webhook arrives twice; transition fires twice; patient charged twice).
- **Stuck rooms** (transition committed in DB but Twilio provisioning failed → session's `current_modality = 'voice'` but no Twilio room exists → patient sees spinner forever).
- **Rate-limit bypass** (two concurrent requests race; both pass the `upgrade_count <= 1` check; both INSERT history rows; session's `upgrade_count = 2` — violates the CHECK and the transaction aborts, but now the user has seen a "success" UI).
- **Refund missed** (doctor-initiated downgrade commits the transition but auto-refund enqueue failed → patient not refunded → Razorpay dispute).

Each failure mode has a mitigation in the acceptance criteria. **Owner-confirmed payment ops review of the rollback branches recommended before merge.**

**Estimated time:** ~7 hours (above the plan's 6h estimate — the serialisable-isolation concurrency model + the Razorpay webhook arrival-after-transaction-commit edge case + the four-handler test matrix + the rollback-when-provider-fails path + the coordination with Task 48 (executor) and Task 49 (billing) push above 6h).

**Status:** ✅ Shipped (2026-04-19).

**Shipped summary:**

- Migration 076 `modality_change_pending_requests` + CHECK + 3 partial indexes + RLS SELECT-only policy (27-test content-sanity suite).
- `backend/src/types/modality-change.ts` — `ModalityChangeRequest`, discriminated-union `ModalityChangeResult`, `ModalityChangePendingRow`, second-round inputs, webhook input.
- `backend/src/services/modality-change-service.ts` — single-entry `requestModalityChange` with 9-step guard chain + 4 private handlers + `handleDoctorApprovalOfPatientUpgrade` + `handlePatientConsentForDoctorUpgrade` + `handleModalityChangePaymentCaptured` + `getModalityChangeState`.
- `backend/src/services/modality-transition-executor.ts` + `backend/src/services/modality-billing-service.ts` — **DI interface stubs** so Task 47 can ship + unit-test without Tasks 48 / 49's concrete adapters (they replace the stubs via the DI handles).
- `backend/src/services/modality-pending-requests-queries.ts` — 7-method Supabase admin wrapper (22-test query-shape suite).
- `backend/src/workers/modality-pending-timeout-worker.ts` — DB-poll timeout worker mirroring Plan 08 Task 41 pattern (6-test suite).
- `backend/src/controllers/modality-change-controller.ts` — 4 HTTP handlers + `handleModalityChangePaymentCapturedHook` export for the webhook worker to dispatch into once Task 49 lands.
- `backend/src/routes/api/v1/consultation.ts` — 4 new endpoints: `POST /:id/modality-change/{request,approve,patient-consent}`, `GET /:id/modality-change/state`.
- `backend/src/routes/cron.ts` — `POST /cron/modality-pending-timeout` route.
- 39-test state-machine matrix pinning all 9 guard steps × 4 dispatch branches + 3 second-round handlers + webhook idempotency + rollback doctrine + `getModalityChangeState`.
- `npx tsc --noEmit` exit 0. Task-47 files `eslint` clean. Full backend suite: **141 suites / 1896 tests green** (+94 new).

**v1 deviations from the spec (documented):**

1. **Concurrency model compressed.** Spec called for `pg_advisory_xact_lock` + `SELECT FOR UPDATE` + CHECK. Supabase JS client can't open user-managed transactions or call advisory locks without an RPC. v1 uses (a) atomic counter `UPDATE … WHERE counter = 0` predicates, (b) Migration 075's counter-range CHECK, (c) `response IS NULL` predicate on pending-row resolves. Follow-up: `pg_advisory_xact_lock` RPC filed in inbox as Task 47.1.
2. **Realtime fan-out via Postgres-changes.** Spec called for custom broadcast. Plan 08 Task 41 validated the Postgres-changes + RLS participant-scoped SELECT pattern; Task 47 adopts it verbatim — no custom `realtime.send()` calls.
3. **Task 48 / 49 coupling via DI stubs.** Spec treated Tasks 47 / 48 / 49 as parallel; Task 47 has a hard runtime dependency on both. Solution: `modality-transition-executor.ts` and `modality-billing-service.ts` ship as interface-only modules with default "not implemented" stubs and DI handles. Tasks 48 / 49 swap the implementation in without touching Task 47.
4. **Razorpay mid-consult webhook wiring.** Spec called for extending `webhook-controller.ts`; v1 ships `handleModalityChangePaymentCapturedHook` as a library export in `modality-change-controller.ts`. Task 49's webhook worker will dispatch into it after signature + idempotency validation (cleaner than bolting the state-machine into the existing Razorpay branch).

**Depends on:**

- Task 46 (hard — `consultation_modality_history` table + counters + ENUMs).
- Task 48 (hard — `modality-transition-executor.ts` is called inside the transaction).
- Task 49 (hard — `modality-billing-service.ts` is called for paid branches + refund enqueue).
- Plan 06 Task 37 (hard — `emitSystemMessage` with `modality_switched` event; extended in Task 53).
- Plan 01 (hard — `consultation-session-service.ts` facade exists; this task extends it).
- Plan 08 Task 43 (soft — Twilio recording-rules wrapper; only invoked transitively via Task 48).

**Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md)

---

## Acceptance criteria

### Public API — `requestModalityChange`

- [ ] **`backend/src/services/consultation-session-service.ts`** (EXTEND) exports:
  ```ts
  export type ModalityChangeRequest = {
    sessionId:          string;
    requestedModality:  Modality;                     // text | voice | video
    initiatedBy:        'patient' | 'doctor';
    reason?:            string;                       // required for doctor or patient-downgrade
    presetReasonCode?:  PresetReasonCode;             // optional; populates history row
    correlationId?:     string;                       // caller-supplied; else generated
  };

  export type ModalityChangeResult =
    | { kind: 'pending_doctor_approval'; approvalRequestId: string; approvalExpiresAt: string }  // patient upgrade
    | { kind: 'pending_patient_consent'; consentRequestId: string; consentExpiresAt: string }     // doctor upgrade
    | { kind: 'applied'; historyRowId: string; toModality: Modality; billingAction: ModalityBillingAction }
    | { kind: 'rejected'; reason: ModalityRejectReason };

  export async function requestModalityChange(
    input: ModalityChangeRequest,
  ): Promise<ModalityChangeResult>;
  ```

### Step-by-step policy (pinned in code comments)

- [ ] **Step 0 — correlation-id + structured logging start.** Generate UUID if caller didn't supply. Log `{ correlationId, sessionId, initiatedBy, requestedModality }`.
- [ ] **Step 1 — authZ.** Caller must be a participant of the session matching `initiatedBy`. Doctor route: JWT.sub = `session.doctor_id`. Patient route: JWT.sub = `session.patient_id`. Reject with `ForbiddenError` otherwise.
- [ ] **Step 2 — session-state check.** `session.status = 'in_progress'`. Reject `SessionNotActiveError` otherwise.
- [ ] **Step 3 — acquire session-level advisory lock.** `SELECT pg_advisory_xact_lock(hashtext('modality:' || sessionId))` at the top of the transaction. Serializes every `requestModalityChange` call for the same session; prevents the race where two concurrent requests both pass the rate-limit check. Released automatically at transaction end. **Mitigation for "rate-limit bypass" failure mode.**
- [ ] **Step 4 — load session + appointment + pricing context.** Pull `consultation_sessions.{id, status, modality, current_modality, upgrade_count, downgrade_count, provider_session_id, doctor_id, patient_id, appointment_id}` + `appointments.{razorpay_payment_id (original), fee_paise (original)}` + pricing fields needed to compute the delta.
- [ ] **Step 5 — derive direction.** Compute via a shared helper `directionOf(fromModality, toModality)` that maps `text < voice < video`. Returns `'upgrade' | 'downgrade' | 'same'`. `'same'` → reject with `NoOpTransitionError` (Task 46's CHECK also rejects this at INSERT time; fail fast here for friendlier error messages).
- [ ] **Step 6 — rate-limit check.**
  - Direction `upgrade`: `session.upgrade_count < 1`. Else reject `MaxUpgradesReachedError`.
  - Direction `downgrade`: `session.downgrade_count < 1`. Else reject `MaxDowngradesReachedError`.
- [ ] **Step 7 — pending-request check.** Query in-memory or DB-backed "is there a pending approval/consent request for this session":
  - Patient upgrade: `SELECT FROM modality_change_pending_requests WHERE session_id = ? AND initiated_by = 'patient' AND expires_at > now()` — if exists, reject `PendingRequestExistsError`. (New table — see "Pending-requests persistence" below.)
  - Same for doctor upgrade (keyed by `initiated_by = 'doctor'`).
- [ ] **Step 8 — reason validation.**
  - `initiatedBy = 'doctor'` → `reason` required, 5..200 chars.
  - `initiatedBy = 'patient'` AND `direction = 'downgrade'` → `reason` required, same length.
  - `initiatedBy = 'patient'` AND `direction = 'upgrade'` → `reason` optional.
  - Mirrors Task 46's `modality_history_reason_required` CHECK.
- [ ] **Step 9 — route to one of four handlers:**

#### `handlePatientInitiatedUpgrade` — approval + billing branch

- [ ] Insert a row into `modality_change_pending_requests` (new table): `{ session_id, initiated_by: 'patient', requested_modality, expires_at: now() + 90s, correlation_id, ... }`. Returns a `approval_request_id`.
- [ ] Publish Realtime broadcast on channel `consultation-sessions:${sessionId}:modality-change` with payload `{ kind: 'pending_doctor_approval', approvalRequestId, requestedModality, expiresAt }` → Task 51's `<ModalityUpgradeApprovalModal>` pops for the doctor.
- [ ] Return `{ kind: 'pending_doctor_approval', approvalRequestId, approvalExpiresAt }` to the caller.
- [ ] The transition **does NOT commit here**. The doctor's approval (a separate API call via `POST /modality-change/approve`) triggers the rest.
- [ ] Separate function `handleDoctorApprovalOfPatientUpgrade({ approvalRequestId, decision: 'paid' | 'free' | 'decline' })`:
  - **`'decline'`**: mark the pending row as `responded_at=now(), response='decline'`. Publish `{ kind: 'declined', reason: <doctor's reason> }` on the channel. No history row written (Decision 11: only successful transitions appear in history).
  - **`'free'`**: open atomic transaction →
    1. `SELECT FROM consultation_sessions WHERE id = ? FOR UPDATE` (session-row lock; belt-and-suspenders alongside the advisory lock).
    2. Re-check `upgrade_count < 1` (defence-in-depth; may have been bumped between the pending-row insert and the doctor's approval — e.g. another pending request's race).
    3. Call `modalityTransitionExecutor.executeTransition({ session, toModality: requestedModality })` → returns `{ newProviderSessionId?, recordingArtifactRef? }`.
    4. On executor failure → transaction abort + provider-rollback (executor's responsibility — see Task 48) + return `{ kind: 'rejected', reason: 'provider_failure' }`.
    5. On executor success → `INSERT consultation_modality_history { billing_action: 'free_upgrade', amount_paise: NULL, reason: NULL, ... }`.
    6. `UPDATE consultation_sessions SET current_modality = ?, upgrade_count = upgrade_count + 1, provider_session_id = ?`.
    7. `emitSystemMessage({ event: 'modality_switched', from, to, initiatedBy: 'patient', billingAction: 'free_upgrade' })` (Task 53).
    8. Commit. Publish Realtime `{ kind: 'applied', historyRowId, toModality }` on the channel.
  - **`'paid'`**: open atomic transaction →
    1-2. Same as `'free'`.
    3. Call `modalityBillingService.captureUpgradePayment({ sessionId, fromModality, toModality, amountPaise })` → returns `{ razorpayOrderId, checkoutToken, amountPaise }`. **NOTE: no Twilio transition yet!** The patient hasn't paid; we only have an order.
    4. Publish Realtime `{ kind: 'checkout_ready', checkoutToken, razorpayOrderId, amountPaise }` on the channel → Task 50's modal pops the Razorpay checkout.
    5. Commit the pending-row update (`responded_at`, `response='approved_paid'`). **Don't commit the history row yet** — that waits for the webhook.
    6. When the Razorpay webhook fires at `/webhooks/razorpay` → `captureWebhookHandler({ razorpayOrderId, razorpayPaymentId })`:
       - Re-open atomic transaction.
       - Re-acquire session advisory lock.
       - Re-check `upgrade_count < 1` (paranoid — between order creation and webhook arrival, another upgrade could have landed).
       - Call `modalityTransitionExecutor.executeTransition(...)`.
       - On success → `INSERT consultation_modality_history { billing_action: 'paid_upgrade', amount_paise, razorpay_payment_id, ... }` + `UPDATE consultation_sessions`.
       - `emitSystemMessage`.
       - Commit.
       - On executor failure → transaction abort + fire a compensating auto-refund via `modalityBillingService.autoRefundDowngrade({ originalRazorpayPaymentId: razorpayPaymentId, amountPaise, reason: 'provider_failure' })` + publish Realtime `{ kind: 'rejected', reason: 'provider_failure', refundInitiated: true }`. Patient sees the error in the modal + a system message explaining the auto-refund.
- [ ] **Double-charge guard:** the webhook handler checks `WHERE razorpay_payment_id = ? AND NOT EXISTS (SELECT 1 FROM consultation_modality_history WHERE razorpay_payment_id = ?)` — if the history row already exists, skip silently (webhook retry dedup). **Mitigation for "double-billing" failure mode.**

#### `handleDoctorInitiatedUpgrade` — consent branch, always free

- [ ] Insert `modality_change_pending_requests` row with `initiated_by = 'doctor', expires_at: now() + 60s` (matches Plan 08 Task 41's 60s consent window for consistency).
- [ ] Publish Realtime on `consultation-sessions:${sessionId}:modality-change` with `{ kind: 'pending_patient_consent', consentRequestId, requestedModality, doctorReason, expiresAt }` → Task 52's `<PatientUpgradeConsentModal>`.
- [ ] Return `{ kind: 'pending_patient_consent', consentRequestId, consentExpiresAt }`.
- [ ] On patient's consent response via `POST /modality-change/patient-consent` with `{ decision: 'allow' | 'decline' }`:
  - `'decline'`: update pending row `{ responded_at, response: 'decline' }`. No history row written. Realtime broadcast to doctor.
  - `'allow'`: atomic transaction → executor → INSERT history `{ billing_action: 'free_upgrade', amount_paise: NULL }` → UPDATE session → `emitSystemMessage` → commit → Realtime.

#### `handlePatientInitiatedDowngrade` — immediate, no refund

- [ ] No pending-request phase (patient is using less of what they bought; doctor doesn't need to approve).
- [ ] Atomic transaction:
  1. Session advisory lock + re-check `downgrade_count < 1`.
  2. `modalityTransitionExecutor.executeTransition(...)`.
  3. On success → `INSERT consultation_modality_history { billing_action: 'no_refund_downgrade', amount_paise: NULL, reason: <patient's reason> }`.
  4. `UPDATE consultation_sessions SET current_modality, downgrade_count = downgrade_count + 1`.
  5. `emitSystemMessage({ event: 'modality_switched', from, to, initiatedBy: 'patient', billingAction: 'no_refund_downgrade', reason })`.
  6. Commit. Realtime.
- [ ] Return `{ kind: 'applied', ... }`.

#### `handleDoctorInitiatedDowngrade` — immediate + auto-refund

- [ ] No pending-request phase.
- [ ] Atomic transaction:
  1. Session advisory lock + re-check.
  2. `modalityTransitionExecutor.executeTransition(...)`.
  3. On success → `INSERT consultation_modality_history { billing_action: 'auto_refund_downgrade', amount_paise: <delta>, razorpay_refund_id: NULL (pending), reason: <doctor's reason> }`.
  4. `UPDATE consultation_sessions`.
  5. `emitSystemMessage({ event: 'modality_switched', from, to, initiatedBy: 'doctor', billingAction: 'auto_refund_downgrade', reason, amountPaise: <delta> })`.
  6. **Enqueue auto-refund**: call `modalityBillingService.autoRefundDowngrade({ historyRowId, originalRazorpayPaymentId, amountPaise })`.
     - **Sync vs async**: try synchronous Razorpay refund API call first (low-latency UX — chat sees "Refund of ₹X issued" immediately). If Razorpay succeeds synchronously → UPDATE `razorpay_refund_id`. If Razorpay times out or fails → leave `razorpay_refund_id = NULL`; Task 49's retry worker picks it up; system message says "Refund of ₹X processing — expect within 3 business days" (Decision 11 resilience copy).
  7. Commit.
- [ ] **Mitigation for "refund missed" failure mode:** even if the synchronous Razorpay call fails, the history row is committed with `razorpay_refund_id = NULL` + the retry worker scan finds it. No refund is silently skipped.

### Pending-requests persistence

- [ ] **`backend/migrations/0OO_modality_change_pending_requests.sql`** (NEW; bundled with this task's PR):
  ```sql
  CREATE TABLE IF NOT EXISTS modality_change_pending_requests (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id             UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
    initiated_by           modality_initiator NOT NULL,
    requested_modality     consultation_modality NOT NULL,
    reason                 TEXT CHECK (reason IS NULL OR char_length(reason) BETWEEN 5 AND 200),
    preset_reason_code     TEXT,
    amount_paise           INT,                                  -- set for patient-upgrade branches with paid default (see Task 51)
    razorpay_order_id      TEXT,                                 -- set when doctor approves paid
    requested_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at             TIMESTAMPTZ NOT NULL,
    responded_at           TIMESTAMPTZ,
    response               TEXT CHECK (response IS NULL OR response IN (
                             'approved_paid',
                             'approved_free',
                             'allowed',
                             'declined',
                             'timeout',
                             'checkout_cancelled',
                             'provider_failure'
                           )),
    correlation_id         UUID,

    CONSTRAINT modality_change_pending_response_shape CHECK (
      (response IS NULL AND responded_at IS NULL) OR
      (response IS NOT NULL AND responded_at IS NOT NULL)
    )
  );

  CREATE INDEX idx_modality_pending_session_active
    ON modality_change_pending_requests(session_id, expires_at DESC)
    WHERE response IS NULL;
  -- Used by Step 7 "is there a pending request" check.

  ALTER TABLE modality_change_pending_requests ENABLE ROW LEVEL SECURITY;
  CREATE POLICY modality_change_pending_select_participants
    ON modality_change_pending_requests FOR SELECT
    USING (session_id IN (
      SELECT id FROM consultation_sessions
      WHERE doctor_id = auth.uid() OR (patient_id IS NOT NULL AND patient_id = auth.uid())
    ));
  ```

### Timeout worker

- [ ] **`backend/src/workers/modality-pending-timeout-worker.ts`** (NEW) — same DB-polling pattern as Plan 08 Task 41's `video-escalation-timeout-worker.ts`:
  - Every 5s, `SELECT FROM modality_change_pending_requests WHERE response IS NULL AND expires_at < now()`.
  - For each row: atomic UPDATE → `response = 'timeout', responded_at = now()` with the same guard `WHERE response IS NULL AND expires_at < now()`.
  - If update succeeds (1 row): publish Realtime timeout event → patient/doctor UI refreshes.
  - Optional `setTimeout` shadow per pod for low-latency (matches Plan 08 Task 41 Notes #2).

### HTTP endpoints (extend `backend/src/routes/api/v1/consultation.ts`)

- [ ] `POST /consultation-sessions/:sessionId/modality-change/request` — body `{ requestedModality, initiatedBy: 'patient' | 'doctor', reason?, presetReasonCode? }`. Dispatches to `requestModalityChange`.
- [ ] `POST /consultation-sessions/:sessionId/modality-change/approve` (doctor-only) — body `{ approvalRequestId, decision: 'paid' | 'free' | 'decline', declineReason?: string, amountPaise?: number }`. Dispatches to `handleDoctorApprovalOfPatientUpgrade`.
- [ ] `POST /consultation-sessions/:sessionId/modality-change/patient-consent` (patient-only) — body `{ consentRequestId, decision: 'allow' | 'decline' }`.
- [ ] `GET /consultation-sessions/:sessionId/modality-change/state` (both) — returns derived state: `{ currentModality, upgradeCount, downgradeCount, activePendingRequest?: { id, initiatedBy, kind, expiresAt, ... } }`. Consumed by Task 54's launcher (to grey out buttons) + Task 50/51/52 modal re-hydration on page refresh.
- [ ] Razorpay webhook hook — **extend the existing** `backend/src/controllers/webhook-controller.ts` (per existing integration) with a new branch for mid-consult `payment.captured` events that match a `modality_change_pending_requests.razorpay_order_id`. Dispatches to `captureWebhookHandler` (see Task 49).

### Transactional rollback rules

- [ ] **Rule: never commit a history row if the provider transition failed.** The executor runs **inside** the DB transaction; on executor throw, the transaction rolls back + executor's own rollback (Task 48) handles provider state.
- [ ] **Rule: never issue a refund for a transition that was rolled back.** Refunds enqueue only on successful commit.
- [ ] **Rule: history table is append-only.** Failed transitions leave no row. Audit of attempts lives in structured logs via `correlation_id`.
- [ ] **Rule: Razorpay webhook idempotency.** Every webhook-driven transition re-checks "history row for this `razorpay_payment_id` already exists?" before doing work.
- [ ] **Rule: if transition commits but the post-commit side-effect fails** (e.g. Realtime publish fails after DB commit): log the failure + do NOT roll back. The chat-system-message and Realtime events are recoverable via a `GET /modality-change/state` refresh from the client.

### Observability

- [ ] Metrics:
  - `modality_change_requests_total{initiated_by, direction}`.
  - `modality_change_applied_total{billing_action}`.
  - `modality_change_rejected_total{reason}`.
  - `modality_change_pending_timeouts_total{initiated_by}`.
  - `modality_change_provider_failures_total{transition}`.
  - `modality_change_duration_ms` histogram (request → applied).
- [ ] Structured logs threaded by `correlation_id`.
- [ ] Alert: `modality_change_provider_failures_total > 3 in 5min` — signals executor instability; inbox for Plan 2.x alerting.

### Unit + integration tests

- [ ] **`backend/tests/unit/services/consultation-session-service-modality-change.test.ts`** (NEW) — exhaustively matrix every branch:
  - Every direction × every initiator × reason-validation shape (valid / missing / too short / too long).
  - AuthZ: patient calling with `initiatedBy: 'doctor'` → `ForbiddenError`.
  - Session status: `status = 'completed'` → `SessionNotActiveError`.
  - Rate-limit: `upgrade_count = 1` → `MaxUpgradesReachedError`; same for downgrade.
  - Same-modality request → `NoOpTransitionError`.
  - Pending request exists → `PendingRequestExistsError`.
  - `handlePatientInitiatedUpgrade` paid path: pending row inserted + Realtime published, no history commit until webhook.
  - `handleDoctorApprovalOfPatientUpgrade` with `'free'`: executor called + history row inserted + session updated + system message emitted.
  - `handleDoctorApprovalOfPatientUpgrade` with `'paid'`: captureUpgradePayment called; history row NOT inserted yet.
  - `captureWebhookHandler` idempotency: duplicate webhook → no second history row, no second charge side effect.
  - `handleDoctorInitiatedUpgrade` allow → executor + history + system message; decline → no history row.
  - `handlePatientInitiatedDowngrade`: no pending phase; executor + history + session + system message; no refund.
  - `handleDoctorInitiatedDowngrade`: executor + history with `razorpay_refund_id=NULL` + refund enqueue; sync-refund-success path UPDATEs the row; sync-refund-failure path leaves row for worker.
  - Executor throws → transaction rolls back; no history row written; compensating refund fires if it was a paid-upgrade webhook path.
- [ ] **`backend/tests/unit/workers/modality-pending-timeout-worker.test.ts`** (NEW) — pending row at 91s → `'timeout'`; fresh row left alone; two-pod concurrency → atomic-guard exactly-once.
- [ ] **`backend/tests/integration/modality-switching-end-to-end.test.ts`** (NEW; `skip` unless `TWILIO_SANDBOX_TEST=1` + `RAZORPAY_SANDBOX_TEST=1`):
  - Patient-initiated paid upgrade text→voice: request → doctor approves paid → Razorpay webhook → executor provisions Twilio → history committed.
  - Doctor-initiated downgrade video→text: request → executor disconnects → history committed with refund queued → worker fires → refund completes → row updated.
  - Rate-limit: successful upgrade + attempt second upgrade → rejected.
  - Executor failure injection (mock): patient pays → webhook fires → executor throws → compensating refund auto-issues → patient sees system message.
  - Concurrent requests from two browser tabs: both call `POST /modality-change/request` with `requestedModality: 'voice'`; only one succeeds; second gets `PendingRequestExistsError`.

### Type-check + lint clean

- [ ] Backend `npx tsc --noEmit` exit 0. Linters clean. Unit tests green; integration tests skip-gated.

---

## Out of scope

- **Multi-party sessions.** v1 is 1 doctor + 1 patient; state machine assumes this. Multi-party needs a different lock strategy + history row semantics.
- **Doctor-cancellable pending patient upgrade.** Once the patient requests + doctor is deciding, doctor can only `approve` or `decline` — no "cancel the request". Matches Plan 08 Task 41 design doctrine.
- **Pricing caching.** Step 4 reads pricing fresh every time. Caching would introduce inconsistency risk (doctor edits pricing mid-consult edge case).
- **"Retry once more" pre-baked rate-limit reset after decline.** Decision 11 LOCKED: max 1 upgrade + 1 downgrade per consult. Once used, done. The UI's "Try once more" button is only for the 5-min cooldown after decline/timeout WITHIN the 1-upgrade budget, not a re-enabling of the budget.
- **Queueable / scheduled transitions** (e.g. "auto-upgrade at minute 15"). v1 is strictly user-triggered.
- **Partial-refund for mid-consult downgrade** (pro-rating by time in modality). Decision 11 LOCKED: **full delta regardless of timing within slot**. State machine reads `delta = feeOf(from) - feeOf(to)` flat.
- **Patient cancel-upgrade-after-pay.** Once Razorpay webhook fires, the transition commits. If the patient closes the tab after paying, the transition still goes through. Mid-checkout cancel (`Razorpay modal closed`) → transaction not committed; no transition; no charge. Handled via the webhook-driven commit pattern.
- **Frontend** — Tasks 50/51/52/54 handle UI.
- **Twilio / Razorpay implementation details** — Tasks 48 / 49 own those.

---

## Files expected to touch

**Backend (new):**

- `backend/migrations/0OO_modality_change_pending_requests.sql`.
- `backend/src/workers/modality-pending-timeout-worker.ts`.

**Backend (extend):**

- `backend/src/services/consultation-session-service.ts` — add `requestModalityChange` + 4 private handlers + `handleDoctorApprovalOfPatientUpgrade` + `captureWebhookHandler` + `handlePatientConsentForDoctorUpgrade`.
- `backend/src/routes/api/v1/consultation.ts` — add four endpoints.
- `backend/src/controllers/webhook-controller.ts` — extend with mid-consult modality-change webhook branch.
- `backend/src/types/modality-change.ts` (NEW) — request/result types, preset-reason-code union, direction helper.

**Tests:** listed above.

**No frontend changes.** Tasks 50/51/52/54 own UI.

---

## Notes / open decisions

1. **Why pg advisory lock + SELECT FOR UPDATE + rate-limit CHECK.** Three layers of defence: advisory lock at function entry (prevents concurrent calls inspecting stale counters); row-lock inside the transaction (prevents the session row being mutated between the re-check and the UPDATE); CHECK constraint at the DB level (catches any bug in the two upper layers). Belt-and-suspenders doctrine for v1's highest-risk state machine.
2. **Why `captureUpgradePayment` creates the Razorpay order BEFORE executing the transition.** Two reasons: (a) if Razorpay is down, fail fast without touching Twilio; (b) the order-creation is a cheap Razorpay call, the Twilio provisioning is expensive — ordering minimises wasted work on failure. Trade-off: on successful order + patient-abandoned-checkout, the order is orphaned on Razorpay side. Razorpay automatically expires unused orders; no cleanup needed.
3. **Webhook-driven commit model is NOVEL for this codebase.** The existing `payment-service.ts` uses payment-links with `processPaymentSuccess` — no mid-session webhook-to-state-machine pattern exists. Task 49 extends. Document in the PR description.
4. **Synchronous vs asynchronous refund in `handleDoctorInitiatedDowngrade`.** Synchronous path commits the transition + attempts the refund inline; on success the UX says "Refunded ₹150". On failure, the transition still commits; refund row persists with `razorpay_refund_id = NULL`; worker picks it up within 15 min. Acceptable trade-off: patient sees transition immediately + a clarifying system message.
5. **Compensating auto-refund on executor failure during paid-upgrade webhook.** If the patient paid + executor failed, we MUST refund — not refunding is a dispute. The refund is queued via the same `modalityBillingService.autoRefundDowngrade` path but with a `reason: 'provider_failure'` tag. The history row is NOT written (transition didn't land); the refund row lives in a separate table? Or in the pending_requests row with a refund_id column? **Open decision:** the pending_requests table schema above doesn't include a refund ID; extending with `compensating_refund_id TEXT` is a PR-time call. Document in the PR.
6. **Why a separate `modality_change_pending_requests` table vs writing to `consultation_modality_history` with a `status='pending'`.** The history table is append-only and represents committed transitions. Using it for pending state would require either a `rolled_back = true` flag (rejected in Task 46 Notes #1) or a `status` enum with multiple values. Separate-table approach keeps both tables' semantics crisp.
7. **Rate-limit reset between re-attempts after decline/timeout.** Decision 11 LOCKED: max 1 per consult. Declined attempts count against the budget? **NO** — per plan line 276 "`[Try once more]` button (rate-limited 5 min)" + Decision 11's "max 1 upgrade per consult" — the budget is 1 *successful* upgrade. A declined/timeout attempt doesn't consume the budget. Application doctrine: `upgrade_count` is only incremented on successful commit. Rate-limit check is `upgrade_count < 1 AND no_pending_request` + the cooldown for "Try once more" is 5 min from last decline.
8. **Direction ordering in application code.** `text < voice < video`. Encoded in `backend/src/utils/modality-order.ts` (NEW) as a numeric map. Shared with Task 48's executor + Task 55's timeline.
9. **System message emitter interaction.** Task 53 extends `emitSystemMessage` with the `modality_switched` event; this task is the primary caller. For decline / timeout branches, no system message fires (same privacy doctrine as Plan 08 Task 41 Notes #3 — hiding declines from the chat).
10. **Correlation-id thread.** One UUID per `requestModalityChange` invocation. Threads through: pending row, history row, Razorpay order metadata, Twilio API logs, system message log, Realtime event payload. One-stop debug.

---

## References

- **Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md) — State machine section lines 138–180 + lifecycle wiring lines 363–379.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 11 LOCKED.
- **Task 46 — schema this task writes into:** [task-46-modality-history-schema-and-counters-migration.md](./task-46-modality-history-schema-and-counters-migration.md).
- **Task 48 — executor called inside the transaction:** [task-48-modality-transition-executor.md](./task-48-modality-transition-executor.md).
- **Task 49 — billing service called for paid + refund branches:** [task-49-modality-billing-razorpay-capture-and-refund.md](./task-49-modality-billing-razorpay-capture-and-refund.md).
- **Task 53 — `emitSystemMessage` extension for `modality_switched`:** [task-53-modality-switched-system-messages.md](./task-53-modality-switched-system-messages.md).
- **Plan 08 Task 41 — DB-polling timeout worker pattern mirrored here:** [task-41-patient-video-consent-modal-and-escalation-service.md](./task-41-patient-video-consent-modal-and-escalation-service.md).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Not started — Plan 09's state-machine keystone. Hard-blocks on Tasks 46 + 48 + 49. Owner-confirmed payment ops review of rollback / compensating-refund branches strongly recommended before merge.
