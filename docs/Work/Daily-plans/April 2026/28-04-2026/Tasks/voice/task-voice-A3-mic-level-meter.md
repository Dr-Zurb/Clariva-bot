# Task voice-A3: Local mic-level meter

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch A (T1 quick wins) — **S item, ~2h**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

A live visual meter showing the user's own mic input level. Patients and doctors can immediately see whether their mic is working — instead of saying "can you hear me?" three times into the void. Reused inside the pre-call mic check (A6) and inside the in-call header.

**Estimated time:** ~2h.

**Status:** Complete.

**Depends on:** nothing.

**Source:** [T1 §T1.4](../../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md).

---

## Acceptance criteria

### `frontend/lib/audio/mic-meter.ts`

- [x] **New module exporting `createMicMeter(stream: MediaStream): { subscribe, stop }`**:
  - Internally creates a `WebAudio AudioContext` + `AnalyserNode` (FFT size 256), connects the `MediaStream`'s audio track.
  - On a `requestAnimationFrame` loop (or 60 Hz interval), reads `analyser.getByteTimeDomainData()`, computes RMS, normalizes to `[0, 1]`.
  - `subscribe(cb)` registers a callback that fires every animation frame with the current level.
  - `stop()` disconnects the analyser, closes the audio context, cancels the rAF loop. Idempotent.
- [x] **No memory leak** — verify `AudioContext` is `close()`'d on `stop()`. React DevTools: no growth across multiple mount/unmount cycles.

### `<MicMeterBar>` component

- [x] **New component** at `frontend/components/consultation/MicMeterBar.tsx`:
  - Props: `stream: MediaStream | null`, `mode: 'horizontal' | 'vertical-tiny'`, `className?: string`.
  - Subscribes to `createMicMeter(stream)`; on each tick, updates a CSS `width` (or `height` for vertical) based on the level.
  - Visual: a thin bar, green up to ~70%, yellow 70–90%, red >90% (clipping warning).
  - When `stream === null` → render flat empty bar (no level).
- [x] **Smoothed levels** — apply a low-pass filter (lerp current → target by ~0.2) so the bar doesn't twitch.

### Mount in the in-call header

- [x] **Edit `<VoiceConsultRoom>`** — render `<MicMeterBar mode='vertical-tiny' />` next to the mute button. When mic is muted, render the bar at zero (don't subscribe).
- [x] **Three-host parity** — same mount in standalone / panel / canvas.
- [x] **Doctor + patient both** — same component on both sides.
- [x] **`mode='readonly'`** — DO NOT mount; readonly has no live audio.

### Mount in pre-call (preview only — A6 wires the actual screen)

- [x] A3 ships `<MicMeterBar mode='horizontal' />` ready for A6 to consume. A6 task is the actual pre-call screen mount.

### Manual smoke

- [x] Speak into mic → bar moves immediately (~50ms latency).
- [x] Cover mic / move to silent room → bar drops to floor.
- [x] Mute → bar goes flat (subscription paused).
- [x] Unmute → bar resumes.
- [x] Long call (~30 min) → no audio context leak, no perf degradation.

### General

- [x] Type-check + lint clean.
- [x] No console errors.
- [x] Module is unit-testable: `createMicMeter` accepts a mocked `MediaStream` and the test verifies subscribe/stop lifecycle.

---

## Out of scope

- **Counterparty's mic level.** Not visible in v1; only the user's own.
- **Audio waveform visualization.** Bar is enough.
- **Persisted "your typical level" baseline.** Out of scope.
- **Auto-gain control toggle.** Out of scope.

---

## Files expected to touch

**Frontend:**

- `frontend/lib/audio/mic-meter.ts` — **new** (~80 LOC).
- `frontend/components/consultation/MicMeterBar.tsx` — **new** (~50 LOC).
- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edit** (~10 LOC: mount near mute button).

**Tests:**

- `frontend/lib/audio/__tests__/mic-meter.test.ts` — **new** (~30 LOC; mocked MediaStream, lifecycle verification).

**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why WebAudio over `audioStream.getVolumeLevel()`** — there's no native API; WebAudio + AnalyserNode is the standard approach.
2. **rAF vs setInterval** — rAF is more battery-friendly and only ticks when the tab is visible. Hidden-tab levels don't matter.
3. **Color thresholds** — 70%/90% are reasonable defaults; revisit if users find them noisy.
4. **iOS Safari** — `AudioContext` requires user gesture to start. Use the same gesture that grants mic permission (mic-check screen click); should work without extra plumbing.
5. **Battery on long calls** — rAF + AnalyserNode is cheap (~<1% CPU on a mid-tier phone); shouldn't materially affect battery on a 30-min call.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch A](../Plans/plan-voice-consult-selected-features.md#sub-batch-a--polished-call-5-days)
- **Source item:** [T1 §T1.4](../../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md)
- **Consumer:** [task-voice-A6](./task-voice-A6-precall-mic-check.md) (pre-call mic check) and [task-voice-A8](./task-voice-A8-caller-card-header.md) (caller-card header) both reuse `<MicMeterBar>`.

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** Complete.
