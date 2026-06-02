# Task voice-B4: Volume slider + ×1.5 amplitude boost (WebAudio gainNode)

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch B (robust call) — **S item, ~4h**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

A 0–150% volume slider on the call controls. 0–100 is OS-normal volume (manipulating `audioElement.volume`); 100–150 routes through a WebAudio `GainNode` to amplify above OS max — useful for quiet patients on doctors' headphones.

Decision §5: cap at **×1.5 in v1**; revisit if doctors with quiet patients ask for more.

**Estimated time:** ~4h.

**Status:** Done.

**Depends on:** nothing.

**Source:** [T2 §T2.13 (under T2-Later)](../../../../Product%20plans/voice-consult/plan-t2-voice-real-polish.md); [decision §5](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-b-starts).

---

## Acceptance criteria

### `frontend/lib/audio/gain-node.ts`

- [x] **New module** exporting `createBoostedAudioRouter(audioElement: HTMLAudioElement)`:
  - Creates a `MediaElementAudioSourceNode` from the audio element.
  - Routes through a `GainNode` with `gain.value = 1.0`.
  - Connects to `AudioContext.destination`.
  - Exposes `setVolume(percent: number)` where:
    - `0–100`: sets `audioElement.volume = percent/100`; gain stays at 1.0.
    - `100–150`: sets `audioElement.volume = 1.0`; gain set to `percent/100` (1.0–1.5).
  - Exposes `dispose()` — disconnects nodes, closes context. Idempotent.
- [x] **Important constraint:** once `MediaElementAudioSourceNode` is created on an element, the OS controls bypass; ALL volume changes must go through this router.

### `<VolumeSlider>` component

- [x] **New component** at `frontend/components/consultation/VolumeSlider.tsx`:
  - Props: `value: number (0–150)`, `onChange: (n: number) => void`.
  - Renders a slider 0–150 with a tick at 100 ("normal").
  - Above 100: show a small "boost" indicator (subtle amber glow on the thumb).
  - Speaker icon to the left; click → mute (set value to 0). Click again → restore last non-zero value.
  - Persisted to localStorage `voice-volume-percent`.

### Wire into `<VoiceConsultRoom>`

- [x] **Edit**: on remote audio track attach, wrap the audio element with `createBoostedAudioRouter`. Mount `<VolumeSlider>` in the call controls bar; on change, call `router.setVolume(percent)`.
- [x] **Cleanup** on call end: `router.dispose()`.
- [x] **Doctor + patient both** — symmetric.
- [x] **`mode='readonly'`** — DO NOT mount.

### Manual smoke

- [ ] Slide 0–100 → volume changes; reflected in OS volume mixer.
- [ ] Slide 100–150 → volume above OS max; perceptibly louder; gain indicator glows.
- [ ] Click speaker icon → muted (0); click again → restored.
- [ ] Refresh page mid-call → slider position restored from localStorage.
- [ ] Long call (~30 min) → no audio context leak; verify no clipping artifacts at 150% boost on a quiet patient.

### General

- [x] Type-check + lint clean.
- [x] Module unit-testable with mocked `HTMLAudioElement`.
- [x] No regression on the existing audio playback path.

---

## Out of scope

- **Per-track gain** (boost only doctor's voice, not background). Out of scope.
- **Auto-boost based on detected patient loudness.** Out of scope.
- **Boost above ×1.5.** Out of scope (decision §5).
- **Microphone gain.** Out of scope (mic gain is OS-controlled).

---

## Files expected to touch

**Frontend:**

- `frontend/lib/audio/gain-node.ts` — **new** (~80 LOC).
- `frontend/components/consultation/VolumeSlider.tsx` — **new** (~80 LOC).
- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edit** (~25 LOC: router lifecycle + slider mount).

**Tests:**

- `frontend/lib/audio/__tests__/gain-node.test.ts` — **new** (~30 LOC).

**Backend / migrations:** none.

---

## Notes / open decisions

1. **Why ×1.5 cap** — above ×1.5, clipping/distortion is severe and harms intelligibility. Decision §5: revisit only if asked.
2. **`MediaElementAudioSourceNode` constraint** — once attached, OS-volume controls have no effect. Document for QA so they don't think OS volume is "broken".
3. **AudioContext suspension on iOS** — `AudioContext` may suspend when tab loses focus. Resume on focus return; the router should handle this.
4. **Persistence scope** — global per-device, not per-call. Doctors find a level they like and keep it.
5. **Future direction** — adaptive auto-boost based on detected patient amplitude is a v2 idea; flag.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch B](../Plans/plan-voice-consult-selected-features.md#sub-batch-b--robust-call-8-days)
- **Source item:** [T2 §T2.13 (T2-Later)](../../../../Product%20plans/voice-consult/plan-t2-voice-real-polish.md)
- **Decision:** [§5 — ×1.5 cap](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-b-starts)

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** Done.
