# csl-01 · Restore column shell headers + chart-rail flex chain

> Single-task hotfix batch for three regressions surfaced in the 2026-05-26 dogfood pass *after* `cockpit-chart-density` (ccd) shipped. Combines the flex-chain repair for the left column with the shell-header suppression for all three columns. One task, two files, four call-sites.

| Property | Value |
|---|---|
| **Status** | ✅ Done |
| **Owner** | Frontend |
| **Size** | XS (~5 LOC across 2 files + 2 tests) |
| **Model** | Auto |
| **Wave** | 1 (only) |
| **Depends on** | — (lands ahead of ppd/cnc/cpv on day-26) |
| **Blocks** | Re-running smoke matrices for `ppd`, `cnc`, `cpv` — those need a non-collapsed left column to read |

---

## Why this exists

Dogfood screenshot 2026-05-26 surfaced three defects that fall outside the four planned day-26 batches because they live in the *shell layer*, not in any leaf:

1. **Left column body collapses to 0px height.** Only the "Patient" shell header is visible; Snapshot + History never render even though their child data exists. Regression introduced by `ccd-01` (`<ChartRailWithEmptyState>` group wrapper).
2. **Middle column shows a redundant "Consult" shell header** stacked above an already-titled Body / Assessment / Plan stack.
3. **Right column shows a "Chart Notes" shell header** above the SOAP sections. Notes is not part of the right column anymore — the right column owns Subjective / Objective per the cockpit-v2 plan.

All three are shell-level (depth 0) header / flex-propagation issues. They share one file (`templates.tsx`) and live on the same wave, so they belong in one task.

---

## Root cause — left column blank (issue #1)

The Shell hands the column subtree to `groupWrapper` as a `flex-1` div that expects a flex-column parent:

```987:1001:frontend/components/patient-profile/Shell.tsx
                    const subtree = (
                      <div className="flex min-h-0 min-w-0 flex-1">
                        <PaneSubtreeGroup
                          nodes={node.children ?? []}
                          ...
                          orientation={node.direction ?? childDefaultOrientation}
                          ...
                        />
                      </div>
                    );
                    return node.groupWrapper
                      ? node.groupWrapper(subtree)
                      : subtree;
```

`<ChartRailWithEmptyState>` (the `groupWrapper` for the left column) wraps the subtree in a div that is `flex-1` itself but **not** `display: flex`:

```53:63:frontend/components/patient-profile/panes/ChartRailWithEmptyState.tsx
  return (
    <div className="flex h-full min-h-0 flex-col">
      {!isLoading ? (
        <UnifiedChartRailEmptyState
          signals={signals}
          onAddPatientContext={onAddPatientContext}
        />
      ) : null}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
```

Result chain:

```
Shell pane root      → flex flex-col h-full          ✓ flex parent
ChartRail outer      → flex flex-col h-full          ✓ flex parent
ChartRail inner      → flex-1 (NOT a flex parent)    ✗
Shell subtree div    → flex-1 (looking for flex      ← can't resolve;
                       parent to fill)                  collapses to auto/0
PaneSubtreeGroup     → vertical ResizablePanelGroup  ← 0 px to share
Snapshot + History   →                                ← invisible
```

Vertical `ResizablePanelGroup` (left column has no `direction` → inherits `vertical` at depth 1) needs **explicit height** from its parent. The middle-bottom column uses the same wrapper shape but runs `direction: 'horizontal'` — horizontal groups size by width which flows through normally, so the bug never shows there. Left column is the only vertical column with a `groupWrapper`, so it's the only one that breaks.

**Fix:** make the `ChartRailWithEmptyState` children container a real flex column.

---

## Root cause — redundant shell headers (issues #2 + #3)

`Shell.tsx` renders the column-shell header at `depth === 0` unless the pane carries `hideShellHeader: true`:

```914:917:frontend/components/patient-profile/Shell.tsx
          //     carry their own headers; an extra wrap-header would be
          //     visually redundant).
          const showHeader = (isLeaf || depth === 0) && !node.hideShellHeader;
```

Every leaf inside the three columns (Snapshot, History, Body, Assessment, Plan, Investigations, Subjective, Objective) already paints its own pane header. The depth-0 wrap header just duplicates the column title ("Patient", "Consult", "Chart Notes") above the stack. Suppress it at the column root.

> **Out of scope (follow-up in capture-inbox):** the middle column body is empty when `bodyVariant === 'review'` (line 349 of `templates.tsx`). Hiding the shell header fixes the "Consult header floating above nothing" look, but the missing body is a *separate* feature — a `<EndedConsultBody>` placeholder leaf showing "Consultation ended · view summary →". Captured below; **don't add it in this task.**

---

## What to do

### 1. `frontend/components/patient-profile/panes/ChartRailWithEmptyState.tsx` (line 61)

```tsx
// before
<div className="min-h-0 flex-1">{children}</div>

// after
<div className="flex min-h-0 flex-1 flex-col">{children}</div>
```

Adding `flex flex-col` makes the children container a real flex column. The Shell's subtree div (`flex min-h-0 min-w-0 flex-1`) inside finally has a flex-column parent → its `flex-1` resolves → the vertical ResizablePanelGroup gets its height → Snapshot + History render.

### 2. `frontend/lib/patient-profile/templates.tsx` — `makeLeftColumn` (~line 166)

Add `hideShellHeader: true` to the column-root pane definition (the object that has `id: 'left-column'`, `title: 'Patient'`). Place it next to `title:` for grepability.

```ts
return {
  id: 'left-column',
  title: 'Patient',
  hideShellHeader: true,
  render: () => null,
  groupWrapper: (children) => ( /* unchanged */ ),
  children: [ /* unchanged */ ],
};
```

> `title` is retained because pane-context-menu / status-pill code reads it; only the visual chrome is suppressed.

### 3. `frontend/lib/patient-profile/templates.tsx` — `makeRightColumn` (~line 217)

Same change on the `id: 'right-column'` root:

```ts
return {
  id: 'right-column',
  title: 'Chart Notes',
  hideShellHeader: true,
  render: () => null,
  children: [ /* unchanged */ ],
};
```

> Kills the "Chart Notes" outer header (issue #3).

### 4. `frontend/lib/patient-profile/templates.tsx` — `makeMiddleColumn` (~line 383)

Same change on the `id: 'middle-column'` root:

```ts
return {
  id: 'middle-column',
  title: 'Consult',
  hideShellHeader: true,
  render: () => null,
  children,
  naturalSizePct: 56,
  minSizePx: 480,
};
```

> Kills the "Consult" outer header (issue #2, partial). Empty-body in `review` mode is a follow-up — see capture-inbox below.

### 5. Tests

#### a. `frontend/lib/patient-profile/__tests__/templates-shell-header.test.ts` (new)

```ts
import { describe, expect, it } from "vitest";
import {
  getTelemedVideoTemplate,
  getTelemedVoiceTemplate,
  getTelemedTextTemplate,
} from "../templates";
import { buildFixtureTelemedCtx } from "./test-helpers"; // existing helper, mirror imports from any sibling templates test

describe("templates · column-shell headers (csl-01)", () => {
  for (const [name, getter] of [
    ["video", getTelemedVideoTemplate],
    ["voice", getTelemedVoiceTemplate],
    ["text", getTelemedTextTemplate],
  ] as const) {
    it(`hides shell header on every column root for ${name}`, () => {
      const tree = getter(buildFixtureTelemedCtx());
      const ids = ["left-column", "middle-column", "right-column"];
      for (const id of ids) {
        const node = tree.find((n) => n.id === id);
        expect(node, `${id} missing`).toBeTruthy();
        expect(node!.hideShellHeader, `${id} hideShellHeader`).toBe(true);
      }
    });
  }
});
```

> If `buildFixtureTelemedCtx` doesn't exist, mirror the ctx construction from any sibling templates test in `frontend/lib/patient-profile/__tests__/`.

#### b. `frontend/components/patient-profile/panes/__tests__/ChartRailWithEmptyState.test.tsx` (new — or extend existing)

Snapshot-only render test that asserts children container has flex-col chain:

```tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ChartRailWithEmptyState } from "../ChartRailWithEmptyState";

// Mock the hook to skip API; return non-loading + non-empty signals.
vi.mock("@/hooks/use-chart-rail-empty-signals", () => ({
  useChartRailEmptySignals: () => ({
    signals: {
      allergiesEmpty: false,
      chronicEmpty: false,
      problemListEmpty: false,
      snapshotEmpty: false,
      historyEmpty: false,
    },
    isLoading: false,
  }),
}));

vi.mock("@/lib/patient-profile/telemetry", () => ({
  trackCockpitPolishChartDensityLanded: vi.fn(),
}));

describe("ChartRailWithEmptyState · flex-chain (csl-01)", () => {
  it("children container is a flex column so vertical ResizablePanelGroup can size", () => {
    const { container } = render(
      <ChartRailWithEmptyState appointmentId="apt_1" patientId="pt_1" token="tok">
        <div data-testid="subtree">stub</div>
      </ChartRailWithEmptyState>,
    );

    const childrenWrap = container.querySelector('[data-testid="subtree"]')!
      .parentElement!;
    expect(childrenWrap.className).toMatch(/\bflex\b/);
    expect(childrenWrap.className).toMatch(/\bflex-col\b/);
    expect(childrenWrap.className).toMatch(/\bflex-1\b/);
    expect(childrenWrap.className).toMatch(/\bmin-h-0\b/);
  });
});
```

### 6. Manual smoke

1. Open a patient profile / cockpit on **any** modality.
2. Confirm: **no** "Patient" / "Consult" / "Chart Notes" header strips at the top of any column.
3. Confirm: left column renders Snapshot **and** History panes with their content visible.
4. Resize the left column horizontally — children stay visible.
5. End the appointment (or open a review-state appointment) → middle column shows Assessment + Plan-bottom only, no orphan "Consult" header (empty body OK — follow-up).
6. New patient with zero chart data: unified empty card renders AND Snapshot/History headers still mount underneath it.

### 7. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test
```

---

## Acceptance gate

- [x] `ChartRailWithEmptyState.tsx:61` className includes `flex` + `flex-col` (in addition to `min-h-0 flex-1`).
- [x] `makeLeftColumn` root has `hideShellHeader: true`.
- [x] `makeMiddleColumn` root has `hideShellHeader: true`.
- [x] `makeRightColumn` root has `hideShellHeader: true`.
- [x] `templates-shell-header.test.ts` green for video / voice / text.
- [x] `ChartRailWithEmptyState.test.tsx` flex-chain assertion green.
- [ ] Manual smoke: left column body renders, no shell headers in any of the three columns.
- [x] `tsc --noEmit` + `lint` + `test` (targeted) clean.

---

## Anti-goals

- ❌ Don't add an `EndedConsultBody` placeholder leaf — capture as follow-up.
- ❌ Don't change `Shell.tsx`'s `showHeader` logic — it's correct; the columns just need to opt out.
- ❌ Don't refactor `ChartRailWithEmptyState` to remove the wrapper div — the wrapper is needed for the unified-empty-state branch (`isLoading === false && all 5 empty`). Only fix the className.
- ❌ Don't widen the `useChartRailEmptySignals` deps array fix (`draftHasVitals` re-firing 6 API calls per keystroke) here — capture as a separate perf follow-up so this hotfix stays small.
- ❌ Don't bundle this with `cnc-02` (right-column SECTION title rename "Notes" → something better). That's the inner SOAP-section title, not the outer shell header. Different layer, different batch.

---

## Capture-inbox (write at close)

Append to `docs/Work/capture/inbox.md`:

```md
- [ ] [csl follow-up] Add `<EndedConsultBody>` placeholder leaf for `bodyVariant === 'review'` in `makeMiddleColumn` so the middle column has a meaningful body when an appointment is ended (current state: leaf is omitted, column shows only Assessment + Plan-bottom). (Source: docs/Work/Daily-plans/May 2026/26-05-2026/cockpit-shell-layout-fix/Tasks/task-csl-01-restore-column-shell-and-flex-chain.md)
- [ ] [csl follow-up] `useChartRailEmptySignals` re-fires all 6 list APIs every vitals keystroke because `draftHasVitals` is in the deps array. Split the hook so persisted-list fetches are independent of draft vitals reads. (Source: same)
- [ ] [csl follow-up] Tune the `<UnifiedChartRailEmptyState>` threshold from "5 of 5 empty" to "≥ 4 of 5 empty" — current threshold means a patient with only allergies still sees 4 stacked per-pane empty cards. (Source: same; touches ccd-01 DL-2.)
- [ ] [csl follow-up] After this hotfix lands, re-run the ppd / cnc / cpv smoke matrices — they were partially blind to chart-rail regressions because the left column body was collapsed. (Source: same; coordinate with day-26 README capture-inbox.)
```

---

## Notes

- This is the **only** task in `cockpit-shell-layout-fix`. No plan doc, no execution-order — single hotfix, single wave, single PR.
- This task should ship **before** ppd / cnc / cpv smoke is re-run today — those batches' verification gates assume column bodies are visible.
- The fix is intentionally syntactic / structural only — no logic moves, no new components, no telemetry. Lower-bound risk; the existing ccd-01 telemetry already covers the chart-density empty-state firing condition.
- Why this isn't rolled into `ccd` retro-patch: `cockpit-chart-density` is ✅ Shipped (see day-26 README ledger). Re-opening a shipped batch is more disruptive than a fresh micro-batch on the same day.
