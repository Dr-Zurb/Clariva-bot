# Task voice-A5: Audio output device picker — speaker/earpiece toggle (mobile) + headset picker (desktop)

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch A (T1 quick wins) — **S item, ~5h (combined T1.6 + T1.7)**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Combines T1.6 (mobile speaker/earpiece toggle) + T1.7 (desktop output device picker) into one task because **they share the same hook** — `useAudioOutputDevice` wraps `HTMLMediaElement.setSinkId(deviceId)` and `navigator.mediaDevices.enumerateDevices()`. The UI surface differs (mobile = 2-state toggle button, desktop = dropdown of all output devices), but the underlying logic is identical.

Sub-batch C's [task-voice-C7](./task-voice-C7-bluetooth-airpods-relay.md) (T6.34 Bluetooth/AirPods auto-relay) extends this same hook with auto-detection of newly-connected devices.

**Estimated time:** ~5h combined (mobile toggle ~2h + desktop dropdown ~2h + shared hook ~1h).

**Status:** ✅ Shipped (2026-05-20).

**Depends on:** nothing.

**Source:** [T1 §T1.6](../../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md), [T1 §T1.7](../../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md); [decision §3](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-a-starts).

---

## Acceptance criteria

### Shared hook

- [x] **`frontend/hooks/useAudioOutputDevice.ts`**:
  - Returns `{ devices, current, setOutput, applyToElement, registerSinkElement, isSupported, enumerated, refresh }`.
  - Calls `navigator.mediaDevices.enumerateDevices()` filtered to `kind === 'audiooutput'`.
  - Subscribes to `navigator.mediaDevices.ondevicechange` to refresh on hot-plug (BT headset connects, USB headphones unplug).
  - `setOutput(deviceId)` calls `setSinkId` on every registered sink (Twilio remote `<audio>` via `registerSinkElement`).
  - **`isSupported = false`** when `'setSinkId' in HTMLMediaElement.prototype` is false (iOS Safari < 17, older Firefox). UI must gracefully degrade.

### Mobile (T1.6) — `<SpeakerEarpieceToggle>` component

- [x] **`frontend/components/consultation/SpeakerEarpieceToggle.tsx`**:
  - Two-state toggle: 🔈 (earpiece) ↔ 🔊 (speaker).
  - Default state: derived from current `setSinkId` value or persisted localStorage preference.
  - Click → calls `setOutput(deviceId)` for the appropriate device. On Android Chrome, `'speaker'` and `'communications'` are special device IDs; on most browsers, just enumerate and pick the device with `label` matching `'speaker'` / `'earpiece'` heuristically.
  - Falls back to a hint ("Switch output via your system controls") on `!isSupported`.
- [x] Mounts in mobile layouts (`VoiceConsultPreCall`, in-call header in `VoiceConsultRoom` when `<768px`).

### Desktop (T1.7) — `<AudioOutputPicker>` component

- [x] **`frontend/components/consultation/AudioOutputPicker.tsx`**:
  - Dropdown rendering all `devices` from the hook.
  - Selecting a device calls `setOutput(deviceId)`.
  - Shows current device with a checkmark.
  - Updates dynamically when `ondevicechange` fires (new headphones plugged in → appear in dropdown without page reload).
- [x] Mounts in desktop layouts (`VoiceConsultPreCall`, in-call header in `VoiceConsultRoom` when `≥768px`).

### Persisted preference

- [x] **localStorage `voice-output-device-id`** — last-selected device. On next call, hook tries to restore; if device is gone, falls back to system default.
- [x] Doctor + patient both preserve their own preference (separate localStorage keys per origin = automatic).

### iOS Safari fallback

- [x] **`isSupported === false`** → both components render a small hint: "Switch output via your system controls" with no toggle/dropdown. No errors, no broken UI.
- [ ] **Re-verify on iOS 17+** at PR time (decision §3) — manual QA pending.

### Manual smoke

- [ ] Desktop Chrome: dropdown lists all output devices; switching mid-call instantly routes audio.
- [ ] Plug in USB headphones mid-call → dropdown updates within 1s.
- [ ] Mobile Android Chrome: toggle switches between earpiece and loud speaker; setting persists across page reload.
- [ ] iOS Safari (any version): hint shows; no broken UI.
- [ ] BT headset already paired → appears in dropdown / works as expected.

### General

- [x] Type-check + lint clean.
- [x] No console errors in the unsupported branch.
- [x] Hook is unit-testable with mocked `navigator.mediaDevices` (`frontend/hooks/__tests__/useAudioOutputDevice.test.ts`, 8 tests).

---

## Out of scope

- **Bluetooth auto-relay detection.** That's [task-voice-C7](./task-voice-C7-bluetooth-airpods-relay.md). A5 ships the hook foundation; C7 adds the auto-detection layer.
- **Mic input device picker.** Out of scope; mic-input picker isn't in this batch (Plan T1 doesn't cover it).
- **Per-call output preference.** Out of scope; one global preference per device.
- **System-volume control from inside the app.** Out of scope; users adjust via OS.

---

## Files expected to touch

**Frontend:**

- `frontend/hooks/useAudioOutputDevice.ts` — **new** (~120 LOC).
- `frontend/components/consultation/SpeakerEarpieceToggle.tsx` — **new** (~60 LOC).
- `frontend/components/consultation/AudioOutputPicker.tsx` — **new** (~80 LOC).
- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edit** (~15 LOC mount, layout-conditional).

**Tests:**

- `frontend/hooks/__tests__/useAudioOutputDevice.test.ts` — **new** (~50 LOC).

**Backend / migrations:** none.

---

## Notes / open decisions

1. **Shared hook vs two hooks** — shared. The data layer is identical; only render differs.
2. **Why localStorage over per-session storage** — cross-call persistence; doctors prefer the same headset every consult.
3. **`setSinkId` deprecated?** — no. It's the W3C-spec way; iOS Safari just dragged feet.
4. **Decision §3** — iOS fallback is a hint, not a hidden control. Re-verify on iOS 17+ at PR time and update copy if `setSinkId` shipped.
5. **Mobile Android device IDs** — `'communications'` (earpiece) and `'speaker'` are special; if `enumerateDevices()` returns labeled devices, prefer those. Otherwise fall back to the special IDs.
6. **C7 (Bluetooth relay) extends this hook** — keep the hook clean and extensible; don't pre-bake C7 logic here.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch A](../Plans/plan-voice-consult-selected-features.md#sub-batch-a--polished-call-5-days)
- **Source items:** [T1 §T1.6](../../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md) + [T1 §T1.7](../../../../Product%20plans/voice-consult/plan-t1-voice-quick-wins.md)
- **Decision:** [§3 — iOS Safari `setSinkId` fallback](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-a-starts).
- **Future extender:** [task-voice-C7](./task-voice-C7-bluetooth-airpods-relay.md).

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** ✅ Shipped (2026-05-20); combined T1.6 + T1.7 because they share the hook.
