# Task cs-05: Reposition `AppointmentChartRail` collapse toggle (in-flow rail header, parity with `RxRailToggle`)

## 09 May 2026 — Batch [Cockpit shell redesign](../plan-cockpit-shell-redesign-batch.md) — Phase A, Lane α step 1 — **S, ~1.5h**

---

## Task overview

The chart-rail collapse toggle currently renders as a tiny absolute-positioned chevron:

```tsx
<button
  type="button"
  onClick={onToggleCollapsed}
  className="absolute right-1 top-3 z-10 rounded …"
  aria-label={collapsed ? 'Expand chart' : 'Collapse chart'}
>
  {collapsed ? '▶' : '◀'}
</button>
```

The user reported this as "patient chart toggle is way out oddly placed". Two concrete problems:

1. **Absolute positioning bleeds across the column boundary.** `right-1` puts the toggle ~4px from the rail's right edge, which on collapsed-rail width (~80px) lands it on top of the resize handle / column boundary — visually intrusive.
2. **Inconsistent with `RxRailToggle`.** The Rx side uses a vertical-stub button anchored at the column boundary with a clear hover affordance and a stable position. The chart side uses a tiny chevron with no boundary anchor. Two collapse affordances on the same screen, two different shapes.

This task moves the toggle **into the rail header in-flow** (top-right of the rail's own content area, not absolute), matches the `RxRailToggle` aesthetics, and stops bleeding across the column boundary.

> **Note:** Phase B (cs-08) will eventually replace **both** the chart toggle and `<RxRailToggle>` with a `<ResizableHandle withHandle>` plus a discrete collapse button per panel header. cs-05 is a stopgap that makes the *current* shape at least consistent — so during Wave 1 (before the structural rewrite) the cockpit doesn't look broken. cs-08 will reuse the in-flow positioning from cs-05 unchanged.

**Estimated time:** ~1.5h.

**Status:** Done — 2026-05-10.

**Hard deps:** none. Stitch onto cs-01 in the same chat (both touch `AppointmentChartRail.tsx`).

**Source:** [plan-cockpit-shell-redesign-batch.md § Why this batch (3)](../plan-cockpit-shell-redesign-batch.md#why-this-batch).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **No** — stitch onto the cs-01 chat. Both tasks touch `AppointmentChartRail.tsx`; cohesive review.

**Estimated turns:** 1–2 turns.

---

## Acceptance criteria

### Reposition into the rail header

- [ ] In `frontend/components/ehr/AppointmentChartRail.tsx`, locate the existing rail header (likely a `<header>` or `<div>` at the top with the chart title — e.g. "Patient chart"). If a header doesn't exist, **create one** (a thin sticky bar at the top of the rail, ~40px, white bg, bottom border).

- [ ] Move the collapse button from absolute-positioned `<button>` to a **trailing element** in that header:

  ```tsx
  <header
    className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-3 py-2"
    style={{ top: 'var(--cockpit-header-h)' }}
  >
    <h3 className="text-sm font-semibold">Patient chart</h3>
    <button
      type="button"
      onClick={onToggleCollapsed}
      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"
      aria-label={collapsed ? 'Expand chart' : 'Collapse chart'}
    >
      {collapsed ? <ChevronRightIcon className="h-4 w-4" /> : <ChevronLeftIcon className="h-4 w-4" />}
    </button>
  </header>
  ```

  - The header is sticky to the rail's own scroll context — it won't scroll out of view as the chart content scrolls. After cs-07 wraps the rail in an independently-scrolling column, this is "free" — the header sticks to the column's top.
  - `style={{ top: 'var(--cockpit-header-h)' }}` is consumed from cs-01.
  - Use Lucide icons (`ChevronLeft` / `ChevronRight`) instead of glyphs `◀` / `▶` for parity with the rest of the cockpit.

### Mirror the same shape on `<RxRailToggle>` (parity)

- [ ] **Audit** `RxRailToggle.tsx`. If its current shape is a vertical-stub button anchored to the panel boundary, leave it; the two surfaces don't have to be visually identical, just behaviourally consistent (chevron direction, accessibility label, keyboard reachable).
- [ ] If the Rx toggle also uses `absolute` positioning that bleeds across the boundary, apply the same in-flow refactor: a small chevron in the top-right of the Rx column header.
- [ ] **Document the chosen shape in code comments** — future cs-08 will replace both, but the comment helps the cs-08 implementer understand the intent.

### Collapsed-state representation

- [ ] When `collapsed=true`:
  - The rail's body (chart content) is hidden (`display: none` or `hidden` class — whichever the rail uses today).
  - The rail's header stays visible at narrow width (~48px), showing only the chevron (h3 hidden via `hidden` or by the parent collapsing the column to icon-only width).
  - `aria-expanded={!collapsed}` on the toggle.

  The exact "narrow width" CSS lives in the parent (`<ConsultationCockpit>` decides the column span); this task only handles the header's rendering. cs-08 cleans up the parent.

### A11y

- [ ] `aria-label` flips between "Expand chart" and "Collapse chart" based on `collapsed`.
- [ ] `aria-controls={chartContentId}` references the chart body region (give it an id like `chart-body`).
- [ ] Keyboard: `Tab` reaches the toggle, `Enter` / `Space` activates.

### Tests

- [ ] If `appointment-chart-rail.test.tsx` exists, add:
  - Toggle is rendered inside the rail header (not absolute).
  - Click toggles `collapsed` state via callback.
  - `aria-label` flips correctly.
- [ ] Visual smoke: open the cockpit, click the toggle. The rail collapses. The toggle stays clickable in the collapsed state. Click again — rail expands.

---

## Out of scope

- **Resize behaviour.** Resize via drag handle is cs-08. cs-05 is collapse-only.
- **Persisting `collapsed` to localStorage.** Currently it's a per-session preference (resets on refresh). cs-08's `autoSaveId` covers persistence as a side-effect.
- **The Rx column's body layout.** This task only touches the rail header / toggle. The chart body content is unchanged.

---

## Files expected to touch

**Modified:**
- `frontend/components/ehr/AppointmentChartRail.tsx` (~30 LOC delta — replace absolute button with in-flow header).
- `frontend/components/consultation/cockpit/RxRailToggle.tsx` (only if it suffers the same bleed; ~20 LOC if so, 0 if already in-flow).
- `frontend/components/ehr/__tests__/AppointmentChartRail.test.tsx` (if present; ~15 LOC delta).

**New:** none (the rail header may need to be extracted, but inline rendering is fine for now).

---

## Notes / open decisions

1. **Sticky vs. fixed-flow rail header.** `sticky top-[var(--cockpit-header-h)]` is the right choice today (current shell is page-scroll). cs-07 changes to fixed-height columns; in that world the rail header can be plain `flex` (not sticky) because its own column doesn't scroll past it. cs-08 will simplify accordingly. **Leave the sticky for now** — it works in both shells.
2. **Why an `<h3>` and not a divless title?** Semantic — `<h3>` advertises "section header" to screen readers and gives keyboard nav a stable landmark. The visual treatment is `text-sm font-semibold`, which doesn't look like a heading; that's fine for screen readers, who care about the role, not the visual weight.
3. **Collapsed-rail width.** Today the parent uses `lg:grid-cols-2` (collapsed) vs `lg:grid-cols-3` (expanded). After cs-07, this becomes a `<ResizablePanel>` with `defaultSize={26}` and a `collapsedSize={5}`. This task doesn't change that mechanism; just doesn't break it.
4. **Why use Lucide icons instead of glyphs?** Glyph `◀` doesn't render consistently across systems (Windows shows a bigger / boxier triangle than macOS). Lucide gives us SVG with predictable sizing and color inheritance.

---

## References

- **Affected files:**
  - `frontend/components/ehr/AppointmentChartRail.tsx`
  - `frontend/components/consultation/cockpit/RxRailToggle.tsx` (parity check; possibly unchanged)
- **Stitched precursor:** [`task-cs-01-cockpit-css-variables.md`](./task-cs-01-cockpit-css-variables.md) — same chat.
- **Successor (replaces this affordance entirely):** [`task-cs-08-resizable-panels-wiring.md`](./task-cs-08-resizable-panels-wiring.md).

---

**Owner:** TBD
**Created:** 2026-05-09
**Status:** Done — 2026-05-10
