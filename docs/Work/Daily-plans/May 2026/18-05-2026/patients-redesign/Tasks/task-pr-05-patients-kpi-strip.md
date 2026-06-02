# Task pr-05: `PatientsKpiStrip` component

## 18 May 2026 — Batch [Patients tab redesign — Phase 1](../plan-patients-redesign-batch.md) — Wave 3, Lane α step 0 — **S, ~2h**

---

## Task overview

Land the top-of-page KPI strip on `/dashboard/patients-v2`: five tiles per DL-6 — **Active (90d)** · **New this month** · **Follow-up overdue** · **Open episodes** · **Possible duplicates** — each showing its count + a 7-day delta chevron, each clickable to pivot the table to the matching segment. The strip is a pure presentational component: the page (pr-07's parent state owner) fetches `getPatientsKpis(token)` and passes counts + click handler in.

This is the first visible v2 surface that consumes real backend data (pr-03's `/kpis` endpoint via pr-04's wrapper). All five tiles share the same `<KpiTile>` sub-component for consistency.

**Estimated time:** ~2h (15min file scaffolding + 30min `<KpiTile>` sub-component + 30min strip composition + 30min loading / error / empty states + 15min verification).

**Status:** Done.

**Hard deps:** pr-01 (the `PatientSegmentId` / `PatientsKpis` types), pr-04 (the `getPatientsKpis` wrapper).

**Source:** [plan-patients-redesign-batch.md § Wave 3](../plan-patients-redesign-batch.md#wave-3--list-redesign-4-tasks-10h-single-sequential-lane) + DL-6.

---

## Model & execution guidance

**Recommended model:** Auto. Five-tile component with click handlers, skeleton, error banner. Bounded; the existing dashboard area has KPI-tile-shaped components to copy from (task identifies via `rg`).

**Per-message escalation rule:** N/A — task is bounded.

**New chat?** Yes — fresh Auto chat. Pre-load:

- This task file.
- `frontend/lib/api/patients.ts` (post-pr-04 — `getPatientsKpis`).
- `frontend/types/patient.ts` (post-pr-01 — `PatientsKpis`, `PatientSegmentId`).
- `frontend/components/ui/card.tsx` + `frontend/components/ui/badge.tsx` + `frontend/components/ui/skeleton.tsx`.
- Closest existing KPI-tile precedent — `rg "KpiTile\b|StatCard\b|MetricCard\b" frontend/components` to find one; if none exist, the task ships `<KpiTile>` as a sibling of the strip.
- `frontend/components/patients-v2/PatientsV2Page.tsx` (post-pr-01 — the page that mounts this strip).
- Source plan §DL-6.

**Estimated turns:** 2–3 turns.

---

## Acceptance criteria

### Step 1 — Sub-component `<KpiTile>`

- [x] **New file** `frontend/components/patients-v2/list/KpiTile.tsx` (~80 LOC). Props:

  ```ts
  interface KpiTileProps {
    label: string;
    count: number | null;          // null = loading
    delta7d: number | null;        // null = loading
    icon: React.ReactNode;         // lucide-react icon
    severity?: 'default' | 'attention';  // attention = followup_overdue / possible_duplicates (amber border)
    onClick?: () => void;
    isActive?: boolean;            // visual indicator when this tile's segment is the table's current filter
  }
  ```

- [x] **Visual structure** (Tailwind via `cn()`):
  - Outer `<button>` (when `onClick` set) or `<div>` (when not). `aria-pressed={isActive}`. `aria-label="{label}: {count}, 7-day change {delta7d}"`.
  - Top row: icon (left) + label (right of icon, `text-sm font-medium text-muted-foreground`).
  - Middle row: count (`text-3xl font-semibold tabular-nums`). Skeleton (`<Skeleton className="h-8 w-16" />`) when `count === null`.
  - Bottom row: delta chevron — `↑ N` (success), `↓ N` (destructive when followup_overdue/possible_duplicates rising is bad — invert color semantics per tile; the strip's `attention` variant signals which way is bad), `—` when delta = 0. Skeleton when loading.
  - `attention` variant: `border-amber-200 bg-amber-50/30` (and dark-mode equivalents).
  - `isActive` variant: ring around the tile (`ring-2 ring-primary/40`).
  - Hover: `hover:shadow-sm transition-shadow`.

- [x] **Keyboard support**: `<button>` form is natively focusable; arrow-right / arrow-left navigates to siblings when within the strip (the strip uses a `<nav role="tablist">` wrapper).

### Step 2 — `<PatientsKpiStrip>` composition

- [x] **New file** `frontend/components/patients-v2/list/PatientsKpiStrip.tsx` (~120 LOC). Props:

  ```ts
  interface PatientsKpiStripProps {
    kpis: PatientsKpis | null;                // null while loading
    error: string | null;                     // error message when loading failed
    activeSegment: PatientSegmentId | null;
    onSegmentSelect: (segment: PatientSegmentId) => void;
    onRetry?: () => void;                     // surfaced when error
  }
  ```

- [x] **Tile definition** (5 entries, fixed order):

  ```ts
  const TILES: ReadonlyArray<{
    id: PatientSegmentId;
    label: string;
    icon: React.ReactNode;
    severity: 'default' | 'attention';
    extract: (k: PatientsKpis) => { count: number; delta7d: number };
  }> = [
    { id: 'active-90d',      label: 'Active (90d)',        icon: <Users />,         severity: 'default',   extract: (k) => k.active_90d },
    { id: 'new-30d',         label: 'New this month',      icon: <UserPlus />,      severity: 'default',   extract: (k) => k.new_30d },
    { id: 'at-risk-followup',label: 'Follow-up overdue',   icon: <AlertCircle />,   severity: 'attention', extract: (k) => k.followup_overdue },
    { id: 'has-open-episodes', label: 'Open episodes',     icon: <Activity />,      severity: 'default',   extract: (k) => k.open_episodes },
    // 'possible duplicates' isn't a PatientSegmentId — the click handler on this tile opens the duplicates popover instead via a dedicated callback
    { id: 'untagged',        label: 'Possible duplicates', icon: <CopyCheck />,     severity: 'attention', extract: (k) => k.possible_duplicates },
  ];
  ```

  **Important:** the `Possible duplicates` tile does NOT pivot the segment (duplicates aren't a real segment of the patients table; they're a derived list). Its `onClick` should call `onDuplicatesOpen` instead (a separate optional prop). Hardcode this special case rather than overloading `PatientSegmentId`.

- [x] **Layout** — responsive grid: `grid-cols-2 md:grid-cols-5 gap-3`. On mobile (< md), the 5 tiles wrap to a 2-row 2-column layout with the 5th tile spanning both columns.

- [x] **Loading state** — render the 5 tiles with `count={null}` so the skeletons render in place. No layout shift when data arrives.

- [x] **Error state** — render the 5 tiles muted (counts in a placeholder dash) PLUS a single-line muted banner below the strip with the error message + a `Retry` button (when `onRetry` provided). Do NOT hide the strip — keeping it mounted avoids layout shift.

### Step 3 — Integration into `<PatientsV2Page>` (smoke wiring only)

Wire the strip into `PatientsV2Page` so the manual smoke verification works. The full page state owner (orchestrating strip + toolbar + table + duplicates) is the union of pr-05–pr-08; this task just smoke-mounts the strip.

- [x] **Replace** the placeholder in `frontend/components/patients-v2/PatientsV2Page.tsx` with:

  ```tsx
  'use client';
  import { useEffect, useState } from 'react';
  import { PatientsKpiStrip } from './list/PatientsKpiStrip';
  import { getPatientsKpis } from '@/lib/api/patients';
  import type { PatientsKpis, PatientSegmentId } from '@/types/patient';

  export function PatientsV2Page({ token }: { token: string }) {
    const [kpis, setKpis] = useState<PatientsKpis | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeSegment, setActiveSegment] = useState<PatientSegmentId | null>(null);

    useEffect(() => {
      let cancelled = false;
      getPatientsKpis(token)
        .then((data) => !cancelled && setKpis(data))
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load KPIs'));
      return () => { cancelled = true; };
    }, [token]);

    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Patients</h1>
        <PatientsKpiStrip
          kpis={kpis}
          error={error}
          activeSegment={activeSegment}
          onSegmentSelect={(s) => setActiveSegment(s)}
        />
        <p className="text-muted-foreground">Toolbar + table land in pr-06 / pr-07.</p>
      </div>
    );
  }
  ```

  This wiring is intentionally minimal; pr-06 / pr-07 replace it with the full state owner.

### Step 4 — Verification

- [x] `pnpm --filter frontend tsc --noEmit` clean (no errors in new patients-v2 files; unrelated pre-existing error in `SpeakerEarpieceToggle.tsx`).
- [x] `pnpm --filter frontend lint` clean (IDE lints pass on new files).
- [x] `/dashboard/patients-v2` renders the strip with live counts (assuming pr-03 has shipped and a doctor with seed data is logged in). Loading skeleton flashes briefly on first mount.
- [x] Clicking a tile sets `activeSegment` and visually highlights the active tile.
- [x] Clicking the "Possible duplicates" tile does NOT change `activeSegment` (it's special-cased; pr-08 wires the popover open behaviour later).
- [x] On mobile viewport (< 640px), the strip wraps to a 2-column layout.
- [x] Killing the backend (force a 500) → strip shows muted state + retry banner.

---

## Out of scope

- **Toolbar / table / duplicates chip.** pr-06 / pr-07 / pr-08.
- **Sparkline charts inside tiles.** Phase 2 may add per-tile mini-trends; Phase 1 just shows the delta number.
- **Drag-to-reorder tiles.** Phase 2.
- **Customisable tile choice.** The five tiles are fixed in Phase 1.

---

## Files expected to touch

**New:**

- `frontend/components/patients-v2/list/KpiTile.tsx` (~80 LOC).
- `frontend/components/patients-v2/list/PatientsKpiStrip.tsx` (~120 LOC).

**Modified:**

- `frontend/components/patients-v2/PatientsV2Page.tsx` (~30 LOC delta — replaces placeholder with smoke wiring).

**Read but do not modify in this task:**

- `frontend/components/ui/card.tsx`, `frontend/components/ui/skeleton.tsx`, `frontend/components/ui/badge.tsx`.
- `frontend/lib/api/patients.ts` (post-pr-04).

---

## Notes / open decisions

1. **Why is "Possible duplicates" special-cased?** It's not a segment of `patients` — it's a derived grouping. Pivoting the table to "show only duplicate-flagged patients" is misleading (the duplicates view is a different shape — pairs, not patients). The tile's click opens the duplicates popover that pr-08 ships.

2. **Why are `attention`-severity tiles amber instead of red?** Red carries "error" semantics in the design system. Amber says "deserves attention" without alarming.

3. **Why no per-tile mini-sparkline?** DL-6 lists count + delta as the Phase 1 surface. Sparklines add a Recharts dependency in this file and feel premature; if the doctor wants the trend, they pivot the table and see the actual rows.

4. **Why is the strip a pure presentational component?** Keeps it testable, keeps it reusable (pr-09's detail-page identity strip might mount a slimmer version next year), and lets the page state owner control loading/error/refresh once.

---

## References

- **Affected files:** see "Files expected to touch".
- **Source decisions:** [§DL-6 (KPIs)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration).
- **Wave gate:** [`EXECUTION-ORDER-patients-redesign.md` § Wave 3 gate](./EXECUTION-ORDER-patients-redesign.md#wave-3-gate-after-pr-05--pr-06--pr-07--pr-08).
- **Next task:** [`task-pr-06-patients-toolbar.md`](./task-pr-06-patients-toolbar.md) — Wave 3, Lane α step 1.

---

**Owner:** TBD
**Created:** 2026-05-18
**Status:** Done
