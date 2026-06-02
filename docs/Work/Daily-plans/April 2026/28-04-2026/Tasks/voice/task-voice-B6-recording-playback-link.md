# Task voice-B6: Recording playback link ("Listen to your consult" CTA)

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch B (robust call) — **S item, ~1 day**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

When a recording is available (Plan 07 surface), the post-call summary's `[Listen to recording]` CTA opens an inline playback player. Player has standard controls + scrubber + download (if doctor; not patient).

**Hard-depends on Plan 07** for the actual `GET /api/v1/consultations/:id/replay` endpoint. If Plan 07 hasn't shipped at PR time, B6 ships as a **disabled placeholder** — the CTA shows but is grayed-out with tooltip "Recording will be available soon"; lights up automatically when Plan 07 ships.

**Estimated time:** ~1 day (player ~4h; integration + degraded path ~4h).

**Status:** ✅ Shipped (2026-05-20). `RecordingPlaybackPlayer` + `getReplayUrl` wired in shared `<CallPostCallSummary>` for audio-only replays; video keeps `<RecordingReplayPlayer>`.

**Depends on:** [task-voice-B5](./task-voice-B5-post-call-summary.md) — hard (player mounts inside summary). Plan 07 — hard for full functionality; soft for ship-as-placeholder.

**Source:** [T4 §T4.28](../../../../Product%20plans/voice-consult/plan-t4-voice-post-call.md).

---

## Acceptance criteria

### Two-mode behavior

- [x] **Mode A (Plan 07 NOT shipped):** the CTA in [task-voice-B5](./task-voice-B5-post-call-summary.md) is disabled with tooltip "Recording will be available soon". B6 ships only the disabled-state UI; no player; no API call.
- [x] **Mode B (Plan 07 shipped, recording available):** clicking the CTA opens the `<RecordingPlaybackPlayer>` (audio-only; video uses `<RecordingReplayPlayer>`).

### `<RecordingPlaybackPlayer>` component

- [x] **New component** at `frontend/components/consultation/RecordingPlaybackPlayer.tsx`:
  - Props: `replayUrl`, `title`, `sessionId`, `consultEndedAt`, `showDownload`, `onRetry`, `onClose`.
  - Renders an `<audio controls>` element with the `replayUrl`.
  - Above the audio: title ("Recording — Dr. Sharma · 29 Apr 2026 · 24m 13s").
  - Below the audio: `[Download]` (doctor only — `showDownload` from caller role), `[Close]`.
  - **`mode='readonly'`** is implicitly the case (post-call surface); no edit affordances.
- [x] **Loading state** — while audio buffers, spinner + "Loading…".
- [x] **Error state** — if `<audio>` errors (signed URL expired, file missing), show "Recording unavailable" with retry button.

### API integration

- [x] **`frontend/lib/api.ts`** — `getReplayUrl(token, sessionId)` maps Plan 07 `POST …/replay/audio/mint` → `{ replayUrl, expiresAt }`.
- [x] Endpoint owned by Plan 07: mint route (task doc's GET `/replay` is conceptual; implementation uses existing mint).
- [x] **Caller** (`<CallPostCallSummary>` `[Listen to recording]` button) calls `getReplayUrl()` on click; on success, mounts `<RecordingPlaybackPlayer>`. On failure, inline error + retry.

### Doctor download path

- [x] **Doctor only:** `[Download]` button triggers a direct browser download of the signed URL. Filename: `consult-{sessionId}-{date}.mp3`.
- [x] **Patient: no download.** Patients can only stream. Decision is implicit; flag at PR time if product wants different.

### Manual smoke (with Plan 07 shipped)

- [ ] Open post-call summary for a recorded call → CTA enabled.
- [ ] Click → player opens, audio loads + plays.
- [ ] Scrub mid-track → playback resumes from new position.
- [ ] Doctor sees `[Download]` button; click → file downloads.
- [ ] Patient does NOT see `[Download]`.
- [ ] Click `[Close]` → player unmounts.
- [ ] Open same player after URL TTL expires → "Recording unavailable" + retry → re-fetches new signed URL.

### Manual smoke (without Plan 07)

- [ ] Open post-call summary → CTA disabled, tooltip "Recording will be available soon".
- [ ] Backend mint returns 404 → inline error + retry (CTA stays enabled when summary says `available`).

### General

- [x] Type-check + lint clean.
- [ ] No console errors on either mode.
- [x] No PHI in logs.

---

## Out of scope

- **Recording WAVE-form visualization.** Out of scope.
- **Playback speed controls.** Out of scope (use browser's native if available).
- **Transcript overlay** (Plan 10 deferred).
- **Recording editing** (Plan 07 owns).
- **Sharing / forwarding.** Out of scope.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/RecordingPlaybackPlayer.tsx` — **new** (~120 LOC).
- `frontend/lib/api.ts` — **edit** (~15 LOC: getReplayUrl).
- `frontend/components/consultation/VoicePostCallSummary.tsx` — **edit** (~25 LOC: wire CTA → player mount).

**Backend / migrations:** none (Plan 07 owns the endpoint; B6 just consumes).

**Tests:** smoke only.

---

## Notes / open decisions

1. **Why `<audio controls>` over a custom player** — native is accessible, keyboard-friendly, and free. Custom player is over-engineering for v1.
2. **Plan 07 graceful degradation** — the disabled-CTA path is the primary UX even before Plan 07 ships, so B5 can ship without B6 being functionally complete. B6 lights up automatically.
3. **Doctor-only download** — clinical record concern; patients shouldn't redistribute their consult audio. Easy to relax later.
4. **Signed-URL TTL** — Plan 07 owns the TTL; if short (e.g. 5 min), the player needs auto-refresh logic. Out of scope for v1; flag.
5. **MP3 vs WebM** — depends on Plan 07's recording format. The player works either way; flag at PR time.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch B](../Plans/plan-voice-consult-selected-features.md#sub-batch-b--robust-call-8-days)
- **Source item:** [T4 §T4.28](../../../../Product%20plans/voice-consult/plan-t4-voice-post-call.md)
- **Hard deps:** [task-voice-B5](./task-voice-B5-post-call-summary.md), Plan 07 (recording infrastructure).
- **Plan 07 reference:** [plan-f07-recording-replay-status.md](../../../../Product%20plans/text-consult/plan-f07-recording-replay-status.md).

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** ✅ Shipped (2026-05-20); closes Sub-batch B implementation. Manual smoke pending.
