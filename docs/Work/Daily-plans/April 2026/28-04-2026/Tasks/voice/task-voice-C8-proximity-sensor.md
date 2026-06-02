# Task voice-C8: Proximity sensor auto-screen-off (Chrome Android only)

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch C (production-grade) — **M item, ~3 days**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

When the patient holds their phone to their ear during a voice call (PSTN-style), the screen should turn off — both to save battery and to prevent cheek-touches from triggering accidental UI actions.

Browsers don't expose the proximity sensor directly, but `navigator.wakeLock` + visibility-tracking + `DeviceOrientation` events can approximate the behavior. **Chrome Android only** has the necessary APIs reliably; iOS Safari + Firefox degrade silently (no screen-off, but no error).

**Estimated time:** ~3 days (sensor research + flaky-API handling).

**Status:** Done.

**Depends on:** nothing.

**Source:** [T6 §T6.37](../../../../Product%20plans/voice-consult/plan-t6-voice-mobile-native.md).

---

## Acceptance criteria

### `useProximityWakeLock(active)` hook

- [x] **New hook** at `frontend/hooks/useProximityWakeLock.ts`:
  - Input: `active: boolean` (typically `inCall && !mutedOutput`).
  - Behavior:
    - Acquires a `'screen'` wakeLock when `active === true` (keeps screen on otherwise).
    - Subscribes to `Sensor` API or `devicemotion` / `deviceorientation` for proximity hints.
    - When proximity detected (phone close to face): releases the wakeLock AND optionally calls `navigator.serviceWorker` to dim the screen (if possible).
    - When proximity gone (phone away from face): re-acquires wakeLock.
  - Cleanup: releases wakeLock on unmount.

### Browser detection + graceful degradation

- [x] **`isSupportedPlatform()` check** — Chrome Android UA + sensor APIs available. iOS / Firefox / Safari → return `noop` hook (returns `null`, sets nothing).
- [x] On unsupported platforms: log once at debug level; never error.

### Wire into `<VoiceConsultRoom>`

- [x] **Edit** to call `useProximityWakeLock(inCall)` — wakeLock active during call.
- [x] **`mode='readonly'`** — never active.

### Manual smoke

- [ ] Patient on Chrome Android, in call, phone away from face → screen stays on (wakeLock).
- [ ] Hold phone to ear → screen dims/off within 1s; touch events suspended.
- [ ] Move phone away → screen wakes back; touch events resumed.
- [ ] Patient on iOS Safari → behavior degrades silently; screen behaves normally; no errors.
- [ ] Doctor side — the hook is mounted but typically irrelevant (doctor on laptop). No-op effectively.
- [ ] After call ends, wakeLock released; screen times out per OS default.

### General

- [x] Type-check + lint clean.
- [x] No console errors on unsupported platforms.
- [x] Hook unit-testable with mocked Sensor APIs.

---

## Out of scope

- **iOS proximity sensor implementation.** iOS doesn't expose; out of scope.
- **Battery-level optimization.** Out of scope; wakeLock is the lever.
- **Screen-orientation lock during proximity.** Out of scope.
- **Native shell with full proximity API.** Out of scope.

---

## Files expected to touch

**Frontend:**

- `frontend/hooks/useProximityWakeLock.ts` — **new** (~150 LOC including platform detection).
- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edit** (~5 LOC: hook call).

**Tests:**

- `frontend/hooks/__tests__/useProximityWakeLock.test.ts` — **new** (~50 LOC; mocked sensors).

---

## Notes / open decisions

1. **Why Chrome Android only** — only platform with reliable wakeLock + sensor APIs. iOS Safari is deliberately gated by Apple; revisit on iOS spec changes.
2. **WakeLock API** — `navigator.wakeLock.request('screen')` is well-supported on Chrome.
3. **Proximity proxy via accelerometer** — if direct sensor unavailable, accelerometer Z-axis + ambient light (if any) gives approximation. Effort cost is real; budget the 3 days.
4. **Doctor side hook is no-op** — that's fine; the cost is one early-return on platform check.
5. **No native shell required** — PWA-only.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch C](../Plans/plan-voice-consult-selected-features.md#sub-batch-c--production-grade-17-days)
- **Source item:** [T6 §T6.37](../../../../Product%20plans/voice-consult/plan-t6-voice-mobile-native.md)

---

**Owner:** TBD
**Created:** 2026-04-29
**Status:** Done (2026-05-20); mobile-only, may degrade on iOS. Manual smoke on Chrome Android still pending.
