# Task pr-06: `PatientsToolbar` — search, segment chips, saved views, density, column chooser

## 18 May 2026 — Batch [Patients tab redesign — Phase 1](../plan-patients-redesign-batch.md) — Wave 3, Lane α step 1 — **M, ~3h**

---

## Task overview

Build the toolbar that sits between the KPI strip (pr-05) and the table (pr-07). It owns the live filter state that drives the table's data fetch + the strip's `activeSegment` highlight. Five sub-controls per DL-4 / DL-9 / DL-11:

1. **Search input** — debounced 200ms, URL-backed (`?q=`).
2. **Segment chips** — seven horizontally-scrolling chips (one per `PatientSegmentId`), URL-backed (`?segment=`); clicking the same chip again toggles it off.
3. **Saved views dropdown** — `<Select>` listing the doctor's saved views, with **Save current view…** and **Manage views…** items at the bottom. Reuses cc-10's `SavePresetDialog` / `ManagePresetsDialog` styling and persistence pattern.
4. **Density toggle** — Compact / Comfortable (persisted to localStorage `patients-v2/list-density`).
5. **Column chooser** — kebab-shaped popover with a checkbox per optional column; persists per-doctor as part of the active saved view (or to localStorage when no view is active).

The toolbar also exposes the **bulk-actions bar** as a sibling — when ≥ 1 row is selected in the table, the bar replaces the toolbar's right-side controls with "{N} selected · Export CSV · Tag · Clear selection". The bar is owned by the page state owner; the toolbar just renders the slot.

**Estimated time:** ~3h (45min search + chips + 1h saved-view dropdown + dialogs + 30min density + column chooser + 30min state-owner integration + 15min verification).

**Status:** Done.

**Hard deps:** pr-01 (the filter types), pr-04 (the saved-view client wrappers), pr-05 (the strip's `activeSegment` props it mirrors).

**Source:** [plan-patients-redesign-batch.md § Wave 3](../plan-patients-redesign-batch.md#wave-3--list-redesign-4-tasks-10h-single-sequential-lane) + DL-4, DL-9, DL-11.

---

## Model & execution guidance

**Recommended model:** Auto. Toolbar composition with five sub-controls; the trickiest piece (saved-view persistence) has cc-10 as a direct precedent.

**Per-message escalation rule:** Escalate the single message to Opus only if the saved-view hook adaptation reveals a model mismatch between cc-10's `cockpit_layout_preset` shape and `PatientSavedView` — the task spec proposes a `kind` discriminator that should sidestep this.

**New chat?** Yes — fresh Auto chat. Pre-load:

- This task file.
- `frontend/components/consultation/cockpit/SavePresetDialog.tsx` (cc-10 — save dialog style).
- `frontend/components/consultation/cockpit/ManagePresetsDialog.tsx` (cc-10 — manage dialog style).
- `frontend/hooks/usePatientProfilePresets.ts` (cc-10 — the saved-view persistence hook this task adapts; verify the file path).
- `frontend/lib/api/patients.ts` (post-pr-04 — the saved-view wrappers).
- `frontend/components/ui/select.tsx`, `frontend/components/ui/input.tsx`, `frontend/components/ui/popover.tsx`, `frontend/components/ui/toggle-group.tsx`, `frontend/components/ui/checkbox.tsx`.
- `frontend/components/patients-v2/PatientsV2Page.tsx` (post-pr-05 — the state owner this task extends).
- `frontend/components/patients-v2/list/PatientsKpiStrip.tsx` (post-pr-05 — the sibling component; mirror styling decisions).
- Source plan §DL-4 / §DL-9 / §DL-11.

**Estimated turns:** 4–5 turns.

---

## Acceptance criteria

### Step 1 — `<SearchInput>` sub-component (or use the design system's input directly with a 200ms debounce hook)

- [x] **In `frontend/components/patients-v2/list/PatientsToolbar.tsx`**, render an `<Input>` with `placeholder="Search by name, MRN, phone, or IG handle…"`, `icon={<Search />}`, debounced via a `useDebouncedCallback` hook (if the codebase has one, reuse — else inline with `setTimeout`).
- [x] Debounce: 200ms. Empty `q` triggers a fetch (clears the filter).
- [x] URL backing: `useSearchParams()` + `useRouter().replace(…, { scroll: false })` on debounce fire. The URL is the source of truth; the input is a controlled component reading from the URL.

### Step 2 — Segment chips

- [x] **Render** seven chips horizontally in a `<div role="tablist" className="flex gap-1 overflow-x-auto">`. Each chip = `<button role="tab" aria-pressed={isActive}>` styled as a pill (`rounded-full px-3 py-1 text-sm`). Active chip = `bg-primary text-primary-foreground`; inactive = `bg-secondary text-secondary-foreground hover:bg-secondary/80`.
- [x] **Chip list** matches `PatientSegmentId`:
  - `active-90d` → "Active (90d)"
  - `new-30d` → "New this month"
  - `at-risk-followup` → "Follow-up overdue"
  - `no-show-prone` → "No-show prone"
  - `has-allergies` → "Has allergies"
  - `has-open-episodes` → "Open episodes"
  - `untagged` → "Untagged"
- [x] **Click toggles**: clicking the active chip clears the segment (URL `?segment=` removed). Clicking an inactive chip sets it.
- [x] **Sync with the KPI strip**: the page state owner reads `activeSegment` from the URL and passes it to both the strip and the toolbar; clicks on either component update the URL.

### Step 3 — Saved-view dropdown

- [x] **Discover** whether `doctor_cockpit_layout_presets` already has a `kind` column. `rg "kind TEXT|kind text" backend/migrations | grep cockpit_layout` reveals. If no, add it as a single XS migration `104_layout_presets_kind.sql`:

  ```sql
  ALTER TABLE doctor_cockpit_layout_presets
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'cockpit_layout';
  CREATE INDEX IF NOT EXISTS idx_layout_presets_doctor_kind
    ON doctor_cockpit_layout_presets (doctor_id, kind);
  ```

  This is not on the hard-rules list (additive column, default value, no PHI). Auto-tier.

- [x] **Dropdown** = `<Select>` with options:
  - One per saved view: `{view.name}` (with a star icon if `view.is_default`).
  - Divider.
  - "Save current view…" → opens `SavePresetDialog` (adapted from cc-10) — collects a name + checkbox "Set as default for this list".
  - "Manage views…" → opens `ManagePresetsDialog` (adapted from cc-10) — list of views with rename / delete / set-default per row.

- [x] **Persistence** via pr-04's `getPatientSavedViews` / `upsertPatientSavedView` / `deletePatientSavedView`. Each save serializes the current filter state (`{ q, segment, sort, page=1, pageSize }`) + the visible columns array into the saved view's `layout_json`.

- [x] **Apply saved view** on selection: read the view's filters → update URL with the matching `?q=&segment=&sort=` → update the column chooser state → update the page-1 reset.

- [x] **Default view applies on first mount** when the URL has no query params: read `is_default` view, apply its filters silently.

### Step 4 — Density toggle

- [x] **`<ToggleGroup type="single">`** with two options: `<ToggleGroupItem value="compact"><Rows3 /></ToggleGroupItem>` + `<ToggleGroupItem value="comfortable"><Rows2 /></ToggleGroupItem>`. (Use Lucide icons; pick the closest match.)
- [x] **localStorage key** `patients-v2/list-density`. Default = `comfortable`.
- [x] **Density value** is passed down to `<PatientsTable>` via the state owner — pr-07 reads it to set row height.

### Step 5 — Column chooser

- [x] **Trigger** = `<Button variant="outline" size="sm"><Columns3 /></Button>` opening a `<Popover>`.
- [x] **Popover content** = a list of checkboxes, one per optional column:
  ```
  ☑ Avatar
  ☑ Risk pills
  ☑ Demographics
  ☑ MRN
  ☑ Phone
  ☑ Last visit
  ☐ Next visit
  ☐ Open episodes (count)
  ☐ Source channel
  ```
  The first six are checked by default; the last three are off by default.
- [x] **Persistence**: when a saved view is active, the column list rides in the view's `layout_json.columns` array. When no saved view is active, persisted to localStorage under `patients-v2/list-columns` (per-doctor key via the user id).
- [x] **Column list flows to `<PatientsTable>`** (pr-07) via the state owner.

### Step 6 — State owner integration in `PatientsV2Page`

- [x] **Refactor** `PatientsV2Page` to own the full state:
  ```ts
  const [kpis, setKpis] = useState<PatientsKpis | null>(null);
  const [savedViews, setSavedViews] = useState<PatientSavedView[]>([]);
  const [density, setDensity] = useState<'compact' | 'comfortable'>(readDensityFromStorage());
  const [columns, setColumns] = useState<string[]>(readColumnsFromStorage());
  // filters come from URL (useSearchParams) — not local state
  const filters = useMemo(() => readFiltersFromUrl(searchParams), [searchParams]);
  ```
- [x] Wire `<PatientsKpiStrip>` (pr-05) above the `<PatientsToolbar>` (this task). The table (pr-07) and duplicates chip (pr-08) get the same state in subsequent tasks.

### Step 7 — Verification

- [x] `pnpm --filter frontend tsc --noEmit` clean.
- [x] `pnpm --filter frontend lint` clean.
- [x] **Search**: typing "Sm" then "i" within 200ms fires only one network request (verify in DevTools Network). The URL updates only once.
- [x] **Segment chips**: clicking "Active (90d)" updates URL to `?segment=active-90d`, highlights the chip, highlights the matching KPI tile in the strip above. Clicking it again clears the segment.
- [x] **Saved view round-trip**: set `q=sm` + `segment=active-90d` → open "Save current view…" → name it "Smith follow-ups" → reload page → "Smith follow-ups" appears in the saved-views dropdown → selecting it restores `q` + `segment`.
- [x] **Default view applies on first mount** (mark a view as default, navigate to `/dashboard/patients-v2` with no query params, verify the view's filters apply).
- [x] **Density toggle** persists across reloads.
- [x] **Column chooser** persists across reloads.

---

## Out of scope

- **The table itself.** pr-07.
- **Bulk actions bar implementation.** pr-07 ships the bar contents; this task just provides the slot.
- **Saved-view sharing across doctors.** RLS scopes per-doctor; cross-doctor sharing is out of MVP.
- **Multi-segment filtering** (selecting two segments at once). DL-4 specifies single-segment; multi-segment is Phase 2.
- **Filter chips for arbitrary patient tags.** The `untagged` segment is the only tag-aware filter in Phase 1; full tag autocomplete is Phase 2.

---

## Files expected to touch

**New:**

- `frontend/components/patients-v2/list/PatientsToolbar.tsx` (~300 LOC — the toolbar with all five sub-controls).
- `frontend/components/patients-v2/list/SaveViewDialog.tsx` (~80 LOC — adapted from cc-10's `SavePresetDialog`).
- `frontend/components/patients-v2/list/ManageViewsDialog.tsx` (~100 LOC — adapted from cc-10's `ManagePresetsDialog`).
- Conditionally: `backend/migrations/104_layout_presets_kind.sql` (~15 LOC — only if discovery shows no `kind` column).

**Modified:**

- `frontend/components/patients-v2/PatientsV2Page.tsx` (~80 LOC delta — state-owner refactor wiring strip + toolbar).
- Conditionally: `backend/src/controllers/doctor-settings-controller.ts` (~10 LOC delta — `?kind=` filter on the layout-presets list endpoint; only if pr-04 didn't already extend it).
- Conditionally: `backend/src/types/database.ts` (regenerated if the migration shipped).

**Read but do not modify in this task:**

- `frontend/components/consultation/cockpit/SavePresetDialog.tsx` (cc-10 precedent).
- `frontend/hooks/usePatientProfilePresets.ts` (cc-10 precedent).

---

## Notes / open decisions

1. **Adapt or fork the cc-10 dialogs?** Adapt. The dialogs in cc-10 are scoped to cockpit-layout presets (different vocabulary: "preset", "layout", "modality"). A parallel set of dialogs in `patients-v2/list/` with patient-list vocabulary ("view", "filter", "columns") is clearer than a multi-purpose dialog with prop-driven copy.

2. **Why URL-back the filters but localStorage-back the density/columns?** Filters need to be shareable + bookmarkable (a doctor can send a colleague a "high-risk patients" URL). Density + columns are personal UI preferences; localStorage is the right home.

3. **Why is "Save current view…" inside the dropdown instead of a separate button?** Discovery — doctors who see the dropdown know it's the home for view management. A separate button competes with other top-right buttons (Add patient, density toggle, etc.).

4. **What about a default `pageSize` in saved views?** Saved views capture `pageSize` if the doctor changed it; otherwise the system default (50) applies. Phase 2 may surface a pageSize control; Phase 1 leaves it implicit.

5. **Could the search box trigger a different fetch path than the segment change?** Yes — the state owner fires `getPatientsList` with the full filter shape; the backend handles the combination. No separate code paths needed.

---

## References

- **Affected files:** see "Files expected to touch".
- **Source decisions:** [§DL-4 (server filters)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration), [§DL-9 (saved views)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration), [§DL-11 (bulk select)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration).
- **Wave gate:** [`EXECUTION-ORDER-patients-redesign.md` § Wave 3 gate](./EXECUTION-ORDER-patients-redesign.md#wave-3-gate-after-pr-05--pr-06--pr-07--pr-08).
- **Precedent:** [Daily-plans/May 2026/10-05-2026/cockpit-customization/Tasks/task-cc-10-presets-frontend-hook-and-ui.md](../../../10-05-2026/cockpit-customization/Tasks/task-cc-10-presets-frontend-hook-and-ui.md) — the saved-view persistence model this task mirrors.
- **Next task:** [`task-pr-07-patients-table.md`](./task-pr-07-patients-table.md) — Wave 3, Lane α step 2.

---

**Owner:** TBD
**Created:** 2026-05-18
**Status:** Done
