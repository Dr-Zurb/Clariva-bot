# Task rec-29: Multi-composition replay player

## 17 Aug 2026 — Batch [p5-access-and-retention](../plan-p5-recording-governance-v2-access-and-retention-batch.md) — Wave 1 (Lane β) — **M, ~5h**

---

## Task overview

One consult can produce several audio compositions and several video compositions. The replay player assumes exactly one of each. This task closes that gap.

The multiplicity is real and documented in the code. `twilio-compositions.ts:161-169` states it plainly: *"one room can yield N audio compositions (pause/resume … closes + reopens the audio-only leg) and M video compositions (each escalation / revert cycle closes its video leg)."* p4's revert-then-re-escalate cycle produces the video case; with p3's pause work landing, the same happens for audio. `getRecordingArtifactsForSession` (`recording-track-service.ts:761-820`) already returns both as **arrays**, sorted `startedAt` ascending.

The player does not. `RecordingReplayPlayer.tsx` carries a single `hasVideo: boolean` (`:83`), an `ArtifactMode = "audio" | "video"` (`:56`), and mints one signed URL per mode. `mintReplayUrl` matches it — `recording-access-service.ts:809-812` resolves exactly one artifact per call. So a consult with three video legs currently plays one of them, and nobody is told the other two exist. In a clinical record, a partial recording presented as the whole recording is the same class of dishonesty REC-D17 exists to prevent for pause gaps.

**p4 produces the multiplicity; p5 renders it.** p4's batch plan hands this here explicitly and forbids a "pick the longest" stopgap.

**Estimated time:** ~5h
**Status:** 🔧 Code shipped 2026-08-20 — founder visual smoke still open. Path B not retired. rec-27 composition count still unmeasured; UI sized for a handful of legs (2–4), not a playlist.
**Hard deps:** **[`p1`](../../p1-artifact-registry/) shipped and backfilled.** Read the coordination note below on p3's `rec-18` before starting.
**Source:** REC-D19, REC5-D4. p4 batch plan §*Consequence — multiple video compositions per consult*.
**Charter:** [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md)

---

## ⚠️ Coordination with p3's `rec-18` — read before writing code

`rec-18` (p3 Wave 5, M · Auto) puts pause-gap markers on the replay timeline. It and this task both edit `RecordingReplayPlayer.tsx`.

**Land `rec-18` first; rec-29 composes on top of it.** The ordering is not arbitrary. REC3-D8 makes gap positioning **media-time** arithmetic: a gap's position is its wall-clock offset from artifact start **minus the cumulative duration of all earlier gaps**, and each gap is a zero-width marker rather than a spanned region. That calculation is inherently per-artifact. Lifting a working per-artifact calculation into a per-composition loop is a mechanical change; retrofitting multiplicity-aware arithmetic into a player that has just learned to hold arrays is not.

**If `rec-18` has not shipped when you run:** ship the multi-composition selector and leave the gap-marker surface exactly as you find it — but structure the component so a per-artifact marker set drops in **per composition**, not once per player. A single marker collection hung off the player would have to be re-plumbed the moment `rec-18` lands.

**Either way:** rec-29 implements **no** gap markers, and `rec-18`'s media-time arithmetic is not yours to change. If you conclude that arithmetic is wrong under multiplicity, that is a **STOP-and-surface**, not a fix — it is a p3 decision and it affects the transcript renderer (`rec-19`) too.

---

## Model & execution guidance

**Recommended model:** **Sonnet.**

The hard part is already solved upstream: the service returns sorted arrays and each composition is independently mintable through the existing single-artifact mint path. This is a component refactor from a boolean to a list, plus a resolution change on the read side, against contracts that already exist. Well-spec'd, no policy judgement, no destructive path.

**New chat?** **Yes.** Pre-load:

- This task + the [batch plan](../plan-p5-recording-governance-v2-access-and-retention-batch.md) REC5-D4 + the p4 batch plan's §*Consequence* section.
- `frontend/components/consultation/RecordingReplayPlayer.tsx` — **the whole file (688 lines).** The shape you are changing: `ArtifactMode` **L56**, `PlayerPhase` **L80-93** (note `hasVideo` on both `ready` and `playing`), mount preflight **L196-227**, `hasVideoAvailable` **L232-236**, mint helper **L240-325**, the "Show video" toggle **L467-490**.
- `backend/src/services/recording-track-service.ts` — **L166-190** (`ArtifactRef`, the two-bucket result type) and **L706-820** (`getRecordingArtifactsForSession`, the 60 s cache, the `includeVideo`-wins bucketing at **L801-805**, the `startedAt` sort at **L808-811**).
- `backend/src/services/recording-access-service.ts` — **L264-323** (`resolveAudioArtifact` Path A / Path B), **L350-385** (`resolveVideoArtifact` + `extractCompositionSid`), **L720-960** (`mintReplayUrl` — note the single-artifact resolution at **L809-812**, the granted-audit-before-mint ordering at **L892-918**, and the OTP gate at **L784-806**).
- `frontend/components/consultation/ConsultArtifactsPanel.tsx` — **the whole file (123 lines).** The player mounts at **L63-68**. You change the player, not this panel's structure.
- p4 `rec-27`'s close-gate record of **how many video compositions a pause-heavy smoke consult actually produced.** Read the number; do not guess at the UI from an imagined worst case.
- `rec-18`'s landed marker surface, if it has shipped.

**Estimated turns:** 5–7.

---

## Acceptance criteria

### 1. Resolution — the read side

- [x] The replay preflight reports **how many** completed audio compositions and how many completed video compositions exist for the session, not a boolean per mode.
- [x] Ordering is `startedAt` **ascending**, matching `getRecordingArtifactsForSession` (`:808-811`). A consult's legs read in the order they happened.
- [x] Only `completed` compositions are offered. An `enqueued`, `processing` or `failed` composition is not a playable artifact and must not appear as one — `mintReplayUrl` already denies with `artifact_not_ready` (`:874-890`) and the UI must not invite that denial.
- [x] Resolution prefers p1's `recording_artifact_index` and keeps whatever fallback p1's `rec-04` left in place. **Do not retire Path B here** unless p1's backfill is confirmed complete for every session — REC1-D5 makes retirement a p5 action, but it is a *deliberate* one with its own verification, not a side effect of this refactor. If you retire it, say so in this file and prove the backfill covered everything.
- [x] Each composition remains **independently mintable** through the existing mint path. Minting is per composition, not per session.

### 2. The player surface

- [x] N audio and N video compositions are all offered, in order, each separately playable. **Nothing is merged, concatenated, or silently chosen** (REC5-D4).
- [x] `rg "hasVideo: boolean" frontend/components/consultation/` returns nothing when this task is done.
- [x] The **single-composition case renders as it does today.** No new selector chrome, no "1 of 1", no extra click. The common case must not pay for the uncommon one.
- [x] The multi-composition case makes the sequence legible: a doctor should understand that these are consecutive legs of one consult, not alternative versions of it. Duration and relative position carry that; a bare list of opaque SIDs does not.
- [x] Switching between compositions does not reset playback rate — the existing `readStoredPlaybackRate` persistence (`:183-185`, and the comment at `:29-31`) survives.
- [x] The audio-is-the-default posture holds (REC-D25 / Plan 08 Decision 10). Video still requires traversing the existing Warning → OTP → Mint flow, **per composition**. Selecting a second video leg does not bypass a gate the first one passed unless the existing 30-day OTP window legitimately covers it — that window is `video-replay-otp-service`'s to decide, not this component's.
- [x] Each mint still writes its own audit row and fires its own notification. Three video legs replayed is three access events, because it is. **Do not batch, suppress or dedupe** to make the notification volume feel nicer — that is REC-D24's territory and it belongs to [`rec-30`](./task-rec-30-symmetric-replay-notification.md).

### 3. Gap markers (composition, not implementation)

- [ ] If `rec-18` has shipped: its markers render **per composition**, positioned by its media-time arithmetic against that composition's own start. A gap belonging to leg 2 does not appear on leg 1. **STOP-and-surface — see Notes.** rec-18 arithmetic is one-artifact-per-kind; fixing it here would change p3.
- [ ] If `rec-18` has not shipped: the marker surface is byte-unchanged, and the component is structured so a per-composition marker set drops in. State in this file which case applied. *(N/A — rec-18 had shipped. `RecordingReplayGapList` left unchanged.)*
- [x] **No gap-marker logic is written or modified in this task.**

### 4. Degradation

- [x] Zero compositions renders the existing "no recording available" empty state — unchanged.
- [x] One composition failing to mint does not break the others. A doctor can play leg 1 and leg 3 while leg 2 errors, and the error is attributed to the leg that failed.
- [x] A composition that Twilio has since deleted (`status: 'deleted'`, or a 404 from `fetchCompositionMetadata`) surfaces honestly rather than as a generic failure. After [`rec-31`](./task-rec-31-twilio-reaching-hard-delete.md) ships, this becomes a reachable state on purpose.
- [x] The 60 s artifact cache (`recording-track-service.ts:716`) is not defeated by the new UI — the player must not re-fetch the artifact list per composition switch.

### 5. Tests

- [x] Three video compositions → three offered, in `startedAt` order.
- [x] One audio composition → the surface is identical to today's.
- [x] A non-`completed` composition is not offered.
- [x] A mint failure on one composition leaves the others playable.
- [x] Playback rate survives a composition switch.
- [x] Twilio is stubbed via `twilio-compositions.__setOverridesForTests` (`:138`). No live Twilio calls in the suite.

### Out of scope

- **Gap markers** — p3's `rec-18` / `rec-19`.
- The consult timeline — [`rec-28`](./task-rec-28-doctor-consult-timeline.md).
- Notification behaviour, symmetry or suppression — [`rec-30`](./task-rec-30-symmetric-replay-notification.md).
- Deletion, erasure, retention — [`rec-31`](./task-rec-31-twilio-reaching-hard-delete.md), [`rec-32`](./task-rec-32-dpdp-patient-erasure-path.md), [`rec-33`](./task-rec-33-retention-activation-runbook.md).
- The **video replay OTP gate** and the 30-day window, and the 90-day patient self-serve window (REC-D25). Consume both; change neither.
- Download, export or offline playback. Stream-only stays stream-only (attestation clause 5).
- Creating, merging or re-composing compositions in Twilio.
- Restructuring `ConsultArtifactsPanel.tsx` or `EndedCard.tsx` (REC5-D2).

---

## Scope Guard

- **Expected files touched: 4–6.** The player component, the replay status/resolution path in `recording-access-service.ts`, the frontend replay API types, and tests. Possibly one shared type file.
- **DO NOT** modify `recording-pause-service.ts` or any gap-marker code. **p3.**
- **DO NOT** modify `recording-track-service.ts`'s bucketing, sorting or cache. It already returns what you need.
- **DO NOT** modify `twilio-compositions.ts`.
- **DO NOT** modify the OTP gate (`recording-access-service.ts:784-806`), `video-replay-otp-service.ts`, or `VideoReplayOtpModal.tsx`.
- **DO NOT** modify the granted-audit-before-mint ordering (`:892-918`). A crash mid-mint must still leave a footprint.
- **DO NOT** restructure `EndedCard.tsx` or `ConsultArtifactsPanel.tsx`.
- **DO NOT** touch `frontend/components/patients-v2/**` or the patient-profile shell — that is [`rec-28`](./task-rec-28-doctor-consult-timeline.md)'s lane, running in parallel. The one file both lanes append to is the frontend API client; keep your additions to the replay types and expect to resolve one merge block.
- **DO NOT** write a migration. **STOP and surface** if you think you need one.
- **DO NOT** add a "download all legs" or concatenation affordance.

---

## Global safety gate

- **Data touched?** Reads `recording_artifact_index` and writes `recording_access_audit` rows via the existing mint path (one per composition replayed). RLS unchanged.
- **Any PHI in logs?** **No.** Composition SIDs, session IDs, counts and correlation IDs only.
- **External API call?** Yes — Twilio composition metadata reads and signed-URL mints, both through existing wrappers. No new provider surface. No AI calls.
- **Retention / deletion impact?** None directly. This task makes `rec-31`'s deleted-composition state visible to a user, which is a reason to get criterion 4 right.

---

## Done when

- A consult with N audio and M video compositions offers all of them in `startedAt` order, each separately playable and separately audited; the single-composition case is visually unchanged; `rg "hasVideo: boolean"` returns nothing; one leg's mint failure does not break the others; playback rate survives a switch; gap markers either render per composition or are byte-unchanged, with the case recorded in this file; the OTP gate and both retention windows are untouched; no migration; frontend and backend typecheck, lint and tests green with no live Twilio calls.

---

## Related

- Batch plan: [`plan-p5-recording-governance-v2-access-and-retention-batch.md`](../plan-p5-recording-governance-v2-access-and-retention-batch.md) — §Coordination boundaries
- Charter: [`plan-recording-governance-v2-charter.md`](../../plan-recording-governance-v2-charter.md) — REC-D19, REC-D25
- Execution order: [`EXECUTION-ORDER-p5-recording-governance-v2-access-and-retention.md`](./EXECUTION-ORDER-p5-recording-governance-v2-access-and-retention.md)
- Produces the multiplicity: [`p4 — video escalation control`](../../p4-video-escalation-control/plan-p4-recording-governance-v2-video-escalation-control-batch.md)
- Shares this component: [`p3 — pause integrity`](../../p3-pause-integrity/plan-p3-recording-governance-v2-pause-integrity-batch.md) (`rec-18`)
- Sibling in this wave: [`rec-28`](./task-rec-28-doctor-consult-timeline.md)

---

**Last Updated:** 2026-08-20.

---

## Notes (2026-08-20)

### Gap markers — rec-18 had shipped

`RecordingReplayGapList` is **byte-unchanged**. Markers still hang off the playing composition's pane (audio vs video), using rec-18's existing `mediaOffsetMs`.

rec-18's own header states it positions against **one audio artifact and one video artifact** (`pickReplayArtifact` takes the newest completed). That arithmetic is wrong under multiplicity: a gap on leg 2 would be offset from the newest (or first) start, not that leg's start. **STOP-and-surface, not a fix** — changing it would also move `rec-19`'s transcript renderer. Per-leg gap placement remains p3's.

### Path B

`TRANSCRIPT_AUDIO_FALLBACK_ENABLED` stays `true`. Availability still resolves audio through index → transcript. Listing prefers `getRecordingArtifactsForSession` (60 s cache, one call) and synthesizes the Path B SID when the Twilio list misses it.

### rec-27 composition count

Still **pending** (p4 founder smoke). Player chrome is a compact part list, not a timeline scrubber.
