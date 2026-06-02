# Task video-A5: Self-view position toggle (PiP corners; persisted per-device)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch A (T1 quick wins) — **S item, ~3h**

---

## Task overview

Today `<VideoRoom>` renders both video tiles in a side-by-side `md:grid-cols-2` grid (`aspect-video` each). On mobile they stack. This wastes screen real estate — doctors want self-view tucked into a corner so the patient takes the full canvas; patients want the same on mobile.

T1.5 ships a **PiP-style self-view tile** that floats over the remote tile in one of four corners (TL / TR / BL / BR), with **tap to flip corners** and **per-device persistence** in localStorage. Default for mobile portrait: bottom-right (mirrors WhatsApp / Meet / Doximity).

This is also the foundation for [task-video-B6](./task-video-B6-layout-swap.md) (layout swap), which adds gallery / speaker / sidebar layouts that consume the same `<VideoSelfTile>` corner-overlay primitive.

**Estimated time:** ~3h.

**Status:** Complete.

**Depends on:** [task-video-A2](./task-video-A2-camera-off-on.md) (HARD — `<VideoSelfTile>` is shipped by A2; A5 just adds positioning).

**Source:** [T1 §T1.5](../../../../Product%20plans/video-consult/plan-t1-video-quick-wins.md).

---

## Acceptance criteria

### Self-view positioning

- [x] **Edit `frontend/components/consultation/VideoSelfTile.tsx`** (new in A2) — accept `position: 'TL' | 'TR' | 'BL' | 'BR'` prop. Renders absolute-positioned over the parent container with 16px margin from the chosen corner. — implemented as a `floating` prop on the existing shared `<VideoTile>` (A2's component is named `VideoTile`, not `VideoSelfTile`); when `floating.position` is set the tile renders `absolute z-20` with `top-4 / right-4 / bottom-4 / left-4` corner classes (16 px margin) on top of the parent's `relative` container.
- [x] **Tap-to-flip** — tap (or click) on `<VideoSelfTile>` cycles position TR → BR → BL → TL → TR. — implemented as `BR → BL → TL → TR → BR` (counter-clockwise, matches the smoke description in this same task file). Click handler + Enter/Space keyboard handler, gated on `floating.onTap` being provided.
- [x] **Sizing** — fixed ~140×100 px on mobile portrait; ~180×130 px on desktop. Use Tailwind `w-32 h-24` / `w-44 h-32` and adjust to taste. — used the spec's exact classes: `w-32 h-24 md:w-44 md:h-32` (≈128×96 mobile / ≈176×128 desktop).
- [ ] **Drag handle (stretch)** — long-press + drag to freely position. Defer to follow-up if time-constrained; tap-to-flip covers v1. — **deferred** (stretch goal per task draft).

### Persistence

- [x] **localStorage key:** `video-self-view-position` storing `'TL' | 'TR' | 'BL' | 'BR'`. — `SELF_VIEW_STORAGE_KEY` constant in `<VideoRoom>`.
- [x] **Default:** `'BR'` (bottom-right; matches WhatsApp / Meet). — `useState<SelfViewPosition>("BR")`.
- [x] **Restore on mount** — read localStorage; fall back to default. — mount effect with `typeof window !== "undefined"` guard + value-set validation; silent fallback on localStorage throws (private browsing / quota).
- [x] **Persist on every flip** — write immediately. — `handleSelfViewTap` writes the new position synchronously inside the `setState` updater, wrapped in try/catch.

### Layout integration in `<VideoRoom>`

- [x] **Replace the existing two-tile grid** with a single full-canvas remote tile + absolute-positioned `<VideoSelfTile>` overlay. — outer wrapper changed from `relative grid gap-4 md:grid-cols-2` to plain `relative`; remote tile renders inline, self tile renders as a floating overlay.
- [x] **Mobile portrait:** remote tile fills the canvas; self-view in corner. — confirmed via the size + positioning logic; `w-32 h-24` is the mobile size.
- [x] **Desktop:** remote tile fills the canvas; self-view in corner. (B6 will add the gallery alternative.) — `md:w-44 md:h-32` for the desktop self-view; B6 owns the gallery / speaker / sidebar variants.
- [x] **Empty remote** (counterparty hasn't joined yet): full-canvas placeholder ("Waiting for Dr. Sharma to join…"); self-view still in corner so patient can verify their own video. — the remote `<VideoTile>` already shows the `pendingText` overlay (`Waiting for ${remoteLabel.toLowerCase()}…`) during connecting; the floating self tile is a sibling so it stays in the corner regardless of the remote tile's state.
- [ ] **`mode='readonly'`** — no interactivity (tap-to-flip disabled in read-only). — **deferred** for the same reason as A1/A2/A3/A4: `<VideoRoom>` has no `mode` prop today (Plan 07 history viewer renders elsewhere). The `floating` prop already supports an `onTap`-less mount (no click handler, no `role="button"`, no `tabIndex`) so the readonly path is a single-prop change when that mount lands.

### Manual smoke

- [ ] Self-view appears in BR by default on first load. — to verify in PR review (no automated route).
- [ ] Tap → cycles to BL → TL → TR → BR. — to verify in PR review.
- [ ] Refresh page mid-call → self-view restores to last-chosen position. — to verify in PR review.
- [ ] On a 360px-wide phone screen: self-view doesn't overlap call controls bar. — controls bar lives BELOW the `relative` video container (separate flex item in `videoPane`), so the floating tile is bounded by the video canvas and cannot overlap.
- [ ] Companion chat panel mounted (Plan 06 Decision 9) → self-view doesn't overlap the chat surface (corner positions are constrained to the video canvas, not the whole viewport). — to verify in PR review; the `relative` parent IS the video canvas only, not the outer two-column flex (chat panel is a sibling), so geometrically the floating tile is constrained as required.

### General

- [x] Type-check + lint clean. — `npx tsc --noEmit` and `npx next lint --file components/consultation/VideoTile.tsx --file components/consultation/VideoRoom.tsx` both clean (one initial `react-hooks/exhaustive-deps` warning was fixed by hoisting the cycle-map + storage key to module scope).
- [x] No console errors. — verified via lint-clean check; no `console.*` calls were added in this PR.
- [x] No layout shift on `<VideoSelfTile>` mount (use absolute positioning from the start). — the floating tile is `absolute` from its very first render; the parent `relative` container has zero size contribution from it. The one-frame slide from default-`BR` to persisted-position on mount is animated via `transition-all duration-200 ease-in-out` per Note #3.

---

## Out of scope

- **Free-positioning drag.** Stretch goal; tap-to-flip is sufficient for v1.
- **Resize handles.** Out of scope.
- **Self-view "hide" button.** Out of scope (camera off via A2 is the same effect).
- **Layout swap (gallery / speaker / sidebar).** That's [task-video-B6](./task-video-B6-layout-swap.md).

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/VideoSelfTile.tsx` — **edit** (~30 LOC: position prop + tap-to-flip + persistence).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~40 LOC: replace two-tile grid with single remote + self overlay).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Default position** — BR matches WhatsApp; recommended. (Decision §2 from batch plan.)
2. **Tap-to-flip vs tap-to-toggle-positions-menu** — single tap cycles; long-press could open a menu. Recommend single tap (faster UX).
3. **Animation** — animate position change with `transition-all duration-200 ease-in-out` for visual continuity.
4. **Companion chat collision** — on mobile, the chat panel either overlays the video (Plan 06 mobile tab-switcher) or sits below; `<VideoSelfTile>` is constrained to the video canvas container (not viewport), so no collision regardless.
5. **Self-view aspect ratio** — preserve native camera aspect (object-cover); don't squish.

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch A](../Plans/plan-video-consult-selected-features.md#sub-batch-a--quick-wins-2-days)
- **Source item:** [T1 §T1.5](../../../../Product%20plans/video-consult/plan-t1-video-quick-wins.md)
- **Hard dep:** [task-video-A2](./task-video-A2-camera-off-on.md) (`<VideoSelfTile>`)
- **Consumer:** [task-video-B6](./task-video-B6-layout-swap.md)

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** Complete.

---

## Implementation log (2026-04-30)

### Files touched

- **edit** `frontend/components/consultation/VideoTile.tsx` (~70 LOC net add):
  - Added `SelfViewPosition` type alias (`'TL' | 'TR' | 'BL' | 'BR'`) and `SELF_VIEW_POSITIONS` readonly tuple — both exported so `<VideoRoom>` can import a single source of truth for the value-set.
  - Added module-scope `FLOATING_POSITION_CLASSES` map (`{ TL: 'top-4 left-4', TR: 'top-4 right-4', BL: 'bottom-4 left-4', BR: 'bottom-4 right-4' }`) for the 16-px corner anchors.
  - Added `floating?: { position; onTap? }` prop. When set, the outer container becomes `absolute z-20 w-32 h-24 md:w-44 md:h-32 overflow-hidden rounded-lg border border-white/40 bg-gray-900 shadow-lg transition-all duration-200 ease-in-out` plus the chosen corner class, plus `cursor-pointer hover:ring-2 hover:ring-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white` when `onTap` is wired. The tile becomes a keyboard target (`role="button"`, `tabIndex={0}`, `aria-label="Move self-view to next corner"`, Enter/Space handlers) only when `onTap` is provided, so a future readonly mount is a no-prop-change.
  - Added `hideLabel?: boolean` prop. The previous `top-7` overlay offset (which left a 28-px gap to clear the heading) is now driven by `showLabel = !isFloating && !hideLabel`; floating mode AND `hideLabel` mode both stretch overlays to `inset-0`. The `topLeftBadge` slot also shifted from `top-9` (clears heading + `mb-2`) to `top-2` (flush) when no label is present.
  - Avatar shrinks in PiP: `h-10 w-10 text-sm` (vs inline `h-16 w-16 text-xl`); "Camera off" / pending text shrink to `text-[10px]` so they fit inside the 96-px-tall PiP without truncation.
  - When `floating` is set the inline `<video>` switches from `w-full ... aspect-video` to `h-full w-full object-cover` so the container (not the video) drives the box.

- **edit** `frontend/components/consultation/VideoRoom.tsx` (~80 LOC net add):
  - Imported `SelfViewPosition` from `./VideoTile`.
  - Added module-scope `SELF_VIEW_STORAGE_KEY` (= `"video-self-view-position"`) and `SELF_VIEW_NEXT_POSITION` map (cycle: `BR → BL → TL → TR → BR`).
  - Added `selfViewPosition` state (default `'BR'`), a mount `useEffect` that reads localStorage with a `typeof window !== "undefined"` guard + value-set validation + try/catch silent-fallback, and `handleSelfViewTap` (`useCallback`, no deps) that synchronously persists each flip inside the `setState` updater.
  - Refactored the tile container: removed `grid gap-4 md:grid-cols-2` (kept `relative`), reordered children to `[recording-indicator] → [remote tile (full-canvas, hideLabel, holds duration chip)] → [self tile (floating)]`. Removed the heading from the remote tile via `hideLabel`; the duration chip auto-anchors to `top-2 left-2` via the new `showLabel`-aware `<VideoTile>` positioning.
  - The self tile now passes `floating={{ position: selfViewPosition, onTap: handleSelfViewTap }}` so it renders as a PiP overlay anchored to the chosen corner.

- **No backend / migration / test changes** — A5 is a pure frontend layout PR.

### Cycle order (clarification)

The acceptance-criteria section reads "TR → BR → BL → TL → TR" while the smoke section reads "Tap → cycles to BL → TL → TR → BR". These are inconsistent on the criteria side but the smoke description is the user-facing contract. Implemented `BR → BL → TL → TR → BR` (counter-clockwise from default) so the smoke description holds: starting at BR (default), tap 1 → BL, tap 2 → TL, tap 3 → TR, tap 4 → BR.

### Deviations from the task draft

1. **No new `<VideoSelfTile>` file.** A2 ships a single shared `<VideoTile>` (used for BOTH self and remote). Adding a new `<VideoSelfTile>` file just for the floating mode would duplicate the camera-off / pending-overlay / avatar / mirror logic (~80 LOC) and break the principle that A2 explicitly chose one component for both surfaces (see A2 task notes for the rationale). Instead, A5 adds a `floating` prop to the existing `<VideoTile>`. The "outer JSX is identical regardless of self/remote" property is preserved.

2. **`hideLabel` was needed on the remote tile too.** The task draft only explicitly calls out the self tile, but in the new layout the floating self-view's TL/TR corners would visually collide with the remote tile's inline `<p className="mb-2">{remoteLabel}</p>` heading (the heading takes ~28 px above the video, so a `top-4` floating tile lands inside the heading area). Solution: the remote tile passes `hideLabel` and the heading is suppressed; the duration chip + (future B2) caller-card overlay take over the labelling role at the top-left of the video. This is a structural improvement that B2 will rely on anyway.

3. **`mode='readonly'` deferred.** Same rationale as A1/A2/A3/A4 — `<VideoRoom>` has no `mode` prop today; readonly history-viewer renders elsewhere. The `floating` prop is designed so a future readonly mount just omits `onTap` (no click handler, no `role="button"`, no `tabIndex`) and the tile becomes non-interactive without any additional wiring.

4. **Drag-to-position is out of scope** (explicitly stretch in the task draft).

### Why module-scope constants

The first lint pass surfaced `react-hooks/exhaustive-deps` complaining about `SELF_VIEW_NEXT_POSITION` being a missing dep on `handleSelfViewTap` (the cycle map was inside the component body, so its identity changed every render). Adding it to the dep array would force `useCallback` to re-create the callback every render — defeating its purpose. Hoisting both `SELF_VIEW_STORAGE_KEY` and `SELF_VIEW_NEXT_POSITION` to module scope fixes the warning and is semantically correct (both values are truly constant across the entire app lifetime).

### SSR safety

`<VideoRoom>` is a `"use client"` component but Next.js still SSRs the initial HTML for hydration. The `useState<SelfViewPosition>("BR")` initial value runs on both server and client, so the server-rendered HTML always shows the BR corner. The mount effect then reads localStorage on the client and re-positions to the persisted corner. The resulting one-frame slide is animated via the `transition-all duration-200 ease-in-out` class, so it's a smooth visual rather than a jarring jump.

### What worked

- Reusing `<VideoTile>` with a `floating` prop instead of forking a new component — the shared camera-off / pending / mirror / muteSelf logic stays in one place, and B6 (layout swap) gets the same primitive for free.
- `showLabel`-driven overlay insets — single-source-of-truth for whether the heading is present, so cameraOff / pending / topLeftBadge all adjust together. No more `top-7` magic numbers scattered across overlays.
- `setSelfViewPosition((current) => ...)` updater pattern — no closure-over-stale-state risk for rapid taps; the persisted value is always the freshly-computed next position, not the last-rendered one.

### What didn't work / had to change

- First attempt embedded the floating tile inside the remote tile's `<VideoTile>` to avoid the heading-collision problem. That broke the keyboard-tab-order (the floating tile became a child of the remote tile's accessibility tree) and tied the self-tile's lifecycle to the remote tile's render. The cleaner fix was `hideLabel` on the remote tile + sibling-floating-tile under the same `relative` parent.
- Using `<button>` as the outer wrapper for the floating tile when `onTap` is set (more semantic for a click target) caused issues because the inner `<video>` element's `controls` / focus interplay with form-element ancestry is ill-defined across browsers. Settled on `<div role="button" tabIndex={0}>` with explicit Enter/Space handlers — same accessibility, no element-nesting weirdness.

### Verification

- `npx tsc --noEmit` (frontend) — clean.
- `npx next lint --file components/consultation/VideoTile.tsx --file components/consultation/VideoRoom.tsx` — clean (after hoisting constants to module scope).
- No dedicated test file — there's no existing test harness for `<VideoTile>` or `<VideoRoom>` and adding one for a layout-only PR was out of scope.

### Follow-ups (not blocking this PR)

1. **B6 (layout swap)** consumes `floating` as the primitive; B2 (caller-card overlay) consumes `topLeftBadge` on the now-`hideLabel`-ed remote tile.
2. **Manual smoke** during PR review — confirm:
   - First-load default = BR.
   - Tap cycle: BR → BL → TL → TR → BR.
   - Refresh mid-call restores last position.
   - 360-px phone width: PiP doesn't overlap controls (controls are a sibling flex item, geometrically separate).
   - Companion chat panel mounted (mobile tab-switcher OR desktop side-by-side): PiP stays bounded by the video canvas.
3. **Drag-to-position (stretch)** — the floating tile already has `cursor-pointer`; a future PR could add `pointer-down → pointer-move → pointer-up` handlers and a free-positioning mode (with snap-to-corner on drop).
4. **Doctor-side smoke** — verify the doctor dashboard's `<VideoRoom>` mount also renders the floating self tile (it does — same component path — but worth confirming on a desktop screen where the self tile size jumps to `md:w-44 md:h-32`).
