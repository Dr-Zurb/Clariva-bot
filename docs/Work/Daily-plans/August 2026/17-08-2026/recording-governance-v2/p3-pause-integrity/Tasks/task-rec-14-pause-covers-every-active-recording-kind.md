# Task rec-14: Pause covers every active recording kind

## 17 Aug 2026 — Batch [p3-pause-integrity](../plan-p3-recording-governance-v2-pause-integrity-batch.md) — Wave 2 — **M, ~4h**

---

## Task overview

Fix the defect. `recording-pause-service.ts:100` hardcodes `DEFAULT_KIND = 'audio'`, so pausing a consult that is recording audio **and** video excludes the audio and leaves the video rolling. Pause must suppress every kind currently being captured, and resume must restore exactly the kinds that were being captured before the pause — not a fixed mode (REC-D13, REC3-D5).

This is the task where p3 and p4 touch, so it also lands the pause-state contract p4's revert paths consult (REC3-D6).

**Estimated time:** ~4h
**Status:** ✅ Done 2026-08-18 (unit + typecheck; live Twilio rules-endpoint smoke still founder)
**Hard deps:** rec-13 merged (the ledger shape is locked before anything writes to it).
**Source:** REC-D13 · REC3-D5, REC3-D6.

**Change Type:** Update existing — behaviour change in a shipped service that talks to Twilio. Follow [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

**Current state:**

- ✅ `recording-pause-service.ts` pauses and resumes, with a double-row ledger, idempotency and a both-parties banner — for audio only.
- ✅ `twilio-recording-rules.ts` already has everything needed: per-kind `exclude` / `include` helpers with fetch-merge-send semantics (L107–144), a mode reader (`getCurrentRecordingMode`, L349), and the two mode setters Plan 08 uses (L388, L429).
- ❌ Nothing asks "which kinds are live right now?" before pausing.
- ❌ Resume re-includes audio unconditionally and never considers video.
- ⚠️ The comment at `recording-pause-service.ts:95-99` still says video is a future Plan 08 extension. Plan 08 shipped in April. Delete the stale comment as part of the fix — do not leave it contradicting the code.

---

## Model & execution guidance

**Recommended model:** **Opus.** This is the second and last Opus task in the batch, and the justification is specific: the change lives inside the Twilio recording-rule state machine, where a wrong merge silently produces the exact failure mode this phase exists to fix — the ledger says one thing and Twilio is doing another, with no error anywhere. The mode-interpretation subtlety in §2.3 below (a paused session reads as `'other'`, which defeats p4's idempotency short-circuit) is the kind of thing that is obvious once seen and invisible until then. Everything downstream of this task runs on Auto.

**New chat? Yes.** Pre-load:

- This task file + [`../plan-p3-recording-governance-v2-pause-integrity-batch.md`](../plan-p3-recording-governance-v2-pause-integrity-batch.md) (especially §Coordination boundary with p4) + [`../../plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md) §Pause.
- `backend/src/services/twilio-recording-rules.ts` — the **whole file**. Non-negotiable. The header (L1–40) explains why wholesale-replace makes this dangerous; `mergeAllParticipantsRule` is L107–144; `RecordingMode` + `interpretRules` + `modeFrom` are L290–337; the two mode setters and their short-circuits are L388–413 and L429–454.
- `backend/src/services/recording-pause-service.ts` — the **whole file**. `DEFAULT_KIND` L100; the four call sites L290, L425; the ledger writes L273–333 and L409–466; `fetchLatestPauseResumeRow` L172–206; `getCurrentRecordingState` L511–580.
- `backend/src/services/recording-track-service.ts` L1–110 (header — the three Decision-10 runtime states) and L332–356, where `startAudioOnlyRecording`'s JSDoc already states that resume is kind-scoped while that function is mode-scoped, and that mixing them would overwrite video state. That note is the seed of this task's correct answer.
- `backend/tests/unit/services/twilio-recording-rules.test.ts` and `backend/tests/unit/services/recording-pause-service.test.ts` — both exist; both will need updating.

**Estimated turns:** 4–6.

---

## Acceptance criteria

### 1. Pause suppresses every live kind

- [x] 1.1 Pause determines which kinds are actually being captured at the moment of the pause, from Twilio's current rule state — not from an assumption, and not from a modality column.
  - [x] 1.1.1 A voice consult (audio only) behaves exactly as it does today. No extra Twilio call is added to the common path if the existing mode read already answers the question.
  - [x] 1.1.2 A video consult with a live escalation has both kinds suppressed by the pause.
  - [x] 1.1.3 A video consult that is currently audio-only (no escalation) suppresses audio only, and does not add a redundant video exclusion that would confuse p4's mode reader.
- [x] 1.2 The set of kinds suppressed is recorded on the pause ledger row, so resume does not have to re-derive it and an auditor can see what the pause actually covered.
- [x] 1.3 `TwilioRoomNotFoundError` (a room already completed / garbage-collected) is handled as its own case, not as a generic failure. `recording-track-service.ts:412-422` shows the house treatment.
- [x] 1.4 A partial failure — one kind suppressed, the second call fails — must not be recorded as a completed pause. The ledger's `failed` row and the thrown error are the contract; a half-pause reported as success is the worst available outcome.

### 2. Resume restores the pre-pause set (REC3-D5)

- [x] 2.1 Resume replays the kinds recorded on the pause row. It never flips to a fixed mode, and it never calls the mode-scoped setters in `recording-track-service.ts` (that function's own JSDoc, L342–348, forbids it).
- [x] 2.2 **The audio+video question, answered:** if video was being captured at pause time, resume restores video **only if the grant authorising it is still valid**. If the grant has lapsed during the pause, resume restores audio and leaves video excluded.
  - [x] 2.2.1 p3 does not read or write grant state directly. It asks p4 for a yes/no via whatever read surface p4 exposes.
  - [x] 2.2.2 **If p4 has not shipped yet:** resume restores audio only, leaves video excluded, and writes the reason onto the ledger row. Fail closed toward less capture. A patient who consented to two minutes of video did not consent to it resuming after a five-minute pause.
  - [x] 2.2.3 Whichever branch runs is visible in the ledger row, so "why did video not come back?" is answerable after the fact.
- [x] 2.3 **The collision with p4's idempotency short-circuit is closed.** `setRecordingRulesToAudioOnly` (L388) short-circuits only when `getCurrentRecordingMode` reads `audio_only`; a paused session's rules classify as `'other'` via `modeFrom` (L330–337), so the short-circuit does not fire and the function proceeds to re-include audio — silently resuming a paused recording.
  - [x] 2.3.1 Land a single authoritative "is this session paused right now?" read that any rule-flipping path can consult. The existing `fetchLatestPauseResumeRow` / `getCurrentRecordingState` pair is the natural home; do not create a second source of truth.
  - [x] 2.3.2 Every revert-to-audio-only path in this repo either consults it or is explicitly listed here as out of scope with the reason.
  - [x] 2.3.3 A regression test pins the scenario: session paused → a revert-to-audio-only call arrives → audio stays excluded and the ledger still reads paused.

### 3. Coordination boundary with p4 (REC3-D6)

- [x] 3.1 **p3 defines the pause behaviour; p4 consumes it.** State the contract in the service's header comment, in the same register as the existing headers, so the next reader of `recording-pause-service.ts` finds it without reading a plan doc.
- [x] 3.2 The contract covers exactly three questions: what "paused" means at the rule level; how p4 asks whether a session is paused; what p4 must not do while a pause is open (flip rules without checking).
- [x] 3.3 This task changes **nothing** in `recording-escalation-service.ts`, `video_escalation_audit`, attempt counters, cooldowns, the consent modal, or grant expiry. If making pause correct appears to require a change there, that is the boundary — **stop and surface it.**

### 4. System messages and state read

- [x] 4.1 The pause banner tells both parties what actually stopped. "Recording paused" while video is still rolling would be the same lie in a different place; a pause that covered both kinds says so.
- [x] 4.2 `getCurrentRecordingState` reports the paused kinds so the in-call surfaces can be honest without a second call. Additive to the existing response shape.
- [x] 4.3 No free text and no PHI in any body or log line. Reason handling is rec-15's; this task must not introduce a new free-text path in the meantime.

### 5. Verification

- [x] 5.1 Unit tests extended in both existing test files, covering: audio-only pause/resume unchanged · audio+video pause suppresses both · resume with a valid grant restores both · resume with a lapsed or unknown grant restores audio only · partial-failure writes a `failed` row and throws · the §2.3.3 revert-during-pause regression.
- [ ] 5.2 Verified against Twilio's rules endpoint on a real room, not only against mocks. The whole defect is a mismatch between our ledger and Twilio's state; a mock-only pass would not have caught the original bug either.
- [x] 5.3 Backend typecheck + lint + tests green.
- [x] 5.4 The stale `DEFAULT_KIND` comment (L95–99) is gone, along with the constant itself if it no longer has a caller. No commented-out remnant — [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md) §2.

### Out of scope

- Preset reason codes (rec-15). Pause keeps accepting today's reason shape until rec-15 lands.
- Auto-resume, countdown, extension (rec-16).
- Patient-initiated pause (rec-17).
- Gap rendering (rec-18, rec-19).
- Orphan-row reconciliation (rec-20).
- The grant lifecycle itself — request, consent, duration, auto-revert, patient stop, attempt counters, cooldown (p4).
- Twilio room create / end.

---

## Scope Guard

- **Expected files touched: ≤ 5** — `recording-pause-service.ts`, `twilio-recording-rules.ts` (only if a read helper is genuinely missing — prefer composing the existing exports), the two existing unit tests, and at most one type file.
- **DO NOT TOUCH:** `recording-escalation-service.ts` · `recording-track-service.ts` (read it, do not change it) · `video_escalation_audit` and anything writing to it · `consultation-session-service.ts` · any migration · any frontend file · any RLS policy.
- Any expansion beyond five files requires explicit approval.

---

## Global safety gate (MANDATORY)

- [x] **Data touched?** Yes — `consultation_recording_audit` writes only, through the existing ledger helpers.
  - [x] **RLS verified?** Yes — no policy change; service-role writes as today.
- [x] **Any PHI in logs?** Must be No. Log room sids, kinds, correlation ids, statuses. Never a reason string.
- [x] **External API or AI call?** Yes — Twilio Recording Rules. No consent implications; no payload beyond rule shapes.
- [x] **Retention / deletion impact?** No.

---

## Design constraints (NO IMPLEMENTATION)

- The merge-aware wrapper is the only way to touch Twilio rules. Never call `recordingRules.update` directly — the wrapper's header (L1–26) explains what a wholesale replace destroys.
- Service layer only. No Express types; controllers stay orchestration-only.
- Throw typed `AppError` subclasses; never a raw `Error`.
- Idempotency semantics stay exactly as documented at `recording-pause-service.ts:24-28` — a second pause while paused is still a no-op that writes no rows and calls no API.
- Ledger doctrine is unchanged: `attempted` before the API call, `completed` or `failed` after, same correlation id.
- Failures fail closed toward **less** capture. If the code cannot establish what is safe to re-enable, it re-enables less.

---

## Done when

Pausing a consult that is recording audio and video stops both, confirmed against Twilio's own rules endpoint; resume restores exactly the kinds that were live before the pause and never restores video whose grant has lapsed; a revert-to-audio-only call arriving during a pause cannot silently resume audio; the pause-state contract for p4 is written into the service header; the stale audio-only comment is gone; both existing unit test files cover the new matrix; backend typecheck + lint + tests green.

---

## Notes

- **Live kinds:** `getIncludedRecordingKinds` (one rules fetch). Empty include-set falls back to `['audio']`. Video is excluded only when Twilio currently includes it — no redundant video exclude on audio-only rooms.
- **Ledger:** `metadata.paused_kinds` on pause; resume writes `restored_kinds` + `video_restore` (`restored` | `grant_lapsed` | `grant_unknown` | `not_applicable`). `kind` kept as the primary kind for existing readers.
- **p4 grant read:** none shipped. `setVideoGrantValidReader` defaults to `null` (unknown) → audio only. p4 calls that setter with its yes/no; do not read `video_escalation_audit` from this service.
- **§2.3.2 revert-to-audio-only paths:**
  - **Consults** via `setRecordingRulesToAudioOnly` → `isRoomRecordingPaused`: `recording-track-service.startAudioOnlyRecording` / `revertToAudioOnlyRecording` (untouched; they already call the setter), `recording-escalation-service.patientRevokeVideoMidCall` (untouched), `modality-transition-executor` (untouched). `setRecordingRulesToAudioAndVideo` is guarded the same way so an escalate-during-pause cannot re-include audio.
  - **Out of scope:** `consultation-session-service.createSession` — create-time baseline on a new room; no pause row can exist yet. `isRoomRecordingPaused` returns false when no session matches the SID.
- **Authoritative pause read:** `isSessionRecordingPaused` / `isRoomRecordingPaused` share `fetchLatestPauseResumeRow`. Lookup failure fails closed (treat as paused) so a revert cannot silently re-include audio. Unknown room → not paused.
- **5.2 founder:** pause a live audio+video room, confirm Twilio `recordingRules` shows both kinds excluded, then hit a revert path and confirm audio stays excluded.

---

## Related tasks

- [`task-rec-13-migration-pause-reason-codes-and-auto-resume-stamps.md`](./task-rec-13-migration-pause-reason-codes-and-auto-resume-stamps.md) — prerequisite.
- [`task-rec-16-auto-resume-countdown-and-dangling-pause.md`](./task-rec-16-auto-resume-countdown-and-dangling-pause.md) — auto-resume replays the same restore path this task defines.
- [Execution order](./EXECUTION-ORDER-p3-recording-governance-v2-pause-integrity.md)

---

**Last Updated:** 2026-08-18.
**Pattern:** kind-scoped rule flips through the merge-aware wrapper; pre-pause state captured on the ledger row and replayed on resume.
