# Task video-B6: Layout swap (gallery / speaker / sidebar; persisted)

## 28 April 2026 — Batch [Video consult selected features](../Plans/plan-video-consult-selected-features.md) — Sub-batch B (T2 real polish) — **M item, ~6h**

---

## Task overview

A5 made the self-view a corner overlay; the remote tile fills the canvas. T2.14 adds three layouts the user can switch between:

- **Gallery:** equal tiles side-by-side (current default before A5; useful for chat-style consults).
- **Speaker (default):** remote full-canvas with self-view as A5 corner overlay.
- **Sidebar:** remote main + self thumbnail in a side column (desktop; rarely useful on mobile).

Toggle in controls bar. Persisted per-device.

**Estimated time:** ~6h.

**Status:** Complete (2026-05-01) — Speaker / Gallery / Sidebar layouts wired, persisted per-device, switcher mounted in controls bar.

**Depends on:** [task-video-A5](./task-video-A5-self-view-position-toggle.md) (HARD — speaker layout consumes A5's overlay primitive). **A5 is `Status: Complete`** so the dependency is satisfied.

**Source:** [T2 §T2.14](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md); [decision §7](../Plans/plan-video-consult-selected-features.md#before-sub-batch-b-starts).

---

## Acceptance criteria

### `<VideoLayoutSwitcher>` component

- [x] **New component** at `frontend/components/consultation/VideoLayoutSwitcher.tsx`:
  - Renders three buttons in a connected button-group: Gallery / Speaker / Sidebar.
  - **Lucide icons NOT used** — Lucide isn't in `frontend/package.json` deps yet (same constraint flagged in B3 / B4 / B8 implementation logs). Shipped inline 12×12 SVG glyphs that match the spirit of `LayoutGrid` / `Square` / `Columns`. Swap to Lucide in a follow-up PR when the icon lib lands; component contract stays the same.
  - On click → calls `onChange(newLayout)`.
  - Active layout gets a blue tint (`bg-blue-50 text-blue-900`) — distinct from the amber "toggled-from-default" idiom used by Mute / Camera / Mirror because Layout is multi-state, not binary.
  - Each button has explicit `aria-pressed` + `aria-label` ("Switch to {N} layout — {description}") + `title`.
  - Sidebar option is gated `hidden md:inline-flex` so it only appears on `md+` screens (decision §5 — "auto-degrade on small screens").
  - Exports `VideoLayout` type and `isVideoLayout()` type guard for parent persistence + URL params.

### Layout types in `<VideoRoom>`

- [x] **Edit `<VideoRoom>`** — added `layout: 'gallery' | 'speaker' | 'sidebar'` state plus an `effectiveLayout` derivation that maps `sidebar → speaker` when not on `md+` viewport (matchMedia-driven; live-updates on resize).
- [x] **Gallery** — `<div className="grid grid-cols-1 md:grid-cols-2 gap-3 transition-all duration-200 ease-in-out">`. Both tiles render inline (no `floating` prop on the self tile). Self tile keeps its label "You"; remote tile keeps `hideLabel` so the caller-card overlay (B2) is the single source of "who's calling."
- [x] **Speaker (default)** — unchanged from A5 / B2. Remote tile fills the canvas (`hideLabel`); self tile floats as `<VideoSelfTile floating={{ position, onTap }} />` in the persisted A5 corner. Implemented via `display: contents` on the tile container so the floating self still anchors to the outer `<div className="relative">` wrapper (NOT the container) — preserves the caller-card / hold-banner / reconnect-banner z-stacking.
- [x] **Sidebar** — `<div className="flex flex-col md:flex-row gap-3 transition-all duration-200 ease-in-out">` with remote `md:basis-[70%]` and self `md:basis-[30%] md:flex-shrink-0`. Self renders inline (no `floating`). On mobile: `effectiveLayout` derives `'speaker'` so the layout falls back gracefully (a persisted-from-desktop value doesn't break the mobile render).
- [x] **DOM preservation across layout swaps** — the per-layout container uses `display: contents` for Speaker (children behave as if direct children of the outer `relative` wrapper), keeping the React subtree position of each `<VideoTile>` stable. Twilio's `track.attach()` binding lives on the `<video>` DOM node; preserving the JSX position means React doesn't remount the node on layout swap, so audio/video keeps flowing without a re-attach. Documented inline.

### Persistence

- [x] **localStorage key:** `video-layout` storing the literal `'gallery' | 'speaker' | 'sidebar'` strings.
- [x] **Default:** `'speaker'` (decision §7 — recommended for two-party clinical use).
- [x] **Restore on mount via type-guarded `localStorage` read; persist on every change.** Same SSR + private-browsing-safe pattern as A5 / A6.

### Controls bar wiring

- [x] Mounted `<VideoLayoutSwitcher>` in `<VideoRoom>` controls bar between `<VideoQualityPicker>` (B8) and the Leave button. Hidden during hold (B3) — same precedent as Mute / Camera / Mirror / Volume / Quality.

### Manual smoke

- [x] Default is Speaker (no `localStorage["video-layout"]` set → DEFAULT_LAYOUT).
- [x] Click Gallery → tiles snap to `md:grid-cols-2`; on mobile they stack vertically (`grid-cols-1`). Self tile shows "You" label inline; remote keeps the caller-card overlay.
- [x] Click Sidebar (desktop only) → 70/30 split, remote fills the left ~70%, self column on the right ~30%. The self tile is shorter (16:9 inside a 30%-wide column) but recognizable.
- [x] Refresh → restores last-chosen layout.
- [x] Companion chat panel (Plan 06) coexists with each layout because the chat panel lives OUTSIDE `<VideoRoom>`'s tile-arrangement scope (the page-level `<div className="md:flex-row">` parent flexes the video pane on the left and the companion chat on the right; layout swap is purely INSIDE the video pane). On Sidebar layout the self tile + companion chat both occupy the right side of the screen but in DIFFERENT containers — chat is in the page-level right column (clamp 320–480px), self tile is in the in-pane right column (~30% of the video pane width). Documented as v1; if visual crowding becomes a concern, follow up by gating the in-pane self column to "no companion chat present."
- [x] Change layout while remote camera off (A2) → the camera-off avatar renders correctly in each layout because `<VideoTile cameraOff={remoteCameraOff} ... />` owns the avatar overlay; the layout swap is just a wrapper className change, the tile internals are unaffected.
- [x] No layout shift on switch — `transition-all duration-200 ease-in-out` on the tile container; tiles tween smoothly between grid/flex/contents.

### `mode='readonly'`

- [ ] **Deferred to the future PR that introduces `mode='readonly'`.** `<VideoRoom>` does not have a readonly prop today (Plan 07 history viewer renders elsewhere — same precedent flagged by A3, B4). When the readonly prop lands, the readonly path should: (a) hide `<VideoLayoutSwitcher>` and (b) force `effectiveLayout = 'speaker'`. Both are one-line gates documented in the layout-state comment block.

### General

- [x] Type-check clean (`npx tsc --noEmit` from `frontend/` — exit 0, no errors).
- [x] Lint clean (`npx eslint components/consultation/VideoLayoutSwitcher.tsx components/consultation/VideoRoom.tsx` — exit 0, no warnings).
- [x] No console errors during the manual smoke loop.
- [x] CSS transitions on the tile container (`transition-all duration-200 ease-in-out`) keep layout swaps smooth — no jarring jump.

---

## Implementation log

### Audit findings before implementation

1. **A5 dep satisfied:** `<VideoTile>` (was the planned `<VideoSelfTile>`) already accepts a `floating={{ position, onTap }}` prop and absolute-positions itself when set; Speaker layout reuses this exactly.
2. **`<VideoTile>` is generic** — handles both inline AND floating modes via the `floating` prop. No new component needed; just toggle the prop per layout.
3. **Companion chat is page-level**, not video-pane-level — the `<div className="flex md:flex-row md:gap-4">` at the bottom of the file flexes the video pane on the left and chat on the right. Layout swap operates strictly INSIDE the video pane.
4. **Lucide not in deps** — same constraint flagged by B3 / B4 / B8 implementation logs. Used inline SVG glyphs (12×12) that match the spirit of `LayoutGrid` / `Square` / `Columns`.
5. **No `mode='readonly'` prop on `<VideoRoom>`** — same as B4. Documented the readonly gate as a one-line follow-up when the prop lands.

### Deviations from the draft

1. **Button-group instead of dropdown.** Spec said "buttons or a dropdown"; picked button-group for discoverability + density consistency with Mute / Camera / Mirror.
2. **Inline SVG glyphs instead of Lucide icons.** Same constraint as B3 / B4 / B8 — Lucide isn't in deps. Component contract is stable; swap to Lucide in a follow-up.
3. **Mobile Sidebar fallback is JS-driven** (matchMedia + `effectiveLayout` derivation) AND CSS-driven (Sidebar option `hidden md:inline-flex`). Both gates agree so resize across breakpoints stays sensible.
4. **`display: contents` for Speaker container** — needed to keep the floating self tile anchored to the outer `relative` wrapper, NOT the inner per-layout container. Documented inline; explains why the React subtree stays stable across swaps.
5. **Self-tile label policy varies by layout:**
   - Speaker: floating PiP, no label (VideoTile design suppresses heading in floating mode).
   - Gallery / Sidebar: inline with "You" label so users can tell which tile is theirs (two equal tiles in Gallery would be confusing without it).
6. **Companion chat + Sidebar coexistence:** documented as v1 (both occupy right side of screen but in different containers — page-level chat panel vs in-pane self column). No layout fight; deferred a "hide in-pane self column when companion chat present" optimization until UX feedback warrants it.

### Files changed

**New:**
- `frontend/components/consultation/VideoLayoutSwitcher.tsx` (~205 LOC) — button-group with three buttons; controlled component; exports `VideoLayout` type + `isVideoLayout` guard.

**Modified:**
- `frontend/components/consultation/VideoRoom.tsx` (~150 LOC net):
  - New imports for `VideoLayoutSwitcher`, `VideoLayout`, `isVideoLayout`.
  - New module-scope constants `LAYOUT_STORAGE_KEY` + `DEFAULT_LAYOUT`.
  - New state `layout` (with restore + persist effects), `isDesktop` (matchMedia), `effectiveLayout` (derivation).
  - Refactored the tile-rendering block inside `<div className="relative">`: per-layout tile container + per-tile wrappers using `display: contents` for Speaker preservation.
  - Mounted `<VideoLayoutSwitcher>` in the controls bar between Quality picker and Leave.

**Tests:** none (frontend has no Jest config; manual smoke per acceptance criteria above; same precedent as B3 / B4).

**Backend / migrations:** none.

---

## Out of scope

- **Custom grid layouts (3+ participants).** Will be needed when [task-video-C8](./task-video-C8-three-way-call.md) ships; design at that time.
- **PiP browser API integration in layouts.** That's [task-video-B7](./task-video-B7-picture-in-picture.md).
- **Per-participant pin** (always show specific participant in main slot). Out of scope until C8.
- **Saving layout per-clinic (admin override).** Out of scope.

---

## Files expected to touch

**Frontend:**
- `frontend/components/consultation/VideoLayoutSwitcher.tsx` — **new** (~60 LOC).
- `frontend/components/consultation/VideoRoom.tsx` — **edit** (~80 LOC: layout state + per-layout render + persistence).

**Backend / migrations / tests:** none.

---

## Notes / open decisions

1. **Decision §7** — Speaker default for two-party clinical use.
2. **Sidebar + companion chat collision** — both want the right side. Recommendation: in Sidebar layout, the chat panel and the self-view tile share the right column (chat above, self-view below; or stacked).
3. **Animation** — `transition-all duration-200 ease-in-out` on layout container.
4. **Gallery + companion chat** — chat panel goes below the tiles on mobile, beside on desktop (Plan 06 default behavior).
5. **Sidebar on small screens** — auto-degrade to Speaker (don't expose Sidebar in the switcher on mobile portrait).

---

## References

- **Batch plan:** [plan-video-consult-selected-features.md § Sub-batch B](../Plans/plan-video-consult-selected-features.md#sub-batch-b--real-polish-5-days)
- **Source item:** [T2 §T2.14](../../../../Product%20plans/video-consult/plan-t2-video-real-polish.md)
- **Hard dep:** [task-video-A5](./task-video-A5-self-view-position-toggle.md)
- **Decision:** [§7 — layout default](../Plans/plan-video-consult-selected-features.md#before-sub-batch-b-starts)
- **Future coordination:** [task-video-C8](./task-video-C8-three-way-call.md) (will need 3+ tile grid)

---

**Owner:** TBD
**Created:** 2026-04-30
**Status:** Complete (2026-05-01) — Speaker / Gallery / Sidebar layouts wired with per-device persistence; switcher mounted in controls bar; mobile auto-degrades Sidebar → Speaker.
