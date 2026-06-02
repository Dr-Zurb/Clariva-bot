# Video T6 — Mobile native niceties (5 items, ~10 days)

## Front/back camera swap, orientation lock, persistent foreground, battery-saver downgrade, hardware keys + MediaSession

> **Roadmap reference:** [plan-00-video-consult-roadmap.md](./plan-00-video-consult-roadmap.md). T6 wraps the PWA in mobile-native polish — the items most patients will notice on a phone. PWA-only paths (no Capacitor / React Native shell in this batch).

---

## Goal

Make video calls on mobile feel like a native video-call app:

- Switch between front (selfie) and back (rear) camera on the fly.
- Handle device rotation gracefully (landscape often makes more sense for video).
- Survive backgrounding (Android persistent foreground notification).
- Adapt to low battery (auto-degrade gracefully without user interruption).
- Respect hardware volume keys + lock-screen media controls.

**~10 dev-days.** PWA-only. Some items have iOS-graceful degradation.

---

## Status

`Drafted` — awaiting selection. Most items are mobile-leverage items; battery + persistent-foreground are the most expensive.

---

## What's in scope (5 items)

| # | Item | Effort | Dep |
|---|------|--------|-----|
| T6.38 | **Front / back camera switch** — button in controls bar; uses `enumerateDevices` to list videoinput devices; switches via `getUserMedia({ deviceId })`; persisted per-device ("last-used camera"). | M (~2 days) | T1.7 (`useCameraDevices` hook). |
| T6.39 | **Orientation lock + landscape-aware layout** — detect device rotation; offer landscape layout (remote tile fills wide canvas); optional lock-orientation toggle. | M (~3 days) | none. |
| T6.40 | **Persistent foreground notification (Android)** — sibling of voice T6.36 / C10. Same MediaSession + SW notification path; video adds keep-alive for video track too. | L (~1 week) | voice C10 (or ships independently). |
| T6.41 | **Battery-saver auto-downgrade** — `navigator.getBattery()` reports < 15% AND charging === false: prompt patient "Battery low — switch to audio-only to save power?". On 5%: force audio-only with a banner. | S (~3h) | T5.32 (auto-downgrade infrastructure). |
| T6.42 | **Hardware volume keys + MediaSession** — sibling of voice T6.35 / C6. Declare `MediaSession`; volume keys route to media; pause action = mute (decision §14 from voice). | XS (~1h) | none. |

---

## Non-goals (explicitly NOT in T6)

- **Native shell** (Capacitor / React Native). Strategic decision; out of scope here.
- **iOS persistent foreground.** iOS PWA limitations make this not viable; document degradation.
- **Per-app-icon badge** for unread messages. Out of scope.
- **Bluetooth headphones routing** for video — already covered by voice T6.34 (sibling); reuse the hook.
- **Lock-screen call controls** beyond MediaSession. Native shell concern.

---

## Why each item is in T6

- **T6.38 camera switch** — derm doctors examine wounds on patient's back/side; patient holds phone in front, then needs to flip to back camera. Today: log out, restart, choose different camera. T6.38 = one tap.
- **T6.39 orientation** — landscape on a phone is the right view for a wide chest exam, side-view, etc. Today the layout is portrait-locked; landscape rotation breaks it.
- **T6.40 persistent foreground** — patient on Android, swipes the PWA away → today: call drops in 30s. T6.40 keeps the call alive via the same MediaSession + SW notification path voice C10 ships.
- **T6.41 battery-saver** — long video consults eat battery. Patients on a cab to the consult with 10% battery will be furious if the call dies mid-conversation. T6.41 is a soft warning + hard fallback to audio.
- **T6.42 hardware keys + MediaSession** — universal mobile expectation. Verify it works; patch if not.

---

## Implementation contract per item

### T6.38 — Front / back camera switch

```ts
// frontend/hooks/useCameraDevices.ts (NEW)
export function useCameraDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices()
      .then(devs => setDevices(devs.filter(d => d.kind === 'videoinput')));
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh);
  }, []);

  const switchTo = async (deviceId: string) => {
    // Republish video track at new deviceId
    const newTrack = await Twilio.createLocalVideoTrack({ deviceId });
    const oldTrack = localTracksRef.current.find(t => t.kind === 'video');
    if (oldTrack) {
      await room.localParticipant.unpublishTrack(oldTrack);
      (oldTrack as LocalVideoTrack).stop();
    }
    await room.localParticipant.publishTrack(newTrack);
    setCurrent(deviceId);
    localStorage.setItem('video-camera-device', deviceId);
  };

  return { devices, current, switchTo };
}

// UI: a single circular button in controls bar with a "flip" icon.
// On mobile: tap → toggles between front (label includes "front" / "user")
// and back (label includes "back" / "environment").
// On desktop: dropdown of all video input devices.
```

- **Heuristic for front/back detection:** `MediaDeviceInfo.label` typically contains "front" / "user" or "back" / "environment". Fallback: respect device order (most phones list front first).
- **Persistence:** localStorage `video-camera-device-id`.
- **iOS Safari quirk:** iOS doesn't expose all devices reliably until permission granted; works after first grant.

### T6.39 — Orientation lock + landscape-aware layout

```ts
// frontend/hooks/useScreenOrientation.ts (NEW)
export function useScreenOrientation() {
  const [orient, setOrient] = useState<'portrait' | 'landscape'>(
    window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape',
  );
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    const onChange = () => setOrient(mq.matches ? 'portrait' : 'landscape');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const lock = async (target: 'portrait' | 'landscape' | 'natural') => {
    if (!('orientation' in screen) || !(screen as any).orientation.lock) return;
    try { await (screen as any).orientation.lock(target); }
    catch (e) { console.warn('[orient] lock denied', e); }
  };
  return { orient, lock };
}

// Layout adapts based on orient:
//   portrait + speaker layout: remote 16:9 cropped vertically; self overlay BR.
//   landscape + speaker layout: remote 16:9 fills horizontally; self overlay BR (smaller).
//   landscape + gallery: side-by-side equal tiles.

// Optional toggle: "Lock landscape" button in controls bar.
// Lock requires PWA install on most browsers; degrade silently if unsupported.
```

### T6.40 — Persistent foreground notification (Android)

- Sibling of voice T6.36 / C10. Reuse the `useCallMediaSession` hook + SW push handler.
- **Video extension:** `MediaSession.metadata.artwork` shows the remote video poster (last-known frame) instead of just the icon. (Optional; flag.)
- Tap notification → returns to call.
- Pull-down notification: `pause` action = mute mic (NOT full hold; decision §14 from voice C10).
- Same OEM smoke matrix as voice C10 (Samsung / Xiaomi / OnePlus / Pixel).

### T6.41 — Battery-saver auto-downgrade

```ts
// In <VideoRoom>, on connect:
useEffect(() => {
  if (!('getBattery' in navigator)) return;  // unsupported (iOS Safari)
  let mounted = true;
  (navigator as any).getBattery().then((battery: any) => {
    if (!mounted) return;
    const check = () => {
      if (!battery.charging && battery.level < 0.05) {
        // 5%: force audio-only
        autoDowngradeToAudio({ reason: 'battery_critical' });
        showBanner({
          message: 'Battery critical — switched to audio-only.',
          severity: 'amber',
        });
      } else if (!battery.charging && battery.level < 0.15) {
        // 15%: prompt
        showBatteryWarning({
          message: 'Battery is low. Switch to audio-only to save power?',
          primary: { label: 'Switch', onClick: switchToAudio },
          secondary: { label: 'Keep video', onClick: dismiss },
        });
      }
    };
    battery.addEventListener('levelchange', check);
    battery.addEventListener('chargingchange', check);
    check();  // initial
  });
  return () => { mounted = false; };
}, []);
```

- iOS Safari doesn't expose `navigator.getBattery()`; degrade silently.
- Reuses T5.32 audio-fallback infrastructure.
- New Plan 06 enum value: `'battery_audio_fallback'` (reuses T5.32's auto-fallback message kind with metadata.reason = 'battery_critical').

### T6.42 — Hardware volume keys + MediaSession

- Sibling of voice T6.35 / C6 + C10. Same MediaSession declaration.
- Verify on Android Chrome PWA + iOS Safari + iOS PWA.
- If voice C6 / C10 has shipped, T6.42 is a smoke verification.

---

## Acceptance criteria

- [ ] **T6.38** — camera switch button toggles front ↔ back within 2s on Android Chrome + iOS Safari; persisted per device; on desktop, dropdown lists all video inputs.
- [ ] **T6.39** — orientation change reflects in layout within 200 ms; landscape layout shows remote tile horizontally; "Lock orientation" button works on supported browsers; degrades silently elsewhere.
- [ ] **T6.40** — Android Chrome PWA: swiping the app away keeps call alive ≥ 5 min; tap notification returns to call; pause = mute.
- [ ] **T6.41** — battery < 15% AND not charging: prompt fires once; battery < 5%: forced fallback with banner; recovers when charging resumes.
- [ ] **T6.42** — hardware volume keys route to media on supported devices; `MediaSession` declared; lock-screen controls show.
- [ ] No regression on existing video flow.
- [ ] Frontend type-check + lint clean.
- [ ] Manual smoke matrix on at least 2 Android devices + 1 iOS device.

---

## Files expected to touch

**Frontend:**

- `frontend/hooks/useCameraDevices.ts` (**new**, T6.38).
- `frontend/hooks/useScreenOrientation.ts` (**new**, T6.39).
- `frontend/hooks/useCallMediaSession.ts` (**reuse from voice C10**, T6.40 + T6.42) — extends with video keep-alive.
- `frontend/hooks/useBatterySaver.ts` (**new**, T6.41).
- `frontend/components/consultation/CameraSwitchButton.tsx` (**new**, T6.38).
- `frontend/components/consultation/OrientationLockButton.tsx` (**new**, T6.39).
- `frontend/components/consultation/BatteryWarningBanner.tsx` (**new**, T6.41).
- `frontend/components/consultation/VideoRoom.tsx` — every item touches.
- `frontend/public/sw.js` — **edit** (T6.40, sibling of voice C10).

**Backend:** none.

**Migrations:** none in T6 itself (Plan 06 enum extension `battery_audio_fallback` if T5.32's enum doesn't already cover it via metadata).

**No new vendor.**

---

## Open questions / decisions

1. **Camera switch UI placement** — single flip button OR dropdown? Recommendation: single flip button on mobile; dropdown on desktop. Detect via UA / viewport.
2. **Default landscape behavior** — auto-rotate (unlocked) recommended; lock is opt-in.
3. **Battery thresholds** — 15% prompt, 5% force. Calibrate.
4. **MediaSession artwork** — static icon (recommended; cheap) vs last-known video frame (cool but extra plumbing). Flag.
5. **iOS PWA persistent foreground** — out of scope (Apple gates it). Document degradation.
6. **PWA install gating** — orientation lock + persistent fg only work properly on installed PWA. Encourage install via in-app prompt.
7. **`navigator.getBattery()` deprecation** — Chrome deprecated for non-secure contexts but it still works on https. Verify behavior at PR time.

---

## References

- [plan-00-video-consult-roadmap.md](./plan-00-video-consult-roadmap.md)
- [plan-t6-voice-mobile-native.md](../voice-consult/plan-t6-voice-mobile-native.md) — siblings T6.34 (BT), T6.35 (volume), T6.36 (foreground).
- W3C MediaDevices API — `enumerateDevices`, `getUserMedia`.
- W3C Screen Orientation API — `screen.orientation.lock`.
- W3C Battery Status API — `navigator.getBattery`.
- W3C MediaSession API — `navigator.mediaSession`.

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** Drafted; recommend selecting **T6.38 + T6.39 + T6.42** as a mobile-leverage subset (~5 days). T6.40 ships when voice C10 ships (shared infrastructure). T6.41 is small enough to bundle anywhere.
