# cnc-01 · Cockpit-mode prop + RxSectionNav gate

> **Wave 1** of [cockpit-nav-clarity](../plan-cockpit-nav-clarity-batch.md). Resolves issue #7 — `<RxSectionNav>` chip strip stacks under the template tab nav in cockpit mode.

| Property | Value |
|---|---|
| **Status** | ✅ Done (2026-05-26) |
| **Owner** | Frontend |
| **Size** | S (~40 LOC delta + ~30 LOC tests) |
| **Model** | Auto |
| **Wave** | 1 |
| **Depends on** | — (but lands AFTER ppd-01 to avoid merge churn) |
| **Blocks** | cnc-05 (close-out) |

---

## Goal

Introduce a `cockpitMode?: boolean` prop on `<RxPane>` + `<RxWorkspace>`. When `true`, `<RxSectionNav>` does NOT render. Default `false` — non-cockpit mounts unchanged.

---

## What to do

### 1. `frontend/components/patient-profile/panes/RxPane.tsx`

Add to `RxPaneProps`:

```ts
  /**
   * cnc-01: when true, suppresses the `<RxSectionNav>` chip strip — the
   * cockpit shell's per-pane tab nav already provides section navigation.
   * Defaults to `false` for non-cockpit mounts.
   */
  cockpitMode?: boolean;
```

Destructure with default `false`. Forward to `<RxWorkspace cockpitMode={cockpitMode}>`.

### 2. `frontend/components/consultation/cockpit/RxWorkspace.tsx`

Add to `RxWorkspaceProps`:

```ts
  /** cnc-01: see RxPaneProps.cockpitMode. */
  cockpitMode?: boolean;
```

Destructure with default `false`.

Locate the `<RxSectionNav>` JSX (currently lines 216-225). Wrap in a conditional:

```tsx
          {!cockpitMode && (
            <RxSectionNav
              scrollContainerRef={scrollRef}
              sections={[
                { id: 'rx-symptoms', label: 'Symptoms' },
                { id: 'rx-diagnosis', label: 'Diagnosis' },
                { id: 'rx-investigations', label: 'Investigations' },
                { id: 'rx-medicines', label: 'Medicines', count: medicineCount },
                { id: 'rx-notes', label: 'Notes' },
              ]}
            />
          )}
```

### 3. `frontend/lib/patient-profile/templates.tsx`

In `makeMiddleBottomRow`'s Plan leaf `<RxPane>` JSX (line ~313), add `cockpitMode`:

```tsx
            <RxPane
              appointment={appointment}
              token={ctx.token}
              state={ctx.state}
              onRxSent={ctx.onRxSent}
              onFinishVisit={ctx.onFinishVisit}
              onMedicineCountChange={ctx.onMedicineCountChange}
              hideHeader
              actionsInFooter
              dxLifted
              safetyLifted
              cockpitMode
              {/* ppd lifts here too once ppd-04 merges */}
            />
```

(If ppd-04 has already merged, the four ppd lifts will already be present — leave them. If not, add `cockpitMode` and let ppd-04's PR add the rest.)

### 4. Tests

#### `frontend/components/consultation/cockpit/__tests__/RxWorkspace.test.tsx` (mod or new)

If the file doesn't exist, create with the standard testing-library setup.

```tsx
describe("RxWorkspace cockpitMode prop", () => {
  it("renders RxSectionNav by default", () => {
    renderWithProvider({ cockpitMode: false });
    expect(screen.getByText("Symptoms")).toBeInTheDocument();
  });

  it("hides RxSectionNav when cockpitMode=true", () => {
    renderWithProvider({ cockpitMode: true });
    expect(screen.queryByText("Symptoms")).not.toBeInTheDocument();
    expect(screen.queryByText("Medicines")).not.toBeInTheDocument();
  });

  it("default (no prop) renders the chip strip", () => {
    renderWithProvider({});
    expect(screen.getByText("Symptoms")).toBeInTheDocument();
  });
});
```

(Where `renderWithProvider` wraps with `<RxFormProvider>` + `<SideSheetProvider>` per existing test pattern.)

### 5. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test components/consultation/cockpit/__tests__/RxWorkspace.test.tsx
```

---

## Acceptance gate

- [x] `<RxPane>` + `<RxWorkspace>` accept `cockpitMode?: boolean`, default `false`.
- [x] `templates.tsx` sets `cockpitMode={true}` on the Plan `<RxPane>`.
- [x] `<RxWorkspace cockpitMode>` does NOT render `<RxSectionNav>`.
- [x] Default behavior preserved (non-cockpit mounts still see the chip strip).
- [x] Tests cover both branches.
- [x] tsc + lint clean.

---

## Anti-goals

- ❌ Don't delete `<RxSectionNav>` — non-cockpit mounts still use it.
- ❌ Don't conflate `cockpitMode` with the ppd lift props — they're independent concerns (nav chrome vs content sections).
- ❌ Don't add a per-doctor toggle for the chip strip in cockpit mode — capture-inbox if requested.

---

## Notes

- The four-section Plan column will, post-ppd, only host Medicines + Investigations (via cmi auto-merge fallback). The five chip-strip labels (Symptoms / Diagnosis / Investigations / Medicines / Notes) become misleading or redundant in cockpit mode → hide.
- `cockpitMode` is the FIFTH "lift-style" prop; consider in capture-inbox whether to consolidate into a single `<CockpitContext>` provider in Phase 4. For now: flat props.
