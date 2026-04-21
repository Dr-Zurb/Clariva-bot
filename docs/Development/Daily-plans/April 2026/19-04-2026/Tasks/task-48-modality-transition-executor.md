# Task 48: `modality-transition-executor.ts` — provider-level switching for all 6 transitions (Decision 11 LOCKED · Decision 2 payoff)

## 19 April 2026 — Plan [Mid-consult modality switching](../Plans/plan-09-mid-consult-modality-switching.md) — Phase A

---

## Status

**✅ Shipped (2026-04-19).** Task 47's contract stub in `backend/src/services/modality-transition-executor.ts` has been replaced with the live 6-branch dispatcher. Code structure:

- **Live dispatcher** — `dispatchTransition()` switches on a `${from}->${to}` key and routes to one of 6 branch handlers; same-modality throws `NoOpTransitionError`; unreachable default throws `InternalError` (exhaustiveness guard against future enum additions).
- **6 branch handlers (file-private)** —
  - `executeTextToVoice` · `voiceSessionTwilioAdapter.createSession` (which delegates to video adapter + applies audio-only Recording Rules per Plan 05 Task 23) → mints doctor+patient tokens → `recordingSegmentRef: { kind: 'audio_started' }` + `newProvider: 'twilio_video_audio'`.
  - `executeTextToVideo` · `videoSessionTwilioAdapter.createSession` → mints tokens → `newProvider: 'twilio_video'` (recording defaults to audio-only per Plan 08 Task 43 convention; camera escalation is a separate Task 51 client step).
  - `executeVoiceToVideo` · `escalateToFullVideoRecording` ONLY — same room SID, no new tokens. `escalationRequestId` is formatted `modality_change:{correlationId}` per Notes #3.
  - `executeVideoToVoice` · `revertToAudioOnlyRecording` ONLY — reason mapped from `initiatedBy` (`doctor` → `doctor_paused`, `patient` → `patient_revoked`, unset → `doctor_paused` default).
  - `executeVoiceToText` · `voiceSessionTwilioAdapter.endSession` (wraps video adapter's room completion + enqueues voice transcription). Returns `newProviderSessionId: null` + `newProvider: 'supabase_realtime'`.
  - `executeVideoToText` · `revertToAudioOnlyRecording` FIRST (closes video composition gracefully), then `videoSessionTwilioAdapter.endSession`. Same null-SID + `supabase_realtime` semantics.
- **Rollback (text → voice/video)** — if `createSession` succeeds but doctor- or patient-token mint throws, the catch block best-effort closes the orphan room via `completeTwilioRoom(newSid)` and re-throws an `AccessTokenMintError` tagged with the failing role.
- **Rollback limitation (voice/video → text)** — Twilio `room.update({ status: 'completed' })` is one-way. Task 47 orders the executor call before the final DB commit; the counter-guard `WHERE counter = 0` UPDATE is the only post-executor step and is logged loudly on race (`'counter UPDATE raced — history row orphaned'`). Documented as accepted edge case per Notes #5.
- **Companion chat invariant preserved** — no branch re-provisions the Supabase Realtime chat channel. Plan 06 Task 36 keyed it by `consultation_session_id`, not by `provider_session_id`, so it survives every transition.
- **Result contract widened** — `ExecuteTransitionResult.newProviderSessionId` is now `string | null` to signal the →text clear path; new optional fields (`newProvider`, `newAccessToken`, `newPatientAccessToken`, `recordingSegmentRef`, `transitionLatencyMs`) carry the richer data for Task 47 + 51 consumers. Task 47's commit UPDATE was surgically extended to stamp `provider` when `newProvider` is present and pass `null` through to `provider_session_id` on the →text branch.
- **Observability** — every branch returns a monotonic `transitionLatencyMs` from entry to provider confirmation. Plan 09 SLO targets documented inline (voice↔video <500ms, text→voice/video <3s, voice/video→text <1.5s). Live histogram emission is deferred to the observability follow-up already filed in capture/inbox.md.

**Files landed:**

- `backend/src/services/modality-transition-executor.ts` (rewritten — ~540 lines; was a ~170-line stub).
- `backend/src/services/modality-change-service.ts` (surgical: commit UPDATE now stamps `provider` column + passes through `initiatedBy` to the executor; +7 lines net).

**New tests:**

- `backend/tests/unit/services/modality-transition-executor.test.ts` — 23 tests covering all 6 branch cells, rollback on both doctor- and patient-token failures, `NoOpTransitionError` (including modality+correlation payload), missing-`providerSessionId` defensive throws, `initiatedBy`-to-`reason` mapping, and `transitionLatencyMs` population.
- `backend/tests/integration/modality-transition-executor-against-sandbox.test.ts` — 7 tests, all `describe.skip`-gated on `TWILIO_SANDBOX_TEST=1`. Documents the full live-sandbox matrix so the gate-lift follow-up (inbox.md) can swap in the real bodies without re-designing the harness.

**Verification:** `npx tsc --noEmit` exit 0; `eslint` clean on touched source files; `jest` full backend suite — **143 suites / 1920 tests green** (7 integration tests skipped by design).

**v1 deviations from the task spec (all documented):**

- **`backend/src/utils/modality-order.ts` — skipped.** The spec requests a shared `directionOf(from, to)` helper + numeric mapping. Task 46 already shipped `classifyModalityDirection` in `backend/src/types/modality-history.ts`; creating a second copy would fork the invariant. Follow-up to consolidate callers on a single source is captured in inbox.md.
- **`voice-session-twilio.ts` / `video-session-twilio.ts` — no refactor needed.** PR review confirmed both adapters don't initialise recording rules that would conflict with the Plan 08 wrapper path (the executor drives voice↔video via `escalateToFullVideoRecording` / `revertToAudioOnlyRecording` which own the rule-update API).
- **Realtime fan-out for patient tokens — deferred to Task 51.** The executor returns `newPatientAccessToken` synchronously; the task spec also mandates a Supabase Realtime broadcast on `consultation-sessions:{id}:modality-change`. Task 47's current call-site receives the result but does not yet re-broadcast — filed in inbox.md for Task 51 to consume when it ships the client-side modality-change launcher.
- **Pause-resume coordination (Plan 07 Task 28) — not explicitly tested.** `revertToAudioOnlyRecording` handles paused↔active state idempotently per Plan 07 Task 28's design; the executor passes through the call without wrapping. Real sandbox coverage lands with the gate-lift follow-up.

---

## Task overview

The executor is the thin, stateless, single-purpose module that Task 47's state machine calls to actually flip the underlying provider (Twilio / Supabase Realtime). It owns the six transition cells:

|             | → text                                | → voice                                | → video                                 |
|-------------|---------------------------------------|----------------------------------------|------------------------------------------|
| **text →**  | (same modality; no-op)                | Provision **new** Twilio Video audio-only room | Provision **new** Twilio Video full room |
| **voice →** | Disconnect Twilio Video room          | (same modality; no-op)                  | Reuse room; enable camera track (Decision 2 payoff — Plan 08 wrapper) |
| **video →** | Disconnect Twilio Video room + close video composition | Reuse room; disable camera track (Plan 08 wrapper) | (same modality; no-op) |

**Decision 2 LOCKED'd "voice and video use the same Twilio Video room with audio-only recording rules as the default"** — meaning voice↔video transitions are literally just a Twilio Recording Rules flip (Plan 08 Task 43's `recording-track-service.ts#escalateToFullVideoRecording` / `revertToAudioOnlyRecording`). No new room creation. This is the plan's single biggest technical win — a cross-modality transition that takes ~200ms instead of ~2s (the expensive path is Twilio room creation).

The text↔voice/video transitions are the expensive path: provision a brand-new Twilio Video room, hand the doctor a fresh access token, pass the same `consultation_session_id` so companion chat continues uninterrupted (Plan 06 auto-mounts the chat for every voice/video session).

Scope:

1. **`executeTransition({ session, toModality })`** — single public function dispatching to 6 branch handlers.
2. **Per-transition rollback** — on failure, attempt best-effort provider rollback (e.g. if a new room was created but `UPDATE consultation_sessions.provider_session_id` failed, close the orphan room).
3. **Recording-artifact segment markers** — every transition that changes recording shape (text→voice/video starts a new audio artifact; voice→video starts a video composition; video→voice/text ends the video composition) passes through Plan 08 Task 43's `recording-track-service.ts` so the audit + artifact lists stay coherent.
4. **Companion chat continuity** — no transition provisions a new chat channel. The chat is Plan 06's `provisionCompanionChannel` which ran at `createSession` time and persists for the entire session.

**Estimated time:** ~5 hours (above the plan's 4h estimate — the 6-branch dispatcher + provider rollback paths + Plan 08 wrapper coordination + the text→voice/video new-room-provisioning path (which reuses `video-session-twilio.ts` but needs careful refactoring to not accidentally create a second companion chat) push above 4h).

**Status:** Not started.

**Depends on:**

- Task 46 (hard — executor reads `session.current_modality` + `session.provider_session_id`).
- Plan 08 Task 43 (hard — `recording-track-service.ts` for voice↔video camera-track toggle + artifact management).
- Plan 05 Task 23 (hard — `voice-session-twilio.ts` for voice room creation; reused when text→voice).
- Plan 01 (hard — `video-session-twilio.ts` for video room creation; reused when text→video).
- Plan 04 Task 16 (hard — `text-session-supabase.ts` for Supabase Realtime channel semantics; reused when voice/video→text).
- Plan 06 Task 36 (soft — `provisionCompanionChannel` already ran at `createSession`; executor must not re-provision it on transition).

**Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md)

---

## Acceptance criteria

### Public API — `executeTransition`

- [ ] **`backend/src/services/modality-transition-executor.ts`** (NEW):
  ```ts
  import type { SessionRecord } from '../types/consultation-session';
  import type { Modality } from '../types/modality';

  export interface ExecuteTransitionInput {
    session:       SessionRecord;              // loaded by Task 47; current_modality + provider_session_id used
    toModality:    Modality;
    correlationId: string;
    initiatedBy:   'patient' | 'doctor';
  }

  export interface ExecuteTransitionResult {
    newProviderSessionId?: string;             // non-null when a new Twilio room was provisioned (text→voice, text→video)
                                               // OR when disconnecting and explicitly clearing (voice/video→text; set to null via sentinel, see below)
    newProvider?:         'twilio_video' | 'supabase_realtime';
    newAccessToken?:      string;              // doctor's fresh access token for the new room; null on text→any is passed differently (via Realtime)
    newPatientAccessToken?: string;            // patient's fresh access token (minted with consultation-ready DM trigger)
    recordingSegmentRef?: {                    // filled when a new recording segment starts or ends
      kind:                 'audio_started' | 'video_started' | 'video_ended' | 'audio_ended';
      compositionLabel:     string;
      startedAt?:           Date;
      endedAt?:             Date;
    };
    transitionLatencyMs:  number;              // wall-clock from call start to provider confirmation
  }

  export async function executeTransition(
    input: ExecuteTransitionInput,
  ): Promise<ExecuteTransitionResult>;
  ```
  - **Does NOT write to DB.** Task 47's state machine owns DB writes inside the transaction; this executor is pure "talk to providers + return results".
  - **Does NOT emit system messages.** Task 53 / Task 47 handle that side effect.
  - **Idempotency is the caller's responsibility.** Task 47 holds the advisory lock; no other concurrent `executeTransition` can fire on the same session.

### Dispatcher

- [ ] The public function dispatches on the `(fromModality, toModality)` pair to 6 private functions (5 active transitions + 1 same-modality no-op):
  ```ts
  async function executeTextToVoice(...);
  async function executeTextToVideo(...);
  async function executeVoiceToVideo(...);
  async function executeVideoToVoice(...);
  async function executeVoiceToText(...);
  async function executeVideoToText(...);
  ```
- [ ] Same-modality request throws `NoOpTransitionError` up to Task 47 (already caught in Task 47 Step 5 but defensive-throws if somehow reaches here).

### Transition branch — `text → voice`

- [ ] Call `voiceSessionTwilioAdapter.createSession({ sessionId: session.id, correlationId })` (Plan 05 Task 23's helper; inside it provisions an audio-only Twilio Video room + initial audio-only recording rule).
- [ ] Returns `newProviderSessionId` (Twilio room SID) + `newAccessToken` (doctor) + `newPatientAccessToken` (patient).
- [ ] `recordingSegmentRef` = `{ kind: 'audio_started', compositionLabel: 'consult_{session_id}_audio_{ISO}' }`.
- [ ] **DO NOT** call Plan 06 `provisionCompanionChannel` — it already ran at session creation and the chat channel is already live. Verify this at PR review: the chat channel IS keyed by `consultation_session_id`, not by `provider_session_id`, so it survives the transition.
- [ ] **Rollback:** if room creation succeeds but a downstream step throws, close the orphan room via `video.v1.rooms(newProviderSessionId).update({ status: 'completed' })` in the catch block.

### Transition branch — `text → video`

- [ ] Call `videoSessionTwilioAdapter.createSession({ sessionId: session.id, correlationId })` (Plan 01's helper; provisions a full Twilio Video room + audio-only-default recording rule per Plan 08 Task 43).
- [ ] Returns `newProviderSessionId` + `newAccessToken` + `newPatientAccessToken`.
- [ ] `recordingSegmentRef` = `{ kind: 'audio_started', ... }` — same default as Plan 08 (audio-only at room-create; video recording only on escalation).
- [ ] Rollback: same pattern.

### Transition branch — `voice → video` (Decision 2 payoff)

- [ ] **Same Twilio room SID.** No new room provisioning.
- [ ] Call `recordingTrackService.escalateToFullVideoRecording({ sessionId: session.id, roomSid: session.provider_session_id, doctorId: session.doctor_id, escalationRequestId: <generated via `modality_change:` prefix to distinguish from Plan 08's video-escalation audit rows — see Notes #3>, correlationId })`.
- [ ] `newProviderSessionId` = `session.provider_session_id` (unchanged — returned for caller convenience).
- [ ] `recordingSegmentRef` = `{ kind: 'video_started', compositionLabel: 'consult_{session_id}_video_{ISO}' }`.
- [ ] **No new access token needed** — both parties are already connected to the room. The frontend's camera track just needs to be enabled client-side (Task 51's `<ModalityChangeLauncher>` sends a UI hint via Realtime to toggle the camera publish).
- [ ] **Rollback:** on `escalateToFullVideoRecording` throw, no state change; Task 47 rolls back the DB transaction and the recording stays audio-only.

### Transition branch — `video → voice`

- [ ] **Same Twilio room SID.** No new room.
- [ ] Call `recordingTrackService.revertToAudioOnlyRecording({ sessionId: session.id, roomSid: session.provider_session_id, reason: 'doctor_revert' (if initiatedBy='doctor') | 'patient_revoked' (if initiatedBy='patient'), initiatedBy, correlationId })`.
- [ ] `newProviderSessionId` unchanged.
- [ ] `recordingSegmentRef` = `{ kind: 'video_ended', ... }`.
- [ ] Client-side: camera track is unpublished; the room stays connected for audio.
- [ ] **Rollback:** on throw, same as above — no state change.

### Transition branch — `voice → text`

- [ ] Call `recordingTrackService.getCurrentRecordingRules(session.provider_session_id)` to finalise the audio composition before disconnecting.
- [ ] Call `voiceSessionTwilioAdapter.endSession({ sessionId: session.id, reason: 'modality_transition' })` → wraps into `videoSessionTwilioAdapter.endSession` per Plan 05 Task 23's design (room.status = 'completed').
- [ ] `newProviderSessionId` = **null** (sentinel — represents "no provider session; chat-only"). Task 47 must handle this in its UPDATE (e.g. `UPDATE consultation_sessions SET provider_session_id = NULL, provider = 'supabase_realtime'`).
- [ ] `newProvider` = `'supabase_realtime'`.
- [ ] `recordingSegmentRef` = `{ kind: 'audio_ended', endedAt: now() }`.
- [ ] Companion chat channel **remains live** until `expected_end` (per plan line 22). No action on Supabase Realtime — it doesn't need to be "re-provisioned" because it's already the session's persistent chat.
- [ ] **Rollback:** Twilio endSession is not easily reversible. If subsequent steps fail, the room is already gone. Task 47's transaction rolls back DB state; executor logs a warning "provider state diverged — session row still reflects voice; Twilio room is disconnected". Requires manual ops remediation. **Captured in Notes #5 as an accepted edge case given Twilio API limitations.**

### Transition branch — `video → text`

- [ ] Same as `voice → text` plus:
- [ ] First call `recordingTrackService.revertToAudioOnlyRecording(...)` to close the video composition gracefully (even though the room is about to end — cleans up the composition record).
- [ ] Then `videoSessionTwilioAdapter.endSession(...)`.
- [ ] `recordingSegmentRef` = `{ kind: 'video_ended', ... }` (audio_ended is implicit on room close).

### Access token re-minting for new rooms

- [ ] Both `text → voice` and `text → video` produce **two** fresh access tokens (doctor + patient):
  - **Doctor token** returned synchronously to the caller → Task 47 returns it in the HTTP response → Task 51's approval/initiation modal uses it to swap in the new room connection.
  - **Patient token** is returned alongside but **also** pushed via a Supabase Realtime broadcast on `consultation-sessions:${sessionId}:modality-change` with event `{ kind: 'transition_applied', toModality, newAccessToken, newProviderSessionId }`. Patient's `<TextConsultRoom>` hears this and swap-mounts to `<VoiceConsultRoom>` / `<VideoRoom>` using the new token.
- [ ] Token TTLs match Plan 01's adapter defaults (1 hour). Tokens are minted with grants for the new room SID.
- [ ] **Security note:** tokens are transmitted in-band over Realtime; the channel is RLS-protected to session participants. Alternative considered (HMAC-exchange handshake): rejected for v1 — the Realtime channel already authenticates the subscriber via JWT; adding a handshake is belt-and-suspenders that complicates the client without adding real security.

### Coordination with Plan 06 companion chat

- [ ] Executor does NOT call `provisionCompanionChannel` at any branch. The companion chat was provisioned once at `createSession` (Plan 06 Task 36) and is keyed by `consultation_session_id`. All transitions preserve the session_id, so the chat survives.
- [ ] When transitioning *to* text: the chat becomes the *primary* surface (Plan 06's `<TextConsultRoom>` is promoted from companion to primary). No executor action required; frontend handles the swap.
- [ ] When transitioning *from* text: the chat becomes the *companion* surface. Same — no executor action.

### Coordination with Plan 08 escalation & pause-resume

- [ ] If the video room was in a **paused** state (Plan 07 Task 28) at the time of a `video → voice` or `video → text` transition, the executor:
  - Calls `recordingTrackService.revertToAudioOnlyRecording(...)` first, which handles the paused→active→reverted state transitions idempotently (Plan 07 Task 28's adapter handles it).
  - **No explicit resume.** Shift from paused+video directly to audio-only is a valid transition in Plan 08 Task 43's state model.
- [ ] If the video was recording (escalated state from Plan 08) at the time of `voice → text`: impossible — Plan 09's transitions derive from `session.current_modality`, not from the recording rule. If `current_modality = 'voice'`, the recording is audio-only. Video can only be recorded when `current_modality = 'video'`.
- [ ] **What if a Plan 08 video-escalation request is PENDING when a `voice → video` Plan 09 transition lands?** Edge case. Plan 08's `video_escalation_audit` pending row still exists (patient hasn't responded). Plan 09's upgrade would supersede — effectively the patient gets video via the Plan 09 consent flow, not the Plan 08 consent flow. Resolution: Task 47's pending-request check (Step 7) should be AWARE of Plan 08 pending rows too — reject with `PendingRequestExistsError` if either Plan 08 or Plan 09 has an in-flight request. **Captured as a Task 47 refinement in inbox.md.**

### Observability + latency contract

- [ ] Every call returns `transitionLatencyMs`. Task 47 logs this + emits to the histogram metric `modality_change_transition_latency_ms{transition}`.
- [ ] **SLO target:** 
  - voice↔video transitions: p95 < 500ms (just a recording-rule PATCH).
  - text→voice/video: p95 < 3000ms (Twilio room creation overhead).
  - voice/video→text: p95 < 1500ms (room disconnect + composition finalise).
- [ ] Alert on sustained p95 breach.

### Unit + integration tests

- [ ] **`backend/tests/unit/services/modality-transition-executor.test.ts`** (NEW):
  - Each of 6 transitions: verify it calls the right underlying adapter / `recording-track-service` method with the right args.
  - Rollback on failure: `text → voice` where Twilio room creation succeeds but token minting throws → room is closed in the catch.
  - `recordingSegmentRef` returned with correct kind for each transition.
  - `newProviderSessionId` returned correctly (new SID for text→any; same for voice↔video; null for any→text).
  - `transitionLatencyMs` populated.
  - `executeTransition` with `fromModality === toModality` throws `NoOpTransitionError`.
  - Concurrent call: advisory lock is Task 47's responsibility; executor itself doesn't lock but doesn't corrupt state if two concurrent calls hit (because Twilio-side Room SIDs are uniquely generated even if two rooms are created simultaneously; the second is orphaned if rollback fires).
- [ ] **`backend/tests/integration/modality-transition-executor-against-sandbox.test.ts`** (NEW; `describe.skip` unless `TWILIO_SANDBOX_TEST=1`):
  - All 6 transitions against Twilio sandbox with a real room + recording rules.
  - Verify video composition starts + ends correctly on `voice → video → voice`.
  - Verify new Twilio room on `text → voice` + old rooms closed on `voice → text`.

### Type-check + lint clean

- [ ] Backend `tsc --noEmit` exit 0. Unit tests green; integration tests skip-gated.

---

## Out of scope

- **DB writes** — executor is pure provider interaction. Task 47 owns the transaction.
- **System messages** — Task 53 owns.
- **Patient/doctor UI notifications** — Task 47 publishes Realtime events; UIs at Tasks 50/51/52 consume.
- **Retries within executor** — single-attempt only. Task 47 / Task 49 own retry policy at higher layers. Matches Plan 08 Task 43's adapter doctrine.
- **Pre-flight provider health checks** (e.g. "ping Twilio before trying to create a room"). Adds latency without meaningful safety — Twilio's failure surfaces clearly enough.
- **Graceful client-side camera-publish hint** for voice↔video (UI hint that "your camera is now live"). Task 51/54 handle UX side via Realtime events.
- **Composition layout customisation** for new video compositions (Plan 08 Task 43 Out-of-scope #5 deferred; same here).
- **Multi-participant support.** v1 assumes 1 doctor + 1 patient.
- **Text channel re-provisioning** on any transition. Companion chat is session-scoped, transitions don't touch it.

---

## Files expected to touch

**Backend (new):**

- `backend/src/services/modality-transition-executor.ts` — executor + dispatcher + 6 branch functions.
- `backend/src/utils/modality-order.ts` (NEW) — shared helper `directionOf(from, to)` + numeric mapping `text=1, voice=2, video=3`. Used by Task 47 + 48 + 55.

**Backend (light extensions):**

- `backend/src/services/video-session-twilio.ts` — may need a small refactor to ensure `createSession` doesn't re-initialise recording rules that would conflict with the Plan 08 wrapper. Likely already clean per Task 43's coordination. PR-time check.
- `backend/src/services/voice-session-twilio.ts` — same.

**Tests:** listed above.

**No frontend changes** in this task.

---

## Notes / open decisions

1. **Why executor is stateless + DB-free.** Testability: mock Twilio + `recording-track-service` in unit tests; no Supabase test-client harness needed. Also cleaner separation: Task 47 owns atomicity; executor owns provider RPC.
2. **Twilio Video Room Composition lineage.** A single session can end up with: 1 audio composition (text→voice→text) + 1 audio composition (voice existed from room start) + 1 video composition (voice→video escalation). Composition labels keyed by `session_id + startedAt` keep them distinguishable. Task 32 (transcript export — Plan 07) and Task 55 (timeline — Plan 09) both consume these.
3. **`modality_change:` prefix on `escalationRequestId` passed to Plan 08 wrapper.** Plan 08's `escalateToFullVideoRecording` expects an `escalationRequestId` that's normally a `video_escalation_audit.id`. For Plan 09's voice→video transition, the request is a `consultation_modality_history` row (or equivalent), not a video_escalation_audit row. Solution: Plan 08's wrapper accepts an opaque correlation string; this task passes `'modality_change:' + history_row_id` so the recording-audit ledger can still trace the origin without needing a matching `video_escalation_audit` row. Document in Plan 08 Task 43's code comment at PR time.
4. **Voice room creation reuses `videoSessionTwilioAdapter` with audioOnly=true** per Plan 05 Task 23's design. This task inherits. The same adapter's `endSession` is called for `voice → text`.
5. **`voice/video → text` rollback limitation.** Twilio `room.update({ status: 'completed' })` is one-way — can't un-complete a room. If the executor succeeds in disconnecting and then Task 47's transaction aborts for some reason, the old room is gone; the session's DB state rolls back to voice/video but the provider is out of sync. **Two mitigations:**
   - (a) Task 47 orders its transaction: executor call is the LAST step before commit. Minimises the window where DB-rollback could happen after the executor succeeded.
   - (b) If this edge case fires, log severity `critical` with enough context for manual ops intervention: "session X's DB rolled back to voice but Twilio room Y is completed. Recommend session end + re-book."
   - Accept this limitation as an ops-level edge case — extremely rare in practice because Task 47's only post-executor step is the DB commit.
6. **Companion chat channel survives transitions.** Verified at PR review time by reading Plan 06 Task 36's chat-channel key — it's `consultation_session_id`, not `provider_session_id`. Critical invariant.
7. **Access-token minting cost.** Twilio access tokens are JWTs signed locally — free. Room creation is the expensive call. Minting 2 tokens per text→voice/video transition is cheap.
8. **Same-modality no-op.** Throws `NoOpTransitionError` rather than returning silently because an unexpected same-modality call suggests a bug upstream; fail loud.
9. **Why `recordingSegmentRef` is a hint, not a write.** The executor tells Task 47 "an audio segment started / ended". Task 47 passes this to Task 53 for the system-message and to `consultation_modality_history.amount_paise`-adjacent metadata if needed. Executor doesn't directly write to `consultation_recording_audit` — that's Plan 07/08's domain, already wired to Plan 08 Task 43's internal ledger.
10. **Text→text, voice→voice, video→video.** Dispatcher throws immediately. No-op transitions shouldn't reach here (Task 47 Step 5 already catches them), but defence-in-depth.

---

## References

- **Plan:** [plan-09-mid-consult-modality-switching.md](../Plans/plan-09-mid-consult-modality-switching.md) — Executor section lines 184–209.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decisions 2 + 11 LOCKED.
- **Task 46 — schema read by executor via `session` input:** [task-46-modality-history-schema-and-counters-migration.md](./task-46-modality-history-schema-and-counters-migration.md).
- **Task 47 — caller:** [task-47-request-modality-change-state-machine.md](./task-47-request-modality-change-state-machine.md).
- **Plan 08 Task 43 — `recording-track-service` wrapper used here:** [task-43-recording-track-service-twilio-rules-wrapper.md](./task-43-recording-track-service-twilio-rules-wrapper.md).
- **Plan 05 Task 23 — `voice-session-twilio` adapter reused here:** [task-23-voice-session-twilio-adapter.md](./task-23-voice-session-twilio-adapter.md).
- **Plan 01 — `video-session-twilio` adapter reused here:** (upstream, present).
- **Plan 04 — `text-session-supabase` semantics for `→ text` transitions:** (upstream; no adapter action required on that path).
- **Plan 06 Task 36 — companion chat lifecycle, NOT touched by this task:** [task-36-companion-channel-lifecycle-hook.md](./task-36-companion-channel-lifecycle-hook.md).

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Not started — Plan 09's executor. Ships alongside Task 47 in Phase A. Hard-blocks on Task 46 + Plan 08 Task 43 + adapter availability from Plans 01/04/05.
