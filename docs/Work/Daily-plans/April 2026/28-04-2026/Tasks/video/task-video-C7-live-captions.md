# Task video-C7: Live captions (HARD DEP on Plan 10)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch C (T3 clinical workflow) — **L item, ~5 days**

---

## Task overview

Critical accessibility feature for hearing-impaired patients. Also useful for non-native-speaker accuracy ("Did the doctor say 'arthritis' or 'alcoholism'?"). T3.25 streams real-time speech-to-text and overlays captions on the video tile.

**HARD DEPENDENCY on Plan 10 (AI clinical assist).** Plan 10 owns the transcript pipeline (server-side or browser-side ASR; PHI handling; clinical-record artifact; vendor decision). C7 is the **first consumer** of Plan 10's live transcript stream and ships the UI overlay surface.

**Estimated time:** ~5 days (UI + integration once Plan 10 ships transcript stream).

**Status:** Drafted; **BLOCKED on Plan 10**.

**Depends on:** Plan 10 (HARD — transcript pipeline must exist).

**Source:** [T3 §T3.25](../../../../Product%20plans/video-consult/plan-t3-video-clinical-workflow.md); [decision §17](../Plans/plan-video-consult-selected-features.md#before-sub-batch-c-starts).

---

## Acceptance criteria

### Pre-flight (verify Plan 10 readiness)

- [ ] Confirm Plan 10 ships `getLiveTranscript(sessionId): Observable<TranscriptChunk>` or equivalent.
- [ ] Confirm transcript chunks include speaker label (`doctor` / `patient`), text, confidence, timestamp.
- [ ] Confirm PHI handling is in place (transcript chunks routed appropriately; storage / retention defined).

### `<LiveCaptionsOverlay>` component

- [ ] **New component** at `frontend/components/consultation/LiveCaptionsOverlay.tsx`:
  - Subscribes to Plan 10's transcript stream for the session.
  - Renders the most recent ~3 lines of transcript at the bottom of the video canvas.
  - Speaker label prefix: "Dr. Sharma:" / "Patient:" with color coding.
  - Auto-scrolls; older lines fade out.
  - Style: black-on-translucent-yellow (high-contrast accessibility); ~16px font on desktop, ~14px on mobile.

### Toggle UI

- [ ] **Captions toggle** in controls bar (Lucide `Captions`).
- [ ] On click → toggles overlay visibility.
- [ ] Persistence: localStorage `video-captions-on` (default OFF; opt-in).

### Decision §17 — surface choice

- [ ] **Overlay on video tile** (recommended; sticky to bottom; both sides see).
- [ ] **OR companion chat scroll** (alternative; less intrusive but less prominent).
- [ ] Implement overlay v1; companion-chat scroll deferred to follow-up if requested.

### Performance

- [ ] Captions render within ~500ms of speech utterance.
- [ ] Subscription throttling — render at most every 200ms (avoid React re-render storm if transcript chunks arrive rapidly).

### `mode='readonly'`

- [ ] In readonly view, captions render the FULL transcript synchronized to video playback (depends on Plan 10 / Plan 07 replay integration). Defer to v2 if Plan 10 readonly path isn't ready.

### Manual smoke (post-Plan-10)

- [ ] Both sides toggle captions ON → captions render within ~500ms of speech.
- [ ] Speaker labels appear correctly per side.
- [ ] On hold (B3) → captions pause (no audio = no transcript).
- [ ] Reconnect (B4) → captions resume after reconnect.
- [ ] Hearing-impaired test user can follow the conversation via captions.

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] **PHI hygiene** — captions never logged to console / Sentry / analytics; transcript handling per Plan 10.

---

## Out of scope

- **Caption translation to other languages.** Out of scope v1 (Plan 10 may add later).
- **Patient-side caption preferences (font size, color, position).** Out of scope v1; system defaults.
- **Captions in companion-chat scroll.** Out of scope v1 (decision §17 — overlay only).
- **Speaker diarization without Plan 10.** This task does NOT implement ASR; relies on Plan 10.

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/LiveCaptionsOverlay.tsx` — **new** (~120 LOC).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~25 LOC: toggle button + mount overlay).
- `frontend/lib/api.ts` — **edit** (~20 LOC: `subscribeToLiveTranscript(sessionId)` consuming Plan 10 stream).

**Backend:** none in this task; Plan 10 owns the transcript pipeline.

**Migrations:** none in this task.

---

## Notes / open decisions

1. **Plan 10 readiness gate** — DO NOT start implementation until Plan 10's live transcript pipeline is committed to ship. Track in this task's status.
2. **Decision §17** — overlay (recommended). Companion-chat scroll alternative deferred.
3. **PHI hygiene** — transcript chunks may contain PHI; never log them; rely on Plan 10's storage and retention policies.
4. **Latency** — sub-second feels live; >2s feels broken. Set Plan 10 SLO at ~500ms.
5. **Accessibility** — color-blind-friendly yellow-on-black; consider a "high-contrast mode" toggle if user feedback requests.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch C](../Plans/plan-video-consult-selected-features.md#sub-batch-c--clinical-workflow-10-days)
- **Source item:** [T3 §T3.25](../../../../Product%20plans/video-consult/plan-t3-video-clinical-workflow.md)
- **Decision:** [§17 — caption surface](../Plans/plan-video-consult-selected-features.md#before-sub-batch-c-starts)
- **HARD DEP:** Plan 10 (AI clinical assist) — transcript pipeline owner

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** Drafted; **BLOCKED on Plan 10 commitment**. Cannot ship until Plan 10's live transcript stream exists.
