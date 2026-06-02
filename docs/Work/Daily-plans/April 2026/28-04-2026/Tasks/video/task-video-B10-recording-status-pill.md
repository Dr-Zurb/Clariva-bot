# Task video-B10: Recording-status pill in caller card

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch B (T2 real polish) — **XS item, ~1h**

---

## Task overview

Plan 02 + 08 already track recording state (`useRecordingState`, `useVideoEscalationState`); existing `<VideoRecordingIndicator>` shows a pulsing red dot. T2.18 surfaces a more prominent **pill in the caller-card overlay (B2)**:

- `● Recording` — pulsing red when recording is active.
- `⏸ Paused` — amber when paused.
- (no pill when idle).

This closes a "wait, are we being recorded?" anxiety loop — patients see the pill front-and-center in the call header, not buried in a corner.

Cheapest item in Sub-batch B. Reads existing state; pure UI.

**Estimated time:** ~1h.

**Status:** Complete (2026-05-01).

**Depends on:** [task-video-B2](./task-video-B2-caller-card-overlay.md) (HARD — pill mounts inside caller card). ✅ Cleared (2026-05-01).

**Source:** [T2 §T2.18](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md).

---

## Acceptance criteria

### Pill component

- [x] **In `<CallerCardOverlay>` (B2)** — render the recording pill in the right edge slot when `recordingStatus !== 'idle'`:
  - `'recording'` → pulsing red dot + "Recording" text in red-on-translucent-dark (`bg-red-600/90`, `animate-pulse` on the dot).
  - `'paused'` → static amber dot + "Paused" text in amber-on-translucent-dark (`bg-amber-500/90`, no pulse).
- [x] No pill when `recordingStatus === 'idle'` (renderer returns `null`).
- [x] Tooltip on hover: native HTML `title` attribute. "Audio is being recorded for the clinical record." (recording, audio only) / "Audio + video is being recorded for the clinical record." (recording, video escalation also active) / "Recording is paused. [More]" (paused; the `[More]` is text-only in v1 per Out of scope #1 — clicking the pill to open recording controls is a future PR).

### State sourcing

- [x] In `<VideoRoom>`, derive the `recordingStatus` prop passed to `<CallerCardOverlay>`:
  - Combines voice recording state (Plan 02 / 05 — `useRecordingState` → `recordingState.paused`) + video escalation state (Plan 08 — `isVideoRecordingActive` derived from `useVideoEscalationState`).
  - Gate: `recordingEnabled = Boolean(recordingSessionId && recordingToken)`. When false → `'idle'` (no pill).
  - `recordingState.paused === true` → `'paused'` (wins over the recording branch).
  - Otherwise → `'recording'` (covers both audio-only AND audio+video escalation; the binary affects only the tooltip text, not the pill enum — consistent with Note #1's "single pill regardless").

### Manual smoke

- [ ] Recording starts → pill appears in caller card on both sides. *(Pending PR review.)*
- [ ] Recording pauses → pill switches to amber + "Paused" text + no pulse. *(Pending PR review.)*
- [ ] Recording ends → pill hides. *(Pending PR review — driven by `recordingEnabled` flipping to `false`, e.g. session marked complete.)*
- [ ] Hover pill → tooltip explains the differentiated audio-vs-audio+video copy.
- [ ] Pill visible in all layouts (gallery / speaker / sidebar; B6) — verify the caller card mounts in all of them. *(Forward-compat — B6 hasn't shipped; the card always mounts inside the same `relative` wrapper, so any layout that preserves that wrapper inherits the pill for free.)*

### `mode='readonly'`

- [ ] In readonly view, derive recording state from session metadata; show pill statically (no live updates needed). **Deferred** — `<VideoRoom>` has no `mode` prop today (Plan 07 history viewer renders elsewhere). When the readonly mount lands, it'll pass `recordingStatus` from the session-metadata blob and `<CallerCardOverlay>`'s `alwaysVisible={true}` keeps the pill glanceable without the auto-dim.

### General

- [x] Type-check + lint clean (`npx tsc --noEmit` → 0 errors; `npx eslint components/consultation/CallerCardOverlay.tsx components/consultation/VideoRoom.tsx` → 0 issues).
- [ ] No console errors. *(Pending PR review.)*

---

## Out of scope

- **Click pill → open recording controls.** Out of scope; tooltip mentions but doesn't deep-link.
- **Different copy for video-recording vs voice-only.** Out of scope; same copy ("Audio is being recorded for the clinical record"; if video escalation is active, "Audio + video is being recorded for the clinical record" — extra branch acceptable).
- **Recording duration in pill.** Out of scope; A3 timer covers call duration.

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/CallerCardOverlay.tsx` — **edit** (~15 LOC: render pill in slot).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~10 LOC: derive recordingStatus + pass through).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Audio-recording vs video-recording copy** — single pill regardless; tooltip differentiates ("Audio" vs "Audio + video" depending on escalation state).
2. **Pulse animation** — `@keyframes pulse` from existing `<VideoRecordingIndicator>` (Plan 08); reuse the same animation class.
3. **Don't duplicate `<VideoRecordingIndicator>`** — that component lives elsewhere in the room; B10's pill is a SECOND surface for the same data, not a replacement. Document.
4. **Doctor + patient symmetry** — both see the same pill; no role-specific copy.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch B](../Plans/plan-video-consult-selected-features.md#sub-batch-b--real-polish-5-days)
- **Source item:** [T2 §T2.18](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md)
- **Hard dep:** [task-video-B2](./task-video-B2-caller-card-overlay.md)
- **Plan 02:** [recording consent](../../19-04-2026/Plans/plan-02-recording-consent.md)
- **Plan 08:** [doctor video escalation](../../19-04-2026/Plans/plan-08-video-recording-doctor-control.md)

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** Complete (2026-05-01).

---

## Implementation log (2026-05-01)

### Files touched

**Frontend:**
- `frontend/components/consultation/CallerCardOverlay.tsx` — **edit** (~30 LOC across three blocks):
  1. New `recordingTooltip?: string` prop (carries the differentiated audio-vs-audio+video copy from `<VideoRoom>`).
  2. New `useEffect([recordingStatus])` that auto-reveals the card on every recording transition (idle → recording → paused → recording → idle) — recording state is the single most anxiety-loaded signal in the call header, so users should never have to mouse-over to confirm it.
  3. Upgraded `renderRecordingPill()` to accept the tooltip prop (with a sensible fallback when omitted), use the spec's "Recording" / "Paused" copy (vs the placeholder's "Rec" / "Paused"), and downgraded SR ARIA to `aria-label`-only (dropped the placeholder's `role="status" aria-live="polite"`) so the existing `<VideoRecordingIndicator>` retains the SR live-region contract — no double-announcement.
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~30 LOC, single block):
  1. Added a `recordingStatus` + `recordingTooltip` derivation right after `callerCardStatus`. Gates on `recordingEnabled`; reads `recordingState.paused` and `isVideoRecordingActive` from the existing hooks; no new hooks instantiated.
  2. Threaded `recordingStatus={callerCardRecordingStatus}` and `recordingTooltip={callerCardRecordingTooltip}` into the `<CallerCardOverlay>` mount, replacing the B2 placeholder `recordingStatus="idle"`.

**Backend / migrations / tests:** none.

### Key design decisions

1. **The corner `<VideoRecordingIndicator>` STAYS** *(per Note #3)*. The card pill is a SECOND surface for the same upstream state — together they close the "wait, are we being recorded?" anxiety loop without creating a third source-of-truth. The corner indicator keeps the SR live-region contract; the card pill is sighted-user reinforcement. No code in `<VideoRecordingIndicator>` was touched.

2. **Single binary pill (not three states), tooltip carries the audio-vs-video distinction** *(per Note #1)*. `recordingStatus` is `'recording' | 'paused' | 'idle'`. The audio-only-vs-audio+video distinction lives ONLY in the tooltip text, not the pill color or copy. Why: a patient watching the call doesn't need different visual treatment for "they're recording audio" vs "they're recording audio + video"; both equally trigger the consent surface awareness. The tooltip exists for users who want to know more.

3. **No SR live-region duplication.** The card pill deliberately omits `role="status"` / `aria-live="polite"` — those live on the corner `<VideoRecordingIndicator>`. The pill keeps an `aria-label="Recording"` / `aria-label="Recording paused"` so SR users navigating into the card still hear it on focus traversal. This avoids the "Recording. Recording." double-announcement that would otherwise fire when recording starts.

4. **Native `title` tooltip instead of a custom popover.** The spec says "Tooltip on hover: …" — the cheapest correct answer is the browser's native `title` attribute (shows on hover after a delay; works everywhere; no JS required; inherits OS-level a11y). A custom popover would need radix/shadcn (not in deps yet) and would compete with `<NetworkBars>`' popover for the same z-index slice. Revisit when a tooltip primitive lands in the design system.

5. **Auto-reveal on recording transitions.** The card's auto-dim (B2) fades the card to ~30% opacity after 5 s of pointer inactivity. For recording transitions specifically, this is the wrong default — patients want to SEE the pill change, not have it fade away. Added a dedicated `useEffect([recordingStatus])` that pulls the card back to full opacity AND restarts the 5s timer on every transition. This composes cleanly with B2's existing `useEffect([status])` reveal-on-status-change pattern.

6. **`[More]` is text-only in v1.** The paused tooltip reads "Recording is paused. [More]" verbatim — the `[More]` suggests a deep-link to recording controls, but actually clicking the pill does nothing today (Out of scope #1). Documented in the inline comment so the future PR that wires the click handler knows the contract is already in place.

7. **Pause-vs-resume vs end semantics.** `useRecordingState` exposes `state.paused` (boolean) but no explicit "recording ended" state — that's implied by the session leaving the recording-enabled state (i.e. `recordingEnabled = false`). So the pill hide path is: doctor stops recording → backend marks session non-recorded → next consultation-state read returns `recordingEnabled = false` → pill becomes `'idle'` → renderer returns `null`. Today this transition only fires when the session itself ends; mid-call "stop recording" isn't a supported flow yet.

8. **No coupling on `escalation` state for the binary.** `isVideoRecordingActive` could in principle have its own pause concept (someone could imagine pausing video while audio keeps recording), but Plan 08's escalation hook doesn't model that today — there's only `'locked'` vs other kinds. So the pill's `'paused'` branch is governed solely by `recordingState.paused` (the audio recording's pause flag); video escalation only affects tooltip text, never the pill color. If video gets its own pause lifecycle in a future plan, this derivation needs revisiting.

### Verification

- `npx tsc --noEmit` → exit 0.
- `npx eslint components/consultation/CallerCardOverlay.tsx components/consultation/VideoRoom.tsx` → exit 0.
- No `--strict` widening / `any` introductions on the surface area.

### Pending items / follow-ups

1. **Manual smoke during PR review** — the smoke checkboxes above (start/pause/end transitions, tooltip hover, both-side visibility) need a real consult to verify.
2. **Click-to-open recording controls** (Out of scope #1) — when this lands, the pill becomes a `<button>`, the `[More]` text gets a click handler, and the corner `<VideoRecordingIndicator>` may want to mirror the same affordance OR get hidden in favor of the card pill. Coordinate.
3. **Mid-call "stop recording" UX** — today the pill only hides when the session ends. If a future PR adds a doctor-side "stop recording mid-call" control (Plan 08's roadmap?), the `recordingEnabled` derivation here may need to read a more granular flag.
4. **Layout-swap (B6) integration** — the pill inherits its position from the caller-card overlay, which inherits its position from the remote tile's `relative` wrapper. As long as B6 preserves that wrapper as the host for the speaker/sidebar layouts, the pill comes along for free. If B6 introduces a new layout primitive that drops the wrapper, the card mount needs a new home.
5. **`mode='readonly'` for Plan 07 history viewer** — pass `recordingStatus` from session metadata + `alwaysVisible={true}` on the card; everything else just works.
