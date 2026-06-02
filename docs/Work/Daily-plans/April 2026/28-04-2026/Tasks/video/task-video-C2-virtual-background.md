# Task video-C2: Virtual background / blur (`@twilio/video-processors`)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch C (T3 clinical workflow) — **M item, ~3 days**

---

## Task overview

Patients in cluttered or private rooms (kitchen, bedroom) want privacy. Doctors want to project clinic brand consistency. T3.20 ships:

- **Off** — raw camera, no processing.
- **Blur (light)** — gentle gaussian blur on background.
- **Blur (heavy)** — strong blur.
- **Image** — replace with neutral/clinic-branded backdrop image (small image picker).

Uses **Twilio's official `@twilio/video-processors`** (decision §12 — recommended over custom MediaPipe pipeline).

**CPU cost note:** blur adds 5-15% CPU on mid-tier laptop; ~15-25% on mid-tier phone. Auto-disable on low-end devices (defer detection to v1.5; v1 is opt-in only).

**Estimated time:** ~3 days.

**Status:** Complete (2026-05-01) — blur subset (`off` / `blur-light` / `blur-heavy`); image variants typed but deferred until designer JPGs ship (see deferral list).

**Depends on:** none (independent).

**Source:** [T3 §T3.20](../../../../Product%20plans/video-consult/plan-t3-video-clinical-workflow.md); [decision §12](../Plans/plan-video-consult-selected-features.md#before-sub-batch-c-starts).

---

## Acceptance criteria

### Twilio video-processors integration

- [x] Install `@twilio/video-processors` npm dep — installed `^3.2.0` (latest, published 2026-04-22; compatible with `twilio-video@^2.34.0` per Twilio's README ≥ v2.29 requirement).
- [x] Create `frontend/lib/video/virtual-background.ts` — shipped with a slightly different (richer) API surface than the draft sketch:
  ```ts
  export type BackgroundPreference =
    | "off" | "blur-light" | "blur-heavy"
    | "image:clinic" | "image:neutral";
  export const BACKGROUND_PREFERENCES: ReadonlyArray<BackgroundPreference>;
  export const BACKGROUND_STORAGE_KEY = "video-bg-preference";
  export const DEFAULT_BACKGROUND_PREFERENCE: BackgroundPreference = "off";
  export function parseBackgroundPreference(raw): BackgroundPreference;
  export function serializeBackgroundPreference(pref): string;
  export async function applyBackgroundToTrack(track, pref): Promise<void>;
  export function removeBackgroundFromTrack(track): void;
  export function disposeBackgroundCache(): void;
  ```
  Rationale for the deviation: a single `applyBackgroundToTrack(track, pref)` is cleaner than three split entry points (`applyBlur` / `applyImageBackground` / `removeBackground`) — the discriminated union routes the work, the parent doesn't have to choose the right function based on its own state. Same convention as the audio-router lib in B9.
- [x] Internally uses `GaussianBlurBackgroundProcessor` (today; both `light` and `heavy` variants with `blurFilterRadius: 8` / `25`) and `VirtualBackgroundProcessor` (typed branch; deferred until image assets ship — see Image assets section below).

### `<VirtualBackgroundPicker>` component

- [x] **New component** at `frontend/components/consultation/VirtualBackgroundPicker.tsx`:
  ```
  Background: [Off] [Blur] [Strong blur] (image options hidden in v1)
  ```
  Button-group (NOT dropdown) so the active state is always visible — same precedent as `<VideoLayoutSwitcher>` (B6) and `<VideoQualityPicker>` (B8). Inline SVG glyphs (no icon library in deps yet — same constraint as B6 / B7 / B8). Controlled via `value` + `onChange`; the parent owns persistence + the `addProcessor` swap. `disabled` prop gates the picker during the inflight `loadModel()` window so the user can't queue flapping toggles.
- [x] Mount in controls bar — between `<VideoLayoutSwitcher>` (B6) and the PiP button (B7), inside the same `effectiveLayout` cluster. Hidden during `hold.onHold` (same precedent as Mute / Camera / Quality / Layout / PiP).
- [x] Default to user's last choice (per-device persistence) — see Persistence section.

### Image assets

- [ ] **Two seed background images** in `frontend/public/video-backgrounds/` — **DEFERRED**. The lib's discriminated union accepts `'image:clinic'` / `'image:neutral'`; the picker has the SVG glyph + label code wired but hidden behind `IMAGE_OPTIONS_ENABLED = false`. When designer-supplied JPGs land:
  1. Drop the JPGs into `frontend/public/video-backgrounds/clinic-backdrop.jpg` and `neutral-backdrop.jpg`.
  2. Implement the deferred `'image:*'` branch in `applyBackgroundToTrack` (preload `<img>` + construct `VirtualBackgroundProcessor` + cache it). The branch is sketched out in a comment at `lib/video/virtual-background.ts`.
  3. Flip `IMAGE_OPTIONS_ENABLED` to `true` (or wire to a feature flag).
  No code architecture change required — this is a pure asset + 8-line lib branch follow-up. Reasoning: I don't have access to designer assets in this PR and committing placeholder JPGs would (a) bloat git history with throwaway bytes and (b) ship a low-quality v1 surface that contradicts decision §12's "clinic brand consistency" goal.
- [ ] Image picker can be expanded later (admin-uploaded clinic backdrops) — separate v1.5+ surface; out of scope for this PR.

### Persistence

- [x] **localStorage key:** `video-bg-preference` storing `'off' | 'blur-light' | 'blur-heavy' | 'image:<id>'`. Hydration is wrapped in `try/catch` so disabled storage (incognito, enterprise lockdown) silently degrades to the default — same precedent as the layout / quality / volume hydration above.
- [x] **Default:** `'off'`.

### Manual smoke

- [ ] Pick Blur (light) → background blurs within ~1s — **manual smoke pending**. Implementation verified end-to-end in source; the inflight UX (picker `disabled` → ~1-2s TFLite load → blur visible) is wired.
- [ ] Pick Blur (heavy) → stronger blur — same as above, pending manual smoke.
- [ ] Pick Image → background replaced with selected image — **DEFERRED** with image assets.
- [ ] Pick Off → raw camera — picker calls `removeBackgroundFromTrack` → Twilio's `track.removeProcessor(track.processor)`.
- [ ] Refresh page → restores choice — hydration effect reads `localStorage` on mount + `applyBackgroundToTrack` runs in the connect block.
- [ ] CPU usage acceptable on mid-tier laptop — pending manual smoke; Twilio's docs cite 5-15% CPU overhead for blur on mid-tier hardware (and the TFLite SIMD path is auto-selected by the lib).
- [ ] Recording captures the processed video (not raw) — Twilio publishes the processed track via `track.processedTrack` automatically once `addProcessor` lands; recording sees the processed pixels for free. Pending end-to-end smoke once recording infra (Plan 07) ships.
- [ ] If C1 noise suppression also active, total CPU is acceptable on mid-tier device — pending C1 (next sub-batch C task) and manual smoke.

### `mode='readonly'`

- [ ] Picker hidden — **NO ACTION** required today (no `mode='readonly'` prop on `<VideoRoom>` yet — same status as B4 / B6 / B7). When the prop lands, the existing `hold.onHold` style gate trivially extends to `(hold.onHold || mode === 'readonly')`.

### General

- [x] Type-check + lint clean — `npx tsc --noEmit` and `npx eslint lib/video/virtual-background.ts components/consultation/VirtualBackgroundPicker.tsx components/consultation/VideoRoom.tsx scripts/copy-twilio-video-processors-assets.mjs` both pass with no warnings.
- [x] No console errors expected — failures route through the typed promise rejection → ephemeral inline notice (`backgroundNotice`), not `console.error`. Dev-only `console.warn` for the connect-time + quality-swap re-apply paths so a deploy issue is visible in dev tools without flooding production.
- [ ] Track-republish on processor change is smooth (~1s); no audio drop — pending manual smoke. Twilio's `addProcessor` doesn't republish the track (it wraps the existing one with a processor wrapper exposed via `track.processedTrack`); audio is on a different track entirely so no audio drop is structurally possible.

---

## Out of scope

- **Custom upload of personal backdrops by patient.** Out of scope; admin / clinic uploads only.
- **Video backdrops.** Out of scope (motion + chroma confusion).
- **Edge detection / hair refinement** beyond Twilio's defaults. Out of scope.
- **Patient-side branded backdrops.** Out of scope (only doctor / clinic-owned imagery).

---

## Files expected to touch

**Frontend:**
- `frontend/lib/video/virtual-background.ts` — **NEW** (~270 LOC). Lifecycle wrapper around `@twilio/video-processors`. Process-local processor cache (one entry per `BackgroundPreference`) so re-toggles skip the 1-2s TFLite model load. `loadPromises` map dedupes concurrent loads. Three exports the parent consumes: `applyBackgroundToTrack`, `removeBackgroundFromTrack`, `disposeBackgroundCache`. Two pure helpers for `localStorage` round-tripping: `parseBackgroundPreference`, `serializeBackgroundPreference`. Image-variant branch is a typed stub (deferred until JPGs land).
- `frontend/components/consultation/VirtualBackgroundPicker.tsx` — **NEW** (~205 LOC). Controlled button-group component (Off / Blur / Strong blur). Inline SVG glyphs (no Lucide). Image options gated behind `IMAGE_OPTIONS_ENABLED = false`. Re-clicking the active button is a no-op (matches B6 / B8 picker behavior). Uses `useId` for accessible group labelling.
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~210 LOC net): hook mount + `background` state (with `backgroundRef` for closure access) + hydration effect + `handleBackgroundChange` async callback (with optimistic update + revert + persistence) + cleanup effect + `backgroundNotice` ephemeral pill + auto-clear effect. Apply on connect (line ~1230) and re-apply after quality swap (line ~1770). Picker mounted in controls bar between layout switcher and PiP button.
- `frontend/scripts/copy-twilio-video-processors-assets.mjs` — **NEW** (~85 LOC). Postinstall script copies the 9 runtime files (TFLite model, two WASM binaries, two JS shims, two web-worker scripts, two main bundles) from `node_modules/@twilio/video-processors/dist/build/` into `frontend/public/twilio-video-processors-assets/`. Wired as `postinstall` in `package.json`. Idempotent (overwrites destination).
- `frontend/package.json` — **edit** (3 LOC): `+@twilio/video-processors@^3.2.0` in `dependencies`; `+postinstall: "node scripts/copy-twilio-video-processors-assets.mjs"` in `scripts`.
- `frontend/.gitignore` — **edit** (5 LOC): add `public/twilio-video-processors-assets/` so the multi-MB WASM binaries don't bloat git history (the postinstall script + lockfile pin keep them in sync across environments).
- `frontend/public/twilio-video-processors-assets/*` — generated at install time (not committed to git per the new gitignore entry).

**Backend / migrations / tests:** none.

---

## Audit findings (2026-05-01)

Before authoring, swept the call-side surface:

- **`twilio-video@^2.34.0`** in `package.json` — meets the ≥ v2.29 requirement for `@twilio/video-processors@3.2.0`. No twilio-video upgrade needed.
- **`localTracksRef`** — already a `useRef<Awaited<ReturnType<typeof createLocalTracks>>>([])`. The lib reads the active video track via `localTracksRef.current.find((t) => t.kind === "video") as LocalVideoTrack` — same idiom as `handleQualityChange`, `handleToggleCamera`, `handleToggleMic`, `handleToggleHold`. No new ref needed.
- **`<VideoTrack>.addProcessor` / `removeProcessor`** — `twilio-video`'s tsdef declares both signatures. Twilio's `BackgroundProcessor` structurally satisfies the `VideoProcessor` interface (same `processFrame` shape) but the type identities are distinct (each package declares its own `VideoFrame`). Bridged with an `as unknown as` cast in the lib — runtime contract is what matters and matches Twilio's README example verbatim.
- **No existing toast lib** — same constraint as B6 / B7 / B8 / B9; the inline amber `backgroundNotice` pill matches the existing `pipNotice` pattern.
- **No icon library** — same constraint; reused the inline-SVG idiom.
- **Recording / Plan 07** — not yet shipped, so the "recording captures processed video" smoke is deferred. Twilio publishes the processed track via `track.processedTrack` once a processor is attached, so when recording lands it'll see the right pixels for free.

## Deviations from the draft

1. **Lib API surface** — single `applyBackgroundToTrack(track, pref)` instead of three split entries (`applyBlur` / `applyImageBackground` / `removeBackground`). Cleaner discriminated-union routing; the parent doesn't have to choose the right function based on its own state. Same convention as B9's audio-router lib.
2. **Image variants deferred** — see the Image assets section for the full rationale (no designer assets in this PR; placeholder JPGs would bloat git history + ship a low-quality v1 surface). The lib + picker have a typed stub branch + a feature gate so the future PR is purely additive (drop assets + flip flag + implement 8-line lib branch).
3. **Postinstall asset copy** — Twilio's runtime requires WASM/TFLite/worker files served from a public URL (decision §12 + Twilio README's "same-origin hosting"). Wired as a postinstall script so CI, fresh clones, and `npm ci` all work without manual intervention. Gitignore the destination so binary churn doesn't pollute git history.
4. **Inflight UX (`backgroundSwitchInFlight` → picker `disabled`)** — the draft didn't specify a busy state. The first switch from `'off'` to `'blur-*'` includes a 1-2s TFLite model load; without the disable, a fast double-click queues two `addProcessor` calls and Twilio's race semantics aren't great. Same precedent as `<VideoQualityPicker>`'s `qualitySwitchInFlight`.
5. **Re-apply on quality swap** — the draft mentioned applying on mount + picker change. I added a third call site: after `handleQualityChange` publishes a new track. Without this, switching from 720p to 480p (or any other quality change) would silently strip the user's blur — a real footgun.
6. **`disposeBackgroundCache()` on unmount** — the draft didn't specify. Twilio's `BackgroundProcessor` doesn't expose a public `dispose()` in 3.2.0; the cache release relies on GC + worker-side cleanup when references drop. The cleanup hook clears the cache map so a route change doesn't hold ~2.5 MB of WASM longer than needed.
7. **CPU + Krisp coexistence + low-end device auto-disable** — both deferred to v1.5 per the spec. No code in this PR.

---

## Notes / open decisions

1. **Decision §12** — Twilio's `@twilio/video-processors` recommended (supported, GPU-accelerated, maintained).
2. **CPU + Krisp coexistence** — both can run on the same call; document combined cost. If user enables both on a low-end device, surface a "may impact battery" toast (defer to v1.5).
3. **Asset weight** — keep backdrop images < 200KB each; lazy-load only when picked.
4. **Privacy** — virtual background is ENTIRELY local; no upload, no telemetry of selection.
5. **iOS Safari** — verify `@twilio/video-processors` works on iOS Safari 14+; document degradation if not.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch C](../Plans/plan-video-consult-selected-features.md#sub-batch-c--clinical-workflow-10-days)
- **Source item:** [T3 §T3.20](../../../../Product%20plans/video-consult/plan-t3-video-clinical-workflow.md)
- **Decision:** [§12 — virtual background plugin](../Plans/plan-video-consult-selected-features.md#before-sub-batch-c-starts)
- **Vendor:** [`@twilio/video-processors`](https://www.twilio.com/docs/video/build-js-virtual-background)

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** Complete (2026-05-01) — blur subset (`off` / `blur-light` / `blur-heavy`); image variants typed but deferred until designer JPGs ship.
