# Plan 08 — Video recording escalation (Decision 10: audio-only-default + doctor-initiated full-video + patient consent + replay friction)

## Layer Decision 10's video-recording specifics on top of the baseline video room

> **Master plan reference:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 10 (audio-only by default during video consults; full-video = doctor-initiated escalation flow with reason capture + just-in-time patient consent modal + 60s timeout + patient mid-call revoke + rate-limited doctor re-request; patient self-serve video replay = audio-only-default player + "Show video" toggle + warning + light SMS OTP friction on first video replay per 30-day rolling window; mutual notifications differentiate audio vs video copy with 🎥 indicator) **LOCKED**.
>
> **Sequencing index:** [plan-00-multi-modality-implementation-index.md](./plan-00-multi-modality-implementation-index.md). Hard depends on Plans 02 + 07. Ships after Plan 07 because it extends Plan 07's `<RecordingReplayPlayer>` and `recording_access_audit` table.

---

## Goal

Implement Decision 10's video-recording specifics:

- **Default state during video consults: audio-only is recorded.** Camera tracks are live for the call but **not** captured to the recording artifact unless escalated.
- **Doctor-initiated escalation:** doctor clicks "Start video recording" → reason modal (preset + free-text) → patient gets just-in-time consent modal → 60s timeout = decline → on patient-allow, Twilio Recording Rules API toggles audio+video tracks at the same room SID.
- **Patient mid-call revoke:** patient sees "🔴 Recording video" indicator + "Stop video recording" button next to it; clicking it stops the video track recording immediately + posts a system message + writes audit.
- **Doctor rate-limited re-request:** if patient declines, doctor can request again once per 5 min (max twice per consult).
- **Patient self-serve video replay friction:** Plan 07's `<RecordingReplayPlayer>` extended with audio-only-default + "Show video" toggle + warning modal + light SMS OTP on first video replay per 30-day rolling window.
- **Mutual access notifications differentiate audio vs video** with `access_type` audit column + DM copy with 🎥 indicator for video access.

This plan is the **biggest UX-policy lift** in the v1 scope and the most delicate from a PHI standpoint.

---

## Companion plans

- [plan-02-recording-governance-foundation.md](./plan-02-recording-governance-foundation.md) — provides `recording_access_audit` (extended here with `access_type`) + `consultation_recording_audit` (already includes `patient_revoked_video_mid_session` action).
- [plan-06-companion-text-channel.md](./plan-06-companion-text-channel.md) — provides `emitSystemMessage()` for video-recording-started/stopped + patient-revoked events; the doctor escalation modal triggers fire system messages here.
- [plan-07-recording-replay-and-history.md](./plan-07-recording-replay-and-history.md) — provides `<RecordingReplayPlayer>` baseline that this plan extends with the "Show video" toggle.
- [plan-09-mid-consult-modality-switching.md](./plan-09-mid-consult-modality-switching.md) — voice→video switching reuses the same Twilio Recording Rules API wrapper (`recording-track-service.ts`) introduced here.

---

## Why audio-only-default for video consults

Captured at length in Decision 10 LOCKED in the master plan; recap:

- **Industry baseline.** Practo / 1mg / Apollo / MFine record audio + transcript by default with full-video as an opt-in for procedural documentation.
- **PHI risk surface.** Derm/uro/gyn cases regularly involve patient-visible private parts. Full-video-by-default means every such consult creates a long-lived video artifact of nudity. Audio-only-default + escalation eliminates ~90% of those storage exposures.
- **Storage cost.** ~3–15 GB/month new at 1k consults vs ~340 GB/month worst case. Audio + transcript scale linearly.
- **Doctor procedural use case preserved.** The escalation flow is for "doctor needs to show this rash on a follow-up appointment" — preserves the use case without making it the default.
- **Patient self-serve video replay** is allowed (denying patients access to their own recording is paternalistic) but with extra friction beyond audio (real screenshot/share concern). Light SMS OTP = "skip-able for the patient who actually wants their consult", "hard for the casual share scenario".

---

## Audit summary (current code at start of Plan 08)

### What exists at start

| Component | Path | Plan-08 disposition |
|-----------|------|---------------------|
| Existing `<VideoRoom>` | `frontend/components/consultation/VideoRoom.tsx` | **Extend** with `<VideoEscalationButton>` in controls + `<VideoRecordingIndicator>` overlay |
| `consultation_recording_audit` enum (already includes `patient_revoked_video_mid_session`) | Plan 02's migration | **Read-only consume** — write target |
| `recording_access_audit` table | Plan 02's migration | **Extend** with `access_type` column |
| `<RecordingReplayPlayer>` baseline | Plan 07's component | **Extend** with "Show video" toggle + warning modal + OTP prompt flow |
| Mutual access notification helpers | Plan 07's `notification-service.ts` extensions | **Extend** copy + add `artifactType: 'video'` branch with 🎥 indicator |
| Plan 07's `recording-access-service.ts` | (created in Plan 07) | **Extend** to differentiate audio vs video signed URLs and write `access_type` audit |
| Existing Twilio SMS service | `backend/src/services/twilio-sms-service.ts` | **Consume** for SMS OTP send |
| Existing Twilio Video Recording lifecycle | `backend/src/services/video-session-twilio.ts` (Plan 01 rename) | **Consume** Twilio Recording Rules API to toggle tracks at runtime |

---

## Tasks (from the master plan)

| # | Master-plan task | Phase | Effort | Risk |
|---|------------------|-------|--------|------|
| 40 | B / Decision 10 — Doctor "Start video recording" button + reason-capture modal in `<VideoRoom>` controls | B | ~2h | Low |
| 41 | B / Decision 10 — Patient consent modal for video escalation + 60s timeout + decline handling + rate-limited re-request | B | ~3h | Medium |
| 42 | B / Decision 10 — Persistent "🔴 Recording video" indicator + patient "Stop video recording" revoke button mid-call | B | ~1.5h | Low |
| 43 | B / Decision 10 — Twilio Video Recording: toggle audio-only vs audio+video tracks via Recording Rules API | B | ~2h | **Medium-High** — Twilio Recording Rules API is the keystone; if it fails, the whole flow fails open or closed unpredictably |
| 44 | E (Decision 10) — "Show video" toggle + warning modal in `<RecordingReplayPlayer>` + light SMS OTP friction on first video replay per 30-day rolling window | E | ~3h | Medium |
| 45 | E (Decision 10) — DB migration: add `access_type` enum column to `recording_access_audit` table; add `video_otp_window` table for 30-day OTP-skip tracking | E | ~1h | Low |

**Suggested order:** 45 (migration first) → 43 (Twilio API wrapper — keystone, gates everything else) → 40 + 41 + 42 in parallel (in-call escalation flow) → 44 (replay surface friction).

---

## Backend deliverables

### Task 43 — `recording-track-service.ts`

```ts
// backend/src/services/recording-track-service.ts (NEW)

// Wraps Twilio Video Recording Rules API.
// One Twilio room SID throughout the consult; rules change at runtime.

export async function startAudioOnlyRecording(input: {
  roomSid: string;
}): Promise<void>;
// Includes audio tracks; excludes all video tracks. This is the default at consult start.

export async function escalateToFullVideoRecording(input: {
  roomSid: string;
  trackedAt: Date;
}): Promise<void>;
// Transitions to: includes audio + video tracks. Same room SID; new Composition for video stream
// keyed by consultation_session_id + escalation_started_at.

export async function revertToAudioOnlyRecording(input: {
  roomSid: string;
  reason: 'doctor_paused' | 'patient_revoked';
}): Promise<void>;
// Drops back to audio-only. New audio-only Composition continues; video Composition closes.

export async function getRecordingArtifactsForSession(input: {
  sessionId: string;
}): Promise<{
  audioCompositions: ArtifactRef[];
  videoCompositions: ArtifactRef[];     // empty unless escalation happened at least once
}>;
```

**Output structure:** one session can have multiple audio compositions (one per pause-resume segment) and multiple video compositions (one per escalation segment). Plan 07's `<RecordingReplayPlayer>` stitches them by timestamp.

### Task 41 — `recording-escalation-service.ts`

```ts
// backend/src/services/recording-escalation-service.ts (NEW)

export async function requestVideoEscalation(input: {
  sessionId: string;
  doctorId: string;
  reason: string;                             // ≥5 chars
}): Promise<{ requestId: string }>;
// 1. Rate-limit check: max 2 requests per consult, 5 min cooldown between.
// 2. Insert video_escalation_audit row { requested_at, doctor_id, reason }.
// 3. Push patient consent modal via Realtime broadcast.
// 4. Start 60s server-side timeout.

export async function patientResponseToEscalation(input: {
  requestId: string;
  patientId: string;
  decision: 'allow' | 'decline';
}): Promise<void>;
// 1. Update video_escalation_audit row { responded_at, patient_response: decision }.
// 2. If decision = 'allow': call recordingTrackService.escalateToFullVideoRecording().
//    Emit system message: "Video recording started at HH:MM by Dr. Sharma."
// 3. If decision = 'decline' or timeout: leave audio-only path. Emit doctor banner with reason.

export async function patientRevokeVideoMidCall(input: {
  sessionId: string;
  patientId: string;
}): Promise<void>;
// 1. Call recordingTrackService.revertToAudioOnlyRecording({ reason: 'patient_revoked' }).
// 2. Insert consultation_recording_audit { action: 'patient_revoked_video_mid_session' }.
// 3. Emit system message: "Patient stopped video recording at HH:MM."
```

### Task 44 — `video-replay-otp-service.ts`

```ts
// backend/src/services/video-replay-otp-service.ts (NEW)

export async function isVideoOtpRequired(input: {
  patientId: string;
}): Promise<boolean>;
// Read video_otp_window WHERE user_id = patientId.
// Return TRUE if last_otp_verified_at is NULL or > 30 days ago. Else FALSE.

export async function sendVideoReplayOtp(input: {
  patientId: string;
  phone: string;
}): Promise<{ otpId: string }>;
// Sends 6-digit code via existing twilio-sms-service.ts.

export async function verifyVideoReplayOtp(input: {
  otpId: string;
  code:  string;
}): Promise<void>;
// On success: UPSERT video_otp_window { user_id, last_otp_verified_at = now() }.
// Lasts 30 days from verification.
```

### Migration (Task 45)

```sql
-- Extend recording_access_audit
ALTER TYPE access_type AS ENUM ('audio_only', 'full_video');     -- create the type if not exists

ALTER TABLE recording_access_audit
  ADD COLUMN access_type access_type NOT NULL DEFAULT 'audio_only';

-- Track 30-day OTP skip-window
CREATE TABLE video_otp_window (
  user_id              UUID PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  last_otp_verified_at TIMESTAMPTZ NOT NULL
);

-- Track video escalation requests for audit + abuse-detection
CREATE TABLE video_escalation_audit (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
  doctor_id           UUID NOT NULL REFERENCES doctors(id),
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason              TEXT NOT NULL,
  patient_response    TEXT,                          -- 'allow' | 'decline' | 'timeout' (NULL while pending)
  responded_at        TIMESTAMPTZ
);
```

---

## Frontend deliverables

### Task 40 — `<VideoEscalationButton>`

- Button in `<VideoRoom>` controls bar: `[🎥+ Start video recording]`
- Click → modal:
  - Header: "Start video recording"
  - Body: "Patient will be asked to consent. Tell them why you need to record video."
  - Preset reasons (radio): "Need to see visible symptom" / "Need to document procedure" / "Patient request" / "Other (elaborate)"
  - Free-text field (≥5 chars, ≤200 chars), required if "Other" selected
  - CTAs: `[Cancel]` `[Send request]`
- On submit → calls `recording-escalation-service.ts#requestVideoEscalation()`
- Doctor sees waiting indicator + 60s countdown
- On patient decline / timeout → banner with reason; "Try again in 5 min" button (disabled until cooldown passes)

### Task 41 — `<VideoConsentModal>`

- Full-screen modal pushed via Realtime broadcast
- Header: "Dr. Sharma is requesting to record video for this consult"
- Body: doctor's reason; 60s countdown timer prominently displayed
- CTAs: `[Decline]` `[Allow]`
- On 60s timeout: auto-decline + close
- Cannot be dismissed by tap-outside (must explicit choose)

### Task 42 — `<VideoRecordingIndicator>`

- Persistent overlay (top-right of `<VideoRoom>`): "🔴 Recording video"
- Visible to **both** doctor and patient
- Patient view: includes a small "Stop" link next to it
- Click "Stop" → confirmation tooltip "Stop video recording? Audio will continue." → confirm → calls `recording-escalation-service.ts#patientRevokeVideoMidCall()`

### Task 44 — `<RecordingReplayPlayer>` extension

```
Plan 07's audio-only-baseline player extended:

  ┌──────────────────────────────────────┐
  │ Replay: Consult on 2026-04-19         │
  │ Watermark: Confidential — for personal │
  │           medical use only             │
  ├──────────────────────────────────────┤
  │                                       │
  │   ▶ audio waveform (default)          │
  │                                       │
  │   ┌──────────────────────────────┐    │
  │   │ [ ] Show video                │    │
  │   └──────────────────────────────┘    │
  │       ↑ visible only when video       │
  │         compositions exist for this   │
  │         session                       │
  │                                       │
  │   playback controls                   │
  └──────────────────────────────────────┘

Click "Show video":
  → warning modal:
      "This will show video footage of you and the doctor.
       Make sure no one else is around.
       Video access is logged and the doctor will be notified."
      [Cancel] [Show video]
  → if isVideoOtpRequired → SMS OTP entry modal
                          → on verify → reload player with video stream
                          → video access logged with access_type='full_video'
                          → mutual notification fires with 🎥 indicator
  → if NOT isVideoOtpRequired → reload player with video stream
                              → audit + notification fire same as above
```

---

## DM copy extensions

`backend/src/utils/dm-copy.ts`:

```ts
// EXISTING (from Plan 07): buildRecordingReplayedNotificationDm({ artifactType: 'audio' | 'transcript' })
// 
// EXTEND to handle 'video':
//   "Dr. Sharma reviewed the 🎥 video of your consult on {date}.
//    This is normal and audited. View access history: {auditUrl}"
//
// (Audio variant stays as-is; the difference is the 🎥 emoji + the word 'video')

// Also, on patient decline + doctor sees this in their dashboard banner:
//   "Patient declined video recording. Reason given: {reason if provided}.
//    You can request again once after 5 min."
```

---

## Files expected to touch

**Backend:**

- DB migration: `access_type` enum + column on `recording_access_audit` + new `video_otp_window` + new `video_escalation_audit` (Migration ~025 or next free) — Task 45
- `backend/src/services/recording-track-service.ts` (**new** — Task 43, Twilio Recording Rules wrapper)
- `backend/src/services/recording-escalation-service.ts` (**new** — Task 41 server-side flow)
- `backend/src/services/video-replay-otp-service.ts` (**new** — Task 44 backend)
- `backend/src/services/recording-access-service.ts` (**extend** Plan 07's service to write `access_type` and select audio-vs-video Composition)
- `backend/src/services/notification-service.ts` (**extend** with video variant of replay notification)
- `backend/src/utils/dm-copy.ts` (**extend** with video copy variants + 🎥 indicator)
- `backend/src/services/consultation-message-service.ts` (**extend** Plan 06's emitter with `video_recording_started` + `video_recording_stopped` system events)

**Frontend:**

- `frontend/components/consultation/VideoEscalationButton.tsx` (**new** — Task 40)
- `frontend/components/consultation/VideoConsentModal.tsx` (**new** — Task 41)
- `frontend/components/consultation/VideoRecordingIndicator.tsx` (**new** — Task 42; for both parties)
- `frontend/components/consultation/RecordingReplayPlayer.tsx` (**extend** Plan 07's player with "Show video" toggle + warning modal + OTP prompt — Task 44)
- `frontend/components/consultation/VideoRoom.tsx` (**extend** Plan 06's video room with the new escalation button + indicator overlay)

**Tests:**

- `backend/tests/unit/services/recording-track-service.test.ts` — Twilio API mock, audio→video transition + revert
- `backend/tests/unit/services/recording-escalation-service.test.ts` — rate limit, 60s timeout simulation, allow/decline branches
- `backend/tests/unit/services/video-replay-otp-service.test.ts` — 30-day window arithmetic
- `backend/tests/integration/video-escalation-end-to-end.test.ts` — doctor request → patient consent modal → allow → recording transition → patient revoke → revert
- `frontend/__tests__/components/consultation/VideoConsentModal-timeout.test.tsx` — 60s decline simulation
- `frontend/__tests__/components/consultation/RecordingReplayPlayer-video-toggle.test.tsx`

---

## Acceptance criteria

- [ ] **Task 45:** Migration applies forward + reverse; existing `recording_access_audit` rows get `access_type='audio_only'` default safely.
- [x] **Task 43** (2026-04-19): Twilio Recording Rules API wrapper (`backend/src/services/recording-track-service.ts`) transitions audio-only ↔ audio+video at the same room SID with an idempotent, stateful adapter (`twilio-recording-rules.ts` mode-level helpers); full unit coverage of the state machine + actor resolution + 60s artifact cache; Migration 071 extends the ENUM additively. Twilio sandbox integration deferred to Plan 08 end-to-end harness (planned alongside Task 41). Failures emit a structured `logger.error` + a `failed` ledger row — alerting-pipe wiring is a Plan 2.x follow-up captured in `docs/capture/inbox.md`.
- [x] **Task 40** (2026-04-19 — frontend-only, Task 41 server pending): Doctor `<VideoEscalationButton>` + co-located reason-capture modal + waiting / declined / timedout stages shipped. Five-variant button (idle / loading / requesting / cooldown / locked:max_attempts); hides itself on `locked:already_recording_video` so Task 42's indicator will take the real estate. Client-side 5..200 char validation mirrors Migration 070's CHECK. State FSM (`useVideoEscalationState`) owns the initial GET fetch, 1Hz wall-clock countdown ticker, and a single Supabase Postgres-changes subscription on `video_escalation_audit` (replaces the spec's three-channel plan — simpler and doesn't require Task 41 to broadcast). `VideoRoom.tsx` extended to mount the button adjacent to `<RecordingControls>`. Divergences from spec (no `currentRecordingRule` prop cascade; `doctorId` resolved internally; co-located modal file) documented in task-40 implementation log. Graceful degradation until Task 41 ships: GET fallback is idle, POST surfaces "Couldn't send the request" inline error.
- [x] **Task 41** (2026-04-19 — in review, awaiting legal + unit-test pass): Patient `<VideoConsentModal>` renders full-screen; Escape + outside-tap intentionally non-dismissive (Decision 10). `recording-escalation-service.ts` ships three public functions — `requestVideoEscalation` (rate-limited: max 2/consult, 5-min cooldown, no-stacking), `patientResponseToEscalation` (atomic UPDATE race-guard against timeout worker; one-retry Twilio flip with `twilio_error_code` stamped on persistent failure via Migration 072), `getVideoEscalationStateForSession`. 60s timeout is DB-durable: `video-escalation-timeout-worker.ts` polls every 5s via `/cron/video-escalation-timeout` (atomic `UPDATE ... WHERE patient_response IS NULL AND requested_at <= now() - 60s`). Patient Realtime uses direct Supabase Postgres-changes on `video_escalation_audit` (RLS-scoped per migration 070) — no backend Broadcast wiring. `consultation-message-service` `SystemEvent` union gains `video_recording_failed_to_start` (visible; surfaces when Twilio flip fails after retry) + `video_escalation_declined`/`video_escalation_timed_out` (emitter reserved, v1 hides from chat per task-41 Note #3 — decline stays private-to-doctor). Controllers map domain errors → 429/409/403/400 HTTP; cooldown `availableAt` surfaces in `meta` (frontend reads both `error.availableAt` + `meta.availableAt` for forward-compat). `VideoRoom.tsx` mounts the modal unconditionally; modal self-gates on `enabled={recordingRole === 'patient'}`. Unit + integration test pass, legal review, cron scheduler wiring, and doctor display-name on the modal are follow-ups captured in `docs/capture/inbox.md`.
- [x] **Task 42** (2026-04-19 — Decision 10 mid-call safety-valve shipped): `<VideoRecordingIndicator>` overlay pill mounts top-right of the video grid in `<VideoRoom>` for both doctor and patient; label "🔴 Recording video" with SVG red dot + 2s pulse animation (suppressed under `prefers-reduced-motion`) + `role="status"` + `aria-live="polite"`. Patient variant shows a trailing `[Stop]` button that opens an inline `RevokeConfirmTooltip` ("Stop video recording? Audio continues.") — small popover (NOT a modal), dismissible via Escape / outside-click / `[Cancel]`; `[Yes, stop]` calls the new patient-scoped REST client `revokeVideoRecording(token, sessionId)` → `POST /api/v1/consultation/:sessionId/video-escalation/revoke`. Backend: new `recording-escalation-service.ts#patientRevokeVideoMidCall` — authZ check (caller = session patient), idempotent no-op when already `audio_only`, atomic `UPDATE video_escalation_audit SET revoked_at = now() WHERE id = $head AND revoked_at IS NULL` to race-proof double-taps, delegates to Task 43's `revertToAudioOnlyRecording({ reason: 'patient_revoked', initiatedBy: 'patient' })`, writes `consultation_recording_audit { action: 'patient_revoked_video_mid_session' }`, emits `video_recording_stopped` system message (both parties see it in the companion chat), writes `doctor_dashboard_events { event_kind: 'patient_revoked_video_mid_session' }` with graceful degradation if the constraint isn't yet widened. Migration 073 adds `video_escalation_audit.revoked_at` + `revoke_reason` + 3 CHECK constraints (shape, reason-domain, revoke-requires-allow) AND widens `doctor_dashboard_events.event_kind` CHECK to include `patient_revoked_video_mid_session`. State-machine coordination: `deriveState` (backend + `useVideoEscalationState` frontend) treats `allow` rows with `revoked_at !== null` as terminal — feeds the cooldown + rate-limit the same as a `decline`/`timeout` (a revoked attempt still counts as one of the 2 per-consult slots; 5-min cooldown runs from the original `requested_at`). This means Realtime UPDATE on `revoked_at` alone drives: (a) doctor's `<VideoEscalationButton>` (Task 40) back to `cooldown`/`idle`/`locked:max_attempts`, (b) indicator fade-out on both sides within ~500ms, (c) doctor dashboard event bell lights up via Task 30's feed. `dashboard-events-service.ts` gains `PatientRevokedVideoMidSessionPayload` + widened `DashboardEventKind` union. `consultation-message-service.ts` gains `emitVideoRecordingStopped` helper. No cross-role RLS changes needed — the patient already had SELECT on `video_escalation_audit` via Migration 070's participant policy, so the Postgres-changes subscription works symmetrically for both roles, and the indicator's `isActive` derives from the same hook the doctor button uses. Unit + integration tests deferred with the rest of the Plan 08 test-harness follow-up in `docs/capture/inbox.md`. Verification: backend + frontend `tsc --noEmit` clean; ESLint clean on all touched files. Frontend tests deferred per the existing harness-bootstrap note.
- [ ] **Task 42 (follow-ups):** see inbox — (a) unit + integration tests for `patientRevokeVideoMidCall` (authZ, idempotent, happy path, Twilio failure, missing `doctor_dashboard_events` table), (b) frontend component tests for `<VideoRecordingIndicator>` + `RevokeConfirmTooltip`, (c) payload enrichment for `consult_started_at` (passed as `null` in v1 to avoid an extra session fetch).
- [x] **Task 44** (2026-04-19 — code-complete, tests follow-up): `<RecordingReplayPlayer>` defaults to audio even when video Compositions exist; "Show video" toggle is gated by `ReplayStatusData.hasVideo` (populated from `getRecordingArtifactsForSession` via `getReplayAvailability`). Warning modal (`VideoReplayWarningModal`) is mandatory before toggling; on confirm the player preflights `isVideoOtpRequired` and either mints the video URL directly (inside 30-day window) or opens `VideoReplayOtpModal` for an SMS OTP challenge. Backend: new `video-replay-otp-service.ts` (`isVideoOtpRequired` / `sendVideoReplayOtp` / `verifyVideoReplayOtp`) with SHA-256+per-row-salt hashing, 5-min expiry, 3-sends/hour rate-limit (429 `retry_after_seconds`), 5-attempts/OTP lockout, fail-closed lookups; Migration 074 adds `video_replay_otp_attempts` (service-role-only RLS) AND widens `doctor_dashboard_events.event_kind` CHECK to include `'patient_replayed_video'`. `recording-access-service.ts#mintReplayUrl` now takes `artifactKind: 'audio' | 'video'`, adds a patient-only Stage 3.5 OTP gate (throws `VideoOtpRequiredError { lastVerifiedAt }` — NO denial audit, it's a UX gate), writes `access_type='full_video'` on success, and fires `notifyReplayWatcher({ artifactKind: 'video' })` on mint. Three new HTTP routes (`/video-replay-otp/state` GET + `/send` + `/verify` POST) plus the existing `/replay/audio/mint` grew `?artifactKind=` query. Errors: `403 video_otp_required { details.lastVerifiedAt }`, `404 no_video_artifact`, `409 already_verified`, `429 rate_limited`, `502 sms_unavailable`, `403 no_patient_phone_on_file`. TTL re-mint preserves the active mode (silent audio-fallback on re-mint would be invisible surveillance exposure). Doctor callers skip the OTP gate server-side but still see the warning modal. Type-check + ESLint clean on both sides. Unit + integration tests + observability metrics deferred to a follow-up (tracked in `docs/capture/inbox.md`).
- [x] **Task 44 — mutual-notification variants** (2026-04-19): `notification-service.ts` routes `artifactType: 'video'` to `event_kind: 'patient_replayed_video'` in `doctor_dashboard_events`; `dm-copy.ts` prepends `🎥 ` to the first line of the DM body for video replays; audio + transcript DMs remain unchanged. `dashboard-events-service.ts` `DashboardEventKind` + `PatientReplayedRecordingPayload.artifact_type` widened to include `'video'`.
- [ ] No regression on Plans 01–07.

---

## Open questions / decisions for during implementation

1. **What if patient closes the consent modal browser tab?** Server-side 60s timeout still fires → counts as decline. Recommendation: yes, the timeout is the source of truth.
2. **Should doctor-initiated re-request cooldown be persisted across page reloads?** Yes — backed by `video_escalation_audit.requested_at` rows.
3. **Patient revoke: instant vs confirm?** Decision 10 LOCKED says revoke is patient-initiated mid-call. Recommendation: small confirm tooltip ("Stop video recording? Audio continues.") with one-tap cancel — friction enough to prevent accidental clicks but not a big modal.
4. **Combined audio+video pause:** Decision 10 LOCKED uses combined pause for v1 (separate audio-pause + video-pause is overkill). Plan 07's `recording-pause-service.ts` pauses both tracks; this plan inherits.
5. **Video Composition naming:** suggestion `consult_{session_id}_video_{escalation_started_at}.mp4`. Document in the task file.
6. **What if Twilio API call fails during escalation?** Patient already consented. Recommendation: retry once, then fail with system message "Video recording could not start. Continuing audio-only." → audit row, doctor banner.

---

## Non-goals

- No specialty-aware defaults (e.g. "derm always-video / general always-audio"). Decision 10 LOCKED defers to v2.
- No patient-visible access history page (a "who watched my recording when" page). Decision 10 LOCKED defers to v1.1.
- No snapshots-when-declined. Decision 10 LOCKED — explicitly never store single-frame video on decline.
- No screen-share recording (separate problem; out of scope).

---

## References

- **Master plan:** [plan-multi-modality-consultations.md](./plan-multi-modality-consultations.md) — Decision 10 LOCKED entry has the full reasoning.
- **Plan 02:** `consultation_recording_audit` enum already includes `patient_revoked_video_mid_session`.
- **Plan 06:** `emitSystemMessage()` for video-recording-started/stopped events.
- **Plan 07:** `<RecordingReplayPlayer>` baseline + `recording-access-service.ts` that this plan extends.
- **Twilio Video Recording Rules API:** verify exact endpoint shape at PR-time.

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Drafted; ready for owner review. Hard-blocks on Plans 02 + 06 + 07. Owner-confirmed legal review of patient-revoke + OTP flow recommended before merge.
