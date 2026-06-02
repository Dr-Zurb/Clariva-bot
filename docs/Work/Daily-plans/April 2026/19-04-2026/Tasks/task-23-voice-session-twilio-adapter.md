# Task 23: Backend `voice-session-twilio.ts` adapter (Twilio Video audio-only wrapper, Decision 2 LOCKED)

## 19 April 2026 — Plan [Voice consultation modality](../Plans/plan-05-voice-consultation-twilio.md) — Phase B

---

## Task overview

Plan 01 Task 15 shipped `consultation-session-service.ts` as a modality-blind facade with three adapter slots. Plan 04 Task 18 lit up the **text** slot. **Voice still throws** at `backend/src/services/consultation-session-service.ts:54-56`:

```ts
voice: () => {
  throw new InternalError('Voice adapter ships in Plan 05');
},
```

Task 23 lights up the voice slot and is the **first non-Supabase, non-text** adapter — it proves the facade pattern can also wrap an *existing* adapter (the Twilio Video one) instead of standing up a new provider integration.

Decision 2 LOCKED voice on **Twilio Video in audio-only mode**. The rationale (recap from the plan): same SDK works in India / US / UAE / Nigeria / Brazil at flat per-minute cost; ~$120/mo at 1k consults vs ~₹50k for India PSTN alone; voice↔video mid-consult switching (Decision 11) becomes "enable the camera track on the existing room" — same SID, no recreation, recording continuous.

Concretely, **the voice adapter is a thin wrapper around `videoSessionTwilioAdapter`**:

1. `createSession` provisions the same Twilio Video room the video adapter would, but the room is created with audio-recording rules and the access tokens are minted with no video grant. The frontend (Task 24) further enforces audio-only by never publishing a camera track.
2. `endSession` defers entirely to the video adapter's `endSession` (same Twilio resource teardown), then enqueues the post-consult voice transcription job (Task 25) once the audio Composition is ready.
3. `getJoinToken` defers entirely to the video adapter (same Twilio Video access token; the audio-only constraint is purely a publish-side decision the client makes — Twilio access tokens carry capability grants, not modality enforcement).

The adapter is **~150 lines** total. The bulk of the lift is in `videoSessionTwilioAdapter` (already shipped). What this task delivers that doesn't exist in the video adapter:

- An explicit `audioOnly: true` plumb-through so the `createTwilioRoom` call records audio-only and the Composition is configured to drop video tracks at finalization (defense-in-depth — the frontend doesn't publish video, but a tampered client could try).
- A post-`endSession` hook to enqueue voice transcription (Task 25 owns the actual enqueue helper).
- A registry wire-up that replaces the `throw` in `consultation-session-service.ts`.

This is the wiring spine of Plan 05. After this ships, Task 24's frontend has a backend to talk to.

**Estimated time:** ~2 hours (actual: ~1.5 hours — the video adapter was already well-shaped for wrapping; the bulk of the effort went into test wiring)

**Status:** Code-complete 2026-04-19 (manual Twilio smoke still pending — see Decision log)

**Depends on:** Plan 01 Task 15 (hard — facade + adapter slot exist; the `throw` to replace lives at `consultation-session-service.ts:54-56`). Plan 01 Task 16 (soft — `sendConsultationReadyToPatient` fan-out helper; the voice path through it works once Task 26 lights up the voice branch of `buildConsultationReadyDm`. If Task 26 hasn't shipped when Task 23 ships, the adapter still works — the fan-out helper will throw at copy-build time and the throw is logged + non-fatal to room creation. Document this risk in the task close-out). Task 25 (soft — `enqueueVoiceTranscription` is invoked from `endSession` here; if Task 25 hasn't landed yet, stub the call as a TODO that logs `info` and returns `void`, then wire for real once Task 25 ships).

**Plan:** [plan-05-voice-consultation-twilio.md](../Plans/plan-05-voice-consultation-twilio.md)

---

## Acceptance criteria

- [ ] **`backend/src/services/voice-session-twilio.ts` exists** exporting:
  ```ts
  import type { ConsultationSessionAdapter } from './consultation-session-service';

  /**
   * Voice adapter — thin wrapper around `videoSessionTwilioAdapter`.
   *
   * Decision 2 LOCKED: voice = Twilio Video audio-only. Same provider, same
   * webhook surface, same recording lifecycle — only the publish-side
   * constraints (no camera track) and the recording rules (audio-only
   * Composition) differ.
   *
   * The adapter is intentionally thin so voice↔video mid-consult switching
   * (Plan 09 / Decision 11) becomes "enable a camera track on the existing
   * Twilio Video room" — same SID, no recreation, recording continuous.
   */
  export const voiceSessionTwilioAdapter: ConsultationSessionAdapter;
  ```
  Implementation contract per method:
  - `createSession(input, correlationId)` — calls `videoSessionTwilioAdapter.createSession(input, correlationId)` directly, then **applies audio-only Recording Rules** to the freshly-created Twilio Video room via the new `applyAudioOnlyRecordingRules(roomSid, correlationId)` helper exported alongside the adapter (see below). Returns the same `AdapterCreateResult` the video adapter returns. The `provider` persisted in `consultation_sessions` stays `'twilio_video'` — the voice/video distinction lives on `consultation_sessions.modality`, not `provider`. Rationale: any downstream code that asks "what kind of room is this?" needs to read `modality`, not `provider`, because mid-consult voice→video switches keep the same `provider` row but flip `current_modality`.
  - `endSession(providerSessionId, correlationId)` — defers to `videoSessionTwilioAdapter.endSession`, then enqueues voice transcription via `enqueueVoiceTranscription({ providerSessionId })` (Task 25). If Task 25 hasn't shipped yet, the stub logs an `info` breadcrumb and returns; **never throws** — the consult is already over, transcription is non-blocking.
  - `getJoinToken(input, correlationId)` — defers entirely to `videoSessionTwilioAdapter.getJoinToken`. Returns the same `JoinToken` shape (access token + optional URL). The audio-only constraint is enforced client-side (Task 24) and at the recording rules layer; the access token itself carries the same capability grants as a video token.
- [ ] **`applyAudioOnlyRecordingRules(roomSid, correlationId)` helper** exported from the same file. Calls Twilio's `client.video.v1.rooms(roomSid).recordingRules.update({ rules: [{ type: 'include', kind: 'audio' }, { type: 'exclude', kind: 'video' }] })`. Logs success at `info` (no PHI). On failure: logs at `error` + throws an `InternalError` so `createSession` rolls back at the facade layer — recording-rule misconfiguration is a session-quality bug we want surfaced loudly, not silent. Helper is exported so a future "force audio-only mid-call" Decision 11 path can call it independently.
- [ ] **`consultation-session-service.ts` registry wire-up.** Replace the throw at `backend/src/services/consultation-session-service.ts:54-56`:
  ```ts
  // Before:
  voice: () => {
    throw new InternalError('Voice adapter ships in Plan 05');
  },
  // After:
  voice: () => voiceSessionTwilioAdapter,
  ```
  Also update the JSDoc on `ADAPTER_REGISTRY` (currently says "Voice still intentionally throws — it ships in Plan 05") to "Voice was wired up in Plan 05 · Task 23 (Twilio Video audio-only wrapper); see `voice-session-twilio.ts` for the contract".
- [ ] **No new env vars** introduced by this task. Reuses `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET` / `TWILIO_VIDEO_API_KEY_SID` / `TWILIO_VIDEO_API_KEY_SECRET` / `WEBHOOK_BASE_URL` exactly as the video adapter uses them. If a deployment has Twilio Video configured for video consults today, voice consults work with the same credentials.
- [ ] **No new migrations** in this task. The voice adapter writes through `persistSessionRow` (Task 15's helper) into the existing `consultation_sessions` table. The only field that distinguishes a voice session from a video session is `consultation_sessions.modality = 'voice'` (already supported by the column added in Migration 049).
- [ ] **Tests** in `backend/tests/unit/services/voice-session-twilio.test.ts` (NEW):
  - **Adapter is a thin wrapper** — `createSession` calls the video adapter exactly once with the unmodified `CreateSessionInput`; `endSession` calls the video adapter exactly once + enqueues transcription exactly once; `getJoinToken` calls the video adapter exactly once and returns its result verbatim.
  - **Audio-only recording rules applied** — after a successful `createSession`, the Twilio mock's `rooms(roomSid).recordingRules.update()` is called with `{ rules: [{ type: 'include', kind: 'audio' }, { type: 'exclude', kind: 'video' }] }`. Assertion is anchored on the rule shape, not the SDK call surface, so a future Twilio SDK version that exposes the same capability differently is caught.
  - **Recording-rule failure rolls the session back** — if `recordingRules.update()` rejects, `createSession` throws `InternalError` and the test asserts the error is propagated (no swallowing). The persistence layer's transactional behavior is owned by Task 15 — this test pins that the adapter doesn't catch + ignore.
  - **`endSession` survives transcription-enqueue failure** — when `enqueueVoiceTranscription` throws, `endSession` swallows the error, logs at `error`, and resolves successfully. The consult is already over — transcription is best-effort.
  - **Provider stays `'twilio_video'`** — the persisted `provider` field is `'twilio_video'`, not `'twilio_voice'`. Asserts on the `AdapterCreateResult` shape returned by the spy.
  - **Idempotency at the facade layer** — already covered by `consultation-session-service.test.ts`; this task adds a single integration assertion that the facade routes voice calls to this adapter (mirrors the existing video routing test).
- [ ] **Stub `enqueueVoiceTranscription`** ships in `backend/src/services/voice-transcription-service.ts` if Task 25 hasn't merged yet:
  ```ts
  /**
   * Stub — full implementation in Plan 05 Task 25.
   * Returns successfully so callers (the voice adapter's endSession) don't
   * fail when the transcription pipeline isn't wired yet.
   */
  export async function enqueueVoiceTranscription(input: { providerSessionId: string }): Promise<void> {
    logger.info(
      { providerSessionId: input.providerSessionId },
      'voice-transcription: enqueue stub fired (Task 25 lights up the real pipeline)',
    );
  }
  ```
  Task 25 replaces the body without changing the signature.
- [ ] **Smoke** (manual, gated by Twilio configuration): with `TWILIO_*` env vars set, call `consultation-session-service.ts#createSession({ modality: 'voice', ... })` against a real Twilio account → verify (a) a Twilio Video room is created, (b) the room's `recordingRules` field via the Twilio console shows the audio-only filter, (c) `consultation_sessions` row has `modality = 'voice'` and `provider = 'twilio_video'`. Documented as a step in the task close-out — gated on a sandbox Twilio account.
- [ ] **Type-check + lint clean** on touched files. Backend `npx tsc --noEmit` exit 0. `npx jest tests/unit/services/voice-session-twilio.test.ts` green plus full backend suite green (no regressions on the existing `consultation-session-service.test.ts` voice-throws assertion — that test must be updated in this PR to reflect the new "voice routes to voiceSessionTwilioAdapter" contract).

---

## Out of scope

- **`<VoiceConsultRoom>` UI.** Task 24 owns the audio-only frontend that uses the access tokens this adapter mints.
- **Voice transcription pipeline implementation.** Task 25 owns Whisper / Deepgram routing and the `enqueueVoiceTranscription` body; this task only consumes (and stubs if needed) the enqueue surface.
- **DM copy.** Task 26 lights up the voice branch of `buildConsultationReadyDm` and the booking-time payment-confirmation voice variant. Task 23 calls `sendConsultationReadyToPatient` from the inherited video-adapter flow; if Task 26 hasn't shipped, the fan-out throws at copy-build time and the throw is logged but does not break room creation.
- **Companion text channel inside voice consult.** Plan 06 owns that. The voice adapter does NOT provision a `consultation_messages` row or a Realtime channel — Plan 06 will add a `provisionCompanionChannel()` method to the adapter contract that voice + video both implement.
- **Mid-consult voice→video upgrade.** Plan 09 owns that and will reuse this adapter's room (toggling the Recording Rules to include video and the access tokens to grant a camera publish).
- **PSTN fallback.** Decision 2 LOCKED defers to v2+. The adapter interface is provider-agnostic so a per-region `voice-session-pstn.ts` can plug in later, but no PSTN code in this task.
- **Webhook handler extension for audio-only Composition.** Twilio Video webhooks (`backend/src/controllers/twilio-webhook-controller.ts`) already handle Composition finalization for both video and audio rooms — same payload shape, the recording-rules filter on the room side determines what tracks land in the Composition. Verified at PR-time; if the existing handler needs a branch, fold that in here as a small follow-up.
- **`consultation_sessions.current_modality` field for mid-consult switching.** Plan 09 owns that column; Task 23 writes only `modality` (the booked modality) on session create.

---

## Files expected to touch

**Backend:**

- `backend/src/services/voice-session-twilio.ts` — new (the adapter + `applyAudioOnlyRecordingRules` helper, ~150 lines total)
- `backend/src/services/voice-transcription-service.ts` — new **stub** (Task 25 lights up the body)
- `backend/src/services/consultation-session-service.ts` — replace the `throw` in the voice adapter slot with `return voiceSessionTwilioAdapter`; refresh the JSDoc on `ADAPTER_REGISTRY`

**Tests:**

- `backend/tests/unit/services/voice-session-twilio.test.ts` — new
- `backend/tests/unit/services/consultation-session-service.test.ts` — update the existing "voice modality throws — ships in Plan 05" assertion to match the new wiring (one-line diff)

**No frontend changes. No new migrations. No new env vars.**

---

## Notes / open decisions

1. **Why `provider = 'twilio_video'` and not `'twilio_voice'`?** The `provider` column is "what backend service-of-record is responsible for the live session". Voice and video both run on Twilio Video infrastructure; the voice/video distinction is a `modality` concern (which UI to render, which DM copy to send, which transcription pipeline to invoke). Inventing a `'twilio_voice'` provider would force every downstream consumer (webhooks, recording finalization, AI clinical assist in Plan 10) to branch on two values that mean the same thing. Decision 8 LOCKED says "generic provider; adapters carry the modality knowledge" — this task is the first proof point.
2. **Why Recording Rules instead of just letting the client publish audio-only?** Defense in depth. A custom client (a misconfigured Twilio React SDK call, a future test harness, an attacker) could publish a camera track even though the Twilio access token doesn't strictly require it. Recording Rules at the room level guarantee the **stored artifact** is audio-only regardless of what tracks were published. PHI/storage cost is unbounded otherwise.
3. **Recording Rules timing.** Twilio's documentation allows `recordingRules.update()` after room creation but before the first participant joins. The 5-min pre-consult cron (Plan 04 / Task 18) provisions the session well before any participant joins, so the timing window is generous. If a race condition surfaces in production where the doctor joins faster than the rule update, Twilio's API allows mid-room rule updates — the rule applies to **future tracks**. Document this in the helper's JSDoc.
4. **`endSession` transcription enqueue is fire-and-forget.** The audio Composition is finalized asynchronously by Twilio (typically 2-5 seconds after room close). The enqueue helper schedules the transcription job; the post-consult worker (Plan 02 work, or extended here) picks the job up only after the Composition is ready. This task's responsibility is just to wire the enqueue point; the worker's polling for Composition readiness is Task 25's responsibility.
5. **Why no new env vars?** Twilio Video already requires its credentials for the video flow today. Voice reuses them. Adding `TWILIO_VOICE_*` would imply two distinct Twilio configurations, which the architecture explicitly rejects (Decision 2 — one Twilio Video setup serves both voice and video).
6. **Smoke vs unit tests.** The unit suite asserts the *contract* between `voiceSessionTwilioAdapter` and the Twilio SDK / video adapter. The smoke test (manual, against a sandbox Twilio account) is the only way to verify the Recording Rules actually hit Twilio's control plane. Both are required for this task to be truly "done", but the smoke happens at PR-time, not in CI.
7. **Decision 11 ramp.** When Plan 09 / Task 36 (mid-consult switching) lands, the voice→video transition will:
   - Update `consultation_sessions.current_modality` from `'voice'` to `'video'`.
   - Call a new `enableVideoTracks(roomSid)` helper alongside `applyAudioOnlyRecordingRules` that flips the Recording Rules from `[include audio, exclude video]` to `[include audio, include video]`.
   - Grant the camera publish on the access token (Twilio access tokens are immutable; the client requests a new one).
   - The `consultation_sessions` row, the Twilio room SID, and the audio Composition all stay — the recording artifact for the voice segment captures cleanly, then a video Composition starts for the new segment.
   - This task's `applyAudioOnlyRecordingRules` is the seed of that future symmetry. Don't over-engineer it now; Plan 09 will add its sibling.
8. **Why a stubbed `voice-transcription-service.ts` instead of waiting on Task 25?** Task 23 must not be blocked on Task 25 — they ship in parallel per the plan's suggested order ("23 → 26 → 24-split → 25"). The stub keeps the wiring surface stable; Task 25 swaps the body without changing callers.

---

## References

- **Plan:** [plan-05-voice-consultation-twilio.md](../Plans/plan-05-voice-consultation-twilio.md) — Adapter contract section (the inline TypeScript snippet in the plan is the design source).
- **Master plan:** [plan-multi-modality-consultations.md](../Plans/plan-multi-modality-consultations.md) — Decision 2 LOCKED, Decision 8 LOCKED, Decision 12 LOCKED, Principle 8 LOCKED.
- **Plan 01 Task 15 — facade source the registry lives in:** [task-15-consultation-sessions-facade-and-schema.md](./task-15-consultation-sessions-facade-and-schema.md)
- **Plan 01 Task 16 — fan-out helper that the inherited video flow calls:** [task-16-notification-fanout-helpers.md](./task-16-notification-fanout-helpers.md)
- **Plan 04 Task 18 — sibling adapter (text-side) that proved the facade pattern:** [task-18-text-session-supabase-adapter.md](./task-18-text-session-supabase-adapter.md)
- **Plan 05 Task 25 — transcription pipeline this adapter enqueues for:** [task-25-voice-transcription-pipeline.md](./task-25-voice-transcription-pipeline.md)
- **Plan 05 Task 26 — voice DM copy this adapter triggers via the inherited fan-out:** [task-26-voice-dm-and-booking-copy-principle-8.md](./task-26-voice-dm-and-booking-copy-principle-8.md)
- **Existing video adapter (the wrapper target):** `backend/src/services/video-session-twilio.ts`
- **Existing facade (the registry to wire into):** `backend/src/services/consultation-session-service.ts:51-57`
- **Twilio Video Recording Rules API docs:** verify exact API at PR-time — the rule shape `{ type: 'include' | 'exclude', kind: 'audio' | 'video' | 'data' }` is documented in Twilio's REST reference under Video > Recording Rules.

---

**Owner:** TBD  
**Created:** 2026-04-19  
**Status:** Code-complete 2026-04-19 — adapter + helper + transcription stub + facade wire-up + test rewrite all landed. Manual Twilio smoke (verifying Recording Rules hit Twilio's control plane) still pending — gated on a sandbox Twilio account; tracked as a merge-time checklist below.

---

## Decision log

### 2026-04-19 — Code-complete

**What shipped**

1. **`backend/src/services/voice-session-twilio.ts`** (new, ~175 lines) — exports:
   - `voiceSessionTwilioAdapter: ConsultationSessionAdapter` with `modality: 'voice'` and `provider: 'twilio_video'`. Composes `videoSessionTwilioAdapter` in all three methods:
     - `createSession` → video adapter → `applyAudioOnlyRecordingRules(roomSid)`; InternalError on any failure (no silent fallback).
     - `endSession` → video adapter → `enqueueVoiceTranscription(providerSessionId)`; transcription-enqueue failure is swallowed + logged (the consult is already ended; non-blocking).
     - `getJoinToken` → defers entirely to the video adapter (audio-only is enforced client-side + at Recording Rules; the access token grants are identical).
   - `applyAudioOnlyRecordingRules(roomSid, correlationId)` — exported so a future Decision 11 "force audio-only mid-call" path (Plan 09 / Task 36) can invoke the rule update independently of `createSession`. Calls `client.video.v1.rooms(sid).recordingRules.update({ rules: [{ type: 'include', kind: 'audio' }, { type: 'exclude', kind: 'video' }] })`.
2. **`backend/src/services/voice-transcription-service.ts`** (new, stub) — exports `enqueueVoiceTranscription({ providerSessionId })`. Stub logs an info breadcrumb and resolves. Task 25 replaces the body **without changing the exported signature**.
3. **`backend/src/services/consultation-session-service.ts`** — registry wire-up:
   - Imported `voiceSessionTwilioAdapter`.
   - Replaced `voice: () => { throw new InternalError('Voice adapter ships in Plan 05'); }` with `voice: () => voiceSessionTwilioAdapter`.
   - Refreshed both the file-level JSDoc ("All three adapters are now registered…") and the `ADAPTER_REGISTRY` comment to describe the new wiring.
4. **`backend/src/services/video-session-twilio.ts`** — updated the file-level invariant comment to call out `voice-session-twilio.ts` as the second legitimate importer (alongside the facade). The PR-time grep invariant was refined accordingly:
   ```
   rg "from .*video-session-twilio" --type ts \
     | rg -v "consultation-session-service\.ts|voice-session-twilio\.ts|\.test\.ts"
   ```
   (must return empty — verified clean post-landing).
5. **`backend/tests/unit/services/voice-session-twilio.test.ts`** (new, 10 tests):
   - Adapter metadata (modality='voice', provider='twilio_video' — Decision 8 LOCKED pin).
   - `createSession` delegates to video adapter and applies Recording Rules with the exact `[include audio, exclude video]` payload.
   - `createSession` propagates Recording Rules failure as `InternalError` (no swallow).
   - `createSession` refuses when the video adapter returns no providerSessionId (defensive guard against future contract slippage).
   - `endSession` defers to video adapter + enqueues transcription.
   - `endSession` survives transcription-enqueue failure (logs + resolves).
   - `getJoinToken` defers entirely to video adapter.
   - `applyAudioOnlyRecordingRules` pays the exact rule shape to Twilio.
   - `applyAudioOnlyRecordingRules` throws `InternalError` on empty `roomSid`.
   - `applyAudioOnlyRecordingRules` wraps Twilio errors in `InternalError`.
   Rule-shape assertion is anchored on the payload (not the SDK call surface), so a future Twilio SDK version that exposes recording rules differently is still forced to match the contract.
6. **`backend/tests/unit/services/consultation-session-service.test.ts`** — replaced the "voice modality throws" assertion with "voice modality routes through `voiceSessionTwilioAdapter`". Adds a new module mock for `voice-session-twilio` (mirroring the existing `video-session-twilio` mock) and asserts:
   - The voice adapter's `createSession` fires exactly once.
   - The video adapter's `createSession` does NOT fire for a voice call (the voice adapter owns that delegation internally; this pins the facade-layer routing, not the voice adapter's internal wrapping).
   - The persisted row has `modality='voice'`, `provider='twilio_video'`.

**Verification**

- `npx tsc --noEmit` on backend — clean.
- `npx jest` — **100 suites / 1293 tests, all green** (10 net new tests vs. the Task 35 baseline).
- `ReadLints` on every touched file — zero errors.
- PR-time grep invariant (the `rg` line above) — clean; only `consultation-session-service.ts`, `voice-session-twilio.ts` (both legitimate) and `*.test.ts` (test-only) import from `video-session-twilio.ts`.

**Scope honored**

- No new env vars (reuses `TWILIO_*`).
- No new migrations (voice rides on `consultation_sessions.modality = 'voice'` + `provider = 'twilio_video'`; column types already permit this).
- No frontend changes (Task 24 owns the audio-only UI; Task 24 can now point at this adapter).
- No webhook-handler extension (the existing Twilio webhook path in `consultation-verification-service.ts` handles Composition finalization the same way for audio and video rooms; Recording Rules on the room side determine what tracks land in the Composition).

**Dependency status at landing**

- **Task 15 (hard dep):** already landed — the facade + adapter slot the registry lives in exist, and the `throw` at `consultation-session-service.ts:54-56` was the exact replacement target.
- **Task 25 (soft dep):** not yet landed. Stub ships here (`voice-transcription-service.ts`) with the exact signature Task 25 will implement against. The adapter swallows transcription-enqueue failures, so even when Task 25 lands with a real queue that has a transient outage, `endSession` remains green for the doctor/patient flow.
- **Task 26 (soft dep):** not yet landed. The voice path through `sendConsultationReadyToPatient` (inherited from the video-adapter fan-out) will throw at copy-build time until Task 26 lights up `buildConsultationReadyDm`'s voice branch — this is logged non-fatally by the fan-out helper. Room creation is not affected. Note: Task 23 does NOT call the fan-out helper directly; the caller (controllers / cron) decides whether to fan out. The throw surfaces only if a caller wires fan-out for a voice session before Task 26 lands.

**Smoke — manual, gated on a sandbox Twilio account (not in CI)**

Unit tests assert the contract between the adapter and the Twilio SDK / video adapter. The only way to verify Recording Rules actually hit Twilio's control plane is a manual smoke against a real account. Before declaring Task 23 production-ready:

- [ ] With `TWILIO_*` env vars pointed at a sandbox Twilio Video account, call `createSession({ modality: 'voice', appointmentId: <sandbox-apt>, … })` through the facade.
- [ ] Verify in the Twilio console that a Video room was created for `appointment-<id>`.
- [ ] Verify that the room's Recording Rules show `[include audio, exclude video]`.
- [ ] Verify a `consultation_sessions` row exists with `modality='voice'`, `provider='twilio_video'`, and `provider_session_id` matching the Twilio room SID.
- [ ] (Optional bonus) Publish an audio track from a test client; verify the resulting Composition drops video even if a (misbehaving) client attempts to publish a camera track.

**Open follow-ups tracked for Plan 09 / Task 36 (mid-consult modality switch)**

- Plan 09 will add a companion `enableVideoTracks(roomSid)` helper that flips the rules from `[include audio, exclude video]` to `[include audio, include video]` (same SID, same DB row). `applyAudioOnlyRecordingRules` is deliberately shaped to make that symmetric sibling trivial to author.
- When Task 25 lands, swap the `voice-transcription-service.ts` body for the real queue insert. No call-site change required.
- When Task 26 lands, the inherited fan-out's voice branch stops throwing. No adapter change required.
