# cpfg-03 — `groupWrapper` invariant guard + re-parent regression suite

| | |
|---|---|
| **Batch** | [p4-cockpit-pane-freedom-chrome (Phase 4)](../plan-p4-cockpit-pane-freedom-chrome-batch.md) |
| **Wave / lane** | Wave 2 / lane α (step 1) |
| **Size** | S |
| **Model** | Auto |
| **Depends on** | cpfg-01, cpfg-02 |
| **Blocks** | cpfg-04 |

---

## Objective

Lock in the whole batch with tests, so the lift can't silently regress:

1. **`groupWrapper` invariant test** — assert no built-in template's `groupWrapper` renders a context provider or an action/visual component; only pure-layout `<div>`s are allowed (P4-DL-4).
2. **Re-parent regression suite** — assert that dragging `plan`, `rx`, and `snapshot` into other containers leaves the footer, safety strip, and empty-state rendering correctly.

This is the test layer that makes "no chrome in `groupWrapper`" a *failing build*, not a *production papercut*, for the next person who reaches for `groupWrapper`.

---

## Why (context)

cpfg-01 + cpfg-02 lifted the chrome, but nothing stops a future change from re-adding an action component to a `groupWrapper` (the exact bug Phase 4 fixes). And the batch's core promise — "chrome survives re-parenting" — is only as trustworthy as the test that proves it. After this task, both are guarded.

After cpfg-01/02, the **only** legitimate `groupWrapper` is `middle-bottom`'s responsive `<div>`:

```tsx
groupWrapper: (children) => (
  <div className="@container/middle-bottom flex h-full flex-col" style={{ … }}>
    <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
  </div>
),
```

The invariant: a `groupWrapper`'s rendered output may contain only layout/responsive DOM (`<div>` + className/style), never a React context provider or a named action/visual component (`PlanActionFooter`, `SafetyStickyStrip`, `RxFormActionsBridgeProvider`, `ChartRailWithEmptyState`, …).

---

## Files to touch

| File | Change |
|---|---|
| `frontend/lib/patient-profile/__tests__/templates.test.ts` | Add the `groupWrapper` invariant describe block. |
| `frontend/components/patient-profile/__tests__/` (Shell or a new `chrome-reparent.test.tsx`) | Add the re-parent regression describe block. |

No production code changes — **test-only**. (If a small test helper is needed to enumerate every template's `groupWrapper`, add it to the test file, not to production.)

---

## Implementation

### Step 1 — `groupWrapper` invariant test

Enumerate every built-in template (the `BUILT_IN_PRESETS` factories / `getTelemedVideoTemplate` et al.), walk each `PaneDefinition` tree, and for every node with a `groupWrapper`:

- Render `groupWrapper(<div data-testid="gw-children" />)` in isolation.
- Assert the rendered output contains the children marker.
- Assert it does **not** render any of the forbidden components/providers. Practical checks (pick the most robust for the harness):
  - Query `data-testid="plan-action-footer"`, `data-testid="safety-sticky-strip"` → must be absent.
  - The `UnifiedChartRailEmptyState` testid/role → must be absent.
  - Optionally, assert the wrapper's root is a `<div>` (layout-only) — e.g. the rendered fragment's only elements are `div`s plus the children marker.

```ts
describe("cpfg-03: groupWrapper invariant (P4-DL-4)", () => {
  it("no built-in template groupWrapper renders action/visual chrome or a provider", () => {
    for (const template of allBuiltInTemplates()) {
      for (const node of walkPaneDefinitions(template)) {
        if (!node.groupWrapper) continue;
        const { queryByTestId } = render(
          <>{node.groupWrapper(<div data-testid="gw-children" />)}</>,
        );
        expect(queryByTestId("gw-children")).toBeInTheDocument();
        expect(queryByTestId("plan-action-footer")).not.toBeInTheDocument();
        expect(queryByTestId("safety-sticky-strip")).not.toBeInTheDocument();
        // …and the chart-rail empty-state marker is absent…
      }
    }
  });
});
```

> Keep the forbidden-list assertion explicit and named — the failure message should point a future engineer straight at "you put chrome in a groupWrapper; lift it to a shell dock (see Phase 4)."

### Step 2 — Re-parent regression suite

Render the full shell (`<PatientProfilePage>` test harness, or `<PatientProfileShell>` with the page's docks + a layout tree fixture), then for each scenario apply a reshaped `LayoutTree` (via `applyLayoutTree` / a fixture preset) and assert the chrome:

| Scenario | Assert |
|---|---|
| `plan` moved to the left column | `plan-action-footer` still in the document (shell bottom dock), still has the Send button when `canSendPrescription`. |
| `rx` tabbed under `snapshot` | The footer reads the registrar — register a fake `sendAndFinish` via the page-root `RxFormActionsBridgeProvider` and assert clicking Send calls it. |
| safety clash present + `plan` moved | `safety-sticky-strip` still in the document (shell top dock). |
| `snapshot` moved out of the chart rail | `ChartRailWithEmptyState` (empty-state marker) renders inside `snapshot`'s new container. |
| default layout | All chrome renders in its default position (parity, P4-DL-6). |

Reuse the existing mutation/preset fixtures from Phases 1-3 to produce the reshaped trees; don't hand-roll `LayoutTree` JSON if a builder exists.

### Step 3 — DL-9 / DL-8 spot checks (light)

- **DL-9 (no remount):** assert a moved pane keeps its `pane-<id>` key / same testid node identity across a re-parent (a render-count or key assertion, not a full Fiber check — the heavy DL-9 verification lives in Phase 1's suite).
- **DL-8 (live guard):** assert the docked footer's behaviour is identical across states (already covered by `PlanActionFooter.test.tsx`; just confirm the dock placement didn't change it).

---

## Tests

This task **is** tests. Run the full frontend suite plus the new blocks:

```bash
cd frontend
npx tsc --noEmit
npm test -- lib/patient-profile/__tests__/templates.test.ts \
  components/patient-profile/__tests__
```

---

## Acceptance criteria

- [x] Invariant test: every built-in template's `groupWrapper` renders only layout DOM — no provider, no `PlanActionFooter` / `SafetyStickyStrip` / `RxFormActionsBridgeProvider` / `ChartRailWithEmptyState` (P4-DL-4). Failure message names the rule.
- [x] Re-parent regression: `plan`, `rx`, `snapshot` scenarios all pass (footer/safety stay shell-docked; empty-state travels).
- [x] Provider-scope case: docked footer calls the registered `sendAndFinish` after `rx` is re-parented (P4-DL-2).
- [x] Default-layout parity case passes (P4-DL-6).
- [x] No production code changed — test-only.
- [x] `npx tsc --noEmit` + the suites clean.

---

## Out of scope

- Any production behaviour change — if a test reveals a bug, fix it in cpfg-01/02 (or a follow-up), not here.
- Exhaustive DL-9 Fiber-identity verification — owned by Phase 1's suite; this is a light spot check.
- E2E / Playwright — unit + RTL only.

---

## Decision log

- **Invariant as a test, not a lint rule.** A render-based test is simpler than an ESLint AST rule and gives a clearer failure ("chrome in groupWrapper → lift to a dock"). If the team later wants a lint rule too, capture-inbox it.
- **Reuse Phase 1-3 fixtures.** The mutation ops + preset trees already exist; the regression suite consumes them rather than re-deriving reshaped trees.
- **Separate task from the lift.** Tests assert the *combined* cpfg-01 + cpfg-02 result, so they run after both — and keeping them separate keeps each build task's diff focused.

---

## References

- [Phase 4 plan](../plan-p4-cockpit-pane-freedom-chrome-batch.md) · [Execution order](./EXECUTION-ORDER-p4-cockpit-pane-freedom-chrome.md)
- [`frontend/lib/patient-profile/templates.tsx`](../../../../../../../frontend/lib/patient-profile/templates.tsx)
- [`frontend/components/patient-profile/Shell.tsx`](../../../../../../../frontend/components/patient-profile/Shell.tsx)
- [`frontend/lib/patient-profile/layout-tree-mutations.ts`](../../../../../../../frontend/lib/patient-profile/layout-tree-mutations.ts) — reshaping ops for fixtures.
- Prev: [cpfg-02](./task-cpfg-02-chart-rail-leaf-anchor.md) · Next: [cpfg-04](./task-cpfg-04-verification-and-close-out.md)
