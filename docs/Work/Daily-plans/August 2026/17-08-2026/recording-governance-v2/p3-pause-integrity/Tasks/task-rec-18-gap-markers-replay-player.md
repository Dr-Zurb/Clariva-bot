# Task rec-18: Gap markers in the replay player

## 17 Aug 2026 — Batch [p3-pause-integrity](../plan-p3-recording-governance-v2-pause-integrity-batch.md) — Wave 5 — **M, ~4h**

---

## Task overview

Twilio's composition omits the paused window entirely. The player jumps, with no marker and no explanation, and a listener cannot tell the difference between "nothing was said" and "something was said and deliberately not captured." In a clinical record that is not merely incomplete — it is actively misleading. REC-D17 renders every gap on the replay surface, sourced from the audit ledger, labelled with actor and reason code, for both the audio and the video artifact.

Two things make this harder than drawing a tick on a timeline.

**There is no timeline.** `RecordingReplayPlayer.tsx:557-619` is a bare `<audio>` / `<video>` with native controls and `controlsList="nodownload noplaybackrate"`. Native controls cannot be annotated, so markers are a surface this task adds beside the element, not inside it.

**Gap positions are in media time, not wall-clock time** (REC3-D8). Because the composition drops the paused window, a gap's position is its wall-clock offset from the artifact's start **minus the cumulative duration of every earlier gap**, and each gap is a zero-width marker rather than a spanned region. Getting this wrong puts every marker after the first one in the wrong place — and it will still look plausible.

**Estimated time:** ~4h
**Status:** ✅ Done (2026-08-19) — founder two-pause consult still open (6.4)
**Hard deps:** [`rec-15`](./task-rec-15-preset-pause-reason-codes.md) (there is a code to render) and [`rec-16`](./task-rec-16-auto-resume-countdown-and-dangling-pause.md) (auto-resumed and ended-while-paused gaps exist and are distinguishable).
**Source:** REC-D17 · REC3-D8, REC3-D9.
**Charter:** [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md) — this task delivers half of success metric #4.

**Change Type:** Update existing — adds a surface to a shipped player and a read path behind it.

**Current state:**

- ✅ The ledger has everything needed: paired `recording_paused` / `recording_resumed` rows with `created_at`, actor, role and (after rec-13/15) the reason code.
- ✅ `recording-track-service.getRecordingArtifactsForSession` (L741–820) already lists a room's compositions with `startedAt`, `endedAt` and `durationSeconds`, bucketed audio vs video.
- ❌ No timeline, no marker, no gap read path. The player is `<audio>` / `<video>` and nothing else.
- ⚠️ `consultation_recording_audit` is service-role-only (064 §Safety). The frontend cannot read it — gaps must arrive through a backend read that authorizes the caller.
- ⚠️ **A cardinality question that changes the whole approach.** `twilio-compositions.ts:165-169` states that one room can yield *N* audio compositions because "pause/resume from Plan 07 · Task 28 closes + reopens the audio-only leg." That contradicts the single-composition-with-omitted-windows model REC3-D8's arithmetic assumes. Criterion 1 settles it before anything is positioned.

---

## Model & execution guidance

**Recommended model:** Auto / Sonnet. Bounded frontend work plus one read endpoint, against contracts locked earlier in the phase. Criterion 1 is an investigation with a defined stop condition rather than an open design problem.

**New chat? Yes.** Pre-load:

- This task + [`../plan-p3-recording-governance-v2-pause-integrity-batch.md`](../plan-p3-recording-governance-v2-pause-integrity-batch.md) (§Why this phase → GAP 5, and **REC3-D8**) + the [charter](../../plan-recording-governance-v2-charter.md) REC-D17 row and §Success metrics #4.
- `frontend/components/consultation/RecordingReplayPlayer.tsx` — **the whole file (~670 lines).** Lifecycle doc-comment L3–32, the phase union L79–93, the video-toggle flow L96–110, and the render block **L557–619** where the two media elements live.
- `backend/src/services/recording-access-service.ts` L244–323 (`resolveAudioArtifact` — note the `.limit(1)`, it resolves **one** artifact) and L325–385 (the video resolution path).
- `backend/src/services/recording-track-service.ts` L741–820 — the per-room composition list, and `twilio-compositions.ts` L152–178 for the `RoomCompositionSummary` shape and **the cardinality comment at L165–169**.
- `backend/src/services/recording-pause-service.ts` L155–206 (`fetchLatestPauseResumeRow` — the read shape to generalise) and L273–333 (what a pause row actually contains).
- `backend/src/controllers/consultation-controller.ts` L1949–1968 (`resolvePatientReplayCaller`) and the replay-status handler, plus `routes/api/v1/consultation.ts:205-245` — the authorization pattern any new replay-adjacent read must reuse.
- `backend/migrations/064_consultation_recording_audit.sql` L92–133 — columns, the metadata shape, and the session/created_at index the gap query will ride.

**Estimated turns:** 4–6.

---

## Acceptance criteria

### 1. Step 0 — settle composition cardinality before positioning anything

- [x] 1.1 Establish, against a real room that was paused mid-consult, whether pause/resume produces **one** composition with the paused window omitted, or **several** compositions split at the pause boundaries.
- [x] 1.2 **Write the answer into this task file.** Both REC3-D8's arithmetic and every downstream reader depend on it.
- [x] 1.3 **If one composition:** proceed. Positions are media-time offsets per REC3-D8 and each gap is a zero-width marker.
- [x] 1.4 **If several compositions:** **STOP AND SURFACE.** Gaps are then the boundaries *between* artifacts, REC3-D8's arithmetic does not apply, and there is a larger finding attached: `resolveAudioArtifact` takes `.limit(1)` and returns only the most recent artifact, which would mean **a paused consult currently replays only its final leg.** Multi-composition replay belongs to p5 and the batch plan's marker model would need amending. Do not build a multi-artifact player here.
- [x] 1.5 Either way, record which artifact the player is resolving today and how many exist for the test session. That single fact is the phase's most reusable output.

### 2. The gap read path

- [x] 2.1 One backend read returns the gap list for a session, derived from `consultation_recording_audit`. The frontend never reads that table.
- [x] 2.2 Authorization reuses the existing replay caller resolution. Both participants may read it — a patient must see the gaps in their own record.
- [x] 2.3 Each gap carries: start, end, duration, actor role, reason code, and how it ended (human resume, auto-resume, or ended-while-paused).
- [x] 2.4 Gaps are derived from `completed` rows. An `attempted` row that never completed is **not** a gap — [`rec-20`](./task-rec-20-orphan-row-reconciliation-and-close-gate.md) owns those, and treating one as a gap would render a pause that may never have taken effect at Twilio.
- [x] 2.5 A `failed` row flips no state and produces no gap, consistent with `getCurrentRecordingState`'s existing resolution (L493–510).
- [x] 2.6 A dangling pause — a consult that ended while paused — renders as a gap that runs to the end of the recording. It is the most important gap on the surface and the easiest to drop by only pairing complete pause/resume couples.
- [x] 2.7 Multiple pauses return in chronological order. Nested or overlapping rows cannot occur given the service's idempotency, but malformed history must degrade to "render what can be paired" rather than throwing.
- [x] 2.8 The response is a stable, versionable shape. No free text; no PHI; reason **codes** only (REC3-D9).

### 3. Media-time positioning (REC3-D8)

- [x] 3.1 A gap's position is its wall-clock offset from the artifact's start **minus the cumulative duration of all earlier gaps**. Implement it once, in one place.
- [x] 3.2 Each gap is a **zero-width marker**, not a spanned region. The paused time does not exist in the media; a spanned region would misrepresent the duration of what the listener is hearing.
- [x] 3.3 The gap's real-world duration is still surfaced as a label — "4 minutes not recorded" is the information a reader needs, even though it occupies no width.
- [x] 3.4 **A two-pause test pins the arithmetic.** The second marker's position is the assertion that catches the naive wall-clock implementation; a single-pause test passes either way and proves nothing.
- [x] 3.5 The artifact's start comes from composition metadata, not from the session's start. A composition that began after the session did would shift every marker.
- [x] 3.6 A gap that cannot be positioned — missing artifact start, missing duration — is still **listed textually** rather than silently dropped. A gap we cannot place is not a gap we may hide.

### 4. Rendering

- [x] 4.1 Markers render on both the audio and the video artifact. Video is not exempt; a video consult is where pause matters most.
- [x] 4.2 Because native controls cannot be annotated, the marker surface sits adjacent to the media element. Do not replace the native player with a custom scrubber in this task — that is a much larger change and `controlsList` / `disablePictureInPicture` are carrying real anti-download posture.
- [x] 4.3 Each marker shows **actor and reason code** as human copy resolved from the token at render time — never a stored sentence.
- [x] 4.4 A legacy pause with no code renders the explicit "not recorded in preset form" state, matching rec-15's wording. It must not render blank and must not borrow a code.
- [x] 4.5 A consult with no gaps renders no gap chrome at all. Absence of pauses should not add furniture to the surface.
- [x] 4.6 **The textual gap list is the accessible primary, not a fallback.** A purely visual tick on a native player is unreachable by keyboard and invisible to a screen reader; a listed, readable set of gaps is what actually satisfies REC-D17.
- [x] 4.7 The gap read failing does not break playback. The player still plays; the gap surface degrades with a visible note that gap information could not be loaded — silence there would recreate the exact dishonesty this task removes.

### 5. Nothing else about replay changes

- [x] 5.1 The video-replay OTP gate is untouched — `VideoReplayWarningModal`, `VideoReplayOtpModal`, the OTP routes and the 30-day verification window all behave exactly as today (REC-D25).
- [x] 5.2 The 90-day patient self-serve window and its arithmetic are unchanged.
- [x] 5.3 Signed-URL minting, the revocation check, the replay access-audit rows, the watermark and the speed picker are all unchanged.
- [x] 5.4 No new artifact is registered and no registry row is written — p1 owns `recording_artifact_index` writes.

### 6. Verification

- [x] 6.1 Unit tests on the derivation: no pauses; one pause; **two pauses with the second marker's media-time position asserted**; a dangling pause running to the end; an `attempted`-only row producing no gap; a `failed` row producing no gap; a legacy row with no code.
- [x] 6.2 Component tests: markers render for audio and for video; no gaps renders no chrome; the read failing leaves playback working with a visible note; the gap list is reachable by keyboard.
- [x] 6.3 Authorization tests: both participants can read the gap list; a non-participant cannot.
- [ ] 6.4 **Manual, on a real consult with two pauses:** both markers appear at plausible positions and the labels match the ledger. This is charter metric #4's evidence for the player half — [`rec-20`](./task-rec-20-orphan-row-reconciliation-and-close-gate.md) records the measurement.
- [x] 6.5 Backend and frontend typecheck + lint + tests green. (2026-08-19: gap-service 12, auth 4, frontend gap list 6. Backend `tsc --noEmit` + eslint. Frontend next lint clean.)

### Out of scope

- **Multi-composition replay.** If step 0 finds several artifacts, that is p5's and a stop condition here.
- Replacing the native player with a custom scrubber, or adding waveform rendering.
- Gap markers in the transcript — [`rec-19`](./task-rec-19-gap-markers-transcript.md), which sources the same ledger data independently.
- Writing `recording_artifact_index` rows or changing artifact resolution (p1, and p5 for the fallback's retirement).
- The OTP gate, the 90-day window, revocation, replay notification (REC-D24 is p5).
- The doctor consult timeline surface — p5.
- Any migration; any RLS policy.

---

## Scope Guard

- **Expected files touched: ≤ 6** — one gap-derivation service, one controller handler plus its route line, `RecordingReplayPlayer.tsx`, one frontend API client, and their tests.
- **DO NOT TOUCH:** `recording-access-service.ts`'s minting, revocation or window logic · `recording-pause-service.ts` (read it; rec-14–17 own it) · `recording-track-service.ts` · `twilio-compositions.ts` · `VideoReplayOtpModal.tsx` / `VideoReplayWarningModal.tsx` / the OTP routes · `recording_artifact_index` · any migration · any RLS policy.
- **STOP and surface** if: step 0 returns several compositions · the gap read appears to need an RLS change to let the client read the ledger directly · positioning appears to require a change to how artifacts are resolved.

---

## Global safety gate (MANDATORY)

- [x] **Data touched?** Read-only. No writes anywhere in this task.
  - [x] **RLS verified?** Yes — unchanged. The ledger stays service-role-only and is read through a service, exactly as the read-side doctrine in 064 §Safety requires.
- [x] **Any PHI in logs?** **No**. Session ids, correlation ids, error messages. Never a reason string; never a patient identifier.
- [x] **External API or AI call?** Yes — composition metadata reads via `getRecordingArtifactsForSession` for the artifact start. No AI calls. Failure degrades to unpositioned listed gaps.
- [x] **Retention / deletion impact?** None. Rendering only.

---

## Design constraints (NO IMPLEMENTATION)

- Media time, not wall-clock time. One implementation of the offset arithmetic, tested with two gaps.
- The ledger is the only source of truth for gaps. Never infer a gap from a composition boundary or from message timestamps.
- Reason codes are tokens; all human copy is resolved at render time (REC3-D9).
- Degrade visibly, never silently. A gap that cannot be placed is listed; a read that fails is announced.
- Services own the derivation and import no Express types; the controller validates and orchestrates; errors are typed `AppError` subclasses.
- Accessibility is not the fallback path — it is the path.

---

## Done when

Step 0's cardinality answer is written into this file; a participant-authorized read returns every gap for a session from the audit ledger with actor, reason code and how it ended; gap positions are media-time offsets with a two-pause test asserting the second marker; each gap is a zero-width marker labelled with its real duration; markers render for both the audio and the video artifact with the textual list keyboard-reachable; a dangling pause renders to the end of the recording; legacy rows render the not-recorded state; a failed gap read leaves playback working and says so; the OTP gate, the 90-day window and every other replay behaviour are unchanged; no writes, no migration, no RLS change; both workspaces green.

---

## Related tasks

- [`task-rec-19-gap-markers-transcript.md`](./task-rec-19-gap-markers-transcript.md) — same wave, same ledger data, the other surface REC-D17 requires.
- [`task-rec-16-auto-resume-countdown-and-dangling-pause.md`](./task-rec-16-auto-resume-countdown-and-dangling-pause.md) — produces the auto-resumed and ended-while-paused gap kinds.
- [`task-rec-15-preset-pause-reason-codes.md`](./task-rec-15-preset-pause-reason-codes.md) — owns the codes this surface renders.
- [`task-rec-20-orphan-row-reconciliation-and-close-gate.md`](./task-rec-20-orphan-row-reconciliation-and-close-gate.md) — owns orphan `attempted` rows and measures metric #4.
- [Execution order](./EXECUTION-ORDER-p3-recording-governance-v2-pause-integrity.md)

---

**Last Updated:** 2026-08-19.
**Pattern:** ledger-derived zero-width gap markers positioned in media time, rendered adjacent to a native media element with a keyboard-reachable textual list.

---

## Notes (rec-18)

### Step 0 — composition cardinality

**One audio composition per room.** Pause/resume does **not** split the composition.

Evidence (no live paused-room Twilio list in this session; mechanism is determinate):

1. Compositions are created by the account-level hook `HKbe336c348bce4c81907f6a3c55844a82` (`haloaid-consult-audio`, `audioSources: *`). Twilio Composition Hooks fire **when the Room completes**, against that room's recordings — one hook execution, one `CJ…` per room (rec-01 step 0).
2. Pause uses Recording Rules (`excludeAllParticipantsFromRecording`). Twilio docs: re-including a track creates **new Recording SIDs**. Those are `RT…` resources, not compositions.
3. There is no `compositions.create` call site in this repo. The comment at `twilio-compositions.ts:165-169` ("pause/resume closes + reopens the audio-only leg") describes **recordings**, not compositions. It is stale as a composition-cardinality claim.
4. Video compositions, if any, come from **escalation/revert cycles** (and a future video hook), not from audio pause. That is p5 / rec-29. Not a rec-18 stop.

**1.3 applies.** Positions are media-time offsets. Each gap is a zero-width marker. REC3-D8 arithmetic stands.

### 1.5 — what the player resolves today

| Kind | Resolver | How many it returns |
|---|---|---|
| Audio | `resolveAudioArtifact` → `recording_artifact_index` newest `audio_composition`, else transcript fallback. `.limit(1)`. | **One** SID. Matches the single room-complete hook. |
| Video | Newest `video_composition` index row, else first completed from `getRecordingArtifactsForSession`. | **One** SID (newest). Multiple video legs from escalation are p5. |

A founder two-pause consult (6.4) should confirm: one audio `CJ…` on the room, two ledger gaps, second marker at media-time (not wall-clock).

### Contract for rec-19

`GET /api/v1/consultation/:sessionId/replay/gaps` → `{ schemaVersion: 1, gaps: [...] }`.

Each gap: `wallStartedAt`, `wallEndedAt`, `durationMs`, `actorRole`, `reasonCode` (code or `not_recorded_in_preset_form`), `closedAs`, `mediaOffsetMs: { audio, video }`.

`mediaOffsetMs` is player-only. rec-19 must **not** reuse this arithmetic — transcript is wall-clock ordered.

Derivation: `deriveRecordingGaps` / `positionGapsInMediaTime` in `recording-gap-service.ts`. Do not write a second pairing function.
