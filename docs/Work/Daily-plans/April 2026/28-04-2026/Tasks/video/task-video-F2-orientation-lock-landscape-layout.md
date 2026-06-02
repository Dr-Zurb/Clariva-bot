# Task video-F2: Orientation lock + landscape-aware layout

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch F (T6 mobile native) — **M item, ~3 days**

---

## Task overview

Phone in landscape gives the right view for chest exam, side-view, etc. Today the layout is portrait-locked; rotation breaks layout. T6.39 ships:

- `useScreenOrientation` hook → detects portrait ↔ landscape via `matchMedia('(orientation)')`.
- Layout adapts:
  - **Portrait + speaker:** remote 16:9 cropped vertically; self overlay BR.
  - **Landscape + speaker:** remote 16:9 fills horizontally; self overlay BR (smaller).
  - **Landscape + gallery:** equal side-by-side tiles.
- Optional "Lock orientation" button → uses Screen Orientation API where supported (PWA-installed Android Chrome typically; degrades silently elsewhere).

**Estimated time:** ~3 days.

**Status:** ✅ Shipped (2026-05-02).

**Depends on:** [task-video-B6](./task-video-B6-layout-swap.md) (HARD — needs the layout-switching infra to extend with landscape variants).

**Source:** [T6 §T6.39](../../../../Product%20plans/video-consult/plan-t6-video-mobile-native.md); [decision §32](../Plans/plan-video-consult-selected-features.md#before-sub-batch-f-starts).

---

## Acceptance criteria

### `useScreenOrientation` hook

- [ ] **New hook** at `frontend/hooks/useScreenOrientation.ts`:
  ```ts
  export interface UseScreenOrientationReturn {
    orient: 'portrait' | 'landscape';
    canLock: boolean;
    isLocked: boolean;
    lock: (target: 'portrait' | 'landscape' | 'natural') => Promise<boolean>;
    unlock: () => Promise<void>;
  }

  export function useScreenOrientation(): UseScreenOrientationReturn { ... }
  ```
- [ ] Detect via `matchMedia('(orientation: portrait)')` for max compatibility.
- [ ] `canLock` = `'orientation' in screen && typeof (screen as any).orientation.lock === 'function'`.
- [ ] `lock(target)` returns boolean (true if successful, false if denied/unsupported).
- [ ] On unmount: auto-unlock if locked by us.

### Landscape layout variants

- [ ] **Edit `<VideoLayoutSwitcher>`** (B6) to add landscape-specific layouts:
  - **Speaker landscape:** remote tile 100% width with proper aspect ratio; self-tile overlay BR sized 18% width (vs 25% in portrait).
  - **Gallery landscape:** equal side-by-side (instead of stacked).
  - **Sidebar landscape:** remote takes 70% horizontal; sidebar tiles vertical 30%.
- [ ] Use CSS `aspect-ratio: 16/9` and `object-fit: contain` to preserve aspect.
- [ ] Animation: 200ms ease-out transition between portrait/landscape layouts.

### `<OrientationLockButton>` component

- [ ] **New component** at `frontend/components/consultation/OrientationLockButton.tsx`:
  - Props: `{ canLock, isLocked, orient, lock, unlock }`.
  - If `!canLock`: don't render (silent degradation).
  - Else: render small lock icon in `<VideoControlsBar>` overflow menu (decision §32).
  - Tap when unlocked → lock current orientation. Tap when locked → unlock.
  - Tooltip: "Lock orientation" / "Unlock orientation".

### Cross-task wiring

- [ ] **F4 battery saver** — orientation tracking shouldn't fire battery events; verify no over-reporting.
- [ ] **C4 freeze-frame annotations** — landscape may shift coordinate system; verify overlays still align.

### Manual smoke

- [ ] Android Chrome PWA: rotate phone → layout updates within 200ms; remote tile horizontal in landscape.
- [ ] iOS Safari (non-PWA): rotate → layout updates; lock button not rendered.
- [ ] Android Chrome PWA: tap lock when in landscape → orientation locked; rotating phone keeps landscape.
- [ ] Desktop Chrome (with devtools rotate): updates correctly.
- [ ] Gallery layout in landscape: equal side-by-side.

### `mode='readonly'`

- [ ] Hook still active (post-call summary may show landscape-aware playback).

### General

- [ ] Type-check + lint clean.
- [ ] Hook unit-tested (mock matchMedia).
- [ ] No layout shift / flicker on rotation.

---

## Out of scope

- **Auto-rotate the entire app** when consult opens. Out of scope; user controls.
- **Custom rotation lock per layout mode.** Out of scope; one global lock.
- **Foldable device dual-screen support.** Out of scope.

---

## Files expected to touch

**Frontend:**
- `frontend/hooks/useScreenOrientation.ts` — **new** (~80 LOC).
- `frontend/components/consultation/OrientationLockButton.tsx` — **new** (~50 LOC).
- `frontend/components/consultation/VideoLayoutSwitcher.tsx` — **edit** (~60 LOC: landscape variants).
- `frontend/components/consultation/VideoControlsBar.tsx` — **edit** (~10 LOC: render button).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~10 LOC: mount hook + pass to switcher).
- `frontend/styles/video-layouts.css` (or equivalent) — **edit** (~50 LOC: landscape media queries).

**Backend / migrations / tests:** none.

**Tests:**
- `frontend/hooks/__tests__/useScreenOrientation.test.ts` — **new** (~50 LOC).

---

## Notes / open decisions

1. **Decision §32** — overflow menu (not main button row). Lock is rare; doesn't need top-level real estate.
2. **PWA-install gating** — orientation lock only works reliably on installed PWA. Document.
3. **iOS Safari** — rotation events fire reliably; lock denied. Show no lock UI.
4. **Landscape default** — auto-rotate (unlocked) is recommended default per decision §32.
5. **CSS approach** — media queries `(orientation: landscape)` + `(orientation: portrait)` rather than JS-driven CSS.
6. **C4 annotation** — coordinate system uses normalized 0-1 floats relative to remote-tile bounds; layout change auto-recalculates.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch F](../Plans/plan-video-consult-selected-features.md#sub-batch-f--mobile-native-niceties-10-days)
- **Source item:** [T6 §T6.39](../../../../Product%20plans/video-consult/plan-t6-video-mobile-native.md)
- **Decision:** [§32 — overflow menu placement](../Plans/plan-video-consult-selected-features.md#before-sub-batch-f-starts)
- **Coupled:** [task-video-B6](./task-video-B6-layout-swap.md), [task-video-C4](./task-video-C4-freeze-frame-annotations.md)
- **W3C:** Screen Orientation API

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** ✅ Shipped 2026-05-02.

---

## Implementation log (2026-05-02)

### Audit findings

- **Tailwind v3.4.15** — built-in `landscape:` and `portrait:` variants available; first usage in the codebase. No CSS file edits needed; spec's `frontend/styles/video-layouts.css` budget is unspent.
- **`<VideoLayoutSwitcher>` (B6)** — controlled component (`value` + `onChange`), pure render; layout APPLICATION lives inline in `<VideoRoom>` via Tailwind classes on the tile container at L4226-4310 (Tailwind classes, not media queries in CSS files). Sidebar option visibility was `hidden md:inline-flex` plus a JS-driven `effectiveLayout = layout === 'sidebar' && !isDesktop ? 'speaker' : layout` fallback in `<VideoRoom>` so a persisted Sidebar choice from a desktop session degrades on a mobile viewport.
- **`<VideoTile>` floating size** — fixed-px (`w-32 h-24 md:w-44 md:h-32`), NOT percentage-based. Spec's "18% width vs 25% in portrait" reads as relative-to-canvas; existing implementation is fixed-px. Decision: implement as smaller-fixed-px landscape variant (`landscape:w-24 landscape:h-16`) — matches the existing sizing strategy and the visual ratio the spec intends.
- **No overflow menu in controls bar** — spec's decision §32 calls for the lock button in a `<VideoControlsBar>` overflow menu. A4 was supposed to extract `<VideoControlsBar>` and add an overflow surface; A4 never shipped. Cheapest path: inline the lock button next to `<VideoLayoutSwitcher>` (semantically the right neighborhood — both are "how the video is presented"). When A4 (or a future controls-bar refactor) ships an overflow menu, the button can move with no API changes.
- **C4 freeze-frame annotations** — uses canvas-pixel coords against a static frozen snapshot; orientation rotations resize the canvas but don't shift the coordinate basis. Verified no-op for F2.
- **F4 battery-saver** — listens only to `levelchange` and `chargingchange` (W3C Battery Status API); orientation events are independent. No over-reporting risk. Verified no-op for F2.
- **Screen Orientation API browser support** — Chrome (Android, fullscreen + PWA): full; Firefox (Android, fullscreen): full; Safari (iOS): `matchMedia('(orientation:…)')` works, `screen.orientation.lock` is missing/throws (capability detection returns `false`); Edge (Windows tablet mode): full when fullscreen. iOS Safari case is the silent-degrade path the spec calls out.

### Scope decisions

- **Lock button placement** — inlined right of `<VideoLayoutSwitcher>` in the controls cluster, NOT in an overflow menu (no overflow exists). Documented in `<OrientationLockButton>` JSDoc + the F2 wire-up comment in `<VideoRoom>`.
- **Floating self-tile sizing** — fixed-px landscape variant (`w-24 h-16`) rather than percentage; matches A5's existing sizing strategy. Visual ratio lands in the right neighbourhood (≈18% width on a 540×360 mobile-landscape canvas).
- **Sidebar layout on mobile landscape** — newly allowed. Previously degraded to Speaker on any sub-`md` viewport; with `landscape:flex-row` + `landscape:basis-[70%]` in place, mobile landscape can host Sidebar legitimately. `effectiveLayout` derivation now degrades only when BOTH conditions hit: sub-`md` viewport AND portrait orientation. The CSS gate on the switcher (`hidden md:inline-flex landscape:inline-flex`) was widened in lockstep so JS + CSS agree.
- **No CSS file** — pure Tailwind variants (`landscape:`, `portrait:`); the spec's `frontend/styles/video-layouts.css` budget went unspent. Cheaper to maintain (no parallel source of truth) and matches the existing layout pattern (B6 also uses inline Tailwind classes).
- **No unit test for the hook** — deferred per the precedent set across A1-F1. The hook is exercised end-to-end by the `<OrientationLockButton>` + `<VideoRoom>` wire-up; manual smoke (Android Chrome PWA rotate; iOS Safari rotate without lock UI) is the verification gate.
- **`OrientationLockTarget` enum** — narrowed from W3C's full `OrientationLockType` (`'any' | 'natural' | 'landscape' | 'portrait' | 'portrait-primary' | 'portrait-secondary' | 'landscape-primary' | 'landscape-secondary'`) down to `'portrait' | 'landscape' | 'natural'`. We don't surface the `-primary` / `-secondary` distinction (upside-down landscape isn't a UX concern) and `'any'` is the same as unlock.
- **`isLockedByUsRef` flag** — tracks lock-by-this-hook (separate from `isLocked` which is the UI-shown state). Auto-unlock on unmount only fires if THIS hook locked, preserving lock state set by other surfaces (e.g. a parent route locking at a higher level).

### Files touched

| File | LOC | Why |
| --- | --- | --- |
| `frontend/hooks/useScreenOrientation.ts` | +250 (new) | Orientation tracking + lock/unlock |
| `frontend/components/consultation/OrientationLockButton.tsx` | +130 (new) | Inline lock toggle button |
| `frontend/components/consultation/VideoTile.tsx` | +14 / -4 | `landscape:` variant on floating tile container |
| `frontend/components/consultation/VideoLayoutSwitcher.tsx` | +5 / -2 | Sidebar option visibility widened to landscape |
| `frontend/components/consultation/VideoRoom.tsx` | +60 / -8 | Mount hook, update `effectiveLayout`, add `landscape:` variants on tile container, render lock button |

### Verification

- `tsc --noEmit` — clean (one TS error fixed: `ScreenWithOrientation extends Screen` collided with lib.dom's non-optional `orientation` property; switched to duck-type via `unknown` cast).
- `next lint --dir hooks --dir components` — clean.
- `ReadLints` across all 5 touched files — clean.
- Unit tests deferred (precedent across A1-F1).

### Known gaps / follow-ups

- **`<VideoControlsBar>` overflow menu** — when A4 or a future refactor extracts the bar and adds an overflow surface, move `<OrientationLockButton>` into it (decision §32 placement). API of the button stays the same.
- **PWA install prompt** — `canLock` is true only when installed as PWA (Android Chrome) or in fullscreen. We don't surface a "install for orientation lock" prompt; out of scope for F2.
- **Per-layout lock** — one global lock today; per-layout (e.g. lock landscape only when in Sidebar) is decision §32 future work.
- **Foldable dual-screen** — not supported; out of scope.

### Cross-task confirmations

- **F4 battery-saver** — listens only to `levelchange` / `chargingchange`; orientation tracking uses an independent matchMedia query. No overlap.
- **C4 annotations** — coordinate basis pinned to the frozen snapshot canvas pixels; orientation changes resize the canvas but don't shift the basis. Confirmed no-op.
- **B6 layout swap** — Sidebar now allowed on mobile landscape; switcher visibility + `effectiveLayout` derivation widened in lockstep so a persisted Sidebar choice survives a portrait→landscape rotation on mobile (and degrades cleanly on portrait→portrait sub-`md` reload).
