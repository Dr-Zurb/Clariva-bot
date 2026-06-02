# ccd-01 · Shared chart-rail empty-state component

> **Status:** ✅ **DONE** (2026-05-26) — `<ChartRailEmptyState>`, `<UnifiedChartRailEmptyState>`, `useChartRailEmptySignals`, `<ChartRailWithEmptyState>` wired via `makeLeftColumn` `groupWrapper`; 7 unit tests green.

> **Wave 1 / Lane α (sync point)** of [cockpit-chart-density](../plan-cockpit-chart-density-batch.md). New shared component consumed by ccd-02 + ccd-03.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | M (~80 LOC component + ~50 LOC wrapper + ~60 LOC tests) |
| **Model** | Auto |
| **Wave** | 1 |
| **Depends on** | — |
| **Blocks** | ccd-02, ccd-03, ccd-04 |

---

## Goal

Build two new components:

1. `<ChartRailEmptyState>` — generic, consumed per-pane (e.g., "No allergies on file").
2. `<UnifiedChartRailEmptyState>` — wrapper that decides single-vs-multi empty-state at the left-column level per DL-2 (when ALL FIVE chart-rail panes are empty, render a single "Add patient context" card).

---

## What to do

### 1. Create `frontend/components/patient-profile/panes/ChartRailEmptyState.tsx`

```tsx
"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ChartRailEmptyStateProps {
  icon: LucideIcon;
  headline: string;
  /** Optional secondary CTA. Omit for informational empty-states. */
  cta?: { label: string; onClick: () => void };
  /** Smaller padding when stacked inside a tight pane body. */
  compact?: boolean;
}

/**
 * Shared empty-state visual for chart-rail panes (ccd-01).
 * Used by Allergies / Chronic conditions / Problem list / Snapshot when no
 * data exists. `<UnifiedChartRailEmptyState>` decides between per-pane and
 * unified rendering at the rail level.
 */
export function ChartRailEmptyState({
  icon: Icon,
  headline,
  cta,
  compact = false,
}: ChartRailEmptyStateProps): JSX.Element {
  return (
    <div
      className={
        "flex flex-col items-center justify-center gap-2 text-center " +
        (compact ? "p-3" : "p-6")
      }
    >
      <Icon
        className="h-6 w-6 text-muted-foreground/50"
        aria-hidden
      />
      <p className="text-sm text-muted-foreground">{headline}</p>
      {cta ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={cta.onClick}
          className="mt-1"
        >
          {cta.label}
        </Button>
      ) : null}
    </div>
  );
}
```

### 2. Create `frontend/components/patient-profile/panes/UnifiedChartRailEmptyState.tsx`

```tsx
"use client";

import { ClipboardPlus } from "lucide-react";
import { ChartRailEmptyState } from "./ChartRailEmptyState";

export interface ChartRailEmptySignals {
  allergiesEmpty: boolean;
  chronicEmpty: boolean;
  problemListEmpty: boolean;
  snapshotEmpty: boolean;
  historyEmpty: boolean;
}

export interface UnifiedChartRailEmptyStateProps {
  signals: ChartRailEmptySignals;
  onAddPatientContext?: () => void;
}

/**
 * Decides between unified vs per-pane empty-state rendering (DL-2).
 *
 * When ALL FIVE signals are true, returns a single unified card. When ANY is
 * false (i.e., at least one pane has data), returns null and each pane is
 * expected to render its own per-pane empty-state.
 */
export function UnifiedChartRailEmptyState({
  signals,
  onAddPatientContext,
}: UnifiedChartRailEmptyStateProps): JSX.Element | null {
  const allEmpty =
    signals.allergiesEmpty &&
    signals.chronicEmpty &&
    signals.problemListEmpty &&
    signals.snapshotEmpty &&
    signals.historyEmpty;

  if (!allEmpty) return null;

  return (
    <div className="m-3 rounded-lg border border-dashed border-border bg-card">
      <ChartRailEmptyState
        icon={ClipboardPlus}
        headline="No patient context yet"
        cta={
          onAddPatientContext
            ? { label: "Add patient context", onClick: onAddPatientContext }
            : undefined
        }
      />
    </div>
  );
}
```

### 3. Tests in `__tests__/ChartRailEmptyState.test.tsx`

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { Beaker } from "lucide-react";
import { ChartRailEmptyState } from "../ChartRailEmptyState";
import { UnifiedChartRailEmptyState, type ChartRailEmptySignals } from "../UnifiedChartRailEmptyState";

describe("ChartRailEmptyState", () => {
  it("renders icon + headline", () => {
    render(<ChartRailEmptyState icon={Beaker} headline="No tests" />);
    expect(screen.getByText("No tests")).toBeInTheDocument();
  });

  it("renders CTA when provided and calls onClick", () => {
    const onClick = vi.fn();
    render(
      <ChartRailEmptyState
        icon={Beaker}
        headline="No tests"
        cta={{ label: "Add test", onClick }}
      />,
    );
    fireEvent.click(screen.getByText("Add test"));
    expect(onClick).toHaveBeenCalled();
  });

  it("omits CTA when prop absent", () => {
    render(<ChartRailEmptyState icon={Beaker} headline="No tests" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("UnifiedChartRailEmptyState", () => {
  const allEmpty: ChartRailEmptySignals = {
    allergiesEmpty: true,
    chronicEmpty: true,
    problemListEmpty: true,
    snapshotEmpty: true,
    historyEmpty: true,
  };

  it("renders unified card when all 5 signals are true", () => {
    render(<UnifiedChartRailEmptyState signals={allEmpty} />);
    expect(screen.getByText("No patient context yet")).toBeInTheDocument();
  });

  it("returns null when ANY signal is false", () => {
    const partialEmpty = { ...allEmpty, allergiesEmpty: false };
    const { container } = render(
      <UnifiedChartRailEmptyState signals={partialEmpty} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("calls onAddPatientContext on CTA click", () => {
    const onAdd = vi.fn();
    render(
      <UnifiedChartRailEmptyState
        signals={allEmpty}
        onAddPatientContext={onAdd}
      />,
    );
    fireEvent.click(screen.getByText("Add patient context"));
    expect(onAdd).toHaveBeenCalled();
  });

  it("CTA is absent when onAddPatientContext is undefined", () => {
    render(<UnifiedChartRailEmptyState signals={allEmpty} />);
    expect(screen.queryByText("Add patient context")).not.toBeInTheDocument();
  });
});
```

### 4. Wire `<UnifiedChartRailEmptyState>` into the left column

Decision: who computes the five `signals`? Two paths:

**Path A — left column wrapper inside templates.tsx:**

In `makeLeftColumn`, add a `groupWrapper` that wraps the column children with `<UnifiedChartRailEmptyState>`:

```tsx
function makeLeftColumn(ctx: TelemedVideoContext): PaneDefinition {
  const appointment = ctx.appointment as PaneAppointment;
  return {
    id: 'left-column',
    title: 'Patient',
    render: () => null,
    groupWrapper: (children) => (
      <ChartRailWithEmptyState
        appointmentId={appointment.id}
        token={ctx.token}
      >
        {children}
      </ChartRailWithEmptyState>
    ),
    children: [/* ...snapshot, history... */],
  };
}
```

Where `<ChartRailWithEmptyState>` is a small new component that fetches the five empty-signals (via existing hooks or a new aggregator hook) and conditionally renders `<UnifiedChartRailEmptyState>` above the children.

**Path B — defer wiring to ccd-03:**

Ship the two components in this task; ccd-03 wires them via the disclosure-affordance change (since ccd-03 already touches all chart-rail panes).

**Pick Path A for clean separation, but only if a `useChartRailEmptySignals` hook is straightforward** — otherwise Path B.

Recommendation: Path A. Create `frontend/hooks/use-chart-rail-empty-signals.ts` (~40 LOC) that reads from `usePatientAllergies` / `usePatientChronic` / `usePatientProblemList` / `useOptionalRxForm` (for snapshot draft override) / `usePatientHistory`. If any of these hooks don't exist yet, fall back to inline `useState`/`useEffect` reads in the wrapper component.

If both paths balloon, ship Path B and capture-inbox the aggregator hook.

### 5. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test components/patient-profile/panes/__tests__/ChartRailEmptyState.test.tsx
```

---

## Acceptance gate

- [x] `<ChartRailEmptyState>` exists with `icon` + `headline` + optional `cta` + `compact` props.
- [x] `<UnifiedChartRailEmptyState>` exists; renders only when all 5 signals are `true`.
- [x] Tests cover all branches.
- [x] If Path A wired: left column renders unified card when no data; ccd-02 + ccd-03 will switch per-pane empty-states to use `<ChartRailEmptyState>`.
- [x] If Path B wired: ccd-02 + ccd-03 task scope grows to include the wrapper wire-up.
- [x] tsc + lint clean.

---

## Anti-goals

- ❌ Don't bake patient-data fetching into `<ChartRailEmptyState>` — pure presentational.
- ❌ Don't add animation / transitions — capture-inbox.
- ❌ Don't try to retrofit non-cockpit surfaces with the empty-state — scope is cockpit chart rail only.
- ❌ Don't introduce a "partial empty" mode (e.g., "3 of 5 empty → unified") — DL-2 is binary.

---

## Notes

- This task ships the component surface. ccd-02 + ccd-03 consume.
- The lift-style decision tree (single component vs wrapper aggregator) was deliberate: a stateless `<ChartRailEmptyState>` is reusable in any pane; the wrapper handles the rail-level decision.
- If `groupWrapper` doesn't exist on `PaneDefinition` yet, search for how `makeMiddleBottomRow` does it (line 269-284 of templates.tsx) — same pattern.
