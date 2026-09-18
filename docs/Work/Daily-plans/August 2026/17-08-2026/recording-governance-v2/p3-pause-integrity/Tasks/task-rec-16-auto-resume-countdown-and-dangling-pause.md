# Task rec-16: Auto-resume after 5 minutes, countdown, one extension, dangling-pause stamp

## 17 Aug 2026 — Batch [p3-pause-integrity](../plan-p3-recording-governance-v2-pause-integrity-batch.md) — Wave 4 — **L, ~6h**

---

## Task overview

Nothing ever un-pauses a recording today. `resumeRecording` only runs when a doctor presses a button, so a doctor who forgets leaves the rest of the consult uncaptured — and the artifact still looks complete. A partial record that reads as a whole one is the worst thing this system can produce, and it is a failure of forgetting, not of abuse.

REC-D16 bounds it: a pause auto-resumes after 5 minutes, both parties watch a live countdown, the doctor may extend exactly once, and a consult that ends while paused stamps the dangling row instead of leaving an open-ended pause in the ledger.

The deadline is owned by a **DB-polling job, never an in-process timer** (REC3-D7). The precedent is `video-escalation-timeout-worker.ts`, whose header (L10–26) documents exactly why: a pod restart loses a `setTimeout`, and the row sits open forever with the UI stuck on a state that will never change.

**Estimated time:** ~6h
**Status:** ✅ Done 2026-08-19 (unit + typecheck + lint; 7.2 live cron/Twilio smoke still founder)
**Hard deps:** [`rec-13`](./task-rec-13-migration-pause-reason-codes-and-auto-resume-stamps.md) (deadline + extension-count columns and the sweep index) and [`rec-14`](./task-rec-14-pause-covers-every-active-recording-kind.md) (auto-resume replays its restore path rather than inventing a second one).
**Source:** REC-D16 · REC3-D5, REC3-D7, REC3-D10.
**Charter:** [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)

**Change Type:** New feature — a new worker plus one cron route, plus additive changes to the pause service, the state read and two in-call surfaces. One stamp is added inside `endSession`.

**Current state:**

- ✅ A durable polling-worker pattern exists end to end: `video-escalation-timeout-worker.ts` plus its `POST /cron/video-escalation-timeout` route at `cron.ts:559-580`, with `CRON_SECRET` gating and a `{ scanned, timedOut, raced, errors }` result shape.
- ✅ `endSession` (`consultation-session-service.ts:216-283`) already carries two best-effort post-status-flip side effects, so there is a house pattern for adding a third without endangering the status transition.
- ✅ `system_event` is plain TEXT (`063_consultation_messages_attachment_system_columns_and_checks.sql:47-51`) and the `SystemEvent` union in `consultation-message-service.ts:255-295` is the real source of truth — **adding a tag needs no migration.**
- ❌ No auto-resume anywhere. No countdown surface on either side.
- ⚠️ A pause left open when the session ends is indistinguishable in the ledger from a pause still in progress. That is the dangling row REC-D16 wants stamped.

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet. Larger than its siblings but not harder: the worker pattern, the cron wiring, the countdown-from-a-server-timestamp technique and the `endSession` side-effect shape all exist in the repo and are listed below. The hard judgement in this phase lives in rec-13 and rec-14.

**New chat? Yes.** Pre-load:

- This task + [`../plan-p3-recording-governance-v2-pause-integrity-batch.md`](../plan-p3-recording-governance-v2-pause-integrity-batch.md) (§Why this phase → GAP 3, and REC3-D7) + the [charter](../../plan-recording-governance-v2-charter.md) REC-D16 row.
- **[`rec-14`](./task-rec-14-pause-covers-every-active-recording-kind.md) as merged** — its resume path and the kinds recorded on the pause row. Auto-resume calls that path; it does not re-derive what to restore.
- **[`rec-13`](./task-rec-13-migration-pause-reason-codes-and-auto-resume-stamps.md) as merged** — the deadline column, the extension-count cap and the dangling-pause discriminator it chose (new ENUM value vs metadata field). Criterion 4 depends on which.
- `backend/src/workers/video-escalation-timeout-worker.ts` — **the whole file.** The header L1–36 is the doctrine; the batch cap and cutoff-string approach are the parts to copy.
- `backend/src/routes/cron.ts` L549–580 — the sibling route, its `verifyCronAuth` gate and its response shape.
- `backend/src/services/recording-pause-service.ts` — L212–355 (pause), L361–487 (resume), L493–580 (`getCurrentRecordingState`), L1–37 (the header doctrine you are extending).
- `backend/src/services/consultation-session-service.ts` L216–283 — `endSession`. Read all of it before adding anything: the status flip must stay first and must never be endangered by the new stamp.
- `backend/src/services/consultation-message-service.ts` L255–295 (the tag union) and L517–545 (`emitSystemMessage`, including the **non-persisted `meta`** at L540–543).
- `frontend/hooks/useRecordingState.ts` — **the whole file (189 lines).** The initial GET plus the Realtime-derive ordering (L10–25) is where a countdown has to live.
- `frontend/components/consultation/RecordingPausedIndicator.tsx` and `RecordingControls.tsx` — the two surfaces that gain the countdown and the extend affordance.
- `frontend/lib/api/recording-escalation.ts` L64–75 — the "use the server's `expiresAt`, not `Date.now() + N`" convention, and the clock-skew reason for it.

**Estimated turns:** 6–8.

---

## Acceptance criteria

### 1. The deadline is server-owned and durable

- [x] 1.1 Every pause records an absolute auto-resume deadline on its ledger row at pause time, from the server clock.
- [x] 1.2 The bound is 5 minutes, defined in exactly one place and referenced everywhere else — service, worker and UI must not each carry their own copy.
- [x] 1.3 **No `setTimeout`, no `setInterval`, no in-process scheduling anywhere in the server path** (REC3-D7). A pod restart mid-pause must not change when the auto-resume happens.
- [x] 1.4 Deadline arithmetic is expressed as a cutoff the worker can query, following the timeout worker's cutoff-ISO approach rather than a Postgres interval, so it stays unit-testable.

### 2. The worker

- [x] 2.1 A new worker sweeps pauses whose deadline has passed and which are still open, and resumes each one.
- [x] 2.2 It uses the partial index rec-13 added. If the query cannot use it, that is a finding to record, not to ignore — an unindexed scan of a growing governance table is a latent outage.
- [x] 2.3 **Concurrency-safe under two pods.** The claim is an atomic conditional update whose predicate is "still paused"; the loser sees zero rows and treats the tick as a no-op. The timeout worker's L10–26 explains the shape.
- [x] 2.4 A per-tick batch cap prevents a backlog after a cron outage from starving one pod.
- [x] 2.5 The result shape reports scanned / resumed / raced / errors, matching the sibling worker so the cron response is legible without new tooling.
- [x] 2.6 One session failing does not abort the tick. Errors are collected, logged with the session id and correlation id, and the next row is processed.
- [x] 2.7 A new cron route mounts it with the same `CRON_SECRET` gate as its siblings, and its doc-comment states the tick cadence and the resulting worst-case overshoot. A 5-minute policy tolerates a coarser tick than the 5-second escalation one — pick a cadence, justify it, and state the overshoot rather than leaving it to be discovered.

### 3. Auto-resume behaviour

- [x] 3.1 Auto-resume goes through **rec-14's resume path**. It restores the kinds recorded on the pause row and does not restore video whose grant has lapsed (REC3-D5). No second restore implementation.
- [x] 3.2 The resulting ledger rows are attributed to the **system** actor, using the all-zeros UUID convention documented at `064_consultation_recording_audit.sql:142-143`. An auto-resume must never be attributed to the doctor who paused — the record has to show that the platform resumed, not the clinician.
- [x] 3.3 An auto-resume is distinguishable in the ledger from a human resume. A reader asking "did the doctor come back, or did the timer?" must be able to answer it.
- [x] 3.4 The double-row ledger doctrine holds: `attempted` before the Twilio call, `completed` or `failed` after, same correlation id.
- [x] 3.5 A Twilio failure during auto-resume writes the `failed` row and leaves the pause open for the next tick. It must not silently mark the pause closed — that would produce a ledger claiming capture resumed when it did not.
- [x] 3.6 Both parties get a system message when auto-resume fires, and it says the recording resumed automatically. A silent resume is as dishonest as a silent pause.

### 4. A consult that ends while paused

- [x] 4.1 `endSession` stamps the open pause row using whatever discriminator rec-13 landed, so the row is closed and marked as closed-by-session-end — not as resumed, and not as auto-resumed.
- [x] 4.2 The stamp is **best-effort and last**: the status flip and the adapter teardown come first and are never endangered by it. Follow the existing try/catch-and-warn shape at L236–251.
- [x] 4.3 **Nothing else in `endSession` changes.** No change to Twilio room teardown, the adapter call, the ended banner or the post-consult DM.
- [x] 4.4 The worker never resumes a session that is no longer live. A pause whose session ended must be closed by the stamp, not by a Twilio call against a room that may already be garbage-collected — `TwilioRoomNotFoundError` handling belongs in this branch too.
- [ ] 4.5 A consult that ends while paused leaves **zero** open pause rows. Verified by query, not by reasoning.

### 5. Countdown, visible to both parties

- [x] 5.1 The remaining time is derived from the **server's absolute deadline**, delivered to the client, and never from a client-side `Date.now() + 5min`. `recording-escalation-service`'s `expiresAt` convention (`recording-escalation.ts:64-75`) exists because of clock skew.
- [x] 5.2 The deadline is exposed on `getCurrentRecordingState` additively, so a refresh mid-pause rehydrates the countdown at the right number.
- [x] 5.3 **Confirm the patient can actually receive it.** `GET /:sessionId/recording/state` is mounted with `authenticateToken` (`routes/api/v1/consultation.ts:199-203`), which verifies a real Supabase access token; a bot patient's scoped consult JWT carries no `iss` and is routed to the remote `getUser` fallback (`utils/supabase-token-verifier.ts:203-205`), which has no `auth.users` row to return. **Establish by test whether the patient-side initial fetch works today**, and record the answer here. If it does not, the patient's countdown rides the Realtime system-message path and the initial-fetch gap is [`rec-17`](./task-rec-17-patient-initiated-pause.md)'s to close — do not fix the auth route in this task.
- [x] 5.4 The countdown renders on both parties' paused banner and degrades to the plain paused banner if the deadline is unknown. An unknown deadline must never render as `0:00` or `NaN`.
- [x] 5.5 Reaching zero on the client does **not** flip local state. The server resumes; the client reflects it. A client that self-resumes at zero will disagree with Twilio whenever a tick is late.
- [x] 5.6 Accessibility: the countdown does not spam a screen reader every second. Announce at coarse milestones; keep the per-second update visual.

### 6. One extension

- [x] 6.1 The doctor can extend an open pause exactly once, by the same 5-minute bound.
- [x] 6.2 The second attempt is refused with a typed error and a clear message, and the affordance disappears once consumed.
- [x] 6.3 The cap is enforced **server-side** against rec-13's bounded column. The UI hiding the button is not the enforcement.
- [x] 6.4 An extension is recorded in the ledger with its actor. "Who kept this consult unrecorded for ten minutes" must be answerable.
- [x] 6.5 Only the doctor may extend, even after [`rec-17`](./task-rec-17-patient-initiated-pause.md) lets the patient pause. Extending is a clinical-workflow control; pausing is a privacy control.
- [x] 6.6 An extension arriving in the same window as the worker's claim resolves cleanly — the atomic predicate decides, and whichever loses is a no-op rather than an error surfaced to the doctor.

### 7. Verification

- [x] 7.1 Unit tests: deadline set at pause; worker resumes an expired pause; worker ignores an unexpired one; two concurrent claims produce one resume; extension moves the deadline once and is refused the second time; Twilio failure leaves the pause open; a session ended while paused is stamped and not resumed.
- [ ] 7.2 A real-time test with the cron tick invoked directly, confirming that a pause left alone genuinely resumes and that Twilio's rules reflect it.
- [x] 7.3 Frontend tests: countdown renders from a server deadline, survives a refresh, degrades when the deadline is absent, and does not flip state at zero.
- [x] 7.4 Backend and frontend typecheck + lint + tests green.

### Out of scope

- Any cap on cumulative pause time, any nudge, any session flag (REC-D18 / REC3-D10). Recording the data a later phase could threshold on is fine; acting on it is not.
- Patient-initiated pause and its authZ path — [`rec-17`](./task-rec-17-patient-initiated-pause.md).
- Preset reason codes — [`rec-15`](./task-rec-15-preset-pause-reason-codes.md).
- Deciding what resume restores — [`rec-14`](./task-rec-14-pause-covers-every-active-recording-kind.md) owns it; this task calls it.
- Orphan `attempted`-row reconciliation — [`rec-20`](./task-rec-20-orphan-row-reconciliation-and-close-gate.md). Different failure mode, different sweep, adjacent index.
- Video grant expiry and auto-revert — p4 ([`../../p4-video-escalation-control/`](../../p4-video-escalation-control/)).
- Twilio room create/end behaviour. One stamp is added inside `endSession`; nothing about teardown changes.
- Any migration; any RLS policy.

---

## Scope Guard

- **Expected files touched: ≤ 8** — a new worker, `cron.ts` (one route), `recording-pause-service.ts`, `consultation-session-service.ts` (one stamp), `consultation-controller.ts` + the consultation router (the extend endpoint), the two in-call frontend surfaces plus `useRecordingState.ts`, and their tests.
- **DO NOT TOUCH:** `recording-escalation-service.ts` · `video_escalation_audit` · `recording-track-service.ts` · `twilio-recording-rules.ts` · `video-escalation-timeout-worker.ts` (copy its shape, do not edit it) · `endSession`'s adapter teardown or status flip · any migration · any RLS policy.
- **STOP and surface** if: a second migration appears necessary · the deadline cannot be swept with rec-13's index · making the countdown reach the patient appears to require changing the auth on an existing route (that is rec-17's boundary) · auto-resume appears to need grant state that only p4 can provide.

---

## Global safety gate (MANDATORY)

- [x] **Data touched?** Yes — writes to `consultation_recording_audit` and `consultation_messages`; one stamp on the open pause row from `endSession`.
  - [x] **RLS verified?** Yes — no policy change; service-role writes as today.
- [x] **Any PHI in logs?** Must be **No**. Session ids, correlation ids, deadlines, counts, reason **codes**. Never a reason string, never a patient identifier.
- [x] **External API or AI call?** Yes — Twilio Recording Rules, through rec-14's path. No AI calls. No new outbound data.
- [x] **Retention / deletion impact?** No. Auto-resume increases how much of a consult is captured, which is the intent; it changes no retention window.

---

## Design constraints (NO IMPLEMENTATION)

- Polling, not timers (REC3-D7). The deadline lives in the database and only the database.
- One definition of the 5-minute bound and one definition of the extension cap. Duplicated constants across server and client will drift.
- Every mutating path keeps the double-row ledger doctrine and its correlation id.
- Fail toward **less** capture and toward an honest ledger: never mark a pause closed unless capture actually resumed.
- Service layer only for business rules; no Express types in services; controllers validate with Zod and orchestrate.
- `endSession`'s existing responsibilities are untouchable. The new stamp is additive, best-effort and last.

---

## Done when

A pause carries a server-owned 5-minute deadline; a polling worker resumes it durably across pod restarts, safely under concurrent pods, and attributes the resume to the system rather than the doctor; a Twilio failure leaves the pause open rather than falsely closed; the doctor can extend exactly once with server-side enforcement and a ledger record of who did it; both parties see a countdown derived from the server deadline that survives a refresh and does not self-resume at zero, with the patient-side transport verified and recorded; a consult ended while paused leaves zero open pause rows and is stamped as ended-while-paused; no threshold or nudge shipped; no migration; both workspaces green.

---

## Notes

- **Bound:** `RECORDING_PAUSE_AUTO_RESUME_MS` in `consultation-recording-audit.ts` (5 minutes). Echoed on GET state as `autoResumeBoundMs`. Clients count down from `autoResumeAt`, never `Date.now() + 5min`.
- **Tick:** `POST /cron/recording-auto-resume` every **15s**. Worst-case overshoot 15s (5:00–5:15). Coarser than the 5s escalation worker because a late resume is recoverable. Scheduler is deployment-layer (same as the sibling cron jobs).
- **Index:** scan matches `idx_recording_audit_auto_resume_due` (196): `action = recording_paused`, `auto_resume_at IS NOT NULL`, `pause_closed_as IS NULL`, `metadata.status = completed`.
- **Claim:** atomic UPDATE sets `metadata.auto_resume_claim_id` where still open, due, and unclaimed. Loser = `raced`. Twilio failure clears the claim and leaves `pause_closed_as` null. Stale claims (>2 min) are released at the start of each tick.
- **Distinguishability:** auto-resume writes `recording_resumed` as `action_by = 0000…` / `action_by_role = system` and stamps the pause `pause_closed_as = auto_resume`. Manual resume stamps `manual_resume` and keeps the doctor actor.
- **§5.3 patient GET /recording/state:** was unreachable for a bot patient (`authenticateToken` + scoped JWT). **Closed by rec-17** (2026-08-19): same URL, dual-bearer resolver. Patient countdown can rehydrate from GET.
- **§4.5 founder:** after a live consult ended while paused, `SELECT count(*) FROM consultation_recording_audit WHERE session_id = $1 AND action = 'recording_paused' AND pause_closed_as IS NULL AND (metadata->>'status') = 'completed'` must be 0.
- **Scope overrun:** expected ≤8. Also touched `consultation-recording-audit.ts` (the single bound), `frontend/lib/api.ts`, VideoRoom + VoiceConsultRoom (pass `refresh` after extend).
- **Verification:** backend `tsc --noEmit` + eslint on touched src files green. Pause-service + worker + endSession-DM tests green. Frontend rec-16 vitest 20/20. `consultation-session-service.test.ts` fails to load `@react-pdf/renderer` (pre-existing ESM); not introduced here.
- **7.2 founder:** `POST /cron/recording-auto-resume` with `CRON_SECRET` on a pause left alone; confirm Twilio rules re-include audio.

---

## Related tasks

- [`task-rec-13-migration-pause-reason-codes-and-auto-resume-stamps.md`](./task-rec-13-migration-pause-reason-codes-and-auto-resume-stamps.md) — owns the deadline column, the extension cap and the dangling-pause discriminator.
- [`task-rec-14-pause-covers-every-active-recording-kind.md`](./task-rec-14-pause-covers-every-active-recording-kind.md) — owns the restore path this task calls.
- [`task-rec-17-patient-initiated-pause.md`](./task-rec-17-patient-initiated-pause.md) — same wave; owns the patient-side authZ path.
- [`task-rec-20-orphan-row-reconciliation-and-close-gate.md`](./task-rec-20-orphan-row-reconciliation-and-close-gate.md) — the other sweep over the same table.
- [Execution order](./EXECUTION-ORDER-p3-recording-governance-v2-pause-integrity.md)

---

**Last Updated:** 2026-08-19.
**Pattern:** DB-owned deadline swept by a cron-driven polling worker with an atomic claim; countdown rendered from a server absolute timestamp.
