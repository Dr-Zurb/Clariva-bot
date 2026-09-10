# Task rec-17: Patient-initiated pause

## 17 Aug 2026 — Batch [p3-pause-integrity](../plan-p3-recording-governance-v2-pause-integrity-batch.md) — Wave 4 — **M, ~4h**

---

## Task overview

Only the doctor can pause today — `pauseRecording` throws `ForbiddenError` for anyone who is not `session.doctorId` (`recording-pause-service.ts:240-242`, and the same gate on resume at `:377-379`). REC-D15 gives the patient a direct pause with the actor permanently attributed and no approval handshake.

**The rationale is worth encoding in the code review, not just here.** Under-disclosure is a worse clinical outcome than a gap in the tape. A patient who cannot pause will instead withhold — and a withheld symptom is invisible, unattributed and unrecoverable, where a gap is documented, timestamped and explained. A patient-initiated gap is therefore **evidence that protects the doctor**: it shows a patient exercising a control they were offered, at a moment they chose. It is not a hole in the record.

The engineering substance of this task is the authorization path. A bot patient has no `auth.users` row, so the doctor-shaped auth this endpoint currently uses is the thing standing in the way.

**Estimated time:** ~4h
**Status:** ✅ Done (2026-08-19) — founder live consult still open (6.4)
**Hard deps:** [`rec-13`](./task-rec-13-migration-pause-reason-codes-and-auto-resume-stamps.md) (the patient-actor surrogate decision) and [`rec-14`](./task-rec-14-pause-covers-every-active-recording-kind.md) (a patient pause covers the same kinds as a doctor pause). Lands after [`rec-15`](./task-rec-15-preset-pause-reason-codes.md) so there is no free-text path to expose to a patient.
**Source:** REC-D15 · REC3-D4.
**Charter:** [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)

**Change Type:** Update existing — widens authorization on a shipped endpoint and adds a patient-side control. Follow [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

**Current state:**

- ✅ `action_by_role` already permits `'patient'` (`064_consultation_recording_audit.sql:97`) and `recording_paused` already exists in the ENUM. **No widening needed for the role** — rec-13 confirms this.
- ✅ A patient-facing recording control already exists in the UI: `VideoRecordingIndicator.tsx` renders an inline `[Stop]` with a small confirm tooltip rather than a modal, and its L247–253 comment explains why a modal is the wrong shape for a patient exercising their own privacy control. That interaction pattern is the one to follow.
- ❌ No patient pause anywhere — no route, no service branch, no control.
- ⚠️ **The revoke call is not the scoped-JWT precedent it looks like.** `POST /:sessionId/video-escalation/revoke` is mounted with `authenticateToken` (`routes/api/v1/consultation.ts:302-306`) and `patientRevokeVideoHandler` uses `req.user.id` as the patient id (`consultation-controller.ts:2639-2656`). `authenticateToken` verifies a **Supabase access token**; a scoped consult JWT carries no `iss`, so `verifySupabaseAccessToken` returns `inconclusive` (`utils/supabase-token-verifier.ts:203-205`) and the middleware falls back to `supabase.auth.getUser`, which cannot resolve a synthetic `patient:{appointmentId}` subject. So revoke works only for a patient who has a real `auth.users` row. Read it for the **UI** precedent; do not read it as the auth precedent.
- ⚠️ The pause, resume and state routes have the same mount (`routes/api/v1/consultation.ts:189-203`), which is why criterion 1 is step 0 of this task.

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet — **with a hard stop built in.** The work is a service-branch widening plus one patient control, both well-precedented. But if criterion 1 concludes that a new patient-facing authorization path has to be designed rather than composed from existing helpers, that is a new auth surface on a patient token, and it stops for an owner decision instead of being improvised here.

**New chat? Yes.** Pre-load:

- This task + [`../plan-p3-recording-governance-v2-pause-integrity-batch.md`](../plan-p3-recording-governance-v2-pause-integrity-batch.md) (§Why this phase → GAP 4, and REC3-D4) + the [charter](../../plan-recording-governance-v2-charter.md) REC-D15 and REC-D7 rows.
- **[`rec-13`](./task-rec-13-migration-pause-reason-codes-and-auto-resume-stamps.md) as merged** — the actor surrogate it chose for a patient pause, and its non-collision guarantee against the system actor.
- `backend/src/services/recording-pause-service.ts` — L212–250 (the doctor gate you are widening), L361–392 (the same gate on resume), L586–603 (`isSessionParticipant`, which already resolves both roles and is the natural seam).
- `backend/src/middleware/auth.ts` — **the whole file (179 lines).** `authenticateToken` L90–142 and `optionalAuthenticateToken` L151–178. Understand exactly what each accepts before choosing a mount.
- `backend/src/utils/supabase-token-verifier.ts` L83–92 and L196–207 — the issuer check that routes scoped JWTs to the remote fallback. This is the mechanism behind the ⚠️ above.
- `backend/src/services/supabase-jwt-mint.ts` — **the whole file.** The synthetic `patient:{appointmentId}` sub (L11–16, `buildPatientSub` L232–238) and the claim shape (`ScopedJwtPayload` L82–98) with `session_id` + `consult_role`.
- **The routes that actually accept a patient without `authenticateToken`,** and how they discriminate the bearer: `routes/api/v1/consultation.ts:72-80` and `:349-357`; `consultation-controller.ts:507-549` (`mintAttachmentSignedUrlsHandler` — the doc-comment at L507–511 states the two-token contract), `:1957-1968` (`resolvePatientReplayCaller`), `:2689-2709` (`getPostCallSummaryHandler` — bearer handed to the service to discriminate).
- `frontend/components/consultation/VideoRecordingIndicator.tsx` — **the whole file.** The inline `[Stop]` + tooltip shape, the accessibility contract (L26–38), the "why not a modal" rationale (L247–253), and how it passes `token` + `sessionId`.
- `frontend/components/consultation/RecordingPausedIndicator.tsx` and `frontend/hooks/useRecordingState.ts` — the surfaces the patient control sits beside and the state it reads.

**Estimated turns:** 5–7.

---

## Acceptance criteria

### 1. Step 0 — establish which token the patient will actually hold, and write the answer here

- [x] 1.1 Determine, per modality, what credential the patient's in-call surface holds: a real Supabase session, or a scoped consult JWT minted by `mintScopedConsultationJwt`. Voice, video and text may differ.
- [x] 1.2 **Write the answer into this task file.** Every criterion below branches on it, and it is not answerable from the pause code alone.
- [x] 1.3 If the patient holds a scoped consult JWT, `authenticateToken` will reject it — establish this by test rather than by reading, then choose the mount from the **existing** patterns: no `authenticateToken`, bearer handed to a resolver that discriminates doctor-vs-patient, exactly as the attachment-sign, snapshot, post-call-summary and replay-OTP routes already do.
- [x] 1.4 **Do not invent a new token type, a new claim, or a new HMAC exchange.** If none of the existing patterns fits, **STOP and surface** — a new patient-facing auth surface is an owner decision, not a task decision.
- [x] 1.5 **Do not change the auth mount on the existing pause / resume / state routes for the doctor path.** Widening the patient path must not weaken or alter what the doctor path accepts today.
- [x] 1.6 Record whether `GET /:sessionId/recording/state` is reachable by the patient's credential. [`rec-16`](./task-rec-16-auto-resume-countdown-and-dangling-pause.md) needs the answer for its countdown, and this task is the one that finds out.

### 2. Authorization and attribution

- [x] 2.1 The service accepts a pause from **either** the session's doctor or the session's patient. `isSessionParticipant` (L586–603) already resolves the role; reuse it rather than adding a second membership check.
- [x] 2.2 A caller who is neither participant is still refused with `ForbiddenError`. Widening the gate must not open it.
- [x] 2.3 The ledger row records `action_by_role = 'patient'` and the actor surrogate rec-13 chose. Attribution is permanent and must survive the surrogate being non-personal.
- [x] 2.4 A patient row is **never** indistinguishable from a system row. rec-13's non-collision requirement is verified here, by test, on a real write.
- [x] 2.5 The pause reason for a patient-initiated pause is recorded as `patient_request` **without asking the patient to classify why**. Asking a patient to categorise their reason for wanting privacy re-creates exactly the disclosure problem [`rec-15`](./task-rec-15-preset-pause-reason-codes.md) removed. Record this decision in the file.
- [x] 2.6 **No approval handshake** (REC-D15). No doctor confirmation, no request-and-grant, no waiting state. The pause takes effect on the patient's action.
- [x] 2.7 The patient path is subject to the same session-status and Twilio-room preconditions as the doctor path, and returns the same typed errors.

### 3. Who may resume — decide and record

- [x] 3.1 Settle explicitly whether a doctor may resume a patient-initiated pause and vice versa, and **write the decision and its reasoning into this file.** The two harms are real in both directions: a pause only the patient can lift can strand a doctor mid-consult, and a pause the doctor can instantly lift makes the patient's control illusory.
- [x] 3.2 **Default if the decision is not escalated:** the actor who paused may resume; the counterparty may not silently lift another party's pause; [`rec-16`](./task-rec-16-auto-resume-countdown-and-dangling-pause.md)'s auto-resume bounds every case so no pause can strand a consult indefinitely. This is the fail-closed-toward-less-capture reading of REC3-D5.
- [x] 3.3 Whatever is chosen, a refused resume is a typed error with copy that explains who can lift the pause — never a silent no-op that leaves the presser thinking it worked.
- [x] 3.4 Extension remains doctor-only (rec-16 §6.5). This task does not give the patient an extend affordance.

### 4. The patient control

- [x] 4.1 The control is **persistently visible while recording is live** — not behind a menu, not requiring a request (REC-D7's posture, applied to pause).
- [x] 4.2 Interaction follows `VideoRecordingIndicator`'s shape: inline affordance plus a small confirmation, not a modal. Its L247–253 reasoning applies verbatim.
- [x] 4.3 Copy states plainly what pausing does and what it does not do. It must not imply the consult ends, and it must not imply anything already recorded is erased.
- [x] 4.4 Accessibility parity with the existing indicator: `role="status"` region, keyboard-reachable trigger, `Esc` cancels, focus managed into and out of the confirmation, errors announced.
- [x] 4.5 A double-tap is harmless. The service's existing already-paused short-circuit (`recording-pause-service.ts:24-28`) absorbs it; do not add a second idempotency mechanism.
- [x] 4.6 A failure surfaces inline and leaves the control usable for retry. No auto-retry, matching the revoke tooltip's error posture.

### 5. Both parties see what happened

- [x] 5.1 The system message attributes the pause to the patient. A patient pause rendered as "your doctor paused recording" is a new dishonesty in a phase about honesty.
- [x] 5.2 The doctor's banner names the patient as the actor and frames it neutrally. The copy must not read as an alarm or a fault — a patient pause is a documented, expected control.
- [x] 5.3 No free text and no PHI in any body or log line. Log the role, the code, the session id, the correlation id.
- [x] 5.4 `getCurrentRecordingState` reports the actor's **role** so each side can render honest copy without inferring it from an id.
- [x] 5.5 If a new `SystemEvent` tag is needed, note that the column is plain TEXT (`063_…sql:47-51`) and the union at `consultation-message-service.ts:255-295` is the source of truth — **no migration**. Adding a tag there is the whole change.

### 6. Verification

- [x] 6.1 Unit tests: a patient pause is accepted and attributed with role `'patient'`; a non-participant is refused; the resume rule from §3 is pinned in both directions; a patient pause covers the same kinds as a doctor pause (rec-14's path, unmodified); double-tap writes one pause.
- [x] 6.2 A test proves the patient's actual credential is accepted by the chosen mount, and that a forged or wrong-session token is rejected.
- [x] 6.3 Frontend tests: control visible while recording, confirmation flow, error path, and the doctor-side banner naming the patient.
- [ ] 6.4 Manual: a patient pauses a live consult, both parties see it, the ledger row is attributed to the patient, and auto-resume still fires on schedule.
- [x] 6.5 Backend and frontend typecheck + lint + tests green. (2026-08-19: pause-service 54, mount 4, auto-resume worker 7, frontend indicator/controls/hook 25. Backend `tsc --noEmit` + eslint on touched src. Frontend next lint on touched files.)

### Out of scope

- **Patient video stop / revoke.** It exists (Plan 08 Task 42) and belongs to p4. This task does not touch `recording-escalation-service.ts`, `video_escalation_audit`, or the revoke route — including the auth weakness noted above. **Capture that finding to `docs/Work/capture/inbox.md`** and leave it.
- Auto-resume, countdown, extension — [`rec-16`](./task-rec-16-auto-resume-countdown-and-dangling-pause.md).
- Reason-code definition — [`rec-15`](./task-rec-15-preset-pause-reason-codes.md).
- What pause covers at the Twilio rule level — [`rec-14`](./task-rec-14-pause-covers-every-active-recording-kind.md).
- Gap rendering — [`rec-18`](./task-rec-18-gap-markers-replay-player.md), [`rec-19`](./task-rec-19-gap-markers-transcript.md).
- Any change to `action_by`'s column type (rec-13 §3.2.3 — a STOP-and-surface).
- Any cap on how often a patient may pause (REC-D18 / REC3-D10).
- Any RLS policy; any migration.

---

## Scope Guard

- **Expected files touched: ≤ 6** — `recording-pause-service.ts`, `consultation-controller.ts`, the consultation router, one patient-side component (new or extended), `useRecordingState.ts` if the state shape grows, and their tests.
- **DO NOT TOUCH:** `middleware/auth.ts` · `supabase-jwt-mint.ts` · `supabase-token-verifier.ts` (read all three; change none) · `recording-escalation-service.ts` · `VideoRecordingIndicator.tsx` · `recording-track-service.ts` · any migration · any RLS policy.
- **STOP and surface** if: no existing auth pattern fits the patient's credential · the patient path appears to need a new claim, token type or HMAC exchange · `action_by` needs a type change · RLS appears to need changing to let a patient write.

---

## Global safety gate (MANDATORY)

- [ ] **Data touched?** Yes — a new actor writes to `consultation_recording_audit` and `consultation_messages`.
  - [ ] **RLS verified?** Yes — no policy change. Writes still go through the service-role admin client; the audit table remains service-role-only (064 §Safety).
- [ ] **Any PHI in logs?** Must be **No**. Never log a token, a token payload, a patient identifier or a reason string. Role, code, session id, correlation id only.
- [ ] **External API or AI call?** Yes — Twilio Recording Rules via rec-14's path. No AI calls.
- [ ] **Retention / deletion impact?** No. A patient pause reduces what is captured going forward; it deletes nothing and changes no retention window.

---

## Design constraints (NO IMPLEMENTATION)

- Authorization is composed from existing house patterns or it stops. This is the constraint that keeps a patient-token surface from being designed in a task file.
- Widening the gate must not weaken it: every non-participant that is refused today is still refused.
- Attribution is permanent and honest, even when the identifier is a surrogate. Role is the durable fact; the id may be synthetic.
- Controllers validate with Zod and orchestrate only; services throw typed `AppError` subclasses and import no Express types.
- The patient's control cannot be gated behind friction that implies they need permission for their own privacy.
- Fail closed toward less capture, and toward an honest ledger.

---

## Done when

Step 0's answer — which credential the patient actually holds per modality, and whether the state endpoint is reachable with it — is written into this file; a patient can pause a live consult directly with no doctor approval, through an existing authorization pattern rather than a new one; the ledger row is permanently attributed to the patient, distinguishable from a system row; the resume rule is decided, recorded and pinned by tests in both directions; the control is persistently visible with the confirm-not-modal shape and full accessibility parity; both parties see copy that names the real actor; no free text or PHI in any body or log line; no migration, no RLS change, no new token type; both workspaces green.

---

## Related tasks

- [`task-rec-13-migration-pause-reason-codes-and-auto-resume-stamps.md`](./task-rec-13-migration-pause-reason-codes-and-auto-resume-stamps.md) — owns the patient actor surrogate.
- [`task-rec-14-pause-covers-every-active-recording-kind.md`](./task-rec-14-pause-covers-every-active-recording-kind.md) — a patient pause uses its rule path unchanged.
- [`task-rec-16-auto-resume-countdown-and-dangling-pause.md`](./task-rec-16-auto-resume-countdown-and-dangling-pause.md) — same wave; consumes step 0's answer about the state endpoint.
- p4 owns the patient's video controls: [`../../p4-video-escalation-control/`](../../p4-video-escalation-control/)
- [Execution order](./EXECUTION-ORDER-p3-recording-governance-v2-pause-integrity.md)

---

**Last Updated:** 2026-08-19.
**Pattern:** participant-scoped authorization composed from existing bearer-discrimination helpers; permanent role attribution with a surrogate actor id.

---

## Notes (rec-17)

### Step 0 — credential per modality

| Surface | Patient credential |
|---|---|
| Video (`frontend/app/consult/join/page.tsx`) | Companion scoped JWT from `mintScopedConsultationJwt`, passed as `recordingToken` into `VideoRoom`. |
| Voice | Same scoped JWT (`VoiceConsultRoom` `recordingToken`). |
| Text | Same scoped JWT (`consult_role` + `session_id`). Bot `sub` = `patient:{appointmentId}`. |

Doctors hold a real Supabase access token. Bot patients have no `auth.users` row.

`authenticateToken` rejects a scoped patient JWT: `verifySupabaseAccessToken` is `inconclusive` without `iss` (`supabase-token-verifier.test.ts`), then `getUser` cannot resolve `patient:{appointmentId}`. Established by that existing test, not by reading alone.

### Chosen mount (1.3–1.5)

Existing pattern: **no `authenticateToken`**, bearer handed to `resolveRecordingCaller` in `recording-pause-service.ts` — scoped JWT first (`verifyScopedConsultationJwt`), then `admin.auth.getUser`. Same shape as attachments/sign, snapshots, post-call-summary, replay.

**1.5:** the doctor URL is unchanged. A doctor still has to present a valid Supabase access token. `POST .../pause/extend` stays on `authenticateToken`. What the doctor path accepts is not weakened.

No new token, claim, or HMAC.

### 1.6 — GET `/recording/state`

Was **not** reachable with the patient's scoped JWT (rec-16 §5.3). This task closed it: same dual-bearer resolver. Patient countdown can rehydrate.

### 2.5 — patient reason

Always `patient_request`. The patient is not asked to classify why. A submitted doctor `reasonCode` on the patient path is ignored.

### 3 — who may resume

Default 3.2, not escalated. The actor who paused may resume. The counterparty gets `ForbiddenError` with copy that names who can lift. rec-16 auto-resume still bounds every open pause. Extension remains doctor-only.

### 5.5 — SystemEvent

No new tag. Existing `recording_paused` / `recording_resumed` with a patient-attributed body is enough.

### Actor

`action_by_role = 'patient'`. Surrogate is `consultation_sessions.id` when `patientId` is absent; otherwise `patientId`. Never the all-zeros system actor. Tested.

### Revoke (out of scope)

Captured to `docs/Work/capture/inbox.md`. `POST /:sessionId/video-escalation/revoke` is still `authenticateToken` — p4's to close.
