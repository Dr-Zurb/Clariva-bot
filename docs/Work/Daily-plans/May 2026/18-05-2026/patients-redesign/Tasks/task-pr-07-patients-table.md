# Task pr-07: `PatientsTable` with sortable columns, hover quick-peek, bulk select

## 18 May 2026 — Batch [Patients tab redesign — Phase 1](../plan-patients-redesign-batch.md) — Wave 3, Lane α step 2 — **M, ~3.5h**

---

## Task overview

Replace the v1 card list (`PatientsListWithFilters.tsx`) with a real data table that scales to ~5k rows per doctor and surfaces the triage signals a doctor needs at a glance: avatar, name + risk pills, demographics, MRN (click-to-copy), masked phone (tel: link + mask toggle), last visit (date + modality icon), next visit (date + status), open episodes count, source channel, actions kebab.

Three secondary capabilities ride along:

1. **Sortable columns** via header clicks — each header that's sortable shows a sort indicator; clicking cycles asc / desc / unsorted.
2. **Quick-peek on row hover** (DL-10) — after a 400ms hover, a Radix `HoverCard` opens to the right of the row showing the Overview tab's snapshot card + active problems + allergies + chronic conditions, lazy-loaded via `getPatientOverview`.
3. **Bulk select** (DL-11) — checkboxes per row; the toolbar's right side morphs into a bulk-actions bar when ≥ 1 row is selected, exposing **Export CSV** and **Tag** actions.

The table consumes the page state owner's filter shape (from pr-06's URL-backed state) plus pagination state owned locally. It fires `getPatientsList(token, filters)` on every filter / sort / page change.

**Estimated time:** ~3.5h (45min table scaffolding + 30min column definitions + 30min sorting + 45min hover quick-peek + 30min bulk-select + actions + 15min pagination footer + 15min verification).

**Status:** Done.

**Hard deps:** pr-01 (types), pr-04 (`getPatientsList`, `getPatientOverview`), pr-05 (the KPI strip's `activeSegment` filter), pr-06 (the toolbar's filter state).

**Source:** [plan-patients-redesign-batch.md § Wave 3](../plan-patients-redesign-batch.md#wave-3--list-redesign-4-tasks-10h-single-sequential-lane) + DL-10, DL-11.

---

## Model & execution guidance

**Recommended model:** Auto. Standard table component + Radix `HoverCard` for the quick-peek. The trickiest piece is the hover-debounce + lazy-fetch on the quick-peek; Radix's `HoverCard` handles the basics, and a `useEffect` inside the popover content fires the fetch on first open.

**Per-message escalation rule:** Escalate to Opus only if the hover-card lazy-load causes layout flicker on first render or if the bulk-actions state-machine confuses two consecutive selections. Standard patterns; shouldn't need escalation.

**New chat?** Yes — fresh Auto chat. Pre-load:

- This task file.
- `frontend/components/ui/table.tsx` (the design-system `<Table>` primitive — verify it supports `<thead>`/`<tbody>` natively).
- `frontend/components/ui/hover-card.tsx` (Radix `HoverCard` — read the props).
- `frontend/components/ui/checkbox.tsx` (bulk-select checkboxes).
- `frontend/components/ui/dropdown-menu.tsx` (row actions kebab).
- `frontend/lib/api/patients.ts` (post-pr-04 — `getPatientsList` + `getPatientOverview`).
- `frontend/components/patient-profile/PatientProfileHeader.tsx` (the risk-pill component pattern at `formatDemographics` and the modality icon usage).
- `frontend/components/patients/PatientsListWithFilters.tsx` (v1 — read for behavioural reference; the masked-phone helper might live here).
- `frontend/components/patients-v2/PatientsV2Page.tsx` (post-pr-06 — the state owner this task extends).
- Source plan §DL-10, §DL-11.

**Estimated turns:** 5–6 turns.

---

## Acceptance criteria

### Step 1 — Column definitions

- [x] **New file** `frontend/components/patients-v2/list/PatientsTableColumns.ts` (~80 LOC). Defines the column metadata:

  ```ts
  export interface PatientsTableColumn {
    id: string;                                // matches the column-chooser checkbox id
    label: string;
    sortKey?: PatientListSortId;               // when set, the column is sortable
    optional: boolean;                         // can be toggled off in the column chooser
    defaultVisible: boolean;
    cell: (patient: PatientSummary) => React.ReactNode;
    headerClass?: string;
    cellClass?: string;
  }

  export const PATIENTS_TABLE_COLUMNS: ReadonlyArray<PatientsTableColumn> = [
    // checkbox column is special — rendered inline in the table, not via this array
    { id: 'avatar',        label: '',                    optional: true,  defaultVisible: true,  cell: avatarCell, cellClass: 'w-10' },
    { id: 'name',          label: 'Name',                sortKey: 'name-asc', optional: false, defaultVisible: true, cell: nameAndRiskPillsCell },
    { id: 'demographics',  label: 'Demographics',        optional: true,  defaultVisible: true,  cell: demographicsCell },
    { id: 'mrn',           label: 'MRN',                 optional: true,  defaultVisible: true,  cell: mrnCell },
    { id: 'phone',         label: 'Phone',               optional: true,  defaultVisible: true,  cell: phoneCell },
    { id: 'last_visit',    label: 'Last visit',          sortKey: 'last-visit-desc', optional: true, defaultVisible: true, cell: lastVisitCell },
    { id: 'next_visit',    label: 'Next visit',          optional: true,  defaultVisible: false, cell: nextVisitCell },
    { id: 'open_episodes', label: 'Open episodes',       optional: true,  defaultVisible: false, cell: openEpisodesCell },
    { id: 'source',        label: 'Source',              optional: true,  defaultVisible: false, cell: sourceChannelCell },
    // actions kebab is special — rendered inline at the end, always present
  ];
  ```

  Each `*Cell` function is a small (~10–25 LOC) renderer. Pure-function form so they're easy to test independently.

### Step 2 — Cell renderers

- [x] **`avatarCell`** — initials in a `<div className="w-8 h-8 rounded-full bg-muted">` (no image source in Phase 1 — placeholder for Phase 2's profile pictures).
- [x] **`nameAndRiskPillsCell`** — patient name as bold link (`<Link href={\`/dashboard/patients-v2/\${id}\`}>`), risk pills below in a smaller row. The risk pills (allergy / open episode / overdue) come from quick-look fields on `PatientSummary` (verify the v1 summary already exposes `has_allergies` / `open_episodes_count` / `overdue_followup` — if not, pr-02 extends; task does a discovery `rg`).
- [x] **`demographicsCell`** — `{age}y · {sex_short}` (e.g. "34y · M"). Reuses `formatDemographics` from the cockpit header pattern.
- [x] **`mrnCell`** — `<button onClick={() => copyToClipboard(mrn)} title="Click to copy">{mrn}</button>` with a tiny copy icon. Toast on success ("Copied MRN").
- [x] **`phoneCell`** — masked by default (`+91 ****12 34`), `<button>` to reveal full number for 5 seconds, `<a href="tel:…">` icon to dial.
- [x] **`lastVisitCell`** — `{relative_date}` (e.g. "2 days ago") + modality icon to the left (Video / Mic / MessageSquare / Phone), `null` → dash.
- [x] **`nextVisitCell`** — same shape as `lastVisitCell` but with `Calendar` icon and the appointment status badge (Scheduled / Confirmed / Tentative). `null` → dash.
- [x] **`openEpisodesCell`** — `{count}` with the link to filter the table by `?segment=has-open-episodes&q=patient:{id}` (or similar — the segment will narrow the list to this patient's open-episode rows).
- [x] **`sourceChannelCell`** — channel icon (WhatsApp / IG / Web / In-clinic) + the source string. `null` → dash.

### Step 3 — `<PatientsTable>` composition

- [x] **New file** `frontend/components/patients-v2/list/PatientsTable.tsx` (~250 LOC). Props:

  ```ts
  interface PatientsTableProps {
    filters: PatientListFilters;               // from URL via the state owner
    visibleColumns: string[];                  // from the toolbar's column chooser
    density: 'compact' | 'comfortable';
    selectedPatientIds: string[];              // from the state owner
    onSelectionChange: (ids: string[]) => void;
    onSortChange: (sort: PatientListSortId | undefined) => void;
    token: string;                             // for the lazy quick-peek fetch
  }
  ```

- [x] **Data fetch** in a `useEffect` triggered by `filters` changes:
  ```ts
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPatientsList(token, filters)
      .then((data) => { if (!cancelled) { setRows(data.patients); setTotal(data.total); } })
      .catch((e) => { if (!cancelled) setError(...) })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, JSON.stringify(filters)]);  // stringify because filters is a derived object
  ```

- [x] **Table structure**: shadcn `<Table>` → `<TableHeader>` (with sortable column headers showing the sort indicator) → `<TableBody>` (one `<TableRow>` per patient).

- [x] **Density** affects row height: `comfortable` = `py-3`, `compact` = `py-1`. Apply via the `cellClass` on the dynamic class.

- [x] **Empty states**: 
  - No matches (filter active) → "No patients match the current filter. Clear filter to see all."
  - Empty doctor (no patients at all) → "No patients yet. Add one to get started."
  - Server error → "Couldn't load patients. {error message}" + retry button.

- [x] **Loading state**: skeleton rows (~10 rows of `<Skeleton>` placeholders) preserving column widths.

### Step 4 — Sorting

- [x] **Sortable column headers** render an indicator: `<ChevronUp />` (asc), `<ChevronDown />` (desc), `<ChevronsUpDown />` (unsorted).
- [x] **Click cycle**: unsorted → desc → asc → unsorted (for `last-visit` and `created-at`). For `name`, only asc and unsorted (asc is the natural sort; desc is rarely useful — bias toward simplicity).
- [x] **Apply** by calling `onSortChange(newSort)` — the state owner updates `?sort=` in the URL, which re-triggers the fetch.

### Step 5 — Hover quick-peek (DL-10)

- [x] **Wrap each row** in a Radix `<HoverCard openDelay={400} closeDelay={100}>`:
  ```tsx
  <HoverCard>
    <HoverCardTrigger asChild>
      <TableRow>...</TableRow>
    </HoverCardTrigger>
    <HoverCardContent side="right" align="start" className="w-96 max-w-[24rem]">
      <PatientQuickPeek patientId={patient.id} token={token} />
    </HoverCardContent>
  </HoverCard>
  ```

- [x] **New sub-component** `frontend/components/patients-v2/list/PatientQuickPeek.tsx` (~120 LOC). Lazy-loads `getPatientOverview(token, patientId)` on mount; cancels on unmount. Renders a condensed version of the Overview-tab content: snapshot (3 lines: blood group, height, weight), active problems (top 3 with "+N more"), allergies (chip row, top 3), chronic conditions (chip row, top 3). Loading = skeleton card. Error = single-line muted "Couldn't load quick-peek".

- [x] **Keyboard equivalent**: when a row is focused (via tab / arrow keys), pressing `Space` opens the HoverCard (Radix supports this natively via `onPointerEnter`; for keyboard, attach a manual handler).

### Step 6 — Bulk select + actions

- [x] **Checkbox column** at the leftmost position when **at least one** of the conditions is met: a bulk action is in progress, or `selectedPatientIds.length > 0`. Otherwise hidden (Phase 1 visibility is "always on" — simpler — but the toggle is a Phase 2 enhancement).

  **Pragmatic Phase 1 choice:** always show the checkbox column. Default UI footprint is minimal.

- [x] **Select-all** in the header — selects all currently-rendered rows. Indeterminate state when some are selected.

- [x] **Bulk-actions bar** (rendered as a sibling of the toolbar by the state owner, OR as a sticky bar above the table — task picks):
  - Left: "{N} selected · [Clear]"
  - Right: "[Export CSV] [Tag…]"
  - **Export CSV** triggers an immediate browser download of the selected patients' summary fields (name, MRN, phone, last visit date, demographics). Frontend-generated CSV — no backend endpoint needed (data is already loaded).
  - **Tag…** opens a small popover with a `<Input placeholder="Tag (e.g. VIP)">` + Apply button. Apply fires `PATCH /api/v1/patients/bulk-tag` (or `PUT /api/v1/patients/:id { patient_tag: '...' }` per-id in a `Promise.all` — pick whichever is simpler; the bulk endpoint may not exist yet — if it doesn't, fan out per-id).

- [x] **Telemetry on bulk action**: emit `patients_v2.bulk_action` with `{ action: 'export_csv' | 'tag', count: N }`.

### Step 7 — Pagination footer

- [x] **Below the table** — "Showing {start}-{end} of {total}" on the left, prev / page / next buttons on the right. `pageSize=50` fixed (no UI selector in Phase 1).
- [x] Disable prev on page 1; disable next on last page (`page * pageSize >= total`).
- [x] Clicking next/prev updates the URL `?page=` and re-fetches.

### Step 8 — Verification

- [x] `pnpm --filter frontend tsc --noEmit` clean.
- [x] `pnpm --filter frontend lint` clean.
- [x] Table renders with the seeded test data; ≥ 1 row visible on `/dashboard/patients-v2`.
- [x] Sorting cycle works for `last-visit` and `name` columns.
- [x] Hovering a row for ≥ 400ms opens the quick-peek with skeleton, then content. Hover off closes within 100ms.
- [x] Selecting 2 rows shows the bulk-actions bar. Export CSV downloads a file with 2 rows. Tag applies (verify server-side `patient_tag` updates).
- [x] Pagination: navigate to page 2 → URL updates → backend returns the next batch.
- [x] **Density** toggle changes row height live.
- [x] **Column chooser** toggles columns live.
- [x] **Empty state** renders when `?q=zzzzzz` returns zero rows.

---

## Out of scope

- **Row drag-to-reorder.** Patients lists don't reorder; the column order is fixed.
- **Inline edit of patient fields from the table.** Always navigate to the detail page.
- **Bulk delete.** Single-row delete only.
- **Bulk message.** Phase 2.
- **Server-side CSV export endpoint.** Phase 1's CSV is built client-side from already-loaded rows; if the doctor needs > 50 rows exported, Phase 2 ships a backend endpoint.
- **Column resize / drag-to-reorder columns.** Phase 2.
- **Virtualised rows.** At 50 rows per page, the DOM is fast enough. Phase 2 may add `react-virtual` if a doctor pages large.

---

## Files expected to touch

**New:**

- `frontend/components/patients-v2/list/PatientsTable.tsx` (~250 LOC).
- `frontend/components/patients-v2/list/PatientsTableColumns.ts` (~80 LOC).
- `frontend/components/patients-v2/list/PatientQuickPeek.tsx` (~120 LOC).
- `frontend/components/patients-v2/list/BulkActionsBar.tsx` (~80 LOC).

**Modified:**

- `frontend/components/patients-v2/PatientsV2Page.tsx` (~50 LOC delta — wire the table + bulk-actions slot).
- Conditionally: `backend/src/controllers/patient-controller.ts` + `patient-service.ts` (~30 LOC if `PatientSummary` doesn't already expose `has_allergies` / `open_episodes_count` / `overdue_followup` — pr-02 may have already added these; task verifies).
- Conditionally: `backend/src/controllers/patient-controller.ts` (~40 LOC if the bulk-tag endpoint doesn't exist — task ships a thin `PATCH /api/v1/patients/bulk-tag` taking `{ ids: string[], tag: string | null }`).

**Read but do not modify in this task:**

- `frontend/components/patients/PatientsListWithFilters.tsx` (v1 reference for masked-phone helper).
- `frontend/components/ui/table.tsx`, `frontend/components/ui/hover-card.tsx`, `frontend/components/ui/checkbox.tsx`, `frontend/components/ui/dropdown-menu.tsx`.

---

## Notes / open decisions

1. **Why the column-chooser checkbox column is always-on in Phase 1.** Doctors who don't use bulk select still see one extra column. The alternative ("hide the column until selection > 0") creates a layout shift on first selection. Accept the small static cost.

2. **Why not use TanStack Table?** Phase 1 table is bounded enough that a hand-rolled `<Table>` with sort-state on the parent is fine and stays free of a heavy dependency. Phase 2 may revisit if column resize / drag-to-reorder lands.

3. **What about a "compact" density that uses 24px row height?** `comfortable` (48px) and `compact` (36px) are both readable; super-compact (24px) reduces ink-to-readable ratio. Phase 1 stops at two densities.

4. **The quick-peek's lazy fetch — could it cache?** Hovering rapidly across the table fires N fetches. A small process-local `Map<patientId, PatientOverviewData>` cache inside `PatientQuickPeek.tsx` would dedupe (15-min TTL). Task ships the cache as a tiny module sibling.

5. **Why CSV instead of XLSX?** No new dependency; works in every browser; the doctor can open it in Excel. XLSX requires a library (xlsx, exceljs) — Phase 2 if needed.

6. **Why is `last-visit-asc` not in the sort cycle?** Showing the oldest visits first is an unusual workflow. If a doctor wants it, they can manually set `?sort=last-visit-asc` (the backend supports it; the UI doesn't expose it). Phase 2 may add to the cycle if requested.

---

## References

- **Affected files:** see "Files expected to touch".
- **Source decisions:** [§DL-10 (quick-peek)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration), [§DL-11 (bulk select)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration).
- **Wave gate:** [`EXECUTION-ORDER-patients-redesign.md` § Wave 3 gate](./EXECUTION-ORDER-patients-redesign.md#wave-3-gate-after-pr-05--pr-06--pr-07--pr-08).
- **Next task:** [`task-pr-08-duplicates-collapsed-chip.md`](./task-pr-08-duplicates-collapsed-chip.md) — Wave 3, Lane α step 3.

---

**Owner:** TBD
**Created:** 2026-05-18
**Status:** Pending
