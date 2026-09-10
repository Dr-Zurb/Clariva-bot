# Task rec-25: Patient-initiated video offer — self-consenting, no doctor attempt

## 17 Aug 2026 — Batch [p4-video-escalation-control](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) — Wave 3 — **M, ~3h**

---

## Task overview

Let the patient **offer** video without being asked (REC-D12). An offer is self-consenting — no modal, because asking someone to consent to their own request is theatre — and it costs the doctor **no attempt**.

The flow half-anticipates this already: `patient_request` is one of the four preset reason codes (`recording-escalation-service.ts:95-99`, offered as "Patient request" in the doctor's modal at `VideoEscalationButton.tsx:76`). But the only way to reach it today is for the **patient to ask verbally**, the **doctor to click request and type a note**, and the **patient to then consent to their own idea** — a double step that also burns one of the doctor's two attempts.

**Estimated time:** ~3h
**Status:** ✅ Done (2026-08-20)
**Hard deps:** rec-21 (initiator column), rec-22 (an offer must produce a bounded grant like any other), rec-23 (the chargeable-row rule that excludes offers).
**Source:** REC-D12, REC4-D8, and rec-23's matrix rows 20-21.

**Current state**

- ✅ `requestVideoEscalation` (`:363-543`) runs six policy steps: input validation, authZ (doctor must own the session), session-is-live, already-recording probe, rate limit, audit insert. Most of it applies to an offer too; the authZ and rate-limit steps do not.
- ✅ `patientResponseToEscalation`'s allow branch (`:649-718`) is the piece that actually starts recording: Twilio flip with one retry, `video_recording_started` emitted, `video_recording_failed_to_start` + `twilio_error_code` stamped on double failure, consent preserved either way. An offer needs that machinery, not a re-implementation of it.
- ✅ `video_escalation_audit`'s row-shape CHECK requires `patient_response` and `responded_at` to be **co-present** — so a self-consenting row is legal only if both are written together. That is convenient: a self-consenting offer genuinely is "requested and answered in the same instant".
- ✅ `reason` is `NOT NULL CHECK (char_length BETWEEN 5 AND 200)`; the revoke path already demonstrates the pinned-canonical-string technique for satisfying a CHECK without user input (`:1025-1026`).
- ✅ `doctor_id` is `NOT NULL` — an offer row still carries the session's doctor id. Which is exactly why rec-21's initiator column exists: `preset_reason_code = 'patient_request'` cannot distinguish an offer from a doctor who picked that preset.
- ❌ No patient-initiated path, no patient-side affordance.
- ⚠️ The already-recording Twilio probe (`:412-430`) is best-effort by design and must stay that way — an offer arriving while video is already recording is a no-op success, not an error.

---

## Model & execution guidance

**Recommended model:** Sonnet (Auto). Additive path through existing service shapes; the hard decisions are pinned in REC4-D8.

**New chat?** **Yes.** Pre-load:

- This task file + [batch plan](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) (REC4-D8) + charter REC-D12.
- `backend/src/services/recording-escalation-service.ts` — L95-207 (types), L347-543 (`requestVideoEscalation`, all six steps), L566-718 (`patientResponseToEscalation`, especially the allow branch), L920-1113 (the revoke path, as the reference for a patient-authenticated service function with an idempotent result shape).
- `backend/migrations/070_video_escalation_audit_and_otp_window.sql:66-131` — the row-shape CHECK and the `reason` CHECK you must satisfy.
- `backend/src/controllers/consultation-controller.ts:2431-2660` — the four existing escalation handlers; copy their validation and response style.
- `backend/src/routes/api/v1/consultation.ts:270-310` — route registration + which auth middleware the patient-side route uses (the revoke route at `:303-305` is the closest sibling).
- `frontend/lib/api/recording-escalation.ts:434-530` — client wrapper style.
- `frontend/lib/realtime-video-escalation.ts:99-137,209-266` — the patient hook's row shape and its INSERT handler. **An offer row arrives as an INSERT that is already answered; the hook must not open a consent modal for it.** This is the single easiest thing to get wrong in this task.
- `frontend/components/consultation/VideoRoom.tsx:4977-5018` — where patient-side recording surfaces mount.
- rec-21's initiator column, rec-22's grant constants, rec-23's chargeable-row helper.

**Estimated turns:** 4–5.

**Global safety gate**

- Data touched? **Yes** — inserts `video_escalation_audit` rows on a patient-authenticated path (still service-role; no client-write RLS policy is added). RLS: **no change**.
- PHI in logs? **No.** The canonical reason string is server-authored and non-clinical; log codes and ids only.
- External API or AI call? Twilio recording rules, via the existing wrapper only.
- Retention / deletion impact? **No.**

---

## Acceptance criteria

### 1. The offer path

- [x] 1.1 A patient-authenticated endpoint creates an offer. The service re-asserts that the caller is the session's patient, as the revoke path does at `:930-935`.
- [x] 1.2 Session-must-be-live and no-Twilio-room checks match `requestVideoEscalation`'s (`:398-406`).
- [x] 1.3 The audit row is written **already answered**: request and response stamped together, satisfying the co-presence CHECK. There is no pending window, because there is nobody left to ask.
- [x] 1.4 `preset_reason_code = 'patient_request'`; `reason` is a **server-authored canonical string** that satisfies the 5..200 CHECK; the initiator column marks the patient (REC4-D8). **No patient free text anywhere in this path.**
- [x] 1.5 The recording start reuses the existing allow-branch machinery — Twilio flip with one retry, `video_recording_started` on success, `video_recording_failed_to_start` + `twilio_error_code` on double failure. Do not re-implement it; extract or call it.
- [x] 1.6 The grant gets the same bounds as any other (rec-22): expiry stamped after a successful flip, countdown to both parties, extendable once by the doctor.
- [x] 1.7 An offer while video is **already** recording is an idempotent no-op success, not an error — mirror the `already_audio_only` discriminator style.
- [x] 1.8 An offer while a **doctor request is pending** is refused with a clear, honest reason. Two competing consent flows on one session is a state nobody has designed; refuse it rather than invent it.

### 2. Costs the doctor nothing

- [x] 2.1 An offer row is **never chargeable** — it does not increment `attemptsUsed` (rec-23 matrix row 20).
- [x] 2.2 An offer neither consumes nor refunds a doctor attempt, and it does not touch a doctor cooldown that is already running (matrix row 21).
- [x] 2.3 A doctor at `locked: max_attempts` can still receive an offer. That is the point: the patient's willingness is not rationed by the doctor's request budget.
- [x] 2.4 The offer path does **not** call the doctor rate-limit check at all — not "calls it and ignores the result".
- [x] 2.5 Stopping an offered grant behaves exactly like stopping a requested one (rec-23's stop class), and re-offering is subject to the same 30-second debounce.

### 3. No modal, and no accidental modal

- [x] 3.1 The patient sees **no** consent modal for their own offer.
- [x] 3.2 The patient hook (`realtime-video-escalation.ts`) must not open `VideoConsentModal` for an offer row. Its INSERT handler currently opens the modal for any row with `patient_response === null` (`:228-233`) — an already-answered row passes that guard today, but verify the behaviour explicitly rather than relying on it, including on the initial GET probe path (`:158-199`).
- [x] 3.3 The **doctor** learns about the offer without a blocking prompt. The existing surfaces are the right vocabulary: the system message both parties already see, plus the dashboard-event pattern the revoke path uses (`:1072-1100`, graceful-degrading). If a new dashboard `event_kind` value is needed, that requires a CHECK widening → **STOP** and surface it (REC4-D1 allows exactly one migration and rec-21 owns it).
- [x] 3.4 The doctor's request button correctly hides while an offered grant is active (it already keys off `locked: already_recording_video`) and returns to a correct state when the grant ends.

### 4. Patient affordance

- [x] 4.1 A minimal, discoverable control ("Show my video to the doctor" or similar — final wording is rec-26's) mounted where the patient's other recording controls live.
- [x] 4.2 Visible only when a video consult is live, video is not already recording, and no doctor request is pending.
- [x] 4.3 The control states what it does in one line: the doctor will see and this will be saved. It must not imply the patient is turning their camera on — in a video consult the camera is already on (GAP 6).
- [x] 4.4 Keyboard and screen-reader parity with the existing patient controls.
- [x] 4.5 Errors surface inline and the control re-enables. No auto-retry.

### 5. Verification

- [x] 5.1 Unit tests: offer creates an already-answered row with the patient as initiator; `attemptsUsed` is unchanged by an offer; an offer while recording is a no-op; an offer while a request is pending is refused; a Twilio double-failure leaves the row honest and emits the failure message.
- [x] 5.2 A test asserting **no consent modal** opens for an offer row on both the Realtime path and the mount-probe path.
- [x] 5.3 Backend + frontend typecheck, lint and tests green.
- [x] 5.4 The service header's flow diagram (`:1-64`) gains the patient-initiated entry point. It currently reads as doctor-initiated only.

### Out of scope

- Final copy and the unified status surface (rec-26).
- Pause / stop behaviour (rec-24) — an offered grant simply inherits it.
- Attempt arithmetic itself (rec-23).
- Doctor-side accept/decline of an offer. An offer is self-consenting; the doctor does not gate the patient's own camera.
- Any migration.

---

## Scope Guard

- Expected files touched: **≤ 8** — `recording-escalation-service.ts`, `consultation-controller.ts`, `routes/api/v1/consultation.ts`, `frontend/lib/api/recording-escalation.ts`, `frontend/lib/realtime-video-escalation.ts`, one patient-side component, backend tests, frontend tests.
- **DO NOT** change `requestVideoEscalation`'s doctor-side policy — the offer is a sibling path, not a parameterisation of it. If sharing code, share the parts that are genuinely identical and leave the doctor path's behaviour byte-for-byte unchanged.
- **DO NOT** weaken the already-recording probe, the session-live check, or the row-shape CHECK.
- **DO NOT** add an RLS write policy so the client can insert the row directly. Service-role writes only, per Migration 070's stated posture.
- **DO NOT** touch `recording-pause-service.ts`, the replay player, or `modality-transition-executor.ts`.
- **DO NOT** create a migration or widen a CHECK.
- Any expansion requires explicit approval.

---

## Done when

A patient can offer video with one tap and no modal; recording starts through the same machinery a doctor-initiated allow uses, with the same bounded grant; the doctor's attempt count is untouched, including at max attempts; an offer while recording or while a request is pending is handled honestly; no consent modal ever opens for an offer row on either code path; the audit row records the patient as initiator with a server-authored reason and no patient free text; the service header describes both entry points; typecheck, lint and tests green in both workspaces.

---

## Notes

- Canonical reason: `Patient offered video recording during this consult.` (`PATIENT_OFFER_REASON`). No patient free text.
- Doctor notify: existing `video_recording_started` system message (both parties already see it). No new `doctor_dashboard_events.event_kind` — a CHECK widen would need a second p4 migration (REC4-D1; rec-21 owns the only one).
- Offer-while-request-pending: `OfferBlockedByPendingRequestError extends ConflictError` (409) — `"Your doctor has already asked to record video. Please respond to that request first."` Not `PendingRequestExistsError` (doctor-facing copy).
- Offer-while-already-recording: 200 `{ status: 'already_recording' }` (idempotent, revoke-style discriminator).
- HTTP: `POST /:sessionId/video-escalation/offer`. Recording start extracted to `startVideoGrantAfterAllow` (allow branch + offer).

---

## Related tasks

- [`task-rec-21-migration-video-grant-bounds.md`](./task-rec-21-migration-video-grant-bounds.md) — the initiator column
- [`task-rec-23-derive-state-counter-split.md`](./task-rec-23-derive-state-counter-split.md) — matrix rows 20-21
- [`task-rec-26-recording-status-surface.md`](./task-rec-26-recording-status-surface.md) — final wording and placement
- [Charter](../../plan-recording-governance-v2-charter.md) · [Batch plan](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) · [Execution order](./EXECUTION-ORDER-p4-recording-governance-v2-video-escalation-control.md)
