# Video T2 — Real polish (10 items, ~5 days)

## Next-sprint clinical UX — pre-call lobby, layout swap, PiP, hold, reconnect, video-quality picker

> **Roadmap reference:** [plan-00-video-consult-roadmap.md](./plan-00-video-consult-roadmap.md). T2 ships after T1; many items are siblings of voice T2 (lobby, hold, reconnect, disconnect splash, caller card) and reuse that machinery.

---

## Goal

Round out the call lifecycle and layout surface so video consults feel like Google Meet / Doximity — not like an MVP with mute and end-call. Adds the "before the call" surface (lobby), the "during the call" layout flexibility (gallery / speaker swap, PiP), the "lifecycle banners" (hold / reconnect / disconnect), and a video-quality control patients can use to manage their data plan.

**Zero new schema. Some Plan 06 enum extensions (`hold_changed` already added by voice; `screen_share_started` deferred to T3.23).** ~5 dev-days.

---

## Status

`Drafted` — **`[SELECTED 2026-04-29]`** — **full tier** (all 10 items).

---

## What's in scope (10 items)

> Every row below is **`[SELECTED 2026-04-29]`**.

| # | Item | Effort | Dep |
|---|------|--------|-----|
| T2.9 | **`[SELECTED 2026-04-29]`** **Pre-call lobby** — extends T1.7 mic-check with clinic logo + practice name + countdown to scheduled appointment time. (Sibling of voice T2.9 / B2.) | M (~5h) | T1.7. |
| T2.10 | **`[SELECTED 2026-04-29]`** **Caller-card overlay header** — name + role + duration + network bars rendered as a translucent overlay at the top of the remote tile (instead of a separate header row). On hover/tap: expands to show practice name + recording status. | S (~4h) | T1.3 + T1.8. |
| T2.11 | **`[SELECTED 2026-04-29]`** **Hold call** — both parties' mics + cameras paused; banner: "On hold — Dr. Sharma stepped away"; reuses Plan 06 `hold_changed` enum already added by voice batch B3. | M (~5h) | Voice batch's `hold_changed` enum. |
| T2.12 | **`[SELECTED 2026-04-29]`** **Reconnection UX** — countdown banner ("Reconnecting… (28s)") + Try-now button + Rejoin-call button after auto-retry exhaustion. Same `useTwilioReconnectState` hook as voice B1. | M (~6h) | Reuse voice hook. |
| T2.13 | **`[SELECTED 2026-04-29]`** **Disconnect-reason splash** — replace the static "Call ended" placeholder with a 6-reason classifier (local / remote / connection_lost / timeout / token_expired / unknown). Same `classifyDisconnect` from voice A9. | S (~3h) | Reuse voice classifier. |
| T2.14 | **`[SELECTED 2026-04-29]`** **Layout swap (gallery / speaker / sidebar)** — gallery: equal tiles; speaker: remote full-canvas with self-view as overlay (T1.5); sidebar: remote main + self thumbnail. Toggle in controls bar. Persisted per-device. | M (~6h) | T1.5. |
| T2.15 | **`[SELECTED 2026-04-29]`** **Picture-in-picture (browser PiP)** — enter PiP mode for remote video so doctor can chart in another tab while seeing patient. `requestPictureInPicture()` API. Documented degradation on iOS Safari (no PiP for `<video>` until iOS 14+ and only with user gesture). | M (~5h) | none. |
| T2.16 | **`[SELECTED 2026-04-29]`** **Video-quality picker** — dropdown in controls: `Auto` (default; T5.31 adaptive) · `1080p` · `720p` · `480p` · `Audio-only`. Patient-side prominently surfaces "Audio-only saves data". | S (~4h) | none for v1; couples with T5.31 when T5.31 lands. |
| T2.17 | **`[SELECTED 2026-04-29]`** **Volume slider for remote audio** — same WebAudio gainNode pattern as voice B4; 0–150% with ×1.5 boost. | S (~4h) | reuse voice B4 `<VolumeSlider>` + `gain-node.ts`. |
| T2.18 | **`[SELECTED 2026-04-29]`** **Recording-status pill** in caller card — "● Recording" pulsing red when recording is active; "⏸ Paused" amber when paused. Reads from existing `useRecordingState` + `useVideoEscalationState` (Plan 02 + 08). | XS (~1h) | Plan 02 + 08 already shipped. |

---

## Non-goals (explicitly NOT in T2 — owned by later tiers)

- **Snapshot capture / freeze-frame** — T3.21 / T3.22.
- **Screen share** — T3.23.
- **Virtual background / blur** — T3.20.
- **Live captions** — T3.25 (Plan 10 dep).
- **Camera switch (front/back)** — T6.38.
- **Adaptive bitrate** — T5.31 (T2.16 just adds the manual-override picker; auto path is T5.31).
- **Audio-only auto-fallback on bandwidth catastrophe** — T5.32.

---

## Why each item is in T2

- **T2.9 lobby** — the "you're in the right place" reassurance every patient needs before a clinical interaction. Today they hit the URL and either get a black screen (no permission) or an immediate Twilio room. Clinic-branded lobby fixes both.
- **T2.10 caller-card overlay** — current header takes up vertical space the video tile needs. Translucent overlay is the modern pattern (Meet / Zoom). Surfaces all key context (name, role, duration, network) in one corner.
- **T2.11 hold call** — clinical workflow: doctor steps out to look up something, hold the call so neither side feels uncertainty about whether the call dropped. Voice already shipped this; video reuses 90% of the code path.
- **T2.12 reconnection UX** — same as voice B1. Without it, video freeze + audio silence with no UI signal = users assume the call dropped and rejoin (creating a duplicate session).
- **T2.13 disconnect splash** — current `<VideoRoom>` shows static "Call ended" with zero context. The 6-reason classifier matches user intuition ("did THEY hang up or did MY wifi drop?").
- **T2.14 layout swap** — speaker view is what doctors want when patient is showing a wound (remote full-canvas, self tucked away); gallery is what's right for a chat-style consult. Toggle in 2 taps.
- **T2.15 PiP** — the killer feature for doctors who need to chart in EHR while keeping the patient visible. Native browser API; cheap to ship.
- **T2.16 video-quality picker** — patient on cellular with a data cap WILL ask. Today they have to leave the call. Manual override + audio-only escape hatch.
- **T2.17 volume slider** — patient on quiet headphones, doctor's voice too soft, OS volume already maxed. Same need as voice; same solution.
- **T2.18 recording pill** — Plan 02 / 08 already track recording state; surfacing it prominently in the caller card is one tiny piece of UX work that closes a "wait, are we being recorded?" anxiety loop.

---

## Implementation contract per item

### T2.9 — Pre-call lobby (extends T1.7)

```
Wraps <VideoConsultPreCall> with:
  - Top banner: clinic logo + practice name + appointment date/time (en-GB locale).
  - Below banner: countdown — "Your consult starts in 02:34" / "Starting now…" /
    "Waiting for Dr. Sharma to join…" — same logic as voice B2.
  - T1.7's mic-check + camera-check section preserved.

Decision (mirrors voice B2 §7): branding source = clinic.branding.logoUrl;
fall back to text-only if missing.
```

### T2.10 — Caller-card overlay

```tsx
// New <CallerCardOverlay> renders absolute-positioned at top-center
// of the remote tile:
<CallerCardOverlay
  counterparty={{ name, role, avatarUrl, practiceName }}
  connectedAt={connectedAt}
  room={room}
  status={'live' | 'hold' | 'reconnecting' | 'connecting'}
  recordingStatus={'idle' | 'recording' | 'paused'}
/>

// Style: translucent dark gradient (rgba(0,0,0,0.6)) bottom-fading-up;
// 56px tall; auto-hides after 5s of no interaction; reappears on hover/tap.
```

### T2.11 — Hold call

- Reuse voice B3 `<HoldCallBanner>` and `useHoldState` hook.
- Add: also disable local video track (Twilio `LocalVideoTrack.disable()`) and remote video display while on hold (mute outputs).
- System message uses `hold_changed` enum already shipped by voice batch.

### T2.12 — Reconnection UX

- Reuse voice B1 `<ReconnectionBanner>` and `useTwilioReconnectState` hook.
- Mount as overlay on the video canvas (not in a separate top bar like voice).

### T2.13 — Disconnect-reason splash

- Reuse voice A9 `classifyDisconnect` classifier and `<VoicePostCallSplash>` shape — rename to `<CallDisconnectSplash>` (modality-agnostic).
- Replace `VideoRoom.tsx` lines 392-399 (current "Call ended" static placeholder) with the splash.

### T2.14 — Layout swap

```tsx
// Three layouts:
type VideoLayout = 'gallery' | 'speaker' | 'sidebar';

// gallery: legacy md:grid-cols-2.
// speaker: remote full-width, full-height (object-fit: cover); self as
//   T1.5 corner overlay.
// sidebar: remote 70% left, self 30% right vertical.

// Toggle in controls bar (cycles gallery → speaker → sidebar → gallery).
// localStorage 'video-layout' persists per device.
// On mobile: only gallery + speaker; sidebar collapses to speaker.
```

### T2.15 — Picture-in-picture

```ts
const enterPip = async () => {
  if (!remoteVideoRef.current) return;
  if (!('pictureInPictureEnabled' in document)) return;  // unsupported
  try {
    await remoteVideoRef.current.requestPictureInPicture();
  } catch (e) { console.warn('[pip] denied', e); }
};

// Button in controls bar (icon: PiP).
// Disabled when document.pictureInPictureEnabled === false.
// iOS Safari: works on iOS 14+ for <video> with playsinline; degrades silently.
```

### T2.16 — Video-quality picker

```ts
// Twilio publishes video at the resolution set in createLocalTracks options.
// To switch quality mid-call:
const setVideoQuality = async (q: '1080' | '720' | '480' | 'audio-only') => {
  const localVideoTrack = localTracksRef.current.find(t => t.kind === 'video');
  if (q === 'audio-only') {
    (localVideoTrack as LocalVideoTrack)?.disable();
    return;
  }
  // Restart video track at new resolution
  const constraints = q === '1080' ? { width: 1920, height: 1080 } :
                      q === '720'  ? { width: 1280, height: 720 } :
                                     { width: 640, height: 480 };
  const newTrack = await Twilio.createLocalVideoTrack(constraints);
  await room.localParticipant.unpublishTrack(localVideoTrack);
  await room.localParticipant.publishTrack(newTrack);
  localTracksRef.current = localTracksRef.current
    .filter(t => t !== localVideoTrack).concat(newTrack);
};
```

- Picker rendered as a dropdown in controls bar.
- Patient-side: highlight "Audio-only" with a "Save data" subline.

### T2.17 — Volume slider

- Reuse voice B4 `<VolumeSlider>` + `frontend/lib/audio/gain-node.ts` verbatim.

### T2.18 — Recording pill in caller card

```tsx
// Inside <CallerCardOverlay>:
{recordingStatus === 'recording' && (
  <span className="flex items-center gap-1 text-red-400">
    <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
    Recording
  </span>
)}
{recordingStatus === 'paused' && (
  <span className="flex items-center gap-1 text-amber-400">⏸ Paused</span>
)}
```

- Source from `useRecordingState` + `useVideoEscalationState` (already wired in `<VideoRoom>`).

---

## Acceptance criteria

- [ ] **T2.9** — lobby shows clinic branding + countdown; transitions to "Starting now…" at T-0; preserves all T1.7 mic/camera check behavior.
- [ ] **T2.10** — caller-card overlay renders all key context; auto-hides after 5s; reappears on hover/tap; doesn't obscure the remote face.
- [ ] **T2.11** — hold mutes both mics + disables both cameras; banner appears on both sides; only initiator can resume; system message in chat; recording continuity preserved.
- [ ] **T2.12** — reconnection banner appears within 1s of `room.on('reconnecting')`; countdown ticks; Try-now works; full-rejoin re-mints tokens.
- [ ] **T2.13** — disconnect splash replaces static "Call ended"; correct reason for all 6 branches; Rejoin button works for connection_lost / token_expired.
- [ ] **T2.14** — layout swap toggles cleanly between gallery / speaker / sidebar; persisted per-device; mobile gracefully reduces to gallery + speaker.
- [ ] **T2.15** — PiP enters/exits on supported browsers; degrades silently on iOS Safari < 14; no console errors.
- [ ] **T2.16** — quality picker changes resolution mid-call within 2s; audio-only kills video track but keeps audio; picker remembers last choice.
- [ ] **T2.17** — volume slider 0–150 with boost; persisted per device.
- [ ] **T2.18** — recording pill reflects recording state within 500 ms of state change.
- [ ] No regression on existing video flow (recording, escalation, consent, companion chat).
- [ ] Frontend type-check + lint clean.
- [ ] Manual smoke: doctor + patient on different devices for a 15-min call exercises every T2 item without console errors.

---

## Files expected to touch

**Frontend:**

- `frontend/components/consultation/VideoRoom.tsx` (**extend**) — every item touches this.
- `frontend/components/consultation/VideoConsultPreCall.tsx` (**extend from T1.7**) — adds lobby chrome.
- `frontend/components/consultation/CallerCardOverlay.tsx` (**new**, T2.10).
- `frontend/components/consultation/HoldCallBanner.tsx` (**reuse from voice B3**, T2.11).
- `frontend/components/consultation/ReconnectionBanner.tsx` (**reuse from voice B1**, T2.12).
- `frontend/components/consultation/CallDisconnectSplash.tsx` (**rename voice's `<VoicePostCallSplash>`**, T2.13).
- `frontend/components/consultation/VideoLayoutSwitcher.tsx` (**new**, T2.14).
- `frontend/components/consultation/VideoQualityPicker.tsx` (**new**, T2.16).
- `frontend/components/consultation/VolumeSlider.tsx` (**reuse from voice B4**, T2.17).
- `frontend/hooks/useTwilioReconnectState.ts` (**reuse from voice B1**, T2.12).
- `frontend/hooks/useHoldState.ts` (**reuse from voice B3**, T2.11).
- `frontend/lib/voice/classify-disconnect.ts` (**reuse from voice A9**, T2.13) — rename folder to `frontend/lib/call/` so it's modality-agnostic.
- `frontend/lib/audio/gain-node.ts` (**reuse from voice B4**, T2.17).

**Plan 06 enum touches:** none new in T2 (`hold_changed` already added by voice batch B3; `mute_changed` already added by voice batch A7; `camera_changed` added by T1.2).

**No backend changes. No schema changes. No DM copy changes.**

---

## Open questions / decisions

1. **Layout default on mobile portrait** — gallery (legacy) or speaker (modern)? Recommendation: speaker (matches every other video-call app on mobile).
2. **Caller-card overlay auto-hide timing** — 5s recommended; revisit if doctors find it disappears too fast.
3. **Video-quality picker default** — `Auto` (recommended; pairs with T5.31 when shipped). For now `Auto` = legacy fixed 640×480.
4. **iOS Safari PiP gracefully degrades** — confirm on iOS 17+ at PR time.
5. **Hold disables camera too?** — yes (recommended; privacy). Voice doesn't have video to disable; video extends with camera disable.
6. **PiP behavior on tab-switch** — most browsers auto-PiP when user switches tabs IF a `<video>` is playing AND `pictureInPictureEnabled`. T2.15 makes this discoverable via a button; the auto-PiP path is OS-driven.

---

## References

- [plan-00-video-consult-roadmap.md](./plan-00-video-consult-roadmap.md)
- [plan-t2-voice-real-polish.md](../voice-consult/plan-t2-voice-real-polish.md) — siblings: T2.9 lobby, T2.10 caller card, T2.11 hold, T2.13 volume slider, T2.15 reconnect, T2.16 disconnect.
- Twilio Video JS SDK — `LocalVideoTrack.disable`/`.enable`, `unpublishTrack` / `publishTrack` for live resolution swap.
- W3C Picture-in-Picture API — `requestPictureInPicture`, `document.pictureInPictureEnabled`.

---

**Owner:** TBD
**Created:** 2026-04-29
**Last updated:** 2026-04-29 — all T2 items **`[SELECTED 2026-04-29]`**.
**Status:** Drafted + **`[SELECTED 2026-04-29]`** — full tier (10 / 10 items).
