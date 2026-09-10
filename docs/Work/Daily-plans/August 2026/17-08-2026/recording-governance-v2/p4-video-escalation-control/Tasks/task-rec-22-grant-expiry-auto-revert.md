# Task rec-22: Time-bounded video grant — auto-revert + one extension

## 17 Aug 2026 — Batch [p4-video-escalation-control](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) — Wave 3 — **M, ~4h**

---

## Task overview

Give an allowed video grant a **lifetime**. Default 2 minutes, a countdown both parties can see, automatic revert to audio-only at expiry, and one extension the doctor can spend (REC-D8).

The clinical need is "look at this now", not "watch me for the rest of the call". Today nothing bounds a grant: the consent window is bounded, the cooldown is bounded, the replay OTP window is bounded — the thing that actually captures video is not. And there is no doctor-facing revert either (`revertToAudioOnlyRecording`'s only callers are the patient revoke path and Plan 09's modality transitions), so in practice the only bound today is the patient remembering to stop.

**Estimated time:** ~4h
**Status:** ✅ Done 2026-08-20 (worker + extend + countdown; founder smoke is rec-27)
**Hard deps:** rec-21 (grant expiry + extension stamp columns, and the widened `revoke_reason` value the auto-revert stamps).
**Source:** REC-D8, REC4-D2, REC4-D3.

**Current state**

- ✅ `patientResponseToEscalation`'s allow branch flips Twilio rules with one retry, emits `video_recording_started`, and returns (`recording-escalation-service.ts:649-718`). Nothing schedules an end.
- ✅ `revertToAudioOnlyRecording` (`recording-track-service.ts:597-704`) is a clean rule-flip primitive with the double-row `attempted` / `completed` ledger, and it deliberately does **not** write intent rows — the caller owns those.
- ✅ `video-escalation-timeout-worker.ts` is a complete, well-documented template for exactly this shape of problem: a 5 s DB-polling worker, an atomic UPDATE guarded on the current state so two pods are safe, a `{ scanned, timedOut, raced, errors }` result, and a cron route (`routes/cron.ts:550-590`).
- ✅ `emitVideoRecordingStopped` (`consultation-message-service.ts:915-940`) already accepts a `reason` discriminator and already says "Audio recording continues." in the body.
- ❌ No grant expiry, no countdown, no auto-revert, no extension.
- ⚠️ The service header (`:35-43`) explains at length why this codebase rejected in-memory timers for the consent window. **The same reasoning applies with more force here** — a lost consent timer strands a row; a lost expiry timer keeps recording video.

---

## Model & execution guidance

**Recommended model:** Sonnet (Auto). The pattern to follow already exists in the repo; this is bounded work against a locked contract.

**New chat?** **Yes.** Pre-load:

- This task file + [batch plan](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) decision lock (REC4-D2, REC4-D3) + charter REC-D8.
- `backend/src/workers/video-escalation-timeout-worker.ts` — **whole file** (199 lines). This is the template: the "why DB-polling not setTimeout" header L10-19, the race note L21-26, the cutoff-ISO technique L89-92, the atomic UPDATE L132-142, the raced-counter branch L158-165.
- `backend/src/services/recording-escalation-service.ts` — header L1-64 (state machine + the in-memory-timer rejection), constants L258-266, the allow branch L649-718, and `patientRevokeVideoMidCall` L864-1113 as the reference implementation for "flip Twilio, then stamp the row, then emit, then dashboard event, in that order and for that reason".
- `backend/src/services/recording-track-service.ts:575-704` — `revertToAudioOnlyRecording`, its `RevertReason` union (`:117`), and the header note L18-21 that a revert closes the video Composition.
- `backend/src/routes/cron.ts:550-590` — how `runVideoEscalationTimeoutJob` is exposed and how the correlation id is built.
- `backend/src/controllers/consultation-controller.ts:2431-2660` — handler style for the escalation endpoints (Zod validation, `asyncHandler`, `successResponse`).
- `backend/src/routes/api/v1/consultation.ts:270-310` — route registration + the auth middleware used on the escalation routes.
- `frontend/hooks/useVideoEscalationState.ts` — the `AuditRow` select list and the 1 Hz tick that already drives two countdowns (`:244-302`).
- rec-21's landed migration + the exact revoke-reason value it chose.

**Estimated turns:** 4–6.

**Global safety gate**

- Data touched? **Yes** — writes grant expiry + extension stamps on `video_escalation_audit`, plus the existing ledger rows via the track service. RLS: **no change**; all writes are service-role.
- PHI in logs? **No.** Log ids, timestamps, counts and reason **codes** only — never `reason`.
- External API or AI call? Twilio recording rules, via the existing wrapper only.
- Retention / deletion impact? **No.**

---

## Acceptance criteria

### 1. Grant bounds are set when the grant starts

- [x] 1.1 Default grant length and extension length are named server constants beside `EXPIRY_SECONDS` / `COOLDOWN_MINUTES` / `MAX_ATTEMPTS` (`:262-266`). Both default to 120 s (REC4-D2).
- [x] 1.2 The allow branch stamps grant expiry on the audit row **after** the Twilio flip succeeds, in the same spirit as the revoke path's ordering rationale (`:909-914`) — never before.
- [x] 1.3 If the Twilio flip fails after its retry, **no grant expiry is stamped**. The existing behaviour (consent preserved, `video_recording_failed_to_start` emitted, `accepted: true` returned) is unchanged.
- [x] 1.4 The expiry timestamp is server-assigned. No client input contributes to it.

### 2. Expiry is durable

- [x] 2.1 Expiry is enforced by a **DB-polling worker**, following `video-escalation-timeout-worker.ts`'s shape. Whether it is a new tick in that worker or a sibling worker is the executor's call — state the choice and why in Notes.
- [x] 2.2 **No `setTimeout` in the grant path.** `rg "setTimeout" backend/src/services/recording-escalation-service.ts` must return only the pre-existing retry-jitter `sleep` helper (`:1119-1121`).
- [x] 2.3 The scan selects allow rows that are un-revoked with an elapsed expiry. The state-flip is atomic and guarded so two pods land exactly one winner, and a concurrent patient stop that wins the race is counted as `raced`, not as an error.
- [x] 2.4 A pod restart mid-grant changes nothing — the next tick reverts it.
- [x] 2.5 The worker is registered on the cron surface next to the existing escalation-timeout tick, with the same auth and the same result-shape logging.
- [x] 2.6 A **paused** grant (rec-24) still expires on schedule. Pause does not extend the grant, and the copy in rec-26 must not imply it does.

### 3. Auto-revert behaviour

- [x] 3.1 The worker calls the existing rule-flip primitive to return to audio-only. It does **not** hand-roll a Twilio call.
- [x] 3.2 The audit row is stamped with the revoke timestamp and the auto-revert reason value rec-21 added — never `system_error_fallback` (nothing failed) and never `doctor_revert` (nobody clicked).
- [x] 3.3 Twilio flip fails → **no** stamp on the audit row, an error-level log with the existing `severity: 'critical'` convention, and a retry on the next tick. Never forge a revert the recorder didn't perform; the row is what the doctor UI trusts.
- [x] 3.4 The system message fires **once** per expiry, with a reason that reads as automatic rather than as the patient having stopped it.
- [x] 3.5 An auto-revert costs the doctor **no attempt and no cooldown** — it lands in the same class as a consensual stop under rec-23's matrix. Verify against rec-23's tests rather than re-deriving.
- [x] 3.6 An expiry that lands after the session already ended is a no-op, logged at debug, not an error.

### 4. Extension — exactly one

- [x] 4.1 A doctor-only endpoint extends the active grant, following the existing escalation-endpoint conventions (Zod validation in the controller, service owns the rule, `asyncHandler`, typed `AppError` subclasses, no DB access in the controller).
- [x] 4.2 The service refuses a second extension. The **server** is the gate; the UI hiding the button is not sufficient.
- [x] 4.3 Extension is refused when there is no active grant, when the caller is not the session doctor, and when the grant has already expired — each with the appropriate existing error class, not a raw `Error`.
- [x] 4.4 The extension stamp and the new expiry are written atomically enough that two rapid taps cannot buy two extensions. State the guard used.
- [x] 4.5 The patient sees the extended countdown too — extending is not a doctor-private act.

### 5. Countdown surfaced to both parties

- [x] 5.1 The derived-state contract carries the grant expiry and whether the extension has been spent, on the active-recording state. Additive to the wire type; the frontend types mirror it.
- [x] 5.2 The doctor hook and the patient hook both receive the new columns — **add them to the explicit select lists** in `useVideoEscalationState.ts` and `realtime-video-escalation.ts`, or Realtime will deliver rows without them.
- [x] 5.3 Both countdowns anchor to the server timestamp and reuse the existing 1 Hz tick rather than adding a second interval.
- [x] 5.4 A countdown that reaches zero before the worker tick lands shows a settling state ("stopping…"), not "0s" forever and not a false "stopped" — the ledger is the truth, the clock is a hint.

### 6. The no-grant-row anomaly

- [x] 6.1 A session recording video with **no** `video_escalation_audit` grant row (Plan 09's `voice → video` transition, `modality-transition-executor.ts:465-493`) must not crash the worker, must not be auto-reverted by it, and must be logged once at warn level as an anomaly with the session id.
- [x] 6.2 Do **not** fix Plan 09's path. Surface it. See the batch plan's findings section.

### 7. Verification

- [x] 7.1 Unit tests: expiry flips at the boundary; a revoked row is skipped; a concurrent stop counts as raced; a Twilio failure leaves the row unstamped; a second extension is refused; an extension moves the expiry exactly once.
- [x] 7.2 Backend typecheck, lint and tests green.
- [x] 7.3 The service header's state-machine diagram is updated to include the grant lifetime, the extension, and the auto-revert edge. The header is documentation people actually read — leaving it stale is a defect.
- [x] 7.4 `.env.example` updated only if an env var was genuinely added (prefer constants — the grant length is a product decision, not a deployment knob).

### Out of scope

- Patient pause / resume (rec-24) — but leave the expiry logic pause-agnostic so rec-24 doesn't have to reopen it.
- Patient-initiated offers (rec-25).
- Any copy work beyond the system-message body (rec-26 owns the surfaces).
- A doctor-facing manual "stop recording" control — not decided, not in this phase.
- Attempt/cooldown arithmetic (rec-23).
- `recording-pause-service.ts` (p3), the replay player (p5).

---

## Scope Guard

- Expected files touched: **≤ 8** — the worker (new or extended), `recording-escalation-service.ts`, `recording-track-service.ts` (revert-reason union only, if needed), `consultation-controller.ts`, `routes/api/v1/consultation.ts`, `routes/cron.ts`, the two frontend hooks' select lists + wire types, tests.
- **DO NOT** change `EXPIRY_SECONDS` (the 60 s consent window), `COOLDOWN_MINUTES`, or `MAX_ATTEMPTS`.
- **DO NOT** touch `deriveState` or the request-time rate-limit block — rec-23 owns them and lands first.
- **DO NOT** touch `modality-transition-executor.ts`, `recording-pause-service.ts`, or the replay player.
- **DO NOT** create a migration. Everything you need landed in rec-21; if it didn't, stop and surface it.
- **DO NOT** add a `setTimeout` "shadow" alongside the worker. The service header already rejected exactly that idea and explained why; the rejection stands.

---

## Done when

An allowed grant auto-reverts to audio-only at expiry with nobody touching anything; killing and restarting the API mid-grant still reverts on the next tick; both parties saw a live countdown anchored to the server; the doctor can extend once and the server refuses the second; an auto-revert costs no attempt and no cooldown; a Twilio failure leaves the audit row honest and retries; a video recording with no grant row is logged rather than mangled; the service header describes the machine that now exists; backend typecheck, lint and tests green.

---

## Notes

- **Sibling worker** (`video-grant-expiry-worker.ts`), not a second loop in the consent-timeout worker. Timeout only stamps a pending row; expiry must flip Twilio. Mixing those failure modes in one counter would hide a critical revert miss. Cron: `POST /cron/video-grant-expiry` every 5s, same `CRON_SECRET`.
- **Extension guard:** atomic UPDATE on `grant_extended_at IS NULL` AND `revoked_at IS NULL` AND `grant_expires_at > now`. New expiry = current `grant_expires_at` + 120s. Two rapid taps: loser gets `GrantAlreadyExtendedError`.
- **Settling copy:** indicator shows `Video recording stopping…` when the server-anchored countdown hits 0 and the row is still an active allow. Ledger (worker stamp / Realtime) is the stop.
- **Plan 09:** observe-only warn once per session id when a `video_escalation_completed` ledger row has `escalation_request_id` starting `modality_change:` and the session has no allow grant row. Not reverted.
- **No env var.** `GRANT_SECONDS` / `GRANT_EXTENSION_SECONDS` = 120.
- **Deploy:** apply **197** before this writes `grant_expires_at` / `grant_extended_at`. Schedule the new cron next to video-escalation-timeout.
- **Gate 2026-08-20:** backend `tsc` + eslint on touched src + worker/grant/derive-state jest green. Frontend eslint + vitest derive tests green. `.env.example` unchanged.

---

## Related tasks

- [`task-rec-21-migration-video-grant-bounds.md`](./task-rec-21-migration-video-grant-bounds.md) — lands the columns and the revoke-reason value
- [`task-rec-23-derive-state-counter-split.md`](./task-rec-23-derive-state-counter-split.md) — defines the class an auto-revert falls into
- [`task-rec-24-patient-video-pause-instant-kill.md`](./task-rec-24-patient-video-pause-instant-kill.md) — pause must not extend the grant
- [Charter](../../plan-recording-governance-v2-charter.md) · [Batch plan](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) · [Execution order](./EXECUTION-ORDER-p4-recording-governance-v2-video-escalation-control.md)
