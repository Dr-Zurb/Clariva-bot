# Sub-batch A — Foundation (T1) — execution checklist

## Patient chart context spine; everything else depends on this

> **Source plan (rationale, decisions, code sketches, risks):** [plan-t1-ehr-foundation.md](../../../Product%20plans/ehr/plan-t1-ehr-foundation.md).
>
> **Master batch:** [plan-ehr-implementation-batch.md](./plan-ehr-implementation-batch.md).
>
> **Status:** `Drafted, ready to start` — 2026-05-03.
>
> **Effort:** ~3 dev-days. **Items:** 6. **Migrations:** 1.
>
> **Hard prerequisite:** none — this is the foundation. Unblocks B1, B2, C, D.
>
> **Dev DB:** `087_patient_chart_context.sql` applied Supabase dev **2026-05-04**.

---

## Pre-batch checklist

Confirm these BEFORE the first PR opens. Cross off as done.

- [ ] Decisions 1–5 in [§ Cross-cutting decisions / Before Sub-batch A starts](./plan-ehr-implementation-batch.md#before-sub-batch-a-starts) of the master batch are confirmed by the owner.
- [ ] Pick the next available migration number — run `ls backend/migrations/ | rg '^[0-9]+_' | sort | tail -5` to confirm. Use that number for `0XX_patient_chart_context.sql` below.
- [ ] Confirm `InCallActionPanel.tsx` (used in T1.5) has UI room for a new "Patient chart" tab. If a quick read shows it's tightly packed, file a small follow-up to refactor before T1.5 — don't block A on it.
- [ ] Spin up two test doctor users (`doctor_a@test`, `doctor_b@test`) with a shared test patient — needed for the cross-doctor RLS verification in the post-batch checklist.

---

## Task 1 — Schema migration (T1.1)

**Status:** Implementation complete (2026-05-03) — migration **`087_patient_chart_context.sql` applied dev DB 2026-05-04.** Manual cross-doctor RLS smoke recommended post-apply.

**Effort:** 0.5 day · **Source:** [T1 §T1.1](../../../Product%20plans/ehr/plan-t1-ehr-foundation.md)

### Shipped artifact

- `backend/migrations/087_patient_chart_context.sql` — three tables (`patient_allergies`, `patient_chronic_conditions`, `patient_vitals`) + 3 partial indexes (`WHERE archived_at IS NULL`) + 3 `updated_at` triggers + 12 RLS policies (4 CRUD per table, all `auth.uid() = doctor_id`) + BMI auto-compute trigger on `patient_vitals` (Decision §26: persist over compute-on-read; manual override wins when caller passes `bmi`).
- True idempotent — `DROP TRIGGER IF EXISTS` / `DROP POLICY IF EXISTS` guards before each `CREATE` (PostgreSQL has no `CREATE POLICY IF NOT EXISTS`); re-running on a partial DB is a no-op.
- Reverse-migration block included as a comment at the bottom (drop in reverse dep order).
- Verification SQL (cross-doctor RLS smoke + soft-delete + BMI compute) included as a comment at the bottom for the reviewer to copy-paste into psql post-apply.

### Steps

1. Create `backend/migrations/0XX_patient_chart_context.sql` with the three tables, indexes, RLS policies, and `updated_at` triggers as specified in the source plan §T1.1 SQL block.
2. Mirror migration 026 §4's RLS shape exactly — four CRUD policies per table (`select_own / insert_own / update_own / delete_own`), all keyed on `auth.uid() = doctor_id`.
3. Confirm CHECK constraints on `patient_vitals` are present (BP / HR / temp / SpO₂ / weight / height ranges).
4. Confirm partial indexes filter `archived_at IS NULL` (chart-panel hot path).

### Done when

- Migration runs cleanly on a fresh DB (`backend/scripts/db-reset.ts` or equivalent).
- Migration runs cleanly on the current dev DB (idempotent — re-running is a no-op).
- `\d+ patient_allergies` (and the other two) shows the right columns + indexes.
- Inserting an allergy as `doctor_a` and trying to SELECT it as `doctor_b` returns 0 rows.
- Soft-delete pattern works: `UPDATE patient_allergies SET archived_at = now() WHERE id = $1` followed by the standard list query (`WHERE archived_at IS NULL`) returns no rows.

### Suggested PR

**PR #1 — Migration only.** No backend / frontend code yet. Reviewable in 5 minutes; safe rollback.

---

## Task 2 — Backend service + REST routes (T1.2)

**Status:** Implementation complete (2026-05-03) — backend files written, `npx tsc --noEmit` passes clean. Migration 087 applied dev 2026-05-04; manual E2E smoke (POST → GET → PATCH archive) with a doctor JWT still recommended.

**Effort:** 0.5 day · **Source:** [T1 §T1.2](../../../Product%20plans/ehr/plan-t1-ehr-foundation.md)

### Shipped artifacts

- `backend/src/types/patient-chart.ts` — DB row interfaces (`PatientAllergy`, `PatientChronicCondition`, `PatientVitalsReading`) + camelCase create/update inputs.
- `backend/src/services/patient-chart-service.ts` — 9 functions (list/create/update for each of allergies / conditions / vitals). Uses admin client + TS-enforced `doctor_id = userId` filter (matches codebase convention; `prescription-service.ts`-style; deviates from source-plan T1.2 sketch which assumed user-scoped client + RLS-enforced filter — RLS in migration 087 remains as defense-in-depth). Soft-delete sentinel: `archivedAt: 'now'` resolves to ISO timestamp at call time; `null` un-archives. Hard delete intentionally not exposed in V1.
- `backend/src/controllers/patient-chart-controller.ts` — 9 Express handlers, response shape mirrors `prescription-controller.ts` (`{ allergy: ... }`, `{ allergies: [...] }` etc.).
- `backend/src/utils/validation.ts` — appended ~200 lines of Zod schemas + validator functions (params, allergy create/update, condition create/update, vitals create/update). Vitals bounds mirror migration 087 CHECK constraints exactly (BP 40–300 / 20–200, HR 20–250, temp 30–45, SpO₂ 50–100, weight 0–500, height 0–300).
- `backend/src/routes/api/v1/patient-chart-routes.ts` — Router with `mergeParams: true` so it inherits `:patientId` when mounted under `/patients`.
- `backend/src/routes/api/v1/patients.ts` — 1-line edit: mounts the chart sub-router under `/:patientId/chart`. No other routes touched.

### Routing surface (final)

```
GET   /api/v1/patients/:patientId/chart/allergies
POST  /api/v1/patients/:patientId/chart/allergies
PATCH /api/v1/patients/:patientId/chart/allergies/:id
GET   /api/v1/patients/:patientId/chart/conditions
POST  /api/v1/patients/:patientId/chart/conditions
PATCH /api/v1/patients/:patientId/chart/conditions/:id
GET   /api/v1/patients/:patientId/chart/vitals       (?limit=N optional, capped at 200)
POST  /api/v1/patients/:patientId/chart/vitals
PATCH /api/v1/patients/:patientId/chart/vitals/:id
```

All require `Authorization: Bearer <doctor JWT>`. No DELETE endpoints — soft-delete via `PATCH ... { archivedAt: 'now' }`.

### Steps

1. Create `backend/src/services/patient-chart-service.ts`. Functions: `listAllergies / createAllergy / updateAllergy / archiveAllergy` plus the parallel sets for `chronic_conditions` and `vitals`. All take `doctorAuthClient: SupabaseClient` (per-request user-scoped client, NOT service-role). RLS enforces `auth.uid() = doctor_id` — service code does NOT add it.
2. Create `backend/src/controllers/patient-chart-controller.ts`. Express handlers for the three resource groups, all under `/api/v1/patients/:patientId/chart`.
3. Create `backend/src/routes/api/v1/patient-chart-routes.ts`.
4. Mount the new router in `backend/src/index.ts`.
5. Body validation with Zod (or whatever the project convention is — check existing controllers like `prescription-controller.ts` for the pattern). Reject out-of-range vitals values explicitly with a 400.
6. Soft-delete is exposed via `PATCH /:id` with `{ archived_at: <ISO timestamp or 'now'> }`. No separate DELETE endpoint in V1 (`DELETE` is hard-delete, opt-in only — leave it unimplemented or 405 it).

### Done when

- `GET /api/v1/patients/<id>/chart/allergies` returns `[]` for a new patient.
- `POST /allergies` with `{ allergen: 'Penicillin', severity: 'severe' }` creates a row.
- `PATCH /allergies/<id>` with `{ archived_at: <ISO> }` soft-deletes the row.
- All three resource groups (allergies / conditions / vitals) work end-to-end.
- A different doctor's JWT cannot see / write rows belonging to the first doctor (RLS verified manually with two test users).
- Body validation rejects e.g. `{ bp_systolic: 5000 }` with 400.

### Suggested PR

**PR #2 — Backend only.** Mergeable independently of any frontend work.

---

## Task 3 — `<PatientChartPanel>` component family (T1.3)

**Status:** Implementation complete (2026-05-03) — types, API wrappers, panel root, section wrapper, all 4 section components written. `npx tsc --noEmit` passes clean on the frontend. Component is NOT yet mounted anywhere live (per the source-plan note — A.4 / A.5 / A.6 do the real mounts).

**Effort:** 1 day · **Source:** [T1 §T1.3](../../../Product%20plans/ehr/plan-t1-ehr-foundation.md)

### Shipped artifacts

- `frontend/types/patient-chart.ts` — DB row types (snake_case), create/update payloads (camelCase), response data shapes (`AllergyData`, `AllergiesListData`, etc.), and shared `PatientChartLayout` / `PatientChartMode` discriminators.
- `frontend/lib/api.ts` — appended ~180 lines of patient-chart API wrappers (9 CRUD functions + 3 `archivePatient*` convenience helpers) + a hoisted `patientChartMutate<T>` helper to dedupe POST/PATCH boilerplate. Type imports added to the file's top import block.
- `frontend/components/ehr/SectionWrapper.tsx` — collapsible section helper with title + count badge + optional "+ Add" affordance. `startCollapsed` is initial-state-only (user toggle persists for the mount lifetime).
- `frontend/components/ehr/PatientChartPanel.tsx` — root component. Switches CSS classes by `layout` prop:
  - `desktop` → `w-80` left-rail
  - `in-call` → `w-64`, compact `text-sm`
  - `mobile` → full-width accordion (sections default-collapsed via `isAccordion`)
  - Owns per-section `addOpen` state + per-section `count` state for badges. Uses `useCallback` for count-handlers so section effects don't refire on parent re-renders.
- `frontend/components/ehr/sections/AllergiesSection.tsx` — full implementation: list + inline add form (allergen + severity dropdown + reaction) + optimistic add-and-rollback + hover-to-archive (also optimistic) + severity badge color (mild=yellow, moderate=orange, severe=red, unknown=gray) + empty-state CTA.
- `frontend/components/ehr/sections/ChronicConditionsSection.tsx` — same shape as allergies; condition + diagnosed_on date picker.
- `frontend/components/ehr/sections/VitalsSection.tsx` — **placeholder** (T5.22 will replace with proper capture widget + sparklines). Renders most-recent reading + tiny inline 7-field form (BP sys/dia, HR, SpO₂, temp, weight, height). Threads `appointmentId` through so in-call mount can carry visit context (master-batch decision §4). BMI is intentionally NOT computed client-side — the DB trigger does it (migration 087).
- `frontend/components/ehr/sections/PreviousRxSection.tsx` — **stub** (T1.6 will fill it). Renders a single grey placeholder line so the panel doesn't look broken before T1.6 ships.

### Component contract

```tsx
<PatientChartPanel
  patientId={appointment.patient_id}
  doctorId={appointment.doctor_id}        // optional; threaded for future T6 use
  token={supabaseSession.access_token}    // required
  layout="desktop" | "mobile" | "in-call" // default "desktop"
  mode="default" | "readonly"             // default "default"; readonly hides Add CTAs
  appointmentId={...}                      // optional; used by VitalsSection in in-call mount
  className="..."                          // optional host overrides
/>
```

Test selectors: `[data-testid="patient-chart-panel"]` with `data-layout` and `data-mode` attributes.

### Steps

1. Create `frontend/types/patient-chart.ts` with `PatientAllergy`, `PatientChronicCondition`, `PatientVitalsReading` interfaces matching the migration columns.
2. Create `frontend/lib/api/patient-chart.ts` — typed wrappers around the T1.2 routes. SWR keys: `['patient-chart', patientId, 'allergies']` etc.
3. Create `frontend/components/ehr/PatientChartPanel.tsx` (skeleton from source-plan T1.3 sketch).
4. Create the four section sub-components in `frontend/components/ehr/sections/`:
   - `AllergiesSection.tsx` — list rows + "Add" CTA + add-modal + archive action.
   - `ChronicConditionsSection.tsx` — same shape.
   - `VitalsSection.tsx` — **placeholder** (T5.22 fills it in with capture widget + sparklines). For A, just render the most-recent reading row + "Add reading" CTA opening a tiny inline form.
   - `PreviousRxSection.tsx` — placeholder (T1.6 implements it).
5. Add a `<SectionWrapper>` helper for the collapse/expand affordance + title + add-button. Default-collapsed when `layout='mobile'`.
6. Empty states for each section ("No allergies recorded — Add" CTA).
7. Optimistic UI on add/archive — update SWR cache before the server response, reconcile on success/error.

### Done when

- Component mounts with `layout='desktop' | 'mobile' | 'in-call'` props and renders correctly at each.
- `<lg`: sections are collapsed by default; tap to expand.
- Add allergy / condition flow → row appears in section → archived row disappears.
- Manual responsive review at 375 / 768 / 1024 / 1440 — passes (no overflow, sections don't get clipped).
- No TypeScript errors; lint clean.

### Suggested PR

**PR #3 — Component family + types + API wrappers.** Includes Storybook entries (or visual smoke notes) for the three layouts. The component is mounted ONLY behind a route guard / dev flag in this PR; PRs #4 + #5 do the real mounts.

---

## Task 4 — Mount in appointment-detail page (T1.4)

**Status:** Implementation complete (2026-05-03) — appointment-detail page now renders a 12-col grid on `lg+` with the chart rail in `lg:col-span-3` and existing content (summary + OPD actions + consultation actions + post-call summary + artifacts + chat link) in `lg:col-span-9`. Chevron toggles desktop collapse, persisted to `localStorage('ehr_chart_collapsed_v1')`. Mobile (`< lg`) renders the rail as a top accordion above the page body. Migration 087 applied dev 2026-05-04 — chart API live against dev DB after auth.

**Effort:** 0.25 day · **Source:** [T1 §T1.4](../../../Product%20plans/ehr/plan-t1-ehr-foundation.md)

### Shipped artifacts

- `frontend/hooks/useMediaQuery.ts` — minimal SSR-safe `matchMedia` hook (servers default to `false`, first client effect tick reconciles to real value). Reused by the chart-rail wrapper for the lg+ breakpoint.
- `frontend/components/ehr/AppointmentChartRail.tsx` — client wrapper around `<PatientChartPanel>`. Owns:
  - lg+ breakpoint detection via `useMediaQuery('(min-width: 1024px)')`
  - desktop collapse state persisted to `localStorage('ehr_chart_collapsed_v1')`
  - the chevron affordance (▶ collapsed → ◀ expanded)
  - sticky `top-0 h-screen` positioning so the chart stays in view as the right column scrolls
  - mobile branch renders `<PatientChartPanel layout='mobile'>` as a top accordion (no sticky, no collapse chevron — the SectionWrapper's per-section collapse handles density there)
- `frontend/app/dashboard/appointments/[id]/page.tsx` — wrapped the existing return body in a 12-col grid wrapper (`lg:grid lg:grid-cols-12`). Chart rail mounts in `lg:col-span-3` (only when `appointment.patient_id` is non-null — in the very rare case it's null, the page falls back to the original single-column layout and never instantiates the rail). The full pre-existing right-column content is unchanged inside `lg:col-span-9 lg:px-6`.

### Steps

1. In `frontend/app/dashboard/appointments/[id]/page.tsx`, restructure the page from a single-column scroll into a 12-col CSS grid on `lg+` (per source-plan code excerpt).
2. Mount `<PatientChartPanel layout={isDesktop ? 'desktop' : 'mobile'} ... />` in `lg:col-span-3`. Use the existing breakpoint utility (or `useMediaQuery('(min-width: 1024px)')`).
3. The existing prescription form moves into `lg:col-span-9` unchanged.
4. Apply Decision 1 from master batch: chart panel is collapsible on desktop. Add a small chevron in the panel header that toggles `chartCollapsed` state stored in `localStorage` (`ehr_chart_collapsed_v1`). Collapsed = icon-only rail (`w-12`).
5. Verify resize across the `lg` breakpoint doesn't jank.

### Done when

- The existing prescription form continues to work end-to-end (no regression — verify by creating + saving + sending an Rx as smoke).
- Chart panel visible on left at `lg+`, accordion on top at `<lg`.
- Desktop chevron collapses the panel; state survives page refresh.
- Page loads in under 1s on dev (no new network waterfall).

### Suggested PR

**PR #4 — Page restructure + mount.** Visual diff is large but logic change is minimal.

---

## Task 5 — Mount in in-call quick-actions panel (T1.5)

**Status:** Implementation complete (2026-05-03) — the existing in-call Rx surface (`<InCallActionPanel>` body when `quickActionPanel === 'rx'`) now renders a two-tab body via `<InCallChartRxTabs>`. Walk-ins (no `patient_id`) skip the tabs and render the bare `<PrescriptionForm>` — preserves Sub-batch C / task-video-C6 UX exactly. Migration 087 applied dev 2026-05-04.

**Effort:** 0.5 day · **Source:** [T1 §T1.5](../../../Product%20plans/ehr/plan-t1-ehr-foundation.md)

### Shipped artifacts

- `frontend/components/ehr/InCallChartRxTabs.tsx` — small wrapper that renders a tab strip + body. Tabs: `Patient chart` (default when `patientId` is non-null) → `<PatientChartPanel layout='in-call'>`, and `Prescription` → existing `<PrescriptionForm>`. Tab state is component-local `useState`, NOT `localStorage` — per master-batch decision §3 + T1.5 step 5 (the doctor may want a different default per call). The chart panel is rendered with a `className="w-full border-r-0"` override so it fills the action panel width (~400px desktop) instead of using the in-call default `w-64`.
- `frontend/components/consultation/VideoRoom.tsx` — replaced the body of the Rx `<InCallActionPanel>` with `<InCallChartRxTabs>` and updated the panel title accordingly (`Patient chart & prescription` when there's a patient row, `Send prescription` for walk-ins). Direct `import PrescriptionForm` was removed (`InCallChartRxTabs` owns the import); a comment was left in its place to flag the indirection.

### Decisions / deviations

- **Default tab = `chart`**: We default to the patient-chart tab when `patientId` is present, on the rationale that the prevailing clinical pattern is "review chart → write Rx" rather than the reverse. Walk-ins fall straight into the Rx form with no tabs because the chart is empty by definition.
- **No banner on tab switch**: Tab transitions are silent — they don't post in-channel system messages. Only "Save & Send" still triggers `handleRxSent` (existing behaviour).
- **Recording boundary unchanged**: The in-call panel itself was already non-pausing (per task-video-C6 §Notes #5); adding a chart tab doesn't change that.

### Steps

1. Open `frontend/components/consultation/InCallActionPanel.tsx` (and / or `InCallQuickActions.tsx` — find the host that renders the existing "Prescription" surface).
2. Add a tab strip at the top of the panel: `Patient chart` / `Prescription`. Per master-batch decision 3: tabbed (option a).
3. Mount `<PatientChartPanel layout='in-call' ... />` in the "Patient chart" tab.
4. Verify the in-call layout (`w-64`, compact density) reads cleanly at the actual in-call panel width.
5. Make sure tab state survives panel close + reopen during the same call (use a ref or session-scoped state — not localStorage, since the doctor might want a different default per call).

### Done when

- Doctor can switch between chart and prescription mid-call.
- Edits made in-call (e.g. adding a new allergy) persist after the call ends — confirmed by viewing the patient's appointment-detail page post-call and seeing the new row.
- Compact `in-call` layout doesn't clip or wrap awkwardly at typical in-call panel widths (~360–440px usable).

### Suggested PR

**PR #5 — In-call mount.** Independent of PR #4; can ship in either order.

---

## Task 6 — Previous-Rx history section (T1.6)

**Status:** Implementation complete (2026-05-03) — backend lightweight summary endpoint shipped, frontend wrapper + section UI ready. The chart panel's "Previous prescriptions" section now lists the last 3 Rx (configurable) with relative-date headers, medicine count, sent/draft pill, and tap-to-expand bodies (medicines + clinical notes lazy-loaded via `getPrescription`). Existing `/dashboard/appointments/[id]` page is the fallback link target until a dedicated patient-history route lands.

**Effort:** 0.5 day · **Source:** [T1 §T1.6](../../../Product%20plans/ehr/plan-t1-ehr-foundation.md)

### Shipped artifacts

- `backend/src/types/prescription.ts` — added `PrescriptionRecentSummary` (locked-in shape: `{ id, appointment_id, created_at, provisional_diagnosis, sent_to_patient_at, medicine_count }`). Locked because B1 / T2.14 ("copy from last visit") will reuse this surface — see master batch §B1.
- `backend/src/services/prescription-service.ts` — added `listRecentPrescriptionsByPatient(patientId, correlationId, userId, limit=3)`. Single-roundtrip via Supabase FK embed (`prescription_medicines(id)`) so `medicine_count` is computed without fetching dosages. Limit is clamped to `[1, 25]`. Same access gate as `listPrescriptionsByPatient` (doctor must have an appointment OR conversation with the patient).
- `backend/src/controllers/prescription-controller.ts` — added `listRecentPrescriptionsByPatientHandler`. Reuses `validatePatientChartParentParams` so the `patientId` check is consistent with chart-context routes.
- `backend/src/routes/api/v1/patients.ts` — mounted `GET /api/v1/patients/:patientId/prescriptions/recent` directly (single endpoint; not a sub-router).
- `frontend/types/prescription.ts` — mirror `PrescriptionRecentSummary`.
- `frontend/lib/api.ts` — added `RecentPrescriptionsListData` + `listRecentPrescriptionsByPatient(token, patientId, { limit? })`.
- `frontend/components/ehr/sections/PreviousRxSection.tsx` — replaced the A.3 stub. Lists rows; each row tap-expands inline; full prescription is fetched lazily on first expand (cached in component state for the panel mount lifetime). Empty state ("No prior prescriptions") + error state both render quietly. "View all" link points at the most recent appointment's detail page (placeholder until dedicated patient history page exists).
- `frontend/components/ehr/PatientChartPanel.tsx` — threaded an `onCountChange` callback into the Previous prescriptions `<SectionWrapper>` so the badge displays the row count consistently with Allergies / Conditions.

### Decisions / deviations

- **Single endpoint, not a sub-router**: `prescriptions/recent` is the only patient-scoped Rx endpoint we need today; promoting it to a `prescription-routes.ts` sub-router under `patients.ts` would be overkill. Mounted inline in `patients.ts`.
- **Lazy-loaded expand**: The lightweight list keeps initial render fast (no medicines / attachments fetched). Expand triggers `getPrescription(id)` which is the existing detail endpoint — no new code path.
- **"View all" stand-in**: The dedicated `/dashboard/patients/:id/history` page is deferred. We link to the most recent appointment's detail page so the affordance is present and useful, instead of a stub URL that 404s.
- **Sent/Draft pill**: The summary includes `sent_to_patient_at` so we surface delivery state inline (Sent ✓ vs Draft). Clarifies the doctor's mental model without an extra fetch.

### Steps

1. In `backend/src/services/prescription-service.ts`, add `listRecentPrescriptionsByPatient(client, patientId, limit = 3)`. Returns `[{ id, appointment_id, created_at, provisional_diagnosis, medicine_count }]`. Lightweight — no full body, no attachments. SQL: `SELECT id, appointment_id, created_at, provisional_diagnosis, (SELECT COUNT(*) FROM prescription_medicines WHERE prescription_id = p.id) AS medicine_count FROM prescriptions p WHERE patient_id = $1 ORDER BY created_at DESC LIMIT $2`.
2. Expose via `GET /api/v1/patients/:patientId/prescriptions/recent?limit=3` in the existing `prescription-controller.ts`.
3. In `frontend/lib/api/prescription.ts`, add the typed wrapper.
4. Implement `frontend/components/ehr/sections/PreviousRxSection.tsx` (from the source-plan T1.6 sketch): list of up to 3 collapsed `<PreviousRxCard>` components, expand-on-tap with full Rx body (lazy load the medicines on expand — extend the recent endpoint or call the existing detail endpoint).
5. Add a "View all" link → `/dashboard/patients/<id>/history` (placeholder route; not implemented in A — render a "Coming soon" stub if needed, or link to the patient's existing detail page).
6. Empty state for new patients ("No prior prescriptions").

### Done when

- Most recent 3 prescriptions appear in the chart panel (newest first).
- Empty state for new patients works.
- Expand/collapse smooth (no scroll-jump).
- T2.14 ("copy from last visit") will hook into the same data path — verify the service returns a stable shape so B1 can reuse it without refactoring.

### Suggested PR

**PR #6 — Recent-Rx surface.** Includes both backend endpoint + frontend section.

---

## Post-batch validation

Once Tasks 1–6 are merged, verify the whole sub-batch as a unit before moving to B1/B2.

- [ ] **Cross-doctor RLS** — log in as `doctor_a`, create allergies + conditions + vitals + a sample Rx for shared patient. Log out; log in as `doctor_b`; open the same patient's appointment — chart panel shows EMPTY (no rows). Re-confirm at the database level: `SELECT COUNT(*) FROM patient_allergies WHERE patient_id = '<shared>'` returns 2 (`a` and `b` each see only their own when filtered by `auth.uid()`).
- [ ] **Three-mount-surface parity** — chart panel renders correctly in `appointment-detail` (full), `in-call quick-actions` (compact), and post-call (read-only — though A doesn't ship the post-call host yet, verify the component handles `mode='readonly'` if passed by hiding "Add" CTAs).
- [ ] **Soft-delete** — archive an allergy via UI; confirm row disappears from list; confirm it's still in the DB with `archived_at IS NOT NULL`.
- [ ] **Empty states** — new patient shows "No allergies recorded — Add" / "No chronic conditions — Add" / "No vitals recorded" / "No prior prescriptions".
- [ ] **Mobile breakpoints** — at 375px, panel is an accordion above the form; sections collapsed by default; one expand at a time (or all expandable independently — match design intent).
- [ ] **Type check + lint clean** — `cd frontend && npm run typecheck && npm run lint` and same for backend.
- [ ] **Existing prescription flow regression** — create an Rx, save, send to patient (existing flow). No regression.
- [ ] **Update tracking** — mark T1.1–T1.6 as ✓ in [plan-ehr-implementation-batch.md](./plan-ehr-implementation-batch.md) Tier-1 table; tag `[SHIPPED YYYY-MM-DD]` on each item in [plan-t1-ehr-foundation.md](../../../Product%20plans/ehr/plan-t1-ehr-foundation.md).

---

## Suggested PR ordering (solo dev)

```
PR #1: migration only                          (Task 1)
PR #2: backend service + routes                (Task 2)
PR #3: frontend component family + types       (Task 3)
PR #4: appointment-detail mount                (Task 4) ← Tasks 4 + 5 + 6 land
PR #5: in-call mount                           (Task 5)    in any order after #3
PR #6: previous-Rx section                     (Task 6)
```

PRs #1–#3 are sequential (each builds on the last). PRs #4 / #5 / #6 can ship in any order after #3 — they touch different host files.

---

## Risks (per source plan §T1)

- Chart panel pushes Rx form too narrow on 1024px screens → mitigated by Task 4 step 4 (collapsible).
- Doctors don't fill chart context → mitigated by friendly empty-state CTAs; T6 (deferred) will eventually auto-suggest.
- Vitals captured during call get associated with wrong appointment → mitigated by master-batch decision 4 (chart-panel-entered vitals leave `appointment_id` NULL; in-call vitals carry the current appointment id).

---

**Owner:** TBD. **Created:** 2026-05-03. **Status:** Drafted, ready to start.
