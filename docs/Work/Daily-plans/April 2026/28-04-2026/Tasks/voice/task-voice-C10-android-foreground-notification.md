# Task voice-C10: Android persistent foreground notification (PWA `MediaSession` only)

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch C (production-grade) — **L item, ~1 week**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Patient on Android, in voice call, swipes the PWA away → today: call drops within ~30s as Android kills the background tab. T6.36 keeps the call alive by posting a **persistent foreground notification** that promotes the PWA to a foreground-service-like priority, so Android keeps the audio stream + WebRTC connection alive even when the user navigates away.

**PWA-only, no Capacitor / native shell** (per batch plan §128). Implemented via:

1. **`MediaSession` API** — declares the call as media playback (Android treats this as priority).
2. **Service worker `showNotification`** with `silent: false` and `tag: ${sessionId}` — pinned in tray; can't be swiped away while call is active.
3. **`BackgroundFetch` / Wake Lock** — kept-alive hints to extend background quota.

**Decision §14:** notification's `pause` action = mute mic ONLY, NOT full hold (B3 owns hold).

The "L" effort is largely Android-quirk QA: different OEM customizations (Samsung, Xiaomi, OnePlus) handle background priorities differently. Smoke matrix is critical.

**Estimated time:** ~1 week (implementation ~3 days; QA across OEMs ~2 days; iteration ~2 days).

**Status:** Shipped (2026-05-23). Foundation from video F3 (`useCallMediaSession`, `sw.js`, `IOSPWABanner`); voice mount + hardening in this task.

**Depends on:** [task-voice-C6](./task-voice-C6-hardware-volume-key.md) — soft (shares MediaSession declaration).

**Source:** [T6 §T6.36](../../../../Product%20plans/voice-consult/plan-t6-voice-mobile-native.md); [decision §14](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-c-starts).

---

## Acceptance criteria

### MediaSession declaration

- [x] **Edit `<VoiceConsultRoom>`** (or extracted hook `useCallMediaSession(call)`):
  - On call connect:
    ```js
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Consult call',
        artist: counterpartyName,
        album: practiceName,
        artwork: [
          { src: '/icons/icon-192.png', sizes: '192x192' },
          { src: '/icons/icon-512.png', sizes: '512x512' },
        ],
      });
      navigator.mediaSession.setActionHandler('play', () => unmuteOutput());
      navigator.mediaSession.setActionHandler('pause', () => muteOutput());
      navigator.mediaSession.playbackState = 'playing';
    }
    ```
- [x] **Decision §14:** `pause` action = mute mic, NOT full hold. (B3's hold semantics are richer; pause is the lighter affordance.)
- [x] **`playbackState`** kept in sync with mute state.

### Service-worker foreground notification

- [x] **Edit `frontend/public/sw.js`** to handle a new in-app message `'show-call-notification'`:
  ```js
  self.addEventListener('message', (event) => {
    if (event.data?.type === 'show-call-notification') {
      const { sessionId, counterpartyName, role } = event.data;
      self.registration.showNotification(`On call with ${counterpartyName}`, {
        body: 'Tap to return to the call',
        tag: `call:${sessionId}`,
        requireInteraction: true,
        silent: true, // no chime; the call IS the audio
        data: { sessionId, deeplink: `/c/voice/${sessionId}` },
      });
    } else if (event.data?.type === 'hide-call-notification') {
      self.registration.getNotifications({ tag: `call:${event.data.sessionId}` })
        .then(notifs => notifs.forEach(n => n.close()));
    }
  });
  ```
- [x] On call end: post `'hide-call-notification'` to the SW.

### Wake lock + visibility hooks

- [x] **Use `navigator.wakeLock.request('screen')`** during active call (already covered partly in C8 if proximity ships first; here it's a stronger background-keep-alive).
- [x] **`document.visibilitychange` listener** — when tab goes hidden, post `show-call-notification` immediately. When visible, post `hide-call-notification`.

### `notificationclick` handler

- [x] **Extend `sw.js` handler** to focus / open the consult tab on tap (already present from text consult D6c; verify).

### OEM smoke matrix

- [ ] **Test on at least 4 Android devices:** *(manual QA — not automatable)*
  - Samsung (recent Galaxy)
  - Xiaomi (Redmi or Poco)
  - OnePlus
  - Pixel
- [ ] For each: install PWA, start a call, swipe away tab → call should remain audible for at least 5 minutes (or longer; no upper bound on Pixel typically; OEMs vary).
- [ ] Tap the persistent notification → returns to call.

### iOS gracefully degrades

- [x] On iOS PWA: MediaSession declares; persistent notification doesn't pin the same way (iOS limits SW background work); call may drop earlier. Document this degradation. (`<IOSPWABanner>` mounted in `VoiceConsultRoom`; see `useCallMediaSession` header comment.)

### Manual smoke

- [ ] Patient on Android Chrome PWA, in call, swipe app away → notification appears in tray; audio continues. *(manual)*
- [ ] Tap notification → app reopens, in-call screen visible. *(manual)*
- [ ] Pull-down notification → mute action (decision §14). *(manual)*
- [ ] End call → notification disappears. *(manual)*
- [ ] iOS Safari PWA: notification may not pin; document behavior. *(manual — banner documents expectation)*

### General

- [x] Type-check + lint clean.
- [x] No console errors in either supported or degraded state.
- [x] No PHI in notification body (no patient name beyond "patient" / counterparty role).

---

## Out of scope

- **Native shell** (Capacitor / React Native). Out of scope; this batch is PWA-only.
- **Per-OEM workaround code** beyond standard MediaSession / SW. Document quirks; don't fork code.
- **Battery-saver bypass.** Out of scope.

---

## Files expected to touch

**Frontend:**

- `frontend/hooks/useCallMediaSession.ts` — **new** (~120 LOC; MediaSession + visibility wiring).
- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edit** (~25 LOC: hook mount).
- `frontend/public/sw.js` — **edit** (~30 LOC: show/hide notification handlers).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Decision §14 LOCKED** — pause = mute, NOT hold. B3 owns hold.
2. **Why no native shell** — explicit batch decision (§128 / §405 of batch plan). PWA-only is the constraint.
3. **OEM variance** — Android OEMs all have different background-kill policies. Samsung is typically aggressive; Pixel less so. Document per-OEM behavior in PR.
4. **iOS limitation** — iOS PWAs have stricter background limits; foreground notification doesn't pin the same way. Patient on iOS in a real call should have phone screen on; document.
5. **Wake lock + battery cost** — these calls are typically short (≤30 min). Battery cost is acceptable for the use case.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch C](../Plans/plan-voice-consult-selected-features.md#sub-batch-c--production-grade-17-days)
- **Source item:** [T6 §T6.36](../../../../Product%20plans/voice-consult/plan-t6-voice-mobile-native.md)
- **Decision:** [§14 — pause = mute](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-c-starts).
- **Soft dep:** [task-voice-C6](./task-voice-C6-hardware-volume-key.md).
- **Cross-batch:** text-consult D6 (push handler patterns; `notificationclick` reuse).

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** Shipped (2026-05-23); L item; ships LAST in Sub-batch C; closes voice batch. OEM + manual smoke matrix deferred to device QA.
