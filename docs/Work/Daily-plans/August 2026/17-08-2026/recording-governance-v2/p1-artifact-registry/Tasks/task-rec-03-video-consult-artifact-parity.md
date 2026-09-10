# Task rec-03: Video-consult artifact parity

## 17 Aug 2026 — Batch [p1-artifact-registry](../plan-p1-recording-governance-v2-artifact-registry-batch.md) — Wave 3 — **M, ~3h**

---

## Task overview

REC-D20: *video consults produce artifact rows for their audio composition, at parity with voice.* Today they produce none, and that is finding #1.

The asymmetry is structural, not accidental. `enqueueVoiceTranscription` is called from exactly one place — `voice-session-twilio.ts:192`, the **voice** adapter's `endSession`. The video adapter has no equivalent. And even a stray call would not help: `enqueueVoiceTranscription` resolves its session by provider `'twilio_video_audio'` (`voice-transcription-service.ts:156–157`), while video sessions carry `'twilio_video'`. So a video consult gets no `consultation_transcripts` row, which means no Path B, which — combined with an empty index — means no artifact at all.

This task makes a video consult's **audio** composition reach the registry on the same terms as voice. It is explicitly **not** about transcribing video.

**Estimated time:** ~3h
**Status:** ✅ Implemented 2026-08-18 — video already inherits coverage; no source wiring. Tests + finding only.
**Hard deps:** [`rec-02`](./task-rec-02-artifact-registry-writer.md) (writer) and [`rec-01`](./task-rec-01-composition-status-webhook.md) (the finalise trigger, and its step-0 answer about how Compositions are created).
**Source:** REC-D20, REC1-D6.
**Charter:** [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet.

The investigation is bounded and the surrounding contracts are locked by Waves 1 and 2. It is not Opus work — but it does begin with reading rather than writing, and the first criterion may resolve to "no code change was needed", which is a legitimate and valuable outcome.

**New chat?** **Yes.** Pre-load:

- This task + the [batch plan](../plan-p1-recording-governance-v2-artifact-registry-batch.md) + **[`rec-01`](./task-rec-01-composition-status-webhook.md)'s completed step 0** — you cannot reason about video parity without knowing how Compositions come into existence.
- `backend/src/services/voice-session-twilio.ts` — **L140–208**, the whole adapter. `createSession` L164–186 applies audio-only recording rules; `endSession` L188–200 is the sole `enqueueVoiceTranscription` call site (**L192**).
- `backend/src/services/consultation-session-service.ts` — **L115–166.** The video baseline path: `startAudioOnlyRecording` fires for `modality === 'video'` at L145–166, and the comment at L120–144 explains exactly why video and voice took different routes.
- `backend/src/services/voice-transcription-service.ts` — **L126–176**, `enqueueVoiceTranscription`, especially the `'twilio_video_audio'` provider lookup at **L156–157**, and the consent gate at **L178–200** (read it, do not touch it — p2 owns consent).
- `backend/src/services/recording-track-service.ts` — **L741–820**, `getRecordingArtifactsForSession`, including the audio/video bucketing at L794–806 (`includeVideo` wins; audio-only goes to the audio bucket).
- `backend/src/services/twilio-compositions.ts` — `listCompositionsForRoom` L211–279 and `RoomCompositionSummary` L170–178 (`includeAudio` / `includeVideo` are how you tell the kinds apart).
- `backend/src/services/video-session-twilio.ts` — enough to confirm what it does and does not do around recording. (It contains no composition logic; verify that yourself rather than taking it on trust.)
- [`rec-02`](./task-rec-02-artifact-registry-writer.md)'s writer contract and its recorded `storage_uri` convention.

**Estimated turns:** 3–5.

---

## Acceptance criteria

### 1. Investigate first — do video sessions need their own wiring, or do they inherit it?

The answer depends entirely on rec-01 step 0, and both outcomes are plausible. Resolve it before writing anything.

- [x] Determine whether a **video** session's Twilio room produces an audio composition today, and by what mechanism.
- [x] If Compositions come from an account-level hook that fires per **room**, video rooms are already covered and rec-01's webhook already registers them. **In that case the correct outcome of this task is a test proving parity plus a written explanation — not new wiring.** Say so plainly; do not manufacture code to look productive.
- [x] If video rooms are **not** covered, identify precisely where the gap is and close it at the smallest possible surface.
- [x] **Write the finding into this task file** either way, with the reasoning. The next reader must not have to redo this investigation.

**Finding (2026-08-18):** Video already inherits coverage. No source change.

1. Compositions are created by the account-level hook `HKbe336c348bce4c81907f6a3c55844a82` (`haloaid-consult-audio`, `audioSources: *`, no video layout). Twilio fires that hook per **room**, not per our modality. Voice and video both use Twilio Video Group Rooms (`video-session-twilio.ts` create; voice is a thin wrapper). When a video room ends, the same hook produces an audio `CJ…` composition.
2. rec-01's webhook resolves the session with `findSessionByProviderSessionId('twilio_video', roomSid)` first. Fresh video **and** voice rows persist `provider: 'twilio_video'` (`voice-session-twilio.ts:162` — the voice/video split lives on `modality`). `'twilio_video_audio'` is only the mid-consult transition leftover. Video sessions are found on the first lookup.
3. Kind is `includeVideo` from `listCompositionsForRoom` — the same split `recording-track-service.ts:794–806` uses. The current hook is audio-only, so live rooms yield `audio_composition`. If a `video_composition` later exists (escalation + a future video hook or create), the same webhook registers it without new wiring.
4. A blanket **video** Composition Hook was not added. Twilio fails a video-layout hook on rooms with no video tracks (every voice consult and every non-escalated video consult). That is noise and cost, not parity. Video-composition *production* is a later, conditional mechanism — not rec-03 wiring.
5. Video sessions still must **not** call `enqueueVoiceTranscription`. That lookup is `'twilio_video_audio'`-only and would give video a `consultation_transcripts` row, which this task forbids. Registry parity is the webhook + writer, not Path B.

Tests: `backend/tests/unit/services/video-consult-artifact-parity.test.ts`. Voice enqueue no-regression remains `voice-session-twilio.test.ts` (`endSession` → `enqueueVoiceTranscription`).

### 2. Parity outcome

- [x] An ended **video** consult has an `audio_composition` row in `recording_artifact_index`, on the same terms as an ended voice consult.
- [x] The row carries the same `storage_uri` convention, the same `bytes` handling and the same `patient_self_serve_visible` default as a voice row. A reader must not be able to tell voice from video by looking at the row's shape.
- [x] Where a video consult also produced a **video** composition (escalation happened), it is registered as `video_composition` (REC1-D6). Use the `includeVideo` / `includeAudio` split that `recording-track-service.ts:794–806` already relies on — do not invent a second bucketing rule.
- [x] A voice consult's existing behaviour is **unchanged**. Parity means video rises to voice, never voice falling to meet video.
- [x] Idempotency still holds — a video consult processed twice yields one row per composition (rec-02's REC1-D2).

Same writer (`registerFinalisedComposition`); voice vs video is session lookup only. Row shape is rec-02's.

### 3. Transcription stays out of it (charter non-goal)

- [x] **Video tracks are never sent to a transcription provider.** Audio remains the only transcription input. This is a charter non-goal and it is not softened here.
- [x] This task does **not** make video sessions call `enqueueVoiceTranscription`. Registry parity is achieved through the artifact writer, not by giving video sessions a `consultation_transcripts` row.
- [x] If your chosen approach seems to require enqueueing transcription for video, that is a signal you are solving it at the wrong layer. **Stop and re-read criterion 1.**
- [x] The consent gate at `voice-transcription-service.ts:178–200` is untouched. Consent is p2's.

### 4. Tests

- [x] A video session whose room yields an audio composition produces an `audio_composition` row.
- [x] A video session that also escalated produces a `video_composition` row, and the two do not collide.
- [x] A voice session's existing path still produces its row and its transcription enqueue exactly as before — an explicit no-regression test.
- [x] No test causes a video track to be handed to a transcription provider.
- [x] Twilio is stubbed via the existing `__setOverridesForTests` seams. No live calls.

### Out of scope

- Changing replay resolution — [`rec-04`](./task-rec-04-replay-resolves-from-index.md) owns `resolveAudioArtifact` and `resolveVideoArtifact`.
- Historical video consults — [`rec-05`](./task-rec-05-artifact-index-backfill.md) backfills those. This task covers sessions ending from now on.
- Transcribing video tracks (charter non-goal, permanently).
- Twilio room create/end, room naming, lazy creation, recording rules.
- The `startAudioOnlyRecording` baseline ledger at `consultation-session-service.ts:145–166`. Read it for context; do not modify it.
- Consent (p2), pause (p3), escalation state machine (p4).

---

## Scope Guard

- **Expected files touched: 1–3**, and **possibly zero source files** if criterion 1 resolves to "video already inherits coverage" — in which case the deliverable is a test plus the written finding. That is a complete and successful outcome for this task.
- **DO NOT** modify `recording-access-service.ts` (rec-04 owns it).
- **DO NOT** modify `recording-pause-service.ts` or `recording-escalation-service.ts`.
- **DO NOT** modify the consent gate in `voice-transcription-service.ts` (p2).
- **DO NOT** change `voice-session-twilio.ts`'s existing behaviour. Adding video coverage must not alter the voice path.
- **DO NOT** modify Twilio room create/end in `video-session-twilio.ts` or `consultation-session-service.ts`.
- **DO NOT** write a migration. **STOP and surface** if you believe you need one.
- **DO NOT** expand into rec-01's webhook or rec-02's writer. If either needs a change, stop and surface it.

---

## Global safety gate

- **Data touched?** Yes — `recording_artifact_index` via rec-02's writer. **RLS unchanged.**
- **Any PHI in logs?** **No.** Session IDs, room SIDs, composition SIDs only.
- **External API call?** Yes — Twilio composition listing. **No AI call, and no new transcription input** (criterion 3).
- **Retention / deletion impact?** Yes — video artifacts become archival-worker candidates for the first time. Flag stays `false`.

---

## Done when

- The investigation's answer is written into this file; an ended video consult has an `audio_composition` registry row at parity with voice, with any video composition registered as `video_composition`; voice behaviour is provably unchanged; no video track is transcribed anywhere; no migration; backend typecheck + lint + tests green.

---

## Related

- Batch plan: [`plan-p1-recording-governance-v2-artifact-registry-batch.md`](../plan-p1-recording-governance-v2-artifact-registry-batch.md)
- Charter: [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)
- Execution order: [`EXECUTION-ORDER-p1-recording-governance-v2-artifact-registry.md`](./EXECUTION-ORDER-p1-recording-governance-v2-artifact-registry.md)
- Depends on: [`rec-02`](./task-rec-02-artifact-registry-writer.md), [`rec-01`](./task-rec-01-composition-status-webhook.md)
- Next in lane: [`rec-04`](./task-rec-04-replay-resolves-from-index.md)

---

**Last Updated:** 2026-08-18. Video inherits the audio hook + rec-01 webhook. No source wiring.
