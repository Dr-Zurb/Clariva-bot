# Patients tab redesign — Phase 1 — 18 May 2026 batch plan

**Status:** Completed 2026-05-20 — v1 route + component trees deleted (pr-14); `/dashboard/patients` redirects to `patients-v2` via middleware.

> **Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). TL;DR rule #1: **plan with Opus, execute with Auto, polish with Composer**. This batch has **one Opus task** (pr-03 — the PHI-aggregating overview endpoint; hard-rules list rules #1 + #2 apply) and one Composer 2 Fast task (pr-13 — the nav cutover + redirect). The remaining twelve tasks default to **Auto**.
>
> **Predecessor batches:**
> - [Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild](../../13-05-2026/patient-profile-shell-rebuild/) — the `<PatientProfileShell>` + `PaneDefinition` contract this batch reuses. **Must be merged before pr-09 starts.**
> - [Daily-plans/May 2026/17-05-2026/cockpit-v2](../../17-05-2026/cockpit-v2/) — the recursive shell from cv2-01. The patient-page detail shell uses a flat `PaneDefinition[]` (no `children`), so it works on either pre- or post-cv2 shells, but stacking on `feature/cockpit-v2-recursive-shell` is safer if cv2-01 hasn't merged.
> - [Daily-plans/May 2026/10-05-2026/cockpit-customization](../../10-05-2026/cockpit-customization/) — the preset / saved-view persistence model pr-06 mirrors for the list-page saved views.
> - [Daily-plans/May 2026/06-05-2026](../../06-05-2026/) — early EHR work (`e-task-3` patients list, `e-task-4` filters, `e-task-6` duplicates) — the v1 surface this batch replaces.
> - [backend/migrations/087_patient_chart_context.sql](../../../../../backend/migrations/087_patient_chart_context.sql) — the chart-context schema. **No new migrations** in this batch; pr-03's aggregator composes existing queries.
>
> **Exec order + lane matrix:** [`Tasks/EXECUTION-ORDER-patients-redesign.md`](./Tasks/EXECUTION-ORDER-patients-redesign.md).

---

## Why this batch

The two surfaces behind the **Patients** sidebar item are the EHR's least-used surface relative to their potential value. Opening `/dashboard/patients` shows a single name-filter card list with a duplicates banner; opening `/dashboard/patients/[id]` shows a 3-zone grid whose center column is three tabs — Visits (a flat list), Conversations (a flat list of the same data filtered differently), and Files (a literal placeholder reading "No files uploaded yet"). The right rail repeats the Latest-Visit / Open-Episodes / Allergies cards that already render inside the active-consult cockpit.

Concretely, the v1 page has these problems:

**List page (`PatientsListWithFilters.tsx`):**

1. **One filter, client-side.** `<Input id="filter-patient-name">` only filters by name in the browser after a full `GET /api/v1/patients` fetch. No segment, no date range, no doctor (multi-doc clinic), no allergy / condition filter, no source channel, no sort. Doesn't scale past ~200 rows.
2. **No KPIs.** A "Patients" page with no counts or trends signals an internal placeholder, not a product surface.
3. **Identical card chrome on every row.** Name, masked phone, age, gender, last visit. No avatar, no risk pills, no source chip, no next-appointment hint. No way for the doctor to triage at a glance.
4. **Duplicates banner is always-visible.** Even for a clinic with 3 duplicate groups out of 800 patients, the banner consumes top-of-fold space every load.

**Detail page (`PatientCockpit.tsx` + `PatientCockpitRail.tsx` + `PatientVisitsTimeline.tsx` + `PatientConversationsList.tsx`):**

5. **Three tabs, one is a stub.** `FilesTab({ patientId })` in `PatientCockpit.tsx:340` is `<p>No files uploaded yet</p>` with a `void patientId` to silence the unused-variable warning. The page advertises a feature it doesn't have.
6. **Visits and Conversations both fetch all appointments client-side.** `getAppointments(token)` returns every appointment for the doctor; the components then `.filter(a => a.patient_id === patientId)` in the browser. O(N) network for an O(1) presentation. Doesn't scale.
7. **No history of prescriptions / vitals / labs as their own tabs.** Everything lives in the active-consult chart panel; the patient page can't reach it.
8. **The right rail repeats the cockpit's chart panel.** Latest Visit + Open Episodes + Allergies cards in the patient page; the same cards in the active-consult chart panel; same data path; near-identical visual layout. Visual duplication without value.
9. **No identity strip.** The header is just the patient's name + a meta line (age / DOB / sex / phone / IG handle), a "Book consult" button, and a kebab with three items (one disabled). No avatar, no condition/allergy chip line, no MRN-to-copy, no next-step recommendation, no last-N-visits dot strip.

**Dead code that should leave with the v1 sweep:**

- `frontend/components/patients/PatientDetailRail.tsx` — not imported anywhere.
- `frontend/components/patients/PatientDetailWorkArea.tsx` — not imported anywhere.
- `frontend/components/patients/PatientPrescriptions.tsx` — not imported anywhere.

This batch closes Phase 1 with **14 tasks across 6 waves**, **~6 dev-days wall-clock**, **zero new migrations** (pr-03 composes existing chart-context queries server-side), and **1 Opus task** (pr-03 — under the 2-per-batch cap with room to spare; the rest are well-spec'd Auto tasks). The visible artifact at the close-gate is the side-by-side `/dashboard/patients-v2` and `/dashboard/patients-v2/[id]` routes rendering the redesigned surfaces, while the legacy `/dashboard/patients` route remains untouched. After a 3-day soak (Wave 6's release window), the nav cuts over and the v1 surfaces are deleted.

**No Phase 2 work happens here.** Phase 2 (Billing tab, Audit tab full implementation, server-side files storage for the Files tab beyond a feature-flag scaffold, AI care-plan recommender, push-notification preferences UI, multi-doctor patient sharing, FHIR export) promotes to its own dated batch once this gate ticks green.

---

## Decision lock (frozen for batch duration)

These match the planning conversation locked 2026-05-18. Re-opening any of them belongs in a new batch.

**DL-1: Strangler Fig.** New routes ship at `/dashboard/patients-v2` and `/dashboard/patients-v2/[id]`. The legacy routes at `/dashboard/patients` and `/dashboard/patients/[id]` are NOT modified during Waves 1–5. Wave 6 flips the sidebar nav `Patients` href to point at `-v2`, adds a permanent 301 redirect in `next.config.mjs` from the legacy paths to the new ones, soaks for ~3 days, then deletes the v1 components and the redirect's intermediate alias. This is the same cutover model the [`ppr`](../../13-05-2026/patient-profile-shell-rebuild/) and [`cockpit-v2`](../../17-05-2026/cockpit-v2/) batches use.

**DL-2: Reuse the patient-profile shell — do not build a third shell.** The detail page mounts `<PatientProfileShell>` from `frontend/components/patient-profile/Shell.tsx` with a flat `PaneDefinition[]` (no `children`). Tabs are first-class panes in a *vertical-stack* template rather than horizontal columns. The shell's recursive renderer works on flat trees — this batch does not exercise nested splits (cv2-01 + cv2-02 are not consumed by this batch). Forbidden by ESLint zone: importing `<ResizablePanelGroup>` directly into any patients-v2 file (the cv2-01 rule already prevents this; this batch only consumes the shell).

**DL-3: Tab inventory.** The detail page ships **seven tabs** in this order: **Overview** (default), **Visits**, **Conversations**, **Rx**, **Vitals**, **Files**, **Audit**. Each tab is a `PaneDefinition` with its own renderer. Out of scope for this batch: Billing tab (Phase 2), AI-assist tab (Phase 3 — depends on cockpit-v2 R-RX-POLISH), patient-messaging composer (Phase 2 — requires the Twilio/WhatsApp send-path that lives outside the EHR scope). Files tab ships behind a feature flag if no storage API exists at execution time (pr-12 ships the scaffold + the empty state + the upload-button stub gated by `process.env.NEXT_PUBLIC_ENABLE_PATIENT_FILES === 'true'`).

**DL-4: Server-side search, segment, sort, pagination on the list.** `GET /api/v1/patients` extends with `?q=` (substring match on `name`, `phone`, `medical_record_number`, `platform_external_id` — case-insensitive), `?segment=active-90d|new-30d|at-risk-followup|no-show-prone|has-allergies|has-open-episodes|untagged`, `?sort=last-visit-desc|last-visit-asc|created-at-desc|created-at-asc|name-asc`, `?page=N&pageSize=M` (default 50, max 200). All filters are AND-combinable. Segments are computed in SQL (the queries live in `patient-service.ts`, behind the existing RLS — no policy changes). pr-02 owns this; the client filter in `PatientsListWithFilters.tsx` retires in pr-14.

**DL-5: Overview-tab aggregator.** New endpoint `GET /api/v1/patients/:id/overview` returns a single composite shape:

```ts
{
  patient: Patient,                     // identity (already in /:id endpoint; re-included for the single round-trip)
  snapshot: {
    blood_group: string | null,         // future column; null in this batch
    height_cm: number | null,           // latest from patient_vitals_readings
    weight_kg: number | null,
    bmi: number | null,
    preferred_language: string | null,
  },
  active_problems: ProblemListItem[],   // existing patient_problem_list_v projection
  allergies: PatientAllergy[],          // archived_at IS NULL
  chronic_conditions: PatientChronicCondition[],
  current_medications: {                // derived from the latest active prescriptions
    drug_name: string,
    dose: string | null,
    frequency: string | null,
    prescribed_at: string,
    prescriber_doctor_id: string,
    still_taking: boolean | null,       // null = unknown (no med-recon prompt yet)
  }[],
  vitals_trends: {                      // last 90 days, max 30 readings per metric
    bp_systolic: { recorded_at: string, value: number }[],
    bp_diastolic: { recorded_at: string, value: number }[],
    heart_rate:   { recorded_at: string, value: number }[],
    spo2:         { recorded_at: string, value: number }[],
    weight_kg:    { recorded_at: string, value: number }[],
    bmi:          { recorded_at: string, value: number }[],
  },
  recent_activity: {                    // last 10 events, mixed kinds, newest first
    kind: 'visit' | 'message' | 'prescription' | 'payment' | 'no_show' | 'file_upload',
    occurred_at: string,
    summary: string,                    // human-readable one-line
    href: string | null,                // deep-link into the relevant detail page
  }[],
  care_plan: {                          // derived recommendations; null when nothing to suggest
    next_step: string | null,           // e.g. "Follow-up due in 8 days"
    overdue: string[],                  // e.g. ["BP recheck pending since 14 Apr"]
    rationale: string[],                // why each recommendation surfaced
  } | null,
  risk_flags: {
    code: string,                       // machine-readable, e.g. 'BP_TREND_RISING'
    label: string,                      // human-readable, e.g. "BP > 140/90 on last 3 visits"
    severity: 'info' | 'warning' | 'danger',
  }[],
  six_visit_strip: {                    // for the identity-strip dot breadcrumb
    appointment_id: string,
    occurred_at: string,
    status: AppointmentStatus,
    modality: ConsultationModality,
  }[],                                  // newest first, max 6
}
```

**Care-plan rules in this batch are explicit-only**, not AI. The aggregator runs a fixed set of derivation rules (follow-up date vs now, last-vitals date vs problem.recurrence period, etc.) — see pr-03 for the rule list. AI care-plan recommendations promote to Phase 3.

**DL-6: KPI tiles.** Five tiles in this order: **Active (seen in 90d)** · **New this month** · **Follow-up overdue** · **Open episodes** · **Possible duplicates**. Each tile is a clickable filter pivot — clicking applies the corresponding segment to the table. Counts come from a new `GET /api/v1/patients/kpis` endpoint (also owned by pr-03 since it's the same SQL discipline). KPI counts are *not* live; cached for 60s.

**DL-7: Identity strip primitives reused from the cockpit header.** `pr-09` reuses `SplitStartButton` (from `frontend/components/patient-profile/PatientProfileHeader.tsx:963`) verbatim for the Book-consult split button, reuses the `KebabMenu` pattern, reuses `formatDemographics` for the age/sex chip. The patient-page identity strip is structurally the cockpit-header's row 1 + row 2, just sourced from `Patient` instead of `Appointment`. **No fork of the header component** — pr-09 either factors the cockpit header's row-1 / row-2 sub-components into shared utilities or copies the small parts inline; the call is the task's. Hard-forbidden: importing `CockpitHeader` itself (it's appointment-scoped and renders the queue rail).

**DL-8: Six-visit dot breadcrumb.** Below the identity strip. Each dot is colored by status (success / warning / info / destructive / muted per the existing semantic tokens) and overlaid with a modality icon (`Video` / `Mic` / `MessageSquare` / `Phone` for in-clinic). Dots ordered newest-leftmost. Click on a dot jumps to the Visits tab pre-filtered to that single visit (URL query `?tab=visits&visit=<id>`). Hover surfaces a tooltip with date + status + modality + chief complaint (the chief-complaint string comes from the latest `prescription_drafts` snapshot if present, else `appointment.notes`). Six is a hard cap; older visits accessible via the Visits tab.

**DL-9: Saved views per-doctor.** Persisted in the existing `doctor_cockpit_layout_presets` table from cc-08 — schema is generic enough (`name TEXT`, `layout_json JSONB`, `is_default BOOLEAN`); pr-06 stores list-view configurations (`{ segment, sort, filters }`) under a `kind = 'patients_list_view'` discriminator column (cc-08 already supports `kind`; if not, pr-06's task ships the migration as XS). One Doctor's saved view does NOT show up on another doctor's screen (RLS already enforces this via `auth.uid() = doctor_id`).

**DL-10: Quick-peek on row hover.** Hovering a row in the patient table for >400ms opens a non-modal floating card to the right of the row showing the Overview tab's snapshot card + active problems + allergies — the same data the Overview tab renders, fetched lazily on hover. Closes on row blur. Keyboard equivalent: arrow-up/down moves the focused row, space opens the quick-peek (closes on next blur). pr-07 owns this.

**DL-11: Bulk select.** Each row has a checkbox; the toolbar gains a bulk-actions strip when ≥ 1 row is selected. Phase 1 actions: **Export CSV** (downloads selected patients' summary fields), **Tag** (writes a `patient_tag` text on each selected patient — pr-02 ships the column add as part of the segment-filter migration if it doesn't exist; otherwise reuses existing). Out of scope for Phase 1: bulk message (Phase 2), bulk delete (deliberately not built — single-row delete only).

**DL-12: Reuse `MergePatientsModal` unchanged.** pr-08 builds `DuplicatesCollapsedChip` (a single chip showing `"⚠ 3 possible duplicates"` that expands to the existing group list, each with a Merge button), wrapping the existing `MergePatientsModal`. Hard-forbidden: rewriting the merge flow itself (it's solved; it's just visually heavy).

**DL-13: No telemetry beyond tab opens + the close-gate smoke.** Tab opens fire `patients_v2.tab_opened` with `{tab_id, patient_id}`. The close-gate test in pr-13 fires `patients_v2.cutover_smoke_passed` exactly once. The Overview tab does NOT emit per-section-render events (Phase 2 might). The list page does NOT emit per-filter-applied events (we don't have the budget for the analytics this would require).

**DL-14: Sidebar cap stays at six items.** The nav doesn't gain a new "Patients v2" entry. The flip in pr-13 retargets the existing `User` icon item from `/dashboard/patients` to `/dashboard/patients-v2`. Cmd-K palette is updated in the same task.

Decisions explicitly **not** in scope for this batch (deferred to later phases / batches):

- **Billing tab.** Phase 2. The data exists (refund-service, payment records) but the surface design isn't locked.
- **Audit tab full implementation.** Phase 2. Phase 1 ships a tab placeholder with a one-line message; the audit-row read path doesn't exist yet for non-admin doctors.
- **Files storage backend.** Phase 2. pr-12 ships the empty state + an upload-button stub feature-flagged off in production.
- **AI care-plan recommender.** Phase 3 (depends on the cockpit-v2 R-RX-POLISH AI-assist surface).
- **Patient-side messaging composer.** Phase 2 (depends on Twilio/WhatsApp send-path).
- **Multi-doctor patient sharing.** Out of MVP — single-doctor RLS stays.
- **FHIR export / interoperability.** Out of MVP.
- **Patient-tag taxonomy + autocomplete.** Phase 2. pr-11's bulk-tag action accepts free text in Phase 1.
- **The list page's "Add patient" CTA wiring** (button exists in pr-06 but opens the same `AddAppointmentModal` we use today, which creates a patient as a side-effect; the dedicated `<NewPatientModal>` is Phase 2).

---

## Phases

### Wave 1 — Foundation (2 tasks, ~5h, single sequential lane)

The dependency cliff per [EXECUTION-ORDER-GUIDELINES § 0.5 Cut 1](../../../../process/EXECUTION-ORDER-GUIDELINES.md#05-how-to-cut-waves). pr-01 ships the v2 route shells + the ESLint zone + the new type extensions; pr-02 lights up the list endpoint's server-side query params so pr-05..pr-08 (Wave 3) have something real to render against. No new files outside `frontend/components/patients-v2/**` + `frontend/app/dashboard/patients-v2/**` + the backend list controller change.

- [`task-pr-01-v2-route-shells-and-eslint-zone.md`](./Tasks/task-pr-01-v2-route-shells-and-eslint-zone.md) — **S, Auto** — New routes `frontend/app/dashboard/patients-v2/page.tsx` + `frontend/app/dashboard/patients-v2/[id]/page.tsx` mounting empty `<PatientsV2Page>` / `<PatientV2Page>` client islands. New ESLint zone for `frontend/components/patients-v2/**` (forbids importing from `@/components/patients/**` — the v1 tree — except for `MergePatientsModal` which is reused; forbids `<ResizablePanelGroup>` direct import). New file `frontend/types/patient.ts` extensions: `PatientListFilters`, `PatientSegmentId`, `PatientSavedView`, `PatientOverviewData` (the DL-5 shape).
- [`task-pr-02-list-endpoint-server-side-filters.md`](./Tasks/task-pr-02-list-endpoint-server-side-filters.md) — **S, Auto** — Extend `GET /api/v1/patients` in `backend/src/controllers/patient-controller.ts` + `patient-service.ts` with the DL-4 query params (`q`, `segment`, `sort`, `page`, `pageSize`). Segment SQL: enumerated in the task with the seven joins / aggregates. Response shape gains `total: number` (for the table's pagination footer) and `page: number`. Add the `patient_tag TEXT` column to `patients` via a single XS migration `103_patients_tags.sql` IF the column doesn't already exist (the task does a discovery `rg` first). No PHI shape change; RLS unchanged.

### Wave 2 — Backend overview aggregator + frontend client wrappers (2 tasks, ~5h, single sequential lane)

Cut 1 again. pr-03 is the single Opus task — it composes ≥ 5 chart-context queries server-side into the DL-5 shape, with care-plan derivation rules + risk-flag rules + the six-visit strip + KPI counts. pr-04 wraps the new endpoints in `frontend/lib/api/patients.ts` so Waves 3–5 import a clean typed surface.

- [`task-pr-03-overview-aggregator-and-kpis.md`](./Tasks/task-pr-03-overview-aggregator-and-kpis.md) — **M, Opus 4.7** — New `GET /api/v1/patients/:id/overview` + new `GET /api/v1/patients/kpis` endpoints. Aggregator composes existing service queries (allergies, conditions, problems, vitals, prescriptions, appointments) into the DL-5 shape inside a single transaction per request to keep RLS predicates consistent. KPI endpoint runs five `COUNT(*) WHERE …` queries gated by `auth.uid() = doctor_id`. Care-plan rules + risk-flag rules locked in this task per DL-5; rule output is deterministic per input. **Opus per hard-rules list rules #1 (RLS scoping across multiple resource owners — appointments, prescriptions, vitals each have separate RLS predicates and the aggregator must compose them without leaking across tenants) and #2 (the response shape contains PHI from six tables).**
- [`task-pr-04-frontend-api-client-wrappers.md`](./Tasks/task-pr-04-frontend-api-client-wrappers.md) — **XS, Auto** — Add `getPatientsList(token, filters)` + `getPatientOverview(token, id)` + `getPatientsKpis(token)` + `getPatientSavedViews(token)` + `upsertPatientSavedView(token, view)` to `frontend/lib/api/patients.ts`. Types imported from `@/types/patient` (pr-01's extensions). Standard `fetch` + auth header pattern; no novel logic.

### Wave 3 — List redesign (4 tasks, ~10h, single sequential lane)

Cut 2 — artifact change. End of Wave 3: `/dashboard/patients-v2` renders the KPI strip + toolbar + sortable table + collapsed-duplicates chip — a different surface from the v1 card list. All four tasks live under `frontend/components/patients-v2/list/**` and consume pr-04's client.

- [`task-pr-05-patients-kpi-strip.md`](./Tasks/task-pr-05-patients-kpi-strip.md) — **S, Auto** — `PatientsKpiStrip.tsx` — 5 tiles (DL-6) in a responsive grid. Click → emits `onSegmentSelect(segmentId)`. Each tile shows the count + a 7-day delta chevron (↑ N / ↓ N / no change). Loading state = skeleton tiles. Error state = single-line muted message; the strip stays mounted to avoid layout shift.
- [`task-pr-06-patients-toolbar.md`](./Tasks/task-pr-06-patients-toolbar.md) — **M, Auto** — `PatientsToolbar.tsx` — search input (debounced 200ms, updates URL `?q=`), segment chips (clickable; click toggles; mirrors the URL `?segment=`), saved-view dropdown (`<Select>` + "Save current view…" + "Manage views" reusing the cc-10 `ManagePresetsDialog` shape), density toggle (compact / comfortable, persisted to localStorage), column chooser (controls which optional columns are visible). Save-view dialog reuses `cc-10`'s `SavePresetDialog` styling.
- [`task-pr-07-patients-table.md`](./Tasks/task-pr-07-patients-table.md) — **M, Auto** — `PatientsTable.tsx` — replaces the `<ul>` card list. Columns: checkbox (DL-11), avatar (initials when no photo), name + risk pills (`<RiskPills allergies conditions overdueFollowups />`), demographics chip, MRN (click-to-copy), phone (tel: link, mask toggle), last visit (date + modality icon), next visit (date + status chip when scheduled, else dash), open episodes (count, link to filter), source (channel icon), actions kebab. Sorting via column headers. Pagination footer. DL-10 quick-peek on hover via Radix `HoverCard` lazy-loading from `getPatientOverview`. DL-11 bulk-actions bar.
- [`task-pr-08-duplicates-collapsed-chip.md`](./Tasks/task-pr-08-duplicates-collapsed-chip.md) — **S, Auto** — `DuplicatesCollapsedChip.tsx` — single chip in the toolbar that reads `"⚠ {N} possible duplicates"` when N > 0; click opens a popover listing each group with a Merge button per group. Reuses `MergePatientsModal` from v1 (DL-12). Chip hidden when N = 0. Telemetry: emits `patients_v2.duplicates_popover_opened` on first open per session.

### Wave 4 — Detail shell (1 task, ~5h, single sequential lane)

Cut 1 — dependency cliff for Wave 5. pr-09 ships the entire detail-page shell (identity strip + dot breadcrumb + 7-tab framework with all tabs as placeholders) so the four content tasks in Wave 5 just have to fill the slot they own.

- [`task-pr-09-patient-v2-shell.md`](./Tasks/task-pr-09-patient-v2-shell.md) — **M, Auto** — `PatientV2Shell.tsx` — mounts `<PatientProfileShell>` with `PaneDefinition[]` carrying 7 tabs (Overview / Visits / Conversations / Rx / Vitals / Files / Audit). Each tab's `render` is initially a `<TabPlaceholder name={…} />`. Identity strip per DL-7 (reuses `SplitStartButton`, `formatDemographics`, `KebabMenu`-style affordances factored from the cockpit header). DL-8 dot breadcrumb mounted below the strip, fed by `overview.six_visit_strip`. URL-backed tab state via `?tab=`. Storage key `patient-v2/<patientId>/layout` (per-patient so layout choices don't bleed across patients).

### Wave 5 — Tabs content (3 tasks, ~9h with parallelism — 2 parallel lanes after pr-09)

Cut 2 — second artifact change. End of Wave 5: every tab renders real content. Lane β (pr-11) is independent of Lane α (pr-10 → pr-12) because History tabs (Visits / Conversations / Rx) consume the existing `getAppointments` / `listPrescriptions` paths while Overview / Vitals / Files consume pr-03's aggregator + the existing vitals + the file-storage stub respectively. The two lanes touch disjoint files under `frontend/components/patients-v2/tabs/**`.

**Lane α — Overview + Vitals + Files (continues from pr-09):**

- [`task-pr-10-patient-overview-tab.md`](./Tasks/task-pr-10-patient-overview-tab.md) — **M, Auto** — `OverviewTab.tsx` — consumes `getPatientOverview`. Two-column dashboard (DL-5 shape rendered): left column = snapshot card + active problems + allergies + chronic conditions + current medications. Right column = vitals sparklines (Recharts `LineChart` per metric with normal-range bands) + recent activity feed + care-plan banner (info / warning / danger by `risk_flags.severity` max). Empty states per section. Loading = skeleton-per-card.
- [`task-pr-12-vitals-and-files-tabs.md`](./Tasks/task-pr-12-vitals-and-files-tabs.md) — **S, Auto** — `VitalsTab.tsx` and `FilesTab.tsx`. Vitals = full chart + table per metric, reusing the data path from `getPatientOverview.vitals_trends` extended to ≥ 365 days via a new `?windowDays=` query param on the overview endpoint (pr-03 ships the param; pr-12 just calls it with a larger window). Files = empty state + upload-button stub behind `NEXT_PUBLIC_ENABLE_PATIENT_FILES`. Telemetry: both fire `patients_v2.tab_opened`.

**Lane β — History tabs (independent of Lane α):**

- [`task-pr-11-history-tabs.md`](./Tasks/task-pr-11-history-tabs.md) — **M, Auto** — `VisitsTab.tsx`, `ConversationsTab.tsx`, `RxTab.tsx`. Visits = expandable timeline rows (header always visible; click expands to show chief complaint + diagnosis + Rx issued + attachments), grouped by month, filters in-tab (modality / status / date range / doctor). Reuses the existing `getAppointments` path but filters server-side via the pr-02 query params extended to accept `?patient_id=`. Conversations = grouped by channel (WhatsApp / IG DM / web chat / in-app), preview + unread + last-replied-by per row. Rx = lifetime Rx grouped by date, drug + dose + regimen + issued-by + refill count + Reissue + PDF actions. All three tabs fire `patients_v2.tab_opened` on first render.

### Wave 6 — Flip + soak + delete (2 tasks, ~4h + ~3-day soak, single sequential lane)

Cut 3 + Cut 4 combined — kind-of-work change (cutover/delete instead of build) + wall-clock pause (the soak window). The release window is mandatory: the legacy `/dashboard/patients` paths stay live through it so the doctor can fall back to v1 with a URL edit if v2 breaks badly in their workflow.

- [`task-pr-13-cutover-nav-and-redirect.md`](./Tasks/task-pr-13-cutover-nav-and-redirect.md) — **XS, Composer 2 Fast** — Flip `frontend/components/layout/Sidebar.tsx`'s `Patients` href from `/dashboard/patients` → `/dashboard/patients-v2`. Update Cmd-K palette (`frontend/components/layout/GlobalCommandPalette.tsx`) "Go to Patients" entry to the new path. Add permanent 301 redirects in `next.config.mjs`: `/dashboard/patients` → `/dashboard/patients-v2`, `/dashboard/patients/:id` → `/dashboard/patients-v2/:id`. Emit `patients_v2.cutover_smoke_passed` telemetry on first `/dashboard/patients-v2` mount post-flip.
- ⏸ **`[ release window ~3 days ]`** — Soak period. The v1 surface is unreachable via the nav but the source files remain in the tree. The doctor can manually visit `/dashboard/patients-old` (an alias added in pr-13's `next.config.mjs` as a *temporary* fallback) if a regression surfaces during the soak. Any Sentry error tagged `surface = "patients-v2"` blocks pr-14.
- [`task-pr-14-delete-v1-patients-surface.md`](./Tasks/task-pr-14-delete-v1-patients-surface.md) — **S, Auto** — Delete `frontend/app/dashboard/patients/page.tsx`, `frontend/app/dashboard/patients/[id]/page.tsx`, and the legacy `frontend/components/patients/**` tree (`PatientsListWithFilters`, `PatientCockpit`, `PatientCockpitRail`, `PatientVisitsTimeline`, `PatientConversationsList`, the three dead files `PatientDetailRail` / `PatientDetailWorkArea` / `PatientPrescriptions`). Remove the `/dashboard/patients-old` alias from `next.config.mjs`. Verify with `rg "PatientCockpit\b|PatientsListWithFilters\|PatientCockpitRail" frontend` → zero results. Move `MergePatientsModal.tsx` to `frontend/components/patients-v2/MergePatientsModal.tsx` (its only consumer is now pr-08's chip). Final close-gate run: tsc + lint clean across the diff.

---

## Cross-cutting acceptance gate (whole batch)

These items must all be green before the batch is considered closed. They span waves and surface the batch-level invariants the wave gates can't individually verify.

### Structural

- [ ] **Side-by-side parity** — both `/dashboard/patients` (legacy) and `/dashboard/patients-v2` render without console errors during Waves 1–5 (pre-flip). The legacy page renders identically to pre-batch.
- [ ] **No new shell primitive** — `rg "ResizablePanelGroup" frontend/components/patients-v2` returns zero. `rg "import.*from.*\"@/components/patient-profile/Shell\"" frontend/components/patients-v2` returns ≥ 1 match (pr-09 mounts the shared shell).
- [ ] **ESLint zone active** — `frontend/components/patients-v2/**` files importing from `@/components/patients/**` (except `MergePatientsModal`) trigger the v2 zone rule.

### Backend (PHI-touching)

- [ ] **`GET /api/v1/patients/:id/overview` aggregator** ships the full DL-5 shape. RLS scoped to `auth.uid() = doctor_id` at every join leaf. Probe JWT for Doctor A returns 404 on Patient B's id (Patient B belongs to Doctor B).
- [ ] **`GET /api/v1/patients/kpis`** returns five counts, all per-doctor. Cached for 60s per doctor.
- [ ] **`GET /api/v1/patients` list endpoint** honours the pr-02 query params; `q` is case-insensitive; `segment` returns the right SQL filter (manually verified one row per segment); pagination metadata is correct.
- [ ] **Zero new migrations beyond `103_patients_tags.sql`** — and that one only ships if the discovery `rg` confirms `patient_tag` isn't already a column.

### Frontend (list + detail)

- [ ] **KPI strip renders 5 tiles** with live counts; clicking each tile applies the corresponding segment to the table.
- [ ] **Toolbar** — search (debounced), 7 segment chips, saved-view dropdown (with at least 1 doctor-scoped saved view round-trippable), density toggle, column chooser.
- [ ] **Table** — sortable, paginated, quick-peek on hover, bulk-select with Export CSV + Tag bulk actions. Avatar / risk-pill rendering verified for at least one patient with allergies + open episodes.
- [ ] **Duplicates** — collapsed chip; expands to the existing merge popover; `MergePatientsModal` flow unchanged.
- [ ] **Detail page identity strip** — name, demographics chip, condition/allergy pill row (≤ 3 visible, "+N more" for the rest), Book consult split button (Video / Voice / Text / In-clinic), kebab with Edit / Merge / Audit log / Export PDF / Delete.
- [ ] **Six-visit dot breadcrumb** — six dots colored by status, modality icon overlay, click jumps to filtered Visits tab.
- [ ] **Seven tabs** all render real content (no placeholders): Overview, Visits, Conversations, Rx, Vitals, Files (empty state behind feature flag), Audit (placeholder message acceptable per DL-3).
- [ ] **Overview tab** — snapshot, active problems, allergies, chronic conditions, current medications, vitals sparklines, recent activity feed, care-plan banner.

### Cutover

- [ ] **Wave 6 flip** — sidebar `Patients` href is `/dashboard/patients-v2`; Cmd-K palette routes to the new path; 301 redirects in place.
- [ ] **Soak window** — ≥ 3 calendar days between pr-13 ship and pr-14 ship. Zero Sentry errors with `surface = "patients-v2"` during the soak (any error blocks pr-14).
- [ ] **Wave 6 delete** — `rg "PatientCockpit\b|PatientsListWithFilters\|PatientCockpitRail\|PatientVisitsTimeline\|PatientConversationsList\|PatientDetailRail\|PatientDetailWorkArea\|PatientPrescriptions" frontend` returns zero. `/dashboard/patients-old` alias is gone.

### Quality

- [ ] **`pnpm --filter frontend tsc --noEmit` clean.** `pnpm --filter backend tsc --noEmit` clean.
- [ ] **`pnpm --filter frontend lint` clean.** `pnpm --filter backend lint` clean.
- [ ] **No new Sentry errors** during a 10-min manual smoke session (list + detail across two patients).
- [ ] **Telemetry events fire** — `patients_v2.tab_opened` per tab on first render; `patients_v2.cutover_smoke_passed` exactly once after the flip.

### Documentation

- [ ] **Source plan updated** — this file tagged `[SHIPPED 2026-05-XX]` at the top.
- [ ] **`docs/Reference/PATIENTS.md`** (create if not present) — short architecture note: the v2 surface layout, the aggregator endpoint contract, the saved-view persistence model. Linked from this batch's README.
- [ ] **`docs/Work/process/EXECUTION-ORDER-GUIDELINES.md` references** updated if this batch surfaces a new pattern (the soak-then-delete cadence already exists; no new pattern expected).

---

## Sequencing notes (the why behind the waves)

The 6-wave shape falls out of the EXECUTION-ORDER-GUIDELINES §0.5 cuts:

- **Wave 1 → Wave 2 is a Cut 1 (dependency cliff).** Without the list endpoint's server-side filters and the route shells in place, the table in Wave 3 has nothing to render against, and the aggregator in Wave 2 has no client wrapper to expose.
- **Wave 2 → Wave 3 is a Cut 1 again.** Without the aggregator, the Overview tab can't render; without the client wrappers, none of the Wave 3 / 5 components have a typed surface to consume. Wave 2 ships only typed contracts + backend logic — no UI moves yet.
- **Wave 3 → Wave 4 is a Cut 2 (artifact change).** End of Wave 3: the list surface is live (a different artifact from the v1 card list). End of Wave 4: the detail shell is live with placeholder tabs (a different artifact from the v1 cockpit). Reviewer mindset shifts.
- **Wave 4 → Wave 5 is a Cut 1 again.** pr-10 / pr-11 / pr-12 all consume pr-09's tab framework. Splitting Wave 4 + Wave 5 means the parallelism in Wave 5 is safe — both lanes touch pr-09's outputs but neither modifies them.
- **Wave 5 → Wave 6 is a Cut 3 (kind-of-work change) + Cut 4 (release window).** Wave 6 = flip + soak + delete, not build.

The bottleneck is **Wave 5 (~9h with parallelism, two engineers; ~14h sequential).** Lane α (pr-10 + pr-12) is the slower lane because the Overview tab consumes the broadest aggregator shape; Lane β (pr-11) is three sibling tabs that share a fetch + render pattern. Single-engineer execution runs Lane α and Lane β sequentially → Wave 5 grows to ~14h sequential.

**Why no Shape B parallel lanes in Waves 1, 2, 3, or 4?** Wave 1 + Wave 2 + Wave 4 each have a single task that's the entry point for the next wave (no parallelism opportunity). Wave 3 has four tasks but they share enough state (the table mounts the KPI strip + the toolbar + the duplicates chip) that a single chat is more efficient than four parallel ones; sequential keeps the context warm.

**Why one Opus task in this batch?** pr-03 is the aggregator (composes ≥ 5 chart-context queries with RLS predicates that must align across joins, on a shape that touches PHI from six tables). Hard-rules list rules #1 and #2 both apply. Every other task is bounded enough that Auto suffices with the spec quality this plan provides. cv2-style "Auto with per-message Opus escalation if stuck" is the right pattern for pr-10 / pr-11 if the aggregator-consuming UI surprises.

---

## Out-of-scope (rolled forward to future batches)

These items appeared in the planning conversation but are explicitly **not** delivered by this batch. Each gets a future batch named here.

| Out-of-scope item | Where it lands |
|---|---|
| **Billing tab** (invoices, payments, outstanding balance, refunds) | Phase 2 — `patients-billing` batch |
| **Audit tab full implementation** (audit-row read path + filter UI) | Phase 2 — `patients-audit` batch |
| **Files storage backend** (file-upload API + signed URLs + preview) | Phase 2 — `patients-files-storage` batch |
| **AI care-plan recommender** (replaces DL-5's rule-based care plan with an LLM call) | Phase 3 — `cockpit-v2-ai-assist` batch |
| **Patient-side messaging composer** | Phase 2 — `patients-messaging` batch (depends on Twilio/WhatsApp send-path) |
| **Multi-doctor patient sharing** | Out of MVP |
| **FHIR export / interoperability** | Out of MVP |
| **Patient-tag taxonomy + autocomplete** | Phase 2 — `patients-tags-v2` batch |
| **Dedicated `<NewPatientModal>` for the list page's Add CTA** | Phase 2 — `patients-add-flow` batch |
| **Saved-view sharing across doctors** | Out of MVP (single-doctor RLS holds) |

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

Token estimate (rough): ~400k input / ~300k output across the batch. One Opus task draws from the API pool (~$15–25 at ~50k–100k tokens); the other thirteen draw from the Auto+Composer pool. Total batch spend: ~$50–70 excluding the optional close-gate review.

**One optional Opus close-gate turn after pr-14** budgeted on top. Skip if the deterministic gates pass cleanly.

---

## References

- [`Tasks/EXECUTION-ORDER-patients-redesign.md`](./Tasks/EXECUTION-ORDER-patients-redesign.md) — the *who-runs-what-when* sibling.
- [Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild/plan-patient-profile-shell-rebuild.md](../../13-05-2026/patient-profile-shell-rebuild/plan-patient-profile-shell-rebuild.md) — the foundation shell this batch reuses.
- [Daily-plans/May 2026/17-05-2026/cockpit-v2/plan-cockpit-v2-batch.md](../../17-05-2026/cockpit-v2/plan-cockpit-v2-batch.md) — the recursive-shell extension; co-existing batch with disjoint files.
- [Daily-plans/May 2026/10-05-2026/cockpit-customization/plan-cockpit-customization-batch.md](../../10-05-2026/cockpit-customization/plan-cockpit-customization-batch.md) — the saved-view / preset persistence model pr-06 mirrors.
- [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) — model-tier rules; rule #1 / #2 drive pr-03 → Opus.
- [EXECUTION-ORDER-GUIDELINES.md](../../../../process/EXECUTION-ORDER-GUIDELINES.md) — wave / lane / shape rules used to draft this batch.
