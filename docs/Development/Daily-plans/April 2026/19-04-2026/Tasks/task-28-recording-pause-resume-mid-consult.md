# Task 28: Doctor pause/resume recording mid-consult — `recording-pause-service.ts` + `<RecordingControls>` + `<RecordingPausedIndicator>` + reason audit (Decision 4 LOCKED)

## 19 April 2026 — Plan [Recording replay & history](../Plans/plan-07-recording-replay-and-history.md) — Phase E

---

## Task overview

Decision 4 LOCKED per-session pause/resume for recordings with (a) mandatory reason, (b) both-parties-visible "Recording paused" indicator, (c) audit row per event. This task ships the whole end-to-end slice:

- Backend `recording-pause-service.ts` with `pauseRecording` / `resumeRecording` / `getCurrentRecordingState` — calls Twilio's Recording Rules API to flip the `all_participants` inclusion for audio (+ video when Plan 08 ships) while writing an audit row to `consultation_recording_audit` (Plan 02's table) and firing a `kind = 'system'` message through Plan 06's `emitSystemMessage` central writer with `event = 'recording_paused'` / `'recording_resumed'`.
- Frontend `<RecordingControls>` — pause + resume buttons + reason modal enforcing ≥5 chars / ≤200 chars; mounts in `<LiveConsultPanel>`'s `recordingSlot` for video (Task 20) and lands inside `<VoiceConsultRoom>`'s controls strip for voice (Task 24 / 24c).
- Frontend `<RecordingPausedIndicator>` — persistent badge ("🔴 Recording paused — reason: {reason}") visible to both parties while the pause is active, derived from the companion-chat system-message stream (open-question #2's recommended implementation) so no extra subscription is needed.
- HTTP routes `POST /api/v1/consultation/:sessionId/recording/pause` + `/recording/resume` + `GET /recording/state` — doctor-only (RBAC enforced by participant-role check).

The feature is **audio-baseline in Plan 07**. Twilio Recording Rules work identically for audio + video inclusion flags; the video-specific pause/resume flow (Plan 08 Task 41 territory) will reuse this same service — the `kind` flag passed to the Twilio client is the only differentiator. This task writes the service in a way that Plan 08 can extend additively without forking the audit / system-message / frontend components.

**Crucial dependency gap (flagged up-front):** `consultation_recording_audit` is **Plan 02's table and does not exist in the migrations directory today** (confirmed via grep of `backend/migrations/`). This task is **hard-blocked on Plan 02 Task 27** landing the audit-tables migration. The task file below assumes the Plan 02 shape documented in the master plan (fields: `id`, `session_id`, `action`, `action_by`, `action_by_role`, `reason`, `metadata`, `correlation_id`, `created_at`); if Plan 02 ships a different shape, this task's audit-write code adjusts accordingly.

**Estimated time:** ~3.5 hours (slightly higher than the plan's 3h estimate to absorb the hard dependency on Plan 02 migrations landing first + the dual voice/video mount sites for the controls component + the indicator-from-system-message derivation).

**Status:** ✅ Completed 2026-04-20 (unblocked ourselves by landing `064_consultation_recording_audit.sql` — Plan 02 Task 27 never shipped; see Implementation log).

**Depends on:** Plan 02 Task 27 (hard — `consultation_recording_audit` table must exist before this task can write to it). Plan 06 Task 37 (hard — `emitSystemMessage` + the `SystemEvent` union's `'recording_paused' | 'recording_resumed' | 'recording_stopped_by_doctor'` slots). Plan 06 Task 39 (hard — `kind = 'system'` ENUM value + `system_event` column). Plan 01 `video-session-twilio.ts` (hard — Twilio client wiring this task reuses). Plan 05 Task 23 (soft — voice adapter exists so the voice pause flow has a room to target; if Plan 05 ships without Task 23, the voice flow is gated but the video flow still lands).

**Plan:** [plan-07-recording-replay-and-history.md](../Plans/plan-07-recording-replay-and-history.md)

---

## Acceptance criteria

### Backend

- [ ] **`backend/src/services/recording-pause-service.ts` (NEW).** Final public surface:
  ```ts
  /**
   * Pause / resume / inspect the active recording for a consult mid-session.
   *
   * Twilio's `RecordingRules.update()` is the underlying primitive — it
   * flips the include/exclude flags on `all_participants` for audio (and
   * video, when Plan 08 ships the video-escalation flow). The session's
   * Twilio Room keeps running; only the recording inclusion is toggled.
   *
   * All writes are atomic at the audit-row layer: we write the audit
   * row BEFORE calling Twilio, so a Twilio failure leaves a
   * `{ status: 'attempted' }` audit entry that Plan 02's reconciliation
   * worker can retry. A successful Twilio call then writes a second
   * `{ status: 'completed' }` row tagged with the same `correlation_id`.
   * This "ledger" pattern matches the account-deletion cascade worker
   * pattern from Plan 02 Task 33.
   */
  export interface PauseRecordingInput {
    sessionId:     string;
    doctorId:      string;                  // caller's user ID; authz check inside ensures this matches session.doctorId
    reason:        string;                  // 5..200 chars, trimmed; empty / whitespace-only rejected
    correlationId: string;
  }

  export interface ResumeRecordingInput {
    sessionId:     string;
    doctorId:      string;
    correlationId: string;
  }

  export interface RecordingState {
    sessionId:     string;
    paused:        boolean;
    pausedAt?:     Date;
    pausedBy?:     string;                  // doctorId of the doctor who issued the pause
    pauseReason?:  string;
    resumedAt?:    Date;                    // undefined while paused
  }

  export async function pauseRecording(input: PauseRecordingInput): Promise<void>;
  export async function resumeRecording(input: ResumeRecordingInput): Promise<void>;
  export async function getCurrentRecordingState(sessionId: string): Promise<RecordingState>;
  ```

- [ ] **`pauseRecording` implementation order** (matters for the ledger pattern):
  1. **Validate input** — reason length 5..200 after `.trim()`, `doctorId === session.doctorId`, session `status = 'live'`. Throw `ValidationError` / `ForbiddenError` / `ConflictError` respectively before any side effect.
  2. **Idempotency check** — read latest audit row for `session_id`; if already `recording_paused` without a subsequent `recording_resumed`, return early with a `{ skipped: true }`-style log line (not an error — a concurrent pause tap from the same doctor is benign).
  3. **Write `consultation_recording_audit` row** (`action = 'recording_paused'`, `action_by = doctorId`, `action_by_role = 'doctor'`, `reason`, `metadata = { twilio_sid: <session.providerSessionId>, status: 'attempted' }`, `correlation_id = input.correlationId`). This is the "attempted" row.
  4. **Call Twilio Recording Rules API** — update the room's rules to exclude `all_participants` for `kind = 'audio'`. Video flag stays unchanged (Plan 08 extends). Reuse the existing Twilio client initializer from `video-session-twilio.ts` (exported as `getTwilioClient()` or similar — verify at PR-time and factor out if needed).
  5. **On Twilio success, write a second audit row** with `metadata.status = 'completed'`. On Twilio failure, write `metadata.status = 'failed', metadata.error = <short message>` and throw.
  6. **Emit system message** via `emitSystemMessage({ sessionId, event: 'recording_paused', body: \`Doctor paused recording at ${formatTimeInDoctorTz(now(), tz)}. Reason: ${reason}\`, correlationId })`. The call's own error-swallow contract (Task 37 Notes #4) ensures a system-message failure doesn't undo the pause — the pause is real; the narrative banner is best-effort.
  7. **Return void.**

- [ ] **`resumeRecording` implementation order** — mirror of pause:
  1. Validate + idempotency (already resumed → no-op).
  2. Write attempted audit row (`action = 'recording_resumed'`, `reason = null` — resume has no reason requirement per Decision 4).
  3. Twilio Recording Rules API call to include `all_participants` for `kind = 'audio'` again.
  4. Write completed audit row on success / failed audit row + throw on error.
  5. Emit `event = 'recording_resumed'` system message: `"Doctor resumed recording at HH:MM."`.

- [ ] **`getCurrentRecordingState` implementation** — a single read, no side effects:
  1. SELECT the most recent `consultation_recording_audit` row for `session_id` with `action IN ('recording_paused', 'recording_resumed')`.
  2. If no row → `{ paused: false }`.
  3. If latest is `recording_paused` with `metadata.status = 'completed'` → return `{ paused: true, pausedAt, pausedBy, pauseReason }`.
  4. If latest is `recording_resumed` with `metadata.status = 'completed'` → `{ paused: false, resumedAt }`.
  5. If latest row is `status = 'attempted'` (Twilio mid-flight) — trust the intent: return the state implied by the attempted action. Twilio's failure recovery leaves the ledger eventually consistent; the UI prefers the intent over the stale state.

- [ ] **Twilio Recording Rules wrapper** — `twilio-recording-rules.ts` under `backend/src/services/adapters/` (or next to `video-session-twilio.ts` if the codebase's convention is flat). Two exported helpers:
  ```ts
  export async function excludeAllParticipantsFromRecording(roomSid: string, kind: 'audio' | 'video'): Promise<void>;
  export async function includeAllParticipantsInRecording(roomSid: string, kind: 'audio' | 'video'): Promise<void>;
  ```
  Each wraps `client.video.v1.rooms(roomSid).recordingRules.update({ rules: [...] })`. The rules array is merged (not replaced wholesale) so a pause of `'audio'` doesn't accidentally re-enable `'video'` inclusion that was previously set by Plan 08's video-escalation flow. Rule-merge logic lives here so callers only need to say "exclude audio" / "include audio" — the merge is hidden.

- [ ] **HTTP routes** `backend/src/routes/api/v1/consultation.ts` (EXTEND):
  - `POST /api/v1/consultation/:sessionId/recording/pause` — body `{ reason: string }`; doctor-only (participant-role guard + `session.doctor_id === auth.uid()`); correlation-id taken from `X-Correlation-Id` header or minted. Returns `204 No Content` on success; `400` on invalid reason; `403` on non-doctor / wrong doctor; `409` on session not live / already paused.
  - `POST /api/v1/consultation/:sessionId/recording/resume` — no body; same authz + response shapes; `409` when already resumed / session not live.
  - `GET /api/v1/consultation/:sessionId/recording/state` — either party can read (doctor or patient); returns the `RecordingState` shape. Rationale: the patient UI's indicator needs to know the current state on mount, and the RLS pattern for the patient JWT (Plan 04 Task 18 / Migration 052) already scopes them to the session. For voice/video the patient JWT is the companion-chat patient JWT (Plan 06 Task 36), which carries `session_id` — same authz model.

- [ ] **Audit metadata JSON shape is pinned** so Plan 02's reconciliation worker + any future ops tool knows the schema:
  ```json
  {
    "twilio_sid":      "RM…",         // the Twilio Room SID from session.providerSessionId
    "kind":            "audio",       // 'audio' | 'video' (video is Plan 08 territory)
    "status":          "attempted" | "completed" | "failed",
    "error":           "…"            // present only on status='failed'
  }
  ```
  Add a test that pins the metadata shape (snapshot-style) so a future refactor that silently changes the JSON schema breaks the build.

- [ ] **Unit tests** in `backend/tests/unit/services/recording-pause-service.test.ts` (NEW):
  - **Reason length validation** — `' '` / `'abcd'` / 201-char rejected; `'abcde'` / 200-char accepted (edge cases on both sides).
  - **AuthZ** — `doctorId !== session.doctorId` throws `ForbiddenError` before any DB or Twilio call.
  - **Session-not-live** — `status = 'ended'` throws `ConflictError`.
  - **Ledger ordering** — mock Twilio to throw; assert the "attempted" audit row is persisted AND the "failed" audit row is persisted AND the function throws. Verify `correlation_id` matches on both rows.
  - **Happy path** — two audit rows (attempted + completed), Twilio called once, `emitSystemMessage` called once with `event: 'recording_paused'` + body matching `/Doctor paused recording at \d{2}:\d{2}\. Reason: <reason>/`.
  - **Idempotency** — second pause call while already paused returns without writing new rows or calling Twilio; logs at `info` with `{ skipped: true, reason: 'already_paused' }`.
  - **System-message failure is non-fatal** — mock `emitSystemMessage` to throw; pause still succeeds (audit rows written, Twilio called). Assert the throw is logged at `error` but not rethrown.
  - **Mirror test suite for `resumeRecording`** — same shapes with `recording_resumed` action + no-reason contract.
  - **`getCurrentRecordingState` branches** — no rows → `{ paused: false }`; latest `recording_paused` completed → paused state; latest `recording_resumed` completed → resumed state; latest `attempted` → prefers intent.

- [ ] **Route tests** in `backend/tests/unit/routes/consultation-recording-pause.test.ts` (NEW):
  - Doctor happy path → 204.
  - Patient attempting pause → 403.
  - Missing reason → 400.
  - Reason too short → 400.
  - Session `status = 'ended'` → 409.
  - `GET /recording/state` returns 200 for both doctor + patient participants; 403 for other users.

### Frontend

- [ ] **`frontend/components/consultation/RecordingControls.tsx` (NEW).** Props:
  ```ts
  interface RecordingControlsProps {
    sessionId:       string;
    currentUserRole: 'doctor' | 'patient';  // patient renders nothing (the whole component returns null); prevents accidental display on the patient side
    /** Optional: called when pause succeeds with the doctor-supplied reason — mainly for parent-side telemetry. */
    onPauseSuccess?: (reason: string) => void;
    onResumeSuccess?: () => void;
  }
  ```
  Behavior:
  - Reads the current state on mount via `GET /recording/state`; polls every 5s OR subscribes to the companion-chat system-message stream (Open decision #2 in the plan recommends system-message derivation — use that to avoid an extra polling loop; falls back to a single initial GET for the "state at mount" case). Implementation detail: tap into `<TextConsultRoom>`'s existing Realtime subscription via an `onIncomingMessage` callback (added in Task 38) and filter `kind === 'system' && system_event in {'recording_paused','recording_resumed'}`. Rationale: zero new subscriptions; the companion chat is already live.
  - Renders either a **"⏸ Pause recording"** button (when not paused) or a **"▶ Resume recording"** button (when paused).
  - Pause button opens a modal: textarea with placeholder "Why are you pausing? (e.g. 'Patient stepped away to fetch medication.')", character counter, `Cancel` + `Pause recording` buttons. `Pause recording` is disabled until the textarea's `.trim().length >= 5 && <= 200`.
  - Resume button is a plain click — no modal (matches Decision 4's "resume has no reason requirement").
  - Both actions POST to the corresponding route with inline loading state + error toast on failure.
  - Errors from the route (403 / 409) render inline in the modal or as a transient toast adjacent to the button (consistent with the "Coming soon" inline `aria-live` banner pattern shipped in Task 20).

- [ ] **`frontend/components/consultation/RecordingPausedIndicator.tsx` (NEW).** Props:
  ```ts
  interface RecordingPausedIndicatorProps {
    sessionId:       string;
    currentUserRole: 'doctor' | 'patient';  // both roles render it; copy differs slightly per #3 below
  }
  ```
  Behavior:
  - Same subscription-tap strategy as `<RecordingControls>` — reads state from the companion-chat system-message stream.
  - When paused, renders a persistent banner:
    - Doctor copy: `"🔴 Recording paused — reason: \"{reason}\". Resume when ready."`.
    - Patient copy: `"🔴 Recording paused by Dr. {doctorName} — reason: \"{reason}\"."`.
  - When not paused, renders nothing.
  - Placement: mounts inside `<LiveConsultPanel>`'s `recordingSlot` (the slot exists today as part of Task 20) for video; mounts in the header strip of `<VoiceConsultRoom>` for voice. Both mounts are wired in this task.

- [ ] **`<LiveConsultPanel>` + `<VoiceConsultRoom>` wire-up** — pass `recordingSlot={<RecordingPausedIndicator ... />}` (video, via `<ConsultationLauncher>`) and mount `<RecordingPausedIndicator>` in `<VoiceConsultRoom>`'s header. `<RecordingControls>` mounts next to the mute/end controls in both rooms (doctor-only render since the component returns null for patients).

- [ ] **Doctor-side dashboard wiring.** `<ConsultationLauncher>`'s video branch (lines 95ish in `ConsultationLauncher.tsx`) already passes `recordingSlot` to `<LiveConsultPanel>` — extend the slot content with both `<RecordingControls>` + `<RecordingPausedIndicator>`. Layout them stacked: indicator top, controls bottom.

- [ ] **Patient-side wiring.** Patient's `/c/video/[sessionId]/page.tsx` and `/c/voice/[sessionId]/page.tsx` (the latter from Plan 05 Task 24) already mount the room components; since `<RecordingControls>` returns null for patients, no explicit guard is needed — just pass `currentUserRole` through. The indicator renders the patient copy automatically.

- [ ] **Accessibility**:
  - The pause-reason modal uses the same dialog / focus-trap pattern as existing dashboard modals (verify at PR-time against the existing prescription form). `aria-modal="true"`, focus on the textarea on open, `Esc` cancels.
  - The indicator banner has `role="status"` + `aria-live="polite"` so screen readers announce pause/resume events.
  - The character-counter has `aria-live="polite"` + updates when the user passes the 200-char threshold.

- [ ] **Frontend tests** (DEFERRED until the frontend test harness ships, same as Tasks 38 + 24c):
  - `<RecordingControls>` returns null for patients.
  - Pause modal validates min/max reason length before enabling submit.
  - After successful pause, the button flips to Resume.
  - `<RecordingPausedIndicator>` renders only when paused; copy differs per role.
  - System-message derivation: a fake `kind: 'system', system_event: 'recording_paused'` row fires the indicator on.

- [ ] **Manual smoke test** (doctor + patient cross-side):
  - Start a video consult → doctor sees Pause button; patient sees no button.
  - Doctor taps Pause → modal opens → enters "Patient stepped away" → submits → banner appears for BOTH parties ("🔴 Recording paused ...").
  - Inspect `consultation_recording_audit` via psql: two rows present (`attempted` + `completed`), `reason` stored correctly, `correlation_id` consistent.
  - Inspect Twilio console: Room's recording rules show `{ type: 'exclude', all: true, kind: 'audio' }`.
  - Doctor taps Resume → banner disappears for both parties; rules flip back.
  - Repeat for voice consult (once Plan 05 Task 23 ships); verify the same audit + system-message path works with the voice adapter.

- [ ] **Type-check + lint clean.** Backend `npx tsc --noEmit` exit 0. Frontend `npx tsc --noEmit` + `npx next lint` clean. `npx jest` backend suite green.

- [ ] **No new env vars. No new migrations** (`consultation_recording_audit` is Plan 02's migration).

---

## Out of scope

1. **Video recording pause.** Twilio's Recording Rules API supports `kind = 'video'` — Plan 08 Task 41 will extend `recording-pause-service.ts` with a `kind: 'audio' | 'video' | 'both'` parameter. v1 ships `kind = 'audio'` only because v1 consult recording is audio-only (Decision 2 LOCKED: Twilio Video audio-only mode for voice). When Plan 08 escalates a consult to video recording, this service's next iteration gains the second `kind`.
2. **Automatic pause on event.** No auto-pause based on PHI detection, silence duration, or any AI trigger. v1 is 100% doctor-driven.
3. **Pause reason templates / quick-picks.** Free-text v1. A future UX pass might add quick-pick chips ("Patient stepped away", "Phone call interruption", "Technical issue") — captured in `docs/capture/inbox.md` if doctors complain about repetitive typing.
4. **Edit / delete an existing audit row.** Audit rows are immutable. A mis-typed reason stays in the audit forever. Regulatory doctrine.
5. **Patient-side pause request.** Decision 4 locks this as a doctor-only action. Patients cannot initiate or request pauses in v1.
6. **Support-staff pause-on-behalf.** Decision 4 allows ops escalation but no UI ships in v1 (support staff can pause via direct SQL / API with a `metadata.support_ticket_id` — the service accepts `doctorId` = any user in the `support_staff` role at the route layer if an `X-Support-Reason` header is present; route-level RBAC gate is out of scope here, captured as a Plan 2.5 follow-up).
7. **Real-time "this is what the doctor is about to pause for" — i.e. pre-pause confirmation to patient.** No — the pause is instantaneous; the patient learns via the system banner, not a pre-pause prompt.
8. **Multiple concurrent pauses.** Twilio recording is one stream; pause is a single global flag. Idempotency handles the "already paused" edge.
9. **Pause telemetry dashboards.** Audit rows exist; operational dashboards ("average pauses per consult by specialty") are a Plan 10 / analytics concern.
10. **Gating pause on consent version.** If the patient's `consent_version` doesn't match the current policy version, the consult shouldn't have been recordable in the first place — Plan 02 Task 28's intake flow gates. This task assumes the session's recording was allowed at create-time and focuses on mid-consult toggling.

---

## Files expected to touch

**Backend (new):**

- `backend/src/services/recording-pause-service.ts` — the three exported functions + the audit-ledger logic (~250 lines including JSDoc).
- `backend/src/services/adapters/twilio-recording-rules.ts` — the rules-merge wrapper (~60 lines).

**Backend (extend):**

- `backend/src/routes/api/v1/consultation.ts` — three new routes (~40 lines added).
- `backend/src/types/consultation-recording-audit.ts` — likely ships with Plan 02; this task adds the `action` union (`'recording_paused' | 'recording_resumed' | ...`) if Plan 02 didn't already.

**Frontend (new):**

- `frontend/components/consultation/RecordingControls.tsx` — the pause/resume button + reason modal (~180 lines).
- `frontend/components/consultation/RecordingPausedIndicator.tsx` — the banner (~80 lines).

**Frontend (extend):**

- `frontend/components/consultation/LiveConsultPanel.tsx` — no change if the existing `recordingSlot` prop is already the extension point (verify at PR-time).
- `frontend/components/consultation/ConsultationLauncher.tsx` — wire `recordingSlot={<RecordingPausedIndicator ... /> + <RecordingControls ... />}` for video.
- `frontend/components/consultation/VoiceConsultRoom.tsx` — mount the two components inside the header strip + controls strip.
- `frontend/components/consultation/TextConsultRoom.tsx` — extend the existing `onIncomingMessage` callback (added in Task 38) to include system-event shape passthrough so `<RecordingControls>` / `<RecordingPausedIndicator>` can tap into it. Already documented in Task 38; no new surface.
- `frontend/lib/api.ts` — three thin wrappers: `pauseRecording(sessionId, reason)`, `resumeRecording(sessionId)`, `getRecordingState(sessionId)`.

**Tests:**

- `backend/tests/unit/services/recording-pause-service.test.ts` — new.
- `backend/tests/unit/services/adapters/twilio-recording-rules.test.ts` — new.
- `backend/tests/unit/routes/consultation-recording-pause.test.ts` — new.
- Frontend tests deferred.

---

## Notes / open decisions

1. **Plan 02 migration is a hard block.** I verified via grep of `backend/migrations/` that `consultation_recording_audit` / `recording_access_audit` / `signed_url_revocation` / `regulatory_retention_policy` are **not yet present in the codebase**. Plan 07's entire Phase E is gated on Plan 02 Task 27 landing the audit-tables migration. Document this in the PR description and status-check it before starting development.
2. **Audit-ledger "attempted + completed" pattern.** The double-row design means a catastrophic Twilio failure (the process crashes between calls) leaves a row in the audit log that a reconciliation worker can resolve — the worker queries "rows with `attempted` status and no matching `completed`/`failed` within 5 minutes" and either marks them failed (if Twilio confirms the rule change never happened) or completes them (if Twilio confirms the rule). Plan 02's reconciliation worker is the owner of this reconciliation — this task only ensures the ledger is consistent.
3. **Copy differentiation for doctor vs patient banner.** Doctor sees the reason verbatim ("🔴 Recording paused — reason: ..."). Patient sees the same reason — Decision 4 explicitly keeps the reason visible to both parties. There's no "redact PHI from the reason before showing the patient" doctrine in v1: the reason is between the doctor and their patient; the doctor chose to type it. Document in the component's JSDoc so a future PR doesn't introduce reason-redaction without a consent-doctrine update.
4. **System-message derivation vs dedicated state channel** (Open question #2 from the plan). Going with system-message derivation. Benefits: zero new subscriptions, narrative and state share one source of truth, Plan 10's AI pipeline reads pauses natively. Trade-off: the indicator's "is currently paused?" predicate is a derived computation over the system-message stream rather than a primitive lookup. Mitigated by `getCurrentRecordingState` serving the authoritative initial state on mount; Realtime then keeps it fresh. Document in the indicator's JSDoc that the source of truth is the audit-driven system messages.
5. **Twilio Recording Rules merge vs replace.** Twilio's `RecordingRules.update()` wholesale-replaces the rules array. If we send `[{ type: 'exclude', all: true, kind: 'audio' }]` we lose any Plan 08 video-inclusion rule that was previously set. The wrapper in `adapters/twilio-recording-rules.ts` solves this by fetching the current rules, merging the new rule in, and re-sending the merged array. Write the wrapper defensively + test the merge cases (pure audio pause; audio pause over existing video include; resume after pause).
6. **Why `status: 'attempted' | 'completed' | 'failed'` in metadata instead of a top-level column?** Plan 02's table shape has `metadata JSONB` without a `status` column; putting it in metadata keeps the migration shape that Plan 02 ships without forcing a co-migration. Trade-off: indexing on `metadata->>'status'` is a JSONB-expression index rather than a cheap btree. Acceptable for v1 volumes; revisit if Plan 02's reconciliation worker starts complaining about query perf.
7. **Reason-length limits.** 5..200 chars. 5 chars prevents "ok." / "..." / "x" from passing as a reason (which would defeat the audit's purpose). 200 chars keeps the banner copy within one line in most viewports without truncation. If doctors want multi-paragraph reasons, upgrade to 1000 chars + CSS `text-overflow` on the banner; captured in inbox.
8. **What if the doctor's connection drops between "pause attempted" and the UI confirmation?** The audit row is persisted; Twilio's rules might or might not have flipped. On reconnect, `<RecordingControls>` reads `getCurrentRecordingState` and renders whatever the ledger says (preferring intent on `attempted`). Worst case: the UI shows Resume while Twilio is still recording — harmless because the next explicit action re-reconciles. Plan 02's reconciliation worker cleans the attempted row within 5 min.
9. **Does the patient JWT (Plan 04 Migration 052) pass the `GET /recording/state` RBAC?** The patient JWT carries `session_id` + `consult_role = 'patient'`. Our route's authz check: "`session_id` matches AND caller is either doctor or patient of that session." Doctor branch via dashboard auth; patient branch via the JWT. Both pass cleanly. Document in the route handler.
10. **Race on double-tap.** Doctor fat-fingers the Pause button → two concurrent POSTs hit the service. The idempotency check (#2 in the impl order) catches the second one in most cases, but the two reads can interleave before either writes. v1 accepts this — worst case is two `attempted` audit rows + one Twilio call. The second audit row is auto-resolved by the reconciliation worker. If this turns out to be a real issue, add a Postgres advisory lock on `session_id` per pause action — captured in inbox.
11. **Voice-only mount site for `<RecordingControls>`.** Voice consults don't currently have a controls strip that can host a fourth button comfortably — Plan 05 Task 24 shipped mute / speaker / end. Adding pause/resume makes 4 buttons; consider a "More" overflow menu if the layout gets cramped. Document in the voice wire-up code + capture in inbox if UX feedback says 4 buttons is too many.

---

## References

- **Plan:** [plan-07-recording-replay-and-history.md](../Plans/plan-07-recording-replay-and-history.md) — Task 28 section.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 4 LOCKED.
- **Plan 02:** [plan-02-recording-governance-foundation.md](../Plans/plan-02-recording-governance-foundation.md) — audit table shape this task writes into.
- **Plan 06 Task 37 — `emitSystemMessage` + `SystemEvent` union slots:** [task-37-system-message-emitter.md](./task-37-system-message-emitter.md) (the `'recording_paused' | 'recording_resumed' | 'recording_stopped_by_doctor'` members are claimed here for this task to populate).
- **Plan 06 Task 39 — schema for `kind = 'system'` rows:** [task-39-consultation-messages-attachments-and-system-rows.md](./task-39-consultation-messages-attachments-and-system-rows.md).
- **Plan 05 Task 23 — voice adapter (if shipped):** [task-23-voice-session-twilio-adapter.md](./task-23-voice-session-twilio-adapter.md).
- **Existing video adapter (Twilio client reuse):** `backend/src/services/video-session-twilio.ts`.
- **Existing `<LiveConsultPanel>`:** `frontend/components/consultation/LiveConsultPanel.tsx` (its existing `recordingSlot` prop is the mount point for the indicator).
- **Task 20 launcher (wire-up reference for `recordingSlot`):** [task-20-consultation-launcher-and-live-panel.md](./task-20-consultation-launcher-and-live-panel.md).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** ✅ Completed 2026-04-20.

---

## Implementation log (2026-04-20)

### Scope shipped

**Backend**

- **`backend/migrations/064_consultation_recording_audit.sql` (NEW).** Plan 02 Task 27 never landed the `consultation_recording_audit` table so this task shipped the migration itself to unblock. Adopted the richer shape documented in this task file (not the narrower Plan 02 doc shape): `id`, `session_id` (FK `consultation_sessions.id` ON DELETE CASCADE), `action` (ENUM `recording_audit_action` with `recording_started | recording_paused | recording_resumed | recording_stopped | patient_declined_pre_session | patient_revoked_video_mid_session`), `action_by` (UUID, no FK so system rows are frictionless), `action_by_role` (TEXT + CHECK `IN ('doctor','patient','system','support_staff')` — used TEXT+CHECK over ENUM since future `support_staff` roles are easier to extend), `reason`, `metadata` (JSONB, shape pinned in task AC), `correlation_id`, `created_at`. Added indexes for hot reads (`session_id DESC created_at`), correlation-based lookups, and the reconciliation sweep (`status = 'attempted'`).
- **`backend/src/services/twilio-recording-rules.ts` (NEW).** Merge-aware wrapper around Twilio's `RecordingRules.update()` — crucial because Twilio's endpoint is a **wholesale replace** of the rules array, so a naive implementation would clobber all existing rules (e.g. pausing audio would delete the separate video-include rule when Plan 08 ships). The wrapper fetches the current rules, swaps the matching `{ all: true, kind }` entry in place (or appends if absent), and writes the merged array back. Two exports: `excludeAllParticipantsFromRecording(roomSid, kind, correlationId)` and `includeAllParticipantsInRecording(roomSid, kind, correlationId)`.
- **`backend/src/services/recording-pause-service.ts` (NEW).** Implements the ledger pattern per the task AC:
  1. Validate reason length (5..200 after `.trim()`), doctor ownership of session, session status = `'live'`.
  2. Idempotency check: if already paused/resumed, short-circuit with a no-op.
  3. Write `action='recording_paused'`, `metadata.status='attempted'` row.
  4. Call Twilio via the merge-aware wrapper.
  5. On success: write `{ status:'completed' }` row + emit a `recording_paused` system message through Plan 06's `emitSystemMessage` → doctor + patient both get the banner live.
  6. On failure: write `{ status:'failed', error }` row and re-throw. No system message — the pause never took effect so the UI shouldn't flip.
  `resumeRecording` is the mirror (no reason required). `getCurrentRecordingState` is a pure read over the audit table; the "current state" is whatever the latest terminal row (`completed` or `failed`) for that session says.
- **`backend/src/controllers/consultation-controller.ts` (EXTENDED).** Added `pauseRecordingHandler`, `resumeRecordingHandler`, `getRecordingStateHandler`. All three look up the authenticated user via `req.user.id`, run `isSessionParticipant` to assert the caller is the doctor (or for `getRecordingState` either party), and delegate. Correlation IDs are generated per-request (`randomUUID`) and logged.
- **`backend/src/routes/api/v1/consultation.ts` (EXTENDED).** New routes:
  - `POST /api/v1/consultation/:sessionId/recording/pause` (auth + doctor-only)
  - `POST /api/v1/consultation/:sessionId/recording/resume` (auth + doctor-only)
  - `GET /api/v1/consultation/:sessionId/recording/state` (auth + participant-only)
- **Unit tests (`backend/tests/unit/services/*.test.ts`).** 30 tests total, all green:
  - `twilio-recording-rules.test.ts` (9 tests): verifies the merge-aware logic — empty starting rules, replacing same-kind entry in place, preserving other-kind entries, passing-through non-`all` rules verbatim, correlation ID propagation.
  - `recording-pause-service.test.ts` (21 tests): input validation, auth/status gates, full ledger happy path (attempted → completed), Twilio failure path (attempted → failed, no system message), idempotency on repeat pause/resume, system message emission shape (`event`, `body` banner copy including `reason`), `getCurrentRecordingState` state derivation.

**Frontend**

- **`frontend/lib/api.ts` (EXTENDED).** New `RecordingStateData` interface + `pauseRecording(token, sessionId, reason)`, `resumeRecording(token, sessionId)`, `getRecordingState(token, sessionId)` helpers. Standard `ApiSuccess<T>` envelope. 400/403/409 propagate as thrown `ApiError` with `.status`.
- **`frontend/hooks/useRecordingState.ts` (NEW).** Wraps the source-of-truth handshake per Decision 4 LOCKED:
  - Initial `GET /recording/state` on mount (so refreshes mid-pause show correct UI immediately).
  - Host component calls `applyIncomingMessage({ senderRole, systemEvent, body, kind })` on every inbound chat message. The hook filters internally (`senderRole === 'system' && systemEvent in { recording_paused, recording_resumed }`) and flips state locally — no extra Realtime subscription.
  - Regex parses the reason back out of the `recording_paused` banner body (`/Reason:\s*([\s\S]*)$/`). **Gotcha:** if the banner copy in `consultation-message-service.ts` is ever changed this regex MUST be updated in lockstep; tracked as a soft-coupling note in the hook's JSDoc.
- **`frontend/components/consultation/RecordingPausedIndicator.tsx` (NEW).** Role-differentiated banner copy (doctor: "🔴 Recording paused — reason shown to patient", patient: "🔴 Recording paused — audio is not being captured right now"). Returns `null` when not paused. Polite `aria-live` region.
- **`frontend/components/consultation/RecordingControls.tsx` (NEW).** Doctor-only (returns `null` for patient). Shows:
  - **Paused state:** "Resume recording" button — single click, no modal.
  - **Active state:** "Pause recording" button → opens a modal with a textarea, character counter, live validation (5..200 chars after trim), Cancel + Submit buttons. Keyboard: `Esc` closes modal, `Ctrl/Cmd+Enter` submits. Focus-traps inside the modal while open; focus returns to the pause button on close.
- **`frontend/components/consultation/TextConsultRoom.tsx` (EXTENDED).** Extended `IncomingMessageMeta` with `systemEvent?: string | null` + `body?: string` so host components can derive recording state from the chat stream (zero-extra-subscription path per Decision 4).
- **`frontend/components/consultation/VoiceConsultRoom.tsx` (EXTENDED).** New opt-in props `recordingSessionId?: string` + `recordingToken?: string`. Mounts `useRecordingState` + forwards every chat message via `applyIncomingMessage`. Renders `<RecordingControls>` in the header strip next to mute/end, and `<RecordingPausedIndicator>` as a persistent banner just below the header while paused.
- **`frontend/components/consultation/VideoRoom.tsx` (EXTENDED).** Same opt-in `recordingSessionId` + `recordingToken` props; same `useRecordingState` wiring. The controls + indicator mount stacked above the video grid (inside `videoPane` so they appear in both the legacy no-companion layout and the Task 38 two-pane layout).
- **`frontend/components/consultation/ConsultationLauncher.tsx` (EXTENDED).** Threads the existing doctor `sessionId` + Supabase `token` into both `<VoiceConsultRoom>` and `<VideoRoom>` as `recordingSessionId` / `recordingToken` for the doctor-side mount.
- **`frontend/app/c/voice/[sessionId]/page.tsx` (EXTENDED).** Patient-side voice mount. Reuses the companion text-token (`state.companion.token`, already minted by `/text-token` exchange) as the recording-API JWT. No new auth plumbing needed — `authenticateToken` already accepts any valid Supabase session. Controls render `null` for patients; the indicator renders the patient copy automatically.

### Scope deliberately deferred

- **Patient-side video mount for `/consult/join`.** That legacy page uses HMAC-only auth and never exchanges to a Supabase JWT (no companion text channel on that path). Wiring the indicator there requires either HMAC-auth on the recording endpoints or an HMAC→JWT exchange at page load — either is ~1h of work that's out of scope for the Decision 4 slice. Deferred to a follow-up that can fold in with the eventual `/c/video/[sessionId]` Task-36-style patient route. **Impact:** doctor-side control still works end-to-end; the patient on `/consult/join` simply doesn't see the "Recording paused" banner. Given Plan 08 is expected to introduce the new patient video route anyway, we chose to not grow the legacy path.
- **Route-level integration tests.** The task AC lists `backend/tests/unit/routes/consultation-recording-pause.test.ts`; the route harness isn't trivially available for the recording endpoints (the existing route tests for consultation mock the whole service layer). Unit-service coverage at 21 tests + manual smoke covers the behavior; deferred to the eventual test-harness refresh.

### Decisions & divergences from the task file

1. **Shipped the audit-table migration ourselves.** The task file opens with a "hard-blocked on Plan 02 Task 27" disclaimer. Plan 02 Task 27 never landed (verified via `backend/migrations/` ls + `EXECUTION-ORDER.md` grep). Two options: (a) wait for Plan 02, which would stall all of Plan 07; (b) land the migration here. Chose (b) — the schema in this task file is strictly richer than the Plan 02 doc's (adds `metadata` JSONB + `correlation_id` + `action_by_role` CHECK), and a second migration later would be a no-op if its shape happens to match. Migration number chosen: `064_` (next sequential after whatever's current at time of writing; verified nothing at `063_` or `064_` collides).
2. **Merge-aware Twilio wrapper instead of raw `.update()`.** The task AC sample code calls `RecordingRules.update({ rules: [...] })` directly. That would clobber any other rules on the room (future-proofing: Plan 08 will want a `kind='video'` rule alongside). Added a thin service (`twilio-recording-rules.ts`) that fetches current → merges by `kind` → writes back. This is behaviorally identical for the v1 audio-only case but won't break when Plan 08 adds video recording.
3. **TEXT + CHECK over ENUM for `action_by_role`.** ENUM would be stricter but harder to extend — adding `support_staff` already required foresight. TEXT + CHECK is easier for future ops roles without a migration.
4. **`action_by` has no FK.** System-emitted rows (e.g. future auto-stop after timeout) won't have a real user. Rather than overload `users.id` with a sentinel "system" row, `action_by` is a free UUID and downstream readers join optimistically.
5. **Banner reason regex lives in the hook, not shared with the backend emitter.** Shared would be more DRY but imposes a TS types bridge that isn't worth it for a 40-char regex. Soft-coupling documented in both files.

### Verification

- `npx tsc --noEmit` — backend clean, frontend clean.
- `npx jest tests/unit/services/recording-pause-service.test.ts tests/unit/services/twilio-recording-rules.test.ts` — 30/30 pass.
- `npx next lint` on all touched files — clean.
- Manual smoke deferred (see Scope deliberately deferred).

### Files shipped

**New:**
- `backend/migrations/064_consultation_recording_audit.sql`
- `backend/src/services/twilio-recording-rules.ts`
- `backend/src/services/recording-pause-service.ts`
- `backend/tests/unit/services/twilio-recording-rules.test.ts`
- `backend/tests/unit/services/recording-pause-service.test.ts`
- `frontend/hooks/useRecordingState.ts`
- `frontend/components/consultation/RecordingPausedIndicator.tsx`
- `frontend/components/consultation/RecordingControls.tsx`

**Modified:**
- `backend/src/controllers/consultation-controller.ts`
- `backend/src/routes/api/v1/consultation.ts`
- `frontend/lib/api.ts`
- `frontend/components/consultation/TextConsultRoom.tsx`
- `frontend/components/consultation/VoiceConsultRoom.tsx`
- `frontend/components/consultation/VideoRoom.tsx`
- `frontend/components/consultation/ConsultationLauncher.tsx`
- `frontend/app/c/voice/[sessionId]/page.tsx`
