# Voice T1 — Quick wins (8 items, ~1.5 days)

## Lift the call from "basic MVP" to "feels like a proper telemed product" in a single short sprint

> **Roadmap reference:** [plan-00-voice-consult-roadmap.md](./plan-00-voice-consult-roadmap.md). T1 is the first slice; pre-approved in full during 2026-04-26 review.
>
> **Foundation:** [plan-05-voice-consultation-twilio.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-05-voice-consultation-twilio.md) — the audio-only Twilio room these items polish.

---

## Goal

Ship eight UX items that together move every voice call from "it works" to "it feels intentional". All eight live inside (or adjacent to) `frontend/components/consultation/VoiceConsultRoom.tsx`. **Zero backend changes. Zero schema changes. Zero new vendors.** ~1.5 days end-to-end.

---

## Status

`Drafted` — pre-approved by owner; **all 8 items SELECTED 2026-04-28** for the implementation batch tracked in [plan-voice-consult-selected-features.md](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md). See that file for sub-batch sequencing.

---

## What's in scope (all 8 items LOCKED)

> All 8 items below are marked **`[SELECTED 2026-04-28]`** — see [combined batch plan](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md) for sequencing into sub-batch A.

| # | Item | Effort | Touch points |
|---|------|--------|--------------|
| T1.1 | **`[SELECTED 2026-04-28]`** **Call duration timer** in header (`mm:ss`, monotonic from `connected` event). | XS (~30 min) | `VoiceConsultRoom.tsx` header. |
| T1.2 | **`[SELECTED 2026-04-28]`** **Pre-call mic check** — one screen before connect: "Can we hear you? [bar visualizer] · [Continue / Use a different mic]". | S (~3h) | New `VoiceConsultPreCall.tsx`; route `/c/voice/[sessionId]/page.tsx` mounts pre-call before VoiceConsultRoom. |
| T1.3 | **`[SELECTED 2026-04-28]`** **Network-quality indicator** — Twilio `Participant.networkQualityLevel` 0–5 → 4-bar icon next to the connection dot. Both sides. | S (~2h) | `VoiceConsultRoom.tsx` + new `frontend/hooks/useNetworkQuality.ts`. |
| T1.4 | **`[SELECTED 2026-04-28]`** **Local mic-level meter** — small bar next to mute button; pulses when local mic detects sound. Also catches OS-level mute that Twilio can't see. | S (~2h) | `VoiceConsultRoom.tsx` + new `frontend/lib/audio/mic-meter.ts` (Web Audio AnalyserNode). |
| T1.5 | **`[SELECTED 2026-04-28]`** **End-call confirmation** — "End the call? [Cancel / End]" modal on the End button. Doctor side bypass with shift-click for power users. | XS (~45 min) | `VoiceConsultRoom.tsx` controls bar. |
| T1.6 | **`[SELECTED 2026-04-28]`** **Speaker / Earpiece toggle** on mobile — `setSinkId('speaker')` vs default earpiece. iOS Safari + Chrome Android. | S (~3h) | `VoiceConsultRoom.tsx` + new `frontend/hooks/useAudioOutputDevice.ts`. |
| T1.7 | **`[SELECTED 2026-04-28]`** **Headset / output device picker** on desktop — `enumerateDevices` filtered to `audiooutput` → dropdown. | S (~2h) | Same `useAudioOutputDevice.ts` hook with desktop branch. |
| T1.8 | **`[SELECTED 2026-04-28]`** **Counterparty mute notification** — system message in companion chat ("Patient muted their mic" / "Doctor muted their mic"). | S (~2h) | `VoiceConsultRoom.tsx` (mute event broadcaster) + Plan 06's `consultation_messages.kind = 'system'` with new system_subtype `mute_changed`. |

---

## Non-goals (explicitly NOT in T1 — owned by later tiers)

- Pre-call **lobby** with clinic branding + countdown — that's T2 item 9 (lobby is bigger; pre-call mic check is T1.2 only).
- **Caller-card header** with patient demographics — T2 item 10.
- **Reconnection countdown UI** — T2 item 15.
- **Volume slider + amplitude boost** — T2 item 13.
- Any backend, schema, or DM-copy changes (other than reusing Plan 06's existing system-message channel for T1.8).

---

## Why each item is in T1

- **T1.1 timer** — both sides need it. Doctors bill on duration. Patients want the basic situational awareness every other voice/video product gives them.
- **T1.2 mic check** — eliminates ~80% of "I can't hear you" first-30-second moments. The cheapest reliability win we can ship.
- **T1.3 network bars** — when audio degrades, users immediately attribute it to the right side. Today they assume the doctor's mic is broken.
- **T1.4 mic meter** — the system-mute-vs-Twilio-mute disconnect is a real bug source on iOS in particular. A real-time meter is the only honest signal.
- **T1.5 end-call confirm** — one accidental mid-call tap (especially on mobile) kills a 20-minute consult. Cheap to add, hard to mis-build.
- **T1.6 speaker toggle** — patients hold the phone to their ear by default; speakerphone is one tap away on every other phone-call app. Parity expectation.
- **T1.7 desktop output picker** — doctor with AirPods + monitor speakers needs to pick. Very common in clinic environments.
- **T1.8 counterparty mute notification** — closes the "did the call drop or did they mute?" silence-anxiety loop without an extra UI element (reuses companion chat as the notification surface).

---

## Implementation contract per item

### T1.1 — Call duration timer

```ts
// In VoiceConsultRoom.tsx header
const connectedAt = useRef<number | null>(null);
useEffect(() => {
  if (state === 'connected' && connectedAt.current === null) {
    connectedAt.current = Date.now();
  }
}, [state]);

// Render via setInterval(1000) → mm:ss in the header pill.
// Pause display (but not the underlying timestamp) on `reconnecting`.
// Stop on `disconnected`; final value passed to T4 post-call summary later.
```

### T1.2 — Pre-call mic check

```
frontend/components/consultation/VoiceConsultPreCall.tsx (NEW)

Renders:
  - Microphone permission request (driven by getUserMedia({ audio: true }))
  - Live AnalyserNode level bar
  - Device dropdown (enumerateDevices, audioinput only)
  - "Continue → join call" CTA, disabled until permission granted + level seen
  - "Skip mic check" link (telemetry-only; goes straight to VoiceConsultRoom)

Mount order in /c/voice/[sessionId]/page.tsx:
  1. PatientGate (HMAC + JWT exchange) — already exists
  2. NEW: <VoiceConsultPreCall onReady={token => setReady(true)} />
  3. <VoiceConsultRoom ... /> — only after onReady fires

Doctor side: same pre-call screen mounted by ConsultationLauncher before
VoiceConsultRoom takes over the canvas.
```

### T1.3 — Network-quality indicator

```ts
// frontend/hooks/useNetworkQuality.ts (NEW)
export function useNetworkQuality(room: Room | null): {
  local: 0 | 1 | 2 | 3 | 4 | 5;
  remote: 0 | 1 | 2 | 3 | 4 | 5;
} {
  // Subscribes to room.localParticipant.on('networkQualityLevelChanged', ...)
  // and to room.participants.forEach((p) => p.on('networkQualityLevelChanged', ...))
  // Returns the latest values; remote is "the patient" for doctor view and vice versa.
}

// In VoiceConsultRoom header pill:
//   <NetworkBars value={local} title="Your connection" />
//   <NetworkBars value={remote} title="Their connection" />
//
// Component is a 4-bar SVG; renders 0..5 → 0..4 visible bars. Color:
//   5–4: green; 3: amber; 2: orange; 1–0: red.
```

### T1.4 — Local mic-level meter

```ts
// frontend/lib/audio/mic-meter.ts (NEW)
// Wraps AnalyserNode → returns a normalized 0..1 value via rAF.
// Hook returns the value; the component renders a horizontal bar that fills
// proportionally next to the Mute button.
//
// IMPORTANT: when locally muted, the meter must show "0" — but should ALSO
// flash a hint "You're muted" if it sees raw mic activity above threshold
// while muted (because the user is talking but the other side can't hear).
// Cheap accessibility/UX win.

export function useMicMeter(track: LocalAudioTrack | null): number;
```

### T1.5 — End-call confirmation

```ts
// In VoiceConsultRoom.tsx — wrap the End button click handler:
const handleEndClick = useCallback((e: ReactMouseEvent) => {
  if (e.shiftKey && role === 'doctor') {
    // Power-user bypass; documented in tooltip.
    void disconnect();
    return;
  }
  setShowEndConfirm(true);
}, [role, disconnect]);

// Modal copy:
//   "End the call?"
//   "[Cancel] [End the call]"
//   "Tip: hold Shift while clicking to skip this confirmation."
//   (last line doctor-side only)
```

### T1.6 + T1.7 — Speaker / earpiece toggle (mobile) + output device picker (desktop)

```ts
// frontend/hooks/useAudioOutputDevice.ts (NEW)
// Detects platform; renders different UI affordances but funnels through one
// API:
export function useAudioOutputDevice(audioEl: HTMLAudioElement | null): {
  devices: MediaDeviceInfo[];           // empty on iOS Safari (no enumerateDevices for output)
  current: string | null;               // sinkId
  setCurrent: (sinkId: string) => Promise<void>;
  // Special mobile-only enum forced by feature detection:
  speakerphone: 'on' | 'off' | null;    // null when desktop or not supported
  toggleSpeakerphone: () => Promise<void>;
}

// On mobile: speakerphone toggle button appears (one button, two states).
// On desktop: dropdown of output devices appears.
// On iOS Safari (no setSinkId): falls back to AVAudioSession default routing
// note in a tooltip: "Use the system audio menu to change output."
```

### T1.8 — Counterparty mute notification

```ts
// In VoiceConsultRoom.tsx — when local mute toggles:
//   1. Mute the local track (already exists).
//   2. Send a Plan 06 system message via the companion chat channel:
//      kind = 'system'
//      system_subtype = 'mute_changed'   // (extend the enum in plan-06)
//      payload = { muted: boolean, role: 'doctor' | 'patient' }
//
// On the receive side, TextConsultRoom already renders system messages
// inline (Plan 06 Task 24 ships this surface). No new render path.
//
// Copy:
//   "Patient muted their mic" / "Patient unmuted their mic"
//   "Doctor muted their mic" / "Doctor unmuted their mic"
//
// Renders inline in the companion chat (no toast, no overlay) — minimum
// disruption, maximum signal, zero extra UI surface.
```

---

## Acceptance criteria

- [ ] **T1.1** — duration timer ticks every 1s once connected, pauses display while `reconnecting`, stops on disconnect; visual placement passes a 30-second design-eyeball test.
- [ ] **T1.2** — patient (and doctor) cannot enter the room without either granting mic permission OR explicitly tapping "Skip mic check" (telemetry-tracked); pre-call level bar reacts within 100 ms of speaking.
- [ ] **T1.3** — network bars update within 1 s of Twilio `networkQualityLevelChanged`; both local and remote bars render; tooltip explains which is which.
- [ ] **T1.4** — mic meter ticks at ≥30 fps; "You're muted but speaking" hint fires within 500 ms of speaking-while-muted.
- [ ] **T1.5** — end-call modal blocks accidental taps; doctor-side shift-click bypass works; tooltip mentions the bypass.
- [ ] **T1.6** — mobile speaker toggle flips between earpiece and speakerphone on iOS Safari + Chrome Android (verified on at least one device each).
- [ ] **T1.7** — desktop dropdown lists every audio output device; switching takes effect within 500 ms; choice persists for the duration of the room (not across rooms in v1).
- [ ] **T1.8** — counterparty mute event surfaces in companion chat as a `system` message within 1 s of the toggle; works in both directions; survives a participant reconnect (state re-sync on rejoin).
- [ ] No regression on existing voice flow (mute, end, recording controls, companion chat, "patient hasn't joined" surface).
- [ ] Frontend type-check + lint clean.
- [ ] Manual smoke: doctor + patient on different devices for a 5-min call exercises every T1 item without hitting a console error.

---

## Files expected to touch

**Frontend (only):**

- `frontend/components/consultation/VoiceConsultRoom.tsx` (**extend**) — every item touches this.
- `frontend/components/consultation/VoiceConsultPreCall.tsx` (**new**, T1.2).
- `frontend/components/consultation/NetworkBars.tsx` (**new**, T1.3) — 4-bar SVG component.
- `frontend/components/consultation/MicMeterBar.tsx` (**new**, T1.4) — horizontal level bar.
- `frontend/hooks/useNetworkQuality.ts` (**new**, T1.3).
- `frontend/hooks/useAudioOutputDevice.ts` (**new**, T1.6 + T1.7).
- `frontend/lib/audio/mic-meter.ts` (**new**, T1.4).
- `frontend/app/c/voice/[sessionId]/page.tsx` (**extend**, T1.2 mount order).

**Plan 06 enum touch (single line):**

- `consultation_messages.system_subtype` → add `'mute_changed'`. Owned formally by Plan 06; T1.8 is the first consumer.

**No backend changes. No schema changes. No DM copy changes.**

---

## Open questions / decisions for during implementation

1. **Where exactly does the pre-call mic check live in the route flow?** Recommendation: dedicated component mounted by `/c/voice/[sessionId]/page.tsx` BEFORE `<VoiceConsultRoom>`. Doctor side: mounted by `<ConsultationLauncher>` BEFORE the canvas hands off to VoiceConsultRoom.
2. **Should the Patient view "their" network bars or "doctor's"?** Recommendation: show BOTH labelled — patient understands "your wifi vs theirs" intuitively if labelled; obscured if not.
3. **iOS Safari quirk on `setSinkId`** — Safari iOS doesn't expose audio output device enumeration. T1.6 fallback: show a "use system controls" hint tooltip. Verify on iOS 17+ at PR time (the table is still moving in WebKit).
4. **Mute system-message volume** — too many mute toggles can spam the chat. Recommendation: debounce — collapse mute+unmute within 5 s into a single message ("Patient briefly muted their mic"). Calibrate on real usage.
5. **End-call confirmation default behaviour** — should it default to "Cancel" focus or "End"? Recommendation: focus stays on Cancel (safer default for an irreversible action).

---

## References

- [plan-00-voice-consult-roadmap.md](./plan-00-voice-consult-roadmap.md)
- [plan-05-voice-consultation-twilio.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-05-voice-consultation-twilio.md)
- [plan-06-companion-text-channel.md](../../Daily-plans/April%202026/19-04-2026/Plans/plan-06-companion-text-channel.md) — system-message surface used by T1.8.
- Twilio Video JS SDK — `Participant.networkQualityLevel`, `RemoteAudioTrack.setSinkId`, `LocalAudioTrack.disable`/`.enable`.
- Web Audio API — `AnalyserNode` for T1.4 + T1.2 visualizers.

---

**Owner:** TBD  
**Created:** 2026-04-27  
**Status:** Drafted; pre-approved in full during 2026-04-26 review. **All 8 items SELECTED 2026-04-28** — see [combined batch plan](../../Daily-plans/April%202026/28-04-2026/plan-voice-consult-selected-features.md). Sequenced into sub-batch A.
