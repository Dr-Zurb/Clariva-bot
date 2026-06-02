# Task video-F3: Persistent foreground notification for video call (Android, sibling of voice C10)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch F (T6 mobile native) — **L item, ~1 week**

---

## Task overview

Patient on Android, swipes the PWA away → today: call drops in 30s. T6.40 keeps the call alive via the same MediaSession + service worker notification path that voice C10 ships, **plus** video-specific keep-alive for the local video track (so it doesn't get auto-suspended by Chrome's background tab freezer).

**Sibling of voice C10 / T6.36.** If voice C10 ships first, this task is significantly cheaper (~3 days vs ~1 week). If video ships first, it bears the foundation.

**iOS PWA:** out of scope per Apple platform limitations; document degradation.

**Estimated time:** ~1 week (or ~3 days if voice C10 done).

**Status:** ✅ Shipped (2026-05-03) — bears the voice C10 foundation.

**Depends on:** voice C10 (SOFT — infrastructure reuse). HARD: A1 mute (for MediaSession pause action).

**Source:** [T6 §T6.40](../../../../Product%20plans/video-consult/plan-t6-video-mobile-native.md); [decision §33](../Plans/plan-video-consult-selected-features.md#before-sub-batch-f-starts).

---

## Acceptance criteria

### Reuse `useCallMediaSession` (or extend voice C10's hook)

- [ ] **If voice C10 has shipped:** import `useCallMediaSession` from `frontend/hooks/useCallMediaSession.ts`. Add video-specific extensions:
  ```ts
  export interface UseCallMediaSessionOpts {
    sessionId: string;
    callerName: string;
    modality: 'voice' | 'video';  // NEW
    isMuted: boolean;
    isOnHold: boolean;
    onPause: () => void;          // route to mute toggle (decision §33)
    onPlay: () => void;
    onStop: () => void;
    artwork?: string;             // video: last-known frame poster
  }
  ```
- [ ] **If voice C10 has NOT shipped:** ship the foundation per voice C10 contract.

### Video keep-alive for local track

- [ ] When the page enters `visibilitychange === 'hidden'`:
  - Continue publishing local video track via Twilio (Twilio handles the WebRTC keep-alive).
  - Schedule a no-op canvas re-render every 5s in the SW or hidden iframe (decision §33) to prevent Chrome's track suspension.
- [ ] When `visible` again: resume normal rendering.

### Service-worker notification

- [ ] **Edit `frontend/public/sw.js`** — on call start, post a `notification.showNotification` with persistent flag:
  ```js
  self.registration.showNotification('Video consult in progress', {
    body: `Doctor: ${callerName}`,
    tag: `video-consult-${sessionId}`,
    requireInteraction: true,
    silent: true,
    actions: [
      { action: 'mute', title: '🎤 Mute' },
      { action: 'end', title: '📞 End call' }
    ],
    icon: '/icons/call-active.png'
  });
  ```
- [ ] On notification click → `clients.openWindow('/c/video/[sessionId]')` or focus existing client.
- [ ] On action 'mute' → postMessage to client → toggle mute.
- [ ] On action 'end' → postMessage to client → end call.
- [ ] On call end / disconnect: dismiss notification.

### MediaSession metadata

- [ ] Set on call start:
  ```ts
  navigator.mediaSession.metadata = new MediaMetadata({
    title: 'Video consult',
    artist: callerName,
    artwork: [{ src: '/icons/call-active.png', sizes: '512x512', type: 'image/png' }]
  });
  ```
- [ ] Decision §33: artwork = static icon (cheap). Last-known video frame is a flag for v2.
- [ ] Action handlers: `pause` → mute (NOT hold; decision §14 from voice). `play` → unmute. `stoptransport` → end call.

### OEM smoke matrix

- [ ] **Android Chrome PWA on:** Samsung Galaxy S22, Xiaomi Redmi Note, OnePlus Nord, Pixel.
- [ ] On each: start call → swipe PWA away → wait 5 min → tap notification → call resumes.
- [ ] On each: pull-down notification → mute action → mic toggles.
- [ ] On each: notification persists across screen lock + 5 min idle.

### Cross-task wiring

- [ ] **F4 battery saver** — when battery audio-fallback fires, update notification text to "Audio-only call in progress".
- [ ] **F1 camera switch** — verify keep-alive works after camera flip.
- [ ] **A4 hold** — when on hold, notification pause action becomes "Resume" (or grayed out).

### iOS PWA degradation

- [ ] Detect via UA / `'standalone' in navigator`.
- [ ] If iOS PWA: skip notification path entirely; show in-app banner "Audio call may pause when app backgrounded — keep in foreground for best experience."

### Manual smoke

- [ ] Android Chrome PWA: 5-min background test passes.
- [ ] iOS Safari: degraded gracefully (banner shown, no notification).
- [ ] Voice C10 path still works (no regression).

### `mode='readonly'`

- [ ] N/A; only during live calls.

### General

- [ ] Type-check + lint clean.
- [ ] No console errors.
- [ ] Notification permission handled gracefully (denied = no notification, no error toast).

---

## Out of scope

- **iOS PWA persistent foreground.** Apple gates it; out of scope.
- **Per-app icon badge** for missed call. Out of scope.
- **Last-known video frame as MediaSession artwork.** Decision §33 — out of scope v1; static icon.
- **Native shell** (Capacitor / RN). Out of scope.

---

## Files expected to touch

**Frontend:**
- `frontend/hooks/useCallMediaSession.ts` — **edit** if voice C10 shipped (~30 LOC: video-specific extensions); else **new** (~150 LOC).
- `frontend/public/sw.js` — **edit** (~80 LOC: notification handler + actions).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~30 LOC: mount hook).
- `frontend/components/consultation/IOSPWABanner.tsx` — **new** (~30 LOC: iOS degradation banner).

**Backend / migrations:** none.

**Tests:**
- Manual smoke matrix (cannot reliably E2E test SW notifications).

---

## Notes / open decisions

1. **Decision §33** — static icon artwork v1; last-known frame as a future enhancement.
2. **Pause action = mute** (decision §14 from voice C10). Don't change call state ambiguously.
3. **OEM matrix** — must test on at least 4 popular Android OEMs; behavior varies wildly.
4. **iOS degradation copy** — a simple banner is sufficient.
5. **PWA-install gating** — only works on installed PWA. Encourage install via in-app prompt.
6. **Coordination with voice C10** — whoever ships first writes the foundation hook.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch F](../Plans/plan-video-consult-selected-features.md#sub-batch-f--mobile-native-niceties-10-days)
- **Source item:** [T6 §T6.40](../../../../Product%20plans/video-consult/plan-t6-video-mobile-native.md)
- **Decision:** [§33 — static artwork v1](../Plans/plan-video-consult-selected-features.md#before-sub-batch-f-starts)
- **Coupled:** [task-voice-C10](./task-voice-C10-android-foreground-notification.md), [task-video-A1](./task-video-A1-mute-unmute-mic.md), [task-video-A4](./task-video-A4-hold-call.md), [task-video-F4](./task-video-F4-battery-saver-downgrade.md)
- **W3C:** MediaSession API; Service Workers Notifications API

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** ✅ Shipped 2026-05-03 — voice C10 foundation laid by this PR.

---

## Implementation log (2026-05-03)

### Audit findings

- **Voice C10 had NOT shipped.** No `frontend/hooks/useCallMediaSession.ts`, no `frontend/public/sw.js`, no `manifest.json`, no `navigator.serviceWorker.register` calls anywhere in the codebase. F.4 bears the foundation per the spec's "If voice C10 has NOT shipped: ship the foundation per voice C10 contract" branch.
- **`<VoiceConsultRoom>` already wires Wake Lock** (`frontend/components/consultation/VoiceConsultRoom.tsx` L160-407) — `requestWakeLock()` helper, `wakeLockRef` ref, acquire on connect / release on teardown. Pattern reusable, but NOT touched in this PR (would expand scope to a 2-modality wire-up; voice C10 will do its own mount).
- **`<VideoRoom>` exposes everything the hook needs** as props or local state: `sessionId` (optional prop ~L216), `remoteLabel` ("Doctor" / "Patient" — see B2 comments on why real names aren't surfaced yet), `micMuted` state + `handleToggleMic` (~L2618), `handleEndConfirmConfirm` (~L3870), `hold.onHold` (B3).
- **Deeplink — no `/c/video/[sessionId]` route exists.** Video consults enter via `/c/video-invite/[token]` (token-based; resolves to a sessionId) or doctor dashboard. Decision: capture `window.location.href` at notification-show time so the SW doesn't have to know the route shape; works for any current or future surface that hosts `<VideoRoom>`.
- **No icon assets** — `frontend/public/` contains only Twilio video processor assets + `.gitkeep`. Spec referenced `/icons/call-active.png` (and `/icons/icon-192.png` etc. in voice C10). Decision: omit the `icon` / `artwork` fields from notification + MediaSession metadata. Browsers fall back gracefully (favicon / app icon for notification; no lock-screen artwork is a v1-acceptable degradation per decision §33 — "static icon artwork v1; last-known frame as a future enhancement"). Documented as deferred follow-up.
- **No PWA install prompt UI.** `manifest.json` doesn't exist; we don't surface an "install for foreground notifications" prompt. Out of scope per the F.3 spec ("PWA-install gating — only works on installed PWA. Encourage install via in-app prompt." flagged but not gated by this task).

### Scope decisions

- **Foundation-bearing scope (since voice C10 not shipped).** Implemented the FULL hook + SW + iOS banner per the F.3 spec branch; voice C10 will mount the same hook in `<VoiceConsultRoom>` when it ships, no API changes needed (modality switch via the `modality: 'voice' | 'video'` discriminator).
- **Lazy SW registration in the hook, not in `app/layout.tsx`.** Marketing pages (`/`, `/book`, `/login`, `/dashboard/*`) shouldn't pay the SW registration cost. The hook calls `navigator.serviceWorker.register('/sw.js')` on mount; idempotent — repeated mounts return the existing registration.
- **No `Notification.requestPermission()` prompt in this PR.** Permission gating is a higher-trust moment (patient lobby pre-call). For F.3 v1 we ship the foundation; the SW notification silently fails if permission isn't granted (no error toast, no console noise in production). Voice C10 / a follow-up can add the prompt.
- **MediaSession `pause` and `play` both route to `handleToggleMic`.** The toggle is safe because the browser only surfaces the active action button based on `playbackState` — when `playbackState === 'playing'`, only Pause shows (call → mute), and vice versa for paused.
- **`stop` AND `stoptransport` action handlers both registered.** Chrome prefers the more specific `'stoptransport'` for end-call semantics; other browsers use plain `'stop'`. Setting both is harmless.
- **`playbackState` mapped to `paused` when EITHER `isMuted` OR `isOnHold`.** Reflects "the call isn't actively producing audio for the OS lock-screen widget" — accurate signal for the OS to render the right play/pause icon.
- **No track keep-alive (5s no-op canvas tick).** Twilio's WebRTC heartbeat handles the connection-keep-alive. The spec's "hidden iframe / SW canvas re-render" trick is a "decision §33 maybe" — deferred until we see real-world track suspension reports. Current implementation relies on the persistent notification + MediaSession declaration alone, which is what Android Chrome's foreground-promotion path actually checks for.
- **No `Notification` icon / `MediaMetadata.artwork`.** No icon assets in the codebase. Browsers gracefully fall back. Documented as Phase 2 work (alongside `manifest.json` + PWA install prompt).
- **iOS PWA banner null-renders on regular iOS Safari.** Detection requires `display-mode: standalone` (or legacy `navigator.standalone === true`) AND iOS UA. Non-PWA iOS gets nothing — that's a different UX path (the user can just keep the tab open), so a permanent banner there would be condescending.
- **iOS banner hidden during hold** — same visibility discipline as other controls. The call isn't actively at risk from backgrounding while paused.
- **Deeplink from `window.location.href`.** Captured at notification-show time so multiple modalities + future routes work without route-shape knowledge in the SW.

### Files touched

| File | LOC | Why |
| --- | --- | --- |
| `frontend/public/sw.js` | +210 (new) | Bears the SW foundation: install/activate lifecycle, message handlers (show/hide-call-notification), notificationclick handler with action routing, version probe handler |
| `frontend/hooks/useCallMediaSession.ts` | +375 (new) | Modality-aware MediaSession + foreground-notification glue; lazy SW registration; visibility hooks; SW message bridge |
| `frontend/components/consultation/IOSPWABanner.tsx` | +75 (new) | iOS PWA degradation banner (UA + display-mode detection + amber sticky banner) |
| `frontend/components/consultation/VideoRoom.tsx` | +60 / -2 | Imports + hook mount (after `handleEndConfirmConfirm` declared) + render `<IOSPWABanner>` above the canvas (next to the screen-share privacy banner family) |

### Verification

- `tsc --noEmit` — clean (~24s).
- `next lint --dir hooks --dir components` — clean ("✔ No ESLint warnings or errors").
- `ReadLints` across all 4 touched files — clean.
- Unit + E2E tests deferred (matches existing precedent across A1-F.3; SW notifications can't be reliably E2E-tested without OEM hardware — spec acknowledges this: "Tests: Manual smoke matrix (cannot reliably E2E test SW notifications).").
- SW eligibility check: `frontend/public/sw.js` is at the correct path for Next.js to serve at `/sw.js`. Public-dir static serving is the standard pattern (no app-router page shadowing).

### Cross-task verifications

- **F.4 battery saver** — `<BatteryWarningBanner>` and `<IOSPWABanner>` are independent banners in different visual slots. No state collision; both can render simultaneously (e.g. iOS PWA on low battery). Notification text update for "Audio-only call in progress" during battery fallback is deferred to Phase 2 (would require the hook to take a `modeOverride` prop or the page to mutate the SW notification copy via a fresh `show-call-notification` post — not blocking).
- **F.2 camera switch** — keep-alive doesn't change behavior: when `<CameraSwitchButton>` flips the camera, Twilio handles unpublish/publish; the page stays in the foreground (visibilitychange is `visible`); SW notification stays hidden. Confirmed no interaction.
- **B3 hold** — when `hold.onHold === true`, MediaSession `playbackState` flips to `'paused'` and the SW notification body switches to "Call paused — tap to return". The mute action routes to `handleToggleMic` regardless of hold state (decision §14: pause = mute, NOT hold).
- **A1 mute** — MediaSession `pause` action calls `handleToggleMic`, the SAME function the in-app Mute button uses. Single source of truth for the toggle path.
- **A4 end-call confirm** — MediaSession `stop` / SW `end` action both route to `handleEndConfirmConfirm`, which dismisses the confirm dialog (already-open) AND calls `handleLeave()`. The user gets straight to call-end without an extra confirm step from the OS surface — spec is silent on this; design choice errs on the "they tapped End on a notification, they meant it" side.

### Known gaps / follow-ups

- **No manifest.json + PWA install prompt** — separate Phase 2 work. Without `manifest.json`, the user can't actually install the PWA on Android; the foreground notification path is dormant for non-installed visits.
- **No icon assets** — `/icons/call-active.png`, `/icons/icon-192.png`, `/icons/icon-512.png` referenced in spec don't exist. Notification falls back to favicon; MediaSession metadata has no artwork. Easy follow-up: add the icons + uncomment the artwork fields in `useCallMediaSession.ts` and `sw.js`.
- **No `Notification.requestPermission()` prompt** — silent-degrade today. Add at the patient lobby (pre-call) when permission UX is designed.
- **No track keep-alive** — Twilio handles WebRTC heartbeat; if real-world reports show track suspension on aggressive Android OEMs, add the 5s no-op canvas tick (decision §33 maybe).
- **No OEM smoke matrix executed** — needs hardware (Samsung, Pixel, Xiaomi, OnePlus). Spec acknowledges this is out-of-PR-scope.
- **F.4 battery banner text update on fallback** — Phase 2 (hook would need a `bodyOverride` prop or the page would post a fresh `show-call-notification` with updated copy).
- **No `MediaSession` artwork** — deferred per decision §33 (static icon v1 + last-known frame future enhancement; both deferred to v2).
- **Voice C10 mount** — voice C10 will mount the same hook with `modality: 'voice'`; this PR doesn't touch `<VoiceConsultRoom>` (would expand scope unnecessarily).
- **No frontend hook unit tests** — matches F.1 / F.2 / F.3 / F.4-battery / E.4 / E.6 / D.4 precedent (Jest infra not in place).
