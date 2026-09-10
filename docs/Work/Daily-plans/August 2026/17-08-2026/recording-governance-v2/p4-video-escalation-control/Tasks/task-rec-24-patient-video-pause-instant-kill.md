# Task rec-24: Patient video pause, distinct from stop — and instant local halt on both

## 17 Aug 2026 — Batch [p4-video-escalation-control](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) — Wave 4 — **M, ~4.5h**

---

## Task overview

Give the patient **two** video controls with two different guarantees (REC-D7), and make both of them instant (REC-D11).

- **Pause** is temporary. The grant survives. Resume needs **no** second consent — the patient already consented; they are stepping out of frame, taking a call, letting someone into the room. Resume must **not** create a new escalation request.
- **Stop** ends the grant. A restart needs a fresh request (which, after rec-23, costs the doctor nothing).

Both halt local video **before** the server call, because a control we describe as "yours at any moment" cannot contain a 1–3 second network round-trip. Today: tap → confirm → `POST /video-escalation/revoke` → Twilio rule flip, which is plausibly seconds of continued capture after the patient decided to stop.

**Estimated time:** ~4.5h
**Status:** ✅ Done (2026-08-20) — founder smoke + composition count still rec-27
**Hard deps:** rec-21 (pause state column), rec-22 (grant contract — pause must not extend it), rec-23 (row 9 of the matrix: a paused grant still derives as actively recording).
**Source:** REC-D7, REC-D10, REC-D11, REC4-D6, REC4-D7.

**Current state**

- ✅ `VideoRecordingIndicator.tsx` gives the patient `[Stop]` plus a small confirmation tooltip (deliberately not a modal — task-42 Notes #1: a modal implies "are you sure you want to control your own privacy?"). Esc cancels, tap-outside cancels, the CTA re-enables on error, `aria-label` already says "Stop video recording; audio will continue". **This is the entire patient surface**, and its instincts are right — build on it, don't replace it.
- ✅ `revokeVideoRecording` (`frontend/lib/api/recording-escalation.ts:475-530`) and `patientRevokeVideoMidCall` (`recording-escalation-service.ts:920-1113`) are a complete, idempotent stop path: Twilio flip first, then the atomic row stamp, then the intent row, then the system message, then the dashboard event — in that order, for reasons the JSDoc states at `:909-914`.
- ✅ `VideoRoom.tsx:3540-3571` already halts local video the fast way: Twilio's `disable()` rather than `unpublishTrack`, chosen explicitly because it stops frames without a ~1 s renegotiation (`:3554-3557`). `unpublishTrack` is documented as synchronous at `:1936-1939` if `disable()` turns out not to stop Twilio-side capture.
- ✅ The indicator is mounted by `VideoRoom` at `:5172-5180` (and a desktop-chrome variant at `:5182`), with `isActive` derived from the escalation hook at `:2710-2712`.
- ❌ No pause. No local track halt on stop. The indicator has no access to the room's tracks — `VideoRoom` owns them.
- ⚠️ `cameraOff` (`:765`) is shared state. Halting video for recording purposes will flip the same camera-off surface the manual toggle uses. That interaction is the crux of §3 below.

---

## Model & execution guidance

**Recommended model:** Sonnet (Auto). Bounded client work plus one server endpoint, against contracts Waves 1–3 locked.

**New chat?** **Yes.** Pre-load:

- This task file + [batch plan](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) (REC4-D6, REC4-D7, and the **p3 coordination boundary** — read it before you touch anything pause-shaped) + charter REC-D7 / REC-D10 / REC-D11.
- `frontend/components/consultation/VideoRecordingIndicator.tsx` — **whole file** (390 lines). The stage machine is L70-75, the confirm handler L129-156, the tooltip L262-389, the "why not a modal" rationale L247-253.
- `frontend/components/consultation/VideoRoom.tsx` — L751-775 (`cameraOff` + its ref), L1936-1948 (`unpublishTrack` is synchronous; the audio-only branch unpublishes + stops), L3540-3571 (the camera toggle using `disable()`), L2686-2712 (recording role + `isVideoRecordingActive`), L4977-5185 (where the indicator, controls and consent modal mount).
- `backend/src/services/recording-escalation-service.ts:860-1113` — `patientRevokeVideoMidCall`, end to end. Your pause path is a sibling of this, with a different terminal shape.
- `backend/src/services/recording-track-service.ts:451-704` — `escalateToFullVideoRecording` and `revertToAudioOnlyRecording`, plus the header note L18-21 that each revert closes a video Composition and each re-escalation opens a new one.
- `backend/src/services/consultation-message-service.ts:897-940` — `emitVideoRecordingStopped`, and L810-829 on which lifecycle events deliberately do **not** exist yet.
- `frontend/lib/api/recording-escalation.ts:434-530` — the client wrapper style to mirror.
- rec-22's grant contract and rec-23's matrix row 9.

**Estimated turns:** 5–7.

**Global safety gate**

- Data touched? **Yes** — pause state on `video_escalation_audit` + ledger rows via the track service. RLS: no change; service-role writes.
- PHI in logs? **No.** Codes, ids and timestamps only.
- External API or AI call? Twilio recording rules, via the existing wrapper only.
- Retention / deletion impact? **No** — and copy must not imply otherwise (REC-D10).

---

## Acceptance criteria

### 1. Pause is not revoke

- [x] 1.1 Pause flips Twilio rules to audio-only, sets the pause state on the **existing** grant row, and leaves `revoked_at` NULL (REC4-D6).
- [x] 1.2 A pause/resume cycle inserts **zero** new `video_escalation_audit` rows. Assert by row count before and after, not by inspection.
- [x] 1.3 Resume flips rules back to audio+video **without** any consent prompt and **without** routing through `requestVideoEscalation` — no rate-limit check, no attempt, no modal.
- [x] 1.4 A paused grant still derives as `locked: already_recording_video` with a paused marker (rec-23 matrix row 9). The doctor's request button stays hidden; it must not re-appear and invite a duplicate request.
- [x] 1.5 Pause does **not** extend the grant. A grant that expires while paused auto-reverts normally (rec-22 §2.6) and the terminal state is the same as any expiry.
- [x] 1.6 Resume after the grant expired is refused with an honest surface: the grant is gone, a fresh request is needed.
- [x] 1.7 Both pause and resume write the double-row ledger through the existing track-service primitives. No hand-rolled Twilio calls.
- [x] 1.8 Both are idempotent: double-tap pause, or pause on an already-paused grant, is a no-op success — mirror the `already_audio_only` discriminator style the stop path uses.

### 2. Instant local halt (REC-D11)

- [x] 2.1 On confirming **stop**, and on tapping **pause**, the client halts local video **before** issuing the network call. Asserted by **call order** in a component test, not by a timing assertion.
- [x] 2.2 Use the primitive `VideoRoom` already documents as fast (`disable()`), unless you verify Twilio still records frames from a disabled track — in which case fall back to unpublish + stop and **write down what you observed**. Do not guess which one halts capture; check.
- [x] 2.3 The indicator gets the halt behaviour via a callback from `VideoRoom` (which owns the tracks). The indicator must stay side-effect-light and must not reach into the room — its JSDoc L18-24 explains why that separation exists.
- [x] 2.4 On resume, local video is re-published/re-enabled only **after** the server confirms rules are back to audio+video, so the patient is never visible-and-recorded before the ledger says so.
- [x] 2.5 The halt is instrumented so rec-27 can measure it — a `performance.mark` at confirm and at halt, with a `performance.measure` between them. Charter metric #3 is ≤250 ms.

### 3. The camera-re-enable trap (REC4-D7)

- [x] 3.1 After a stop, the camera control is **blocked** until the server confirms the rules are audio-only. If the flip failed, re-enabling the camera would silently resume capture — the exact dishonesty charter metric #2 counts.
- [x] 3.2 While blocked, the surface says what is happening ("stopping…" / "confirming"), not "stopped".
- [x] 3.3 A server failure keeps the block, shows the existing "Couldn't stop recording. Try again." retry affordance, and does **not** silently re-publish local video. Video is genuinely halted locally; the uncertainty is only about the ledger, and the copy must reflect that distinction.
- [x] 3.4 Once the server confirms audio-only, the patient can turn their camera back on freely — being **seen** is not being **recorded**, and this is the answer to the "declined but still on camera" gap. Interaction with the existing `cameraOff` state is explicit, not accidental.

### 4. Patient surface

- [x] 4.1 Both controls are **persistently visible** whenever a grant is active — never behind a menu, an overflow, or a hover (REC-D7).
- [x] 4.2 Pause is a single tap with no confirmation. It is reversible, so a confirm step is friction for nothing.
- [x] 4.3 Stop keeps its confirmation tooltip. It is not reversible, so the confirm stays.
- [x] 4.4 The paused state is visible to **both** parties — the doctor must not sit there wondering why the picture stopped.
- [x] 4.5 Keyboard and screen-reader parity with the existing `[Stop]`: focusable, Esc closes the confirm, `role="status"` announcements stay polite, `prefers-reduced-motion` honoured.
- [x] 4.6 The existing `[Stop]` `aria-label` clarifying that audio continues is preserved, and pause gets the equivalent.

### 5. Server endpoints

- [x] 5.1 Patient-authenticated pause and resume endpoints follow the existing escalation-route conventions: Zod validation in the controller, service owns the rule, `asyncHandler`, typed `AppError` subclasses, no DB access in the controller.
- [x] 5.2 The service re-asserts that the caller is the session patient, exactly as `patientRevokeVideoMidCall` does defensively at `:930-935`.
- [x] 5.3 Twilio flip **before** the row write, for the reason the stop path documents at `:909-914` — never stamp a state the recorder didn't reach.
- [x] 5.4 System messages for pause and resume are visible to both parties and never imply deletion (REC-D10). The `video_recording_stopped` emitter's existing "Audio recording continues." instinct is the model.
- [x] 5.5 If the lifecycle event vocabulary needs a pause/resume tag, extend it the way `consultation-message-service.ts:810-829` describes — additively, no migration. If it turns out to need one, **STOP** and surface it.

### 6. Coordination boundary with p3 — read before coding

- [ ] 6.1 If **p3 has shipped**, route the video pause through p3's kind-scoped pause primitive rather than opening a second Twilio-flip path.
- [x] 6.2 If **p3 has not shipped**, use the existing `recording-track-service` primitives and leave `recording-pause-service.ts` **untouched**, shaping the ledger rows so p3's gap renderer can consume them later.
- [x] 6.3 Either way: wanting to change `DEFAULT_KIND` (`recording-pause-service.ts:100`) or p3's kind resolution is a **STOP-and-surface**, not a scope expansion. p3 — not p4 — decides what an audio pause does to an active video grant.
- [x] 6.4 Record in Notes which branch you took and whether p3 had shipped.

### 7. Verification

- [x] 7.1 Component tests: local halt precedes the network call on both controls; a pause/resume cycle creates no new audit row; a failed stop keeps the camera blocked; a paused grant still expires.
- [x] 7.2 Frontend + backend typecheck, lint and tests green.
- [ ] 7.3 Manual smoke on a real device (not just desktop Chrome): pause, walk out of frame, come back, resume — no consent prompt, no new request.
- [ ] 7.4 **Count the video compositions** produced by one pause-heavy consult and record the number. p5 owns multi-composition replay and needs a real number, not a guess.

### Out of scope

- The unified recording-status surface and all consent-modal copy (rec-26). Ship the controls; rec-26 arranges and words them.
- Audio pause, pause reason codes, auto-resume, gap markers in player or transcript (p3).
- Multi-composition replay (p5).
- Doctor-side pause or a doctor "stop recording" control.
- Attempt/cooldown arithmetic (rec-23).
- Any migration.

---

## Scope Guard

- Expected files touched: **≤ 9** — `VideoRecordingIndicator.tsx`, `VideoRoom.tsx` (mount + halt callback only), `frontend/lib/api/recording-escalation.ts`, `recording-escalation-service.ts`, `consultation-controller.ts`, `routes/api/v1/consultation.ts`, `consultation-message-service.ts` (emitters only), frontend tests, backend tests.
- **DO NOT** touch `recording-pause-service.ts`, `DEFAULT_KIND`, or anything p3 owns.
- **DO NOT** touch the replay player or any deletion path.
- **DO NOT** change `deriveState`'s arithmetic (rec-23 owns it) or the grant-expiry worker (rec-22 owns it).
- **DO NOT** refactor `VideoRoom`'s track management, layout, or camera toggle beyond what the halt callback needs. It is a 7,700-line file with documented Chrome-specific fragility — the smallest possible surgical change wins.
- **DO NOT** create a migration.
- **DO NOT** replace the confirmation tooltip with a modal — that was decided against, with reasons, and REC-D7 agrees.
- Any expansion requires explicit approval.

---

## Done when

The patient can pause video and resume it with no second consent and no new escalation row; the patient can stop video and a restart needs a fresh request; both controls halt local video before the server call, proven by call order and instrumented for measurement; a failed stop leaves an honest "confirming" surface with the camera blocked rather than a silent resume; both parties see the paused state; a paused grant still expires on schedule; `recording-pause-service.ts` is not in the diff; typecheck, lint and tests green in both workspaces; the pause-heavy composition count is recorded for p5.

---

## Notes

- Halt primitive: `LocalVideoTrack.disable()` as VideoRoom already documents (`:3557-3560`). No live Twilio composition was available here to inspect frames; rec-27 founder smoke should confirm capture actually stops. Fallback remains unpublish+stop (synchronous at `:1938`).
- p3 branch: **p3 has shipped.** Did **not** call `pauseRecording()` — that primitive excludes every live kind (REC-D13) and would halt audio. Video pause is grant-scoped (audio continues). Routed through `revertToAudioOnlyRecording` / `escalateToFullVideoRecording`. `recording-pause-service.ts` and `DEFAULT_KIND` untouched. Added `patient_paused` to `RevertReason` so the ledger is honest.
- System events: `video_recording_paused` / `video_recording_resumed` added additively on the TEXT `system_event` union (no migration). Copy: “Audio recording continues.”
- Confirm→halt: `performance.mark` / `measure` (`rec24-confirm-to-halt-pause|stop`). Numbers from a real phone are rec-27 metric #3.
- Composition count from a pause-heavy consult: **not measured here** — rec-27 / 7.4.

---

## Related tasks

- [`task-rec-22-grant-expiry-auto-revert.md`](./task-rec-22-grant-expiry-auto-revert.md) — the grant contract pause must not extend
- [`task-rec-23-derive-state-counter-split.md`](./task-rec-23-derive-state-counter-split.md) — matrix row 9 is this task's contract
- [`task-rec-26-recording-status-surface.md`](./task-rec-26-recording-status-surface.md) — arranges and words these controls
- [Charter](../../plan-recording-governance-v2-charter.md) · [Batch plan](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) · [Execution order](./EXECUTION-ORDER-p4-recording-governance-v2-video-escalation-control.md)
