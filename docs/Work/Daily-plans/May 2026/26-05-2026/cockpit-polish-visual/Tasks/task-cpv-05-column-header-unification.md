# cpv-05 · Column header unification ✅

> **Wave 3 / Lane α step 0 (sync point)** of [cockpit-polish-visual](../plan-cockpit-polish-visual-batch.md). Resolves issue #17 — column header treatment ad-hoc per column.

**Status:** Done (2026-05-26)

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | S (~50 LOC delta + ~30 LOC tests) |
| **Model** | Auto |
| **Wave** | 3 |
| **Depends on** | — (but bias to run before cpv-06 in Lane α) |
| **Blocks** | cpv-06 (token audit may touch the same files), cpv-08 (close-out) |

---

## Goal

Every column / pane header in the cockpit renders via `<PaneHeader>` with the unified style per DL-5:

```
border-b border-border bg-card text-sm font-semibold px-3 py-2
```

Ad-hoc inline header `<div>` markup in any pane is replaced.

---

## What to do

### 1. Audit existing headers

Grep for ad-hoc headers in cockpit + chart-rail panes:

```powershell
rg "border-b" frontend/components/patient-profile/panes/ -l
rg "border-b" frontend/components/cockpit/ -l
```

Expected suspects (verify):
- `<SnapshotPane>` — may have inline header.
- `<HistoryPane>` — may have inline header (especially around the new chevron from ccd-03).
- `<InvestigationsPane>` — header treatment from cmi-01.
- `<RxPane>` — already uses `<PaneHeader>` per the existing code (line 89-101); confirmed.
- The middle column's overlay strips (`<AssessmentStrip>` / `<SafetyStickyStrip>`) — these are NOT pane headers; leave as-is.

### 2. Open `frontend/components/patient-profile/PaneHeader.tsx`

Verify the existing `<PaneHeader>` interface accepts `actions?` slot. If it does, the rewrite below works as-is. If not, extend the props:

```tsx
export interface PaneHeaderProps {
  title: string;
  titleId?: string;
  actions?: React.ReactNode;
  /** Optional sub-header line, e.g. "Last visit 12 Mar". */
  subtitle?: React.ReactNode;
}

export default function PaneHeader({
  title,
  titleId,
  actions,
  subtitle,
}: PaneHeaderProps): JSX.Element {
  return (
    <div className="flex flex-col border-b border-border bg-card">
      <div className="flex items-center justify-between px-3 py-2">
        <h2
          id={titleId}
          className="text-sm font-semibold text-foreground"
        >
          {title}
        </h2>
        {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
      </div>
      {subtitle ? (
        <div className="px-3 pb-1.5 text-xs text-muted-foreground">
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}
```

### 3. Replace ad-hoc headers

For each pane that currently has inline header markup (e.g. `<div className="flex items-center justify-between border-b ...">`), replace with `<PaneHeader title="..." actions={...} />`.

Pattern for replacement:

**Before:**

```tsx
<div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
  <h3 className="text-sm font-semibold">Snapshot</h3>
  <button onClick={onCollapse}><ChevronDown /></button>
</div>
```

**After:**

```tsx
<PaneHeader
  title="Snapshot"
  actions={
    <button onClick={onCollapse} aria-label="Collapse Snapshot">
      <ChevronDown className="h-4 w-4" />
    </button>
  }
/>
```

### 4. Coordinate with ccd-03

If ccd-03 (disclosure + collapse) hasn't shipped yet, this task's chevron pattern is just a hint — ccd-03 owns the actual chevron + state logic. cpv-05 ensures the chevron has a consistent home (the `actions` slot).

### 5. Update the column-level wrapper if needed

If `templates.tsx makeLeftColumn` / `makeRightColumn` / `makeMiddleColumn` use a column-level title that's rendered separately from per-pane titles, decide:

- Option A: column titles render via `<PaneHeader>` at the column boundary (column-level chrome).
- Option B: column titles are removed; only per-pane `<PaneHeader>` renders.

Pick Option B for cleaner visual hierarchy — the column titles ("Patient", "Consult", "Chart Notes") become structural-only (column dividers, not visible labels) OR they render via `<PaneHeader>` in a slightly smaller variant. Verify the existing shell's behavior and align.

### 6. Tests in `__tests__/PaneHeader.test.tsx`

```tsx
describe("PaneHeader (cpv-05)", () => {
  it("renders title", () => {
    render(<PaneHeader title="Snapshot" />);
    expect(screen.getByText("Snapshot")).toBeInTheDocument();
  });

  it("renders actions when provided", () => {
    render(
      <PaneHeader
        title="Snapshot"
        actions={<button aria-label="Collapse">▼</button>}
      />,
    );
    expect(screen.getByLabelText("Collapse")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(<PaneHeader title="History" subtitle="Last visit 12 Mar" />);
    expect(screen.getByText("Last visit 12 Mar")).toBeInTheDocument();
  });

  it("applies the unified border + bg classes", () => {
    const { container } = render(<PaneHeader title="X" />);
    const header = container.firstChild as HTMLElement;
    expect(header.className).toMatch(/border-b/);
    expect(header.className).toMatch(/bg-card/);
  });
});
```

### 7. Visual regression

After the refactor, open `/dashboard/appointments/[id]` and confirm all visible column headers look identical:

- Same height (py-2 → ~32px).
- Same background (`bg-card`).
- Same border (`border-b border-border`).
- Same title typography (`text-sm font-semibold`).

### 8. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test components/patient-profile/__tests__/PaneHeader.test.tsx
```

---

## Acceptance gate

- [x] Every pane header in the cockpit renders via `<PaneHeader>`.
- [x] No inline ad-hoc `<div>` headers remain in cockpit + chart-rail panes (verified via grep).
- [x] All headers look identical visually (height, bg, border, typography).
- [x] `<PaneHeader>` supports `actions` slot for chevrons / buttons.
- [x] Tests cover title + actions + subtitle.
- [x] tsc + lint clean.

---

## Anti-goals

- ❌ Don't refactor `<AssessmentStrip>` / `<SafetyStickyStrip>` / `<PlanActionFooter>` — those are overlays, not pane headers.
- ❌ Don't change the consultation-chat header — out of scope.
- ❌ Don't add a `subtitle` to every pane — only where it adds value (e.g., History's "Last visit" line).
- ❌ Don't add a colour variant prop — single style across all panes.

---

## Notes

- The existing `<PaneHeader>` (imported by `<RxPane>` line 3) is the canonical source. This task expands its API + retrofits other panes.
- cpv-06 (token audit) may rewrite hex literals in adjacent files; conflict is unlikely because cpv-05 touches headers and cpv-06 touches bodies, but coordinate via the sync point.
