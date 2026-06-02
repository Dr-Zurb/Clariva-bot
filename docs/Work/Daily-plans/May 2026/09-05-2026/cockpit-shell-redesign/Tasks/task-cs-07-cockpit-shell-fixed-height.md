# Task cs-07: Refactor cockpit desktop shell — page-scroll/sticky → fixed-height + per-column scroll

## 09 May 2026 — Batch [Cockpit shell redesign](../plan-cockpit-shell-redesign-batch.md) — Phase B, Lane δ step 1 — **L, ~4h**

> **This is the structural rewrite.** Big task. Touches every cockpit state. Mobile / tablet (`<lg`) is **not** in scope and must remain byte-identical to today.

---

## Task overview

Today, `<ConsultationCockpit>` renders on `lg+` as a CSS grid:

```tsx
<div className="-m-4 md:-m-6">
  <CockpitHeader … />
  <CockpitQueueRail … />

  <div className="lg:grid lg:grid-cols-12 lg:gap-4">
    {/* chart rail at lg:col-span-3 / lg:col-span-1 (collapsed) */}
    {!chartCollapsed && <AppointmentChartRail … />}
    {chartCollapsed && <RailCollapsedStub … />}

    {/* center body — adapts to chart/rx collapse via computeColSpans() */}
    <main className={`lg:col-span-${centerSpan}`}>
      {/* state-pane: idle / ready / inCall / ended */}
    </main>

    {/* rx workspace at lg:col-span-3 / lg:col-span-1 (collapsed) */}
    {!rxCollapsed && <RxWorkspace … />}
    {rxCollapsed && <RxRailCollapsedStub … />}
  </div>
</div>
```

The page scrolls. Each rail is `sticky` to compensate. The result:

1. **Long Rx forms scroll the consultation room out of view.** The doctor can't see the patient while they type.
2. **Sticky-offset arithmetic is fragile.** cp-09 added 24px to the header; cs-01 patches the offsets, but the model itself is brittle.
3. **`computeColSpans` is a janky proxy for proper resize.** Three boolean flags (chart collapsed, Rx collapsed) → 4 hard-coded grid configurations. Adding any new rail multiplies the matrix.

cs-07 replaces the desktop shell with a **fixed-height flex container** where each column scrolls independently:

```tsx
<div
  className="hidden lg:flex lg:h-[calc(100vh-var(--app-header-h)-var(--cockpit-header-h)-var(--cockpit-queue-h))] lg:overflow-hidden"
>
  <ColumnChart className="overflow-y-auto" />
  <ColumnBody  className="overflow-y-auto" />
  <ColumnRx    className="overflow-y-auto" />
</div>
```

Below `lg`, the **existing layout stays unchanged** — single-column flow, page-scroll, `MobilePillBar` at the bottom.

cs-07 ships the fixed-height + per-column-scroll shape. **cs-08 then wraps it in `<ResizablePanelGroup>`** for drag-resize + collapse-via-panel-API. Splitting the work this way keeps cs-07's diff focused on layout-not-resize-mechanics.

**Estimated time:** ~4h. **Estimated turns:** 6–10.

**Status:** Done — 2026-05-10. Desktop shell rewritten as a fixed-height flex container with three independently-scrolling columns; `chartCollapsed` lifted from `<AppointmentChartRail>` into the cockpit; `computeColSpans()` and the narrow-lg "Open Rx pill" branch deleted; `<CockpitHeader>` / `<CockpitQueueRail>` flip to `lg:static` so the page no longer scrolls on `lg+`; `<RxRailToggle>` and `<AppointmentChartRail>` no longer carry their own sticky/`h-[calc(...)]` chrome (the column owns scroll). New regression test: `frontend/components/consultation/__tests__/ConsultationCockpit.shell.test.tsx`. Mobile / tablet (`<lg`) branch unchanged.

**Hard deps:** [`cs-06`](./task-cs-06-add-resizable-panels-dep.md) merged (we don't *use* the primitive yet, but cs-08 immediately afterwards does, and ordering matters for the PR review story).

**Source:** [plan-cockpit-shell-redesign-batch.md § CS-D1](../plan-cockpit-shell-redesign-batch.md#decision-lock-locked-2026-05-09-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Opus 4.7 Thinking-XHigh**.

**Why Opus?** This rewrite touches every cockpit state (`idle`, `ready`, `inCall`, `ended`) and every modality (video / voice / text / in-clinic). It's structural and edge-case-heavy: the four states have different vertical-rhythm requirements, the ended state mounts an `EndOfDayCard` that must NOT scroll out of view, and the in-call state has nested scroll containers (e.g. text-room transcript). Sonnet will get most of it right but miss subtle states.

**New chat?** **Yes** — this is the second task in Lane δ, but it's big enough to deserve its own focused chat.

### Pre-load list (extensive — Opus + this many files is the right tradeoff)

- This task file.
- `frontend/components/consultation/ConsultationCockpit.tsx` (the file being rewritten — read all of it).
- `frontend/lib/consultation/cockpit-state.ts` (the state machine; cs-07 must preserve every state's render contract).
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (read-only — sticky positioning above the new shell).
- `frontend/components/consultation/cockpit/CockpitQueueRail.tsx` (read-only — sticky positioning above the new shell).
- `frontend/components/ehr/AppointmentChartRail.tsx` (now post-cs-05; the column-1 panel content).
- `frontend/components/consultation/cockpit/RxWorkspace.tsx` (column-3 panel content).
- `frontend/components/consultation/cockpit/RxRailToggle.tsx` (likely deleted in cs-08; for cs-07 just verify it doesn't break).
- `frontend/components/consultation/cockpit/ReadyCard.tsx` (one of the body-column state panes).
- `frontend/components/consultation/cockpit/IdleCard.tsx` (or equivalent — read-only).
- `frontend/components/consultation/cockpit/EndedCard.tsx` (with `EndOfDayCard`, `NextPatientCountdown`).
- `frontend/components/consultation/VideoRoom.tsx`, `VoiceConsultRoom.tsx`, `TextConsultRoom.tsx` (each is a body-column inCall pane).
- `frontend/components/consultation/cockpit/MobilePillBar.tsx` (read-only — confirm `<lg` path is unchanged).
- `frontend/components/consultation/cockpit/__tests__/cockpit-state.test.ts` (read-only — confirm the state machine tests don't depend on layout shape).

**Estimated turns:** 6–10 across multiple iterations. Be patient with verification.

---

## Acceptance criteria

### Desktop shell (`lg+`) is fixed-height with three independently-scrolling columns

- [ ] `<ConsultationCockpit>` desktop branch (currently `lg:grid lg:grid-cols-12 lg:gap-4`) is replaced with a `flex` container of fixed height:

  ```tsx
  {/* Desktop layout: lg+ */}
  <div
    className="hidden lg:flex lg:gap-0 lg:overflow-hidden"
    style={{
      height:
        'calc(100vh - var(--app-header-h) - var(--cockpit-header-h) - var(--cockpit-queue-h))',
    }}
    data-testid="cockpit-shell-desktop"
  >
    <aside
      className={cn(
        'shrink-0 overflow-y-auto border-r border-border bg-background',
        chartCollapsed ? 'w-[60px]' : 'w-[26%]',
      )}
      data-testid="cockpit-col-chart"
    >
      {chartCollapsed ? <RailCollapsedStub side="left" … /> : <AppointmentChartRail … />}
    </aside>

    <main
      className="flex-1 min-w-0 overflow-y-auto"
      data-testid="cockpit-col-body"
    >
      <ConsultationStatePane … />
    </main>

    <aside
      className={cn(
        'shrink-0 overflow-y-auto border-l border-border bg-background',
        rxCollapsed ? 'w-[60px]' : 'w-[26%]',
      )}
      data-testid="cockpit-col-rx"
    >
      {rxCollapsed ? <RxRailCollapsedStub … /> : <RxWorkspace … />}
    </aside>
  </div>
  ```

  - The **fixed height** is `calc(100vh - var(--app-header-h) - var(--cockpit-header-h) - var(--cockpit-queue-h))`. The vars are set by cs-01 on the cockpit root.
  - **Each column has `overflow-y-auto`.** The page itself does not scroll on `lg+` — only individual columns do.
  - `min-w-0` on the body column prevents flex children from forcing horizontal scroll if their content is wide (e.g. a long medicine name).
  - `shrink-0` on the side rails keeps them at their declared width regardless of body content.

- [ ] The header + queue rail stay **above** this flex region, in normal flow:

  ```tsx
  <div className="-m-4 md:-m-6 flex flex-col" style={{ /* css vars */ }}>
    <CockpitHeader … />
    <CockpitQueueRail … />
    {/* Mobile / tablet: page-scroll, unchanged */}
    <div className="lg:hidden">
      <ConsultationStatePane … />
    </div>
    {/* Desktop: fixed-height shell as above */}
    <div className="hidden lg:flex …">…</div>
  </div>
  ```

  - Header / queue rail are **no longer sticky on `lg+`** — they're in normal flow, *above* the fixed-height region. The fixed-height region itself doesn't scroll, so they never need to "stick" against scroll.
  - On `<lg`, header / queue rail keep their sticky behaviour (the page scrolls; they need to stick).

- [ ] **Sticky CSS on header / queue rail is conditional:**
  - On `<lg`: `sticky top-[var(--app-header-h)]` (header) and `sticky top-[var(--cockpit-header-h)]` (queue rail).
  - On `lg+`: NOT sticky (just normal flow).

  Implementation: use `lg:static` to override the sticky class on `lg+`. Or split the className with a conditional. Either works; pick the one that makes the source clearer.

### Below `lg` (mobile + tablet) is byte-identical to before

- [ ] The mobile branch (`<lg`) keeps its existing `flex flex-col` page-scroll layout. `<MobilePillBar>` mounts as before. Header / queue rail stay sticky as before.
- [ ] **No diff** in the mobile bundle except the `var(--cockpit-…-h)` substitutions from cs-01.
- [ ] Test on a 768×1024 (tablet portrait) viewport — should look exactly like the screenshot from before cs-07 lands.

### `computeColSpans()` is **deleted**

- [ ] The helper that mapped two boolean flags to four `lg:col-span-*` configurations is no longer needed — column widths are now CSS percentages on the flex container, not grid spans. Delete the function.
- [ ] All callers updated to use the new `cn(...)` width logic.

### State panes preserved

- [ ] `idle` state — body column shows the existing `<IdleCard>` content (or whatever the state machine emits). Centered vertically in the body column via `flex items-center justify-center` on the wrapper.
- [ ] `ready` state — body column shows `<ReadyCard>`. (cs-10 will slim it later; cs-07 just makes sure it still renders correctly.)
- [ ] `inCall` state — body column shows the appropriate consult-room (`<VideoRoom>` / `<VoiceConsultRoom>` / `<TextConsultRoom>`). The consult room takes the **full body column height**: `<VideoRoom>` is `h-full w-full`. Internal scroll (text room transcript) stays internal — does not bleed into the body column's `overflow-y-auto`.
- [ ] `ended` state — body column shows `<EndedCard>` (with `<NextPatientCountdown>` or `<EndOfDayCard>`). Pinned to top of the body column (no centering — the doctor reads it linearly).

### Scroll preservation across state transitions

- [ ] When the cockpit transitions `inCall → ended` (via the `Send Rx & finish` flow), the body column doesn't snap to a different scroll position — `<EndedCard>` mounts at the top, naturally.
- [ ] When the chart rail collapses or expands, neither side rail's scroll position changes (each column maintains its own `scrollTop`).

### `MobilePillBar` only on `<lg`

- [ ] The pill bar is currently rendered conditionally based on screen size. Verify it is NOT rendered on `lg+`. If it's currently always-rendered with `lg:hidden`, that's fine.

### Tests

- [ ] **`cockpit-state.test.ts` stays green.** This is the regression hammer; if any state's render contract changed, these tests catch it. **Do not edit them as part of cs-07** — if they fail, the layout rewrite has a bug.
- [ ] Add a new test file `frontend/components/consultation/__tests__/ConsultationCockpit.shell.test.tsx`:
  - Render `<ConsultationCockpit>` with viewport mocked to 1440×900 (lg+). Assert `data-testid="cockpit-shell-desktop"` exists and `data-testid="cockpit-col-chart" / -body / -rx` are children of it.
  - Render with viewport mocked to 768×1024 (`<lg`). Assert `data-testid="cockpit-shell-desktop"` does NOT exist; mobile pill bar is rendered.
  - For each cockpit state (`idle`, `ready`, `inCall`, `ended`) on `lg+`, assert the body column renders the expected pane.

### Manual verification

- [ ] Open the cockpit on `lg+` for a video appointment in `inCall`. Resize the viewport vertically (drag the window). Confirm:
  - The body column `<VideoRoom>` resizes with the viewport.
  - The chart rail and Rx column don't grow taller than the viewport — they scroll internally if the content is long.
  - The page itself does NOT scroll.
- [ ] Open the cockpit for an appointment with a Rx form long enough to overflow (add 8+ medicines, fill all sections). Scroll the Rx column. Confirm the consultation room in the body column does NOT move.
- [ ] On `<lg` (resize browser to ~900px wide), confirm the layout reverts to the existing single-column page-scroll shape with `MobilePillBar`.
- [ ] All four cockpit states render correctly on `lg+` and `<lg`.

---

## Out of scope

- **Drag-resize handles** — that's cs-08. cs-07 uses fixed CSS percentages for column widths.
- **Replacing `RxRailToggle` and chart-rail chevron with panel-API** — that's cs-08.
- **Persisting collapsed state to localStorage** — that's cs-08 (via `autoSaveId`).
- **Vertical resizing inside a column** — never. Cockpit is column-resize-only.
- **Slimming `<ReadyCard>`, hiding global Start consult, Rx section nav** — Phase C polish (cs-09, cs-10, cs-11).
- **Mobile / tablet layout overhaul.** `<lg` keeps its existing layout untouched.

---

## Files expected to touch

**Modified:**
- `frontend/components/consultation/ConsultationCockpit.tsx` (~120 LOC delta — the desktop shell rewrite is the core).
- `frontend/components/consultation/cockpit/CockpitHeader.tsx` (~5 LOC — flip sticky behaviour off on `lg+`).
- `frontend/components/consultation/cockpit/CockpitQueueRail.tsx` (~5 LOC — same).

**Deleted:**
- The `computeColSpans` helper (probably a private function inside `ConsultationCockpit.tsx` — delete in place).

**New:**
- `frontend/components/consultation/__tests__/ConsultationCockpit.shell.test.tsx` (~80 LOC — the regression test).

---

## Notes / open decisions

1. **Why not use `<ResizablePanelGroup>` directly in cs-07 and skip cs-08?** Two reasons. (a) PR review surface area: cs-07 is already huge; mixing in resize-handle wiring would push the diff past 400 LOC and make review hard. (b) Verification: it's easier to verify that *layout-without-resize* is correct, then layer resize on top, than to verify both at once. cs-07 lands a working-but-static layout; cs-08 turns it interactive.
2. **Column widths: 26 / 48 / 26.** Empirically picked. Chart rail ~340px on a 1366px viewport is enough for vitals + recent labs at-a-glance; body ~660px fits the video room comfortably; Rx ~340px fits the prescription form with one column of medicines. cs-08 makes these resizable; cs-07 just sets sensible defaults.
3. **Why `60px` for collapsed-rail width and not `80px` or `48px`?** `60px` lines up with the existing `<RxRailToggle>` stub width and the chart-rail chevron icon. cs-08 may revise this when the panel API takes over (`collapsedSize={5}` = 5% of group width ≈ 60px on a 1200px container).
4. **What happens to the `-m-4 md:-m-6` on the cockpit root?** It stays — that's the "full-bleed within page padding" trick. The fixed-height region is computed in viewport-relative units so the negative margin doesn't break it.
5. **What about Safari's `100dvh` concern?** On mobile we'd care; on `lg+` desktop, `100vh` is fine because the toolbar collapse behaviour doesn't apply. Mobile uses page-scroll anyway.
6. **What if a future state (e.g. `paused` or `wrapping-up`) gets added to the state machine?** Each state pane is mounted by the existing state-pane router; the shell doesn't need to know about specific states. cs-07's shell is state-agnostic — only the body column changes which pane it renders.
7. **Performance.** `overflow-y-auto` creates a scroll container. Three of them on a single page is fine — modern browsers handle dozens. If we ever virtualize the chart rail or Rx workspace, the per-column scroll context makes that easier (the virtualizer can use the column's `scrollTop` directly).

---

## References

- **Affected files:**
  - `frontend/components/consultation/ConsultationCockpit.tsx`
  - `frontend/components/consultation/cockpit/CockpitHeader.tsx`
  - `frontend/components/consultation/cockpit/CockpitQueueRail.tsx`
- **Predecessor:** [`task-cs-06-add-resizable-panels-dep.md`](./task-cs-06-add-resizable-panels-dep.md).
- **Successor:** [`task-cs-08-resizable-panels-wiring.md`](./task-cs-08-resizable-panels-wiring.md).
- **State machine spec:** [Daily-plans/May 2026/06-05-2026/Tasks/task-cockpit-1-state-machine.md](../../../06-05-2026/Tasks/task-cockpit-1-state-machine.md).
- **Original cockpit shell:** [Daily-plans/May 2026/06-05-2026/Tasks/task-cockpit-2-shell.md](../../../06-05-2026/Tasks/task-cockpit-2-shell.md) — what cs-07 refactors away.

---

**Owner:** TBD
**Created:** 2026-05-09
**Status:** Done — 2026-05-10
