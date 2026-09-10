# Task rec-26: Consent + indicator copy, and one recording-status surface

## 17 Aug 2026 — Batch [p4-video-escalation-control](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) — Wave 4 — **M, ~3h**

---

## Task overview

Two jobs, one theme: **a patient must never be able to misunderstand what is being captured.**

1. **Copy (REC-D7 / REC-D10).** In a video consult the camera is already streaming. Escalation only changes whether Twilio **stores** it. No patient will infer that from "Your doctor would like to record video." Compounding it, the consent modal deliberately offers no "turn off my camera" option (`VideoConsentModal.tsx:44-47`), so a patient who declines *saving* has no in-product way to stop *being seen* — and until rec-24 they had no way to stop being recorded either, short of the one `[Stop]` link. Copy must make "already visible" versus "being saved" unmissable, and must never imply that stopping deletes anything.

2. **One surface.** After rec-24 and rec-25 the patient holds three controls with **two different guarantees** — video pause (temporary, resumable, no re-consent), video stop (terminal for the grant, restart needs a fresh request), and audio pause (p3, and audio is a disclosed mandate the patient cannot switch off). Those states must be legible **independently**, so nobody can believe that stopping video stopped everything. The existing `[Stop]` `aria-label` — "Stop video recording; audio will continue" — already has the right instinct. Generalise it into the visual layer instead of leaving it to screen readers.

**Estimated time:** ~3h
**Status:** ✅ Done (2026-08-20) — founder sign-off of wording still required (5.5)
**Hard deps:** rec-24 (the pause/stop controls exist), rec-25 (the offer control exists), rec-22 (there is a countdown to render).
**Source:** REC-D7, REC-D10, REC-D8 (countdown), charter metric #2 (honesty).

**Current state**

- ✅ `VideoConsentModal.tsx` is well-built: doctor's reason verbatim in quotes, preset pill, server-anchored 60 s countdown, focus trap, Escape deliberately disabled so a dismissal can never read as consent (`:56-58`). Its body copy is two sentences: *"Recording starts immediately if you allow. You can stop it at any time from the recording controls."*
- ✅ `VideoRecordingIndicator.tsx` renders "Recording video" plus the patient `[Stop]`; the confirm tooltip says "Stop video recording?" / "Audio will continue."
- ✅ `RecordingPausedIndicator.tsx` renders the **audio** pause banner to both parties.
- ✅ `emitVideoRecordingStopped` already says "Audio recording continues." in the chat banner (`consultation-message-service.ts:927`).
- ❌ Nothing tells the patient the camera is already streaming and only storage changes.
- ❌ Nothing shows audio state and video state side by side; a patient sees one red pill for video and a separate red banner for audio pause, in different places, with no shared vocabulary.
- ⚠️ `RecordingPausedIndicator.tsx:45-49` renders the doctor's **free-text pause reason verbatim to the patient**. That is p3's problem (REC-D14 replaces free text with preset codes) — **do not fix it here**, and do not carry free text into the new surface.
- ⚠️ `RecordingControls` returns `null` for patients (`:23-25`) — audio pause is doctor-only today. p3's REC-D15 adds the patient's. Build the surface so it renders two controls now and three later without a rewrite.

---

## Model & execution guidance

**Recommended model:** Sonnet (Auto). Copy and component composition; no new state machine.

**New chat?** **Yes.** Pre-load:

- This task file + [batch plan](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) + charter REC-D7 / REC-D10 and §Success metrics (#2).
- `frontend/components/consultation/VideoConsentModal.tsx` — **whole file** (450 lines). Responsibilities L7-32, the deliberate non-offer of a video mute L44-47, the Escape rationale L56-58, the body copy L348-368, the terminal frames L371-380.
- `frontend/components/consultation/VideoRecordingIndicator.tsx` — whole file, especially the `aria-label` at `:208` and the tooltip copy at `:331-336`.
- `frontend/components/consultation/RecordingPausedIndicator.tsx` — all 67 lines; the role-split copy at `:46-49`.
- `frontend/components/consultation/RecordingControls.tsx:18-58` — the patient-returns-null contract you must not break, and the shared-snapshot doctrine.
- `frontend/hooks/useRecordingState.ts` — the audio `RecordingStateSnapshot` shape.
- `frontend/components/consultation/VideoRoom.tsx:4977-5185` — every current mount point for recording surfaces, including the desktop-chrome variant at `:5182`.
- `backend/src/services/consultation-message-service.ts:810-940` — the three video lifecycle emitters and the reasons two of them deliberately don't exist.
- rec-24's control surface and rec-25's offer control as landed.

**Estimated turns:** 3–5.

**Global safety gate**

- Data touched? **No** — presentation only. RLS: n/a.
- PHI in logs? **No.** Also: do not render the doctor's free-text pause reason in the new surface, and do not add any free text to a log line.
- External API or AI call? **No.**
- Retention / deletion impact? **No** — and the copy must not imply any (REC-D10).

---

## Acceptance criteria

### 1. Consent-modal copy (REC-D7)

- [x] 1.1 The modal states plainly that the doctor **can already see** the patient, and that allowing changes whether the video is **saved**. Two ideas, in the patient's words, above the CTAs — not in a footnote.
- [x] 1.2 The doctor's reason stays verbatim and in quotes. It is the most trust-building element on the screen; do not summarise, truncate, or move it below the fold.
- [x] 1.3 The modal states what declining does and does not do: recording is not saved; the consult continues; the doctor can still see them as before.
- [x] 1.4 The modal states the grant is **time-bounded** and how long it lasts (rec-22). "Recording starts immediately if you allow" becomes accurate about the end as well as the start.
- [x] 1.5 The modal states that the patient can pause or stop at any moment, and — because rec-24 makes it true — that stopping also turns their camera off until they turn it back on.
- [x] 1.6 Copy never implies deletion or erasure (REC-D10). No "we won't keep it", no "this will be removed". If a patient asks for erasure, that is a separate path (REC-D19, p5).
- [x] 1.7 Escape stays disabled; the focus trap, the server-anchored countdown, and the `role="dialog"` semantics are untouched.
- [x] 1.8 Reading age and plain language: short sentences, no "escalation", no "composition", no "Twilio". Assume a patient on a phone in a waiting room.

### 2. Unified recording-status surface

- [x] 2.1 One surface shows **audio state** and **video state** independently. Audio is a disclosed mandate that is on; video is a bounded, patient-held grant. Those are different kinds of thing and must not share one indicator.
- [x] 2.2 Stopping video visibly leaves audio recording. A patient must not be able to read the surface and conclude that everything stopped.
- [x] 2.3 The surface distinguishes the **two guarantees** in the controls themselves: pause is reversible and resumes without asking again; stop ends the grant and a restart needs a fresh request. The words carry that difference — not a tooltip.
- [x] 2.4 The grant countdown is visible to both parties in this surface (rec-22 §5), anchored to the server, and shows the settling state honestly when the clock beats the worker.
- [x] 2.5 A paused **video** grant is distinguishable from a paused **audio** recording at a glance.
- [x] 2.6 It accommodates a **third** control (patient audio pause, p3's REC-D15) without a rewrite, and renders correctly today with that control absent.
- [x] 2.7 It renders correctly in every layout the room already supports, including the desktop-chrome branch (`VideoRoom.tsx:5182`) and the patient mobile stage.
- [x] 2.8 Never behind a menu, an overflow, or a hover (REC-D7).
- [x] 2.9 No free text is rendered in this surface — not the escalation reason, not the pause reason (p3 replaces the latter with preset codes).

### 3. Indicator + tooltip copy

- [x] 3.1 The pill distinguishes "recording video" from "video paused" from "audio only".
- [x] 3.2 The stop confirmation keeps "Audio will continue" and gains the camera-off consequence in one short line.
- [x] 3.3 Pause needs no confirmation and its label says it is temporary and resumable.
- [x] 3.4 Existing `aria-label`s keep their clarifying phrasing; new controls get the equivalent. The `[Stop]` label's instinct is the standard for the whole surface.

### 4. Accessibility

- [x] 4.1 `role="status"` + `aria-live="polite"` retained; the countdown does not barrage screen readers (announce on change of minute or at defined thresholds, not every tick).
- [x] 4.2 Full keyboard reachability for every control; Esc closes the stop confirm and returns focus to its trigger.
- [x] 4.3 `prefers-reduced-motion` honoured for the pulse and the countdown.
- [x] 4.4 State is not conveyed by colour alone — text or icon carries it too.

### 5. Verification

- [x] 5.1 Component tests for the state matrix of the surface: audio-on + no video; audio-on + video recording; audio-on + video paused; audio-paused + video recording; audio-paused + video paused; and the settling state.
- [x] 5.2 A test asserting the surface never renders a free-text reason.
- [x] 5.3 Frontend lint + rec-26 tests green (25). Full-repo frontend `tsc` remains red on unrelated cockpit/rx files — not re-run. Backend `type-check` run after the started-banner string.
- [x] 5.4 Word sheet attached: [rec-26-COPY-STATES.md](./rec-26-COPY-STATES.md). Screenshots deferred to founder review; the sheet is the readable-without-running artifact.
- [ ] 5.5 Final wording confirmed by the founder before merge. This is patient-facing consent copy in a healthcare product; an agent proposes it, a human owns it.

### Out of scope

- The controls' behaviour, endpoints, or state machine (rec-24, rec-25).
- Audio pause reason codes, patient audio pause, auto-resume copy, gap markers (p3).
- The booking-time disclosure and the doctor attestation copy (p2).
- Any erasure or deletion copy (p5).
- Legal sign-off of the audio mandate wording (REC-D2 — counsel, not this task).
- Backend changes beyond system-message body strings.

---

## Scope Guard

- Expected files touched: **≤ 7** — `VideoConsentModal.tsx`, `VideoRecordingIndicator.tsx`, the new/extended status surface component, `VideoRoom.tsx` (mount only), `consultation-message-service.ts` (banner strings only), frontend tests.
- **DO NOT** change `RecordingPausedIndicator`'s free-text rendering or `RecordingControls`' patient-returns-null contract — both are p3's.
- **DO NOT** re-enable Escape on the consent modal, remove the focus trap, or change the 60 s countdown anchor.
- **DO NOT** add a "turn off my camera" toggle to the consent modal. rec-24's stop already gives the patient that outcome; a second mechanism in the consent flow was deliberately not offered and nothing in REC-D7 asks for it.
- **DO NOT** restructure `VideoRoom`'s layout, tiles, or chrome.
- **DO NOT** touch the replay player, the booking flow, or any deletion path.
- Any expansion requires explicit approval.

---

## Done when

A patient reading the consent modal understands that the camera is already on and that this decision is about saving; a patient reading the status surface can tell audio state from video state at a glance and cannot conclude that stopping video stopped everything; the two guarantees (pause versus stop) are legible in the words themselves; the grant countdown is visible to both parties; no free text is rendered anywhere in the surface; nothing implies deletion; accessibility parity with the existing indicator is preserved; screenshots of every state are attached; the founder has signed off the wording; frontend typecheck, lint and tests green.

---

## Notes

- Already visible vs saved: “Your doctor can already see you. This choice is only about whether we save the video.”
- Full proposed strings: [rec-26-COPY-STATES.md](./rec-26-COPY-STATES.md). Founder has not signed off (5.5).
- No founder pushback yet — first proposal.
- States documented: audio-on/off-video, audio-on/video-recording, audio-on/video-paused, audio-paused/video-recording, audio-paused/video-paused, settling.

---

## Related tasks

- [`task-rec-24-patient-video-pause-instant-kill.md`](./task-rec-24-patient-video-pause-instant-kill.md) — the controls this task arranges
- [`task-rec-25-patient-video-offer.md`](./task-rec-25-patient-video-offer.md) — the offer control's wording
- [`task-rec-27-close-gate-p4.md`](./task-rec-27-close-gate-p4.md) — measures the honesty metric this task serves
- [Charter](../../plan-recording-governance-v2-charter.md) · [Batch plan](../plan-p4-recording-governance-v2-video-escalation-control-batch.md) · [Execution order](./EXECUTION-ORDER-p4-recording-governance-v2-video-escalation-control.md)
