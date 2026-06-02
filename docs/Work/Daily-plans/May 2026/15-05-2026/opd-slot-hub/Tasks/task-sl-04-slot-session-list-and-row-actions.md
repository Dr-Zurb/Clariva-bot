# Task sl-04: Slot session list + mobile cards + row actions + inline expand

## 15 May 2026 — Batch [OPD Slot Hub](../plan-opd-slot-hub-batch.md) — Wave 2, Lane α step 2 — **M, ~3.5h**

---

## Task overview

The biggest UI piece in the batch. Build the chronological dense-row list (desktop), the mobile card list (under `lg`), the per-row overflow menu, and the inline expand. Mirror the queue-mode `OpdQueueTable` / `OpdQueueDenseRow` / `OpdQueueRowActions` / `OpdQueueRowExpanded` / `OpdQueueMobileList` / `OpdQueueMobileCard` pattern, with **slot semantics**:

- **Time-ordered, not token-ordered.** Rows render in `appointmentDate ASC` order. The `Time` column shows `HH:mm` (slot start) instead of token number.
- **"Now" divider.** A horizontal divider appears between the last row whose `scheduledAt < snapshotAt` and the first row whose `scheduledAt >= snapshotAt`. Visually: small horizontal rule with "Now" pill in the centre, primary-coloured.
- **Sectioning** ([DL-6](../../../../Product%20plans/plan-opd-slot-hub.md#decision-locks-dl-1--dl-12)). Active (`upcoming` / `grace` / `running_late` / `in_consultation`) → Done (`completed`) → Missed (`missed`) → Overflow (`overflow`). Cancelled rows hidden by default; visible only with URL filter `?status=cancelled`.
- **Status-aware row treatments.** Amber for `running_late`, green for `completed`, red for `missed`, primary for `in_consultation`, neutral for `upcoming` / `grace`. `Overflow` badge in the row's status column for overflow rows.
- **Status-aware overflow menu** ([DL-7](../../../../Product%20plans/plan-opd-slot-hub.md#decision-locks-dl-1--dl-12)). Different menu items per `slotStatus`.
- **Inline expand** ([DL-8](../../../../Product%20plans/plan-opd-slot-hub.md#decision-locks-dl-1--dl-12)). Chevron click reveals patient brief (allergies, last visit, booking note). Lazy-fetch on first open.

Also: **extract the search matcher to shared.** `frontend/components/opd/opdQueueMatcher.ts` operates on row fields (name / phone / MRN / reason) that both modes have. Move it to `frontend/components/opd/shared/opdSearchMatcher.ts` and have both modes import.

Mounts under the slot branch of `OpdTodayClient.tsx` (post-sl-03), replacing the list-area Skeleton placeholder.

**Estimated time:** ~3.5h (0.5h matcher extraction, 1h `OpdSlotList` + sectioning + "now" divider, 0.5h `OpdSlotMobileList` + card, 0.75h `OpdSlotRowActions` (status-aware menu), 0.5h `OpdSlotRowExpanded` (lazy-fetch), 0.25h mount + verification).

**Status:** Pending.

**Hard deps:** sl-03 (filter strip mounted, URL hook widened, `slotEntries` + `slotCounts` in parent state).

**Source:** [plan-opd-slot-hub-batch.md § Wave 2](../plan-opd-slot-hub-batch.md#wave-2--hub-ui-4-tasks-9h-single-sequential-lane) + `S1.4` and `DL-6` / `DL-7` / `DL-8` in [Product plans/plan-opd-slot-hub.md](../../../../Product%20plans/plan-opd-slot-hub.md).

---

## Model & execution guidance

**Recommended model:** **Auto** (default). Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) TL;DR rule #1 — Auto is the execution default. This is the largest task in the batch (~400 LOC delta across 5 files), but it reuses `OpdQueueGrid.ts` template + `OpdQueueDenseRow.tsx` row primitive heavily; the only new design is the status-derivation logic (sectioning, "now" divider, status-aware row treatments). **Not on the hard-rules list:** no security primitives, no PHI handling beyond rendering already-fetched fields, no migration.

**Per-message escalation rule (most likely to fire on this task):** if Auto stalls on the dense-row reuse boundary or the sectioning logic, escalate that **single message** to Opus 4.7 Extra High via the per-message picker. Don't switch the whole chat — the rest of the work is straightforward and Auto's pool rates win on volume.

**Manual-Sonnet fallback:** if you find Auto bouncing between approaches across multiple turns (a sign of poor routing for this specific task), pin Sonnet 4.6 Medium for the chat. This is the one task in the batch where manual Sonnet is a defensible choice if Auto misbehaves.

**New chat?** **Yes** — fresh chat. The pre-load list is large; do NOT carry sl-03's chat context.

Pre-load:

- This task file.
- `frontend/components/opd/OpdQueueTable.tsx` (the entire ~610 LOC — the table pattern with sticky header + grouping + sectioning).
- `frontend/components/opd/OpdQueueDenseRow.tsx` (the row primitive — sl-04 reuses heavily).
- `frontend/components/opd/OpdQueueGrid.ts` (the 13-column CSS grid template — sl-04 reuses verbatim).
- `frontend/components/opd/OpdQueueRowActions.tsx` (the overflow-menu pattern; sl-04 ports for slot semantics).
- `frontend/components/opd/OpdQueueRowExpanded.tsx` (the inline-expand pattern — lazy-fetch via `getDoctorOpdQueueEntryDetail` or similar; check the file).
- `frontend/components/opd/OpdQueueMobileList.tsx`, `frontend/components/opd/OpdQueueMobileCard.tsx` (the mobile pattern).
- `frontend/components/opd/opdQueueMatcher.ts` (the search matcher — sl-04 extracts to shared).
- `frontend/components/opd/opdQueueTelemetry.ts` (add minimal `trackOpdSlotEvent` in sl-04 — mirror `trackOpdQueueEvent` body).
- `frontend/components/opd/OpdTodayClient.tsx` (post-sl-03 — the mount point).
- `frontend/types/opd-doctor.ts` (post-sl-01 — `SlotSessionRow` + `SlotStatus` shapes).
- `frontend/lib/api.ts` (the existing per-row mutation helpers `postDoctorMarkNoShow`, `postDoctorOfferEarlyJoin`, `postDoctorSessionDelay` — re-used by row actions).
- Source plan §DL-6, §DL-7, §DL-8.

**Estimated turns:** 5–7 turns (1 turn matcher extraction + new file structure, 1–2 turns `OpdSlotList` + sectioning + "now" divider, 1 turn mobile, 1–2 turns row actions (status-aware menu logic), 1 turn row expand + lazy fetch + mount + verification).

---

## Acceptance criteria

### Step 1 — Extract `opdQueueMatcher.ts` to shared

- [ ] Move `frontend/components/opd/opdQueueMatcher.ts` to `frontend/components/opd/shared/opdSearchMatcher.ts`. The matcher should be generic over a row shape that has `patientName: string`, `medicalRecordNumber: string | null`, `patientPhone: string`, `reasonForVisit: string | null`, `serviceLabel: string | null`. Both `DoctorQueueSessionRow` and `SlotSessionRow` satisfy this.
- [ ] Type the matcher's input as a generic interface or a type alias:

  ```ts
  export interface OpdSearchMatchable {
    patientName: string;
    medicalRecordNumber: string | null;
    patientPhone: string;
    reasonForVisit: string | null;
    serviceLabel: string | null;
  }

  export function matchesOpdSearch<T extends OpdSearchMatchable>(
    row: T,
    query: string
  ): boolean {
    /* ...existing logic... */
  }
  ```

- [ ] Update queue-mode imports (`OpdQueueTable.tsx`, `OpdQueueMobileList.tsx`, etc.) to import from the new path. Use `rg "from .*opdQueueMatcher"` to find all callsites.
- [ ] Delete the old `opdQueueMatcher.ts` file.

### Step 2 — `OpdSlotList.tsx` (desktop dense rows)

- [ ] Create `frontend/components/opd/opdSlotSectioning.ts` first (pure helpers). `OpdSlotList.tsx` and `OpdSlotMobileList.tsx` import section buckets + "now" divider index from there — keeps ordering logic unit-testable without mounting the table.

- [ ] Create `frontend/components/opd/OpdSlotList.tsx`. Reuse `OPD_QUEUE_GRID_TEMPLATE` and the column header definitions from `OpdQueueGrid.ts`, but with these column meaning adjustments (display only — no template change):

  - **Column 2 (`#`)** → render `position` (1-based index from snapshot). Keep the `#` header label. (Doctors still want to scan "row 3 of the day".)
  - **Column 11 (`Time`)** → render `HH:mm` from `scheduledAt` (slot start), using `formatTimeShort()`. Header label changes from `Time` to `Time` (same).
  - **Column 12 (`Wait`)** → render the **delay/lateness** indicator. For `running_late` rows: `+Xm` (how late). For `in_consultation`: `live`. For others: empty. (Queue mode shows queue-wait time here; slot mode shows slot drift.)
  - **Column 3 (`Status`)** → render the slot-status pill (amber `Late`, green `Done`, red `Missed`, primary `In consult`, neutral `Upcoming`/`Grace`). Plus the `Overflow` badge inline for overflow rows.
  - **Modality column** (cross-cutting gate: modality icon per row) — inherit from `OpdQueueDenseRow` / the queue column wiring; verify the icon renders for slot rows when `serviceLabel` (or the field the queue row uses for modality) is present. No new column — match the 13-column template.

- [ ] **Sectioning** (DL-6). Group rows into 4 sections in this order:

  1. **Active** — `upcoming`, `grace`, `running_late`, `in_consultation`. Render in chronological order (`scheduledAt ASC`). Section header **omitted** (the active list is the default; no "Active" label needed).
  2. **Done** — `completed`. Section header `"Completed"` with count. Collapsed by default? **No** — render expanded for now (matches queue precedent's "Completed" section). Inline expand-collapse can land in a follow-up.
  3. **Missed** — `missed`. Section header `"Missed"` with count.
  4. **Overflow** — `overflow`. Section header `"Overflow"` with count.

  Cancelled rows are filtered out unless `?status=cancelled` is in the URL (in which case render under a synthetic "Cancelled" section).

- [ ] **"Now" divider** inside the Active section. After sorting Active rows by `scheduledAt ASC`, find the index where `scheduledAt >= snapshotAt`. Insert a `<NowDivider snapshotAt={snapshotAt} />` row between index-1 and index (or at the top if all rows are upcoming, at the bottom if all are past). The divider:

  ```tsx
  <div
    className="grid"
    style={{ gridTemplateColumns: OPD_QUEUE_GRID_TEMPLATE }}
    aria-hidden="true"
  >
    <div /> {/* col 1 - bar */}
    <div className="col-span-12 flex items-center gap-2">
      <div className="h-px flex-1 bg-primary/30" />
      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
        Now · {formatTimeShort(snapshotAt)}
      </span>
      <div className="h-px flex-1 bg-primary/30" />
    </div>
  </div>
  ```

  *(The exact class names mirror the existing primary-token usage elsewhere; pre-load and adjust to repo conventions.)*

- [ ] **Status-aware row treatments.** Pass a `tone` prop into `OpdQueueDenseRow` (or fork into `OpdSlotDenseRow` if the prop surface is too divergent). **Fail-forward rule:** if adding more than **three** new props to `OpdQueueDenseRow` for slot-only behaviour, fork `OpdSlotDenseRow` in this task instead of threading further; otherwise thread props and reuse. Map `slotStatus` → tone:
  - `upcoming`, `grace` → neutral.
  - `running_late` → amber (left bar `border-l-4 border-amber-500`).
  - `in_consultation` → primary (left bar `border-l-4 border-primary`).
  - `completed` → muted-green.
  - `missed` → red (left bar `border-l-4 border-destructive`).
  - `overflow` → indigo / accent (or neutral with the explicit `Overflow` badge).
  - `cancelled` → muted, strikethrough on patient name.

- [ ] Apply the URL filter + search matcher BEFORE sectioning:

  ```tsx
  const filteredEntries = useMemo(() => {
    let rows = entries;
    if (statusFilter !== "all") {
      rows = rows.filter((r) => r.slotStatus === statusFilter);
    }
    if (searchQuery.trim()) {
      rows = rows.filter((r) => matchesOpdSearch(r, searchQuery));
    }
    return rows;
  }, [entries, statusFilter, searchQuery]);
  ```

- [ ] Sticky header row (mirror queue precedent's `OpdQueueTable` sticky header). Identical column labels (slot doesn't add columns, just reinterprets a few).

- [ ] Empty-section behaviour: skip rendering the section header if `count === 0`. (E.g., a fresh-day session has only Active rows; no Done / Missed / Overflow headers shown.)

### Step 3 — `OpdSlotMobileList.tsx` + `OpdSlotMobileCard.tsx`

- [ ] Create `OpdSlotMobileList.tsx` mirroring `OpdQueueMobileList.tsx`'s structure (under `lg` viewport). Same sectioning logic; cards stack vertically; "now" divider becomes a horizontal line with the same "Now · HH:mm" pill.
- [ ] Create `OpdSlotMobileCard.tsx` mirroring `OpdQueueMobileCard.tsx`. Card body shows: `HH:mm · status pill · patient name · age/sex` on row 1, `phone · reason · service` on row 2, action `⋯` button top-right. Tap card → opens appointment detail.

### Step 4 — `OpdSlotRowActions.tsx` (status-aware overflow menu)

- [ ] Create `frontend/components/opd/OpdSlotRowActions.tsx`. Props:

  ```tsx
  export interface OpdSlotRowActionsProps {
    entry: SlotSessionRow;
    token: string;
    onMutationSuccess: () => void;
    /** Controlled open state — wired by sl-05 hotkeys (S key opens menu for focused row). */
    overflowOpen?: boolean;
    onOverflowOpenChange?: (open: boolean) => void;
    /** Open the AddSlotDialog for "Approve overflow" / "Convert to overflow" — wired by sl-06 in Wave 3. */
    onOpenAddSlotDialog?: (mode: "overflow"; relatedAppointmentId: string) => void;
    /** Open the slot-targeted delay popover ("Set delay" item) — wired by sl-05. */
    onRequestDelayPopover?: (entry: SlotSessionRow) => void;
  }
  ```

- [ ] Status-aware menu item matrix (DL-7):

  | `slotStatus` | Menu items |
  |---|---|
  | `upcoming`, `grace` | "Open" (= row click; included for keyboard discoverability), "Offer early join" *(only when this row is the next-eligible per `resolveSlotEarlyJoinTarget`; otherwise omit)*, "Reschedule" (link to appointment detail), divider, "Cancel slot" *(opens appointment detail; cancellation flow lives there)* |
  | `running_late` | "Open", "Offer early join" (same eligibility rule), "Mark no-show", "Send rebook link" *(opens appointment detail for v1 — standalone action deferred per source plan)*, "Approve overflow" *(disabled with tooltip until sl-06 lands; then opens AddSlotDialog with this entry as `relatedAppointmentId`)* |
  | `in_consultation` | "Open", "Set delay" *(opens the same `BroadcastDelayPopover` as the toolbar, pre-targeted to this row via `onRequestDelayPopover`)* |
  | `completed` | "Open summary" (= row click), "Post-consult return" *(disabled with tooltip until sl-06 lands; opens AddSlotDialog with `opd_event_type='return_after_completed'`)* |
  | `missed` | "Open", "Reschedule" (link to appointment detail), "Convert to overflow" *(disabled until sl-06; opens AddSlotDialog)* |
  | `cancelled` | "Open" (read-only) |
  | `overflow` | (Same items as the row's underlying `slotStatus`-derived bucket — but pre-batched to "Open" + a small "Overflow" badge in the menu header.) |

- [ ] Each menu item that triggers an API call uses the existing `lib/api.ts` helpers:
  - "Mark no-show" → `postDoctorMarkNoShow(token, entry.appointmentId, ...)`.
  - "Set delay" routes through the parent's `onRequestDelayPopover` (sl-05 wires this; until then the menu item is disabled).
  - "Offer early join" routes through the parent's mutation chain — for sl-04, just call `postDoctorOfferEarlyJoin(token, entry.appointmentId, { expiresInMinutes: 15 })` directly with a `window.confirm()` step. (sl-05 may wrap with a fancier confirm; for now use the same pattern as queue precedent.)

- [ ] **Telemetry sink (sl-04):** In `frontend/components/opd/opdQueueTelemetry.ts`, add a minimal `OpdSlotEvent` type (at least `event: "opd_slot.action"` + `kind`, `entryId`, `slotStatus`) and `trackOpdSlotEvent()` whose **body mirrors `trackOpdQueueEvent`** (same sink: `window.analytics`, `console.debug` in dev, etc.). **Do not** emit slot events through `trackOpdQueueEvent` — keeps type-safety if sl-04 lands before sl-05. sl-05 extends the union with `opd_slot.viewed` / `filter_changed` / `row_clicked` and aligns any payload fields.

- [ ] Telemetry: emit `opd_slot.action` per overflow-menu invocation via `trackOpdSlotEvent({ event: "opd_slot.action", kind: <action-name>, entryId, slotStatus })`.

- [ ] Visibility: `⋯` button uses the same `opacity-0 group-hover/row:opacity-100` reveal as queue. The whole-row click opens appointment detail (handled by parent's `onRowClick` callback).

### Step 5 — `OpdSlotRowExpanded.tsx` (inline expand panel)

- [ ] Create `frontend/components/opd/OpdSlotRowExpanded.tsx`. Mirror `OpdQueueRowExpanded.tsx`'s panel structure — collapsible section under the row showing patient brief.

- [ ] **Lazy-fetch.** On first expand, call the same patient-brief endpoint queue mode uses (likely `getPatientChartSummary(patientId)` or similar — verify with the queue precedent's pre-load). Show a `<Skeleton>` while loading.

- [ ] Panel content:
  - Allergies (chip list; "No known allergies" if empty).
  - Last visit summary (date + reason + key vitals if available).
  - Booking note (`entry.patientNote`).
  - **Slot-specific addition:** scheduled `appointment_date` in full ("Wed 15 May, 10:30") + duration if known.

- [ ] Panel collapse / expand toggled by a chevron icon in the row's first column (column 1, the 4px bar). Replace the default coloured bar with a clickable chevron when the row is expandable. Match queue precedent.

- [ ] **Walk-in / no-patient row** (where `patientId === null`): expand panel shows "Walk-in appointment — no chart data" with the booking note only. No fetch.

### Step 6 — Mount in `OpdTodayClient.tsx`

- [ ] In the slot branch, **replace the list-area skeleton placeholder** with:

  ```tsx
  {/* Desktop dense list — sl-04. */}
  <div className="hidden lg:block">
    <OpdSlotList
      entries={slotEntries}
      counts={slotCounts ?? EMPTY_SLOT_COUNTS}
      statusFilter={slotStatusFilter}
      searchQuery={slotSearchQuery}
      snapshotAt={slotLastUpdatedAt ?? Date.now()}
      token={token}
      onMutationSuccess={handleSlotRefresh}
      onRowClick={(entry) => router.push(`/dashboard/appointments/${entry.appointmentId}`)}
    />
  </div>

  {/* Mobile card list — sl-04. */}
  <div className="lg:hidden">
    <OpdSlotMobileList
      entries={slotEntries}
      counts={slotCounts ?? EMPTY_SLOT_COUNTS}
      statusFilter={slotStatusFilter}
      searchQuery={slotSearchQuery}
      snapshotAt={slotLastUpdatedAt ?? Date.now()}
      token={token}
      onMutationSuccess={handleSlotRefresh}
      onRowClick={(entry) => router.push(`/dashboard/appointments/${entry.appointmentId}`)}
    />
  </div>
  ```

- [ ] Pass the snapshot's `snapshotAt` for the "now" divider (use the parent's `slotLastUpdatedAt` as a proxy; sl-01's payload includes a server `snapshotAt`, but for the "now" divider client-side wall-clock is sufficient — capture it once per fetch).

### Step 7 — Verification

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean.
- [ ] **Queue regression:** queue-mode hub renders identically. The matcher extraction is the only intentional change to queue files — `rg "from .*opdQueueMatcher"` should return zero results (everyone imports from `shared/opdSearchMatcher`).
- [ ] `rg 'trackOpdQueueEvent\([^)]*opd_slot' frontend/` → zero results (no slot events routed through the queue tracker).
- [ ] **Test artefacts exist (batch gate):** `rg "deriveSlotStatus" backend/tests/` → at least one hit (sl-01). `rg "OpdSlotStatusFilter" frontend -g "*.test.*" -g "*.spec.*" -g "!node_modules"` → at least one hit (sl-03); if zero, add the sl-03 tests before closing the batch. `rg "opdSlotSectioning" frontend -g "*.test.*" -g "*.spec.*" -g "!node_modules"` → at least one hit (sl-04 sectioning helpers).
- [ ] **Slot smoke** (logged in as a slot-mode doctor with a session that has at least one row per status if possible — seed via dev DB if needed):
  - Desktop (lg+): list renders below the filter strip. Sticky header at top. Rows are time-ordered. "Now" divider visible at the doctor's local clock-now position.
  - Sectioning: Active (no header) → "Completed" → "Missed" → "Overflow". Each section omitted if its count is 0.
  - Status-aware row treatments: amber for late, green for completed, red for missed, primary for in-consult.
  - `Overflow` badge visible on overflow rows.
  - Click chevron in column 1 → row expands. Patient brief loads (skeleton → real data). Click again → collapses.
  - Hover row → `⋯` appears. Click → menu opens with status-appropriate items per DL-7.
  - Click "Mark no-show" on a `running_late` row → confirm dialog → API call → snapshot refetch → row moves to "Missed" section.
  - Click "Offer early join" on the next-eligible upcoming row → confirm → API call → row's UI shows the early-invite badge (re-fetch shows the updated state).
  - Mobile (DevTools 375px): card list visible, dense list hidden. Tap card → navigates to appointment detail.
  - Search box: type a patient name → list narrows. Type a phone → list narrows. Clear → all rows return.
  - Click `Late` chip → only running_late rows visible. URL updates `?status=running_late`.
- [ ] `rg "OpdSlotList|OpdSlotMobileList|OpdSlotMobileCard|OpdSlotRowActions|OpdSlotRowExpanded" frontend/` returns the 5 new files + their mounts.
- [ ] `rg "opdQueueMatcher" frontend/` returns zero results (extraction complete).

---

## Out of scope

- **Polling block / hotkeys / telemetry hookup** — that's sl-05.
- **Empty states / error banners / stale-while-revalidate** — sl-05.
- **AddSlotDialog wiring** — sl-06. sl-04 stubs the menu items as disabled with tooltips ("Available after sl-06 ships") for "Approve overflow" / "Convert to overflow" / "Post-consult return".
- **Section collapse / expand for "Completed" / "Missed" / "Overflow"** — defer; queue precedent doesn't have this either, and the sectioning is already a strong visual hint.
- **Calendar-style hour-rail layout** — DL-12 + SL-Q5: out of scope. The chronological list is the v1 visualisation.
- **Drag-to-reorder slots** — out of scope (slots are time-anchored, not freely reorderable like queue tokens).
- **Reschedule inline action that opens a date/time picker in-row** — defer; "Reschedule" links to appointment detail for v1.
- **"Send rebook link" standalone action** — opens appointment detail for v1; standalone action is a follow-up.

---

## Files expected to touch

**New:**

- `frontend/components/opd/shared/opdSearchMatcher.ts` (~30 LOC — moved from `opdQueueMatcher.ts`, generic-typed).
- `frontend/components/opd/opdSlotSectioning.ts` (~60 LOC — pure helpers: filter cancelled URL rule, partition rows into Active / Completed / Missed / Overflow (+ synthetic Cancelled), compute "now" divider index inside Active; **no React**). Keeps regression-prone ordering out of the 280 LOC list component.
- `frontend/components/opd/OpdSlotList.tsx` (~280 LOC — sectioning + "now" divider + sticky header + dense rows).
- `frontend/components/opd/OpdSlotMobileList.tsx` (~120 LOC — mobile card list with sectioning + "now" divider).
- `frontend/components/opd/OpdSlotMobileCard.tsx` (~80 LOC — single card primitive).
- `frontend/components/opd/OpdSlotRowActions.tsx` (~250 LOC — status-aware overflow menu per DL-7).
- `frontend/components/opd/OpdSlotRowExpanded.tsx` (~150 LOC — inline expand with lazy-fetch).

**Modified:**

- `frontend/components/opd/opdQueueTelemetry.ts` (~25 LOC delta — minimal `OpdSlotEvent` + `trackOpdSlotEvent` mirroring queue sink; sl-05 extends the event-name union and any extra fields).
- `frontend/components/opd/OpdTodayClient.tsx` (~25 LOC delta — replace list skeleton with the two `<OpdSlotList />` / `<OpdSlotMobileList />` mounts).
- All callsites of `opdQueueMatcher` (likely `OpdQueueTable.tsx`, `OpdQueueMobileList.tsx`, possibly `OpdTodayClient.tsx` itself) — update import paths to `shared/opdSearchMatcher`.

**Deleted:**

- `frontend/components/opd/opdQueueMatcher.ts` (moved to `shared/`).

**Tests:** new unit tests for `opdSlotSectioning.ts` (section bucket assignment, ordering, "now" divider index edge cases: all future, all past, empty Active). Full `OpdSlotList` component tests remain optional; sl-05 gate still runs `pnpm --filter frontend test`. Existing queue tests stay green.

---

## Notes / open decisions

1. **Why reuse `OpdQueueDenseRow` instead of forking `OpdSlotDenseRow`?** The 13-column grid template is identical; the only column-meaning differences are the `#` (token vs position) and `Time` (token-time vs slot-time) and `Wait` (queue-wait vs slot-drift) cells. These can be controlled by props on the existing row component (e.g., `{ tokenLabel, timeLabel, waitLabel }` strings precomputed by the parent). Forking would duplicate ~250 LOC for marginal gain. **Decision:** thread props; pre-load `OpdQueueDenseRow` and confirm. **Hard cut-over:** Step 2's fail-forward rule (>3 new props → fork `OpdSlotDenseRow` now) removes open-ended "judgement call" mid-task.
2. **"Now" divider — server `snapshotAt` vs client `Date.now()`?** Use `Date.now()` for the divider (visual cue only). The server's `snapshotAt` from sl-01 is the source of truth for `slotStatus` derivation; the divider's role is just "what time is it on the doctor's clock now". Tiny clock skew is invisible.
3. **Lazy-fetch in `OpdSlotRowExpanded` — what endpoint?** Verify with queue's `OpdQueueRowExpanded.tsx`. Likely `getPatientChartSummary(patientId)` from `lib/api.ts`. If queue uses an inline patient-brief query, slot uses the same. **Pre-load and confirm** before implementing — the wrong endpoint = wasted ~30 min.
4. **Sectioning in mobile — render section headers as full-width rows?** Yes, mirror the queue precedent. Headers are tappable / expandable in queue? — pre-load and match. (Likely just non-interactive labels for v1.)
5. **Overflow badge placement — in the status pill or as a separate inline badge?** As a separate small badge after the status pill. The status pill carries the slot-status color (e.g., "Late"); the Overflow badge carries the overflow identity. Two pills side-by-side is fine; doctors will scan for the orange "Overflow" badge specifically.
6. **What about appointments with no `patient_id` (walk-ins)?** They render in the list with `patientName` from `appointments.patient_name`. The expand panel shows "Walk-in — no chart data". Row actions are limited to `Open` + `Mark no-show` + `Reschedule`.
7. **What if the snapshot has 50+ rows for a long day?** No virtualization; queue precedent doesn't virtualize either. If perf becomes an issue at 100+ rows, virtualize as a follow-up. Doctors typically book 20–40 slots/day max.
8. **Why disable "Approve overflow" / "Convert to overflow" / "Post-consult return" until sl-06?** The dialog doesn't exist yet. Disabling with a clear tooltip ("Available after add-slot dialog ships") is honest UX; rendering nothing risks doctors missing the affordance entirely. sl-06 swaps the disabled state to enabled.
9. **Why does the row click open `/dashboard/appointments/[id]` and not stay in-page?** Continuity with queue precedent + with the existing per-appointment page (where `<DoctorOpdSlotActions>` lives). The OPD hub is the operations surface; appointment detail is the per-row deep dive.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Read but do not modify:**
  - All `OpdQueue*` components — the precedents.
  - `frontend/lib/api.ts` `getPatientChartSummary` (or equivalent — confirm via queue's `OpdQueueRowExpanded`).
- **Source decisions:** [Product plans/plan-opd-slot-hub.md § DL-6, DL-7, DL-8, SL-Q4](../../../../Product%20plans/plan-opd-slot-hub.md).
- **Wave gate:** [`EXECUTION-ORDER-opd-slot-hub.md` § Wave 2 gate](./EXECUTION-ORDER-opd-slot-hub.md#wave-2-gate-after-sl-05).
- **Previous task:** [`task-sl-03-slot-status-filter-and-search.md`](./task-sl-03-slot-status-filter-and-search.md) — must be merged or green on the same branch.
- **Next task:** [`task-sl-05-polling-hotkeys-empty-states.md`](./task-sl-05-polling-hotkeys-empty-states.md) — fresh chat (wires polling + hotkeys + empty/error states + telemetry; closes Wave 2 gate).

---

**Owner:** TBD
**Created:** 2026-05-15
**Status:** Pending
