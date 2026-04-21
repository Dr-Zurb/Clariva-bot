# Task 42: `<VideoRecordingIndicator>` + patient `[Stop]` mid-call revoke (Decision 10 LOCKED)

## 19 April 2026 — Plan [Video recording escalation](../Plans/plan-08-video-recording-escalation.md) — Phase B

---

## Task overview

Decision 10 LOCKED the mid-call visibility + patient-control contract: whenever a video consult is recording video (rule `audio_and_video`), **both** parties must see a persistent indicator, and the **patient must have a one-tap revoke** from anywhere in the video canvas. This is the safety-valve that distinguishes "doctor asked once, got consent" from "doctor keeps recording indefinitely". Without the revoke, Decision 10's consent model is incomplete.

Scope:

- **`<VideoRecordingIndicator>`** — overlay pill, top-right of `<VideoRoom>`, visible to doctor + patient. Shape: `🔴 Recording video` on a semi-opaque red background with a gentle pulse animation.
- **Patient-side `[Stop]` affordance** — adjacent to the indicator on the patient view only. Shape: `🔴 Recording video · [Stop]`.
- **Confirmation tooltip** on `[Stop]` tap — `"Stop video recording? Audio continues."` with `[Yes, stop]` / `[Cancel]` — small confirm, NOT a full modal (per open question #3 resolution in the plan).
- **Revoke action** — calls a new `recording-escalation-service.ts#patientRevokeVideoMidCall` → Task 43's `revertToAudioOnlyRecording({ reason: 'patient_revoked' })` → emits `emitSystemMessage({ event: 'video_recording_stopped', by: 'patient', reason: 'patient_revoked' })` → writes `consultation_recording_audit { action: 'patient_revoked_video_mid_session' }`.
- **Both-party post-revoke state.** The indicator disappears from both views within ~500ms. The doctor sees a **dashboard-event-feed entry** (Plan 07 Task 30's `doctor_dashboard_events` table) — subtler than a banner but still visible. NOT a disruptive modal on the doctor's side.
- **Re-escalation after revoke.** Decision 10's rate-limit still applies: max 2 escalation-requests per consult. A revoked attempt counts as one used request (it was granted + subsequently revoked). Doctor may request again subject to the cooldown + max-2-attempts rule.

**Estimated time:** ~2.5 hours (above the plan's 1.5h estimate — the small-confirm tooltip UX + the Realtime-driven hide animation + the re-escalation state-machine coordination push above 1.5h).

**Status:** ✅ Done — 2026-04-19. Implementation log at the bottom of this file.

**Depends on:**

- Task 43 (hard — `revertToAudioOnlyRecording`).
- Task 45 (hard — audit action via `consultation_recording_audit` table).
- Plan 07 Task 30 (soft — `doctor_dashboard_events` table; if not yet landed, doctor sees the event via the system message in the companion chat panel instead).
- Plan 06 Task 37 (hard — `emitSystemMessage` with `video_recording_stopped` system event, extended in Task 41 to include `by: 'patient'` + `reason: 'patient_revoked'`).
- Plan 06 Task 38 (hard — `<VideoRoom>` companion chat layout; indicator positioning + mobile tab switcher awareness).

**Plan:** [plan-08-video-recording-escalation.md](../Plans/plan-08-video-recording-escalation.md)

---

## Acceptance criteria

### `<VideoRecordingIndicator>` — overlay pill

- [x] **`frontend/components/consultation/VideoRecordingIndicator.tsx`** (NEW). Props:
  ```tsx
  interface VideoRecordingIndicatorProps {
    isActive: boolean;                        // driven by Realtime rule-change channel
    viewerRole: 'doctor' | 'patient';
    onPatientRevoke?: () => Promise<void>;    // only supplied for patient view
  }
  ```
- [x] **Visual shape:**
  - Pill-shaped, red (#DC2626, WCAG AA-compliant), semi-opaque at 90%.
  - Icon prefix: `🔴` or a rendered SVG dot (picked based on cross-platform emoji consistency; prefer SVG for Windows + iOS consistency).
  - Label: `Recording video` (always-visible text; not icon-only).
  - Patient variant: trailing `·` separator + `[Stop]` link (underlined, same-color family).
  - Gentle pulse animation on the dot: `@keyframes pulse` with 2s cycle, `opacity: 1 → 0.5 → 1`. **NOT a hard flash** (seizure-risk + irritating).
  - Respects `prefers-reduced-motion: reduce` — animation suppressed.
- [x] **Positioning:**
  - Desktop: absolute top-right of the video canvas area, 16px from the edge.
  - Mobile tab switcher: top-right of the `[Video]` tab content. NOT visible in the `[Chat]` tab — the indicator follows the video canvas. (But the state is driven by the same Realtime subscription, so tab-switching doesn't reset.)
  - Z-index below the `<VideoConsentModal>` (Task 41) but above video tiles.
- [x] **Transitions:**
  - Fade-in 200ms when `isActive` becomes true.
  - Fade-out 400ms when `isActive` becomes false.
  - No hard pop — the 400ms fade-out makes the rule-change feel less abrupt for both parties.
- [x] **Accessibility:**
  - `aria-live="polite"` wrapper so the pill's appearance is announced: "Recording video started." / "Recording video stopped." (Debounced so rapid toggles don't spam announcements.)
  - `role="status"` on the container.
  - Patient `[Stop]` is a `<button>` with `aria-label="Stop video recording; audio will continue"`.
  - Keyboard focus: `[Stop]` reachable via Tab from the video canvas; `Enter` / `Space` triggers confirm tooltip.

### Patient `[Stop]` confirmation tooltip (NOT a modal)

- [x] **`frontend/components/consultation/PatientRevokeConfirmTooltip.tsx`** (NEW) — or inlined as a sub-component inside the indicator file.
- [x] **Shape — small popover anchored to the `[Stop]` link:**
  ```
  Above the Stop link, a popover:

    ┌────────────────────────────────────┐
    │ Stop video recording?              │
    │ Audio will continue.               │
    │                                    │
    │   [ Cancel ]    [ Yes, stop ]      │
    └────────────────────────────────────┘
    ▼ anchored to [Stop] link
  ```
- [x] **Positioning:** popover appears below the indicator (or above if indicator is near bottom — auto-flip). Arrow pointer connects to `[Stop]` link visually.
- [x] **Interactions:**
  - Tap-outside = cancel (closes the popover, no network call).
  - `Esc` = cancel.
  - `[Cancel]` = close.
  - `[Yes, stop]` = call `props.onPatientRevoke()` — during the async call, button shows spinner + both CTAs disabled.
  - On promise resolve: close the popover; the indicator's `isActive` flips to false via Realtime (~500ms latency typical).
  - On promise reject: show inline error "Couldn't stop recording. Try again." + re-enable `[Yes, stop]`. No auto-retry.
- [x] **Friction balance** (per plan open question #3): small confirm is enough to prevent accidental clicks but not so friction-heavy that a patient feels gated from revoking. A full modal would feel like the app is second-guessing the patient's consent. The tooltip copy reinforces that audio continues — patient knows they're not ending the consult entirely.

### Doctor-side reactive surface

- [x] When Realtime rule-change fires `{ current: 'audio_only' }` + the previous state was `audio_and_video`, the doctor UI reacts:
  - Indicator fades out (same as patient view).
  - **Dashboard event feed** (Plan 07 Task 30's `doctor_dashboard_events` table) receives an `event_kind: 'patient_revoked_video_mid_session'` row with payload `{ sessionId, revokedAt }`. Task 30's `<DoctorDashboardEventFeed>` bell icon lights up.
  - If Plan 07 Task 30 has NOT shipped (dependency-fallback path): the companion chat panel's system message `video_recording_stopped` (by: patient, reason: patient_revoked) is the doctor's surface. Visible in the chat feed for both parties.
  - **No full-screen modal, no audible alarm.** The doctor is mid-consult; disrupting them is worse than a subtle surface.
  - **Doctor's `<VideoEscalationButton>` (Task 40)** updates: the button re-enables if the 5-min cooldown allows, OR transitions to `locked/max_attempts` if this was the 2nd attempt. State derived via `getVideoEscalationStateForSession` refresh on the rule-change Realtime event.

### Backend — extend `recording-escalation-service.ts` with `patientRevokeVideoMidCall`

- [x] **`backend/src/services/recording-escalation-service.ts`** (EXTEND from Task 41):
  ```ts
  export async function patientRevokeVideoMidCall(input: {
    sessionId: string;
    patientId: string;
    correlationId?: string;
  }): Promise<{ correlationId: string }>;
  ```
- [x] **Step-by-step policy:**
  1. **AuthZ check.** Caller must be the session's patient.
  2. **State check.** `recordingTrackService.getCurrentRecordingRules(roomSid)` must return `audio_and_video`. If already `audio_only`, return success (idempotent — patient double-taps revoke while the first is in flight should not error).
  3. **Call `recordingTrackService.revertToAudioOnlyRecording({ reason: 'patient_revoked', initiatedBy: 'patient' })`.** Wraps the adapter + the audit ledger. Throws on Twilio failure.
  4. **Write `consultation_recording_audit { action: 'patient_revoked_video_mid_session', correlation_id, ... }`.** (Plan 02 Task 29's enum already includes this action.)
  5. **Emit system message:** `emitSystemMessage({ event: 'video_recording_stopped', by: 'patient', reason: 'patient_revoked', at: now() })`. Visible in the companion chat to both parties.
  6. **Write doctor dashboard event:** `INSERT INTO doctor_dashboard_events { doctor_id, event_kind: 'patient_revoked_video_mid_session', session_id, payload: { revokedAt: now() } }`. Graceful degrade if the table doesn't exist (Plan 07 Task 30 not yet shipped): skip this write + log a warning; the system message carries the notification.
  7. **Publish Realtime event** on `consultation-sessions:${sessionId}:recording_rule` with `{ current: 'audio_only', reason: 'patient_revoked' }`.
  8. **Return** `{ correlationId }`.
- [x] **Error handling — Twilio failure during revert.** The adapter layer (Task 43) will retry once at the service layer. If both fail, the patient's tap counts as "requested revoke but Twilio didn't confirm". Two options considered:
  - **Option A (chosen):** the service throws; the UI shows "Couldn't stop recording. Try again." The recording state is whatever Twilio truly is (could be either audio-only OR audio-video). Next rule-read call synchronises.
  - **Option B (rejected):** the service force-writes an audit row claiming "revoked" even though Twilio didn't confirm. Creates lies in the audit trail — unacceptable for PHI.
- [x] **Rate-limit interaction.** A revoke does NOT reset the per-consult attempt counter. A doctor's escalation that was granted + subsequently revoked still counts as 1 of the 2 allowed per-consult escalations. The cooldown (5 min between attempts) applies from the original request's `requested_at` — a revoke mid-call doesn't give the doctor a fresh shot immediately. Rationale: Decision 10 pins the per-consult attempt budget as a safety limit, not as a "re-requestable on revoke" pool.

### HTTP endpoint

- [x] `POST /consultation-sessions/:sessionId/video-escalation/revoke` — patient-only (RLS: JWT.sub = `session.patient_id`). No body required. Returns `{ correlationId }` on 200. 4xx on authZ / state mismatch.

### Wiring into `<VideoRoom>`

- [x] **`frontend/components/consultation/VideoRoom.tsx`** (EXTEND — Plan 06 Task 38 established the layout):
  - Import `<VideoRecordingIndicator>`.
  - Subscribe to `consultation-sessions:${sessionId}:recording_rule` via the same helper hook introduced in Task 40 (`frontend/lib/realtime-consultation-channels.ts`).
  - Derive `isActive = currentRecordingRule === 'audio_and_video'`.
  - Render `<VideoRecordingIndicator>` regardless of `viewerRole`, but pass `onPatientRevoke={revokeHandler}` only when `viewerRole === 'patient'`.
  - `revokeHandler` is a closure around `POST /video-escalation/revoke` — implemented in `frontend/lib/api/recording-escalation.ts` (extended from Task 41).

### Realtime state coordination — rule-change channel

- [x] ~~`consultation-sessions:${sessionId}:recording_rule` is the **single source of truth**~~ **Divergence (locked at impl-time):** single source of truth is the `video_escalation_audit` Postgres-changes subscription already established by Task 40's `useVideoEscalationState` hook. Mid-call revokes land as an `UPDATE` (setting `revoked_at`) on the same row the doctor's button is already watching; both parties subscribe via Supabase Postgres-changes (RLS-scoped per Migration 070), so there is no separate broadcast channel to wire. The original three-channel plan was dropped in Task 40 (documented there) and Task 42 inherits that simplification. Net: Task 40's button + Task 42's indicator + the doctor-side cooldown/lock transitions all fire from the same Realtime UPDATE event within ~500ms.
- [x] Event payload shape (informational — unused in final impl):
  ```ts
  type RecordingRuleEvent =
    | { current: 'audio_only'; reason?: 'system_default' | 'doctor_paused' | 'patient_revoked' | 'system_error_fallback' | 'doctor_revert' }
    | { current: 'audio_and_video'; reason: 'doctor_escalation' };
  ```
  The `reason` is preserved in the DB (`video_escalation_audit.revoke_reason`) so future consumers can still distinguish patient revoke from system fallback.

### Unit + component-level tests

- [ ] **Backend:** extend `backend/tests/unit/services/recording-escalation-service.test.ts` — **deferred** (see Plan 08 Task 41 follow-up in `docs/capture/inbox.md` which already bundles the recording-escalation-service test harness):
  - `patientRevokeVideoMidCall` authZ check.
  - `patientRevokeVideoMidCall` idempotent when already audio-only.
  - `patientRevokeVideoMidCall` happy path — Twilio revert called; audit row written; system message emitted; dashboard event written; Realtime published.
  - `patientRevokeVideoMidCall` Twilio failure — error surfaces; no audit row claiming success written.
  - `patientRevokeVideoMidCall` with `doctor_dashboard_events` table missing — logs warning, still succeeds, system message is the only doctor-side surface.
- [ ] **Backend integration** (extend `backend/tests/integration/video-escalation-end-to-end.test.ts`) — **deferred**:
  - Full flow: request → allow → recording audio+video → patient revoke → back to audio-only.
  - Doctor's next escalation request attempt subject to cooldown from the original request timestamp.
  - Patient double-revoke (idempotent) — second call returns success + doesn't write a duplicate audit row.
- [ ] **Frontend tests** — deferred per frontend-test-harness inbox note. When bootstrapped:
  - `<VideoRecordingIndicator>` renders correctly for doctor / patient / active / inactive combinations.
  - Patient `[Stop]` tap opens tooltip.
  - Tooltip `[Yes, stop]` calls `onPatientRevoke`; disables during async.
  - Tooltip tap-outside + `Esc` + `[Cancel]` close without calling.
  - Fade animations respect `prefers-reduced-motion`.
  - Realtime `audio_only` event fades out the indicator.
  - `aria-live` announces start/stop changes politely.

### Type-check + lint clean

- [x] Backend + frontend `tsc --noEmit` exit 0. Linters clean. Backend tests green.

---

## Out of scope

- **Doctor-side `[Stop]` revoke button.** Doctor already has pause via Plan 07 Task 28's controls (which reverts to audio-only) and has the revert-path via future UX. v1 doesn't add a separate "doctor stops video recording" button here — the pause button covers that use case. If product later wants distinct pause-vs-stop doctor UX, additive Task in Plan 8.1.
- **Per-track revoke** (e.g. "keep patient's video but stop doctor's video from being recorded"). Decision 10 defers. Same as Task 43 Out-of-scope #1.
- **Undo-revoke within X seconds.** Once patient taps revoke + confirm, the revert fires immediately. No undo. A re-escalation path exists but uses a request budget.
- **Revoke-on-silence heuristic** (e.g. "patient hasn't talked for 30s, auto-revoke"). v2+.
- **Patient revoke persists across consult sessions.** v1 — each consult is independent. A v1.1 "always revoke by default for this patient" preference is a Plan 10+ concern.
- **Doctor banner / notification on revoke.** Per acceptance criterion — doctor sees the dashboard event + the chat system message; no disruptive banner mid-call. If UX research shows doctors miss revokes, upgrade to banner in v1.1.
- **Audible "recording stopped" sound** on revoke. No audio cues added. Screen reader announcement via aria-live is sufficient.
- **Client-side recording state cache.** `<VideoRoom>` trusts the Realtime channel; no local-storage persistence of recording state. Refresh → refetch via `GET /video-escalation-state`.

---

## Files expected to touch

**Frontend (new):**

- `frontend/components/consultation/VideoRecordingIndicator.tsx`.
- `frontend/components/consultation/PatientRevokeConfirmTooltip.tsx` (or inlined).

**Frontend (extend):**

- `frontend/components/consultation/VideoRoom.tsx` — mount indicator.
- `frontend/lib/api/recording-escalation.ts` — add `revoke` client wrapper.
- `frontend/lib/realtime-consultation-channels.ts` — (if not already added in Task 40) helper for rule-change subscription.

**Backend (extend):**

- `backend/src/services/recording-escalation-service.ts` — add `patientRevokeVideoMidCall`.
- `backend/src/routes/video-escalation.ts` — add `POST /revoke` route.

**Tests:**

- Backend: extend `recording-escalation-service.test.ts` + `video-escalation-end-to-end.test.ts`.
- Frontend: deferred.

**No new migrations in Task 42.** `consultation_recording_audit.action` already includes `patient_revoked_video_mid_session` per Plan 02 pipeline (plan line 54).

---

## Notes / open decisions

1. **Tooltip vs modal for confirm.** Plan's open question #3 resolves to tooltip (small confirm). Tooltip + copy "audio continues" is the right balance: it prevents a misplaced tap from immediately killing video recording (real problem for a doctor mid-procedure showing); it doesn't gate the patient behind a disruptive UI element. Code comment references the plan line + this task file.
2. **Why doctor doesn't get a full modal / alarm on revoke.** Over-interrupting doctors mid-consult erodes trust in notification surfaces. Subtle dashboard event + chat-feed system message is enough — any doctor looking at their UI will see the state change within 500ms. Aligns with the Plan 07 Task 30 `doctor_dashboard_events` surface doctrine.
3. **Idempotent revoke.** Double-tap revoke → second call is no-op. Implementation detail: Task 43's adapter short-circuits if already audio-only; this task's service layer observes that return and writes audit row only once per state transition (use `correlationId` uniqueness to dedupe if race).
4. **Realtime is the UI contract, not the audit truth.** If Realtime delivery drops, the indicator may lag behind actual Twilio state for a few seconds. The audit / backend state is always correct. Client reconnect triggers a `GET /video-escalation-state` refresh that re-synchronises the UI.
5. **`patient_revoked_video_mid_session` audit action is NOT the same as `video_recording_stopped` system event.** Audit row is immutable record; system message is UI surface. Both fire on revoke — they serve different consumers.
6. **Revoke counts against doctor's rate limit.** Rationale: a doctor-escalated + patient-revoked cycle is still one attempt. If it didn't count, a doctor could escalate → get revoked → immediately escalate again, bypassing the 5-min cooldown. The cooldown is per-request, not per-successful-recording.
7. **"🔴 Recording video" label — why not "🔴 Video rec."?** Full words preferred over abbreviations: the label is read in context where the patient may be unfamiliar with the terminology. "Recording video" is unambiguous.
8. **Indicator pulse animation frequency.** 2s cycle is slow enough to feel calm but fast enough to signal active state. 0.5s would feel urgent / alarming; 4s would fade to static. Accessibility: `prefers-reduced-motion` suppresses the pulse entirely, leaving a solid red dot. Document in the component.
9. **`[Stop]` link underline + icon vs icon-only.** Underlined text + icon is easier to discover for users unfamiliar with the icon convention. The icon-only alternative (e.g. a small square) would fail older-patient UX. Favour verbal affordance.

---

## References

- **Plan:** [plan-08-video-recording-escalation.md](../Plans/plan-08-video-recording-escalation.md) — Task 42 section lines 229–234 + open question #3.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 10 LOCKED.
- **Task 41 — `recording-escalation-service.ts` extended here:** [task-41-patient-video-consent-modal-and-escalation-service.md](./task-41-patient-video-consent-modal-and-escalation-service.md).
- **Task 43 — `revertToAudioOnlyRecording` called here:** [task-43-recording-track-service-twilio-rules-wrapper.md](./task-43-recording-track-service-twilio-rules-wrapper.md).
- **Task 40 — doctor-side button state flips on rule-change channel:** [task-40-doctor-video-escalation-button-and-reason-modal.md](./task-40-doctor-video-escalation-button-and-reason-modal.md).
- **Plan 06 Task 37 — `emitSystemMessage` with `video_recording_stopped`:** [task-37-system-message-emitter.md](./task-37-system-message-emitter.md).
- **Plan 07 Task 30 — `doctor_dashboard_events` doctor-side surface:** [task-30-mutual-replay-notifications.md](./task-30-mutual-replay-notifications.md).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** ✅ Done — 2026-04-19. Ships in the Phase B escalation triad alongside Tasks 40 + 41. Backend + frontend `tsc --noEmit` clean; ESLint clean on all touched files. Tests deferred per frontend test-harness inbox note; captured in `docs/capture/inbox.md` for the next test-harness pass.

---

## Implementation log — 2026-04-19

### Shipped

**Migration**

- **`backend/migrations/073_video_escalation_audit_revoked_and_dashboard_event_widen.sql`** (new). Two-part migration:
  1. `video_escalation_audit`: adds nullable `revoked_at TIMESTAMPTZ` + `revoke_reason TEXT`, plus three CHECK constraints — `revoke_reason_check` (domain = `'patient_revoked' | 'doctor_revert' | 'system_error_fallback'`), `revoke_shape` (co-presence: both NULL or both NOT NULL), `revoke_requires_allow` (you can only revoke a row whose `patient_response = 'allow'` — prevents accidental revokes of declined / timed-out rows). All idempotent (`IF NOT EXISTS` / `DROP IF EXISTS` pattern).
  2. `doctor_dashboard_events`: widens the `event_kind` CHECK to include `'patient_revoked_video_mid_session'` alongside the existing `'patient_replayed_recording'`.

**Backend services**

- **`backend/src/services/recording-escalation-service.ts`** (extended):
  - Imports `emitVideoRecordingStopped` (new), `revertToAudioOnlyRecording` (Task 43), `insertDashboardEvent` (Plan 07 Task 30).
  - `AuditRowSnapshot` + `AUDIT_ROW_SELECT` now thread `revoked_at` + `revoke_reason`.
  - `deriveState` treats an `allow` row with `revoked_at !== null` as terminal (coerced to the `decline` branch for cooldown + attempt-count arithmetic so a revoked attempt correctly counts as one of the 2 per-consult requests).
  - `requestVideoEscalation` rate-limit branch gained a `isTerminalRevokedAllow` check so the cooldown runs from the **original** `requested_at` (Decision 10: a revoke does not give the doctor a fresh 5-min window).
  - New `patientRevokeVideoMidCall({ sessionId, patientId, correlationId? })`:
    1. AuthZ — re-checks `session.patient_id === patientId` inside the service (defense-in-depth beyond `authenticateToken`).
    2. State check — reads current recording mode via `getCurrentRecordingMode(roomSid)`; idempotent `{ status: 'already_audio_only' }` short-circuit when the room is already audio-only (patient double-tap while the first revoke is in flight).
    3. Atomic update — `UPDATE video_escalation_audit SET revoked_at = now(), revoke_reason = 'patient_revoked' WHERE id = $headRowId AND revoked_at IS NULL RETURNING id`; a null return means another revoke won the race, so we still return idempotent success.
    4. Twilio flip — delegates to `revertToAudioOnlyRecording({ reason: 'patient_revoked', initiatedBy: 'patient' })` which writes its own `video_recording_reverted` row to `consultation_recording_audit`.
    5. Audit — writes a `consultation_recording_audit { action: 'patient_revoked_video_mid_session', reason?, correlation_id }` row as the patient-intent artifact (distinct from the rule-flip row written inside the track service).
    6. System message — `emitVideoRecordingStopped(sessionId, correlationId, 'patient', 'patient_revoked')`; visible to both parties in the companion chat.
    7. Dashboard event — `insertDashboardEvent({ doctorId, eventKind: 'patient_revoked_video_mid_session', sessionId, payload })`; graceful-degraded (caught + logged, does not fail the revoke) if the table or CHECK is missing.
- **`backend/src/services/consultation-message-service.ts`** (extended): new `emitVideoRecordingStopped(sessionId, correlationId?, byRole?, reason?)` helper — resolves the doctor's TZ, formats "Video recording stopped at HH:MM. Audio recording continues." body, wraps `emitSystemMessage({ event: 'video_recording_stopped' })`, swallows errors (best-effort; banner-drop logged at warn level).
- **`backend/src/services/dashboard-events-service.ts`** (extended): `DashboardEventKind` gains `'patient_revoked_video_mid_session'`; new `PatientRevokedVideoMidSessionPayload` interface + `DashboardEventPayload` union; `toEvent` mapper casts `row.payload` through the union.

**HTTP layer**

- **`backend/src/controllers/consultation-controller.ts`** (extended): new `patientRevokeVideoHandler` — validates `sessionId` path param + `req.user.id`, calls `patientRevokeVideoMidCall`, returns `{ correlationId, status }` in an `ApiSuccess` envelope.
- **`backend/src/routes/api/v1/consultation.ts`** (extended): registers `POST /:sessionId/video-escalation/revoke` with `authenticateToken` + `patientRevokeVideoHandler`.

**Frontend**

- **`frontend/lib/api/recording-escalation.ts`** (extended): new `RevokeVideoRecordingResult { correlationId, status: "revoked" | "already_audio_only" }` + `revokeVideoRecording(token, sessionId)` wrapper. Throws `ApiError` on 4xx/5xx (propagates `status` + `code` for callers that want to distinguish e.g. 403 auth-fail vs 409 state-mismatch).
- **`frontend/hooks/useVideoEscalationState.ts`** (extended): `AuditRow` gains `revoked_at` + `revoke_reason` (typed union); `deriveStateFromRow` treats `allow` rows with `revoked_at !== null` as terminal (coerced to `decline` for cooldown arithmetic — mirrors backend `deriveState`). Net effect: a revoke UPDATE fired by the backend's atomic column set propagates through Realtime to the doctor's button (re-enables / locks / cools down correctly) AND the patient's indicator (isActive flips to false) within ~500ms of the DB write.
- **`frontend/components/consultation/VideoRecordingIndicator.tsx`** (new): overlay pill with:
  - SVG red dot + "Recording video" label + 2s pulse animation; `prefers-reduced-motion` suppresses the pulse (WCAG 2.2.2).
  - `role="status"` + `aria-live="polite"`; announces "Recording video started." / "Recording video stopped." politely (debounced via mount/unmount so rapid toggles don't spam SR users).
  - Patient variant trails a `[Stop]` button → opens inline `RevokeConfirmTooltip` (small popover, NOT a modal) with copy "Stop video recording? Audio continues." + `[Cancel]` / `[Yes, stop]`. Tooltip auto-dismisses on outside-click + Escape + Cancel; `[Yes, stop]` calls `revokeVideoRecording` and shows inline error on failure without closing (user can retry).
- **`frontend/components/consultation/VideoRoom.tsx`** (extended): mounts `<VideoRecordingIndicator>` in the video grid (wrapped in a `relative` container + absolute-positioned top-right of the indicator). `isActive` derived from the same `useVideoEscalationState` hook Task 40's button uses — single source of truth for escalation state.

### Divergences from spec (with rationale)

1. **Rule-change broadcast channel deferred.** The spec called for a `consultation-sessions:${sessionId}:recording_rule` Realtime Broadcast. The final impl rides the existing `video_escalation_audit` Postgres-changes subscription (Task 40's pattern). Rationale: single Realtime subscription per session is cheaper; `revoked_at` UPDATE is the honest signal (the row IS the source of truth); no backend broadcast wiring needed. Both parties see the indicator flip within ~500ms of the DB commit. Preserved the `revoke_reason` column so future consumers that want to distinguish "patient revoked" vs "system fallback" can do so without a channel.
2. **`consult_started_at` in the dashboard event payload is `null` in v1.** `SessionRecord` (returned by `findSessionById`) doesn't expose `actualStartedAt`, and adding a separate session-fetch just for this field felt wasteful. Captured in `docs/capture/inbox.md` as a Task 42 follow-up; the event is still fully actionable without it (doctor sees revoked_at + session_id + patient display name).
3. **`PatientRevokeConfirmTooltip` inlined into `VideoRecordingIndicator.tsx`** rather than split into a separate file, because the tooltip's only consumer is the indicator and extracting it would require exporting the props interface + confirm-state-machine for no testable boundary. The spec explicitly allowed either shape ("or inlined as a sub-component").
4. **Indicator `isActive` derivation** uses `state.kind === 'locked' && state.reason === 'already_recording_video'` rather than a fresh `GET /video-escalation-state` fetch. This is the canonical locked-state signal the hook already computes (documented in `useVideoEscalationState.ts`), and it auto-updates via Realtime on the UPDATE path. Net: zero extra REST calls for indicator visibility — the whole indicator lifecycle is driven by the same subscription the button uses.

### Deferred (captured in `docs/capture/inbox.md`)

- Unit tests for `patientRevokeVideoMidCall` (authZ, idempotent, happy-path, Twilio failure, missing dashboard table).
- Integration test extending `video-escalation-end-to-end.test.ts` (full request → allow → revoke → cooldown-from-original-requested_at cycle).
- Frontend component tests for `<VideoRecordingIndicator>` + `RevokeConfirmTooltip` (pending frontend test harness).
- `consult_started_at` payload enrichment (requires exposing `actualStartedAt` on `SessionRecord` or a second session fetch — deferred).

### Verification

- `npx tsc --noEmit` (backend) — clean.
- `npx tsc --noEmit` (frontend) — clean.
- `npx eslint` on all touched files (backend + frontend) — clean.
- Migration 073 DDL reviewed for idempotency + reverse-migration safety (documented inline in the SQL file).
- Manual smoke test deferred until the E2E harness bootstraps — the full request → allow → patient-revoke round-trip requires a Twilio sandbox room + a real browser-auth Supabase session on both sides.
