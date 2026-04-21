# Task 41: Patient `<VideoConsentModal>` + `recording-escalation-service.ts` + 60s server timeout + rate-limited re-request (Decision 10 LOCKED · **highest-risk server flow**)

## 19 April 2026 — Plan [Video recording escalation](../Plans/plan-08-video-recording-escalation.md) — Phase B

---

## Task overview

Decision 10 LOCKED the patient-consent branch of the video-escalation flow: on every doctor-initiated request, the patient sees a **full-screen modal** with the doctor's reason, a 60-second countdown, and exactly two CTAs (`[Decline]` / `[Allow]`). No dismiss-on-outside-tap, no close-button. The 60s countdown is **server-driven** — the patient's browser tab closing / refreshing / losing network does not cancel the timer; it fires as a `'timeout'` response on the backend per open question #1.

This task ships three coordinated deliverables:

1. **`<VideoConsentModal>`** — patient-side full-screen modal UI.
2. **`recording-escalation-service.ts`** — backend service that owns the request / consent / timeout / rate-limit state machine and writes to `video_escalation_audit`.
3. **HTTP + Realtime wiring** — `POST /consultation-sessions/:id/video-escalation/request` (doctor), `POST /video-escalation-requests/:requestId/respond` (patient), `GET /consultation-sessions/:id/video-escalation-state` (both), and two Supabase Realtime channels (`escalation:${requestId}` for state transitions, `consultation-sessions:${sessionId}:recording_rule` for rule-change broadcasts to Task 40 + Task 42 UIs).

This is the **highest-risk server task in Plan 08** because the failure modes directly leak PHI:

- **Failure mode A — consent bypass.** If the 60s timeout logic is buggy and `escalateToFullVideoRecording` fires before patient responds, video is recorded without consent. This is a **legal / regulatory catastrophe**.
- **Failure mode B — silent consent loss.** If the Realtime channel delivers the `'allow'` event but the server didn't persist the response, the Twilio rule flip may or may not fire depending on timing; the patient thinks they consented, the recording doesn't start, the audit row says `'pending'`.
- **Failure mode C — rate-limit bypass.** If the rate-limit check is naively implemented (in-memory map), a server restart resets the counter; a doctor could escalate 10 times by riding the restart.

Each failure mode has a mitigation in the acceptance criteria below.

**Estimated time:** ~4 hours (above the plan's 3h estimate — the server-side 60s timer needs a persistence strategy, the Realtime channel wiring, the three-endpoint HTTP surface, the security-critical branching, and the retry-on-Twilio-failure path).

**Status:** In review — implementation complete 2026-04-19.

**Depends on:**

- Task 45 (hard — `video_escalation_audit` table).
- Task 43 (hard — `recording-track-service.ts#escalateToFullVideoRecording`).
- Plan 06 Task 37 (hard — `emitSystemMessage` with `video_recording_started` + `video_recording_stopped` + `video_recording_failed_to_start` system events).
- Plan 02 Task 29 (hard — audit tables via the ledger).
- Plan 06 Task 38 (soft — `<VideoRoom>` layout; the consent modal mounts in the patient's video-room tree).

**Plan:** [plan-08-video-recording-escalation.md](../Plans/plan-08-video-recording-escalation.md)

---

## Acceptance criteria

### Backend — `recording-escalation-service.ts`

- [ ] **`backend/src/services/recording-escalation-service.ts`** (NEW) exporting three functions:
  ```ts
  export async function requestVideoEscalation(input: {
    sessionId: string;
    doctorId: string;
    reason: string;                                // 5..200 chars
    presetReasonCode: 'visible_symptom' | 'document_procedure' | 'patient_request' | 'other';
  }): Promise<{
    requestId: string;
    expiresAt: string;        // ISO timestamp, 60s in the future
    remainingAttempts: 0 | 1; // after this request is counted
  }>;

  export async function patientResponseToEscalation(input: {
    requestId: string;
    patientId: string;
    decision: 'allow' | 'decline';
  }): Promise<{
    accepted: boolean;                             // false if request already timed out / already responded
    reason?: 'already_responded' | 'already_timed_out' | 'not_a_participant';
  }>;

  export async function getVideoEscalationStateForSession(input: {
    sessionId: string;
  }): Promise<{
    state:
      | { kind: 'idle'; remainingAttempts: 2 }
      | { kind: 'pending'; requestId: string; expiresAt: string; remainingAttempts: 1 | 0 }
      | { kind: 'cooldown'; availableAt: string; remainingAttempts: 1 }
      | { kind: 'locked'; reason: 'max_attempts' | 'already_recording_video'; remainingAttempts: 0 };
    recent: Array<{ requestId: string; requestedAt: string; patientResponse: 'allow' | 'decline' | 'timeout' | null }>;
  }>;
  ```

### `requestVideoEscalation` — step-by-step policy

- [ ] **Step 1 — authZ check.** Doctor must be the assigned doctor for `sessionId`. Reject with `ForbiddenError` otherwise.
- [ ] **Step 2 — session state check.** Session must be `status = 'in_progress'`. Reject with `SessionNotActiveError` for any other status.
- [ ] **Step 3 — already-recording-video check.** `recordingTrackService.getCurrentRecordingRules(roomSid)` returns `audio_and_video` → reject with `AlreadyRecordingVideoError`. Doctor UI should already prevent this but the server must too.
- [ ] **Step 4 — rate-limit check.** Query `video_escalation_audit WHERE session_id = ? ORDER BY requested_at DESC LIMIT 2`. Apply:
  - If 2 rows exist (regardless of response): reject with `MaxAttemptsReachedError`.
  - If 1 row with `patient_response IN ('decline', 'timeout')` AND `requested_at > now() - interval '5 min'`: reject with `CooldownInProgressError` + `availableAt = requested_at + 5 min` (surfaced to the caller).
  - If 1 row with `patient_response IS NULL` AND `requested_at > now() - interval '60 seconds'`: reject with `PendingRequestExistsError` (doctor already has an in-flight request; can't stack).
  - Otherwise: pass.
- [ ] **Step 5 — reason length check.** `reason.length` ∈ `[5, 200]`. Enforce in application layer in addition to the DB CHECK (fail fast with a friendly message).
- [ ] **Step 6 — insert audit row.** `INSERT INTO video_escalation_audit { session_id, doctor_id, reason, preset_reason_code, requested_at: now() }`. Capture the row's generated `id` as `requestId`.
- [ ] **Step 7 — enqueue server-side timeout.** 60s after `requested_at`, run the timeout handler: **see "Server-side timeout strategy" below for the persistence plan**.
- [ ] **Step 8 — Realtime broadcast.** Publish to channel `escalation:${requestId}` with payload `{ kind: 'requested', requestId, reason, presetReasonCode, doctorName, expiresAt }`. The patient's browser, subscribed via the consent modal, receives this and opens the modal. Publish also to channel `consultation-sessions:${sessionId}:escalation-state` so the doctor's UI (Task 40) can refresh its `pending` state.
- [ ] **Step 9 — return to caller.** `{ requestId, expiresAt, remainingAttempts }`.

### `patientResponseToEscalation` — step-by-step policy

- [ ] **Step 1 — authZ check.** `patientId` must be the patient participant on the session linked to `requestId`. Reject otherwise. Resolved via a `video_escalation_audit → consultation_sessions.patient_id` join.
- [ ] **Step 2 — race-condition guard.** Atomically:
  ```sql
  UPDATE video_escalation_audit
  SET    patient_response = ?, responded_at = now()
  WHERE  id = ?
    AND  patient_response IS NULL
    AND  requested_at > now() - interval '60 seconds'
  RETURNING *;
  ```
  - If 0 rows returned → already responded OR already timed out. Return `{ accepted: false, reason: 'already_responded' | 'already_timed_out' }`.
  - If 1 row returned → proceed.
- [ ] **Step 3 — on `'decline'`:**
  - Publish Realtime event on `escalation:${requestId}` with `{ kind: 'declined' }`.
  - Publish Realtime event on `consultation-sessions:${sessionId}:escalation-state` so doctor UI refreshes to `cooldown`.
  - Return `{ accepted: true }`.
- [ ] **Step 4 — on `'allow'`:**
  - Call `recordingTrackService.escalateToFullVideoRecording({ sessionId, roomSid, doctorId, escalationRequestId: requestId })`.
  - **Retry policy:** on Twilio failure, retry exactly once after 500ms with jittered backoff (±100ms). On second failure:
    - Emit `emitSystemMessage({ event: 'video_recording_failed_to_start', ... })` (new event — additive to Plan 06 Task 37's `SystemEvent` union; this task extends it; see "`SystemEvent` union extensions" below).
    - `UPDATE video_escalation_audit SET twilio_error_code = ?` (additive column — see "Additive migration bundled" below).
    - Return `{ accepted: true }` (the patient's consent is recorded; the fact that Twilio failed is a separate server-side problem surfaced via the system message + doctor dashboard event).
  - On success:
    - Emit `emitSystemMessage({ event: 'video_recording_started', by: 'doctor', at: now() })`.
    - Publish Realtime event on `consultation-sessions:${sessionId}:recording_rule` with `{ current: 'audio_and_video' }` so Task 40's button locks + Task 42's indicator appears.
    - Publish Realtime event on `escalation:${requestId}` with `{ kind: 'allowed' }`.
  - Return `{ accepted: true }`.

### Server-side timeout strategy (**critical — failure mode A mitigation**)

- [ ] **Primary strategy: database-backed polling worker.** A scheduled worker (runs every 5s) queries:
  ```sql
  SELECT id, session_id
  FROM   video_escalation_audit
  WHERE  patient_response IS NULL
    AND  requested_at < now() - interval '60 seconds';
  ```
  For each row returned:
  - `UPDATE` the row setting `patient_response = 'timeout'`, `responded_at = now()` (uses the same atomic guard; if a race with patient-response just landed, the UPDATE is a no-op).
  - Publish Realtime event on `escalation:${requestId}` with `{ kind: 'timed_out' }`.
  - Publish Realtime event on `consultation-sessions:${sessionId}:escalation-state` so doctor UI refreshes.
- [ ] **Why database-polling, not `setTimeout`?** `setTimeout` lives in one Node process; a server restart / crash loses the timer and the request sits pending forever. Polling is durable, multi-pod-safe (any pod runs the worker), and survives restarts. The 5s worker granularity means timeouts fire at 60-65s — acceptable fuzz within a 60s policy. Document this trade-off in the code comment.
- [ ] **Secondary strategy: optional `setTimeout` shadow.** For responsiveness, each pod may also schedule a local `setTimeout(handleTimeout, 60_000)` that runs the same logic. It's idempotent (the atomic UPDATE guards against double-fire). This shaves the 5s polling fuzz when the originating pod is still alive. Belt-and-suspenders.
- [ ] **New file: `backend/src/workers/video-escalation-timeout-worker.ts`**. Registered in the same worker-runner that Plan 05 Task 25's transcription worker lives in (or a new runner if that hasn't landed yet; then register both together).
- [ ] **Failure mode B mitigation (silent consent loss):** every `patientResponseToEscalation` call wraps the Realtime publish in a `try/catch`; if the publish fails, the response is still persisted and the state refresh is provided via the `GET /video-escalation-state` polling endpoint that Task 40's UI calls on reconnect. Rationale: persistence > Realtime delivery. The audit is the truth; Realtime is a nicety.

### `getVideoEscalationStateForSession` — derived-state query

- [ ] Query the most recent 2 rows for the session + Twilio current recording rule; derive the UI state per the open-question #2 resolution documented in Task 40. Serves both doctor UI (Task 40) and patient UI (Task 41 modal mounts-refresh path).
- [ ] Read-only endpoint — no audit side effects. Cache on client: no.

### `SystemEvent` union extensions (coordination with Plan 06 Task 37)

- [ ] **Additive event types on Plan 06 Task 37's `SystemEvent` union:**
  - `video_recording_started` — emitted after `escalateToFullVideoRecording` succeeds. Payload: `{ by: 'doctor', at: Date, escalationRequestId: string }`.
  - `video_recording_stopped` — emitted after `revertToAudioOnlyRecording` succeeds. Payload: `{ by: 'doctor' | 'patient', reason: 'patient_revoked' | 'doctor_paused', at: Date }`. (The `'patient_revoked'` variant is written by Task 42; the `'doctor_paused'` variant comes from Plan 07 Task 28's pause path when a currently-video-recording call is paused.)
  - `video_recording_failed_to_start` — emitted after Twilio retry fails in the allow branch. Payload: `{ at: Date, escalationRequestId: string, twilioErrorCode?: string }`.
  - `video_escalation_declined` — optional, emitted on patient decline. Payload: `{ at: Date, escalationRequestId: string }`. **Decision point**: is the decline visible in the chat feed to both parties (builds trust: "patient declined, doctor saw it") or hidden (reduce patient pressure)? Resolution: **hidden in v1** — the doctor sees it via the dashboard banner (Task 40), no chat-feed system message. A chat-feed system message would create implicit social pressure to consent. Document in inbox.md as a v1.1 UX research item.
  - `video_escalation_timed_out` — **hidden**, same rationale as `video_escalation_declined`.

### Additive migration bundled (if Task 45 has shipped; else in Task 45)

- [ ] `video_escalation_audit.twilio_error_code TEXT NULL` — stores Twilio's error code on `video_recording_failed_to_start`. Added additively; no backfill needed (NULL for existing rows).
- [ ] Bundled in Task 43's `0PP_consultation_recording_audit_action_values.sql` migration (see Task 43 "Files expected to touch") as it extends recording-audit tables; or split out as `0QQ_video_escalation_audit_twilio_error_code.sql` — implementer's choice.

### HTTP endpoints

- [ ] `POST /consultation-sessions/:sessionId/video-escalation/request` — doctor-only (RLS: JWT.sub = `session.doctor_id`). Body: `{ presetReasonCode, reason }`. Returns `{ requestId, expiresAt, remainingAttempts }` on 200. Rejects with structured error codes on 4xx (doctor UI at Task 40 switches to appropriate state based on error code).
- [ ] `POST /video-escalation-requests/:requestId/respond` — patient-only (RLS: JWT.sub = `session.patient_id`). Body: `{ decision: 'allow' | 'decline' }`. Returns `{ accepted, reason? }`.
- [ ] `GET /consultation-sessions/:sessionId/video-escalation-state` — doctor OR patient participants (RLS: JWT.sub ∈ `{session.doctor_id, session.patient_id}`). Returns derived state.

### Frontend — `<VideoConsentModal>`

- [ ] **`frontend/components/consultation/VideoConsentModal.tsx`** (NEW) — full-screen modal, pushed via Realtime broadcast on `escalation:${requestId}`. Props:
  ```tsx
  interface VideoConsentModalProps {
    isOpen: boolean;
    requestId: string;
    sessionId: string;
    patientId: string;
    doctorName: string;
    reason: string;
    presetReasonCode: PresetReason;
    expiresAt: string;                // ISO timestamp from server
    onResolved?: (decision: 'allow' | 'decline' | 'timeout') => void;
  }
  ```

- [ ] **Layout — mobile-first, full-screen:**
  ```
  ┌─────────────────────────────────────────────────┐
  │                                                 │
  │   🎥                                             │
  │                                                 │
  │   Dr. Sharma is asking to record video         │
  │                                                 │
  │   Reason: "Need to see the rash on your        │
  │   forearm to document it for the follow-up."  │
  │                                                 │
  │   58 seconds to respond                        │
  │   ████████████████████████████▒▒▒▒▒            │
  │                                                 │
  │   Recording will be saved securely and only     │
  │   you and Dr. Sharma can replay it.             │
  │                                                 │
  │        [  Decline  ]      [   Allow   ]        │
  │                                                 │
  └─────────────────────────────────────────────────┘
  ```
- [ ] **Display rules:**
  - Full-screen on mobile (covers video canvas).
  - Centered dialog on desktop, backdrop dimmed at 80% opacity (NOT 100% — patient should still see they're in a consult, not think the app crashed).
  - `role="alertdialog"` + focus trap + initial focus on `[Decline]` (conservative default: easier to decline than accidentally allow).
  - `Esc` key does NOT close — matches plan requirement "cannot be dismissed by tap-outside (must explicit choose)" at line 227.
  - Tap outside does NOT close.
  - Browser back-button during mobile: swallowed; modal persists. Same rationale.
- [ ] **Countdown behaviour:**
  - Renders remaining time as "58 seconds to respond" (no am/pm confusion, no "1 minute left" rounding).
  - Updates every 1000ms.
  - At 10s: color shifts to amber; at 5s: color shifts to red.
  - At 0s: modal closes automatically (server-driven `timed_out` event arrives slightly after 0s; client-side close at 0s is the immediate UX, server event confirms and calls `onResolved('timeout')`).
- [ ] **CTAs:**
  - `[Decline]` → POST `/video-escalation-requests/:requestId/respond` with `{ decision: 'decline' }` → on 200: `onResolved('decline')` + close.
  - `[Allow]` → same endpoint with `{ decision: 'allow' }`. During POST: both CTAs disabled + "Submitting…" state. On 200: `onResolved('allow')` + close. On error: inline error "Couldn't send your response. Please try again." + keep both CTAs enabled.
- [ ] **Copy quality:**
  - Doctor's `reason` is displayed verbatim in quotes — no editorial rewriting.
  - Below the reason: one-line reassurance "Recording will be saved securely and only you and Dr. Sharma can replay it." — supports the "trust signal" doctrine for patient consent.
  - No legalese. If a patient needs a link to the privacy policy, it's not in this modal (trim surface area).
- [ ] **Accessibility:**
  - Screen reader announces "Dr. Sharma is asking to record video. Reason: <verbatim>. You have 60 seconds to respond." on open.
  - Remaining time announced every 10s (aria-live polite).
  - Buttons large enough for fat-finger (48×48 minimum on mobile).
- [ ] **Mount strategy:**
  - Subscribed to `escalation:${requestId}` channel via a top-level hook in `<PatientVideoRoomWrapper>` or similar. When a `'requested'` event arrives, the hook sets `isOpen = true` + captures the request payload.
  - Subscription persists across tab switches (companion chat tab in Plan 06 layout): even if the patient is reading chat when the request fires, the modal pops above the chat.

### Unit + integration tests

- [ ] **`backend/tests/unit/services/recording-escalation-service.test.ts`** — covers:
  - All 6 `requestVideoEscalation` policy branches (authZ / session-state / already-recording / 3× rate-limit branches / reason-length / happy path).
  - `patientResponseToEscalation` authZ + atomic-UPDATE race guard + allow / decline branches.
  - `patientResponseToEscalation` with already-responded → returns `{ accepted: false, reason: 'already_responded' }`.
  - `patientResponseToEscalation` with expired request → returns `{ accepted: false, reason: 'already_timed_out' }`.
  - `patientResponseToEscalation` allow → Twilio failure → retry → Twilio failure again → `video_recording_failed_to_start` system message emitted + row updated with `twilio_error_code`.
  - `getVideoEscalationStateForSession` all 4 state branches derived correctly.
- [ ] **`backend/tests/unit/workers/video-escalation-timeout-worker.test.ts`** — covers:
  - Pending request at 61s → worker flips to `'timeout'` + publishes Realtime event.
  - Pending request at 30s → worker leaves untouched.
  - Already-responded request → worker leaves untouched (idempotent guard).
  - Two pods running worker concurrently → only one UPDATE applies (atomic guard via the `patient_response IS NULL AND requested_at > now() - interval '60 seconds'` WHERE clause).
- [ ] **`backend/tests/integration/video-escalation-end-to-end.test.ts`** (NEW; flagged `skip` by default, runs only when `TWILIO_SANDBOX_TEST=1`):
  - Doctor calls `requestVideoEscalation`; patient calls `patientResponseToEscalation` with `'allow'`; Twilio rule flips to `audio_and_video`; system message emitted; audit rows pinned.
  - Same but patient declines → rule stays audio-only; audit row pinned as `'decline'`.
  - Same but patient ignores; worker fires after 60s → audit row pinned as `'timeout'`.
  - Doctor requests twice in a row with `'decline'` responses → second decline + cooldown enforcement.
  - Doctor requests 3rd time → `MaxAttemptsReachedError`.
- [ ] **Frontend `<VideoConsentModal>` tests** — deferred per frontend-test-harness inbox note. When bootstrapped:
  - Countdown decrements at 1s cadence.
  - Esc + tap-outside + back-button do NOT close.
  - `[Allow]` + `[Decline]` POST paths.
  - Server `'timed_out'` event closes the modal.
  - Server `'allowed'` event fired after doctor-close of waiting view from Task 40 doesn't re-open the consent modal for the patient (guard against reprocessing).

### Observability

- [ ] Every `requestVideoEscalation` call logs `{ correlationId, sessionId, doctorId, presetReasonCode, remainingAttempts }`.
- [ ] Every `patientResponseToEscalation` call logs `{ correlationId, requestId, decision, twilioRetryCount }`.
- [ ] Counter metrics:
  - `video_escalation_requests_total{preset_reason_code}`
  - `video_escalation_responses_total{decision}`
  - `video_escalation_timeouts_total{}`
  - `video_escalation_twilio_failures_total{}`
- [ ] Alert on `video_escalation_twilio_failures_total > 5 in 10min` — signals Twilio degradation; captured in inbox for Plan 2.x alerting pipeline.

### Type-check + lint clean

- [ ] Backend + frontend `tsc --noEmit` exit 0. Linters clean. Unit tests green; integration tests `describe.skip` by default.

---

## Out of scope

- **Patient-side "tell me more" affordance** on the consent modal (e.g. a link that opens a dialog explaining why the doctor might want video). v1 trusts the doctor's reason as sufficient.
- **Patient-side opt-out-forever for a doctor.** v1 — each consult is independently consented. v1.1 might add a per-doctor or per-specialty block-list.
- **Multi-language consent modal.** English only in v1. i18n is a Plan 10+ concern.
- **Custom 60s value.** The 60s window is Decision 10 LOCKED; not configurable per doctor/clinic.
- **Audio-only-was-paused-and-now-escalation edge case state-machine.** Captured in Task 43 Notes #7 and in inbox.md as an implementation-time decision. Minimally: the escalation path calls `escalateToFullVideoRecording` which in turn calls the adapter's `setRecordingRulesToAudioAndVideo` regardless of current state (adapter idempotency handles it). But the audit trail may have a stale `'paused'` row; the escalation row is appended. Open question for implementation.
- **SMS fallback for patient consent** when they're not on the app. v1 assumes the patient is in the live consultation on the same device; Decision 10 doesn't add SMS-consent. If the patient closes the app mid-request, the 60s timer fires as `'timeout'`.
- **Doctor-cancellable pending request.** Task 40 Notes #2 documented the decision not to support cancellation in v1.
- **Real-time transcription-aware escalation** (e.g. auto-suggest escalation when the patient says "I'll show you the rash"). v2+.

---

## Files expected to touch

**Backend (new):**

- `backend/src/services/recording-escalation-service.ts` — service with 3 functions.
- `backend/src/workers/video-escalation-timeout-worker.ts` — polling worker.
- `backend/src/routes/video-escalation.ts` — HTTP routes (or add to the existing consultation route file).

**Backend (extend):**

- `backend/src/services/consultation-message-service.ts` — Plan 06 Task 37's emitter gains the 3 new `SystemEvent` union variants.
- Worker runner registry (whichever file that is; likely introduced by Plan 05 Task 25 or created here).

**Frontend (new):**

- `frontend/components/consultation/VideoConsentModal.tsx` — the patient-side modal.
- `frontend/lib/realtime-video-escalation.ts` — helper hook for subscribing to `escalation:${requestId}` channels.

**Frontend (extend):**

- `frontend/components/consultation/VideoRoom.tsx` — mount `<VideoConsentModal>` for `viewerRole === 'patient'`.
- `frontend/lib/api/recording-escalation.ts` — client wrappers for `POST /respond`, `GET /state`.

**Migration:**

- `video_escalation_audit.twilio_error_code TEXT NULL` — bundled with Task 43 or Task 45 per implementer's choice.

**Tests:** all listed above.

---

## Notes / open decisions

1. **DB-polling timeout worker vs pub-sub scheduler.** DB-polling is picked because (a) it's durable across pod restarts, (b) it doesn't require new infra (Redis / BullMQ), (c) 5s granularity is acceptable for a 60s policy window. Trade-off: the worker adds a small SELECT every 5s per pod; at 100 sessions the query is trivially fast. If session count grows to 10k+, revisit with a scheduled-job infra.
2. **`setTimeout` shadow strategy.** Added as a latency optimization. Without it, a 60s timeout fires at 60–65s (worst case 1 polling interval + query latency). With it, it fires at exactly 60s in the common case where the originating pod is still alive. Both paths go through the same atomic UPDATE so double-fire is prevented. Worth the small complexity — patient-facing UX where the modal vanishes "right at 60s" vs "sometime in the next 5 seconds" feels different.
3. **Why `video_escalation_declined` system message is hidden from chat.** Decision rationale: making the decline visible in the chat applies implicit social pressure — the patient knows the doctor can see "Declined". Hiding it lets the patient exercise consent without performance anxiety. The doctor still gets the decline banner (Task 40) which is private-to-doctor. If UX research post-launch suggests otherwise, additive change.
4. **`video_recording_failed_to_start` system message is shown.** Both parties see "Video recording couldn't start due to a technical error. The call continues audio-only." — transparency about what happened to the patient's consent action. No PII; just the failure statement.
5. **Race — patient clicks Allow at 59.5s, server timeout fires at 60s.** Atomic UPDATE in Step 2 prevents double-resolve. Whichever gets the WHERE-clause row first wins. The "loser" (timeout worker, in a fast-patient scenario) returns 0 rows from its UPDATE, sees the guard failed, and does nothing. Patient's allow succeeds and triggers the Twilio flip. Unit test pins this race.
6. **Twilio retry count of exactly 1.** Why not 3? Because during the retry window the patient is waiting — the consent modal closed, they expect video recording to start. A 1s delay (500ms retry + typical latency) is acceptable; a 3-retry policy with exponential backoff could take 5-10s, which is visibly broken from the patient's side. 1 retry strikes the balance.
7. **Video Composition SID not stored in `video_escalation_audit`.** Task 43 Notes #5 resolved that the audit row stores a human-readable label; the actual Twilio Composition SID is derived at replay time via `getRecordingArtifactsForSession`. This task inherits that decision.
8. **Patient participating via the `/c/video/[sessionId]` route.** The Realtime subscription to `escalation:${requestId}` is established when the request fires (pushed by server). Alternatively the patient subscribes to a session-level channel on mount, then the per-request requestId arrives via that channel. Implementer's choice — the per-request channel scopes auth tighter, so recommend that. Document in PR.

---

## References

- **Plan:** [plan-08-video-recording-escalation.md](../Plans/plan-08-video-recording-escalation.md) — Task 41 section lines 117–149 + open questions #1, #6.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 10 LOCKED.
- **Task 40 — doctor-side counterpart UI (cooldown surface, request button):** [task-40-doctor-video-escalation-button-and-reason-modal.md](./task-40-doctor-video-escalation-button-and-reason-modal.md).
- **Task 42 — patient revoke mid-call; uses the same `recording-track-service`:** [task-42-video-recording-indicator-and-patient-revoke.md](./task-42-video-recording-indicator-and-patient-revoke.md).
- **Task 43 — Twilio wrapper this task calls:** [task-43-recording-track-service-twilio-rules-wrapper.md](./task-43-recording-track-service-twilio-rules-wrapper.md).
- **Task 45 — `video_escalation_audit` table migration:** [task-45-video-recording-audit-extensions-migration.md](./task-45-video-recording-audit-extensions-migration.md).
- **Plan 06 Task 37 — `emitSystemMessage` extended here:** [task-37-system-message-emitter.md](./task-37-system-message-emitter.md).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** In review — Plan 08's highest-risk server task. Implementation complete 2026-04-19; legal review strongly recommended before merge.

---

## Implementation log — 2026-04-19

### Backend

- **NEW** `backend/src/services/recording-escalation-service.ts` — three public
  functions (`requestVideoEscalation`, `patientResponseToEscalation`,
  `getVideoEscalationStateForSession`) + domain error classes
  (`MaxAttemptsReachedError`, `CooldownInProgressError`,
  `PendingRequestExistsError`, `AlreadyRecordingVideoError`,
  `SessionNotActiveError`). Rate-limit policy: max 2 attempts / consult,
  5-min cooldown after decline|timeout, no-stacking (reject new request
  while one is pending). Reason trimmed + 5..200 char validated server-
  side (mirrors migration 070 CHECK). Twilio rule flip runs with one
  retry on failure; persistent failure emits
  `video_recording_failed_to_start` system message + stamps
  `twilio_error_code` on the audit row.
- **NEW** `backend/src/workers/video-escalation-timeout-worker.ts` — 5s
  polling job that marks expired `pending` rows as `'timeout'` via an
  atomic `UPDATE ... WHERE patient_response IS NULL AND requested_at
  <= now() - 60s`. Returns `{ scanned, timedOut, raced, errors }`.
- **NEW** `backend/migrations/072_video_escalation_audit_twilio_error_code.sql`
  — additive `twilio_error_code TEXT NULL` column with
  `char_length <= 100` CHECK.
- **NEW** `/cron/video-escalation-timeout` POST route
  (`backend/src/routes/cron.ts`) — triggered by the 5s scheduler;
  reuses the existing `CRON_SECRET` auth + correlation-id plumbing.
- **EXT** `backend/src/services/consultation-message-service.ts` —
  `SystemEvent` union extended with `video_recording_failed_to_start`
  (visible), `video_escalation_declined` + `video_escalation_timed_out`
  (emitter reserved; v1 hides from chat per Notes #3). New async
  helpers `emitVideoRecordingStarted` + `emitVideoRecordingFailedToStart`.
- **EXT** `backend/src/controllers/consultation-controller.ts` — three
  new handlers that thread domain errors → HTTP (429 rate-limit /
  pending, 409 conflict, 403 forbidden, 400 bad input). Cooldown
  `availableAt` surfaces in the `meta` envelope via the shared
  `errorResponse` util.
- **EXT** `backend/src/routes/api/v1/consultation.ts` — registered the
  three new routes behind `authenticateToken`.

### Frontend

- **NEW** `frontend/lib/realtime-video-escalation.ts` —
  `usePatientVideoConsentRequest` hook. On mount: `GET /video-
  escalation-state` + a direct row read for `reason` +
  `preset_reason_code` (the state endpoint omits them). Mid-consult:
  Supabase Postgres-changes INSERT/UPDATE subscription scoped by
  `session_id=eq.${sessionId}`. RLS (migration 070) does the per-
  participant filtering — no backend broadcast wiring needed. Exposes
  `{ pending, loading, dismiss }`; fires `onResolved(decision)` when
  the pending row flips terminal.
- **NEW** `frontend/components/consultation/VideoConsentModal.tsx` —
  full-screen overlay (`role="dialog"` + `aria-modal`). Renders
  doctor reason verbatim (quoted), preset pill, server-synced 60s
  countdown, and `[Decline]` / `[Allow]` CTAs. On submit: POSTs to
  `/respond`, shows a brief `acknowledged` frame (1.2s for allow,
  0.4s for decline) before unmounting. If Realtime surfaces a
  `timeout` mid-view, both CTAs disable and a terminal
  "Request timed out" frame appears for 2s before close. Escape +
  outside-tap intentionally do NOT dismiss — Decision 10 requires an
  explicit choice.
- **EXT** `frontend/lib/api/recording-escalation.ts` — added
  `respondToVideoEscalation` client, `VideoEscalationDecision` +
  `RespondVideoEscalationResult` types. `BackendErrorBody` now reads
  `meta.availableAt` (our `errorResponse` helper nests extras under
  `meta`) in addition to `error.availableAt` (legacy fallback).
- **EXT** `frontend/components/consultation/VideoRoom.tsx` — mounts
  `<VideoConsentModal>` unconditionally when `recordingEnabled`; the
  modal self-gates on `enabled={recordingRole === 'patient'}` so the
  doctor tree is a no-op.

### Verification

- `cd backend && npx tsc --noEmit` → exit 0.
- `cd frontend && npx tsc --noEmit` → exit 0.
- `cd frontend && npx eslint` on touched files → exit 0.
- Unit + integration test suites from the acceptance criteria are
  deferred to a follow-up pass (see inbox.md).

### Open carryovers (captured to `docs/capture/inbox.md`)

1. Doctor display-name on the patient modal. v1 shows "Your doctor";
   upgrade to `doctors.display_name` once the doctor-directory facade
   is exposed to the patient's RLS context.
2. Cron scheduler registration (actual 5s trigger for
   `/cron/video-escalation-timeout`). Deployment-layer wiring.
3. Unit + integration tests for `recording-escalation-service`
   (rate-limit, cooldown, no-stacking, atomic UPDATE race, Twilio
   retry-and-fail path) + frontend Vitest coverage for the modal.
4. Legal review before merge (consent-flow + failure-mode copy).
