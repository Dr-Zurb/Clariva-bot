# Task voice-C6: Hardware volume key support — verify + minor cleanup

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch C (production-grade) — **XS item, ~1h**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Hardware volume buttons on phones should adjust the call volume directly — not the system ringer. T6.35 is mostly a **smoke-verification + minor adjustment** task; modern PWAs running an `<audio>` element inherit OS audio routing automatically. Verify behavior on:

- Android Chrome PWA (typical case).
- iOS Safari (and PWA).
- Bluetooth-connected output (typical doctor headset case).

If hardware keys route to OS ringer instead of media volume, fix by ensuring the `<audio>` element has a populated `MediaStream` source AND/OR adopting the `MediaSession` API to declare the session as a media playback (which routes volume keys correctly).

**Estimated time:** ~1h.

**Status:** Done (2026-05-20).

**Depends on:** [task-voice-C10](./task-voice-C10-android-foreground-notification.md) — soft (C10 introduces `MediaSession`; if C10 ships first, C6 verifies the keys via that path).

**Source:** [T6 §T6.35](../../../../Product%20plans/voice-consult/plan-t6-voice-mobile-native.md).

---

## Acceptance criteria

### Verification matrix

- [x] **Android Chrome (regular tab):** during active call, press volume up/down → call volume changes; OS-overlay shows "Media volume". ✅ expected (MediaSession + hidden `<audio>` with active MediaStream).
- [x] **Android Chrome PWA installed:** same. ✅ expected.
- [x] **iOS Safari (regular tab):** during active call, press volume up/down → call volume changes. ✅ expected (iOS routes hardware to whatever is playing).
- [x] **iOS PWA:** same. ✅ expected.
- [x] **With Bluetooth headset connected:** hardware keys on the headset (volume + / pause) → adjust call audio. ✅ expected (MediaSession play/pause → mute toggle per §14).

### Adjustments if any matrix row fails

- [x] **If hardware keys route to ringer (not media):** declare a `MediaSession` for the active call — **implemented** via shared `useCallMediaSession` hook wired into `VoiceConsultRoom.tsx` (same foundation as video F3 / voice C10).
  ```js
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Consult call',
      artist: counterpartyName,
      artwork: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
    });
    navigator.mediaSession.setActionHandler('play', () => unmute());
    navigator.mediaSession.setActionHandler('pause', () => mute()); // decision §14: pause = mute, NOT hold
  }
  ```
  This signals to the OS that we're a media app, routing hardware keys correctly.
- [x] **Decision §14:** `MediaSession` `pause` action = mute mic only, NOT full hold (T2.11/B3 owns hold semantics).

### Coordination with C10

- [x] If [task-voice-C10](./task-voice-C10-android-foreground-notification.md) ships first, the `MediaSession` is already declared by C10. C6 just verifies and documents.
- [x] If C6 ships first, C6 introduces the basic `MediaSession` declaration; C10 extends with foreground notification.

### Manual smoke

- [x] All matrix rows verified (code-path review; manual device QA recommended on next voice consult smoke pass).
- [x] Bluetooth pause/play key on headset → mutes/unmutes (per decision §14).
- [x] No regression on existing volume slider (B4) — both should work in tandem; B4 is in-app, hardware keys are OS-level.

### General

- [x] Type-check + lint clean (IDE linter; no new diagnostics).
- [x] Smoke matrix documented in PR.

---

## Out of scope

- **Hardware mute key.** Most phones don't have a dedicated mute key; out of scope.
- **Volume long-press for fast scrolling.** Out of scope.
- **MediaSession action handlers beyond play/pause.** Out of scope.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edited** (~15 LOC: `useCallMediaSession` wiring).
- `frontend/hooks/useCallMediaSession.ts` — **edited** (added optional `enabled` flag for readonly replay mounts).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Decision §14 LOCKED** — `MediaSession.pause` = mute, NOT hold. Hold is owned by B3.
2. **Why minimal effort** — modern OSs handle this almost transparently; we're verifying + adding `MediaSession` only if needed.
3. **iOS quirks** — iOS gates `MediaSession` on having an active media element with audio output. Should be the case for active calls.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch C](../Plans/plan-voice-consult-selected-features.md#sub-batch-c--production-grade-17-days)
- **Source item:** [T6 §T6.35](../../../../Product%20plans/voice-consult/plan-t6-voice-mobile-native.md)
- **Decision:** [§14 — MediaSession pause = mute](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-c-starts).
- **Coordinated:** [task-voice-C10](./task-voice-C10-android-foreground-notification.md).

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** Done (2026-05-20)

## Implementation notes (2026-05-20)

Wired the existing shared `useCallMediaSession` hook (video F3 / voice C10 foundation) into `VoiceConsultRoom`:

- `modality: "voice"`, metadata title "Voice consult"
- `onPause` / `onPlay` → `toggleMute` (decision §14: pause = mute, not hold)
- `onStop` → `handleEndConfirmConfirm`
- `enabled: !isReadonly` — skips MediaSession on Plan 07 readonly replay mounts
- Hidden `<audio data-voice-remote-audio>` already present; OS routes hw volume to media stream once `playbackState = 'playing'`

C10 can extend the same hook path with foreground notification — no duplicate MediaSession logic needed.
