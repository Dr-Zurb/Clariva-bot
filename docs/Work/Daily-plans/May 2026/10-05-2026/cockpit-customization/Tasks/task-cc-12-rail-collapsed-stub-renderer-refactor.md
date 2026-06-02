# Task cc-12: `<RailCollapsedStub>` renderer-prop refactor + width bump

## 10 May 2026 — Batch [Cockpit customization](../plan-cockpit-customization-batch.md) — Phase E, Lane α step 0 — **S, ~1.5h**

---

## Task overview

Today's `<RailCollapsedStub>` (cs-08) renders a single fixed treatment for both rails: a chevron icon + vertical-text label. The user's feedback ("looks too cramped, almost hidden") is two-fold:

1. **Width**: 5% of cockpit width is ~70–90px on a 14" laptop; that's wide enough for an icon and vertical text but too narrow for richer collapsed content.
2. **Content**: per-column-aware collapsed treatments would be more useful — the chart rail wants to show *which sections* exist (so the doctor can jump straight to "Allergies" without expanding); the Rx rail wants to show *summary text* ("3 medicines · 1 test · diagnosis: pending").

cc-12 is the **enabling refactor** for those richer treatments. It:

1. Bumps `collapsedSize` from 5 → 7 in `<ConsultationCockpit>` (~100–120px on 14"; ~130–150px on a 1080p monitor — enough for icon-stack + small text).
2. Refactors `<RailCollapsedStub>` to take an optional `renderer` prop. When provided, it overrides the default chevron + vertical-label content.
3. Keeps the default renderer for backwards compat (so a caller that doesn't pass `renderer` gets today's behavior).

cc-13 ships the chart's `CollapsedChartRail` renderer; cc-14 ships the Rx's `CollapsedRxRail` renderer. Both are pure-presentational components that go into the `renderer` prop.

**Estimated time:** ~1.5h.

**Status:** Pending.

**Hard deps:** none (the cs-08 stub is the source; this task refactors it in place).

**Source:** [plan-cockpit-customization-batch.md § CC-D4](../plan-cockpit-customization-batch.md#decision-lock-locked-2026-05-10-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium**.

**New chat?** **Yes** — fresh small chat. Pre-load:
- This task file.
- `frontend/components/consultation/cockpit/RailCollapsedStub.tsx` (the existing component — 84 lines).
- `frontend/components/consultation/ConsultationCockpit.tsx` (where `collapsedSize={5}` lives — change to 7).
- `frontend/components/ehr/AppointmentChartRail.tsx` (where `<RailCollapsedStub>` is used in standalone/mobile contexts — confirm the default renderer keeps working there).

**Estimated turns:** 2 turns.

---

## Acceptance criteria

### Refactor `<RailCollapsedStub>` to accept a renderer prop

- [ ] Update the props interface:

  ```ts
  export interface RailCollapsedStubRendererProps {
    /** Same as the parent prop — passed down for renderer convenience. */
    side: RailCollapsedSide;
    /** Same as the parent prop. */
    label: string;
    /** Same as the parent prop — call to expand the rail. */
    onExpand: () => void;
  }

  /**
   * cc-12: Optional content renderer. When provided, replaces the default
   * chevron + vertical-label content with the renderer's output. Receives
   * the same `side` / `label` / `onExpand` as the parent for convenience
   * (renderers may want to add their own click-to-expand affordance).
   *
   * The wrapper `<aside>` (with `aria-label={`${label} (collapsed)`}`) and
   * the wrapper className are still owned by `<RailCollapsedStub>` —
   * renderers focus only on the inner content.
   */
  type RailCollapsedRenderer = (props: RailCollapsedStubRendererProps) => React.ReactNode;

  interface RailCollapsedStubProps {
    side: RailCollapsedSide;
    label: string;
    onExpand: () => void;
    ariaKeyShortcuts?: string;
    className?: string;
    /** cc-12: optional content renderer (see RailCollapsedRenderer). */
    renderer?: RailCollapsedRenderer;
  }
  ```

- [ ] Extract today's content (chevron + vertical-label) into a default renderer:

  ```ts
  const defaultRenderer: RailCollapsedRenderer = ({ side, label, onExpand, ariaKeyShortcuts }) => {
    const Icon = side === 'left' ? ChevronRight : ChevronLeft;
    return (
      <>
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={false}
          aria-label={`Expand ${label.toLowerCase()}`}
          aria-keyshortcuts={ariaKeyShortcuts}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        >
          <Icon className="h-4 w-4" aria-hidden />
        </button>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl]">
          {label}
        </p>
      </>
    );
  };
  ```

  - **Heads up:** `defaultRenderer` needs `ariaKeyShortcuts` too. Either pass it through `RailCollapsedStubRendererProps` (preferred) or close over it inside the parent. Update the `RailCollapsedStubRendererProps` interface to include `ariaKeyShortcuts?: string`.

- [ ] Render with the renderer:

  ```ts
  return (
    <aside
      aria-label={`${label} (collapsed)`}
      className={cn(
        'flex h-full w-full flex-col items-center bg-card py-3',
        className,
      )}
    >
      {(renderer ?? defaultRenderer)({ side, label, onExpand, ariaKeyShortcuts })}
    </aside>
  );
  ```

  - The wrapper `<aside>` and its `aria-label` stay on the parent so AT users always get a labeled collapsed region, regardless of what renderer chose to show inside.

### Bump `collapsedSize` from 5 → 7

- [ ] In `<ConsultationCockpit>`'s `<ResizablePanel>` definitions for chart and Rx, change `collapsedSize={5}` → `collapsedSize={7}`.

  - **Why 7?** On a 1280px-wide cockpit (typical 14" laptop), 7% = ~90px. Enough for a 32px icon column + 50px of text padding. On a 1920px monitor, 7% = ~135px — comfortable.
  - **Why not 8 or 10?** Above ~10% the collapsed rail starts feeling like a real column rather than a "peek". 7% is the empirical sweet spot.

### Default-renderer backwards compat

- [ ] Confirm `frontend/components/ehr/AppointmentChartRail.tsx` still works in its standalone context (where it's wrapped in some parent that uses the original `RailCollapsedStub` directly without a `renderer` prop). The default-renderer fallback handles this.
- [ ] Anywhere else `<RailCollapsedStub>` is imported (search: `rg "from.*RailCollapsedStub" frontend/`), confirm zero behavioral change — the new `renderer` prop is optional and additive.

### Tests

- [ ] In `frontend/components/consultation/cockpit/__tests__/RailCollapsedStub.test.tsx` (create if absent):
  - "renders the default chevron + vertical-label when no renderer is provided".
  - "renders the renderer's output when one is provided".
  - "renderer receives `side`, `label`, `onExpand`, `ariaKeyShortcuts` props".
  - "the wrapper `<aside>` keeps its `aria-label` regardless of renderer".
- [ ] `pnpm --filter frontend tsc --noEmit` clean.

### Manual verification

- [ ] Open the cockpit. Collapse the chart rail (chevron click). The collapsed rail still looks like today's stub — same chevron, same vertical label — but visibly wider (7% vs 5%).
- [ ] Same for the Rx rail.
- [ ] No regression in the standalone (non-cockpit) chart rail usage if there is one.

---

## Out of scope

- **The new chart-renderer** — that's cc-13.
- **The new Rx-renderer** — that's cc-14.
- **Restyling the wrapper `<aside>`** — keep its `bg-card` / `py-3` / etc. unchanged; renderers are responsible only for the inner content.
- **Conditionally rendering different stubs based on which column is collapsed** — `<ConsultationCockpit>` already passes per-column props; the renderer wiring happens in cc-13 / cc-14.

---

## Files expected to touch

**Modified:**
- `frontend/components/consultation/cockpit/RailCollapsedStub.tsx` (~30 LOC delta — new prop + default-renderer extraction).
- `frontend/components/consultation/ConsultationCockpit.tsx` (~2 LOC delta — bump `collapsedSize` from 5 → 7 on chart + Rx).
- `frontend/components/consultation/cockpit/__tests__/RailCollapsedStub.test.tsx` (~80 LOC; create if absent).

**New:** none.

---

## Notes / open decisions

1. **Why a renderer prop and not a `<RailCollapsedStub.Slot>` composition pattern?** Renderer prop is simpler: one entry point, one signature, easy to type. Slot pattern would let cc-13 / cc-14 import `<RailCollapsedStub>` and provide children, but the wrapper `<aside>` semantics + the per-renderer prop drilling get messier. Renderer prop wins on simplicity.
2. **What if a renderer wants to suppress the wrapper entirely (e.g. its own custom `<aside>` semantics)?** Out of scope for cc-12. If a future renderer needs that, add a `wrapper={false}` prop. cc-13 / cc-14 don't need it.
3. **`collapsedSize={7}` on a tiny viewport.** On <1024px the cockpit is mobile (`<MobilePillBar>`); the desktop branch isn't taken. So narrow desktops (~1024px exactly) get 7% of 1024 = ~72px — still enough for icon + text. No degradation.
4. **Why pass `ariaKeyShortcuts` to the renderer?** Custom renderers might want their own button (e.g. a section icon) and need to advertise the same `[` / `]` hotkey for AT discoverability. Passing it through keeps all collapse-related affordances consistent.

---

## References

- **Affected files:**
  - `frontend/components/consultation/cockpit/RailCollapsedStub.tsx`
  - `frontend/components/consultation/ConsultationCockpit.tsx`
- **Successors:** [`task-cc-13-collapsed-chart-section-icons.md`](./task-cc-13-collapsed-chart-section-icons.md) (chart renderer), [`task-cc-14-collapsed-rx-peek-strip.md`](./task-cc-14-collapsed-rx-peek-strip.md) (Rx renderer).

---

**Owner:** TBD
**Created:** 2026-05-10
**Status:** Pending
