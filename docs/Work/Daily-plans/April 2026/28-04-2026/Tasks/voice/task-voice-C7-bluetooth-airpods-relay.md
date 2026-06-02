# Task voice-C7: Bluetooth / AirPods auto-relay detection + UI

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch C (production-grade) — **M item, ~2 days**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

When a user connects AirPods / Bluetooth headphones mid-call, the audio doesn't auto-relay; user has to fumble through OS settings. T6.34 detects new audio devices via `navigator.mediaDevices.ondevicechange` AND surfaces a small toast: "AirPods detected — Switch?" with a one-tap action.

**Extends [task-voice-A5](./task-voice-A5-audio-output-device-picker.md)** — A5 ships the `useAudioOutputDevice` hook; C7 adds the auto-detection layer + toast.

**Estimated time:** ~2 days.

**Status:** Done.

**Depends on:** [task-voice-A5](./task-voice-A5-audio-output-device-picker.md) — hard (extends).

**Source:** [T6 §T6.34](../../../../Product%20plans/voice-consult/plan-t6-voice-mobile-native.md).

---

## Acceptance criteria

### `frontend/lib/audio/output-router.ts` (Bluetooth label heuristics)

- [x] **New module** exporting:
  - `isBluetoothDevice(device: MediaDeviceInfo): boolean` — heuristic match on `device.label`:
    - Contains "AirPods" → true.
    - Contains "Bluetooth" / "BT" → true.
    - Contains "Headphones" + matches a known BT brand prefix → true.
    - (Fallback: if `MediaDeviceInfo` exposes a future `transport` field per W3C, use that.)
  - `isPreferredOutput(device, prevDevice): boolean` — true if the new device is "promotion-worthy" (BT > wired headphones > built-in speaker).

### Extend `useAudioOutputDevice` hook (from A5)

- [x] **Extend** to expose:
  - `newDeviceJustConnected: MediaDeviceInfo | null` — set when `ondevicechange` fires AND a new device appears that's `isBluetoothDevice` AND wasn't in the previous enumeration.
  - Cleared after 30s OR on user dismissal of the toast.

### `<NewOutputToast>` component

- [x] **New component** (e.g. inline in `<VoiceConsultRoom>` or `frontend/components/consultation/NewOutputToast.tsx`):
  - Auto-shows when `newDeviceJustConnected` is non-null.
  - Copy: `"AirPods detected — switch?"` (or `"Bluetooth headset detected — switch?"`).
  - Buttons: `[Switch]` (primary) → calls `setOutput(newDevice.deviceId)`; `[Dismiss]` (ghost).
  - Auto-dismiss after 10s.
  - Animated slide-in from top; non-blocking.

### Mount in `<VoiceConsultRoom>`

- [x] **Edit** to mount `<NewOutputToast>`. Mount only during active call (not in lobby, not in readonly).

### Manual smoke

- [ ] During call, connect AirPods / BT headphones → toast appears within 2s. *(manual smoke)*
- [ ] Click `[Switch]` → audio routes to BT device immediately. *(manual smoke)*
- [ ] Click `[Dismiss]` → toast unmounts; no auto-route. *(manual smoke)*
- [ ] Disconnect BT mid-call → audio routes to next available output (handled by OS; verify smooth fallback). *(manual smoke)*
- [x] iOS Safari behavior — verify; AirPods are typically auto-routed by iOS at the OS level. The toast may be redundant on iOS; consider gating to Android. *(gated via `shouldOfferBluetoothRelayPrompt` — iPhone/iPad/iPod UA)*
- [x] Doctor side: same toast, same UX. *(mounted in `<VoiceConsultRoom>` for doctor + patient in-call)*

### General

- [x] Type-check + lint clean.
- [x] No console errors on devicechange.
- [x] Heuristic tests for `isBluetoothDevice` covering AirPods + BT + non-BT cases.

---

## Out of scope

- **Auto-switch (no toast)** — too aggressive; users may not want the switch. Always confirm.
- **Mic-input auto-switch.** Out of scope.
- **Per-device preference memory.** Out of scope (A5 already persists last-selected output).
- **iOS native auto-route override** — iOS handles this OS-side; toast may be redundant. Document.

---

## Files expected to touch

**Frontend:**

- `frontend/lib/audio/output-router.ts` — **new** (~80 LOC).
- `frontend/hooks/useAudioOutputDevice.ts` — **edit** (~30 LOC: extend with `newDeviceJustConnected`).
- `frontend/components/consultation/NewOutputToast.tsx` — **new** (~80 LOC).
- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edit** (~10 LOC: mount toast).

**Tests:**

- `frontend/lib/audio/__tests__/output-router.test.ts` — **new** (~40 LOC; label heuristic cases).

---

## Notes / open decisions

1. **Why label heuristics** — Web APIs don't expose transport type cleanly. Heuristics work for common BT devices; flag for future when W3C ships transport field.
2. **Why toast not auto-switch** — surprise audio routing is hostile UX, especially mid-clinical-conversation.
3. **iOS redundancy** — flag at PR time; consider gating toast off on iOS UA.
4. **Promotion preference order** — BT > wired headphones > built-in. Used by `isPreferredOutput`; demote heuristic could prevent demoting from BT to built-in unwanted-ly.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch C](../Plans/plan-voice-consult-selected-features.md#sub-batch-c--production-grade-17-days)
- **Source item:** [T6 §T6.34](../../../../Product%20plans/voice-consult/plan-t6-voice-mobile-native.md)
- **Hard dep:** [task-voice-A5](./task-voice-A5-audio-output-device-picker.md).

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** Done.
