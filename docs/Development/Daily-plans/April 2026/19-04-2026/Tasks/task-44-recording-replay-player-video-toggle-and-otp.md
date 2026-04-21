# Task 44: `<RecordingReplayPlayer>` "Show video" toggle + warning modal + SMS OTP on first video-replay per 30-day rolling window (Decision 10 LOCKED)

## 19 April 2026 — Plan [Video recording escalation](../Plans/plan-08-video-recording-escalation.md) — Phase E

---

## Task overview

Decision 10 LOCKED the patient-side video-replay friction model: patient CAN replay their own consult's video footage (denying access would be paternalistic + medico-legally indefensible), BUT the path has deliberate friction proportionate to the PHI exposure risk. The friction stack is:

1. **Default to audio-only playback** even when video compositions exist for the session. Visual continuity with Plan 07 Task 29's baseline player.
2. **`[ ] Show video` toggle** visible only when video Compositions exist for this session (Task 43's `getRecordingArtifactsForSession` returns non-empty `videoCompositions`).
3. **Warning modal on toggle activation** — clear language about the artifact + the audit trail + the doctor notification. Not a legal disclaimer wall; a plain-English warning.
4. **Light SMS OTP** required on **first video replay per 30-day rolling window per patient**. Subsequent video replays within the window skip OTP. Sent via existing `twilio-sms-service.ts#sendSms`.
5. **Mutual access notification** fires with `artifactType: 'video'` variant (🎥 indicator) — Task 30's DM + Task 30's `doctor_dashboard_events` both differentiate audio vs video.

This task extends Plan 07 Task 29's `<RecordingReplayPlayer>` + Plan 07 Task 29's `recording-access-service.ts`. It is **Phase E** — ships after the Phase B in-call flow (Tasks 40/41/42/43) stabilises.

**Critical dependency gap (flagged up-front):**

- **Plan 02 Task 29 audit tables** are referenced by `recording-access-audit` writes; same hard-block as Plan 07 tasks documented.
- **Plan 07 Task 29** (`<RecordingReplayPlayer>` + `recording-access-service.ts`) must exist; this task extends — not creates — them.
- **Plan 07 Task 30** (`notification-service.ts` extensions + `doctor_dashboard_events` table) extended additively for the `'video'` artifact-type branch.
- **Plan 05 Task 25** (voice transcription pipeline) is NOT a dependency for this task — video replay is strictly audio+video playback from Twilio Compositions, not transcript-overlaid. Confirm during implementation that no cross-wiring is introduced.

**Estimated time:** ~4 hours (above the plan's 3h estimate — the OTP flow has two server endpoints + SMS send + the 30-day window state machine + the signed-URL remint-on-toggle + the warning modal + the notification branch + the access-audit extension all cumulatively push above 3h).

**Status:** Shipped 2026-04-19. Backend + frontend land in one PR; `tsc --noEmit` + ESLint clean on both sides. Unit / integration tests listed under "Acceptance criteria" are not yet in this commit (follow-up) — shipped as code-complete, test-to-follow.

**Depends on:**

- Task 45 (hard — `access_type` column + `video_otp_window` table).
- Task 43 (hard — `getRecordingArtifactsForSession` returns video Compositions).
- Plan 07 Task 29 (hard — `<RecordingReplayPlayer>` + `recording-access-service.ts#mintReplayUrl`).
- Plan 07 Task 30 (hard — `notification-service.ts` + `doctor_dashboard_events` table).
- Plan 02 Task 29 (hard — `recording_access_audit` base table).
- `backend/src/services/twilio-sms-service.ts` (present; `sendSms` exported).

**Plan:** [plan-08-video-recording-escalation.md](../Plans/plan-08-video-recording-escalation.md)

---

## Acceptance criteria

### Backend — `video-replay-otp-service.ts`

- [ ] **`backend/src/services/video-replay-otp-service.ts`** (NEW):
  ```ts
  export async function isVideoOtpRequired(input: {
    patientId: string;
  }): Promise<{ required: boolean; lastVerifiedAt: Date | null }>;
  // Reads video_otp_window WHERE patient_id = ?. 
  // Returns { required: true } if no row OR last_otp_verified_at < now() - 30 days.
  // Returns { required: false, lastVerifiedAt } otherwise.

  export async function sendVideoReplayOtp(input: {
    patientId: string;
    phone: string;                  // E.164 formatted
  }): Promise<{ otpId: string; expiresAt: Date }>;
  // Generates a 6-digit code via crypto.randomInt(100_000, 999_999).
  // INSERTs into video_replay_otp_attempts (new table — see migration below).
  // Calls twilio-sms-service.ts#sendSms with copy:
  //   "Your Clariva video replay code is 123456. Valid for 5 minutes.
  //    If you didn't request this, ignore this SMS."
  // Rate limit: max 3 sends per patient per hour; additional calls return 429 with retry_after.
  // Returns otpId (UUID) + expiresAt (5 min from now).

  export async function verifyVideoReplayOtp(input: {
    otpId: string;
    code: string;
    patientId: string;
  }): Promise<{ verified: boolean; reason?: 'expired' | 'too_many_attempts' | 'wrong_code' }>;
  // Looks up video_replay_otp_attempts row; checks expiry; checks attempt_count < 5.
  // On match: UPSERT video_otp_window { patient_id, last_otp_verified_at: now(), last_otp_verified_via: 'sms' }.
  // On mismatch: increment attempt_count; return { verified: false, reason: 'wrong_code' } or 'too_many_attempts'.
  ```

- [ ] **OTP code generation:**
  - 6-digit numeric (100000..999999).
  - `crypto.randomInt` (Node built-in) — cryptographically random, not `Math.random`.
  - Stored hashed (SHA-256 + per-row salt) in `video_replay_otp_attempts.code_hash`. Rationale: a DB breach shouldn't leak the plaintext codes (even short-lived). Salt is per-row (column) not per-app (env) — easier rotation.

- [ ] **OTP expiry: 5 minutes.** Shorter than the 30-day skip window because: the OTP is "prove presence right now"; the 30-day skip is "you recently proved presence, trust for the window". If the patient needs to re-verify, the 5-min window is ample for SMS round-trip.

- [ ] **Rate limits:**
  - `sendVideoReplayOtp`: max 3 per patient per hour. Prevents SMS bomb.
  - `verifyVideoReplayOtp`: max 5 attempts per OTP row. Locks the row on 5th wrong-attempt; patient must request a new OTP.
  - **Not rate-limiting across patients** (don't need to — each patient is independent).

- [ ] **Migration for `video_replay_otp_attempts` table** — **additive**, bundled with this task's PR:
  ```sql
  CREATE TABLE IF NOT EXISTS video_replay_otp_attempts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id        UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    code_hash         TEXT NOT NULL,
    salt              TEXT NOT NULL,
    expires_at        TIMESTAMPTZ NOT NULL,
    attempt_count     INT NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
    consumed_at       TIMESTAMPTZ,                                    -- NULL until verified
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    correlation_id    UUID
  );

  CREATE INDEX IF NOT EXISTS idx_video_replay_otp_patient_time
    ON video_replay_otp_attempts(patient_id, created_at DESC);
  -- Powers rate-limit query "SELECT count(*) FROM ... WHERE patient_id = ? AND created_at > now() - interval '1 hour'"

  ALTER TABLE video_replay_otp_attempts ENABLE ROW LEVEL SECURITY;
  -- No client-facing policies: all writes and reads are service-role-only.
  ```
  - **File location:** `backend/migrations/0QQ_video_replay_otp_attempts.sql` (sequential after Task 45's two migrations; exact number TBD at PR time).

### Backend — `recording-access-service.ts` extension (Plan 07 Task 29)

- [ ] **Extend `mintReplayUrl` to accept `artifactKind`:**
  ```ts
  export async function mintReplayUrl(input: {
    sessionId: string;
    requesterId: string;
    requesterRole: 'patient' | 'doctor';
    artifactKind: 'audio' | 'video' | 'transcript';   // 'video' is NEW in Task 44
  }): Promise<{ url: string; expiresAt: Date; compositionSid: string }>;
  ```
- [ ] **Video branch behaviour:**
  - Looks up the video Composition via `recordingTrackService.getRecordingArtifactsForSession(sessionId).videoCompositions`. If empty → `NoVideoArtifactError`.
  - Runs Plan 07 Task 29's 8-step policy pipeline (authZ / patient-window / revocation / artifact-readiness / audit-on-denial).
  - **Additional step for video:** verifies `isVideoOtpRequired({ patientId }) === { required: false }`. If required, reject with `VideoOtpRequiredError { lastVerifiedAt?: Date }`. Patient UI handles the OTP flow then retries.
  - Writes `recording_access_audit` row with `access_type = 'full_video'` (new column from Task 45).
  - Mints Twilio-signed URL, 15-min TTL (inherits Plan 07 Task 29's re-mint pattern).
- [ ] **Audio branch unchanged** from Plan 07 — writes `access_type = 'audio_only'`. Backwards-compatible default for Plan 07 callers that pass no `artifactKind`: defaults to `'audio'`.

### Backend — `notification-service.ts` extension (Plan 07 Task 30)

- [ ] **Extend `notifyDoctorOfPatientReplay` + `notifyPatientOfDoctorReplay`** to accept `artifactType: 'audio' | 'video' | 'transcript'`:
  ```ts
  export async function notifyDoctorOfPatientReplay(input: {
    sessionId: string;
    artifactType: 'audio' | 'video' | 'transcript';
  }): Promise<void>;
  // Writes doctor_dashboard_events row with event_kind:
  //   'patient_replayed_audio' | 'patient_replayed_video' | 'patient_downloaded_transcript'
  // (Extend Plan 07 Task 30's event_kind CHECK additively.)

  export async function notifyPatientOfDoctorReplay(input: {
    sessionId: string;
    artifactType: 'audio' | 'video' | 'transcript';
  }): Promise<void>;
  // Fires DM via dm-copy.ts#buildRecordingReplayedNotificationDm({ artifactType }):
  //   audio → "Dr. Sharma reviewed the audio of your consult on {date}. This is normal and audited."
  //   video → "Dr. Sharma reviewed the 🎥 video of your consult on {date}. This is normal and audited."
  //   transcript → "Dr. Sharma downloaded the transcript of your consult on {date}. This is normal and audited."
  // (Extend Plan 07 Task 30's DM copy additively.)
  ```
- [ ] **Additive migration** to `doctor_dashboard_events.event_kind` CHECK (if it's TEXT+CHECK per the Plan 07 Task 30 pattern) adds `'patient_replayed_video'`. Bundled with Task 44's PR.

### Backend — HTTP endpoints

- [ ] `POST /video-replay-otp/send` — patient-only. Body: `{ phone: string }` (validated against the patient's on-file phone — 400 if mismatch; prevents SMS-redirection abuse). Returns `{ otpId, expiresAt }`.
- [ ] `POST /video-replay-otp/verify` — patient-only. Body: `{ otpId, code }`. Returns `{ verified: boolean, reason? }`.
- [ ] `POST /video-replay-otp/state` — patient-only. Returns `{ required: boolean, lastVerifiedAt: Date | null }`. Frontend calls this on replay page mount to pre-warm the OTP flow.
- [ ] Existing `GET /recording-access/:sessionId/replay-url` endpoint from Plan 07 Task 29 grows an `artifactKind` query param.

### Frontend — `<RecordingReplayPlayer>` extension

- [ ] **`frontend/components/consultation/RecordingReplayPlayer.tsx`** (EXTEND — Plan 07 Task 29 seeds):
  - On mount: fetch `getRecordingArtifactsForSession(sessionId)` via backend proxy; derive `hasVideoArtifact = videoCompositions.length > 0`.
  - Render `[ ] Show video` checkbox below the player controls when `hasVideoArtifact === true`. Checkbox is unchecked by default.
  - Player initially loads the audio Composition (Plan 07 baseline behaviour).

- [ ] **"Show video" toggle behaviour:**
  1. Patient clicks the checkbox.
  2. Checkbox stays *unchecked* until flow completes (toggle is "pending" visually with a subtle spinner).
  3. **Warning modal `<VideoReplayWarningModal>` opens:**
     ```
     ┌────────────────────────────────────────────────┐
     │ Before you show video                          │
     ├────────────────────────────────────────────────┤
     │                                                │
     │ This will show video footage of you and the    │
     │ doctor from this consult.                      │
     │                                                │
     │ A few things to know:                          │
     │                                                │
     │   • Make sure no one else is around you.       │
     │   • Video access is logged for your records.   │
     │   • The doctor will be notified that you       │
     │     reviewed the video.                        │
     │   • Recording cannot be downloaded or shared   │
     │     from here.                                 │
     │                                                │
     │           [  Cancel  ]   [ Show video ]        │
     │                                                │
     └────────────────────────────────────────────────┘
     ```
  4. `[Cancel]` → modal closes, checkbox stays unchecked, flow ends.
  5. `[Show video]` → next step.

- [ ] **OTP gate** (if `isVideoOtpRequired({ patientId }) === true`):
  6. Modal transitions to `<VideoReplayOtpModal>`:
     ```
     ┌────────────────────────────────────────────────┐
     │ We just sent you a code                        │
     ├────────────────────────────────────────────────┤
     │                                                │
     │ For your protection, we sent a 6-digit code to │
     │ +91-98****4321. Please enter it below.         │
     │                                                │
     │   ┌───┐┌───┐┌───┐┌───┐┌───┐┌───┐                 │
     │   │   ││   ││   ││   ││   ││   │                │
     │   └───┘└───┘└───┘└───┘└───┘└───┘                 │
     │                                                │
     │ Code expires in 4:58.                          │
     │                                                │
     │ [ Resend code ] (disabled, available in 30s)   │
     │                                                │
     │           [  Cancel  ]   [  Verify  ]          │
     │                                                │
     └────────────────────────────────────────────────┘
     ```
  7. On mount: POST `/video-replay-otp/send` → receive `otpId` + `expiresAt`.
  8. 6-input digit field with auto-advance + paste-to-split-6-digits behaviour.
  9. `[Verify]` → POST `/video-replay-otp/verify` → on success, `isVideoOtpRequired` flips to false server-side; UI continues to step 10. On failure: inline error "That code didn't match. Please try again." + attempts counter.
  10. After 5 wrong attempts: OTP locked; modal shows "Too many attempts. Request a new code." with `[Request new code]`.
  11. `[Resend code]`: disabled for 30s after initial send; after cooldown, re-POST `/send`. Rate limit: 3/hr enforced by server; client shows a friendly "Too many resend attempts. Try again in X min" if server returns 429.
  12. `[Cancel]` → entire flow ends, checkbox stays unchecked.

- [ ] **Post-verify (or if OTP skipped)**: player re-fetches video URL via `GET /recording-access/:sessionId/replay-url?artifactKind=video`:
  - Success: player switches source to video Composition stream; checkbox becomes `[✓] Show video`; mutual notification fires server-side.
  - Failure: inline error "Couldn't load video replay. Please try again later." Checkbox reverts to unchecked.

- [ ] **CSS watermark extension.** The existing Plan 07 Task 29 watermark (`"Confidential — for personal medical use only"`) remains; additionally, when video is showing, an overlay displays the patient's name + the replay timestamp: `"Patient: {name} · Viewed: 2026-04-20 14:32"`. Matches the plan's ASCII layout (lines 241–243).
- [ ] **Fullscreen mode:** supported for video, watermark stays in the overlay layer (same z-order). Download controls (via `controlsList="nodownload"` on `<video>`) suppressed.
- [ ] **Switching back to audio-only mid-replay.** The `[✓] Show video` checkbox can be unchecked during playback. Unchecking:
  - Pauses + switches player source to audio Composition.
  - Does NOT re-fetch a new signed URL (the audio URL was fetched at mount time).
  - No mutual notification fires for audio-to-video toggle; audit row was already written on the video access.

### Frontend — new components

- [ ] **`frontend/components/consultation/VideoReplayWarningModal.tsx`** (NEW).
- [ ] **`frontend/components/consultation/VideoReplayOtpModal.tsx`** (NEW).
- [ ] **`frontend/lib/api/video-replay-otp.ts`** (NEW) — client wrappers around `/send`, `/verify`, `/state`.

### Unit + integration tests

- [ ] **`backend/tests/unit/services/video-replay-otp-service.test.ts`** (NEW):
  - `isVideoOtpRequired` with no row → `required: true`.
  - `isVideoOtpRequired` with row < 30 days → `required: false`.
  - `isVideoOtpRequired` with row > 30 days → `required: true`.
  - `sendVideoReplayOtp` generates 6-digit code, sends SMS, inserts row.
  - `sendVideoReplayOtp` rate-limit: 4th call in an hour → 429 with `retry_after`.
  - `verifyVideoReplayOtp` with matching code → UPSERT `video_otp_window`, mark `consumed_at`.
  - `verifyVideoReplayOtp` with wrong code → `attempt_count++`, returns `wrong_code`.
  - `verifyVideoReplayOtp` with 5th wrong attempt → locks row, returns `too_many_attempts`.
  - `verifyVideoReplayOtp` with expired OTP → returns `expired`.
  - 30-day window arithmetic with DST boundaries (OTP verified 2026-03-14 00:00:00 UTC vs replay 2026-04-13 00:00:00 UTC → just inside the window).
- [ ] **`backend/tests/unit/services/recording-access-service-video-branch.test.ts`** (NEW — extends Plan 07 Task 29's test suite):
  - Video replay with OTP NOT verified → rejects with `VideoOtpRequiredError`.
  - Video replay with OTP verified → mints URL; writes audit with `access_type='full_video'`; fires `notifyDoctorOfPatientReplay({ artifactType: 'video' })`.
  - Video replay when `videoCompositions` is empty → `NoVideoArtifactError`.
- [ ] **`backend/tests/integration/video-replay-end-to-end.test.ts`** (NEW; flagged `skip` unless `TWILIO_SANDBOX_TEST=1`):
  - Patient opens replay page → fetches state (OTP required) → clicks Show video → SMS sent → enters code → OTP verified → video URL returned → audit row pinned with `access_type='full_video'` → doctor dashboard event pinned.
  - Second replay within same hour → skips OTP (window hit) → URL returned.
  - 31 days later: same patient → OTP required again (window expired).
- [ ] **Frontend tests** — deferred per frontend-test-harness inbox note.

### Observability

- [ ] Metrics:
  - `video_replay_otp_sent_total{}`.
  - `video_replay_otp_verified_total{reason}` (reason ∈ `'verified' | 'wrong_code' | 'too_many_attempts' | 'expired'`).
  - `video_replay_access_total{access_type}` (incr on each signed URL mint).
  - `video_replay_audit_write_latency_ms` histogram.
- [ ] Structured log on every OTP send / verify / video access with `correlationId` threading.
- [ ] Alert: `video_replay_otp_verified_total{reason='too_many_attempts'} > 10 per hour` → possible credential-stuffing or abuse; inbox item for Plan 2.x alerting.

### Type-check + lint clean

- [ ] Backend + frontend `tsc --noEmit` exit 0. ESLint clean. Backend tests green.

---

## Out of scope

- **Biometric unlock as OTP alternative.** v1 is SMS only. v1.1 might add Face ID / passcode unlock for skippable-OTP on trusted devices.
- **Per-consult OTP** (OTP required every single replay). Plan's 30-day window balances friction with safety.
- **Granular per-segment video access** (e.g. "show only the last 2 minutes"). v1 streams the full Composition. Timeline scrubbing is the player's native control.
- **Download / share buttons.** v1 explicitly forbids download (watermark + `controlsList="nodownload"`). Share button absent.
- **Screen-recording detection.** Browser screen-recording can't be reliably detected; v1 doesn't attempt. CSS watermark is the deterrent.
- **Video replay on doctor's side with OTP.** Doctor's video access uses the audio-branch / doctor-authZ baseline from Plan 07 Task 29 (no OTP — doctors have separate compliance obligations + a signed-in session). Only patients get the 30-day OTP window. Document in inbox.md if Legal later wants doctor-side friction.
- **Multi-factor OTP** (email + SMS). v1 SMS only.
- **OTP skip on same-device persistence (cookie-based).** Risks DOS: steal cookie → skip OTP forever. The `video_otp_window` table is server-truth; client state is not authoritative.
- **Customisable SMS copy per clinic / brand.** v1 one canonical copy. Plan 10+ white-label concern.
- **Refactoring Plan 07 Task 29's code** beyond the `artifactKind` param addition. Keep the diff surface small.
- **Paginating `<DoctorDashboardEventFeed>` for `'patient_replayed_video'` events separately.** Task 30's feed handles all event kinds uniformly; no special UI for video events. Emoji 🎥 in the feed-item label is the sole differentiator (as per plan DM copy extensions lines 282–291).

---

## Files expected to touch

**Backend (new):**

- `backend/src/services/video-replay-otp-service.ts`.
- `backend/migrations/0QQ_video_replay_otp_attempts.sql`.
- `backend/src/routes/video-replay-otp.ts` — HTTP routes.

**Backend (extend):**

- `backend/src/services/recording-access-service.ts` — add `artifactKind: 'video'` branch + OTP gate.
- `backend/src/services/notification-service.ts` — add `artifactType: 'video'` branch.
- `backend/src/utils/dm-copy.ts` — add video copy variant per plan lines 282–291.
- Additive migration to `doctor_dashboard_events.event_kind` CHECK (if TEXT+CHECK) — `'patient_replayed_video'`.

**Frontend (new):**

- `frontend/components/consultation/VideoReplayWarningModal.tsx`.
- `frontend/components/consultation/VideoReplayOtpModal.tsx`.
- `frontend/lib/api/video-replay-otp.ts`.

**Frontend (extend):**

- `frontend/components/consultation/RecordingReplayPlayer.tsx` — "Show video" toggle + flow orchestration + watermark overlay extension.

**Tests:** listed above.

---

## Notes / open decisions

1. **OTP via SMS vs push-to-app.** v1 SMS because every patient has a phone number on file; not every patient has installed the mobile app. SMS is the universal channel. If in-app push is later prioritised, additive channel (set `last_otp_verified_via = 'push'`).
2. **Why 30 days?** Short enough to feel like meaningful re-authentication for a high-sensitivity action; long enough that the same patient repeatedly watching their consult recording isn't gated by constant OTP. Matches Decision 10's intent: "skip-able for the patient who actually wants their consult", "hard for the casual share scenario".
3. **Why OTP code length 6?** Industry default (Stripe, Auth0, Google all use 6). 4 is guessable (10k possibilities, 1k attempts ≈ 10% hit). 8 is friction without security gain.
4. **OTP delivery latency / fallback.** Twilio SMS to Indian carriers can take 5-60s worst case; SMS DLR not always reliable. UI shows the 5-min OTP expiry + a 30s resend cooldown; no explicit "your SMS may be delayed" copy but the `[Resend code]` affordance covers it.
5. **OTP code in DB is hashed, not plaintext.** `SHA-256(salt || code)` with per-row 16-byte salt. On verify: hash the submitted code with the row's salt + compare. Rationale: a DB snapshot leak must not enable anyone to replay OTPs — even 5-min-TTL codes are credentials.
6. **`sendVideoReplayOtp` uses the patient's on-file phone, not a caller-supplied phone.** Prevents a compromised session from redirecting OTPs to attacker phones. Server fetches phone from `patients` table + validates E.164 shape. Callers passing a `phone` param must match the on-file phone (400 otherwise) — belt-and-suspenders.
7. **Mutual notification timing.** The DM + dashboard event fire on **successful video URL mint**, not on video playback start. Rationale: URL mint is server-observable; playback is client-side and may never happen (patient closes the page). Mint = intent + access grant; that's the audit-worthy moment.
8. **Download-prevention cannot be perfect.** `controlsList="nodownload"` + watermark + no right-click-save are deterrents, not locks. A technically-motivated patient can still screen-record. The defence-in-depth stack is: friction (OTP) + visibility (watermark) + audit (mutual notification) + policy (patient acknowledged warning). Combined, these deter casual sharing without producing an unfair lockout.
9. **Warning modal copy — "Recording cannot be downloaded or shared from here".** Deliberately doesn't claim unshareable; says "from here". Honest about client-side limits; plain-English about the provided controls.
10. **Why video access doesn't re-run Plan 07's 8-step patient-window check in this task.** It does — `mintReplayUrl` runs the full pipeline + appends OTP gate as a 9th step. Code reads: shared pipeline + one branch check for video-specific OTP. Document inline.
11. **If the patient doesn't have a phone on file.** Edge case — shouldn't happen (phone is signup-required) but if it does, the server returns `NoPatientPhoneError`; UI shows "Please contact support to review video recordings." Absorbed in the fallback UX; no SMS attempt.
12. **Signed URL re-mint at 15-min TTL** — video URL inherits Plan 07's timer. The `[✓] Show video` state does NOT re-mint automatically; when the URL expires mid-playback, the player shows a pause overlay + a `[Continue]` button that triggers re-mint. User-initiated re-mint writes a fresh audit row (matches Plan 07's behaviour; also for video branch writes `access_type='full_video'` again so the audit trail counts re-mints).

---

## References

- **Plan:** [plan-08-video-recording-escalation.md](../Plans/plan-08-video-recording-escalation.md) — Task 44 section lines 236–271 + DM copy extensions lines 275–291.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 10 LOCKED.
- **Task 45 — `video_otp_window` + `access_type` column:** [task-45-video-recording-audit-extensions-migration.md](./task-45-video-recording-audit-extensions-migration.md).
- **Task 43 — `getRecordingArtifactsForSession` consumed here:** [task-43-recording-track-service-twilio-rules-wrapper.md](./task-43-recording-track-service-twilio-rules-wrapper.md).
- **Plan 07 Task 29 — `<RecordingReplayPlayer>` + `recording-access-service.ts` extended here:** [task-29-recording-replay-player-patient-self-serve.md](./task-29-recording-replay-player-patient-self-serve.md).
- **Plan 07 Task 30 — `notification-service.ts` + `doctor_dashboard_events` extended here:** [task-30-mutual-replay-notifications.md](./task-30-mutual-replay-notifications.md).
- **Twilio SMS service used for OTP send:** `backend/src/services/twilio-sms-service.ts#sendSms`.

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Shipped:** 2026-04-19 (code-complete; unit/integration tests follow-up).

---

## 2026-04-19 shipped changelog

Filed summary of what actually landed vs the acceptance criteria above, so the next agent opening this can skim without re-reading the whole criteria list.

**Migrations (new):**
- `backend/migrations/074_video_replay_otp_attempts_and_dashboard_event_widen.sql` — creates `video_replay_otp_attempts` (hashed OTP + per-row salt + 5-min expiry + attempt counter + single-use `consumed_at`, service-role-only RLS); widens `doctor_dashboard_events.event_kind` CHECK to include `'patient_replayed_video'`.

**Backend services (new):**
- `backend/src/services/video-replay-otp-service.ts` — `isVideoOtpRequired`, `sendVideoReplayOtp`, `verifyVideoReplayOtp` + `VideoOtpRateLimitError` + `VideoOtpSmsUnavailableError`. Per-row SHA-256(salt||code) storage, 3-sends/hour rate limit (429 `retry_after_seconds`), 5-attempts/OTP lockout, fail-closed on lookup failures, SMS-send failure rolls the row to consumed so a brute-force guess can't revive it.

**Backend services (extended):**
- `recording-access-service.ts`:
  - Widened `MintReplayErrorCode` with `'no_video_artifact'`; added `VideoOtpRequiredError { lastVerifiedAt }`.
  - Widened `ReplayArtifactKind = 'audio' | 'video'`.
  - Widened `AuditRow.artifact_kind` + added `access_type: 'audio_only' | 'full_video'` passed through to every granted + denial insert.
  - Added `resolveVideoArtifact(sessionId)` — picks first completed video composition from `getRecordingArtifactsForSession`.
  - `mintReplayUrl` now branches on `artifactKind`: Stage 3.5 calls `isVideoOtpRequired({ patientId })` for patient callers and throws `VideoOtpRequiredError` when outside the 30-day window (NO denial audit written — the OTP prompt is a UX gate, not an access decision). Video path writes `access_type='full_video'`, fires `notifyReplayWatcher({ artifactKind: 'video' })`.
  - `getReplayAvailability` now returns `hasVideo: boolean` derived from `getRecordingArtifactsForSession` (used by the player to conditionally render the toggle).
- `notification-service.ts`:
  - `notifyDoctorOfPatientReplay` now routes `artifactType: 'video'` to `event_kind: 'patient_replayed_video'` (vs the baseline `patient_replayed_recording` for audio + transcript).
  - `notifyPatientOfDoctorReplay` passes `'video'` through to `buildRecordingReplayedNotificationDm`.
- `dashboard-events-service.ts`: `DashboardEventKind` now includes `'patient_replayed_video'`; payload `artifact_type` widened to `'audio' | 'transcript' | 'video'`.
- `dm-copy.ts`: `RecordingReplayedArtifactType` now includes `'video'`; the builder prepends a `🎥 ` to the first line for video replays (audio + transcript stay plain per baseline snapshot).

**HTTP routes:**
- Extended `POST /consultation/:sessionId/replay/audio/mint` to accept `?artifactKind=audio|video` query param; path kept for back-compat. Response shape unchanged for audio; on video the caller can be denied with `403 { code: 'video_otp_required', details: { lastVerifiedAt } }` or `404 { code: 'no_video_artifact' }`.
- `GET  /consultation/:sessionId/video-replay-otp/state` — patient-only, returns `{ required, lastVerifiedAt }`.
- `POST /consultation/:sessionId/video-replay-otp/send` — patient-only. Server-resolves phone from `patients.phone` (never trusts a client-supplied recipient). Returns 201 `{ otpId, expiresAt, sent: true }` or 409 `already_verified` / 429 `rate_limited { retry_after_seconds }` / 502 `sms_unavailable` / 403 `no_patient_phone_on_file`.
- `POST /consultation/:sessionId/video-replay-otp/verify` — patient-only. Returns 200 `{ verified: true }` on match or 200 `{ verified: false, reason }` on wrong/expired/locked.
- Non-patient JWTs are rejected on all three OTP routes with 403 `forbidden_role`.

**Backend response utility:**
- `errorResponse` gained an optional `details?: Record<string, unknown>` field so the `video_otp_required` 403 can carry `{ lastVerifiedAt }` without polluting `meta`.

**Frontend (new):**
- `frontend/lib/api/video-replay-otp.ts` — `getVideoReplayOtpState`, `sendVideoReplayOtpApi` (throws `VideoReplayOtpSendError` with typed `.code` + `.retryAfterSeconds`), `verifyVideoReplayOtpApi`.
- `frontend/components/consultation/VideoReplayWarningModal.tsx` — three-bullet disclosure + focus-trap + Escape-closes; "Cancel" (secondary) + "Continue to video" (primary).
- `frontend/components/consultation/VideoReplayOtpModal.tsx` — 6-digit input (`inputMode="numeric"` + `autoComplete="one-time-code"`), 30s resend cooldown, 5-min expiry countdown, distinct states for wrong-code / expired / too-many-attempts / rate-limited / SMS-unavailable / no-phone-on-file.

**Frontend (extended):**
- `RecordingReplayPlayer.tsx`:
  - `ReplayStatusData.hasVideo` lights up the "Show video" checkbox (hidden when `false`).
  - `currentMode` phase state switches between `<audio>` and `<video>` elements without unmounting the player. Audio keeps the centered watermark; video additionally renders a bottom-right corner watermark `{callerLabel} · {timestamp}` for screen-recorded-capture attribution.
  - Toggle orchestration: Warning → (OTP-state preflight) → either direct video mint or OTP modal → video mint. On `video_otp_required` thrown by a direct mint attempt (e.g. the window just lapsed), player falls back into the OTP modal carrying the server-supplied `lastVerifiedAt`.
  - URL TTL re-mint preserves the current mode (audio stays audio, video stays video — silent mode-drop on TTL expiry would be invisible surveillance exposure).
  - Doctor callers skip the OTP gate but still see the warning modal (the backend OTP gate is patient-only per `recording-access-service`).

**Type-check + lint:** Backend + frontend `tsc --noEmit` exit 0. ESLint clean across all touched files.

**Not in this commit (follow-up):**
- Unit tests for `video-replay-otp-service` (send / verify / rate-limit / expiry / 30-day window arithmetic including DST).
- Integration test `video-replay-end-to-end` for the full flow.
- Video-branch test extension to `recording-access-service`'s suite.
- Observability metrics + alerts for `video_replay_otp_*` counters.
