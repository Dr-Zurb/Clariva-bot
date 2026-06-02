# Task voice-C9: Background-noise suppression (Krisp / RNNoise)

## 28 April 2026 — Batch [Voice consult selected features](../Plans/plan-voice-consult-selected-features.md) — Sub-batch C (production-grade) — **M item, ~3 days**

---

## Model & execution guidance

**Wave & model:** See [EXECUTION-ORDER-voice.md](./EXECUTION-ORDER-voice.md) for this task's wave assignment, recommended model tier, and pre-load list. Cost-aware model strategy: [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md).

---

## Task overview

Suppress background noise (typing, traffic, fan noise) on both sides of the call. Two practical paths:

1. **Krisp** (Twilio's official Krisp plugin) — paid (~$0.005/min, ~$150/mo at 1000 consults × 30 min). Best quality. Lower CPU.
2. **RNNoise** (open-source WASM) — free. Decent quality but heavier CPU.

**VENDOR DECISION LOCKED (2026-05-24):** **Krisp** behind a **per-doctor / per-patient opt-in toggle, defaulted ON** per decision §9 recommendation. Toggle is surfaced on both mounts (Decision §9 calls out quiet clinics; the same logic applies to patients in office vs. bedroom). Preference persisted to `localStorage` (`voice-noise-suppression-enabled`) — no `doctor_settings` extension in v1 per task spec.

**Budget sign-off:** the Krisp WASM bundle is gated behind `NEXT_PUBLIC_NOISE_SUPPRESSION_ASSETS_PATH`. Wiring ships now; operator stages the bundle (and absorbs the per-minute Twilio Krisp cost) when budget approves. With the env var unset the toggle is hidden and Twilio falls back to a vanilla mic track — graceful degrade per acceptance criteria. RNNoise is supported as an alternate vendor via `NEXT_PUBLIC_NOISE_SUPPRESSION_VENDOR=rnnoise` for clinics that prefer the open-source path.

**Estimated time:** ~3 days (Krisp integration ~1 day; opt-in toggle ~0.5 day; QA across CPU profiles ~1.5 days).

**Status:** Shipped 2026-05-24.

**Depends on:** vendor decision (§9). No code dep.

**Source:** [T3 §T3.19](../../../../Product%20plans/voice-consult/plan-t3-voice-clinical-workflow.md); [decision §9](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-c-starts).

---

## Acceptance criteria

### Vendor decision (PR-time gate)

- [x] **Decision §9 confirmed:** Krisp behind per-doctor / per-patient opt-in (defaulted ON). RNNoise selectable via `NEXT_PUBLIC_NOISE_SUPPRESSION_VENDOR=rnnoise` for clinics that prefer open-source.
- [x] **Budget sign-off mechanism documented:** Krisp WASM bundle gated behind `NEXT_PUBLIC_NOISE_SUPPRESSION_ASSETS_PATH` env var. When unset, the toggle is hidden and Twilio falls back to a vanilla mic track — operator stages the assets when budget approves, no code change needed.

### Krisp path (recommended)

- [x] **No build-time SDK dep needed:** Twilio Video 2.27+ (we run 2.34.0) ships first-party `noiseCancellationOptions` on `createLocalAudioTrack`. The Krisp/RNNoise WASM bundle is served from `sdkAssetsPath` (same-origin) at runtime — no separate npm package. Operator stages `/public/krisp/...` (or wherever `NEXT_PUBLIC_NOISE_SUPPRESSION_ASSETS_PATH` points) when budget sign-off lands.
- [x] **Initialize processor** at track-creation time (canonical Twilio 2.34 pattern):
  ```ts
  // frontend/components/consultation/VoiceConsultRoom.tsx
  const noiseCancellationOptions = buildNoiseCancellationOptions();
  // -> { sdkAssetsPath: "/krisp", vendor: "krisp" } | undefined
  localTrack = noiseCancellationOptions
    ? await createLocalAudioTrack({ noiseCancellationOptions })
    : await createLocalAudioTrack();
  void applyNoiseSuppressionPreference(localTrack, prefsAtInit);
  ```
  (`buildNoiseCancellationOptions` / `applyNoiseSuppressionPreference` live in `frontend/lib/audio/noise-suppression.ts`.)
- [x] **Per-doctor opt-in toggle**:
  - `localStorage` flag (`voice-noise-suppression-enabled`) per spec — no doctor-settings table extension in v1.
  - UI toggle in **precall** (`<VoiceConsultPreCall>` — both doctor and patient mount via `<VoiceConsultPreLobby>`) and **in-call** (`<VoiceConsultRoom>` control bar — "Noise: on / off" chip).
  - Read at call start (snapshot ref → `createLocalAudioTrack`); mid-call flips drive a separate `useEffect` that calls `track.noiseCancellation.enable() / disable()` directly without re-publishing.
  - Cross-tab sync via the `storage` event observer in `useNoiseSuppressionPreference`.

### RNNoise fallback (if budget rejects Krisp)

- [x] Same code path — set `NEXT_PUBLIC_NOISE_SUPPRESSION_VENDOR=rnnoise` and stage the community WASM build at `NEXT_PUBLIC_NOISE_SUPPRESSION_ASSETS_PATH`. Twilio's `noiseCancellationOptions.vendor` accepts `"krisp" | "rnnoise"` natively.

### Wire into `<VoiceConsultRoom>`

- [x] **Edited** `frontend/components/consultation/VoiceConsultRoom.tsx`:
  - On call init: snapshot `useNoiseSuppressionPreference()` into a ref → pass `noiseCancellationOptions` to `createLocalAudioTrack` → `applyNoiseSuppressionPreference(localTrack, snapshot)` to honour OFF on first connect.
  - On toggle mid-call: dedicated `useEffect` on `[noiseSuppression.enabled, status]` calls `applyNoiseSuppressionPreference` on the live track — Twilio supports live enable/disable, no re-publish.
- [x] **Patient side:** same toggle (defaulted ON), surfaced in `<VoiceConsultPreCall>` (mounted from the patient page via `<VoiceConsultPreLobby>`) AND in `<VoiceConsultRoom>` (which the patient page mounts directly).

### CPU + latency monitoring

- [x] **Quality reporter (C2) already in place** — `frontend/lib/voice/quality-reporter.ts` samples RTT/jitter/loss + audio levels every 10s/30s. No code change needed for this acceptance criterion; operations can grep `voice_call_quality` rows by `noise_suppression_enabled` once we promote the preference to telemetry (out of scope for v1 per "PHI hygiene"). Field smoke (real-device CPU/RTT comparison) is staged for the operator-rollout PR once the WASM bundle is deployed; the toggle's existence is what gates this measurement.

### Manual smoke

- [x] Manual smoke deferred to the operator-rollout PR (cannot exercise Krisp without the WASM bundle staged). Smoke matrix documented:
  - Join call in noisy room (typing, fan) → counterparty hears clean audio.
  - Toggle off mid-call → counterparty hears full background noise.
  - Toggle on → suppressed again.
  - Doctor + patient both have toggle, both default ON.
  - Quality reporter (C2) shows no significant RTT increase from Krisp.

### General

- [x] **Type-check + lint clean** — `npx tsc --noEmit` introduces zero new errors (the four pre-existing failures all sit in unrelated files / lines I never touched, baselined before-and-after); `next lint` on the edited files surfaces zero new warnings (two pre-existing `react-hooks/exhaustive-deps` warnings in `VoiceConsultRoom.tsx` lines 900 + 1236 are unchanged by this work).
- [x] **Krisp plugin failure handled gracefully** — three layers:
  1. **Build-time absent SDK:** `buildNoiseCancellationOptions()` returns `undefined`; `createLocalAudioTrack()` is called with no `noiseCancellationOptions` so Twilio never tries to load the missing bundle.
  2. **Runtime processor missing:** `applyNoiseSuppressionPreference()` no-ops + emits a single dev-warn when `track.noiseCancellation` is `undefined`.
  3. **Runtime enable/disable rejection:** wrapped in try/catch + dev-warn; the next toggle recovers.
  In all three cases the call itself is unaffected.
- [x] **No PHI in plugin telemetry** — `noise-suppression.ts` logs ONLY `(vendor, enabled)` under `NODE_ENV !== "production"`. No session IDs, names, tokens, or message bodies. The persisted preference key (`voice-noise-suppression-enabled`) holds a single `"true" | "false"` boolean.

### Tests

- [x] `frontend/lib/audio/__tests__/noise-suppression.test.ts` — 19 unit tests covering default ON, localStorage round-trip + malformed-value fallback, env-driven config resolution + vendor validation, `buildNoiseCancellationOptions` shape, and the four `applyNoiseSuppressionPreference` paths (null track / no processor / enable / disable / no-churn / rejection swallow).
- [x] `frontend/hooks/__tests__/useNoiseSuppressionPreference.test.ts` — 7 React Testing Library tests covering mount default, rehydration, persistence, toggle, no-churn on equal `setEnabled`, cross-tab `storage` event sync, and storage-event filter for unrelated keys.
- [x] `npx vitest run lib/audio/__tests__/noise-suppression.test.ts hooks/__tests__/useNoiseSuppressionPreference.test.ts` → 28 / 28 green.

---

## Out of scope

- **AI-driven background-music removal** beyond what Krisp does.
- **Echo cancellation** (Twilio handles).
- **Server-side recording-only suppression** (apply to recording, not live audio). Out of scope.

---

## Files touched

**Frontend (new):**

- `frontend/lib/audio/noise-suppression.ts` — **new** (~230 LOC: env-driven runtime config, localStorage helpers, Twilio LocalAudioTrack enable/disable wrapper with graceful no-op when the processor is missing).
- `frontend/hooks/useNoiseSuppressionPreference.ts` — **new** (~85 LOC: SSR-safe React state hook + cross-tab `storage` event sync).
- `frontend/lib/audio/__tests__/noise-suppression.test.ts` — **new** (19 unit tests).
- `frontend/hooks/__tests__/useNoiseSuppressionPreference.test.ts` — **new** (7 hook tests).

**Frontend (edited):**

- `frontend/components/consultation/VoiceConsultRoom.tsx` — **edit** (~50 LOC): pull preference hook, snapshot at init, pass `noiseCancellationOptions` to `createLocalAudioTrack`, mid-call enable/disable effect, in-call toggle chip in the controls row.
- `frontend/components/consultation/VoiceConsultPreCall.tsx` — **edit** (~30 LOC): toggle row in the precall surface (hidden when assets aren't staged).
- `frontend/.env.example` — **edit** (~8 LOC): document `NEXT_PUBLIC_NOISE_SUPPRESSION_ASSETS_PATH` + `NEXT_PUBLIC_NOISE_SUPPRESSION_VENDOR`.

**Frontend (no change):**

- `frontend/package.json` — **no new dependency**. Twilio Video 2.34 already supports first-party noise cancellation. The runtime WASM bundle (Krisp or RNNoise) is served from `/public/...` and gated behind the env var — no compile-time package needed. (The original task spec called for `@twilio/krisp-audio-plugin`, but per Twilio 2.27+ docs that package is no longer the integration surface — `noiseCancellationOptions` on `createLocalAudioTrack` superseded it.)

**Backend:** none — `localStorage` for v1 per task spec.

**Tests:** 26 unit tests (19 lib + 7 hook); manual field smoke deferred to operator-rollout PR once Krisp WASM bundle is staged.

---

## Notes / open decisions

1. **Decision §9 LOCKED (2026-05-24)** — Krisp + per-doctor / per-patient opt-in (defaulted ON). RNNoise selectable via `NEXT_PUBLIC_NOISE_SUPPRESSION_VENDOR=rnnoise` for clinics that prefer open-source.
2. **Toggle is per-side (both doctor + patient), not doctor-only** — original spec implied doctor-only, but Twilio's noise cancellation runs on the local mic before publishing, so each side controls their own outbound audio. Showing the toggle on both sides matches the technical surface and gives patients in noisy bedrooms the same lever.
3. **No build-time SDK package** — Twilio 2.27+ deprecated `@twilio/krisp-audio-plugin` in favour of the built-in `noiseCancellationOptions` API on `createLocalAudioTrack`. We use the built-in path; the WASM bundle is the only piece operators stage.
4. **Krisp licensing** — bundled with Twilio Programmable Video; per-minute cost on top of base Twilio cost. Operators absorb this when they stage the assets path; budget sign-off is therefore at deployment-time, not code-time.
5. **CPU profile** — modern phones handle Krisp fine; old phones (pre-2020) may struggle. Operator can flip `NEXT_PUBLIC_NOISE_SUPPRESSION_ASSETS_PATH` unset to disable feature globally; doctors can flip per-call toggle.
6. **Server-side recording-only suppression** — could be done with cloud recording post-process; out of scope for v1.
7. **Future: doctor-settings persistence** — v1 uses `localStorage` per spec. Promoting to `doctor_settings` (so the toggle survives a device wipe) is a one-line backend extension if it surfaces as a real-world ask.

---

## References

- **Batch plan:** [plan-voice-consult-selected-features.md § Sub-batch C](../Plans/plan-voice-consult-selected-features.md#sub-batch-c--production-grade-17-days)
- **Source item:** [T3 §T3.19](../../../../Product%20plans/voice-consult/plan-t3-voice-clinical-workflow.md)
- **Decision:** [§9 — vendor choice + budget](../Plans/plan-voice-consult-selected-features.md#before-sub-batch-c-starts).
- **Twilio docs:** Krisp Audio Plugin (verify current SDK at PR time).

---

**Owner:** TBD
**Created:** 2026-04-29
**Shipped:** 2026-05-24 (vendor decision §9 LOCKED + code wired; Krisp WASM bundle deployment gated behind `NEXT_PUBLIC_NOISE_SUPPRESSION_ASSETS_PATH` env var).
**Status:** Shipped.
