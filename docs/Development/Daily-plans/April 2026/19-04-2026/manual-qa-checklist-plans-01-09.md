# Manual QA checklist — Plans 01–09

> **What this is.** A scroll-top-to-bottom, tick-as-you-go smoke + acceptance sheet covering every user-facing + operator-facing flow that landed in the `e9f711d` rollout (29 migrations, 9 plans, tasks 14–55).
>
> **How to use it.** Each section has a mini **setup** block + a **steps** checklist + an **expected result**. Tick the box when the step passes; drop a one-line note in the **Bug log** at the bottom when it doesn't. Keep the page open in a second tab while you smoke-test.
>
> **Environments.** `local-dev` (primary) + `staging` (if available). Production smoke is out of scope for this sheet.
>
> **Author:** TBD  \
> **Created:** 2026-04-22 (post-push of `e9f711d`)  \
> **Covers:** Plans 01, 02, 04, 05, 06, 07, 08, 09 (Plan 03 = doctor modality launcher doctrine; Plan 10 = deferred Clinical Assist AI)

---

## Section 0 — Pre-flight (do this first; ~15 min)

**Why:** If any of these fail, the whole sheet stalls. Don't skip.

### 0.1 Repo is green

- [ ] `git status` is clean on `main` at or after commit `e9f711d`
- [ ] `git log -1 --format='%H %s'` prints `feat(consultation): multi-modality consultation rollout (Plans 01-09)`

### 0.2 Backend boots

- [ ] `cd backend && npm install` completes without errors
- [ ] `npx tsc --noEmit` → exit 0
- [ ] `npm test` — **expected:** all non-sandbox suites pass (sandbox tests are skip-gated behind `TWILIO_SANDBOX_TEST=1` + `RAZORPAY_SANDBOX_TEST=1`; OK if ~13 tests report as skipped)
- [ ] `npm run dev` — backend listens on the configured port without unhandled promise rejections in the first 30s of logs

### 0.3 Frontend boots

- [ ] `cd frontend && npm install` completes without errors
- [ ] `npx tsc --noEmit` → exit 0
- [ ] `npx eslint . --ext .ts,.tsx --max-warnings 0` — **expected:** exit 0 on all touched files
- [ ] `npm run dev` — Next.js dev server boots; `http://localhost:3000` renders without a crash

### 0.4 Database migrations applied

- [ ] Migrations `049` through `077` are applied against the target Supabase project (or local Postgres). Quick check:
  ```sql
  SELECT MAX(version) FROM schema_migrations;  -- expect >= 077
  ```
- [ ] `SELECT COUNT(*) FROM consultation_sessions` → succeeds (no error)
- [ ] `SELECT COUNT(*) FROM consultation_modality_history` → succeeds
- [ ] `SELECT COUNT(*) FROM modality_change_pending_requests` → succeeds
- [ ] `SELECT COUNT(*) FROM consultation_messages` → succeeds
- [ ] `SELECT COUNT(*) FROM consultation_recording_audit` → succeeds
- [ ] `SELECT COUNT(*) FROM video_escalation_audit` → succeeds
- [ ] `SELECT COUNT(*) FROM doctor_dashboard_events` → succeeds
- [ ] `SELECT COUNT(*) FROM admin_payment_alerts` → succeeds
- [ ] `SELECT COUNT(*) FROM archival_history` → succeeds
- [ ] `SELECT COUNT(*) FROM regulatory_retention_policy` → succeeds and returns at least the seed rows from Migration 058

### 0.5 External service creds

- [ ] `TWILIO_ACCOUNT_SID` + `TWILIO_API_KEY_SID` + `TWILIO_API_KEY_SECRET` set in backend `.env` (sandbox is fine)
- [ ] `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` set in backend `.env` (sandbox)
- [ ] `NEXT_PUBLIC_RAZORPAY_KEY_ID` set in frontend `.env.local`
- [ ] `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_ANON_KEY` set
- [ ] Deepgram **or** OpenAI transcription key set (at least one — Plan 05 Task 25 falls back if the primary is missing)
- [ ] Meta IG webhook verify token set (Plan 02 DM copy tests rely on it)
- [ ] `CRON_SHARED_SECRET` set (workers + `/cron/*` endpoints will 401 without it)

### 0.6 Test accounts

- [ ] One **doctor** account in the DB with confirmed email + doctor profile row
- [ ] At least one **patient** account tied to that doctor (MRN-gated after first payment, per migration 046 doctrine)
- [ ] Twilio sandbox Phone verified for SMS OTP (Plan 08 Task 44 replay)
- [ ] Meta IG test page connected (Plan 02 + Plan 07 DM fan-out)

---

## Section 1 — Plan 01 · Consultation sessions facade

**What landed.** Migrations 049 + 050 + the `consultation-session-service.ts` facade that replaces the legacy `consultation-room-service` (dropped in this commit). Every modality flows through `createSession` / `startSession` / `endSession` / `fetchSessionByAppointment` now.

### 1.1 Facade CRUD round-trip (API-only)

**Setup:** Grab a doctor + patient pair's IDs; have an appointment row already booked.

- [ ] `POST /api/v1/consultation/session` with the appointment_id creates a row in `consultation_sessions` with `status='scheduled'` and `current_modality` defaulted to the appointment's modality
- [ ] `GET /api/v1/consultation/session/:id` returns the row with `status`, `modality`, `current_modality`, `upgrade_count=0`, `downgrade_count=0`
- [ ] `POST /api/v1/consultation/session/:id/start` transitions the row to `status='live'` and stamps `actual_started_at`
- [ ] `POST /api/v1/consultation/session/:id/end` transitions to `status='ended'` and stamps `actual_ended_at`
- [ ] Re-calling `/start` on an already-ended session returns a **4xx** (not 500) with a clear error message

### 1.2 Legacy column drops (Task 35)

- [ ] `SELECT column_name FROM information_schema.columns WHERE table_name='appointments' AND column_name='consultation_room_url'` returns **0 rows** (Migration 059 dropped it)
- [ ] Existing booking flow (`/book`) still completes end-to-end without referencing the dropped column — create a test booking and verify the appointment row inserts cleanly

---

## Section 2 — Plan 02 · Recording governance foundation

**What landed.** Migrations 053–058 + 064–065 + consent capture at booking + retention policy seed + archival worker.

### 2.1 Recording consent at booking (Task 27)

- [ ] Open `/book` and walk through a new booking; the **"I consent to this consult being recorded"** checkbox is visible beneath the modality selector
- [ ] Submit without ticking consent → booking succeeds **with** `appointments.recording_consent = false` (recording path will be skipped)
- [ ] Submit with consent ticked → `appointments.recording_consent = true` + `appointments.recording_consent_at` stamped
- [ ] Consent copy references **"doctor + patient both have access"** language (no patient-exclusive framing)
- [ ] Re-booking with the same patient triggers the re-pitch modal (`RecordingConsentRePitchModal`) **if** the previous appointment had `recording_consent=false`

### 2.2 Recording audit schema (Task 33)

- [ ] `SELECT * FROM consultation_recording_audit LIMIT 1` runs (table exists post-Migration 064)
- [ ] RLS: as an unauthenticated Supabase client, `SELECT` returns **0 rows** (service role bypass only)
- [ ] `SELECT * FROM recording_access_audit LIMIT 1` runs (Migration 065)

### 2.3 Retention policy seed (Task 34)

- [ ] `SELECT * FROM regulatory_retention_policy` returns ≥ 1 seed row (India-default from Migration 058)
- [ ] `SELECT * FROM archival_history LIMIT 1` runs (table exists, empty at start)

### 2.4 Archival worker dry-run

- [ ] `POST /cron/recording-archival` with the `CRON_SHARED_SECRET` header responds 200 with a JSON body containing `scanned`, `archived`, `skipped` counts
- [ ] Without the cron header → responds 401

### 2.5 Account-deletion worker (Task 33 sidecar)

- [ ] `POST /api/v1/me/account-deletion/request` (authed as a patient) → creates a deletion-pending row
- [ ] `POST /cron/account-deletion` with the cron secret → processes the pending row; patient's PII fields in `users` are scrubbed but FKs preserved (MRN retained per regulatory doctrine)
- [ ] `/data-deletion` public page renders without a crash (owner-facing deletion acknowledgment)

---

## Section 3 — Plan 04 · Text consultation (Supabase Realtime)

**What landed.** Migrations 051 + 052 + 062 + 063 + `text-session-supabase.ts` adapter + `<TextConsultRoom>` + companion-chat underpinnings.

### 3.1 Doctor → patient text session

**Setup:** Book a text-modality appointment; both parties logged in in separate browsers (or incognito tabs).

- [ ] Doctor clicks **"Start consult"** from `/dashboard/appointments/[id]`; `<ConsultationLauncher>` transitions to `<LiveConsultPanel>` with `<TextConsultRoom>` mounted
- [ ] Patient receives IG-DM (or SMS fallback) with the `/c/text/[sessionId]` link within **≤ 10s** of doctor pressing Start
- [ ] Patient opens the link; `<TextConsultRoom>` renders on their side
- [ ] Doctor sends a text message → patient sees it in **≤ 2s** (Supabase Realtime latency)
- [ ] Patient sends a text message → doctor sees it in **≤ 2s**
- [ ] Emoji + Unicode characters (`😀 中文`) render correctly on both sides
- [ ] Messages longer than the 1000-char limit are rejected at the client; the validation error is user-readable (not a raw JSON dump)

### 3.2 Attachments (Task 39)

- [ ] Doctor attaches an image (JPG ≤ 5 MB) → patient sees the image inline within 5s
- [ ] Doctor attaches a PDF → patient sees a downloadable link
- [ ] Attachment > 10 MB is rejected at the frontend with a clear error toast
- [ ] `consultation_messages` row has `attachment_storage_path` populated + `attachment_mime_type` + `attachment_size_bytes` set

### 3.3 End-session chain

- [ ] Doctor clicks **"End consult"** → `<TextConsultRoom>` transitions to a "Consult ended" surface for both parties
- [ ] `consultation_sessions.status = 'ended'` + `actual_ended_at` stamped
- [ ] Patient receives the **"consult ended, chat archive available"** DM within 10s (Plan 06 Task 36 → Plan 07 Task 31 surface)
- [ ] Doctor sending a new message in an ended session → HTTP 4xx + the input is disabled in the UI

### 3.4 RLS boundary

- [ ] Log in as a **third** user (neither the doctor nor the patient) → `SELECT * FROM consultation_messages WHERE session_id = <test session>` returns 0 rows
- [ ] Same third user hitting `GET /api/v1/consultation/:sessionId/messages` returns 403 (not 200 with empty array — the server should reject, not silently empty)

---

## Section 4 — Plan 05 · Voice consultation (Twilio)

**What landed.** Migration 061 + `voice-session-twilio.ts` adapter + `voice-transcription-service.ts` (Deepgram + OpenAI fallback) + `<VoiceConsultRoom>` with companion-chat canvas.

### 4.1 Voice session round-trip

**Setup:** Book a voice-modality appointment; two devices with mics (or two browser tabs).

- [ ] Doctor starts the consult → Twilio room is provisioned; `<VoiceConsultRoom>` mounts; local mic connects
- [ ] Patient opens the /c/voice/[sessionId] link → connects to the same Twilio room
- [ ] Audio is bidirectional: doctor speaks 3 seconds → patient hears it; patient speaks 3 seconds → doctor hears it
- [ ] **No camera** is ever requested (voice-only per Decision 4 — Principle 8)
- [ ] The session-start banner reads "Audio only, no phone call required" (Task 26 copy)

### 4.2 Companion chat during voice (Task 24c)

- [ ] Doctor sends a text message via the side-canvas while on the voice call → patient sees it immediately in their canvas
- [ ] Message history is preserved after the voice call ends (Plan 06 companion-chat persistence)

### 4.3 Transcription pipeline (Task 25)

- [ ] Ending the voice consult triggers the transcription worker within ~30s; `consultation_transcripts` row appears with `status='processing'`
- [ ] After the worker completes, `status='completed'` + `transcript_text` populated + `audio_storage_path` points to the Twilio composition
- [ ] If Deepgram creds are missing, the worker falls back to OpenAI Whisper (or logs a clear "both providers unavailable" error, not a crash)

### 4.4 Voice booking copy (Task 26)

- [ ] Meta IG DM template for voice bookings reads "audio-only consult (no phone call)" — verify in the booking-confirmation DM received by the test patient

---

## Section 5 — Plan 06 · Companion chat channel

**What landed.** `consultation-session-service.ts` auto-provisions a companion chat row on every `createSession` + `consultation-message-service.ts` central emitter with LRU dedup + mount-point in `<VideoRoom>` + `<VoiceConsultRoom>`.

### 5.1 Companion chat auto-provisions for every modality

- [ ] Text booking → companion chat exists (it IS the chat)
- [ ] Voice booking → companion chat canvas mounts on both sides (validated in §4.2)
- [ ] Video booking → companion chat panel mounts beside the video tile (§7.1 below)
- [ ] DB check: for any fresh session, `SELECT companion_channel_provisioned_at FROM consultation_sessions WHERE id = <test>` is **not null**

### 5.2 System message emitter (Task 37)

- [ ] After a consult ends, a **"Consult ended at HH:MM"** system row appears in the chat (`consultation_messages.system_event='session_ended'`)
- [ ] Emitting the same system event twice in quick succession (engineer-only: repeat the internal hook) produces **one** row (LRU dedup by correlation-id)
- [ ] System messages render visually distinct from user messages (italic + center-aligned or similar; match Plan 06 UI doctrine)

---

## Section 6 — Plan 07 · Recording replay + history + PDF

**What landed.** Migrations 066–068 + `recording-pause-service.ts` + `recording-access-service.ts` + `<RecordingReplayPlayer>` + `transcript-pdf-service.ts` + `<DashboardEventsBell>` + `<DoctorDashboardEventFeed>` + `/c/history/[sessionId]` + `/c/replay/[sessionId]`.

### 6.1 Recording pause/resume (Task 28)

- [ ] During a live voice/video consult, doctor clicks **"Pause recording"** → `<RecordingPausedIndicator>` appears for **both** parties; Twilio Recording Rules flip to paused
- [ ] Doctor clicks **"Resume recording"** → indicator clears; Rules un-pause
- [ ] `consultation_recording_audit` has rows for both `paused` + `resumed` actions with timestamps

### 6.2 Replay player (Task 29)

**Setup:** Use a recent ended session that has a `recording_artifact_url`.

- [ ] Patient opens `/c/replay/[sessionId]` → `<RecordingReplayPlayer>` renders the audio (voice) or audio+video (video) stream
- [ ] Play / pause / seek controls work without console errors
- [ ] A row appears in `recording_access_audit` with `accessor_role='patient'` and `access_type` set (see §6.4)

### 6.3 Mutual replay notifications (Task 30)

- [ ] Patient plays back a recording → doctor's `<DashboardEventsBell>` gets a new unread event within ~5s
- [ ] Bell badge count increments; clicking opens `<DoctorDashboardEventFeed>` with the replay event visible
- [ ] Doctor plays back → patient receives an IG-DM (or SMS) notification "Your doctor reviewed the consult recording"

### 6.4 Access-type audit (Task 45's `access_type` widening used here too)

- [ ] Each replay creates a row with `access_type` ∈ `{audio_replay, video_replay}`
- [ ] Filtering `recording_access_audit` by `access_type='video_replay'` returns only video sessions

### 6.5 Post-consult chat history (Task 31)

- [ ] Patient opens `/c/history/[sessionId]` after a text consult ends → `<TextConsultRoom mode='readonly'>` renders the full message history
- [ ] Message input is **not rendered** in readonly mode (defense-in-depth)
- [ ] Doctor opens `/dashboard/appointments/[id]/chat-history` → same history visible + download-transcript button

### 6.6 Transcript PDF export (Task 32)

- [ ] Doctor clicks **"Download transcript"** → a PDF downloads within ~5s
- [ ] PDF includes: doctor + patient names, session date/time, modality, full message thread (including system rows), attachments listed by filename
- [ ] Attachments themselves are NOT embedded (PDF size stays reasonable; external links may be included but images not inlined per Task 32 Decision)
- [ ] Patient clicks the same export button → identical PDF
- [ ] Unicode characters render correctly (test with one emoji + one non-Latin message)

---

## Section 7 — Plan 08 · Video recording escalation

**What landed.** Migrations 069–074 + `recording-track-service.ts` + `recording-escalation-service.ts` + `video-replay-otp-service.ts` + 60s consent timeout worker + OTP-gated video replay.

### 7.1 Video consult baseline

- [ ] Book a video-modality appointment; doctor + patient join via the video route
- [ ] Camera + mic both stream bidirectionally
- [ ] Companion chat panel mounts to the side (§5.1)
- [ ] `<VideoRecordingIndicator>` shows "Recording paused" by default (video recording is opt-in mid-consult per Decision 9)

### 7.2 Doctor-initiated video recording (Task 40 + 41)

- [ ] Doctor clicks `<VideoEscalationButton>` → `<VideoConsentModal>` (reason modal) opens
- [ ] Doctor submits a reason (e.g., "clinical documentation") → `modality_change_pending_requests` row inserted with `kind='video_recording_consent'`
- [ ] Patient's browser shows `<VideoConsentModal>` (patient-side) within 5s
- [ ] 60-second countdown visible with color shifts at 30s + 10s
- [ ] **Path A — Patient allows:** `<VideoRecordingIndicator>` flips to "Recording" (red dot) on both sides; `video_escalation_audit` row with `response='allowed'`
- [ ] **Path B — Patient declines:** recording stays paused; doctor sees "Patient declined recording" toast; `video_escalation_audit` row with `response='declined'`
- [ ] **Path C — Patient times out:** at 60s the modal auto-closes; `video_escalation_audit` row with `response='timeout'` (via the cron/timeout worker)

### 7.3 Patient revoke mid-recording (Task 42)

- [ ] After Path A succeeds, patient clicks the revoke button inside `<VideoRecordingIndicator>` → recording pauses within ~2s
- [ ] `video_escalation_audit` row has `revoked_at` stamped

### 7.4 OTP-gated video replay (Task 44)

- [ ] After the consult ends, patient navigates to the replay link → `<VideoReplayWarningModal>` appears first (legal disclosure)
- [ ] Patient clicks "Continue" → `<VideoReplayOtpModal>` appears; SMS OTP is sent to the phone on file
- [ ] Enter the correct OTP → video replay loads
- [ ] Enter a wrong OTP 3 times → 30-day lockout banner appears; `video_replay_otp_attempts` row shows `blocked_until`
- [ ] OTP can be skipped via a 30-day "trust this device" flag — verify the cookie persists on the second replay attempt within the window

### 7.5 Timeout worker

- [ ] Manually insert a `modality_change_pending_requests` row with `kind='video_recording_consent'` and `response=null` + `expires_at` in the past
- [ ] Call `POST /cron/video-escalation-timeout` with the cron secret → row gets stamped with `response='timeout'`

---

## Section 8 — Plan 09 · Mid-consult modality switching

**What landed.** Migrations 075–077 + `modality-change-service.ts` state machine + `modality-transition-executor.ts` (6 transitions) + `modality-billing-service.ts` (Razorpay) + 4 pending-timeout / refund-retry workers + 6 frontend modals + `<ModalityChangeLauncher>` + `<ModalityHistoryTimeline>`.

### 8.1 Launcher visibility (Task 54)

- [ ] Open a live voice consult (doctor side) → `<ModalityChangeLauncher>` trigger visible in `<LiveConsultPanel>`
- [ ] Click the trigger → popover opens with `[▲ Video …]` + `[▼ Text …]` items
- [ ] Exhaust `upgrade_count` (stub it to 1 via DB) → upgrade item grays out with tooltip "Max 1 upgrade per consult used"
- [ ] Pending request active → trigger button disables with role-specific tooltip

### 8.2 Patient-initiated upgrade — paid (Task 50 + 47 + 49)

**Setup:** Live text consult. Ensure Razorpay sandbox is live.

- [ ] Patient clicks `<ModalityChangeLauncher>` → `[▲ Voice]` → `<ModalityUpgradeRequestModal>` opens
- [ ] Patient submits optional reason → modal transitions to "Waiting for doctor…" with 90s countdown
- [ ] Doctor side: `<ModalityUpgradeApprovalModal>` opens automatically within 5s
- [ ] Doctor clicks `[Accept (charge ₹X)]` → Razorpay order created; patient side gets a `checkout_ready` event + Razorpay Checkout SDK opens
- [ ] Patient completes payment in Razorpay sandbox (use `4111 1111 1111 1111`) → payment webhook fires → state machine commits the transition
- [ ] `<VoiceConsultRoom>` mounts on both sides within 5s of payment success; text room unmounts cleanly
- [ ] System message `"Patient upgraded to Voice. Payment of ₹X processed."` appears in companion chat
- [ ] `consultation_modality_history` has a row with `billing_action='paid_upgrade'` + `amount_paise` + `razorpay_payment_id`
- [ ] `consultation_sessions.upgrade_count = 1` + `current_modality='voice'`

### 8.3 Patient-initiated upgrade — doctor declines

- [ ] Same as 8.2 up to the approval modal; doctor clicks **Decline** with a reason
- [ ] Patient modal transitions to `declined` state with the doctor's reason shown
- [ ] No row in `consultation_modality_history`; pending request stamped `response='declined'`
- [ ] No Razorpay order was created (verify in Razorpay dashboard)

### 8.4 Patient-initiated upgrade — doctor free-upgrades

- [ ] Same as 8.2; doctor clicks **Approve (free)** → no Razorpay flow; transition commits immediately
- [ ] System message reads `"Doctor approved the patient's upgrade to Voice as a free upgrade."`
- [ ] `consultation_modality_history.billing_action='free_upgrade'` + `amount_paise IS NULL`

### 8.5 Patient-initiated downgrade (Task 52)

- [ ] During a live voice consult, patient opens `<PatientDowngradeModal>` via the launcher
- [ ] "No refund will be issued" disclosure is in the primary info slot (amber panel, NOT fine print)
- [ ] Patient submits → transition commits immediately; text room mounts; voice room unmounts
- [ ] System message: `"Patient switched to Text for the remainder of the consult. No refund issued. Reason: <X>"`
- [ ] `consultation_modality_history.billing_action='no_refund_downgrade'`

### 8.6 Doctor-initiated upgrade (Task 51)

- [ ] During a live text consult, doctor opens `<DoctorUpgradeInitiationModal>` via the launcher
- [ ] Doctor submits reason → patient's `<PatientUpgradeConsentModal>` opens (full-screen, ESC disabled, 60s countdown)
- [ ] **Path A — Patient allows:** transition commits at no charge; system message `"Doctor upgraded the consult to Voice at no extra charge. Reason: <X>"`
- [ ] **Path B — Patient declines:** no transition; doctor sees "Patient declined" toast
- [ ] **Path C — Patient timeout:** at 60s, auto-stamp + no transition
- [ ] In Path A, `billing_action='free_upgrade'` with `initiated_by='doctor'`

### 8.7 Doctor-initiated downgrade (Task 51)

- [ ] Doctor opens `<ModalityDowngradeModal>` from a live voice consult → submits
- [ ] Transition applies immediately (no patient consent — per Decision 11)
- [ ] Text room mounts; system message `"Doctor downgraded the consult to Text. Patient refunded ₹X. Reason: <Y>"`
- [ ] Razorpay refund call fires in the background; verify in Razorpay dashboard
- [ ] `consultation_modality_history.billing_action='auto_refund_downgrade'`; `razorpay_refund_id` initially null, stamped after Razorpay responds

### 8.8 Refund retry worker (Task 49)

**Setup:** Simulate a Razorpay refund failure (either break the sandbox credentials temporarily, or use a captured payment ID that's already fully refunded).

- [ ] Trigger a downgrade that should refund → first attempt fails
- [ ] Within 1 minute, `POST /cron/modality-refund-retry` → row retries per the exponential ladder (1m → 5m → 15m → 1h → 6h → 24h)
- [ ] After attempt 6 (or a permanent-classification error), `refund_retry_count = 99` is stamped
- [ ] `admin_payment_alerts` row appears with `alert_kind='refund_stuck_24h'`
- [ ] System message `"Refund of ₹X could not be processed — our team has been alerted. Please contact support."` emits in companion chat
- [ ] `<ModalityHistoryTimeline>` shows the red **"Support contacted"** badge instead of the amber "Pending"

### 8.9 System messages (Task 53)

- [ ] Every transition in 8.2 through 8.7 produces exactly **one** `system_event='modality_switched'` row per commit
- [ ] Decline + timeout paths produce **zero** system messages
- [ ] Copy matches the 5-shape matrix in the Task 53 doc (paid upgrade, free upgrade × patient, free upgrade × doctor, no-refund downgrade, auto-refund downgrade)

### 8.10 Modality history timeline (Task 55)

- [ ] Ended-consult page (`/dashboard/appointments/[id]` or the patient equivalent) renders `<ModalityHistoryTimeline>` when `initialModality != currentModality || upgrade_count > 0 || downgrade_count > 0`
  - *Note: v1 defers the page-level mount; the component + endpoint are ready. If the mount isn't live yet, smoke-test via the endpoint directly:*
- [ ] `GET /api/v1/consultation/:sessionId/modality-change/history` returns `{ session, entries: [...] }` with entries ordered `occurred_at ASC`
- [ ] Calling the endpoint as a non-participant → **403 Forbidden** (not 404, not 200-empty)
- [ ] Calling the endpoint for a session with **zero** transitions → `entries: []` + `session.initialModality == currentModality`
- [ ] Refund-pending row (pre-worker) has `razorpayRefundId: null` + `refundFailedPermanent: false` in the response
- [ ] Permanent-fail row has `refundFailedPermanent: true`

### 8.11 Pending-timeout worker (Task 47)

- [ ] Insert a pending request with `expires_at` in the past + `response=null`
- [ ] Call `POST /cron/modality-pending-timeout` with the cron secret → row stamped `response='timeout'`
- [ ] Subsequent calls don't re-stamp (idempotent)

---

## Section 9 — Cross-cutting regression smoke

**Why.** Everything above touches new surfaces. This section retests the old happy paths to make sure we didn't break existing bookings / DMs / the AI catalog.

### 9.1 Booking flow (legacy path)

- [ ] IG-DM funnel: simulate a patient booking via IG DM → booking confirmation DM arrives; `appointments` row created
- [ ] `/book` page: complete a booking end-to-end → Razorpay test payment → `appointments.status='booked'`
- [ ] First-time patient gets an MRN **only** after payment (Task 046 doctrine); MRN is visible on the doctor dashboard
- [ ] Repeat patient: booking succeeds without re-minting an MRN

### 9.2 Doctor dashboard

- [ ] `/dashboard` loads without console errors
- [ ] Appointment list shows upcoming + past appointments
- [ ] Clicking an appointment → detail page renders with the new consultation actions block

### 9.3 Existing AI catalog / routing-v2

- [ ] IG DM flow: user asks about a service → AI suggests + catalog routing picks a matching service
- [ ] No regression on the examples-array suggestions (confirmed by the prior green in tasks 11/12/13)

### 9.4 Observability

- [ ] Backend `logs` surface: no repeated `UnhandledPromiseRejection` or `TypeError` spam in a 5-minute idle window
- [ ] Frontend browser console on `/dashboard`: no red errors (warnings OK)

---

## Section 10 — Known-deferred items (expected to NOT work yet)

These are captured in `docs/capture/inbox.md` and are **not** expected to pass in this smoke:

- Frontend component tests (whole app — deferred until jest + RTL harness lands)
- Live Twilio sandbox integration tests (skip-gated behind `TWILIO_SANDBOX_TEST=1`)
- Live Razorpay sandbox integration tests (skip-gated behind `RAZORPAY_SANDBOX_TEST=1`)
- Appointment-detail-page mount of `<ModalityHistoryTimeline>` (component + endpoint live; page-level mount = inbox follow-up)
- Admin dashboard UI for `admin_payment_alerts` (alert rows land; UI = inbox follow-up)
- Cron scheduler (the `/cron/*` routes work; actual scheduled invocation = inbox follow-up)
- Legal review of recording consent copy (Task 27 / 41 / 44)
- Payment Ops review of refund/capture paths (Task 49)

---

## Bug log

Record anything that fails above. Keep it terse — one line per issue.

| # | Section | Steps-to-repro (≤ 1 line) | Severity | Owner | Filed in inbox? |
|---|---------|---------------------------|----------|-------|-----------------|
| 1 |         |                           |          |       |                 |
| 2 |         |                           |          |       |                 |
| 3 |         |                           |          |       |                 |

Severity legend: **P0** = blocks merge / ship; **P1** = ship-blocker for Plan 09 GA; **P2** = fix in follow-up; **P3** = cosmetic / nice-to-have.

---

## Sign-off

- [ ] All P0 + P1 bugs from the log above are either fixed or filed with owner assignment
- [ ] Remaining bugs moved into `docs/capture/inbox.md`
- [ ] `plan-09-mid-consult-modality-switching.md`'s final two acceptance boxes flipped to `[x]`:
  - [ ] No regression on Plans 01–08
  - [ ] Backend regression suite + new tests stay green
- [ ] PR (or release tag) cut from `e9f711d` with a link to this sheet's filled-in version

**Smoke completed by:** _________________  
**Date:** _________________  
**Duration:** _____ hours  
**Environment:** `local-dev` / `staging` (circle one)
