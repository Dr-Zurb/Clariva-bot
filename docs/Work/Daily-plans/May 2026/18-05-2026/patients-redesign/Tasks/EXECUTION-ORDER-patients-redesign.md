# patients-redesign — Phase 1 — execution order

**Batch completed:** 2026-05-20 (Wave 6 pr-14 landed — v1 deleted, ESLint zone trimmed, `MergePatientsModal` moved to `patients-v2/shared/`).

> Sibling document of [`plan-patients-redesign-batch.md`](../plan-patients-redesign-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

**Wave / lane / shape conventions:** [EXECUTION-ORDER-GUIDELINES.md](../../../../../EXECUTION-ORDER-GUIDELINES.md)

**Execution playbook:** [EXECUTION-ORDER-GUIDELINES.md §13.5 — Operating playbook](../../../../../EXECUTION-ORDER-GUIDELINES.md#135-operating-playbook-how-to-execute-a-batch-from-these-docs)

---

## Wave plan (6 waves)

```
Wave 1 (Foundation — ~5h, single lane sequential):
  Lane α  ──── pr-01 (S, Auto) ──> pr-02 (S, Auto)

Wave 2 (Backend aggregator + frontend client wrappers — ~5h, single lane sequential):
  Lane α  ──── pr-03 (M, Opus 4.7) ──> pr-04 (XS, Auto)

Wave 3 (List redesign — ~10h, single lane sequential):
  Lane α  ──── pr-05 (S, Auto) ──> pr-06 (M, Auto) ──> pr-07 (M, Auto) ──> pr-08 (S, Auto)

Wave 4 (Detail shell — ~5h, single lane sequential):
  Lane α  ──── pr-09 (M, Auto)

Wave 5 (Tabs content — ~9h, 2 parallel lanes — fully independent):
  Lane α  ──── pr-10 (M, Auto) ──> pr-12 (S, Auto)             [overview + vitals + files]
  Lane β  ──── pr-11 (M, Auto)                                  [history tabs]

Wave 6 (Flip + soak + delete — ~4h + ~3-day pause, single lane sequential):
  Lane α  ──── pr-13 (XS, Composer 2 Fast) ──> [ release window ~3 days ] ──> pr-14 (S, Auto)
```

**Total wall-clock with parallelism:** ~38h (~5 dev-days with two engineers running Wave 5 in parallel chats / branches) + a ~3-day soak in Wave 6.

**Total agent-time (sequential equivalent):** ~43h (~5.5 dev-days for one engineer running every lane back-to-back) + the same soak.

The bottleneck is **Wave 5 (~9h parallel / ~14h sequential)** — Lane α (pr-10 → pr-12) is the slower lane because the Overview tab consumes the broadest aggregator shape (every section of the DL-5 response) and the Vitals tab extends the same fetch with a longer window. Lane β (pr-11) ships three sibling tabs that share a fetch + render pattern; finishes ahead, and the dev on Lane β has spare cycles to pre-read pr-13's cutover diff for Wave 6.

**Why Shape B (parallel) lanes in Wave 5 is legitimate:**

- Lane α (`pr-10` Overview tab + `pr-12` Vitals/Files tabs) lives entirely under `frontend/components/patients-v2/tabs/OverviewTab.tsx` + `frontend/components/patients-v2/tabs/VitalsTab.tsx` + `frontend/components/patients-v2/tabs/FilesTab.tsx`. Lane β (`pr-11` History tabs) lives entirely under `frontend/components/patients-v2/tabs/VisitsTab.tsx` + `ConversationsTab.tsx` + `RxTab.tsx`. The §5 lane gate passes all six points:
  - §5.1: Either lane can run in a separate chat from t=0 of Wave 5 (both consume pr-09's tab framework from Wave 4, which is already shipped before Wave 5 starts).
  - §5.2: Disjoint files (separate files under `tabs/`).
  - §5.3 / §5.4: Neither lane consumes the other's WIP mid-wave; both consume only pr-09's tab framework.
  - §5.5: No task in Wave 5 consumes outputs from both lanes — the lanes only converge at the wave's acceptance gate.
  - §5.6: Lane α ≈ 6h (pr-10 ~4h + pr-12 ~2h), Lane β ≈ 4h (pr-11). Both ≥ 1h.

**Why every other wave is single-lane (no parallelism):** Wave 1 + Wave 2 + Wave 4 each ship the dependency primitive for the next wave (`pr-02`'s list endpoint, `pr-04`'s client wrappers, `pr-09`'s tab framework). Wave 3 has four tasks but they share enough state (the list page mounts the KPI strip + the toolbar + the duplicates chip + the table all together) that a single chat keeps the context warm. Wave 6 is the cutover + soak + delete — the soak window is itself a wall-clock pause that prevents parallel work.

---

## Lane-by-lane details

### Wave 1 — Foundation (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [pr-01](./task-pr-01-v2-route-shells-and-eslint-zone.md) | S | Auto | `frontend/app/dashboard/patients/page.tsx` (precedent for the route shell, auth + token pattern), `frontend/app/dashboard/patients/[id]/page.tsx` (precedent for the detail-page mount), `frontend/types/patient.ts` (the type module this task extends), `frontend/.eslintrc.json` (the existing zone overrides — match the pattern), source plan §DL-1, §DL-7. | Ship `frontend/app/dashboard/patients-v2/page.tsx` + `frontend/app/dashboard/patients-v2/[id]/page.tsx` as Server Components mirroring the v1 auth pattern. Mount empty `<PatientsV2Page>` / `<PatientV2Page>` client islands (render placeholder text). Extend `PaneDefinition` consumer types in `frontend/types/patient.ts` with `PatientListFilters`, `PatientSegmentId`, `PatientSavedView`, `PatientOverviewData`. New ESLint zone for `frontend/components/patients-v2/**`. |
| 1 | [pr-02](./task-pr-02-list-endpoint-server-side-filters.md) | S | Auto | `backend/src/controllers/patient-controller.ts` (the controller this task extends), `backend/src/services/patient-service.ts` (the service this task extends — review `getPatients()`), `backend/src/utils/validation.ts` (the query-param validator precedent), `backend/src/routes/api/v1/patients.ts` (route registration), `backend/migrations/` (`rg "patient_tag\b" backend/migrations` to check if the tag column already exists), source plan §DL-4, §DL-11. | Add `q`, `segment`, `sort`, `page`, `pageSize` query params to `GET /api/v1/patients`. SQL filters per segment in `patient-service.ts`. Response gains `total` + `page`. Single XS migration `103_patients_tags.sql` IF the `patient_tag TEXT` column isn't already present (most likely it isn't; discovery first). RLS unchanged. |

**Branch suggestion:** `feature/patients-redesign-foundation`. Single PR for pr-01 + pr-02.

### Wave 2 — Backend aggregator + frontend client wrappers (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [pr-03](./task-pr-03-overview-aggregator-and-kpis.md) | M | **Opus 4.7** | `backend/src/controllers/patient-chart-controller.ts` (the existing chart-context controller — pre-existing endpoint set the aggregator composes), `backend/src/services/patient-chart-service.ts` (each query function the aggregator calls into), `backend/src/services/prescription-service.ts` (the prescriptions fetch), `backend/src/services/appointment-service.ts` (the appointments fetch for the six-visit strip + recent-activity feed), `backend/src/services/refund-service.ts` (the payment + no-show events for the activity feed), `backend/src/utils/errors.ts` (the error envelope), `backend/migrations/087_patient_chart_context.sql` (the schema the aggregator reads from), source plan §DL-5, §DL-6. | New `GET /api/v1/patients/:id/overview` returning the DL-5 shape (snapshot, active_problems, allergies, chronic_conditions, current_medications, vitals_trends, recent_activity, care_plan, risk_flags, six_visit_strip). New `GET /api/v1/patients/kpis` returning 5 counts per DL-6. Care-plan + risk-flag derivation rules locked in this task. Single transaction per aggregator request to keep RLS predicates aligned. **Opus per hard-rules list rules #1 (RLS scoping across multiple resource owners — `prescriptions`, `appointments`, `patient_vitals_readings`, `patient_allergies`, `patient_conditions`, `patient_problems_v` each have separate RLS predicates) and #2 (response shape contains PHI from six tables).** |
| 1 | [pr-04](./task-pr-04-frontend-api-client-wrappers.md) | XS | Auto | `frontend/lib/api/index.ts` (the existing API client surface; pattern), `frontend/lib/api/patient-chart.ts` (the existing chart-context client; closest precedent), `frontend/types/patient.ts` (the post-pr-01 types this task imports), `frontend/lib/supabase/` (the auth-header pattern), source plan §DL-4. | Add `getPatientsList(token, filters)`, `getPatientOverview(token, patientId, options?)`, `getPatientsKpis(token)`, `getPatientSavedViews(token)`, `upsertPatientSavedView(token, view)`, `deletePatientSavedView(token, id)` to `frontend/lib/api/patients.ts` (new file). Standard `fetch` + auth pattern; no novel logic. |

**Branch suggestion:** `feature/patients-redesign-aggregator` stacked on `feature/patients-redesign-foundation`. Opus chat for pr-03; switch to Auto for pr-04.

### Wave 3 — List redesign (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [pr-05](./task-pr-05-patients-kpi-strip.md) | S | Auto | `frontend/lib/api/patients.ts` (post-pr-04), `frontend/components/ui/card.tsx` + `badge.tsx`, source plan §DL-6, `frontend/app/dashboard/patients-v2/page.tsx` (post-pr-01 — the mount point), `frontend/components/dashboard/` (look for existing KPI / count-tile precedents — task identifies). | `PatientsKpiStrip.tsx` — 5 tiles, delta chevrons, click → `onSegmentSelect`. Loading skeleton + error banner. Pure presentational; the page-level state owner passes counts + handlers in. |
| 1 | [pr-06](./task-pr-06-patients-toolbar.md) | M | Auto | post-pr-05 — `PatientsKpiStrip.tsx` (sibling), `frontend/components/consultation/cockpit/SavePresetDialog.tsx` (cc-10 — the save-view dialog style), `frontend/components/consultation/cockpit/ManagePresetsDialog.tsx` (cc-10 — manage), `frontend/hooks/usePatientProfilePresets.ts` (cc-10 — the saved-view persistence hook this task adapts), `frontend/components/ui/select.tsx`, `frontend/components/ui/input.tsx`, source plan §DL-4, §DL-9, §DL-11. | `PatientsToolbar.tsx` — search (debounced 200ms, URL-backed `?q=`), 7 segment chips (URL `?segment=`), saved-view dropdown reusing cc-10's `SavePresetDialog` / `ManagePresetsDialog`, density toggle (localStorage), column chooser. Add a `kind` discriminator to the existing `usePatientProfilePresets` hook (or fork as `usePatientsListSavedViews`) — task picks. |
| 2 | [pr-07](./task-pr-07-patients-table.md) | M | Auto | post-pr-06 — toolbar exports filter state, `frontend/components/patient-profile/PatientProfileHeader.tsx` (the cockpit-header risk-pill colors + status badge styling — reuse), `frontend/components/ui/hover-card.tsx` (Radix `HoverCard` for the quick-peek), `frontend/components/ui/checkbox.tsx` (bulk select), `frontend/lib/api/patients.ts` (post-pr-04 — `getPatientOverview` for the hover quick-peek), source plan §DL-10, §DL-11. | `PatientsTable.tsx` — replaces v1's `<ul>` card list. Columns per DL-10/DL-11. Sortable column headers. Pagination footer. Quick-peek via `HoverCard` lazy-loading the overview endpoint. Bulk-select strip with Export CSV + Tag actions. Empty states (no matches, server error, no data). |
| 3 | [pr-08](./task-pr-08-duplicates-collapsed-chip.md) | S | Auto | `frontend/components/patients/MergePatientsModal.tsx` (REUSED — do not modify; pr-14 moves the file), `frontend/components/ui/popover.tsx`, post-pr-06 (the toolbar this chip mounts inside), source plan §DL-12. | `DuplicatesCollapsedChip.tsx` — single chip (`⚠ N possible duplicates`), click opens a popover listing the existing duplicate groups with a Merge button each. Reuses `MergePatientsModal` verbatim. Hidden when N = 0. Telemetry `patients_v2.duplicates_popover_opened` once per session. |

**Branch suggestion:** `feature/patients-redesign-list` stacked on Wave 2's branch.

### Wave 4 — Detail shell (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [pr-09](./task-pr-09-patient-v2-shell.md) | M | Auto | `frontend/components/patient-profile/Shell.tsx` (the recursive shell from cv2-01 — the mount target), `frontend/components/patient-profile/PatientProfilePage.tsx` (the existing consumer mount pattern), `frontend/components/patient-profile/PatientProfileHeader.tsx` (DL-7 — reuse `SplitStartButton`, `formatDemographics`, `KebabMenu` patterns; factor where needed), `frontend/lib/patient-profile/types.ts` (the `PaneDefinition` contract this task consumes), `frontend/lib/api/patients.ts` (post-pr-04 — `getPatientOverview` for the six-visit strip + identity-chip pills), source plan §DL-2, §DL-3, §DL-7, §DL-8. | `PatientV2Shell.tsx` — mounts `<PatientProfileShell>` with `PaneDefinition[]` of 7 tabs, each `render` initially a `<TabPlaceholder>`. Identity strip + 6-visit dot breadcrumb. URL-backed tab state via `?tab=`. Storage key `patient-v2/<patientId>/layout`. |

**Branch suggestion:** `feature/patients-redesign-shell` stacked on Wave 3's branch.

### Wave 5 — Tabs content (2 parallel lanes — fully independent)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 (Lane α) | [pr-10](./task-pr-10-patient-overview-tab.md) | M | Auto | `frontend/components/patients-v2/PatientV2Shell.tsx` (post-pr-09 — the tab mount), `frontend/lib/api/patients.ts` (post-pr-04 — `getPatientOverview`), `frontend/types/patient.ts` (post-pr-01 — `PatientOverviewData`), `frontend/components/ui/card.tsx`, `frontend/components/ehr/sections/AllergiesSection.tsx` / `ChronicConditionsSection.tsx` / `VitalsSection.tsx` (the existing chart-panel sections — visual reference for read-only rendering, do not reuse the form-bearing variants), Recharts (`pnpm list recharts` to confirm installed; if not, task escalates: this batch deliberately picks Recharts because it's the dominant chart library in the JS ecosystem and the task lists the install command as a discovery step), source plan §DL-5. | `OverviewTab.tsx` — two-column dashboard rendering the full DL-5 shape. Left col: snapshot, active problems, allergies, chronic conditions, current medications. Right col: vitals sparklines (Recharts `LineChart` per metric with normal-range bands), recent activity feed, care-plan banner. Empty states per section. Skeleton-per-card loading. |
| 1 (Lane α) | [pr-12](./task-pr-12-vitals-and-files-tabs.md) | S | Auto | post-pr-10 (sibling — re-uses the same fetch), `frontend/components/ehr/sections/VitalsSection.tsx` (visual reference), `frontend/components/ui/table.tsx`, source plan §DL-3 (Files behind feature flag), `frontend/env.example` (the env var declaration — task adds `NEXT_PUBLIC_ENABLE_PATIENT_FILES`). | `VitalsTab.tsx` (chart + table per metric, `?windowDays=365`) + `FilesTab.tsx` (empty state + upload-button stub feature-flagged on `NEXT_PUBLIC_ENABLE_PATIENT_FILES`). Both fire `patients_v2.tab_opened` on first render. |
| 0 (Lane β) | [pr-11](./task-pr-11-history-tabs.md) | M | Auto | `frontend/components/patients-v2/PatientV2Shell.tsx` (post-pr-09 — the tab mount), `frontend/lib/api/index.ts` (`getAppointments`), `frontend/lib/api/prescriptions.ts` (look for `listPrescriptions`; task identifies or proposes), `frontend/components/patients/PatientVisitsTimeline.tsx` (v1 — visual reference for the timeline, do not import), `frontend/components/patients/PatientConversationsList.tsx` (v1 — visual reference for the conversations list, do not import), `frontend/components/ui/collapsible.tsx`, source plan §DL-3. | `VisitsTab.tsx` (expandable timeline, in-tab filters via pr-02's `?patient_id=` extension), `ConversationsTab.tsx` (grouped by channel), `RxTab.tsx` (lifetime Rx grouped by date with Reissue + PDF). All three fire `patients_v2.tab_opened`. |

**Branch suggestion:** `feature/patients-redesign-tabs-alpha` (Lane α) and `feature/patients-redesign-tabs-beta` (Lane β), both stacked on Wave 4's branch. Merge to `feature/patients-redesign-main` at the wave gate; Wave 6 stacks on the merged branch.

### Wave 6 — Flip + soak + delete (single lane sequential)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [pr-13](./task-pr-13-cutover-nav-and-redirect.md) | XS | **Composer 2 Fast** | `frontend/components/layout/Sidebar.tsx` (the nav item to flip), `frontend/components/layout/GlobalCommandPalette.tsx` (the Cmd-K route entry to update), `frontend/next.config.mjs` (or `.js` — task identifies; the redirect block lives here), source plan §DL-1, §DL-14. | Flip nav. Add 301 redirects (`/dashboard/patients` → `/dashboard/patients-v2`, with `:id`). Add temporary `/dashboard/patients-old` alias (removed in pr-14). Emit `patients_v2.cutover_smoke_passed` telemetry once on first post-flip mount. Composer's sweet spot — three small file edits + a route alias. |
| 1 | ⏸ `[ release window ~3 days ]` | — | — | — | Soak. The legacy paths remain reachable via the `/dashboard/patients-old` alias for emergency fallback. Sentry filter: any new error tagged `surface = "patients-v2"` blocks pr-14. |
| 2 | [pr-14](./task-pr-14-delete-v1-patients-surface.md) | S | Auto | `frontend/app/dashboard/patients/page.tsx` + `[id]/page.tsx` (the legacy routes to delete), `frontend/components/patients/**` (the legacy components to delete), `frontend/next.config.mjs` (the temporary alias to remove), `frontend/components/patients/MergePatientsModal.tsx` (the one file to MOVE not delete; its consumer is now pr-08's chip). | Delete legacy `frontend/app/dashboard/patients/**` + most of `frontend/components/patients/**`. Move `MergePatientsModal.tsx` → `frontend/components/patients-v2/MergePatientsModal.tsx`. Update the one import in pr-08. Remove the `/dashboard/patients-old` alias. Final close-gate run: tsc + lint + `rg` confirmation. |

**Branch suggestion:** `feature/patients-redesign-cutover` stacked on Wave 5's merged branch. pr-13 ships independently; pr-14 stacks on top after the soak.

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| pr-01 | S | Auto | Route shells + types + ESLint zone. Bounded; all precedent in the repo (ppr-01 is the closest analog). |
| pr-02 | S | Auto | Query-param extension + segment SQL + optional column-add migration. The migration is tag-add only (no RLS shape change, no PHI shape change) — not on the hard-rules list. |
| pr-03 | M | **Opus 4.7 Extra High** | Aggregator composing ≥ 5 chart-context queries with RLS predicates that must align across joins; response shape contains PHI from six tables. Hard-rules rules #1 + #2 both apply. Care-plan + risk-flag derivation rules need real reasoning (not pattern-matching) to avoid false positives that mislead the doctor. |
| pr-04 | XS | Auto | Thin `fetch` wrappers with typed surfaces. Composer-tier work, but Auto is fine and matches the rest of the wave. |
| pr-05 | S | Auto | Five-tile component with delta chevrons + skeleton + error. Bounded; cc-side has plenty of precedent. |
| pr-06 | M | Auto | Toolbar composition (search + chips + saved-view + density + columns). Reuses cc-10's dialog components. Per-message escalation to Opus only if the saved-view hook adaptation surprises. |
| pr-07 | M | Auto | Table component with sorting, pagination, quick-peek, bulk-select. The trickiest bit is the quick-peek (lazy-loaded HoverCard) — standard Radix pattern, no novel logic. |
| pr-08 | S | Auto | One chip + one popover wrapping an existing modal. Bounded. |
| pr-09 | M | Auto | Mounts the shared shell with a 7-tab `PaneDefinition[]`, identity strip reusing cockpit-header primitives. Reuse-heavy; no novel architecture. |
| pr-10 | M | Auto | Two-column dashboard rendering a known aggregator shape. Recharts is the only new dependency; the rest is composition. |
| pr-11 | M | Auto | Three sibling tabs sharing a fetch + render pattern. Visual reference from v1; behavioral spec is clear. |
| pr-12 | S | Auto | Two tabs, one of which (Files) is mostly empty. Vitals shares pr-10's data path. |
| pr-13 | XS | **Composer 2 Fast** | Three small file edits + a redirect block. Composer's sweet spot per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md` § Tier 4](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md#tier-4--composer-2-fast-use-heavily-15-25-of-turns). |
| pr-14 | S | Auto | Delete sweep + one file move + import update + `rg` verification. Bounded; per-message escalation to Opus only if a delete reveals a hidden caller (`rg` should surface them first). |

**Opus caps:** ≤ 1 per wave (Wave 2: pr-03 — the only Opus task in the batch). ≤ 2 per batch (1 — under the cap). The natural escalation candidates (pr-10's aggregator-consuming UI, pr-09's identity strip if the cockpit-header factoring proves tricky) have established patterns in the repo; Auto with per-message escalation is the right call.

---

## Acceptance gates per wave

### Wave 1 gate (after pr-01 + pr-02)

- [ ] `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean. The new `frontend/components/patients-v2/**` ESLint zone fires when a test file under that path tries to import from `@/components/patients/` (any path other than `MergePatientsModal`).
- [ ] `/dashboard/patients-v2` and `/dashboard/patients-v2/:id` render placeholder text (the empty client islands from pr-01). No 404s; no console errors.
- [ ] `pnpm --filter backend tsc --noEmit` clean.
- [ ] `GET /api/v1/patients?q=Sm&segment=active-90d&sort=last-visit-desc&page=1&pageSize=20` returns a paginated payload with `total` + `page`. Probe with a doctor JWT in `psql` (or via curl) and verify the segment SQL returns the right rows (manually verify one row per segment).
- [ ] Migration `103_patients_tags.sql` (if shipped — gated by discovery) applies cleanly on a fresh DB and on a DB with existing rows. `INSERT INTO patients (... patient_tag) VALUES (..., 'vip')` succeeds; `SELECT patient_tag FROM patients WHERE patient_tag = 'vip'` returns the row.
- [ ] `frontend/types/patient.ts` exports `PatientListFilters`, `PatientSegmentId`, `PatientSavedView`, `PatientOverviewData`. Every existing consumer of `Patient` / `PatientSummary` still compiles.

### Wave 2 gate (after pr-03 + pr-04)

- [ ] All Wave 1 gates still green.
- [ ] `GET /api/v1/patients/:id/overview` returns the full DL-5 shape on a probe patient. Spot-check each section (snapshot, active_problems, allergies, chronic_conditions, current_medications, vitals_trends, recent_activity, care_plan, risk_flags, six_visit_strip).
- [ ] **RLS smoke** — probe JWT for Doctor A returns 404 on Patient B's id (Patient B belongs to Doctor B). No cross-tenant data leak in the aggregator's joins.
- [ ] `GET /api/v1/patients/kpis` returns the 5 counts per DL-6. Counts are doctor-scoped; cache header set to `max-age=60`.
- [ ] `frontend/lib/api/patients.ts` exports the 6 functions per pr-04. `pnpm --filter frontend tsc --noEmit` clean against the types.
- [ ] **Care-plan + risk-flag determinism** — running the aggregator twice against an unchanged patient returns byte-identical `care_plan` + `risk_flags` arrays.

### Wave 3 gate (after pr-05 + pr-06 + pr-07 + pr-08)

- [ ] All Wave 2 gates still green.
- [ ] `/dashboard/patients-v2` renders KPI strip + toolbar + table + duplicates chip. Page reaches LCP in < 1.5s on a primed cache against a 200-patient fixture (manual check via DevTools Performance tab; not a blocker if higher, but log if > 3s).
- [ ] Clicking each KPI tile applies the corresponding segment to the table (URL updates `?segment=…`).
- [ ] Search debounce works (typing "Sm" then "i" within 200ms only fires one network request).
- [ ] Saved view round-trip: save → reload → the saved view reappears in the dropdown and applying it restores the filter + sort + segment.
- [ ] Density toggle persists across reloads (localStorage).
- [ ] Quick-peek opens on row hover after 400ms; closes on blur; keyboard equivalent (focus row + space) opens it.
- [ ] Bulk-select strip shows when ≥ 1 row selected; Export CSV downloads a CSV with selected patients' summary fields.
- [ ] Duplicates chip hidden when N = 0; visible + clickable when N > 0; opening the popover shows the existing groups with Merge buttons; clicking Merge opens the existing `MergePatientsModal`.

### Wave 4 gate (after pr-09)

- [ ] All Wave 3 gates still green.
- [ ] `/dashboard/patients-v2/:id` renders the identity strip (avatar, name, demographics chip, condition/allergy pill row, Book consult split button, kebab) + 6-visit dot breadcrumb + 7 tabs (all placeholders).
- [ ] Tab state is URL-backed via `?tab=overview|visits|conversations|rx|vitals|files|audit`. Default = `overview`. Invalid `?tab=` falls back to default.
- [ ] Dot breadcrumb renders the 6 most recent visits with status color + modality icon. Clicking a dot navigates to `?tab=visits&visit=<id>` (the Visits tab respects `?visit=` in Wave 5).
- [ ] Storage key is per-patient (`patient-v2/<patientId>/layout`); changing layout on Patient A does NOT affect Patient B's layout.

### Wave 5 gate (after pr-10 + pr-11 + pr-12)

- [ ] All Wave 4 gates still green.
- [ ] Overview tab renders all 9 sections from the DL-5 shape (snapshot, active problems, allergies, chronic conditions, current medications, vitals sparklines, recent activity, care-plan banner, the snapshot is embedded in the left col). Empty states for sections with no data.
- [ ] Visits tab renders the timeline; in-tab filters work; expanding a row shows the secondary info (chief complaint, diagnosis, Rx issued, attachments).
- [ ] Conversations tab groups by channel; rows show preview + unread + last-replied-by.
- [ ] Rx tab lists lifetime prescriptions grouped by date; Reissue + PDF actions visible per row.
- [ ] Vitals tab renders chart + table per metric with the 365-day window.
- [ ] Files tab renders the empty state. Upload button is hidden when `NEXT_PUBLIC_ENABLE_PATIENT_FILES !== 'true'`; visible (stub) when true.
- [ ] Every tab fires `patients_v2.tab_opened` exactly once per first-render (verify in the network tab against the telemetry sink).

### Wave 6 gate — batch close-gate (after pr-13 + soak + pr-14)

**Completed 2026-05-20** (pr-13 cutover + pr-14 v1 deletion).

- [x] All Wave 5 gates still green.
- [ ] **Cross-cutting acceptance gate** (from [`plan-patients-redesign-batch.md` § Cross-cutting acceptance gate](../plan-patients-redesign-batch.md#cross-cutting-acceptance-gate-whole-batch)) all green.
- [ ] **Post-flip:** Sidebar `Patients` href is `/dashboard/patients-v2`. Cmd-K palette routes to the new path. `curl -I http://localhost:3000/dashboard/patients` returns `301` with `Location: /dashboard/patients-v2`.
- [ ] **Soak completed:** ≥ 3 calendar days between pr-13 ship and pr-14 ship. Sentry filter for `surface = "patients-v2"` shows zero new errors during the soak window.
- [x] **Post-delete:** `rg "PatientCockpit\b|PatientsListWithFilters\|PatientCockpitRail\|PatientVisitsTimeline\|PatientConversationsList\|PatientDetailRail\|PatientDetailWorkArea\|PatientPrescriptions" frontend` returns zero. `/dashboard/patients-old` alias removed from `next.config.mjs`. `MergePatientsModal.tsx` moved to `frontend/components/patients-v2/shared/`.
- [ ] **Telemetry:** `patients_v2.cutover_smoke_passed` event fired exactly once on first `/dashboard/patients-v2` mount post-flip.
- [ ] **Optional Opus close-gate review** — one fresh Opus 4.7 Extra High chat with the full Wave 1–6 diff grading against the cross-cutting gate. Skip if every deterministic check above passes cleanly.

---

## Cost estimate

| Wave | Tasks | Auto chats | Composer 2 chats | Opus 4.7 chats | Wall-clock |
|---|---|---|---|---|---|
| Wave 1 | pr-01, pr-02 | 2/2 | 0/2 | 0/2 | ~5h |
| Wave 2 | pr-03, pr-04 | 1/2 | 0/2 | 1/2 | ~5h |
| Wave 3 | pr-05, pr-06, pr-07, pr-08 | 4/4 | 0/4 | 0/4 | ~10h |
| Wave 4 | pr-09 | 1/1 | 0/1 | 0/1 | ~5h |
| Wave 5 | pr-10, pr-11, pr-12 | 3/3 | 0/3 | 0/3 | ~9h (parallel) / ~14h (sequential) |
| Wave 6 | pr-13, pr-14 | 1/2 | 1/2 | 0/2 | ~4h + ~3-day soak |
| **Total** | **14** | **12** | **1** | **1** | **~38h (parallel) / ~43h (sequential) + 3-day soak** |

Token estimate (rough): ~400k input / ~300k output across the batch. One Opus task draws from the API pool (~$15–25 at ~50k–100k tokens). The other thirteen draw from the Auto+Composer pool ($1.25 in / $6.00 out per M for Auto, $0.50 in / $2.50 out per M for Composer). Total batch spend: ~$50–70 excluding the optional close-gate review.

**One optional Opus close-gate turn after pr-14** budgeted on top. Skip if the deterministic gates pass cleanly.

---

## References

- [plan-patients-redesign-batch.md](../plan-patients-redesign-batch.md) — the *what / why* sibling.
- [Daily-plans/May 2026/17-05-2026/cockpit-v2/Tasks/EXECUTION-ORDER-cockpit-v2.md](../../../17-05-2026/cockpit-v2/Tasks/EXECUTION-ORDER-cockpit-v2.md) — adjacent-day exec-order; same conventions, same ASCII shape.
- [Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild/Tasks/EXECUTION-ORDER-patient-profile-shell-rebuild.md](../../../13-05-2026/patient-profile-shell-rebuild/Tasks/EXECUTION-ORDER-patient-profile-shell-rebuild.md) — predecessor exec-order; the shell foundation pr-09 reuses.
- [Daily-plans/May 2026/10-05-2026/cockpit-customization/Tasks/EXECUTION-ORDER-cockpit-customization.md](../../../10-05-2026/cockpit-customization/Tasks/EXECUTION-ORDER-cockpit-customization.md) — predecessor exec-order; the preset persistence pr-06 mirrors.
- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules; the hard-rules list that drives pr-03 → Opus.
- [EXECUTION-ORDER-GUIDELINES.md](../../../../../EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape rules used to draft this doc.
