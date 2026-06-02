# rxss-02 · `<PreviousRxSideSheet>` component

> **Wave 2** of [rx-polish-side-sheet](../plan-rx-polish-side-sheet-batch.md). The heart of the batch — full UI.

| **Size** | M | **Model** | Auto | **Wave** | 2 | **Depends on** | rxss-01 | **Blocks** | rxss-03 |

---

## What to do

### 1. New `frontend/components/cockpit/rx/previous/PreviousRxSideSheet.tsx`

Skeleton:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSideSheet } from "@/lib/patient-profile/aux-surfaces"; // or wherever the hook lives
import { usePriorRxList } from "@/hooks/usePriorRxList";
import { canEnableChip, type PriorRxChip } from "@/lib/cockpit/prior-rx-filter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface PreviousRxSideSheetProps {
  appointmentId: string;
  patientId: string | null;
  token: string;
  currentDx: string;
  activeConditions: string[];
  onApply: (priorRx: PrescriptionWithRelations) => void;
}

export default function PreviousRxSideSheet(props: PreviousRxSideSheetProps) {
  const [chip, setChip] = useState<PriorRxChip>("all");
  const [search, setSearch] = useState("");

  const { filtered, all, isLoading, error } = usePriorRxList({ ...props, chip, search });

  return (
    <div className="flex h-full flex-col">
      <header className="border-b p-4">
        <h2 className="text-lg font-semibold">Previous prescriptions</h2>
        <p className="text-sm text-muted-foreground">{all.length} total · {filtered.length} shown</p>
      </header>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 border-b px-4 py-2">
        {(["all", "last-30-days", "same-diagnosis", "active-condition"] as PriorRxChip[]).map((c) => {
          const enabled = canEnableChip(c, { currentDx: props.currentDx, activeConditions: props.activeConditions });
          return (
            <button
              key={c}
              disabled={!enabled}
              onClick={() => setChip(c)}
              className={chipClass(c === chip, enabled)}
              aria-pressed={c === chip}
            >
              {chipLabel(c)}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="border-b px-4 py-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by medicine name…"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && <SkeletonList />}
        {error && <ErrorState error={error} />}
        {!isLoading && !error && filtered.length === 0 && <EmptyState />}
        {!isLoading && !error && filtered.length > 0 && (
          <PriorRxList rxes={filtered} onApply={props.onApply} useVirtual={filtered.length > 20} />
        )}
      </div>
    </div>
  );
}
```

### 2. Sub-components inside the same file

- `<PriorRxList rxes onApply useVirtual>` — virtual when > 20 (DL-10) using `react-window`'s `FixedSizeList`. Each row: date + status pill + Dx + medicines summary (first 2 + "+N more") + `[Apply]` button.
- `<SkeletonList>` — 3 skeleton rows.
- `<EmptyState>` — "No matches" / "No prior prescriptions" depending on `all.length`.
- `<ErrorState>` — "Couldn't load prior Rxes" + retry button.

### 3. Register via `SideSheetAnchor` contract

At mount in a parent like `<RxWorkspace>` (or wherever Cockpit Rx-zone lives), register:

```tsx
const sideSheet = useSideSheet();
useEffect(() => {
  const unregister = sideSheet.register({
    id: "previous-rx",
    title: "Previous Rx",
    widthPct: 35, // ~480px on 1366×768
    render: () => (
      <PreviousRxSideSheet
        appointmentId={appointmentId}
        patientId={patientId}
        token={token}
        currentDx={state.fields.provisionalDiagnosis}
        activeConditions={activeConditions}
        onApply={handleApplyPriorRx}
      />
    ),
  });
  return unregister;
}, [appointmentId, patientId, token, state.fields.provisionalDiagnosis, activeConditions]);
```

`handleApplyPriorRx` is wired in rxss-03.

### 4. Tests `frontend/components/cockpit/rx/previous/__tests__/PreviousRxSideSheet.test.tsx`

- Renders header with counts.
- Chips render; disabled state for empty Dx / conditions.
- Search box filters list.
- Skeleton during load.
- Empty state when filtered is empty.
- Virtual scroll engages > 20 rows (mock + assert `react-window`'s list renders).

### 5. Add `react-window` to deps if not present

```powershell
pnpm --filter frontend add react-window
pnpm --filter frontend add -D @types/react-window
```

### 6. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test components/cockpit/rx/previous/__tests__/PreviousRxSideSheet.test.tsx
```

---

## Acceptance gate

- [x] Component renders standalone in tests.
- [x] Anchor registers via `SideSheetAnchor` contract.
- [x] Chip + search behave per DL-4..6.
- [x] Virtual scroll at > 20 rows.

---

## Anti-goals

- ❌ Don't compute the diff here — rxss-03 owns that.
- ❌ Don't fetch in the component — the hook from rxss-01 owns it.
- ❌ Don't add infinite scroll — entire list is small enough.
- ❌ Don't add sort options in v1 — server returns newest-first; that's enough.
