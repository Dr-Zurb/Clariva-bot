# Task video-D2: Recording + transcript playback (HTML5 `<video>` + transcript sidebar)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch D (T4 post-call) — **M item, ~1 day**

---

## Task overview

Patients want to re-watch the call (took notes? missed something?). Voice batch shipped audio playback (voice B6 / `<RecordingPlaybackPlayer>`); video extension uses HTML5 `<video>` element instead of `<audio>` and adds a **transcript sidebar** (when Plan 10 has shipped — graceful degradation if not).

Reachable from D1 post-call summary CTA "Listen to recording" / "Watch recording".

**Estimated time:** ~1 day.

**Status:** ✅ **Shipped (2026-05-01)** — Phase 1: video player extension was already done by Plan 07 + Plan 08 (Task 44 / Decision 10 LOCKED); only the deep-link from D.2 summary + transcript-timeline placeholder were net-new. Transcript click-to-seek deferred to Plan 10 (graceful degrade with placeholder card).

**Depends on:** voice [task-voice-B6](./task-voice-B6-recording-playback-link.md) (HARD — extend) — **N/A:** the existing `<RecordingReplayPlayer>` is the shared surface (Plan 07 / Plan 08; not voice-only). Already supports both modalities. Plan 07 (SOFT — recording infra) — **shipped** (Plan 07 + Plan 08 Task 44 ✅). Plan 10 (transcript chunks with timestamps) — **not shipped;** transcript timeline rendered as placeholder card.

**Source:** [T4 §T4.28](../../../../Product%20plans/video-consult/plan-t4-video-post-call.md); [decision §21](../Plans/plan-video-consult-selected-features.md#before-sub-batch-d-starts).

---

## Audit + scope decision (2026-05-01)

Execution-time audit found the D.3 spec was written assuming voice B6 is the canonical replay surface and video D.2 needs to "extend" it for video. The audit invalidated that framing: **Plan 07 (`<RecordingReplayPlayer>`) is the shared replay surface — not a voice-only component — and Plan 08 / Task 44 (Decision 10 LOCKED, "show video" toggle) already shipped the audio-default + video-toggle player WITH the OTP gate, watermark, speed picker, signed-URL re-mint, and consent-warning modal.** Specifically:

1. **`frontend/components/consultation/RecordingReplayPlayer.tsx`** already renders `<audio>` by default and `<video controls>` when the patient toggles "Show video" (after `<VideoReplayWarningModal>` consent + `<VideoReplayOtpModal>` OTP gate). Watermark overlay (centered text for audio, corner timestamp+name for video) already in place.
2. **`<ConsultArtifactsPanel>`** already mounts the player on doctor's `dashboard/appointments/[id]` AND patient's `/c/replay/[sessionId]?t=<HMAC>` (post-call SMS link surface).
3. **Backend**: `recording-access-service.ts` (`getReplayStatus` / `mintReplayAudioUrl` with `?artifactKind=video`) already serves both modalities. Audit row written before signed URL hits the wire.
4. **Plan 10 (chunked transcript replay endpoint with `timestamp_ms`) is NOT shipped.** Only the Task 32 transcript-PDF service exists (full-document export, no chunk-level seek primitive). Per spec, sidebar gracefully degrades.

Real Phase 1 scope reduced to:

1. **Deep-link wire from D.2 summary** — `<CallPostCallSummary>` reveals "Watch recording" / "Listen to recording" toggle when `recording.status === 'available'`. Click expands `<RecordingReplayPlayer>` inline below the summary using the same `bearerJwt` (works for both doctor JWTs and patient scoped JWTs because the player accepts both). Avoids navigation complexity and works in BOTH `post-call` (no in-tab patient route) and `history-detail` mountContexts.
2. **Transcript-timeline placeholder card** — new `<TranscriptReplayPlaceholder>` component mounted in `<ConsultArtifactsPanel>` between the player and the existing Task 32 PDF download. Sets the layout slot so the page doesn't shift when Plan 10 lands; explicitly distinguishes "interactive timeline (Plan 10 dep)" from "PDF export (Task 32 ✅ shipped)".

Out of Phase 1 (deferred / blocked):

- **Click-to-seek transcript sidebar** — blocked on Plan 10. When Plan 10 ships a chunked transcript endpoint, swap the placeholder for a `<TranscriptReplaySidebar>` and wrap the player + sidebar in a 2-column layout inside `<ConsultArtifactsPanel>` with a shared seek ref/context.
- **2-column "player + sidebar" layout** — defer with the click-to-seek work; placeholder card under the player is enough for now.

---

## Acceptance criteria

### Extend `<RecordingReplayPlayer>` for video — already shipped (Plan 07 + Plan 08 / Task 44)

- [x] **`frontend/components/consultation/RecordingReplayPlayer.tsx`** already renders `<audio>` by default + `<video controls>` when patient toggles "Show video" (Plan 08 / Task 44 / Decision 10 LOCKED). Audio-default + video-toggle posture intentional (Decision 10).
- [x] Standard browser controls (play/pause/seek/volume); fullscreen disabled by Decision 10 mandate (`controlsList="nodownload noplaybackrate nofullscreen"` + `disablePictureInPicture`) so screen-recorded captures carry the watermark.
- [x] Shows "Recording is still processing" / "No recording was made" / "Recording revoked" / "Replay window has expired" / "Not available" empty states for the various Plan 07 deny reasons (`getReplayStatus` returns `available: boolean` + `reason`).

### Transcript sidebar (Plan 10 dep)

- [ ] **If Plan 10 has shipped a transcript-replay endpoint:** sidebar shows transcript chunks, click-to-seek (jumps video to that timestamp). — **Plan 10 NOT shipped** at execution time. Deferred.
- [x] **If Plan 10 hasn't shipped:** sidebar shows "Transcript will appear here after AI clinical assist ships" placeholder. Don't break the player. — **Done:** new `<TranscriptReplayPlaceholder>` component mounted in `<ConsultArtifactsPanel>` between the player and the existing Task 32 PDF download. Placeholder explicitly tells the user the PDF is available below.

### Plan 07 OTP / consent gate — already shipped

- [x] **`<VideoReplayWarningModal>` and `<VideoReplayOtpModal>`** already integrated by Plan 08 / Task 44. Warning modal shows BEFORE the patient can flip the "Show video" toggle; OTP modal shows when the 30-day window has lapsed (or on demand via the `video_otp_required` backend code).
- [x] On consent confirm + OTP success → `mintReplayAudioUrl(?artifactKind=video)` runs and the player flips to `<video>` mode. Doctors skip the OTP gate (gate is patient-only by Decision 10).

### Mount points

- [x] **Reachable from D1 post-call summary CTA** — `<CallPostCallSummary>` reveals "Watch recording" / "Listen to recording" toggle when `recording.status === 'available'`. Click expands `<RecordingReplayPlayer>` inline below the summary card. Works in BOTH `mountContext='post-call'` (in-tab after `<CallDisconnectSplash>`) AND `mountContext='history-detail'` (doctor's `dashboard/appointments/[id]`).
- [x] **Reachable from `appointments/:id` for past consults** — already mounted via `<ConsultArtifactsPanel>` (Plan 07 / Task 29). The new placeholder card slots in between the player and the existing PDF download without shifting the layout.

### Manual smoke

- [ ] Click "Watch recording" from D1 → OTP modal → on success, video player loads. — Patient-side smoke deferred to integration window (no patient post-call surface yet, but in-tab expand works).
- [x] Standard controls work — exercised by existing Plan 07 / Task 44 smoke.
- [ ] If Plan 10 shipped: transcript sidebar shows chunks; click chunk → video seeks. — N/A.
- [x] If Plan 10 not shipped: placeholder card renders; player works without it. — Verified by tsc + eslint clean and visual inspection of `<ConsultArtifactsPanel>` mount.
- [x] Player gracefully handles 404 (recording not ready) with friendly placeholder. — `<RecordingReplayPlayer>` already maps deny reasons to copy.

### `mode='readonly'`

- [x] Player IS the readonly view; readonly is its native context. The new deep-link toggle in `<CallPostCallSummary>` only changes a local boolean state; no destructive operations.

### General

- [x] Type-check clean (frontend `tsc --noEmit` green).
- [x] Lint clean (eslint on touched files green).
- [x] No console errors (player + placeholder degrade gracefully).

---

## Out of scope

- **Trim / clip / share recording.** Plan 07 owns; out of scope for this task.
- **Download recording as MP4.** Plan 07 owns.
- **Edit transcript.** Plan 10 owns.
- **Speaker-by-speaker filtering of transcript.** Defer to v2 (when Plan 10 has speaker labels reliably).

---

## Files actually touched (Phase 1, 2026-05-01)

**Frontend:**
- `frontend/components/consultation/CallPostCallSummary.tsx` — edited (`+~40` lines: import `<RecordingReplayPlayer>`, `playerOpen` local state, derive `callerRole` from counterparty, "Watch recording" / "Listen to recording" toggle button + inline expand mount).
- `frontend/components/consultation/ConsultArtifactsPanel.tsx` — edited (`+~6` lines: import + mount `<TranscriptReplayPlaceholder>` between the player and the Task 32 PDF download).
- `frontend/components/consultation/TranscriptReplayPlaceholder.tsx` — **NEW** (~50 LOC; passive placeholder card; documents the Plan 10 swap-in path).

**Frontend (NOT touched):**
- `frontend/components/consultation/RecordingReplayPlayer.tsx` — already supports both audio + video (Plan 08 / Task 44 / Decision 10 LOCKED). No changes needed.
- `frontend/lib/api.ts` — `getReplayStatus`, `mintReplayAudioUrl(?artifactKind=video)` already exist; no changes.

**Backend / migrations / tests:** none in this task; Plan 07 owns the replay endpoint, OTP gate, audit log, and signed-URL minting.

---

## Notes / open decisions

1. **Decision §21** — auto-fetch on summary mount; degrades gracefully if Plan 07 not shipped.
2. **Plan 07 contract** — `GET /api/v1/consultations/:id/replay` returns either a signed URL or a 404 + "not ready" status.
3. **Transcript sync** — Plan 10's transcript chunks should include `timestamp_ms` for seek; if not, render without click-to-seek (text only).
4. **PHI hygiene** — recording URL is signed (one-shot, short TTL); transcript is read-only render; never edited or copied to logs.
5. **Mobile fullscreen** — `<video>` natively supports fullscreen on iOS Safari + Android Chrome.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch D](../Plans/plan-video-consult-selected-features.md#sub-batch-d--post-call-3-days)
- **Source item:** [T4 §T4.28](../../../../Product%20plans/video-consult/plan-t4-video-post-call.md)
- **Sibling (voice):** [task-voice-B6](./task-voice-B6-recording-playback-link.md)
- **Decision:** [§21 — auto-fetch](../Plans/plan-video-consult-selected-features.md#before-sub-batch-d-starts)
- **Plan 07:** [recording replay](../../19-04-2026/Plans/plan-07-recording-replay-and-history.md)
- **Plan 10:** AI clinical assist (transcript)

---

**Owner:** TBD
**Created:** 2026-04-30
**Shipped:** 2026-05-01 (Phase 1 — deep-link wire from D.2 summary + transcript-timeline placeholder; player extension was already done by Plan 07 + Plan 08 / Task 44).
**Status:** ✅ Shipped (Phase 1). Click-to-seek transcript sidebar + 2-column layout deferred to Plan 10 (chunked transcript-replay endpoint).
