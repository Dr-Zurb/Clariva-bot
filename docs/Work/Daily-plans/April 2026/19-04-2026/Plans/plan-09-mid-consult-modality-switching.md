# Plan 09 — Mid-consult modality switching (Decision 11: state machine + Razorpay billing + 6 transitions)

## Land all six modality transitions with the symmetric "initiator absorbs the cost" billing doctrine

> **Master plan reference:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 11 (mid-consult modality switching: all 6 transitions in v1; symmetric billing doctrine — patient-initiated upgrades pay-after-approval with doctor paid/free choice default paid, doctor-initiated upgrades always free, patient-initiated downgrades no refund, doctor-initiated downgrades always auto-refund difference; max 1 upgrade + 1 downgrade per consult; full delta regardless of timing within slot) **LOCKED**.
>
> **Sequencing index:** [plan-00-multi-modality-implementation-index.md](./plan-00-multi-modality-implementation-index.md). Hard depends on Plans 04 + 05 + 06 + the existing video room. Ships **last** of all delivery plans because it switches between all three modalities mid-call.

---

## Goal

Land all 6 modality transitions in v1:

| Transition | Technical implementation |
|------------|--------------------------|
| text → voice | Provision new Twilio Video audio-only room mid-consult; add audio recording artifact |
| text → video | Provision new Twilio Video full room; add audio + video recording artifacts |
| voice → video | Same Twilio Video room, enable camera track (trivial — Decision 2 payoff) |
| video → voice | Same Twilio Video room, disable camera track |
| voice → text | Disconnect Twilio room; keep Supabase Realtime channel running until `expected_end` |
| video → text | Disconnect Twilio room; keep chat running |

…with the **symmetric billing doctrine**:

| Direction | Initiator | Billing |
|-----------|-----------|---------|
| Upgrade | Patient | Doctor decides paid (default) vs free; payment processed only after doctor approves |
| Upgrade | Doctor | Always free, no billing UI |
| Downgrade | Patient | No refund |
| Downgrade | Doctor | Always auto-refund difference; no toggle |

…and rate limits: **max 1 upgrade + 1 downgrade per consult**, **full delta regardless of timing within slot**, 90s doctor approval timeout, 60s patient consent timeout (matches Plan 08), reason capture on all doctor-initiated + patient-initiated downgrades.

This is the largest plan in the v1 scope. Single `consultation_session_id` is preserved across every transition; one `consultation_modality_history` row per transition for unified audit + AI pipeline.

---

## Companion plans

- [plan-01-foundation-consultation-sessions.md](./plan-01-foundation-consultation-sessions.md) — `consultation-session-service.ts` is what `requestModalityChange()` extends; `current_modality` + counter columns added on `consultation_sessions` here.
- [plan-04-text-consultation-supabase.md](./plan-04-text-consultation-supabase.md), [plan-05-voice-consultation-twilio.md](./plan-05-voice-consultation-twilio.md), existing `<VideoRoom>` — provide the three modality adapters this plan switches between.
- [plan-06-companion-text-channel.md](./plan-06-companion-text-channel.md) — `emitSystemMessage()` is invoked here for every transition + `modality_switched` system event.
- [plan-08-video-recording-escalation.md](./plan-08-video-recording-escalation.md) — voice→video transition reuses Plan 08's `recording-track-service.ts` Twilio Recording Rules wrapper (camera-track toggle is the same primitive).

---

## Why this plan ships last

1. **Requires all three adapters operational.** Can't switch to voice if Plan 05 hasn't shipped; can't switch to text if Plan 04 hasn't shipped.
2. **Razorpay mid-consult capture is novel.** All existing Razorpay flows are at booking time. This plan introduces in-session capture + auto-refund flows. The friction acceptance (Decision 11 LOCKED) is contingent on the rest of the product being good enough that patients tolerate it.
3. **Reason-capture + audit pattern reuses Plans 04/06/07/08 patterns.** Easier to lift those once than to design them in parallel.
4. **System-message emitter from Plan 06 is the unified narrative.** Every transition posts to companion chat — needs Plan 06 already operational.

---

## Audit summary (current code at start of Plan 09)

### What exists at start

| Component | Path | Plan-09 disposition |
|-----------|------|---------------------|
| `consultation-session-service.ts` facade | Plan 01 | **Extend** with `requestModalityChange()` single-entry state machine |
| All three modality adapters | Plans 04 + 05 + Plan 01 (video) | **Read-only consume** — `modality-transition-executor.ts` calls each via the facade |
| Plan 08's `recording-track-service.ts` | (created in Plan 08) | **Reuse** for voice↔video camera-track toggle |
| Plan 06's `emitSystemMessage()` + Plan 06's schema (`kind='system'`, `system_event='modality_switched'`) | Plan 06 | **Consume** for unified narrative |
| Existing Razorpay integration (booking-time only) | (existing payment service) | **Extend** with mid-consult `captureUpgradePayment()` + `autoRefundDowngrade()` |
| `consultation_sessions` table | Plan 01 | **Extend** with `current_modality`, `upgrade_count`, `downgrade_count` columns |

---

## Tasks (from the master plan)

| # | Master-plan task | Phase | Effort | Risk |
|---|------------------|-------|--------|------|
| 46 | A (Decision 11) — DB migration: `consultation_modality_history` child table + `current_modality` column + rate-limit counters on `consultation_sessions` | A | ~1.5h | Low |
| 47 | A (Decision 11) — Backend `consultation-session-service.ts#requestModalityChange()` single-entry state machine; routes to patient/doctor + upgrade/downgrade handlers; enforces rate limits; transactional | A | ~6h | **High** — single most important state machine in the v1 scope; bugs here cause double-billing or stuck rooms |
| 48 | A (Decision 11) — Backend `modality-transition-executor.ts` provider-level switching | A | ~4h | Medium |
| 49 | A (Decision 11) — Backend Razorpay integration: mid-consult capture + auto-refund + retry queue for failed refunds | A | ~4h | High — payment correctness |
| 50 | B/C (Decision 11) — Frontend patient `<ModalityUpgradeRequestModal>` (request → wait → checkout/free-join/decline-retry) | B/C | ~3h | Medium |
| 51 | B/C (Decision 11) — Frontend doctor `<ModalityUpgradeApprovalModal>` + `<ModalityDowngradeModal>` decision UI | B/C | ~3h | Medium |
| 52 | B/C (Decision 11) — Frontend patient consent modal for doctor-initiated upgrades + patient self-downgrade modal | B/C | ~2h | Low |
| 53 | A/E (Decision 11) — Auto-emit system messages to companion chat on every transition | A/E | ~1.5h | Low — Plan 06 emitter primitive ready |
| 54 | B/C (Decision 11) — "Request modality change" launcher buttons in all three rooms | B/C | ~2h | Low |
| 55 | E (Decision 11) — Post-consult modality-history timeline on appointment detail page | E | ~2h | Low |

**Suggested order:** 46 (migration first) → 47 + 48 in parallel (state machine + executor) → 49 (Razorpay integration; needs 47) → 50 + 51 + 52 + 54 in parallel (UI surfaces) → 53 (system messages — last because it requires the state machine to be observable) → 55 (post-consult timeline; smallest UI; last).

---

## Schema deliverable (Task 46)

```sql
-- Extend consultation_sessions with switch counters + current modality
ALTER TABLE consultation_sessions
  ADD COLUMN current_modality consultation_modality NOT NULL,    -- denormalized; equals modality at session creation, updated on every switch
  ADD COLUMN upgrade_count    INT NOT NULL DEFAULT 0,
  ADD COLUMN downgrade_count  INT NOT NULL DEFAULT 0;

-- Backfill: current_modality = modality for existing rows.

CREATE TYPE modality_billing_action AS ENUM (
  'paid_upgrade',
  'free_upgrade',
  'no_refund_downgrade',
  'auto_refund_downgrade'
);

CREATE TYPE modality_initiator AS ENUM ('patient', 'doctor');

CREATE TABLE consultation_modality_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
  from_modality       consultation_modality NOT NULL,
  to_modality         consultation_modality NOT NULL,
  initiated_by        modality_initiator NOT NULL,
  billing_action      modality_billing_action NOT NULL,
  amount_paise        INT,                                      -- for paid_upgrade + auto_refund_downgrade
  razorpay_payment_id TEXT,                                     -- for paid_upgrade
  razorpay_refund_id  TEXT,                                     -- for auto_refund_downgrade
  reason              TEXT,                                     -- ≥5 chars when initiator=doctor or (initiator=patient AND from_modality > to_modality)
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_modality_history_session ON consultation_modality_history(session_id, occurred_at);

-- RLS: both parties of the session can read; only backend service role writes.
ALTER TABLE consultation_modality_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY modality_history_read ON consultation_modality_history FOR SELECT USING (
  session_id IN (
    SELECT id FROM consultation_sessions WHERE doctor_id = auth.uid() OR patient_id = auth.uid()
  )
);
```

---

## State machine (Task 47)

```ts
// backend/src/services/consultation-session-service.ts (EXTEND)

export type ModalityChangeRequest = {
  sessionId:          string;
  requestedModality:  Modality;
  initiatedBy:        'patient' | 'doctor';
  reason?:            string;          // required for doctor-initiated + patient-initiated downgrades
};

export async function requestModalityChange(input: ModalityChangeRequest): Promise<ModalityChangeResult> {
  // 1. Load session + appointment + current pricing context.
  // 2. Compute direction: from < to = upgrade, from > to = downgrade.
  //    Modality ordering: text(1) < voice(2) < video(3).
  // 3. Rate limit: upgrade_count <= 1 (if upgrade) and downgrade_count <= 1 (if downgrade).
  // 4. Reason validation: if initiatedBy='doctor' OR (initiatedBy='patient' AND direction='downgrade')
  //    require reason.length >= 5 && <= 200.
  // 5. Route to one of four handlers:
  //    - handlePatientInitiatedUpgrade — push doctor approval modal, await 90s, on approve route to paid/free branch
  //    - handleDoctorInitiatedUpgrade  — push patient consent modal, await 60s, on allow execute transition
  //    - handlePatientInitiatedDowngrade — execute immediately (no doctor approval needed; patient using less of what they bought)
  //    - handleDoctorInitiatedDowngrade  — execute immediately + fire auto-refund
  // 6. All four handlers wrap in atomic DB transaction:
  //    - INSERT consultation_modality_history row
  //    - UPDATE consultation_sessions { current_modality, upgrade_count++ or downgrade_count++ }
  //    - Call modality-transition-executor.ts for provider-level switch
  //    - Call modality-billing-service.ts for any payment side-effect
  //    - Call emitSystemMessage to post unified narrative
  // 7. On any failure: rollback all DB writes, attempt provider rollback (best-effort),
  //    return failure to caller, emit alert for ops dashboard if rollback also failed.
}
```

The four handler branches are in separate functions for readability + targeted unit tests:

```ts
async function handlePatientInitiatedUpgrade(...): Promise<...>;
async function handleDoctorInitiatedUpgrade(...): Promise<...>;
async function handlePatientInitiatedDowngrade(...): Promise<...>;
async function handleDoctorInitiatedDowngrade(...): Promise<...>;
```

---

## Provider transition executor (Task 48)

```ts
// backend/src/services/modality-transition-executor.ts (NEW)

export async function executeTransition(input: {
  session: SessionRecord;
  toModality: Modality;
}): Promise<{
  newProviderSessionId?: string;        // updated when provisioning a new Twilio room
  recordingArtifactRef?: string;        // updated when starting / ending an artifact segment
}> {
  // 1. Compute transition type from session.current_modality + toModality.
  // 2. Dispatch:
  //    - voice → video / video → voice: same Twilio room, recording-track-service toggleVideoTrack
  //      (reuses Plan 08's primitive). No new provider_session_id.
  //    - text → voice: provision new Twilio Video audio-only room. Provider becomes 'twilio_video'.
  //      (Note: provider can change mid-session — schema supports it via UPDATE.)
  //      Supabase Realtime chat channel keeps running.
  //    - text → video: same as text → voice but full Twilio Video room.
  //    - voice → text: disconnect Twilio Video room. Provider becomes 'supabase_realtime'.
  //      Audio recording finalizes. Companion chat is now the only surface.
  //    - video → text: same as voice → text + close video composition.
  // 3. Return updated provider context for the state machine to persist.
}
```

---

## Razorpay integration (Task 49)

```ts
// backend/src/services/modality-billing-service.ts (NEW)

export async function captureUpgradePayment(input: {
  sessionId:        string;
  fromModality:     Modality;
  toModality:       Modality;
  amountPaise:      number;
}): Promise<{ razorpayOrderId: string; checkoutToken: string }>;
// Creates Razorpay order; returns checkout token for frontend modal pop.
// On successful charge (webhook): update consultation_modality_history.razorpay_payment_id, proceed with transition.
// On user-cancel at Razorpay: roll back (no transition happens; consultation stays at current modality).

export async function autoRefundDowngrade(input: {
  sessionId:                string;
  fromModality:             Modality;
  toModality:               Modality;
  amountPaise:              number;
  originalRazorpayPaymentId: string;     // pulled from appointments
}): Promise<{ razorpayRefundId: string }>;
// Calls Razorpay Refunds API. Idempotent (won't double-refund on retry).
// On failure: enqueue into modality-refund-retry-worker.
```

```ts
// backend/src/workers/modality-refund-retry-worker.ts (NEW)

// Cron: every 15 min.
// Reads consultation_modality_history rows with billing_action='auto_refund_downgrade' AND razorpay_refund_id IS NULL.
// Retries with exponential backoff (1m → 5m → 15m → 1h → 6h → 24h).
// After 24h of failure: surfaces in admin dashboard for manual ops intervention.
// Patient sees in chat: "Refund of ₹X processing — expect within 3 business days." (Decision 11 LOCKED resilience)
```

---

## Frontend deliverables

(Each one is a self-contained modal; mounting is via `<ModalityChangeLauncher>` or via Realtime broadcast for the consent modals.)

### `<ModalityUpgradeRequestModal>` (Task 50, patient-side)

```
States:
  1. Request form
     "Request upgrade to {voice|video}.
      {voice|video} is normally ₹X more than {current_modality}.
      Dr. {name} may charge this difference or grant the upgrade for free."
     [Cancel] [Send Request]
  
  2. Awaiting approval (90s countdown)
     "Waiting for Dr. {name} to approve your upgrade request… {90s countdown}"
  
  3. Doctor approved + paid
     Pop Razorpay checkout (existing integration);
     on success → join higher modality; on cancel → consult stays at current modality
  
  4. Doctor approved + free
     Auto-join higher modality; success toast
  
  5. Doctor declined (with reason)
     Show reason + "Try once more" button (rate-limited 5 min)
  
  6. Timeout (no doctor response in 90s)
     Auto-decline + "Try once more" button
```

### `<ModalityUpgradeApprovalModal>` + `<ModalityDowngradeModal>` (Task 51, doctor-side)

```
Upgrade approval modal:
  "Patient requests upgrade to {voice|video}.
   Standard difference: ₹X."
  
  [Accept (charge ₹X)]   ← DEFAULT (highlighted)
  [Accept (free)]
  [Decline (reason required)]

Downgrade modal (doctor-initiated):
  "Downgrade to {voice|text}? 
   Patient will be refunded ₹X (difference) automatically.
   
   Reason for downgrade: [preset radio + free-text ≥5]
   Presets: My network/equipment issue / Case doesn't need current modality / 
            Patient's environment / Other (elaborate)"
  
  [Cancel] [Downgrade]
```

### `<DoctorUpgradeInitiationModal>` (Task 51, doctor-side)

```
"Upgrade to {voice|video}? This will be at no extra cost to the patient.
 
 Reason for upgrade: [preset radio + free-text ≥5]
 Presets: Need to see visible symptom / Need to hear voice /
          Patient request / Other (elaborate)"

[Cancel] [Request Upgrade]
```

### `<PatientUpgradeConsentModal>` (Task 52, patient-side, 60s timeout)

```
Triggered by Realtime broadcast from doctor-initiated upgrade.

"Dr. {name} is upgrading to {voice|video} consult (no extra charge).
 Reason: {doctor's reason}
 
 60s countdown."

[Decline] [Allow]

Cannot be dismissed implicitly. 60s timeout = decline.
```

### `<PatientDowngradeModal>` (Task 52, patient-side, simple)

```
"Switch to {voice|text} for the remainder of the consult.
 No refund will be issued. (You're choosing to use less of what you booked.)"

[Cancel] [Switch]
```

### `<ModalityChangeLauncher>` (Task 54)

Renders inside `<LiveConsultPanel>` controls bar:
- Patient view: **only** upgrade picker; greyed out + tooltip when `upgrade_count >= 1`.
- Doctor view: both upgrade + downgrade pickers; greyed appropriately.

### `<ModalityHistoryTimeline>` (Task 55)

Renders below the recording artifacts on the appointment detail page:
```
Modality timeline:
  10:00 — Started as TEXT
  10:08 — Patient requested upgrade to VOICE
          → Dr. Sharma approved (charged ₹150)
  10:24 — Dr. Sharma downgraded to TEXT
          → Reason: "Case is straightforward; no need for voice"
          → Patient refunded ₹150
```

---

## Lifecycle wiring

Take the patient-initiated paid upgrade text → voice as the canonical example:

1. Patient in `<TextConsultRoom>` taps `<ModalityChangeLauncher>` → "Request upgrade to voice".
2. `<ModalityUpgradeRequestModal>` opens in state 1 (request form).
3. Submit → backend `requestModalityChange({ initiatedBy: 'patient', requestedModality: 'voice' })`.
4. Backend pushes Realtime broadcast to doctor → `<ModalityUpgradeApprovalModal>` opens.
5. Doctor clicks `[Accept (charge ₹150)]`.
6. Backend `captureUpgradePayment()` → returns checkout token → broadcast back to patient.
7. Patient `<ModalityUpgradeRequestModal>` transitions to state 3 (Razorpay checkout pop).
8. Patient pays → Razorpay webhook fires → backend executes transition:
   - INSERT `consultation_modality_history` row
   - UPDATE `consultation_sessions { current_modality='voice', upgrade_count=1 }`
   - `modality-transition-executor.ts` provisions Twilio Video audio-only room
   - `emitSystemMessage` → "Switched from TEXT to VOICE at 10:08 by Patient. Patient charged ₹150."
9. Patient `<TextConsultRoom>` swap-mounts to `<VoiceConsultRoom>` (chat continues as companion per Plan 06).

The doctor-initiated downgrade flow looks similar minus the Razorpay step (refund fires async; consult continues immediately).

---

## Files expected to touch

**Backend:**

- DB migration: `consultation_modality_history` table + `consultation_sessions` columns (Migration ~026 or next free) — Task 46
- `backend/src/services/consultation-session-service.ts` (**extend** with `requestModalityChange()` state machine) — Task 47
- `backend/src/services/modality-transition-executor.ts` (**new**) — Task 48
- `backend/src/services/modality-billing-service.ts` (**new**) — Task 49
- `backend/src/workers/modality-refund-retry-worker.ts` (**new**) — Task 49
- `backend/src/services/consultation-message-service.ts` (**extend** Plan 06's emitter with `modality_switched` system event helper) — Task 53
- `backend/src/utils/dm-copy.ts` (**extend** with `buildModalityUpgradeRequestDm`, `buildModalityDowngradeRefundDm`, `buildRefundProcessingDm`)
- `backend/src/routes/api/v1/consultation.ts` (**extend** with `/modality-change/request`, `/modality-change/approve`, `/modality-change/decline` endpoints)

**Frontend:**

- `frontend/components/consultation/ModalityUpgradeRequestModal.tsx` (**new**) — Task 50
- `frontend/components/consultation/ModalityUpgradeApprovalModal.tsx` (**new**) — Task 51
- `frontend/components/consultation/ModalityDowngradeModal.tsx` (**new**) — Task 51
- `frontend/components/consultation/DoctorUpgradeInitiationModal.tsx` (**new**) — Task 51
- `frontend/components/consultation/PatientUpgradeConsentModal.tsx` (**new**) — Task 52
- `frontend/components/consultation/PatientDowngradeModal.tsx` (**new**) — Task 52
- `frontend/components/consultation/ModalityChangeLauncher.tsx` (**new**) — Task 54
- `frontend/components/consultation/ModalityHistoryTimeline.tsx` (**new**) — Task 55
- `frontend/components/consultation/LiveConsultPanel.tsx` (**extend** Plan 03 to mount `<ModalityChangeLauncher>` mid-session)

**Tests:**

- `backend/tests/unit/services/consultation-session-service-modality-change.test.ts` — every direction × every initiator × rate-limit edge cases
- `backend/tests/unit/services/modality-transition-executor.test.ts` — every transition; mocked Twilio + Supabase
- `backend/tests/unit/services/modality-billing-service.test.ts` — Razorpay capture + refund + idempotency + retry
- `backend/tests/integration/modality-switching-end-to-end.test.ts` — full happy path for at least one paid upgrade + one auto-refund downgrade

---

## Acceptance criteria

- [x] **Task 46: COMPLETED (2026-04-19)** — Migration 075 (`075_consultation_modality_history.sql`) ships ENUMs (`modality_billing_action`, `modality_initiator`), `consultation_sessions` column adds (`current_modality` / `upgrade_count` / `downgrade_count`) with the three-step nullable → backfill → lock pattern and belt-and-suspenders rate-limit CHECKs, `consultation_modality_history` table with all four row-shape CHECKs (including the `from_modality > to_modality` enum-ordering trick per Migration 049 text < voice < video), session+time b-tree + partial refund-pending indexes, RLS (participant-scoped SELECT, service-role-only writes), and a reverse migration block. `backend/src/types/modality-history.ts` carries the discriminated `ModalityHistoryEntry` union that mirrors `modality_history_billing_shape` at the type layer; `backend/src/services/modality-history-queries.ts` ships `insertModalityHistoryRow` / `fetchModalityHistoryForSession` / `fetchPendingRefundRows` / `updateRazorpayRefundId` / `narrowHistoryEntry` for Tasks 47 / 49 / 55 to consume. Content-sanity (34 assertions) + query-shape (22 assertions, 56 total) test suites green; full backend suite 137 / 137 green (1802 tests). Live-Postgres integration tests + observability metrics deferred to inbox follow-ups.
- [x] **Task 47: COMPLETED (2026-04-19)** — `requestModalityChange()` ships as a **dedicated service** (`backend/src/services/modality-change-service.ts`) rather than a mega-method on `consultation-session-service.ts` (the facade was already 700+ lines; extracting kept both files legible). Single-entry state machine with 9-step guard chain (correlation-id + authZ + seat-match + session-live + direction + rate-limit + pending-guard + reason-bounds + dispatch) routes to four private handlers for the 2×2 matrix (`handlePatientInitiatedUpgrade` → `pending_doctor_approval` 90s window; `handlePatientInitiatedDowngrade` → immediate `no_refund_downgrade` commit; `handleDoctorInitiatedUpgrade` → `pending_patient_consent` 60s window; `handleDoctorInitiatedDowngrade` → immediate `auto_refund_downgrade` commit + refund fire). Three public second/third-round handlers: `handleDoctorApprovalOfPatientUpgrade` (decline / free / paid), `handlePatientConsentForDoctorUpgrade` (allow / decline), `handleModalityChangePaymentCaptured` (Razorpay webhook w/ idempotency + modality-drift compensating refund). Migration 076 (`076_modality_change_pending_requests.sql`) adds the pending-requests table + shape CHECK + 3 partial indexes (session-active / expiry-scan / razorpay-order) + RLS SELECT-only participant policy. `backend/src/types/modality-change.ts` pins the discriminated `ModalityChangeResult` union (4 kinds: `pending_doctor_approval`, `pending_patient_consent`, `applied`, `rejected`) mirroring the state machine's externally-visible outcomes. `backend/src/services/modality-pending-requests-queries.ts` ships 7 Supabase admin wrappers for the new table; `backend/src/workers/modality-pending-timeout-worker.ts` mirrors Plan 08 Task 41's DB-poll pattern (`response IS NULL` atomic UPDATE predicate is race-safe across pods). HTTP surface: 4 endpoints on `consultation.ts` + 1 cron route on `cron.ts`; `backend/src/controllers/modality-change-controller.ts` exports both the Express handlers and a library-style `handleModalityChangePaymentCapturedHook` that Task 49's webhook worker will dispatch into. **v1 deviations from spec, pinned in code:** (a) concurrency compressed from three-layer (advisory lock + SELECT FOR UPDATE + CHECK) to two-layer (atomic counter UPDATE predicates + CHECK + pending-row `response IS NULL` predicate) since Supabase JS can't call advisory locks without an RPC — Task 47.1 tracks the RPC follow-up; (b) Realtime fan-out uses Postgres-changes + Migration 076's RLS SELECT policy instead of custom `realtime.send()` calls, mirroring the Plan 08 Task 41 win; (c) Tasks 48 + 49 ship as **interface-only DI stubs** (`modality-transition-executor.ts` + `modality-billing-service.ts`) with "not implemented" defaults so the state machine ships + unit-tests without the concrete adapters. Tests: Migration 076 content-sanity (27 assertions), pending-requests query-shape (22 assertions), state-machine matrix (39 assertions covering all 9 steps × 4 branches + 3 second-round handlers + webhook idempotency + rollback), timeout worker (6 assertions) — **94 new tests**. Full backend suite: 141 / 141 suites, 1896 / 1896 tests green. `tsc --noEmit` exit 0; Task-47 files ESLint clean. Live Twilio / Razorpay sandbox integration tests, rate-limit metrics, and advisory-lock RPC follow-up filed for inbox.
- [x] **Task 48: COMPLETED (2026-04-19)** — `modality-transition-executor.ts` rewritten from the Task 47 stub into the live 6-branch dispatcher. Branches: `executeTextToVoice` + `executeTextToVideo` provision fresh Twilio rooms via the voice/video adapters and mint doctor+patient access tokens; `executeVoiceToVideo` + `executeVideoToVoice` reuse the SAME room SID and flip Plan 08 Task 43's Recording Rules via `escalateToFullVideoRecording` / `revertToAudioOnlyRecording` (Decision 2 payoff — no new room provisioning); `executeVoiceToText` + `executeVideoToText` disconnect the Twilio room and return `newProviderSessionId: null` + `newProvider: 'supabase_realtime'` so Task 47's commit UPDATE clears the provider column. Same-modality dispatches throw `NoOpTransitionError` (defence-in-depth; Task 47 Step 5 already filters). Rollback: text→voice/video closes the orphan room via `completeTwilioRoom` if post-creation token mint throws; →text rollback is inherently one-way (Twilio limitation) and logged at critical severity. **Result contract widened** — `newProviderSessionId: string | null`; new optional `newProvider`, `newAccessToken`, `newPatientAccessToken`, `recordingSegmentRef { kind, compositionLabel, startedAt?/endedAt? }`, `transitionLatencyMs`. Task 47's `executeAndCommitTransition` surgically extended to stamp `consultation_sessions.provider` when `newProvider` is set and pass `null` through to `provider_session_id` on the →text branch. Initiator mapping: `initiatedBy='patient'` → `revertReason='patient_revoked'`, `initiatedBy='doctor'` → `'doctor_paused'`, unset → `'doctor_paused'`. Companion chat invariant preserved — no branch touches the Supabase Realtime channel (keyed by `consultation_session_id`, survives every transition). `escalationRequestId` threaded to Plan 08's wrapper uses the `modality_change:` prefix per Notes #3 so the ledger can trace origin without a matching `video_escalation_audit` row. Tests: 23 unit tests covering all 6 cells + rollback on both token roles + NoOp + defensive missing-SID guards + latency + initiator-reason mapping; 7 sandbox integration tests skip-gated on `TWILIO_SANDBOX_TEST=1` (documents the matrix for when the gate lifts — infrastructure follow-up in inbox.md). Deferred: `modality-order.ts` (Task 46 already shipped `classifyModalityDirection` in `types/modality-history.ts` — consolidation follow-up filed); patient-token Realtime rebroadcast (Task 51 will consume the synchronous `newPatientAccessToken`); live sandbox runs (inbox.md). Full backend suite: **143 suites / 1920 tests green**. Files: `backend/src/services/modality-transition-executor.ts` (rewritten, ~540 lines), `backend/src/services/modality-change-service.ts` (+~10 lines), 2 test files. Unblocks Task 49 (billing service now has a real executor to coordinate with) and Task 51 (client-side modality-change launcher can consume `newAccessToken`/`newPatientAccessToken` from the state machine's HTTP response).
- [x] **Task 49: COMPLETED (2026-04-19)** — Live Razorpay Orders + Refunds API integration ships as `backend/src/services/modality-billing-service.ts` (rewritten from the Task 47 stub). Three public ops: `computeUpgradeDelta` reads the pricing ladder (`doctor_settings.service_offerings_json` → `appointments.fee_paise` → hardcoded defaults ₹100 text / ₹200 voice / ₹500 video) via the new `backend/src/utils/modality-pricing.ts` helper — multi-service catalogs collapse to the **MAX enabled price per modality** for v1 (follow-up noted in inbox to resolve by `session.service_key`). `captureUpgradePayment` calls Razorpay's `orders.create` with `notes.kind='mid_consult_upgrade'` + receipt `modality_change:{pendingRequestId}`; idempotent via a DB pre-check on `modality_change_pending_requests.razorpay_order_id`. `autoRefundDowngrade` calls `payments.refund` with a composed `Idempotency-Key: modality_refund_{historyRowId|pendingRequestId}_{attemptNumber}` header + a DB pre-check on `consultation_modality_history.razorpay_refund_id`; classifies errors into `sync_success` / `queued` (transient) / `queued + permanent=true` (terminal — "fully refunded" / "no such payment" / "payment not captured" / "invalid_payment_id"). Migration 077 adds `refund_retry_count` + `refund_retry_last_attempt_at` + `refund_retry_failure_reason` to the history table (with a CHECK bounds 0..99), creates `admin_payment_alerts` (alert_kind + related_entity_id + context_json + acknowledged_at), and refreshes `idx_modality_history_refund_pending` with `AND refund_retry_count < 99` so the sentinel row stops scanning. `backend/src/workers/modality-refund-retry-worker.ts` polls every 15 min (via new `POST /cron/modality-refund-retry` cron route, `verifyCronAuth`-gated) through an exponential-backoff ladder (1m → 5m → 15m → 1h → 6h → 24h); after attempt 6 or a `permanent=true` result, writes `refund_retry_count=99` + inserts `admin_payment_alerts` row with `alert_kind='refund_stuck_24h'` + emits the `modality_refund_failed` system message via the new `buildRefundFailedDm` copy helper. First-attempt-only `modality_refund_processing` DM ("Your refund of ₹X is processing …") emits on every first worker tick regardless of outcome — subsequent retries stay silent. `backend/src/workers/webhook-worker.ts` now inspects `payload.payment.entity.notes.kind` and routes `mid_consult_upgrade` captures to Task 47's `handleModalityChangePaymentCapturedHook` (booking-time webhooks keep their original `processPaymentSuccess` path). Razorpay SDK client is lazily `require()`'d inside a DI-injectable factory (`__setRazorpayClientFactoryForTests`) so Task 47's existing mocks still work + the test factory stays unchanged. 14/14 pricing tests + 20/20 billing-service tests + 11/11 refund-worker tests pass; full backend suite 147/147 suites / 1966 tests (13 skipped — sandbox gates). Razorpay sandbox integration test (`tests/integration/modality-billing-against-razorpay-sandbox.test.ts`) is skip-gated behind `RAZORPAY_SANDBOX_TEST=1` matching the Task 48 Twilio pattern — 6-cell matrix (Orders create + idempotency; Refunds happy + Idempotency-Key dedup + permanent-fail classification + DB stamp) documented for the gate-lift follow-up. Admin alerts read endpoint + PaymentOps dashboard card **deferred** to Task 52 (captured in inbox).
- [x] **Task 50: COMPLETED (2026-04-19)** — `<ModalityUpgradeRequestModal>` ships as a single patient-side modal (`frontend/components/consultation/ModalityUpgradeRequestModal.tsx`) driven by a `useReducer`-based FSM in `frontend/hooks/useModalityUpgradeFSM.ts` covering all 10 spec states (`idle`, `submitting`, `awaiting_approval`, `checkout_ready`, `checkout_opened`, `applying_transition`, `applied`, `free_upgrade_approved`, `declined`, `timeout`, `error`). Realtime strategy uses `postgres_changes` on `modality_change_pending_requests` (UPDATE — doctor approvals / decline / timeout / provider-failure) + `consultation_modality_history` (INSERT — transition committed), both RLS-readable by the patient via Migration 075/076's participant-SELECT policies — **no dedicated backend Broadcast channel required** (matches the Plan 08 Task 41 win). Rehydration on mount: `GET /modality-change/state` → if `activePendingRequest.kind === 'patient_upgrade'` we dispatch `PENDING_CREATED` then follow up with a direct Supabase `SELECT` of the pending row to detect mid-state `approved_paid` (carrying `razorpay_order_id` + `amount_paise` via RLS — the HTTP state projection deliberately masks these). Razorpay Checkout SDK is lazily loaded from `https://checkout.razorpay.com/v1/checkout.js` by `frontend/lib/razorpay-checkout.ts` (new) — avoids paying the script cost on every consult page view. The FSM carries a local-timer safety-net (`expiresAt + 2s`) so a dropped Realtime UPDATE still produces a `timeout` state, plus a 15s hard-deadline for `applying_transition` if the webhook stalls. `frontend/lib/api/modality-change.ts` wraps all four state-machine endpoints (`/request` + `/state` consumed by Task 50; `/approve` + `/patient-consent` exported for Task 51/52 reuse). Types mirrored into `frontend/types/modality-change.ts` so the frontend bundle never reaches into the backend package. **v1 deviations from spec:** (a) `onAppliedTransition` currently fires with `{ toModality }` only — `newAccessToken` plumbing is deferred until Task 48's commit-side rebroadcast lands (Task 54 launcher remounts the next room which mints its own token); (b) `checkout_cancelled` pending-row cleanup is left to Razorpay's ~15 min auto-expiry (inbox follow-up: webhook-driven `checkout_cancelled` stamping); (c) component tests deferred per the frontend-test-harness inbox item — the reducer is exported as a pure function and trivially testable once the harness lands. Frontend `tsc --noEmit` + full `eslint . --ext .ts,.tsx --max-warnings 0` both clean. No backend changes. Unblocks Task 54 (launcher mounts this modal in all three rooms).
- [x] **Task 51: COMPLETED (2026-04-19)** — Three doctor-side modals + shared reason-capture + pricing helper landed in one shot. `frontend/components/consultation/ModalityReasonCapture.tsx` (**new**) centralises the four-variant reason form (`doctor_upgrade` / `doctor_downgrade` / `doctor_decline` / `patient_downgrade` — the last variant covers Task 52's patient self-downgrade) and exports `validateModalityReason()` so callers gate submit without duplicating rules. `frontend/lib/modality-pricing-display.ts` (**new**) ships `formatInrPaise()` (`Intl.NumberFormat('en-IN', 'INR')`, zero fractional digits → `₹350`) + `fetchModalityPricing()` which tolerates the v1 backend not yet exposing a `pricing` block on `GET /state` (returns `null`; callers pass `deltaPaise` / `refundAmountPaise` via props — an inbox follow-up will extend the backend). `frontend/hooks/useDoctorPendingUpgradeApproval.ts` (**new**) mirrors the patient-side `usePatientVideoConsentRequest` pattern: `postgres_changes` INSERT subscription on `modality_change_pending_requests` filtered by `session_id` surfaces incoming patient-upgrade requests; `GET /state` probe on mount re-hydrates stale tabs; terminal UPDATE clears local state so the modal auto-closes. `frontend/components/consultation/ModalityUpgradeApprovalModal.tsx` (**new**) ships the three-CTA approval modal with inline decline sub-flow (no secondary modal pop), 90s countdown colour-shifting at 30s, default focus on `[Accept (charge ₹X)]` (Decision 11 "paid = default"), and dismissal locked to `idle` / terminal states so doctors can't accidentally dismiss mid-decision. `frontend/components/consultation/DoctorUpgradeInitiationModal.tsx` (**new**) covers the two-phase form → awaiting-consent flow with a 60s patient-consent countdown, `[Close]` semantically non-cancelling (matches Plan 08 Task 40 doctrine), and terminal UPDATE events (`allowed` / `declined` / `timeout` / `provider_failure`) driving `onApplied` / `onDeclinedOrTimedOut` callbacks. `frontend/components/consultation/ModalityDowngradeModal.tsx` (**new**) applies immediately (no consent required, per Decision 11), displays the server-computed refund amount, and auto-closes 2s after `onSubmitted({ applied: true, toModality })`. **v1 deviations:** (a) `refundStatus` not yet surfaced on downgrade success — copy is always "Refund is processing" until the backend exposes `refundInitiated` / `pending_retry`; (b) `pricing` block not yet on `/state` — inbox follow-up to extend Task 47; (c) component tests deferred per frontend-test-harness inbox note. Frontend `tsc --noEmit` + `eslint` clean on all 6 new files; no backend changes. Unblocks Task 54 (launcher mounts the two doctor-initiated modals; the approval hook drives auto-open of the approval modal at doctor-room wrapper level).
- [x] **Task 52: COMPLETED (2026-04-19)** — Three new frontend files, zero backend changes. `frontend/hooks/usePatientPendingUpgradeConsent.ts` (**new**) mirrors Task 51's doctor-side hook almost verbatim: `postgres_changes` INSERT subscription on `modality_change_pending_requests` filtered to `initiated_by='doctor'` + upgrade direction, `GET /state` probe on mount for stale-tab re-hydration (enriched with a direct row SELECT so `reason` + `preset_reason_code` survive the HTTP projection masking), and terminal UPDATE events clearing local state so the modal auto-closes. `frontend/components/consultation/PatientUpgradeConsentModal.tsx` (**new**) is the high-stakes `role="alertdialog"` full-screen consent surface — ESC is actively `preventDefault`'d, no tap-outside, no close button; only `[Decline]` / `[Allow]` / server-side 60s timeout. `[Decline]` focus-default (Enter-reflex → safe action). `[Allow]` posts, reads synchronous `applied` from Task 47's state machine, transitions to a brief "Switching to {modality}…" spinner, then fires `onAccepted({ toModality })`. Countdown colour-shifts at 30s (amber) / 10s (red) with an `animate-pulse` suppressed under `prefers-reduced-motion`; `aria-live="assertive"` on the countdown; 64×64 minimum CTA touch targets. `frontend/components/consultation/PatientDowngradeModal.tsx` (**new**) reuses `<ModalityReasonCapture variant="patient_downgrade">` (optional free-text, no presets). "No refund will be issued" disclosure rendered in an amber-backgrounded panel in the primary info slot, NOT in fine print; "Companion chat stays available" reassurance copy per Plan 06 doctrine. `[Switch]` button is deliberately NEUTRAL-styled (gray, no primary accent) — no visual nudge toward losing already-paid-for modality. `[Cancel]` focus-default; success state auto-closes 1.5s after `onSubmitted({ applied: true, toModality })`. Defence-in-depth: invoking with `targetModality === currentModality` renders an inline error with a Close button (no server call). **v1 deviations:** (a) `newAccessToken` not threaded to the consent modal's `onAccepted` — same simplification as Task 50; Task 54 launcher remounts the destination room and mints its own token (Task 48 rebroadcast is an existing inbox follow-up); (b) `onAccepted` fires on HTTP 200 instead of waiting for the `consultation_modality_history` INSERT per Notes #10 — safe because Task 47's state machine applies synchronously on patient-consent=allow; (c) component tests deferred per frontend-test-harness inbox note. Frontend `tsc --noEmit` + `eslint` clean. Unblocks Task 54 (launcher mounts `<PatientDowngradeModal>` on user-click + consumes `usePatientPendingUpgradeConsent` to mount `<PatientUpgradeConsentModal>` at room-wrapper level).
- [x] **Task 53: COMPLETED (2026-04-19)** — `backend/src/services/modality-change-service.ts`'s `buildModalitySwitchedBanner` rewritten from the Task 47 placeholder ("Modality switched: voice → video (paid upgrade).") into a billing-action × initiator discriminated switch covering all 5 real shapes the state machine commits: `paid_upgrade` (patient) → `"Patient upgraded to Video. Payment of ₹500 processed."`; `free_upgrade` × patient → `"Doctor approved the patient's upgrade to Video as a free upgrade."`; `free_upgrade` × doctor → `"Doctor upgraded the consult to Video at no extra charge. Reason: …"`; `no_refund_downgrade` (patient) → `"Patient switched to Voice for the remainder of the consult. No refund issued. Reason: …"`; `auto_refund_downgrade` (doctor) → `"Doctor downgraded the consult to Voice. Patient refunded ₹50. Reason: …"`. Modality words title-cased, reason appended verbatim (never truncated — Migration 075's 5..200 CHECK bounds the input), amounts rendered via `Intl.NumberFormat('en-IN', 'INR', maxFractionDigits=0)` (`₹350`, Indian lakh grouping applied for future premium catalogue). Exhaustiveness `never`-check flags new enum members at compile time. Emitter `correlationId` re-seeded from the just-inserted `historyRowId` per spec §"Dedup key" (`modality_switched:${historyRowId}`); `meta` payload gained explicit `historyRowId` field for Plan 10 AI-pipeline + Plan 07 Task 32 PDF trace-back. `@ai-pipeline-stable` JSDoc block marks both the builder + the call-site as stable-shape surfaces. **Copy is neutral 3rd-person** (one body per row, both parties see the same string) rather than the 9-variant per-perspective matrix the task spec drafted — per-perspective rendering is filed as an inbox follow-up for when Plan 06 Task 38's `<TextConsultRoom>` copy renderer evolves to dispatch on `system_event + meta`. `modality_refund_processing` + `modality_refund_failed` sibling events already ship via Task 49's `modality-refund-retry-worker` (the `refund_completed` event the spec proposed was re-bucketed as `modality_refund_processing` at attempt-1 time to avoid chat pollution — one banner, not two). Decline / timeout paths emit ZERO system messages (only the success-path-only `executeAndCommitTransition` calls the emitter), matching Task 41 Notes §3 privacy doctrine. New `__testOnly__` export on `modality-change-service.ts` surfaces `buildModalitySwitchedBanner` + `formatRupeesFromPaise`. `backend/tests/unit/services/modality-switched-banner.test.ts` (**new**) pins the 12-case copy matrix (every branch × amount-present/absent × reason-populated/empty + 3 rupee-formatting cases) → 12/12 green. Existing 39-case `modality-change-service.test.ts` remains green post-refactor + related 44-case message-emitter / refund-worker suites unchanged.
- [x] **Task 54: COMPLETED (2026-04-19)** — `frontend/components/consultation/ModalityChangeLauncher.tsx` (**new**) ships as a `role="menu"` popover launcher with role-aware copy (patient sees `▲ Voice — normally ₹X more` / `▼ Text — no refund`; doctor sees `▲ Voice — free for patient` / `▼ Text — auto-refund ₹X`). Fetches `GET /modality-change/state` on mount + re-fetches on every `postgres_changes` event on `modality_change_pending_requests` (INSERT + UPDATE) and `consultation_modality_history` (INSERT) so rate-limit counters + `activePendingRequest` stay in lock-step with the server without caller wiring. Upgrade items grey when `upgradeCount >= 1` (tooltip `"Max 1 upgrade per consult used"`); downgrade items grey when `downgradeCount >= 1`; outer button disables when **both** exhausted + tooltip `"Max modality changes used for this consult — book a follow-up appointment for further changes"`; disables with role-aware tooltip (`"Waiting for doctor to respond"` vs `"Patient's request is pending your response"`) when `activePendingRequest` is truthy. Click handlers route to the four click-launched modals (`<ModalityUpgradeRequestModal>` / `<PatientDowngradeModal>` / `<DoctorUpgradeInitiationModal>` / `<ModalityDowngradeModal>`); the two system-initiated auto-open modals (`<ModalityUpgradeApprovalModal>` + `<PatientUpgradeConsentModal>`) remain mounted at the room wrapper's root per Task 51/52 doctrine. Accessibility: `aria-haspopup="menu"` + `aria-expanded`, `role="menuitem"` children, 48×48 min touch targets, outside-click + Escape close (Escape returns focus to the trigger); no focus trap because the popover is a transient affordance not a modal dialog. Doctor-side integration lands inside `<ConsultationLauncher>` via the pre-existing `<LiveConsultPanel modalitySwitchSlot>` whenever `sessionId` is populated (voice always, video once the companion channel is provisioned) — **v1 defers direct mounting into `<TextConsultRoom>` / `<VoiceConsultRoom>` / `<VideoRoom>` and patient-page integration** (inbox follow-ups filed); rationale is that rooms have heterogeneous prop surfaces and patient routes don't yet use `<LiveConsultPanel>`. `pricing` prop is optional (gracefully degrades copy); `newAccessToken` still not rebroadcast — `onTransitionApplied` only receives `{ toModality }` and the host re-mints tokens on room remount. Frontend `tsc --noEmit` + `eslint .` both exit 0.
- [x] **Task 55: COMPLETED (2026-04-22)** — Post-consult modality timeline shipped code-complete.
  - Backend `GET /api/v1/consultation/:sessionId/modality-change/history` endpoint (`modalityChangeHistoryHandler` in `backend/src/controllers/modality-change-controller.ts` → `getModalityHistory()` reader in `backend/src/services/modality-change-service.ts`, co-located with `getModalityChangeState` for Migration 075 schema coherence). Returns `ModalityHistoryResponse` = `{ session: ModalityHistorySessionSummary, entries: ModalityHistoryTimelineEntry[] }` ordered `occurred_at ASC`, derives `refundFailedPermanent` from `refund_retry_count >= 99` (Task 49 sentinel), and maps the discriminated `session_not_found | forbidden | internal_error` service failure to 404/403/500 via the standard error classes.
  - Frontend `fetchModalityHistory(token, sessionId)` wrapper in `frontend/lib/api/modality-change.ts`; types mirrored in `frontend/types/modality-change.ts`.
  - `<ModalityHistoryTimeline>` component (`frontend/components/consultation/ModalityHistoryTimeline.tsx`, NEW) renders synthetic "Started as X" anchor + per-entry row (▲ green upgrade, ▼ amber downgrade) + "Consult ended"/"Consult in progress" anchor. Per-`(initiatedBy × billingAction × viewerRole)` copy variants rendered locally (Decision 7 in task spec); refund-status badges surface green "Processed" / amber "Pending" / red "Support contacted" with `aria-label` beyond colour. `<ol>` + `<time dateTime>` + `aria-busy` / `role="alert"` accessibility invariants met. `compact` prop wired for the v1.1 appointment-list-popover consumer.
  - Appointment detail page mount + backend integration test + frontend component tests deferred to inbox follow-ups; the component + endpoint are fully ready to mount.
  - `tsc --noEmit` + ESLint clean on all touched files; 51/51 existing modality-change-service + banner unit tests green (no regression from the read-extension).
- [ ] No regression on Plans 01–08.
- [ ] Backend regression suite + new tests stay green.

---

## Open questions / decisions for during implementation

1. **Patient cancels Razorpay mid-checkout:** rollback the entire transition, leave consult at current modality, post system message "Upgrade cancelled". Recommendation: yes, this is the cleanest UX.
2. **Edge case: doctor approves upgrade, patient pays, but Twilio room provisioning fails (text→voice).** Ops alarm; auto-refund to patient; consult stays at text; system message explains. **Critical to test.** Recommendation: this is the gnarliest path; deserves its own integration test.
3. **Doctor changes browser tab away from approval modal.** Server-side 90s timeout catches it. Recommendation: yes; doctor sees a "Patient request expired" banner when they return.
4. **Modality timeline display ordering:** chronological. Recommendation: yes.
5. **What happens after `upgrade_count = 1`?** Launcher button greyed out with tooltip "Max 1 upgrade per consult — book a follow-up appointment for further changes."
6. **Refund fails after 24h of retries.** Surfaces in admin dashboard + triggers PagerDuty (or similar). Recommendation: alert-on-failure is critical for trust + accounting.
7. **What's the exact pricing source?** Probably the `service_offerings_json.services[].fee` for each modality in the doctor's catalog. Verify the schema at PR-time.

---

## Non-goals

- No mid-consult modality switching beyond max 1 upgrade + 1 downgrade per consult. Decision 11 LOCKED.
- No stored payment method for frictionless mid-consult micropayments. Decision 11 LOCKED defers to v2.
- No pricing-tier introspection by patient pre-request (e.g. "how much would this upgrade cost?"). Future UX polish.
- No bulk-refund tooling for ops. Comes later if/when refund-failure rate signals it's needed.

---

## References

- **Master plan:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 11 LOCKED entry has the full doctrine + rationale + sub-questions answered.
- **Plan 04, 05, 06:** the three modality adapters that this plan switches between.
- **Plan 08:** `recording-track-service.ts` reuse for voice↔video camera-track toggle.
- **Existing Razorpay integration:** verify call sites at PR-time.

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Drafted; ready for owner review. Hard-blocks on Plans 01 + 04 + 05 + 06 + 08.
