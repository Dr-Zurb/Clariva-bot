# Voice T6 — Mobile native niceties (4 items, ~1 sprint)

## Bluetooth/AirPods routing, hardware volume keys, Android persistent notification, proximity sensor

> **Roadmap reference:** [plan-00-voice-consult-roadmap.md](./plan-00-voice-consult-roadmap.md). T6 is the mobile-native polish tier; **Deferred** — most relevant once we wrap the PWA in a thin native shell, OR if PWA APIs ship the hooks we need.
>
> **Foundation:** T1 + T2 must ship first. Some items here are PWA-only (limited iOS Safari APIs) and would benefit from a thin Capacitor / React Native shell — that's a separate strategic decision tracked outside this roadmap.

---

## Goal

Bring the voice consult to feature parity with native phone-call apps on the things that matter for clinical mobile use:

- **AirPods / Bluetooth routing detection** — patient knows where the audio is going.
- **Hardware volume keys** — work the same way they do on every other call app.
- **Android persistent foreground notification** — the call survives app-switching (PWA limitation today).
- **Proximity sensor** — auto-screen-off when phone is held to ear, like every other call app.

These items are mostly invisible when they work, but their absence is a daily papercut for mobile patients.

---

## Status

`Deferred` originally. **2026-04-28 selection update: all 4 items SELECTED** — pulled forward into the implementation batch tracked in [plan-voice-consult-selected-features.md](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md). Native-shell decision is explicitly **NOT** in scope: T6.36 ships the PWA `MediaSession` path only.

---

## What's in scope (4 items)

> All 4 items below are marked **`[SELECTED 2026-04-28]`** — sequenced into sub-batch C of the combined batch plan. PWA-only paths only; no native-shell work in this batch.

| # | Item | Effort | Touch points | PWA feasibility |
|---|------|--------|--------------|-----------------|
| **T6.34** | **`[SELECTED 2026-04-28]`** **Bluetooth / AirPods auto-relay detection + UI** ("Routing to AirPods Pro"). | M (~2 days) | `useAudioOutputDevice.ts` extension (T1.7). | iOS Safari: NO (no enumerateDevices for output). Chrome Android: PARTIAL (`devicechange` event fires; device label varies). Best on native shell. |
| **T6.35** | **`[SELECTED 2026-04-28]`** **Hardware volume key support** (verify; should mostly work for free if `<audio>` is unmuted). | XS (~1h) | `VoiceConsultRoom.tsx` audio element verification. | Both platforms: YES with caveats. |
| **T6.36** | **`[SELECTED 2026-04-28]`** **Persistent foreground notification on Android** so the call survives app-switching. | L (~1 week) | New service worker integration; PWA `MediaSession` API + `BackgroundFetch`. Or wait for native shell. | iOS: NO (locked down). Android Chrome: PARTIAL via `MediaSession` (controls + lockscreen) — full foreground service requires native. **Batch ships PWA path only.** |
| **T6.37** | **`[SELECTED 2026-04-28]`** **Proximity sensor** auto-screen-off when phone is held to ear. | M (~3 days) | New `frontend/hooks/useProximityWakeLock.ts` (Generic Sensor API). | iOS: NO (DeviceMotion permissions, not proximity). Android Chrome: YES via Generic Sensor API. |

---

## Why this tier exists

- **T6.34 Bluetooth** — patient connects AirPods mid-call → currently they have no idea if audio routed correctly until they hear (or don't). A small "Now routing to AirPods Pro" toast is the cheapest possible answer.
- **T6.35 hardware volume** — mostly works on both platforms, but verifying and surfacing audio elements correctly takes a small bit of work. Listing it because if it ever breaks (e.g., autoplay-blocked audio), the user has no recourse.
- **T6.36 Android persistent notification** — single biggest mobile UX gap today. If the patient switches to WhatsApp mid-call to check a message, the Twilio connection often dies. Native shell solves this completely; PWA `MediaSession` is a partial workaround.
- **T6.37 proximity sensor** — when the patient holds the phone to their ear (which they will, because that's how every other phone call works), the screen should turn off. Otherwise it stays lit, drains battery, and the patient's ear/cheek can mute / unmute / end the call.

---

## Implementation contract per item

### T6.34 — Bluetooth / AirPods auto-relay detection

```ts
// Extension to T1.7's useAudioOutputDevice hook:
//
// On `navigator.mediaDevices.addEventListener('devicechange', ...)`:
//   - Re-enumerate audio output devices.
//   - Diff against previous list.
//   - If a Bluetooth-class device (label includes "Bluetooth", "AirPods",
//     "Buds", "Headphones", or matches a known BT vendor pattern) is
//     newly present → automatically setSinkId() to the new device + show
//     a toast: "Now using {device label}".
//   - If a Bluetooth device disappears → fall back to default + toast:
//     "Disconnected from {device label}. Now using device speaker."
//
// Failure modes:
//   - iOS Safari: device labels are empty until permission is granted,
//     and enumerateDevices doesn't return audio outputs at all. T6.34
//     degrades to a no-op on iOS Safari with a documented gap.
//
// Cross-tier interaction with T1.6 / T1.7:
//   - T1.6 / T1.7 expose explicit toggles (speaker/earpiece on mobile,
//     dropdown on desktop). T6.34 layers automatic detection on top.
//   - User's explicit choice always wins over auto-routing.
```

### T6.35 — Hardware volume keys

```
This is a verification + minor cleanup task, not a new feature:

1. Verify on iOS Safari + Android Chrome that the hardware volume
   keys adjust the remote audio volume (the <audio> element rendered
   by the Twilio remote audio attach).
2. If iOS routes hardware volume to "ringer" instead of "media" when
   the page hasn't started audio playback, ensure remote audio plays
   ASAP after room connect (already the case via Twilio
   `RemoteAudioTrack.attach()`).
3. Ensure the <audio> element has the right `controls=false`,
   `playsinline`, `autoplay` attributes set.

Acceptance: pressing volume up / down on a paired Bluetooth device
or the device's hardware buttons adjusts the remote audio volume
without any code changes beyond verification.
```

### T6.36 — Android persistent foreground notification

```
PWA-only path (limited):
  - Use `navigator.mediaSession.setActionHandler` for play/pause/end.
  - Set `metadata` on the MediaSession so the lockscreen / control center
    shows "Voice consult with Dr. X" instead of "Page audio".
  - This gives the user a way to return to the call, but does NOT
    guarantee the connection survives a tab going to background on
    older Chrome Android. The foreground-service guarantee requires
    native code.

Native shell path (recommended for production):
  - Capacitor / React Native wrapper with a foreground service that
    holds a Twilio Video session for the duration of the call.
  - Service binds to JS via a bridge; UI stays React.
  - This is a strategic decision outside this plan's scope.

T6.36 v1 ships ONLY the PWA MediaSession integration. The native-shell
path is a separate plan. Acceptance criteria reflect the PWA limit:
  - Lockscreen / control center shows the consult metadata.
  - Tapping the lockscreen control surfaces brings the page back.
  - Connection survives a brief tab background (~30s) — beyond that,
    the existing T2.15 reconnection UX takes over.
```

### T6.37 — Proximity sensor

```ts
// frontend/hooks/useProximityWakeLock.ts (NEW)
//
// Subscribes to the Generic Sensor API ProximitySensor.
// When the sensor reports "near" (something is close to the screen,
// usually a face), release the wake lock to let the screen turn off.
// When sensor reports "far", re-acquire the wake lock.
//
// API:
export function useProximityWakeLock(active: boolean): {
  supported: boolean;
  near: boolean | null;     // current state (null when unknown)
}
//
// Permission: Generic Sensor API requires HTTPS + a permission
// prompt on Chrome 67+. Permission persists per-origin.
//
// iOS Safari: NOT SUPPORTED. The Generic Sensor API isn't available.
// Hook returns supported=false; behavior degrades to today's
// always-on screen.
//
// Edge case: if user is on speakerphone (T1.6 toggled to speaker),
// proximity-driven screen-off should NOT fire. Wire to the
// audio output state — only fire screen-off when output device is
// the earpiece.
```

---

## Acceptance criteria

- [ ] **T6.34** — Bluetooth device connect/disconnect mid-call triggers auto-routing within 1 s and shows a toast on Chrome Android; degrades cleanly to no-op on iOS Safari with no console error.
- [ ] **T6.35** — verified working: hardware volume keys + Bluetooth volume keys adjust remote audio on both iOS Safari and Chrome Android; documented in the test plan.
- [ ] **T6.36** — MediaSession metadata shows on Android lockscreen / control center within 500 ms of room connect; tapping returns to the consult page; tab-background of ≤30 s preserves connection.
- [ ] **T6.37** — proximity-driven screen-off works on Chrome Android when on earpiece (not speaker); does NOT fire when on speakerphone; iOS Safari falls back to always-on screen with no console error.
- [ ] No regression on existing voice flow (T1, T2 features).
- [ ] No regression on desktop (T6 items are mobile-only; desktop path is a no-op for all four).
- [ ] Backend + frontend type-check + lint clean.

---

## Files expected to touch

**Frontend (only):**

- `frontend/components/consultation/VoiceConsultRoom.tsx` (**extend**) — wire T6.34 toast, T6.36 MediaSession, T6.37 proximity hook.
- `frontend/hooks/useAudioOutputDevice.ts` (**extend** from T1.7, T6.34).
- `frontend/hooks/useProximityWakeLock.ts` (**new**, T6.37).
- `frontend/lib/audio/output-router.ts` (**new**, T6.34) — Bluetooth label heuristics.

**No backend changes. No schema changes.**

---

## Open questions / decisions for during implementation

1. **Bluetooth label heuristics false-positives** (T6.34) — vendor labels vary wildly. Recommendation: ship a maintained allowlist of substring matches (`AirPods`, `Bluetooth`, `Buds`, `Headphones`) plus a generic fallback (any device whose label changed mid-call → assume external audio). Calibrate over time.
2. **MediaSession integration scope** (T6.36) — should the lockscreen "Pause" action mute the local mic, or fully hold the call? Recommendation: mute-only for v1. Hold (T2.11 — currently parked) is a fuller treatment we'd ship together.
3. **Proximity + speakerphone interaction** (T6.37) — when on speaker AND the proximity sensor reports "near" (e.g., phone on a table near the user's hand), what behavior is sensible? Recommendation: ignore proximity entirely when on speaker — the user explicitly opted into screen-on by choosing speakerphone.
4. **Native shell trigger** — at what doctor count or pilot-feedback threshold do we commit to a Capacitor / React Native wrapper? Recommendation: defer until ≥3 doctors complain about the Android background-tab kill OR a major patient-population (e.g., older patients) requires native install for trust reasons.

---

## Companion: out-of-scope but related

T6 explicitly does NOT cover:

- **iOS-style CallKit integration** (real "incoming call" UI on iPhone). This requires a native shell + Apple PushKit credentials. Park outside this roadmap.
- **Picture-in-picture** (Android Chrome floating mini-player). Worth doing eventually but not part of T6's "feature parity with phone calls" theme — it's a different surface.
- **Wear OS / smartwatch support**. Not on the roadmap; revisit when telemed-on-watch is a real use case.

---

## References

- [plan-00-voice-consult-roadmap.md](./plan-00-voice-consult-roadmap.md)
- [plan-t1-voice-quick-wins.md](./plan-t1-voice-quick-wins.md) — T1.6 / T1.7 audio output device foundation that T6.34 extends.
- [plan-05-voice-consultation-twilio.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-05-voice-consultation-twilio.md)
- Web MediaSession API.
- Generic Sensor API — `ProximitySensor`.
- Twilio Video JS SDK — `RemoteAudioTrack.setSinkId`, `MediaDevices.devicechange` event.

---

**Owner:** TBD  
**Created:** 2026-04-27  
**Status:** Drafted. **2026-04-28: all 4 items SELECTED** (PWA paths only; no native-shell work in this batch), sequenced into sub-batch C of [combined batch plan](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md).
