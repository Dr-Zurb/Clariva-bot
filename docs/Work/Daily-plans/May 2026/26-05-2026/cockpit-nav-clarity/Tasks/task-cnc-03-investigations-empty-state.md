# cnc-03 · Investigations pane empty-state

> **Status:** Done (2026-05-26). Empty-state + Add CTA; Add reveals chip-row editor (no `AddInvestigationDialog` in repo).

> **Wave 2 / Lane β** of [cockpit-nav-clarity](../plan-cockpit-nav-clarity-batch.md). Resolves issue #8 — Investigations pane header with empty body.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | S (~60 LOC delta + ~50 LOC tests) |
| **Model** | Auto |
| **Wave** | 2 |
| **Depends on** | — |
| **Blocks** | cnc-05 (close-out) |

---

## Goal

When `<InvestigationsPane>` has no orders AND `state !== "terminal"`, render an empty-state placeholder per DL-4 + DL-5: copy `"No tests ordered yet"` + a secondary `[+ Add test]` button.

---

## What to do

### 1. Open `frontend/components/patient-profile/panes/InvestigationsPane.tsx`

Locate the existing render block. The current body either renders `<InvestigationsChipRow>` (cmi-02) or nothing when no orders exist.

Identify the count source — likely `useInvestigationsCount` (from cmi-01) or directly reading the `prescription.investigations` string from `useRxForm()`. Choose the appropriate signal:

- If `useInvestigationsCount` exists → use it.
- Otherwise → compute `const isEmpty = !rxForm?.fields.investigations?.trim();`.

Add the empty-state branch:

```tsx
import { Beaker, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

// ...inside the component, after computing isEmpty...

const showEmptyState = isEmpty && state !== "terminal";

if (showEmptyState) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <Beaker className="h-8 w-8 text-muted-foreground/60" aria-hidden />
      <p className="text-sm text-muted-foreground">No tests ordered yet</p>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleAddInvestigation}
        aria-label="Add an investigation"
      >
        <Plus className="mr-1 h-4 w-4" />
        Add test
      </Button>
    </div>
  );
}

// ...existing render path for non-empty / terminal states...
```

### 2. Wire `handleAddInvestigation`

Define a click handler that opens the investigations input. Two paths to choose from (use whichever already exists):

**Path A — `<AddInvestigationDialog>` from cmi-01 exists:**

```tsx
const [addDialogOpen, setAddDialogOpen] = useState(false);

function handleAddInvestigation() {
  setAddDialogOpen(true);
}

// ... wrap return in a fragment with <AddInvestigationDialog open={addDialogOpen} ... />
```

**Path B — no dialog exists yet; focus the inline investigations input instead:**

```tsx
function handleAddInvestigation() {
  // Scroll to + focus the investigations input in the Plan column.
  const input = document.getElementById("rx-investigations-input");
  input?.focus();
  input?.scrollIntoView({ behavior: "smooth", block: "center" });
}
```

Discover which exists with a quick `Glob frontend/**/AddInvestigation*.tsx`. If both options are missing, use Path B and capture-inbox for a proper dialog in a follow-up.

### 3. Terminal-state copy

For `state === "terminal"` with no orders, keep the existing terminal-state behavior (likely a "Pane not available" message or empty render). Do NOT add the "Add test" CTA in terminal state per DL-10.

### 4. Tests in `frontend/components/patient-profile/panes/__tests__/InvestigationsPane.test.tsx` (mod or new)

```tsx
describe("InvestigationsPane empty-state (cnc-03)", () => {
  it("shows empty-state copy + Add CTA when no orders and state is live", () => {
    renderWithProvider({ state: "live", investigationsCount: 0 });
    expect(screen.getByText("No tests ordered yet")).toBeInTheDocument();
    expect(screen.getByLabelText("Add an investigation")).toBeInTheDocument();
  });

  it("hides empty-state when orders exist", () => {
    renderWithProvider({ state: "live", investigationsCount: 1 });
    expect(screen.queryByText("No tests ordered yet")).not.toBeInTheDocument();
  });

  it("hides Add CTA in terminal state", () => {
    renderWithProvider({ state: "terminal", investigationsCount: 0 });
    expect(screen.queryByLabelText("Add an investigation")).not.toBeInTheDocument();
  });

  it("Add button opens the dialog / focuses the input", () => {
    renderWithProvider({ state: "live", investigationsCount: 0 });
    fireEvent.click(screen.getByLabelText("Add an investigation"));
    // Assert dialog open OR focus on the inline input, depending on Path A / B.
  });
});
```

### 5. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test components/patient-profile/panes/__tests__/InvestigationsPane.test.tsx
```

---

## Acceptance gate

- [x] Empty + live + non-terminal state → empty-state copy + Add CTA visible.
- [x] Empty + terminal state → no Add CTA (existing terminal-state copy preserved).
- [x] At least 1 investigation → empty-state hidden.
- [x] Add button triggers a meaningful action (dialog or focus).
- [x] Tests cover all four state combinations.
- [x] tsc + lint clean.

---

## Anti-goals

- ❌ Don't backfill an `<AddInvestigationDialog>` if it doesn't exist — capture-inbox.
- ❌ Don't change the existing non-empty render path — leave `<InvestigationsChipRow>` alone.
- ❌ Don't fire telemetry on the Add button click here — close-out (cnc-05) wires the per-batch telemetry.
- ❌ Don't gate on `state !== "wrap_up"` — wrap_up should still allow adding investigations.

---

## Notes

- `<InvestigationsPane>` is mounted inside `makeMiddleBottomRow`'s `investigations-orders` child (line 287 of templates.tsx) and is hidden via container query when the row is too narrow. Empty-state still renders even when the pane is hidden (container query just affects visibility); no special-casing needed.
- The container-query hide pattern (`hidden h-full @[720px]/middle-bottom:block` at line 292) means the empty-state takes container-query width into account automatically.
