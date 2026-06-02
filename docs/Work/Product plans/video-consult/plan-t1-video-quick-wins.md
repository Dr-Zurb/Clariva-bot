# Video T1 — Quick wins (8 items, ~2 days)

## Lift the call from "MVP that works" to "feels like a proper telemed product" in a single short sprint

> **Roadmap reference:** [plan-00-video-consult-roadmap.md](./plan-00-video-consult-roadmap.md). T1 is the first slice; **strongly recommended for first batch** since the current `<VideoRoom>` lacks fundamental controls (no mute, no camera off, no duration timer, no end-call confirm).
>
> **Foundation:** `frontend/components/consultation/VideoRoom.tsx` (~630 lines), `frontend/app/consult/join/page.tsx`.

---

## Goal

Ship eight UX items that together move every video call from "it works" to "it feels intentional". All eight live inside (or immediately adjacent to) `frontend/components/consultation/VideoRoom.tsx`. **Zero backend changes. Zero schema changes. Zero new vendors.** ~2 days end-to-end.

This tier closes the largest perceived-quality gap in the entire roadmap: today the only control on the video room is "Leave call". After T1 the user has parity with WhatsApp / Google Meet for basic call ergonomics.

---

## Status

`Drafted` — **`[SELECTED 2026-04-29]`** — **full tier** (all 8 items). Implementation sequencing remains per roadmap / Daily-plans batch.

---

## What's in scope (8 items)

> Every row below is **`[SELECTED 2026-04-29]`**.

| # | Item | Effort | Touch points |
|---|------|--------|--------------|
| T1.1 | **`[SELECTED 2026-04-29]`** **Mute / unmute mic** — mic-off button in the controls bar; standard mic-slash icon when muted; companion-chat system message via Plan 06 `mute_changed` (sibling of voice T1.8 — already shipped). | XS (~30 min) | `VideoRoom.tsx` controls bar. |
| T1.2 | **`[SELECTED 2026-04-29]`** **Camera off / on** — separate button next to mute; turns OFF the local video track (replaces tile with avatar / initials placeholder); companion-chat system message `camera_changed` (new system_subtype). | S (~2h) | `VideoRoom.tsx` + `VideoSelfTile` placeholder. |
| T1.3 | **`[SELECTED 2026-04-29]`** **Call duration timer** in header (`mm:ss`, monotonic from `connected` event). Same hook as voice T1.1. | XS (~30 min) | `VideoRoom.tsx` header overlay. |
| T1.4 | **`[SELECTED 2026-04-29]`** **End-call confirmation** — "End the call? [Cancel / End]" modal. Doctor side bypass with shift-click for power users. (Sibling of voice T1.5 — reuse component verbatim.) | XS (~30 min) | Reuse `<EndCallConfirmModal>` from voice batch. |
| T1.5 | **`[SELECTED 2026-04-29]`** **Self-view position toggle** — own tile defaults to bottom-right corner overlay on remote tile (PiP-style); tap to flip corners (TL / TR / BL / BR); persisted per-device. | S (~3h) | `VideoRoom.tsx` layout + new `<VideoSelfTile>`. |
| T1.6 | **`[SELECTED 2026-04-29]`** **Self-view mirror toggle** — mirror own selfie video (default ON, matches every selfie camera UX); persisted per-device. | XS (~30 min) | `<VideoSelfTile>` CSS `transform: scaleX(-1)`. |
| T1.7 | **`[SELECTED 2026-04-29]`** **Pre-call camera + mic check** — one screen before connect: live selfie preview + mic level bar + camera dropdown + mic dropdown + "Continue / Skip mic check". | M (~5h) | New `VideoConsultPreCall.tsx`; route `/consult/join/page.tsx` mounts pre-call before VideoRoom. |
| T1.8 | **`[SELECTED 2026-04-29]`** **Network-quality 4-bar indicator** — Twilio `Participant.networkQualityLevel` 0–5 → 4-bar icon. Both sides. **Video extension:** detail tooltip shows `RTT / jitter / resolution / fps / kbps in / kbps out` (vs voice's lighter tooltip). | S (~3h) | `VideoRoom.tsx` overlay + extends shared `useNetworkQuality` hook. |

---

## Non-goals (explicitly NOT in T1 — owned by later tiers)

- Pre-call **lobby** with clinic branding + countdown — that's T2.9 (lobby is bigger; pre-call check is T1.7 only).
- **Caller-card** overlay header with patient demographics — T2.10.
- **Reconnection countdown UI** — T2.12.
- **Layout swap** (gallery / speaker) — T2.14.
- **Picture-in-picture** browser API — T2.16.
- **Camera switch** (front/back on mobile) — T6.38.
- Any backend, schema, or DM-copy changes (other than reusing Plan 06's existing system-message channel for T1.1 + T1.2).

---

## Why each item is in T1

- **T1.1 mute mic** — every video product has one. Today's `<VideoRoom>` has no mute button at all, only "Leave call". Patients say "wait, let me find privacy" and have nowhere to mute.
- **T1.2 camera off** — same reasoning. Patients in cluttered rooms / undressing for clinical exams need an immediate camera-off. Today they hang up and rejoin.
- **T1.3 timer** — both sides need it. Doctors bill on duration; patients want basic situational awareness.
- **T1.4 end-call confirm** — one accidental tap on "Leave call" kills a 20-minute consult. The button is an unguarded red button at the bottom; very easy to misclick on mobile.
- **T1.5 self-view position** — today's two-tile grid wastes screen real estate. Doctors want self-view tucked away (corner overlay) so the patient takes the full canvas. Patients want the same on mobile.
- **T1.6 mirror toggle** — selfie cameras are universally mirrored. The current default unmirrored self-view looks wrong (text appears reversed); fix is a single CSS line + toggle.
- **T1.7 pre-call check** — eliminates ~80% of "I can't see/hear you" first-30-second moments. The cheapest reliability win we can ship. Camera check (vs voice's mic-only check) catches lens-cap-on / wrong-camera-selected immediately.
- **T1.8 network bars w/ video stats** — when video freezes, users immediately attribute it to the right side. Today nobody knows whose bandwidth dropped. The video-extension tooltip is what doctors will use to diagnose "your connection is bad" vs "we should switch to audio-only".

---

## Implementation contract per item

### T1.1 — Mute / unmute mic

```ts
// In VideoRoom.tsx controls bar (NEW <VideoControlsBar>):
const [micMuted, setMicMuted] = useState(false);
const handleToggleMic = useCallback(() => {
  const audioTrack = localTracksRef.current.find(t => t.kind === 'audio');
  if (!audioTrack) return;
  if (micMuted) (audioTrack as LocalAudioTrack).enable();
  else (audioTrack as LocalAudioTrack).disable();
  setMicMuted(m => !m);
  // Plan 06 system message — same path as voice T1.8 / A7
  emitSystemMessage({ system_subtype: 'mute_changed', metadata: { actor_id, on_hold: false, muted: !micMuted } });
}, [micMuted]);
```

- Reuse the exact `mute_changed` enum value voice batch shipped (no new enum).
- Icon: standard mic / mic-slash.
- **Doctor + patient symmetric** — same button, same behavior.

### T1.2 — Camera off / on

```ts
// New <VideoSelfTile> renders an avatar placeholder when camera is off.
const [cameraOff, setCameraOff] = useState(false);
const handleToggleCamera = useCallback(() => {
  const videoTrack = localTracksRef.current.find(t => t.kind === 'video');
  if (!videoTrack) return;
  if (cameraOff) {
    (videoTrack as LocalVideoTrack).enable();   // restart streaming
  } else {
    (videoTrack as LocalVideoTrack).disable();  // stop sending frames; keeps track alive
  }
  setCameraOff(c => !c);
  emitSystemMessage({ system_subtype: 'camera_changed', metadata: { actor_id, camera_off: !cameraOff } });
}, [cameraOff]);
```

- **`camera_changed` is a NEW Plan 06 system_subtype** — single ALTER TYPE; same migration shape as voice's `mute_changed`. Owned by Plan 06; T1.2 is the first consumer.
- Icon: video / video-slash.
- When camera off: `<VideoSelfTile>` renders an avatar placeholder (initials on solid color) + "Camera off" label.
- Remote view of a camera-off peer: same avatar placeholder.

### T1.3 — Call duration timer

```ts
// Same hook as voice T1.1. If the voice useCallDuration hook has shipped,
// reuse verbatim. Otherwise ship here (~40 LOC).
const { formatted } = useCallDuration(connectedAt);
// Render in a small overlay chip at top-left of the remote tile.
```

### T1.4 — End-call confirmation

- Reuse `<EndCallConfirmModal>` from voice T1.5 / A2 verbatim. Same copy, same shift-click bypass, same default-focus-on-Cancel.

### T1.5 — Self-view position toggle

```
New <VideoSelfTile> component:
  - Props: position: 'TL' | 'TR' | 'BL' | 'BR' | 'side', cameraOff, mirrored, onCornerClick.
  - 'side' renders as the legacy md:grid-cols-2 tile (desktop default).
  - Other positions render as a small (160×120 px) absolute-positioned overlay
    on top of the remote tile.
  - Tap → cycles through TL → TR → BR → BL → TL (or → 'side' on desktop).
  - localStorage 'video-self-view-position' persists choice.

Default per device:
  - Mobile portrait: BR overlay.
  - Tablet / desktop: 'side' (legacy).
```

### T1.6 — Self-view mirror toggle

```css
/* In <VideoSelfTile>, when `mirrored === true`: */
video.local { transform: scaleX(-1); }
```

- Toggle in a small kebab menu on the self-view tile.
- Default: ON (matches phone selfie cameras).
- Persisted per device.

### T1.7 — Pre-call camera + mic check

```
frontend/components/consultation/VideoConsultPreCall.tsx (NEW)

Renders:
  - Live selfie preview (mirrored; from getUserMedia({ audio:true, video:true }))
  - Camera dropdown (enumerateDevices, videoinput only)
  - Mic dropdown (audioinput only)
  - Mic level bar (reuse <MicMeterBar> from voice A3 if shipped)
  - "Test sound" button (plays /audio/precall-test-chime.mp3 — reuse voice asset)
  - Continue / Skip buttons (telemetered skip rate, same decision §2 as voice)

Mount order in /consult/join/page.tsx:
  1. PatientGate (HMAC + JWT exchange)
  2. NEW: <VideoConsultPreCall onReady={() => setReady(true)} />
  3. <VideoRoom ... companion={...}> — only after onReady fires

Doctor side: same pre-call screen mounted by ConsultationLauncher
before the canvas hands off to VideoRoom.
```

- **PHI hygiene:** the live selfie preview is local-only (never sent to server); `getUserMedia` stream is held in component state and torn down on unmount.

### T1.8 — Network-quality 4-bar with video stats

```ts
// Extends shared useNetworkQuality hook (voice T1.3 / A4 owns the base).
// Video extension adds `getStats()` reads for video tracks:
{
  level: 0..5,
  rtt: number,
  jitter: number,
  packetLoss: number,
  resolution?: { width: number, height: number },   // video-only
  fps?: number,                                     // video-only
  framesDroppedPct?: number,                        // video-only
  kbpsSend?: number,                                // video-only
  kbpsReceive?: number                              // video-only
}

// <NetworkBars> overlay tooltip (when clicked):
//   "Network: 4 bars
//    RTT 45ms · Jitter 8ms · Loss 0.1%
//    Video: 720×480 @ 24fps · 480 kbps in / 320 kbps out"
```

- The video-detail tooltip is what makes this an enriched item vs voice. Doctors use it to decide whether to ask the patient to switch to audio-only (T5.32 future).

---

## Acceptance criteria

- [ ] **T1.1** — mic mute toggles within 200 ms of click; icon flips; companion chat shows `mute_changed` system row on the other side within 1 s; works in both directions.
- [ ] **T1.2** — camera-off stops sending frames within 200 ms; remote sees avatar placeholder with "Camera off" within 1 s; companion chat shows `camera_changed` system row; restart resumes within 500 ms; Plan 06 enum migration applied.
- [ ] **T1.3** — duration timer ticks every 1 s once connected, pauses display while `reconnecting`, stops on disconnect.
- [ ] **T1.4** — end-call modal blocks accidental taps; shift-click bypass works; default focus on Cancel.
- [ ] **T1.5** — self-view defaults to BR overlay on mobile, side-by-side on desktop; tap cycles corners; choice persisted across page reload.
- [ ] **T1.6** — selfie video mirrored by default; toggle flips orientation; choice persisted.
- [ ] **T1.7** — patient (and doctor) cannot enter the room without granting mic + camera permission OR explicitly tapping "Skip" (telemetered); selfie preview reacts within 200 ms of camera grant; mic level bar reacts within 100 ms of speaking.
- [ ] **T1.8** — network bars update within 1 s of Twilio `networkQualityLevelChanged`; tooltip surfaces video stats including resolution, fps, frames dropped, bitrate; works on both sides.
- [ ] No regression on existing video flow (recording controls, companion chat, video escalation, consent modal).
- [ ] Frontend type-check + lint clean.
- [ ] Manual smoke: doctor + patient on different devices (one mobile, one desktop) for a 10-min call exercises every T1 item without hitting a console error.

---

## Files expected to touch

**Frontend (only):**

- `frontend/components/consultation/VideoRoom.tsx` (**extend**) — every item touches this; major restructure for T1.5 self-view as overlay.
- `frontend/components/consultation/VideoControlsBar.tsx` (**new**, T1.1 + T1.2 + T1.4) — consolidated controls.
- `frontend/components/consultation/VideoSelfTile.tsx` (**new**, T1.5 + T1.6) — corner-positionable mirrored self-view.
- `frontend/components/consultation/VideoConsultPreCall.tsx` (**new**, T1.7).
- `frontend/components/consultation/NetworkBars.tsx` (**reuse from voice A4**, T1.8) — same component; video adds tooltip extension.
- `frontend/hooks/useCallDuration.ts` (**reuse from voice A1**, T1.3).
- `frontend/hooks/useNetworkQuality.ts` (**extend voice's**, T1.8) — video-stats branch.
- `frontend/app/consult/join/page.tsx` (**extend**, T1.7 mount order; also benefits from voice Sub-batch 0 P0.B fix to wire companion).

**Plan 06 enum touches (one new value):**

- `consultation_messages.system_subtype` → add `'camera_changed'`. Owned formally by Plan 06; T1.2 is the first consumer. (`'mute_changed'` was already added by voice batch A7.)

**No backend changes (other than Plan 06 enum migration). No DM copy changes.**

---

## Open questions / decisions for during implementation

1. **Should T1 ship before or alongside the voice batch's Sub-batch 0 P0 fix?** Recommendation: voice Sub-batch 0 first (it unblocks patient-side companion chat for video too), then T1.
2. **Self-view default on mobile portrait** — bottom-right (recommended, mirrors WhatsApp / Meet) or full-width below remote (mirrors current grid)? Recommendation: BR overlay for the more "video-call-like" feel.
3. **Camera-off avatar source** — initials on a colored background hash (recommended; no remote fetch) or `doctor_settings.avatar_url` if available? Recommendation: initials hash for simplicity; upgrade to avatar URL if shipped.
4. **`camera_changed` enum migration** — combine with any other in-flight enum migration (e.g. text consult or voice batch sibling) to save a migration file. Coordinate at PR time.
5. **iOS Safari `enumerateDevices`** — same caveat as voice T1.6/T1.7: iOS may not expose all devices. Fallback: show "Use system controls" hint.
6. **Mute system-message volume** — cross-modality consistency. Voice T1.8 ships this; reuse the same debounce convention (collapse mute+unmute within 5 s into a single message).
7. **Pre-call permission denial** — if user denies camera but grants mic, do we proceed or block? Recommendation: proceed with camera-off; surface "Camera blocked — enable in browser settings" hint inline.

---

## References

- [plan-00-video-consult-roadmap.md](./plan-00-video-consult-roadmap.md)
- [plan-t1-voice-quick-wins.md](../voice-consult/plan-t1-voice-quick-wins.md) — most items are siblings; reuse hooks / components / components / icons.
- [plan-06-companion-text-channel.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-06-companion-text-channel.md) — system-message surface used by T1.1 + T1.2.
- Twilio Video JS SDK — `Participant.networkQualityLevel`, `LocalVideoTrack.enable`/`.disable`, `getStats()`.
- Web Audio API — `AnalyserNode` for T1.7 mic level visualizer.

---

**Owner:** TBD
**Created:** 2026-04-29
**Last updated:** 2026-04-29 — all T1 items **`[SELECTED 2026-04-29]`**.
**Status:** Drafted + **`[SELECTED 2026-04-29]`** — full tier (8 / 8 items).
