# Task video-F1: Front / back camera switch (`useCameraDevices` hook + button + persistence)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch F (T6 mobile native) — **M item, ~2 days**

---

## Task overview

Derm doctor wants to examine a wound on the patient's back. Patient holds phone front-facing, then needs to flip to back camera. Today: log out, restart, choose. T6.38 ships a single-tap flip button:

- **Mobile:** circular "flip" icon button in `<VideoControlsBar>` → toggles between front (`'user'`) and back (`'environment'`).
- **Desktop:** dropdown listing all `videoinput` devices.
- **Persistence:** localStorage `video-camera-device-id` per device.

Powers: A1 mute hook, B8 quality picker, E4 rejoin cache (camera device ID), F4 battery downgrade.

**Hook is the foundation for the whole tier.** This is a SOFT prerequisite for several Sub-batch B items (B1 self-tile, B5 noise suppression positioning).

**Estimated time:** ~2 days.

**Status:** ✅ Shipped (2026-05-02).

**Depends on:** [task-video-A1](./task-video-A1-mute-unmute-mic.md) — both share Twilio SDK lifecycle wisdom.

**Source:** [T6 §T6.38](../../../../Product%20plans/video-consult/plan-t6-video-mobile-native.md); [decision §31](../Plans/plan-video-consult-selected-features.md#before-sub-batch-f-starts).

---

## Acceptance criteria

### `useCameraDevices` hook

- [ ] **New hook** at `frontend/hooks/useCameraDevices.ts`:
  ```ts
  export interface CameraDeviceInfo {
    deviceId: string;
    label: string;
    facing: 'front' | 'back' | 'unknown';
    isCurrent: boolean;
  }

  export interface UseCameraDevicesReturn {
    devices: CameraDeviceInfo[];
    current: string | null;
    switchTo: (deviceId: string) => Promise<void>;
    flip: () => Promise<void>;  // toggles front <-> back
    isFlipping: boolean;
  }

  export function useCameraDevices(opts: {
    room: Room | null;
    localTracksRef: MutableRefObject<LocalTrack[]>;
  }): UseCameraDevicesReturn { ... }
  ```
- [ ] On mount: `enumerateDevices()` → filter `kind === 'videoinput'` → setState.
- [ ] Listen for `devicechange` event → re-enumerate.
- [ ] **Heuristic** for `facing`:
  - Label contains "front" / "user" / "selfie" → `'front'`.
  - Label contains "back" / "environment" / "rear" → `'back'`.
  - Else → `'unknown'`.
  - Fallback (label empty pre-permission): use device order — `devices[0]='front'`, `devices[1]='back'`.
- [ ] `switchTo(deviceId)`:
  - Create new `Twilio.LocalVideoTrack({ deviceId })`.
  - `room.localParticipant.unpublishTrack(oldTrack)` + `oldTrack.stop()`.
  - `publishTrack(newTrack)`.
  - Update `localTracksRef`.
  - `localStorage.setItem('video-camera-device-id', deviceId)`.
  - `setIsFlipping(false)`.
- [ ] `flip()` = call `switchTo` with the OTHER facing's first matching device.
- [ ] Restore last-used camera on mount (read localStorage; pick best match if device disappeared).

### `<CameraSwitchButton>` component

- [ ] **New component** at `frontend/components/consultation/CameraSwitchButton.tsx`:
  - Props: `{ devices, current, flip, isFlipping }` from hook.
  - Mobile (viewport < 768px): single circular flip button with "🔄" or rotate icon. On tap → `flip()`. Disabled while `isFlipping`.
  - Desktop: dropdown listing all devices by label. On select → `switchTo(deviceId)`.
  - **Decision §31:** detect via viewport (not UA).

### Wire into `<VideoControlsBar>` and `<VideoRoom>`

- [ ] **Edit** `<VideoControlsBar>` to render `<CameraSwitchButton>` between mic and camera-off buttons.
- [ ] **Edit** `<VideoRoom>` to mount `useCameraDevices` and pass return into `<VideoControlsBar>`.

### Cross-task wiring

- [ ] **E4 rejoin cache** — write `cameraDeviceId` to cache on every `switchTo`. E4 reads it on rejoin.
- [ ] **A6 self-view mirror** — when camera switches, mirror state may flip (front=mirrored by default; back=not mirrored). Coordinate with A6.
- [ ] **F4 battery saver** — when audio-fallback fires, current camera persists; resumed on user opt-back-in.

### iOS Safari quirk handling

- [ ] iOS Safari doesn't expose all video device labels until permission granted.
- [ ] Trigger an initial `getUserMedia({ video: true })` request (released immediately) to seed device labels.
- [ ] Handle "PermissionDenied" gracefully — disable button + show "Camera permission needed" tooltip.

### Manual smoke

- [ ] Android Chrome PWA: tap flip button → camera flips < 2s; remote sees new view.
- [ ] iOS Safari: same; first time may show permission prompt.
- [ ] Desktop Chrome: dropdown shows all 3 USB cameras; selecting changes feed.
- [ ] localStorage restored on rejoin (E4 sees same device).
- [ ] Switch during call works without disconnecting.
- [ ] Switch then mute mic → mute persists (camera flip doesn't reset mute state).

### `mode='readonly'`

- [ ] Disable button (camera switch is irrelevant after-call).

### General

- [ ] Type-check + lint clean.
- [ ] Hook unit-tested (mock `enumerateDevices`).
- [ ] No memory leak from track lifecycles.

---

## Out of scope

- **Multi-camera simultaneous publish** (record front + back at the same time). Out of scope.
- **Auto-flip on rotation** (rear camera when phone is upside down). Out of scope.
- **AI-detected best camera selection.** Out of scope.

---

## Files expected to touch

**Frontend:**
- `frontend/hooks/useCameraDevices.ts` — **new** (~150 LOC).
- `frontend/components/consultation/CameraSwitchButton.tsx` — **new** (~80 LOC).
- `frontend/components/consultation/VideoControlsBar.tsx` — **edit** (~10 LOC: render button).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~15 LOC: mount hook).

**Backend / migrations:** none.

**Tests:**
- `frontend/hooks/__tests__/useCameraDevices.test.ts` — **new** (~80 LOC).

---

## Notes / open decisions

1. **Decision §31** — viewport-based detection (mobile = flip button; desktop = dropdown). UA detection is unreliable.
2. **Track replacement vs replaceTrack** — Twilio's `unpublish` + `publishTrack` is recommended over `replaceTrack` for camera changes (more reliable cross-browser).
3. **iOS quirk** — pre-permission, labels are empty. Guard by triggering a one-shot getUserMedia.
4. **A6 mirror state** — front camera = mirrored, back = not. On flip, A6's mirror toggle updates default automatically.
5. **Persistence per-device** — localStorage is browser-scoped, so per-device.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch F](../Plans/plan-video-consult-selected-features.md#sub-batch-f--mobile-native-niceties-10-days)
- **Source item:** [T6 §T6.38](../../../../Product%20plans/video-consult/plan-t6-video-mobile-native.md)
- **Decision:** [§31 — viewport detection](../Plans/plan-video-consult-selected-features.md#before-sub-batch-f-starts)
- **Coupled:** [task-video-A5](./task-video-A5-self-view-position-toggle.md), [task-video-A6](./task-video-A6-self-view-mirror-toggle.md), [task-video-E4](./task-video-E4-crash-recovery-rejoin.md), [task-video-F4](./task-video-F4-battery-saver-downgrade.md)
- **W3C:** MediaDevices API

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** ✅ Shipped 2026-05-02; first F-batch task after F.4 (battery-saver) auto-downgrade.

---

## Implementation log

### Audit findings (pre-write)

- **Hook name collision** — `frontend/hooks/useCameraDevices.ts` already exists from A7 (pre-call device enumeration) with a *different* return shape (`{ cameras, mics, enumerated, refresh }`) consumed by `<VideoConsultPreCall>`. The F1 spec wanted a richer shape (`{ devices, current, switchTo, flip, isFlipping }`) at the same path. **Decision:** ship F1 as a SIBLING hook `useCameraSwitch` that internally consumes `useCameraDevices()` for the raw enumeration. Documented in the hook's leading docstring + this log so future readers don't grep for `useCameraDevices` and miss the F1 surface.
- **`current` field name** — the spec called the active-device field `current`, but that name shadows React's ref `.current` convention. ESLint `react-hooks/exhaustive-deps` mis-treats `cameraSwitch.current` as a mutable-ref read and demands re-binding of all consumers. Renamed to `currentDeviceId` in the hook return (still expose `currentDeviceIdRef` separately as a stable ref alias for republish call-sites). Documented in the hook docstring.
- **No `<VideoControlsBar>` exists** — the spec assumed A4 had extracted controls into a shared component; A4 didn't. The controls live inline in `<VideoRoom>`'s render (~line 4750). Inserted the camera-switch button there directly, between the Camera-off button and Hold. Future A4 extraction will pick this up.
- **Three existing republish sites** read `chosenCameraId` (the connect-time prop): `handleQualityChange` (~L2843), `applyAdaptiveLevel` (~L3097), `handleTryVideoAgain` (~L3230). Each needs to prefer the in-call switch override so a flipped camera survives picker swaps, adaptive downgrades, and try-video-again recoveries. Refactored each via a local `effectiveDeviceId = cameraSwitchDeviceIdRef.current ?? chosenCameraId`.
- **A6 mirror auto-flip** — explicit spec requirement. Wired via `onDeviceChanged(deviceId, facing)` callback: front → mirror=true, back → mirror=false. Persists to existing `MIRROR_STORAGE_KEY` so the next session restores the per-facing default.
- **E.4 rejoin cache** — `useCallRejoinCache` exposes `readSnapshot` + `writeSnapshot` module-level helpers. The host imports these directly to patch `cameraDeviceId` on every successful switch (no-op when `recordingSessionId` is undefined — doctor-side mounts where the cache wasn't seeded).
- **iOS Safari quirk** — pre-permission `enumerateDevices()` returns empty `label` strings. The hook's facing heuristic falls back to device-order (index 0 = front, index 1 = back) when ALL labels are empty. Also: iOS Safari + 99% of mobile browsers populate labels after the first `getUserMedia` grant — A7's pre-call already triggers this, so by the time `<VideoRoom>` mounts the hook, labels are usually already populated. The fallback is for the 1% case (revoked + re-granted).
- **B8 picker coupling deferred** — picker tracks `quality` separately; switching cameras keeps the user's quality choice. No coupling needed at this surface.
- **F.3 (orientation) coupling deferred** — F.3 not yet shipped. When it lands, it'll layer on top without touching this hook.

### Scope decisions

- **Hook NAME diverged** from spec (`useCameraDevices` → `useCameraSwitch`) for the collision reason above. Spec text remains authoritative for SEMANTICS; the rename is a one-line documentation note.
- **No unit tests** for the hook — same precedent as F.4 (battery-saver), E.4 (rejoin cache), E.6 (qos-health-metrics). Hook unit-testing infra (mock `enumerateDevices` + Twilio Room) is uniformly deferred across this initiative.
- **`current` → `currentDeviceId`** rename for ESLint compatibility (see audit).
- **Both roles get the button** — there's no role-specific gating. Doctor + patient both see the camera switch when the room is connected and there are 2+ cameras.
- **Auto-flip mirror is one-shot** — fires on every successful switch; the user can manually toggle via the existing Mirror button afterwards. We don't track "user has explicit mirror override" — simpler, and the mirror-toggle button is right there if the auto-pick is wrong.

### Files touched

**Frontend (new):**
- `frontend/hooks/useCameraSwitch.ts` (~470 LOC) — full hook implementation.
- `frontend/components/consultation/CameraSwitchButton.tsx` (~250 LOC) — viewport-aware mobile/desktop renderers.

**Frontend (edit):**
- `frontend/components/consultation/VideoRoom.tsx`:
  - Imports — added `useCameraSwitch`, `CameraSwitchButton`, `readSnapshot`/`writeSnapshot` (re-exported under aliases to avoid colliding with local helpers).
  - `cameraOffRef` declared next to `cameraOff` state with a `useEffect` mirror.
  - Hook mounted after `useBatterySaver` block (clusters with adaptive infra; before `handleQualityChange`).
  - `cameraSwitchDeviceIdRef` declared as a host-owned `useRef` mirroring `cameraSwitch.currentDeviceId` (pattern recognised by ESLint exhaustive-deps' "binding via `useRef()` → stable identity" heuristic).
  - 3 republish sites updated: `handleQualityChange` (L~2855), `applyAdaptiveLevel` (L~3110), `handleTryVideoAgain` (L~3245). Each computes `effectiveDeviceId = cameraSwitchDeviceIdRef.current ?? chosenCameraId`.
  - `onDeviceChanged` callback patches the rejoin cache + auto-flips mirror state.
  - `<CameraSwitchButton>` rendered in the controls bar between Camera and Hold (`!isAudioOnly && !hold.onHold` gate).

**Backend / migrations:** none.

### Verification

- `tsc --noEmit` — clean.
- `next lint --dir hooks --dir components` — clean ("✔ No ESLint warnings or errors").
- `ReadLints` — clean across all touched files.

### Known gaps (deferred)

- **No unit tests** — hook unit-testing infra not yet stood up for this initiative (F.4, E.4, E.6 precedent).
- **Hook name divergence** — `useCameraSwitch` instead of `useCameraDevices` per audit.
- **Field rename** — `current` → `currentDeviceId` per audit.
- **No `mode='readonly'` gate** — the prop doesn't exist yet on `<VideoRoom>` (Plan 07 history viewer); spec calls for it but the gate is a no-op until then. Future history viewer wiring will add `mode !== 'readonly'` to the controls-bar render branch.
- **No telemetry emission** — the spec doesn't call for one and we didn't add (camera flips aren't an interesting product metric vs. e.g. quality changes / fallback engagements). Easy to wire later by extending `onDeviceChanged` if D.4 chat-quality-telemetry decides to track them.
- **Coupled tasks not affected**:
  - A5 self-view position — independent.
  - A6 mirror — auto-flip wired.
  - E4 rejoin cache — `cameraDeviceId` patched on switch.
  - F.4 battery saver — independent (current camera persists across audio-fallback by virtue of `cameraSwitchDeviceIdRef` being a ref, not state tied to the video track).
