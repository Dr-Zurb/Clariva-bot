# Task 43: `recording-track-service.ts` — Twilio Video Recording Rules API wrapper (audio-only ↔ audio+video toggling) (Decision 10 LOCKED · **keystone**)

## 19 April 2026 — Plan [Video recording escalation](../Plans/plan-08-video-recording-escalation.md) — Phase B

---

## Task overview

Decision 10 LOCKED the architectural posture: during a video consult **the same Twilio room SID** carries the entire call, but the Twilio Recording Rules applied to that room flip between three runtime states:

- **Audio-only (default):** tracks `include: audio` / `exclude: video`. Produces one or more audio Compositions as the call progresses (one per pause/resume segment — see Plan 07 Task 28).
- **Audio + video (escalated):** tracks `include: audio, video`. Produces an additional video Composition keyed by the escalation-start time; audio Composition continues in parallel.
- **Reverted to audio-only:** flip back to `include: audio` / `exclude: video`. The in-flight video Composition closes; audio continues uninterrupted.

**This task is the plan's keystone.** Every downstream Plan 08 task (40 doctor button, 41 consent service, 42 patient revoke, 44 replay toggle) calls into this service. If the Twilio API wrapper is wrong, the whole escalation flow is wrong — either "recording video without consent" (failure-closed: patient harm) or "doctor thinks recording is happening but it isn't" (failure-open: clinical-record loss).

The wrapper ships four calls: `startAudioOnlyRecording`, `escalateToFullVideoRecording`, `revertToAudioOnlyRecording`, `getRecordingArtifactsForSession`. It is **idempotent** (calling `startAudioOnlyRecording` twice in sequence is a no-op on the second call) and **stateful** (the service reads current rules from Twilio before flipping, never assumes state from memory).

**Critical dependency gap (flagged up-front):**

1. **Plan 07 Task 28** introduces a `recording-pause-service.ts` that wraps the same Twilio Recording Rules API for pause/resume. Task 43 either **shares that wrapper** (preferred — one Twilio-adapter file owns the rules mutation) or **runs parallel to it** (risky — two callers to the same API may produce interleaved race conditions). Decision needed at implementation time: **see Notes #1 for the recommended posture**. This task assumes a shared low-level adapter at `backend/src/adapters/twilio-recording-rules.ts` (new — introduced jointly by this task and Task 28's PR; whichever lands first owns the file).
2. **Plan 02 Task 29** (`consultation_recording_audit` + `recording_access_audit`) must land before the audit-write side effects in this task can succeed. Audit writes are structured as a ledger pattern (write `attempted` → do the API call → write `completed` / `failed`) exactly like Plan 07 Task 28, and the ledger rows are hard-blocked on that table existing.
3. **Plan 05 Task 23** already creates the Twilio video room with a default set of recording rules at `createSession` time. Task 43's `startAudioOnlyRecording` is called as part of `consultation-session-service.ts#createSession` for video consults (and at audio-only-revert) — the two need to agree on what "default recording rule" means. Decision 10 LOCKS the default at `include: audio` / `exclude: video` for every video consult; this task defines the single source of truth and Task 23 is refactored (lightly) to call in.

**Estimated time:** ~3 hours (above the plan's 2h estimate — the keystone risk + the Plan 07 wrapper coordination + the three-state state-machine unit matrix + the retry-on-failure side-channel all push above the estimate).

**Status:** ✅ Completed 2026-04-19. Dependency on Plan 02 Task 29 resolved by **Migration 064** (`consultation_recording_audit` already shipped as part of Plan 07 pause/resume). Dependency on Plan 07 Task 28 resolved by extending the **existing** `backend/src/services/twilio-recording-rules.ts` (the service was already introduced by Task 28 — we added mode-level helpers alongside the existing kind-level helpers rather than forking a new adapter file).

**Depends on:**

- Plan 02 Task 29 (hard — audit tables).
- Plan 07 Task 28 (coordination — shared `twilio-recording-rules.ts` adapter file).
- Plan 05 Task 23 (coordination — `createSession` for video should call `startAudioOnlyRecording` exactly once at room-create time rather than inline Twilio config; verify during implementation).
- Plan 06 Task 37 (soft — `emitSystemMessage` with `'video_recording_started' | 'video_recording_stopped'` events; needed for Task 41 but NOT called from this wrapper directly — the wrapper is side-effect-free beyond the Twilio API + the audit ledger).

**Plan:** [plan-08-video-recording-escalation.md](../Plans/plan-08-video-recording-escalation.md)

---

## Acceptance criteria

### Low-level adapter — `backend/src/adapters/twilio-recording-rules.ts` (NEW — coordinated with Plan 07 Task 28)

- [x] Single module exporting three functions. Pure Twilio interaction; no audit writes, no system messages, no session-service calls. Thin wrapper so it can be fully unit-tested against a mock Twilio client without pulling in Supabase. — **Shipped as an extension of the pre-existing `backend/src/services/twilio-recording-rules.ts`** (the adapter already introduced by Plan 07 Task 28). Added `getCurrentRecordingMode`, `setRecordingRulesToAudioOnly`, `setRecordingRulesToAudioAndVideo`, plus `TwilioRoomNotFoundError` + `RecordingMode` type. Kept audit-free and session-free. The file lives under `services/` (not `adapters/`) because Task 28 already established that convention; both tasks share one file rather than forking into `adapters/`.

  ```ts
  // backend/src/adapters/twilio-recording-rules.ts

  import type { Twilio } from 'twilio';

  export type RecordingRuleShape =
    | { mode: 'audio_only' }          // include: audio, exclude: video
    | { mode: 'audio_and_video' };    // include: audio, video

  export interface GetRulesResult {
    current: RecordingRuleShape;
    fetchedAt: Date;
  }

  export async function getCurrentRecordingRules(
    client: Twilio,
    roomSid: string,
  ): Promise<GetRulesResult>;

  export async function setRecordingRulesToAudioOnly(
    client: Twilio,
    roomSid: string,
  ): Promise<void>;
  // Idempotent. No-op if getCurrentRecordingRules() already returns audio_only.

  export async function setRecordingRulesToAudioAndVideo(
    client: Twilio,
    roomSid: string,
  ): Promise<void>;
  // Idempotent. No-op if getCurrentRecordingRules() already returns audio_and_video.
  ```

- [x] **Idempotency rule:** every `set*` function reads current rules first via `getCurrentRecordingMode` and short-circuits if already in the target state (unit-tested). Prevents accidental double-writes that Twilio may re-price as separate recording sessions.
- [x] **Error handling:** Twilio 404 (`room not found`) → throws a typed `TwilioRoomNotFoundError` (unit-tested). Other Twilio errors → rethrown as `InternalError` with the original cause attached. Retry policy stays in the caller.
- [x] **No caching in the adapter.** `getCurrentRecordingMode` reads Twilio state fresh on every call. (The 60s per-session cache lives in `recording-track-service.getRecordingArtifactsForSession` — the artifact read path — not in the rule-flip path.)

### Service-level wrapper — `backend/src/services/recording-track-service.ts` (NEW — Task 43's deliverable)

- [x] Four public functions matching the plan shape, **each wrapped in a correlation-id ledger** (signature shipped with an additional `initiatedBy` on `startAudioOnlyRecording` + `reason`/`initiatedBy` on `revertToAudioOnlyRecording` + `doctorId`/`escalationRequestId` on `escalateToFullVideoRecording` to match actual caller needs):

  ```ts
  // backend/src/services/recording-track-service.ts

  import { v4 as uuidv4 } from 'uuid';
  import type { SupabaseClient } from '@supabase/supabase-js';
  import type { Twilio } from 'twilio';
  import {
    getCurrentRecordingRules,
    setRecordingRulesToAudioOnly,
    setRecordingRulesToAudioAndVideo,
  } from '../adapters/twilio-recording-rules';

  export interface ArtifactRef {
    compositionSid: string;     // Twilio Composition SID
    kind: 'audio' | 'video';
    startedAt: Date;
    endedAt: Date | null;       // null while in-flight
    durationSeconds: number | null;
  }

  export async function startAudioOnlyRecording(input: {
    sessionId: string;
    roomSid: string;
    initiatedBy: 'system' | 'doctor_revert' | 'patient_revoke';
    correlationId?: string;
  }): Promise<{ correlationId: string }>;

  export async function escalateToFullVideoRecording(input: {
    sessionId: string;
    roomSid: string;
    doctorId: string;
    escalationRequestId: string;    // FK to video_escalation_audit.id
    correlationId?: string;
  }): Promise<{ correlationId: string; escalationStartedAt: Date }>;

  export async function revertToAudioOnlyRecording(input: {
    sessionId: string;
    roomSid: string;
    reason: 'doctor_paused' | 'patient_revoked' | 'system_error_fallback';
    initiatedBy: 'doctor' | 'patient' | 'system';
    correlationId?: string;
  }): Promise<{ correlationId: string }>;

  export async function getRecordingArtifactsForSession(input: {
    sessionId: string;
  }): Promise<{
    audioCompositions: ArtifactRef[];
    videoCompositions: ArtifactRef[];
  }>;
  ```

- [x] **Ledger write doctrine (matches Plan 07 Task 28):** **Shipped with a refinement** — status lives in `metadata.status` JSONB (`attempted` / `completed` / `failed`), NOT in the action name. This matches Migration 064 Task 28's existing posture exactly (`recording_paused` + `metadata.status='attempted'|'completed'|'failed'`) rather than creating a new mixed auditing grammar. See the Action enum section below for the full rationale.
  1. `INSERT INTO consultation_recording_audit { session_id, action: '<rule_flip>_attempted', correlation_id, ... }` with `status='attempted'`.
  2. Call the adapter (`setRecordingRulesToAudioOnly` / `setRecordingRulesToAudioAndVideo`).
  3. On success: `INSERT INTO consultation_recording_audit { action: '<rule_flip>_completed', correlation_id }` with `status='completed'`.
  4. On failure: `INSERT INTO consultation_recording_audit { action: '<rule_flip>_failed', correlation_id, error_code }` with `status='failed'`. Rethrow.
  - Both ledger rows share `correlation_id` so downstream analytics can join attempted ↔ completed.
  - Ledger rows go into **Plan 02 Task 29's `consultation_recording_audit` table** — hard dependency.

- [x] **Action enum additions — REFINED to match existing ledger grammar.** Migration 064's `recording_audit_action` ENUM already stores status in `metadata.status`, so status-suffixed values (`*_attempted` / `*_completed` / `*_failed`) would have created two parallel conventions in one table. Shipped **`backend/migrations/071_recording_audit_action_video_values.sql`** which additively extends the ENUM with exactly two new values:
  - `video_recording_started` — written when `escalateToFullVideoRecording` flips rules to `include: audio, video`.
  - `video_recording_reverted` — written when `revertToAudioOnlyRecording` flips rules back (reason + initiatedBy captured in `metadata`).
  - `recording_started` (already in the ENUM) is reused by `startAudioOnlyRecording` at session-create time, so no new value needed for the baseline call.
  - `patient_revoked_video_mid_session` already existed in Migration 064 and is reserved for Task 42's intent-level audit row (caller responsibility; `recording-track-service.ts` does not write it).
  - Migration is `ADD VALUE IF NOT EXISTS` + `COMMENT ON TYPE` update; idempotent and re-runnable.

- [x] **`startAudioOnlyRecording` is idempotent across call sites — REFINED to two, not three:**
  - ✅ `consultation-session-service#createSession` calls it once for **video** consults (wired in this task; voice intentionally unchanged — voice adapter already sets its own audio-only rules inline via `applyAudioOnlyRecordingRules`, and double-wiring would fire two ledger rows per voice session for zero benefit).
  - ✅ `revertToAudioOnlyRecording` does **not** delegate to `startAudioOnlyRecording` — instead both functions share the same `setRecordingRulesToAudioOnly` adapter primitive. Rationale: delegating would stack two ledger rows (one `video_recording_reverted` + one `recording_started`) for the same flip, which muddies the audit trail. Revert is its own first-class event.
  - ❌ `recording-pause-service.resumeRecording` is **NOT** wired to call `startAudioOnlyRecording`. Reason: the two functions operate at different abstraction levels — `resumeRecording` is kind-scoped (flips audio rule back on after a pause) and `startAudioOnlyRecording` is mode-scoped (sets the full audio-only posture, which would overwrite in-flight video). Task 28's `resumeRecording` stays kind-scoped. This divergence from the original task spec is documented in the implementation log.
  - Adapter still short-circuits at the Twilio level if already audio-only — no double-Compositions.

- [x] **`escalateToFullVideoRecording` returns a `escalationStartedAt` timestamp** captured via `new Date()` at call-entry time and surfaced to the caller so Task 41 / Task 44 can label the resulting video Composition (Twilio auto-names the file on the server side; we store the readable label in `metadata.escalation_started_at` on the audit ledger rows).

- [x] **`getRecordingArtifactsForSession`** delegates to `listCompositionsForRoom` (new helper in `twilio-compositions.ts`), splits results by `includeVideo: bool` into `audioCompositions` / `videoCompositions`, sorts each by `startedAt` ASC, and drops rows with neither audio nor video. **Caching:** per-session 60-second in-memory `Map` (`artifactCache`). Cache is explicitly busted by `escalateToFullVideoRecording`, `revertToAudioOnlyRecording`, and `startAudioOnlyRecording` (all three mutate the artifact set). A `__resetArtifactCacheForTests()` helper is exported for test isolation.

- [x] **Failure mode: Twilio API call fails during a rule-flip.** The service:
  - Writes the `attempted` ledger row before the adapter call.
  - On adapter throw: writes a `failed` ledger row (wrapped in `tryInsertFailedRow` so a DB failure during the error path never masks the original Twilio error) and rethrows the original error.
  - Never emits system messages or retries at this layer — those responsibilities stay with Task 41 (retry + patient-facing messaging) and Task 42 (patient-revoke) per the adapter-stays-deterministic posture.

### Wiring

- [x] **`backend/src/services/consultation-session-service.ts#createSession`** — after `persistSessionRow` returns for a video session with a `providerSessionId` (roomSid), invoke `startAudioOnlyRecording({ sessionId, roomSid, initiatedBy: 'system', correlationId })`. Wrapped in `try/catch` so a baseline-establishment failure never blocks session creation (the session row is already persisted and the caller gets a usable session back; the ledger `failed` row + structured log preserves the audit trail). Voice sessions intentionally skipped — `voice-session-twilio.ts` already applies audio-only rules inline and wiring both paths would double-ledger.
- [x] **No direct call sites from the patient-replay path.** `recording-track-service.ts` remains write-side; the replay surfaces (`recording-access-service.ts` + Task 32 transcript + Task 44 video toggle) are the read-side consumers of `getRecordingArtifactsForSession`.

### Unit-test coverage

- [x] **`backend/tests/unit/services/twilio-recording-rules.test.ts`** — EXTENDED (file pre-existed from Task 28). New cases added for the mode-level helpers:
  - `getCurrentRecordingMode` returns `'audio_only'`, `'audio_and_video'`, and `'other'` correctly based on rule shape.
  - `getCurrentRecordingMode` throws `TwilioRoomNotFoundError` on Twilio 404.
  - `getCurrentRecordingMode` rethrows non-404 Twilio errors as `InternalError`.
  - `setRecordingRulesToAudioOnly` short-circuits when already audio-only (asserts Twilio PATCH not called).
  - `setRecordingRulesToAudioOnly` sends the correct PATCH body when flipping from audio+video.
  - `setRecordingRulesToAudioAndVideo` short-circuits when already audio+video.
  - `setRecordingRulesToAudioAndVideo` sends the correct PATCH body when flipping from audio-only.
- [x] **`backend/tests/unit/services/recording-track-service.test.ts`** (NEW) — 100% green. Cases covered:
  - `startAudioOnlyRecording` · system baseline path: writes `recording_started` (attempted + completed), uses `SYSTEM_ACTOR_UUID`, does NOT look up session (zero DB-session query); actor is `system`.
  - `startAudioOnlyRecording` · doctor / patient revert paths: writes `video_recording_reverted` with the correct `initiatedBy` + actor (`doctor` resolves to session's `doctor_id`; `patient` resolves to `patient_id`; missing `patientId` safely falls back to `SYSTEM_ACTOR_UUID`).
  - `startAudioOnlyRecording` · failure: `failed` ledger row written with error metadata, error rethrown, no `completed` row.
  - `startAudioOnlyRecording` · input validation on `sessionId` / `roomSid`.
  - `escalateToFullVideoRecording`: writes `video_recording_started` × 2 (attempted + completed) with `escalation_request_id`, `doctor_id`, `initiated_by` in metadata; returns a fresh `escalationStartedAt`; validates `doctorId` / `escalationRequestId`; failure path writes `failed` + rethrows.
  - `revertToAudioOnlyRecording`: writes `video_recording_reverted` with `reason` + `initiatedBy` in metadata; resolves actor per `initiatedBy`; validates `reason` / `initiatedBy`.
  - `getRecordingArtifactsForSession`: empty lists when session missing or `providerSessionId` null; splits by `includeVideo`; sorts by `startedAt` ASC; drops compositions with neither audio nor video.
  - Cache: two back-to-back calls within 60s make one `listCompositionsForRoom` call; cache is busted after `escalateToFullVideoRecording` + `revertToAudioOnlyRecording` + `startAudioOnlyRecording`.
- [x] **`backend/tests/unit/services/consultation-session-service-recording-baseline-hook.test.ts`** (NEW) — dedicated wiring test for the `createSession` hook. Covers: video + providerSessionId → `startAudioOnlyRecording` called once with `initiatedBy:'system'` + correct ids; voice session → not called; text session → not called; video without `providerSessionId` → not called (guard rail); hook throw → `createSession` still returns the session row (graceful degradation).
- [x] **`backend/tests/unit/migrations/recording-audit-action-video-values-migration.test.ts`** (NEW) — content-sanity for Migration 071: header citation, idempotent `ADD VALUE IF NOT EXISTS`, `COMMENT ON TYPE` updated, no accidental `_attempted|_completed|_failed` values, no `DROP VALUE / RENAME VALUE / DROP TYPE` (comment-stripped to avoid false positives from commented-out reverse-migration guidance).
- [ ] **Opt-in integration test against Twilio sandbox** — DEFERRED as inbox follow-up (see below). Rationale: the repo has no Twilio sandbox harness; the unit suite covers the state-machine + adapter surface exhaustively with mocks, which is sufficient to unblock downstream Plan 08 tasks (40, 41, 42, 44). Integration will land as part of the broader Plan 08 end-to-end harness alongside Task 41.

### Observability

- [x] Every call logs `{ correlationId, sessionId, action, durationMs }` via `logger.info` on success and `logger.error` (with the original Twilio error attached) on failure. Twilio request id is available via the underlying `twilio-recording-rules.ts` logging layer.
- [x] Failure-counter metric emission is deferred — currently the `failed` ledger row IS the counter (`SELECT COUNT(*) WHERE action IN ('video_recording_started','video_recording_reverted','recording_started') AND metadata->>'status' = 'failed'`). This is sufficient for v1 offline analytics.
- [x] **Critical-log / alarm hook** — every `failed` ledger write is accompanied by a `logger.error` with the action + session id + original error. Captured in `docs/capture/inbox.md` as a Plan 2.x follow-up to route `critical` logs to the on-call channel.

### Type-check + lint clean

- [x] Backend `npx tsc --noEmit` exit 0. Full backend jest suite: **135 suites / 1746 tests / 66 snapshots** green. `ReadLints` clean on all touched files.

---

## Out of scope

- **Dual-rule-set-per-composition.** Twilio Recording Rules apply to the room, not per-participant. A future requirement "record doctor's camera but not patient's" is structurally impossible at the rule level; would need a per-participant track-publish control on the client. v1 does not attempt it.
- **Audio-only-during-escalation fallback for bandwidth degradation.** If network drops mid-escalation, Twilio's recording continues as best-effort; the wrapper does not actively monitor bandwidth and downgrade the recording rule. v1.1 could add a network-quality signal from the Twilio Video SDK.
- **Persistent Composition SID caching per session.** `getRecordingArtifactsForSession` is a live Twilio query every ~60s. A DB-backed cache keyed by `session_id` with a worker that polls Twilio on session-end would lower the API call count but adds complexity. v1 keeps it simple.
- **Re-entrance safety when two callers escalate simultaneously.** Doctor can only have one in-flight `requestVideoEscalation` at a time (enforced at the service layer in Task 41); there's no realistic scenario where two `escalateToFullVideoRecording` calls race. If a future PR enables multi-doctor consults, the wrapper needs a distributed lock.
- **Video Composition track layout customisation.** Twilio offers layout presets (grid, presenter, etc.); v1 uses the default grid layout for video Compositions. Configurable at `escalateToFullVideoRecording` input in v1.1.
- **Signed URL minting.** That's `recording-access-service.ts`'s job (Plan 07 Task 29, extended in Task 44). This wrapper only reads/writes Compositions.
- **Front-end changes.** None in Task 43 — Task 40 + Task 42 do the UI. This task is backend-only.

---

## Files expected to touch

**Backend (new):**

- `backend/src/services/recording-track-service.ts` — service-level four-function API (`startAudioOnlyRecording` / `escalateToFullVideoRecording` / `revertToAudioOnlyRecording` / `getRecordingArtifactsForSession`), correlation-id ledger, actor resolution, 60s artifact cache.
- `backend/migrations/071_recording_audit_action_video_values.sql` — additive `ALTER TYPE ... ADD VALUE IF NOT EXISTS` for `video_recording_started` + `video_recording_reverted` + `COMMENT ON TYPE` refresh.

**Backend (extend):**

- `backend/src/services/twilio-recording-rules.ts` — added mode-level helpers alongside existing kind-level helpers: `getCurrentRecordingMode`, `setRecordingRulesToAudioOnly`, `setRecordingRulesToAudioAndVideo`, `TwilioRoomNotFoundError`, `RecordingMode`. File was already introduced by Plan 07 Task 28; the two tasks now share it.
- `backend/src/services/twilio-compositions.ts` — added `listCompositionsForRoom` + `RoomCompositionSummary` + `ListByRoomOverride` test seam. Returns empty for unknown rooms; paginates up to 20 compositions with a warn log if the cap is hit.
- `backend/src/services/consultation-session-service.ts#createSession` — video-only wiring to `startAudioOnlyRecording` with graceful error handling (session create does not block on baseline ledger failure).

**Tests (new / extended):**

- `backend/tests/unit/services/recording-track-service.test.ts` (NEW — service-level state machine + cache).
- `backend/tests/unit/services/consultation-session-service-recording-baseline-hook.test.ts` (NEW — wiring contract for video / voice / text / missing-roomSid / hook-throws paths).
- `backend/tests/unit/services/twilio-recording-rules.test.ts` (EXTENDED — mode-level helpers + 404 path).
- `backend/tests/unit/migrations/recording-audit-action-video-values-migration.test.ts` (NEW — content-sanity).

**No frontend changes.**

---

## Notes / open decisions

1. **Adapter ownership (Plan 07 Task 28 vs Plan 08 Task 43).** Recommend the adapter file be created by whichever task lands first, with the other task's PR importing it. The adapter has a narrow API surface (three functions) and a tight semantic role — "mutate Twilio Recording Rules on one room" — so both tasks naturally share it. If Plan 07 Task 28 has already shipped `backend/src/adapters/twilio-recording-rules.ts`, Task 43 imports it as-is and adds no new adapter code. Conversely if Task 43 lands first, Task 28 imports. **Anti-pattern:** two adapter files, one per task. The Twilio Recording Rules API is a shared resource; two wrappers competing to mutate it will produce race conditions eventually.
2. **Retry policy lives in the caller, not the adapter.** The adapter is deterministic: one call = one Twilio API attempt. Retries happen in Task 41 (one retry on transient Twilio failure) and are NOT layered into the adapter. Reason: retries that the caller isn't aware of silently mask failures. Audit ledger needs to reflect the attempt-count truth.
3. **Why no `state` column in `consultation_sessions` tracking current recording rule?** Tempting but wrong — the source of truth is Twilio; DB state would drift on every edge case (app crash mid-ledger-write; Twilio webhook delivered but DB write lost). The adapter's `getCurrentRecordingRules` reads from Twilio per-call; the DB audit ledger is append-only history.
4. **Idempotency and double-writes.** Twilio MAY treat back-to-back identical Recording Rules updates as two separate billable operations or two separate recording sessions (behaviour is not crisp in their docs). The adapter's short-circuit avoids that. Integration test must verify: `setRecordingRulesToAudioOnly` twice produces one audio Composition, not two.
5. **Composition file naming.** `consult_{session_id}_video_{ISO_8601_timestamp}.mp4` per plan open question #5. The wrapper doesn't set the filename directly (Twilio auto-names); the wrapper stores a human-readable name in the audit ledger's `composition_sid_label` column. If Task 45's migration doesn't already have this column, add via Task 43's bundled migration.
6. **Why the adapter doesn't emit system messages.** Separation of concerns: the adapter deals with Twilio; the service writes audit; system messages are a UX concern, emitted by the caller (Task 41). Mixing them in the adapter would tangle the Twilio-mock in unit tests with a `consultation_messages`-write mock, making tests harder. Adapter stays pure.
7. **Default rule vs bulk-default-at-room-create.** Twilio rooms can be created with an initial recording rule. Plan 05 Task 23 sets the default at room-create to audio-only. Task 43's `startAudioOnlyRecording` called at `createSession` time is therefore a no-op for the first call (adapter short-circuits); its real job is to write the audit ledger row so the audit trail is complete from T0. Document in the code comment.
8. **Video Composition closes on revert — what happens to the in-flight segment?** Twilio finalises the Composition when the rule flips. Patient revoke mid-call = close the video Composition at t=now; the rest of the call continues audio-only. A new escalation later in the same call produces a *second* video Composition. `getRecordingArtifactsForSession` returns a list, not a single artifact.
9. **Backpressure on rapid flip.** Doctor shouldn't be able to escalate-revert-escalate-revert in a loop (DoS on Twilio API + multiple Compositions bloat artifact count). Task 41's rate-limit (max 2 escalations per consult) is the backstop. Task 43 doesn't add a second rate-limit.
10. **`doctorId` parameter on `escalateToFullVideoRecording` — why not derive from session?** The session may have multiple providers in the future (joined doctor + reviewer). Explicit `doctorId` at call time pins WHO initiated, for the audit trail. v1 a session only has one doctor so this is redundant, but the extra param is cheap and future-proofs.
11. **Caching `getRecordingArtifactsForSession` by session** (Notes above). The cache is per-process Node memory, not Redis / Supabase. Multiple backend pods will each maintain their own cache — acceptable because the replay page re-fetches on navigation and cache-bust hooks fire locally only. If the backend grows to >10 pods, revisit.

---

## References

- **Plan:** [plan-08-video-recording-escalation.md](../Plans/plan-08-video-recording-escalation.md) — Task 43 section lines 81–113 + open questions #5, #6.
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 10 LOCKED.
- **Plan 07 Task 28 — shared adapter coordination:** [task-28-recording-pause-resume-mid-consult.md](./task-28-recording-pause-resume-mid-consult.md).
- **Plan 05 Task 23 — existing room-create recording rules:** [task-23-voice-session-twilio-adapter.md](./task-23-voice-session-twilio-adapter.md) (same pattern used for voice, audio-only rule at room-create).
- **Plan 02 Task 29 — audit tables this task writes into:** (upstream, not yet drafted).
- **Task 41 — caller that will retry on transient failure:** [task-41-patient-video-consent-modal-and-escalation-service.md](./task-41-patient-video-consent-modal-and-escalation-service.md).
- **Task 44 — consumer of `getRecordingArtifactsForSession`:** [task-44-recording-replay-player-video-toggle-and-otp.md](./task-44-recording-replay-player-video-toggle-and-otp.md).
- **Twilio Video Recording Rules API:** https://www.twilio.com/docs/video/api/recording-rules — verify the exact PATCH body shape at PR review time (plan line 366).

---

**Owner:** AI pair · Abhishek  
**Created:** 2026-04-19  
**Completed:** 2026-04-19  
**Status:** ✅ Completed — Plan 08's keystone backend landed. Unblocks Task 40 (doctor escalation button), Task 41 (patient consent modal + escalation orchestration), Task 42 (patient revoke), Task 44 (replay video toggle).

---

## Implementation log (2026-04-19)

### What shipped

The service exposes four calls exactly as Decision 10 locked:

```ts
startAudioOnlyRecording(input: {
  sessionId: string;
  roomSid: string;
  initiatedBy: 'system' | 'doctor_revert' | 'patient_revoke';
  correlationId?: string;
}): Promise<{ correlationId: string }>

escalateToFullVideoRecording(input: {
  sessionId: string;
  roomSid: string;
  doctorId: string;
  escalationRequestId: string;
  correlationId?: string;
}): Promise<{ correlationId: string; escalationStartedAt: Date }>

revertToAudioOnlyRecording(input: {
  sessionId: string;
  roomSid: string;
  reason: 'doctor_paused' | 'patient_revoked' | 'system_error_fallback';
  initiatedBy: 'doctor' | 'patient' | 'system';
  correlationId?: string;
}): Promise<{ correlationId: string }>

getRecordingArtifactsForSession(input: { sessionId: string })
  : Promise<{ audioCompositions: ArtifactRef[]; videoCompositions: ArtifactRef[] }>
```

Under the hood:

1. **Adapter layer (`services/twilio-recording-rules.ts`, extended).** `getCurrentRecordingMode` reads the live Twilio rules and classifies them as `audio_only | audio_and_video | other`. `setRecordingRulesToAudioOnly` / `setRecordingRulesToAudioAndVideo` first call `getCurrentRecordingMode` and short-circuit if already in the target mode, otherwise emit PATCHes via `includeAllParticipantsInRecording` / `excludeAllParticipantsFromRecording` (existing primitives from Task 28). Twilio 404 → `TwilioRoomNotFoundError`; other Twilio failures → `InternalError` with cause attached.

2. **Service layer (`services/recording-track-service.ts`, new).** Each mutating call follows the Migration 064 ledger doctrine: write `attempted` → call adapter → write `completed` on success / `failed` on throw → rethrow original error. Ledger writes use `insertAuditRow` (Supabase admin client) and `tryInsertFailedRow` (wraps the failure write in its own try/catch so a DB failure during the error path doesn't mask the original Twilio error).

3. **Actor resolution.** `resolveActor(sessionId, initiatedBy)` returns `{ actionBy, actionByRole }`. `system` → `SYSTEM_ACTOR_UUID` + `'system'`. `doctor` / `patient` → looked up from `consultation_sessions` (with graceful fallback to `SYSTEM_ACTOR_UUID` if the patient id is null — e.g. staff-booked consults where the patient Supabase auth row doesn't exist yet).

4. **Cache.** `getRecordingArtifactsForSession` keeps a per-session in-memory `Map` with a 60s TTL. The cache is explicitly busted by every rule-flip on the same session. A `__resetArtifactCacheForTests()` hook is exported for test isolation.

### Deliberate divergences from the original spec

1. **Adapter lives under `services/`, not `adapters/`.** Plan 07 Task 28 already shipped `backend/src/services/twilio-recording-rules.ts` with that convention. Moving/renaming would have churned Task 28's callers and test files for no semantic gain, so Task 43 extended the existing file.

2. **ENUM extension: 2 values, not 6.** Migration 064's `recording_audit_action` ENUM stores status (`attempted` / `completed` / `failed`) in `metadata.status` JSONB — NOT in the action name. Original task spec asked for six status-suffixed values (`video_escalation_attempted` / `_completed` / `_failed` + `audio_only_revert_*`), which would have introduced a parallel auditing grammar. We kept the existing convention and added only `video_recording_started` + `video_recording_reverted`. `startAudioOnlyRecording`'s system-baseline path reuses the pre-existing `recording_started` value.

3. **`revertToAudioOnlyRecording` does NOT delegate to `startAudioOnlyRecording`.** Both functions now share the `setRecordingRulesToAudioOnly` adapter primitive but write their own ledger rows. Delegation would have stacked two audit rows per revert (`video_recording_reverted` + `recording_started`), which confuses downstream analytics about "who triggered what". Revert is its own first-class event.

4. **`recording-pause-service.resumeRecording` does NOT call `startAudioOnlyRecording`.** Original spec listed three call sites; we kept two. `resumeRecording` is kind-scoped (flips the audio-kind rule back on after a pause — reversible operation) whereas `startAudioOnlyRecording` is mode-scoped (sets the full audio-only posture, which would overwrite in-flight video rules). Wiring them together would let a resume-after-pause accidentally kill a live video-recording session. Pause/resume semantics stay scoped to Task 28; Task 43 owns the mode flips.

5. **Voice `createSession` wiring skipped.** `voice-session-twilio.createSession` already calls `applyAudioOnlyRecordingRules` inline when it provisions the Twilio room. Adding a second call to `startAudioOnlyRecording` would double-ledger every voice session for zero behavioural benefit. Only video `createSession` is wired.

6. **Integration test deferred.** The repo has no Twilio sandbox harness; the unit suite exercises the state machine + adapter boundary exhaustively with mocks, which is sufficient to unblock downstream Plan 08 tasks. Integration will land alongside the broader Plan 08 end-to-end harness (Task 41's PR is the natural home).

### Verification

- `npx tsc --noEmit` — exit 0.
- Full backend jest suite: **135 suites / 1746 tests / 66 snapshots** green.
- `ReadLints` on all touched files — clean.
- Targeted runs:
  - `recording-track-service.test.ts` — 21 cases, all green.
  - `consultation-session-service-recording-baseline-hook.test.ts` — 5 cases, all green.
  - `twilio-recording-rules.test.ts` (pre-existing + new mode-level cases) — all green.
  - `recording-audit-action-video-values-migration.test.ts` — all green.

### Downstream impact / follow-ups

- **Task 40 / 41 / 42 / 44** are now unblocked at the service layer. They call into this module directly; no further plumbing work needed.
- **Task 45's migration** (access_type column + replay audit extensions) is independent of this task — they touch different tables.
- **Inbox items carried forward:** (a) Twilio sandbox integration harness; (b) route critical `logger.error` calls to an on-call channel; (c) promote artifact cache to Redis if backend pod count ≥ 4.
