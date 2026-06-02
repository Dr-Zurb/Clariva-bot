# Task video-F4: Battery-saver auto-downgrade (15% prompt + 5% force)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch F (T6 mobile native) — **S item, ~3h**

---

## Task overview

Long video consults eat battery. Patient on a cab to the consult with 10% battery will be furious if the call dies mid-conversation. T6.41 ships:

- **At < 15% AND not charging:** show one-time prompt "Battery is low. Switch to audio-only to save power?" with [Switch] [Keep video] options.
- **At < 5%:** force audio-only via E2's auto-fallback path; show banner "Battery critical — switched to audio-only."
- **On chargingchange (charger plugged in):** dismiss prompt; if was forced, allow re-enabling video.

Reuses E2's auto-fallback infrastructure. Adds new Plan 06 enum value `'battery_audio_fallback'` (or reuses E2's `'auto_audio_fallback'` with `metadata.reason = 'battery_critical'`).

**Cheapest item in Sub-batch F.**

**Estimated time:** ~3h.

**Status:** ✅ Shipped (2026-05-02).

**Depends on:** [task-video-E2](./task-video-E2-auto-audio-fallback.md) — HARD (reuses fallback action + banner pattern).

**Source:** [T6 §T6.41](../../../../Product%20plans/video-consult/plan-t6-video-mobile-native.md); [decision §34](../Plans/plan-video-consult-selected-features.md#before-sub-batch-f-starts).

---

## Acceptance criteria

### `useBatterySaver` hook

- [ ] **New hook** at `frontend/hooks/useBatterySaver.ts`:
  ```ts
  export interface UseBatterySaverOpts {
    onPromptLow: () => void;     // < 15%, not charging
    onForceLow: () => void;      // < 5%, not charging
    onRecover: () => void;       // charging or > 20%
  }

  export interface UseBatterySaverReturn {
    supported: boolean;
    level: number | null;        // 0-1 or null if unsupported
    charging: boolean | null;
  }

  export function useBatterySaver(opts: UseBatterySaverOpts): UseBatterySaverReturn { ... }
  ```
- [ ] On mount: `'getBattery' in navigator` check.
- [ ] If supported: `(navigator as any).getBattery()` → register `levelchange` + `chargingchange` listeners.
- [ ] Internal state: `hasPrompted: boolean`, `hasForced: boolean` (debounce).
- [ ] On unmount: remove listeners.

### Reuse E2 audio-fallback action

- [ ] **Import** `autoDowngradeToAudio({ reason })` from E2.
- [ ] On force-low: call with `reason: 'battery_critical'`.
- [ ] On user clicking "Switch" in prompt: same call with `reason: 'battery_low'`.
- [ ] System-message metadata distinguishes battery vs bandwidth fallback.

### `<BatteryWarningBanner>` component

- [ ] **New component** at `frontend/components/consultation/BatteryWarningBanner.tsx`:
  - Two modes: `'prompt'` (15%) and `'forced'` (5%).
  - `'prompt'` mode: modal-like banner with [Switch to audio-only] [Keep video].
  - `'forced'` mode: amber sticky banner at top "Battery critical — switched to audio-only. [Try video again when charging]".
  - On charger plugged in: dismiss prompt; show "Charging detected — try video again?" with [Re-enable video] button.

### Plan 06 enum decision

- [ ] **Decision §34:** REUSE E2's `auto_audio_fallback` enum value with `metadata: { reason: 'battery_critical' | 'bandwidth_critical' }`. NO new enum.
- [ ] System message body: "Switched to audio-only (low battery)" vs "Switched to audio-only (slow connection)".

### Cross-task wiring

- [ ] **E2 cooldown** — battery-triggered audio fallback also has 60s cooldown before re-enabling video.
- [ ] **F3 foreground notification** — when forced, update notification text to "Audio-only call in progress (low battery)".
- [ ] **B8 quality picker** — when forced, picker UI shows "Audio-only" disabled with tooltip "Battery critical".

### iOS Safari degradation

- [ ] `'getBattery' in navigator` is false on iOS; hook returns `supported: false`; no banners; no behavior.

### Manual smoke

- [ ] Android Chrome PWA: simulate battery 14% via devtools → prompt fires once.
- [ ] Click "Switch to audio-only" → audio-only fallback engaged via E2 path.
- [ ] Simulate battery 4% → force fallback fires; banner shown.
- [ ] Plug in charger → banner updates to "Charging detected"; click re-enable → video re-published.
- [ ] iOS Safari: no banners shown.
- [ ] Battery 14% then back to 20% (e.g., charging) → no second prompt.

### `mode='readonly'`

- [ ] N/A; only during live calls.

### General

- [ ] Type-check + lint clean.
- [ ] Hook unit-tested (mock `navigator.getBattery`).

---

## Out of scope

- **Predictive battery drain estimation** ("Call will drain to 0% in 12 min"). Out of scope.
- **Hardware power-saving mode detection.** Out of scope.
- **Camera/video quality reduction without full audio fallback.** B8 / E1 owns granularity.

---

## Files expected to touch

**Frontend:**
- `frontend/hooks/useBatterySaver.ts` — **new** (~120 LOC).
- `frontend/components/consultation/BatteryWarningBanner.tsx` — **new** (~100 LOC).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~20 LOC: mount hook + render banner).

**Backend / migrations:** none (reuses E2's `auto_audio_fallback` enum with metadata).

**Tests:**
- `frontend/hooks/__tests__/useBatterySaver.test.ts` — **new** (~60 LOC).

---

## Notes / open decisions

1. **Decision §34** — reuse E2's `auto_audio_fallback` enum with `metadata.reason`. Avoids enum proliferation.
2. **Battery thresholds** — 15% prompt, 5% force. Calibrate post-launch based on patient feedback.
3. **`navigator.getBattery()` deprecation** — Chrome deprecated for non-secure contexts; still works on https.
4. **Recovery on charging** — UX nudges patient to re-enable video; doesn't auto-resume.
5. **Cross-OS testing** — Android Chrome battery API is reliable; iOS doesn't expose; document.
6. **Coordinate with E2 owner** — `metadata.reason` schema must be agreed upon at PR time.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch F](../Plans/plan-video-consult-selected-features.md#sub-batch-f--mobile-native-niceties-10-days)
- **Source item:** [T6 §T6.41](../../../../Product%20plans/video-consult/plan-t6-video-mobile-native.md)
- **Decision:** [§34 — enum reuse](../Plans/plan-video-consult-selected-features.md#before-sub-batch-f-starts)
- **Coupled:** [task-video-E2](./task-video-E2-auto-audio-fallback.md), [task-video-F3](./task-video-F3-android-foreground-notification.md), [task-video-B8](./task-video-B8-video-quality-picker.md)
- **W3C:** Battery Status API

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** ✅ Shipped (2026-05-02). E2 sibling already shipped; this task reuses
its `applyAdaptiveLevel('audio-only')` teardown path verbatim.

---

## Implementation log (2026-05-02)

### Audit findings

1. **E.2 emit helper hardcoded `reason: 'low_bandwidth'`.**
   `emitAutoAudioFallback` in
   `backend/src/services/consultation-message-service.ts` writes a fixed
   `'Switched to audio-only because of slow connection.'` body with
   `meta: { reason: 'low_bandwidth' }`. Battery callers needed a body /
   meta switch. **Decision:** extend the helper signature with an
   optional `reason` parameter (defaults to `'low_bandwidth'` for
   back-compat) + branch the body string per reason. Correlation key
   gained the `reason` suffix (`auto_audio_fallback:${session}:${reason}:${attempt}`)
   so battery + bandwidth attempts dedup independently.

2. **`AudioFallbackBanner` copy is bandwidth-specific.** Rather than
   parameterise the existing banner (which would invert the props
   API for E.2's existing call sites), shipped a new sibling
   `<BatteryWarningBanner>` with three modes (prompt / forced /
   charging). Both banners can coexist visually but the JSX render
   gating prioritises the forced battery banner over the bandwidth
   one (plugging in is the patient's only escape from forced state;
   the red banner is more important than the amber one).

3. **`applyAdaptiveLevel('audio-only')` is the right teardown reuse.**
   Already does: unpublish + stop video, increment attempt ref,
   record engaged-at timestamp, flip `autoFallbackActive` so
   `<AudioFallbackBanner>` mounts, post the chat row best-effort.
   **Decision:** extend its signature with optional
   `engageOptions={ reason }` and forward to the POST. Defaults to
   `'low_bandwidth'`; battery callers send `'battery_low'` (user
   confirmed 15% prompt) or `'battery_critical'` (5% forced). Banner
   visual stays the bandwidth amber for the fallback ITSELF — the
   on-screen battery surface is the new red banner; the chat row's
   meta tells doctors "this was a battery fallback, not a network
   one" via `meta.reason` for analytics + post-call summary.

4. **iOS Safari has no `navigator.getBattery`.** Hook short-circuits
   to `supported: false`; UI gating renders nothing battery-related.
   No alarm; per spec.

5. **B8 picker has no per-option disabled state today.** Spec asked
   for "audio-only disabled with tooltip 'Battery critical'" when
   forced. **Deferred** to a follow-up — would need
   `<VideoQualityPicker>` to gain a `disabledOptions: QualityOption[]`
   prop. The forced banner copy ("Plug in to re-enable video") is
   the v1 escape contract; manual picker re-selection still works
   if the patient really wants to.

6. **F.3 (Android foreground notification) not shipped.** Spec asked
   for the foreground-notification text update on forced. **Deferred**
   to F.3 itself — the wiring point is symmetric (notification text
   reads from a state hook on `<VideoRoom>`).

7. **`system_event` is TEXT, not enum.** No DB migration needed —
   reusing `auto_audio_fallback` event name with `meta.reason`
   discriminator (Decision §34) requires zero schema work.

### Scope decisions

- **Three flags vs one mode enum.** State is `showBatteryPrompt` +
  `batteryFallbackForced` + `showBatteryCharging`. Rationale: the
  show-flags are pure UI dismissals (Keep video / Dismiss only hide
  surfaces; they don't touch underlying battery state), while
  `batteryFallbackForced` is the source of truth for the underlying
  audio-only engagement. Keeping them separate avoids subtle bugs
  where dismissing the prompt accidentally clears the
  fallback-engaged state.

- **Recovery threshold 20%, prompt 15%, force 5%.** Higher recovery
  than prompt debounces flapping (a battery wobbling 14% ↔ 16%
  won't yo-yo the prompt). Mirrors macOS / iOS notification
  thresholds — patients already associate them with "you should
  plug in".

- **Latches in refs (not state).** Hook flips
  `hasPromptedRef`/`hasForcedRef` inside the `levelchange` listener
  without triggering re-renders. Each listener event would otherwise
  burn a render cycle; on Chrome Android the API fires once per
  percentage point.

- **Forward refs for the bridge.** `useBatterySaver` mounts ~1500
  LOC before `applyAdaptiveLevel` and `handleTryVideoAgain` are
  defined. Rather than shuffle 1500 LOC of unrelated callbacks
  upward, declared two forward refs (`batteryApplyAdaptiveRef`,
  `handleTryVideoAgainRef`) at the top of the battery block and
  populated them via sync `useEffect`s alongside the existing
  `applyAdaptiveLevelRef`. Same pattern the adaptive controller
  already uses (`applyAdaptiveLevelRef.current` in the 30s tick).

- **Both roles get the banners.** Spec didn't restrict; battery
  affects both sides. The chat-row POST is doctor-only (existing
  E.2 contract — patient JWTs don't have `inCallActions.doctorToken`)
  but the on-screen banner is local-only and shows for both roles.

- **No tests in this task.** Existing precedent (E.4, E.6, D.4):
  frontend hook tests are deferred until the Jest infra lands. The
  hook's behavior is small enough to spot-verify via Chrome
  devtools battery emulation. Recorded as a known gap.

### Files touched

**Backend (extends E.2 emit helper + validator):**

- `backend/src/services/consultation-message-service.ts` — extended
  `emitAutoAudioFallback` signature with optional `reason`
  (defaults `'low_bandwidth'`); added exported
  `AutoAudioFallbackReason` union type; per-reason body copy split;
  `correlationKey` includes reason for independent dedup;
  `threshold_level: null` carried in meta when not applicable.
- `backend/src/services/consultation-auto-fallback-service.ts` —
  imports the new union; added `AUTO_FALLBACK_REASONS` whitelist
  satisfying the union; extended `PostAutoFallbackEngagedInput`
  with optional `reason` + `thresholdLevel: number | null`;
  validator now requires `thresholdLevel` only when
  `reason === 'low_bandwidth'`; service forwards `action.reason`
  to the emitter.

**Frontend (new files):**

- `frontend/hooks/useBatterySaver.ts` — **new** (~265 LOC).
  W3C Battery Status API typings (`BatteryManager`,
  `NavigatorWithBattery`); threshold constants exported
  (`BATTERY_PROMPT_THRESHOLD`, `BATTERY_FORCE_THRESHOLD`,
  `BATTERY_RECOVER_THRESHOLD`); idempotent latches via refs;
  iOS Safari graceful degradation; mount-time evaluation.
- `frontend/components/consultation/BatteryWarningBanner.tsx` —
  **new** (~210 LOC). Three render modes; inline SVG glyphs
  (battery-low + bolt); amber/red/emerald palette; `data-mode`
  attrs for smoke tests.

**Frontend (edits):**

- `frontend/lib/api.ts` — `ConsultationAutoFallbackPayload.engaged`
  gained optional `reason: AutoFallbackReason` + `thresholdLevel`
  is now `number | null`; new `AutoFallbackReason` union exported.
- `frontend/components/consultation/VideoRoom.tsx`:
  - Imported `BatteryWarningBanner` + `useBatterySaver`.
  - Extended `applyAdaptiveLevel` signature with optional
    `engageOptions={ reason }`; threaded into POST body with
    `thresholdLevel: reason === 'low_bandwidth' ? 1 : null`.
  - Added battery state (`showBatteryPrompt`,
    `batteryFallbackForced`, `showBatteryCharging`) + forward refs
    + sync effects.
  - Mounted `useBatterySaver` with three callbacks; added
    `<BatteryWarningBanner>` JSX block next to the existing
    `<AudioFallbackBanner>` with mode-resolution priority
    (forced > charging > prompt; prompt suppressed when bandwidth
    fallback is active to avoid stacking amber banners).

### Verification

- **Backend tsc + ESLint** clean.
- **Frontend tsc + Next lint** clean (`✔ No ESLint warnings or errors`).
- **ReadLints** clean across all 6 touched files.
- Existing E.2 callers (the bandwidth-driven adaptive controller)
  continue to call `applyAdaptiveLevel('audio-only')` without the
  new options object; defaults preserve the legacy behavior.
- Existing E.2 backend callers continue to send the legacy payload
  shape (`thresholdLevel: 1` without a `reason` field); validator
  defaults `reason` to `'low_bandwidth'`.

### Known gaps (deferred)

- B8 picker `disabledOptions` extension to grey out audio-only
  during forced state. Recorded for B8 follow-up; current copy
  ("Plug in to re-enable video") is the v1 escape.
- F.3 foreground-notification text wiring — picked up when F.3
  ships its notification primitive.
- Predictive battery-drain estimation (out of scope per spec).
- Hardware power-saving mode detection (out of scope per spec).
- Frontend hook unit tests deferred (matches existing E.4/E.6/D.4
  precedent — Jest infra not in place).
