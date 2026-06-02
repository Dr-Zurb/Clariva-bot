# ccd-03 · Disclosure affordance + per-pane collapse

> **Wave 1 / Lane β** of [cockpit-chart-density](../plan-cockpit-chart-density-batch.md). Resolves issue #12 — disclosure affordance inconsistent across chart-rail panes.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | S (~70 LOC delta + ~60 LOC tests) |
| **Model** | Auto |
| **Wave** | 1 |
| **Depends on** | ccd-01 |
| **Blocks** | ccd-04 (close-out) |

---

## Goal

Every chart-rail pane (Snapshot, History, and any allergy / chronic / problem-list sub-cards inside History) has a chevron in its header. Clicking toggles between expanded body and a single-line summary (DL-4 + DL-5).

---

## What to do

### 1. Identify the chart-rail panes

- `<SnapshotPane>` — left-column top child.
- `<HistoryPane>` — left-column bottom child.
- Inside `<HistoryPane>` body: allergy card, chronic conditions card, problem list card. These are the sub-cards that today have inconsistent chevrons.

### 2. Add chevron + collapse state to `<SnapshotPane>` + `<HistoryPane>`

If `<PaneHeader>` already supports a chevron + `onCollapse` prop (likely from cpv-05's column-header unification), reuse it. Otherwise, add a chevron button to the header markup.

Pattern:

```tsx
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export default function SnapshotPane(props: SnapshotPaneProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { hideHeader, /* ... */ } = props;

  return (
    <div className="flex h-full flex-col">
      {!hideHeader && (
        <PaneHeader
          title="Snapshot"
          actions={
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand Snapshot" : "Collapse Snapshot"}
              aria-expanded={!collapsed}
              className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          }
        />
      )}
      {collapsed ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          {summarize(vitals)}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* existing body */}
        </div>
      )}
    </div>
  );
}

function summarize(vitals: { heightCm?: number | null; weightKg?: number | null }): string {
  const parts: string[] = [];
  if (vitals.heightCm != null) parts.push(`${vitals.heightCm}cm`);
  if (vitals.weightKg != null) parts.push(`${vitals.weightKg}kg`);
  return parts.length ? parts.join(" · ") : "No vitals on file";
}
```

**Caveat:** the chart-rail uses `hideHeader` (from `templates.tsx makeLeftColumn` — see line 195/210). When `hideHeader === true`, the column-level header shows the title; the pane body doesn't render its own. The chevron must live in the column-level header OR the per-pane chrome (need to pick one).

**Decision:** add the chevron to the per-pane header. Update `makeLeftColumn` in templates.tsx to NOT pass `hideHeader` for these panes (drop `hideHeader` from both `<SnapshotPane>` and `<HistoryPane>` JSX). The pane-level `<PaneHeader>` becomes the source of truth for both title + chevron.

If this conflicts with cpv-05's column-header unification (which routes everything through `<PaneHeader>` anyway), confirm with cpv-05's task before commit — they're aligned in intent.

### 3. Apply the pattern to History sub-cards

Inside `<HistoryPane>`, the body renders multiple "cards" (Allergies, Chronic, Problem list). Each card has a small header. Add a chevron to each card's header using the same pattern:

```tsx
function AllergyCard({ allergies }: { allergies: Allergy[] }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="text-sm font-semibold">Allergies</h3>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand Allergies" : "Collapse Allergies"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      {collapsed ? (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          {allergies.length} {allergies.length === 1 ? "allergy" : "allergies"}
        </div>
      ) : (
        <div className="p-3">
          {/* existing allergy list */}
        </div>
      )}
    </div>
  );
}
```

Do the same for Chronic conditions card + Problem list card.

### 4. Collapsed state is NOT persisted (DL-5)

`useState(false)` (start expanded). On reload, all panes are expanded again. Capture-inbox: persist later.

### 5. Tests

In each pane's test file (or a single `__tests__/chart-rail-disclosure.test.tsx`):

```tsx
describe("Chart-rail disclosure (ccd-03)", () => {
  it("SnapshotPane chevron toggles between expanded and summary", () => {
    renderWithProvider();
    expect(screen.getByText("Height: …")).toBeInTheDocument(); // some expanded content
    fireEvent.click(screen.getByLabelText("Collapse Snapshot"));
    expect(screen.queryByText("Height: …")).not.toBeInTheDocument();
    expect(screen.getByText(/172cm/)).toBeInTheDocument(); // summary
  });

  it("HistoryPane allergy card chevron toggles", () => {
    renderWithProvider({ allergies: [{ name: "Penicillin", severity: "high" }] });
    expect(screen.getByText("Penicillin")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Collapse Allergies"));
    expect(screen.queryByText("Penicillin")).not.toBeInTheDocument();
    expect(screen.getByText(/1 allergy/)).toBeInTheDocument();
  });

  it("aria-expanded reflects state", () => {
    renderWithProvider();
    const chevron = screen.getByLabelText("Collapse Snapshot");
    expect(chevron).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(chevron);
    expect(screen.getByLabelText("Expand Snapshot")).toHaveAttribute("aria-expanded", "false");
  });
});
```

### 6. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test components/patient-profile/panes/__tests__/
```

---

## Acceptance gate

- [x] Every chart-rail pane has a chevron in its header.
- [x] Clicking the chevron toggles collapsed state.
- [x] Collapsed state shows a single-line summary; expanded shows full body.
- [x] `aria-expanded` + `aria-label` correctly reflect state.
- [x] Tests cover all chart-rail panes.
- [x] tsc + lint clean.

---

## Done (2026-05-26)

- `PaneCollapseChevron` shared control; `SnapshotPane` / `HistoryPane` use `PaneHeader` + pane-level summary.
- `SectionWrapper` uses lucide chevrons + `collapsedSummary` for Allergies / Chronic / Problem list / Vitals / Medications.
- `hideShellHeader` on chart-rail leaves so shell does not duplicate pane headers (`templates.tsx`).
- Tests: `chart-rail-disclosure.test.tsx`, `snapshot-pane-summary.test.ts`.

---

## Anti-goals

- ❌ Don't persist collapse state — DL-5.
- ❌ Don't add animation — capture-inbox.
- ❌ Don't bake collapse state into `RxFormContext` — it's UI-local, not draft data.
- ❌ Don't add a "collapse all" / "expand all" button — capture-inbox.

---

## Notes

- This task and cpv-05 (column-header unification) are aligned in intent. If cpv-05 hasn't shipped yet, ccd-03's chevron lands directly in the existing `<PaneHeader>` actions slot (if it accepts one); otherwise inline a header div with the chevron.
- The summary copy ("3 allergies", "Last visit: 12 Mar") needs concrete data shapes — derive from the existing rendered data.
- Issue #11 (Snapshot empty even when patient has vitals) is solved by ccd-02; this task only adds the chevron, not the data wiring.
