# Sub-batch D — Vitals & trends (T5) — execution checklist

## Vitals capture + sparklines + episode linkage + problem list

> **Source plan:** [plan-t5-ehr-vitals-trends.md](../../../Product%20plans/ehr/plan-t5-ehr-vitals-trends.md).
>
> **Master batch:** [plan-ehr-implementation-batch.md](./plan-ehr-implementation-batch.md).
>
> **Status:** `Drafted` — start AFTER Sub-batch A merges. Independent of B1 / B2 / C; can run in parallel with C if a 2nd dev is free, OR ship after C in solo mode.
>
> **Effort:** ~2 dev-days. **Items:** 4. **Migrations:** 1 column add + 1 view.
>
> **Hard prerequisite:** Sub-batch A complete (`patient_vitals` table exists; `<VitalsSection>` placeholder mounted).

---

## Pre-batch checklist

- [ ] Sub-batch A merged (provides `patient_vitals` schema + `<VitalsSection>` placeholder + `<ChronicConditionsSection>` for problem-list aggregation).
- [ ] Decisions 24–29 in [§ Cross-cutting decisions / Before Sub-batch D starts](./plan-ehr-implementation-batch.md#before-sub-batch-d-starts) of the master batch confirmed.
- [ ] Verify `care_episodes` table exists (it does — migration 036). Confirm `appointments.episode_id` is populated for at least some test data so T5.24 backfill has something to migrate.
- [ ] Pick the next available migration numbers for the 2 migrations (column add + view).

---

## Task 1 — `<VitalsCapture>` widget + `<VitalSparkline>` (T5.22) — impl 2026-05-05

**Effort:** 0.75 day · **Source:** [T5 §T5.22](../../../Product%20plans/ehr/plan-t5-ehr-vitals-trends.md)

**Status:** ✅ impl 2026-05-05 — frontend-only; ready to smoke-test live. Files added: `frontend/components/ehr/VitalSparkline.tsx`, `frontend/components/ehr/VitalsCapture.tsx`, `frontend/lib/api/patient-chart.ts`. Files modified: `frontend/components/ehr/sections/VitalsSection.tsx` (placeholder replaced).

### Steps

1. Create `frontend/components/ehr/VitalSparkline.tsx` (pure SVG, ~30 lines per source-plan §T5.22 sketch):
   - Props: `{ values: number[]; width?: number; height?: number; normalRange?: [number, number] }`.
   - Renders only when `values.length >= 2` (master-batch decision 24).
   - Optional shaded "normal range" band behind the line.
   - Trailing dot at the latest value.
2. Create `frontend/components/ehr/VitalsCapture.tsx`:
   - Layout: bottom-sheet on mobile (`<lg`), side-modal on desktop (`lg+`). Use existing `<BottomSheet>` / `<SidePanel>` primitives if present; else introduce minimal versions.
   - Fields (all optional): BP systolic/diastolic, HR, Temp °C, SpO₂ %, Weight kg, Height cm, Note.
   - BMI auto-computed client-side from weight + height; displayed live; saved with the row (per master-batch decision 26).
   - Validation: number-only inputs; CHECK ranges enforced server-side too.
   - On save: POST to `/api/v1/patients/<id>/chart/vitals` with the populated subset; close on success.
   - `appointment_id` propagation per master-batch decision 4: passes the current appointment id when invoked from in-call surface; passes `null` when invoked from chart panel on the appointment-detail page (patient-level entry).
3. Replace the placeholder `<VitalsSection>` from Sub-batch A with the real implementation:
   - Top: latest reading row (e.g. `120/80 mmHg · 72 bpm · 37.0°C · 98% SpO₂   recorded 2 days ago`).
   - Below: per-vital rows with `latest value | sparkline | reading count`.
   - Sparklines render only with ≥2 readings; otherwise show "(1 reading)" or nothing.
   - "+ Add reading" CTA at bottom opens `<VitalsCapture>`.
4. Reference ranges (per master-batch decision 27, V1 fixed):
   - BP: 90–120 / 60–80 mmHg
   - HR: 60–100 bpm
   - Temp: 36.5–37.5 °C
   - SpO₂: 95–100 %
   - BMI: 18.5–25
5. Add `frontend/lib/api/patient-chart.ts` extension: `listVitalsHistory(patientId, limit = 20)` returning chronological readings.

### Done when

- Doctor can record vitals from chart panel + in-call panel without losing the call tile.
- Sparklines appear once a vital has ≥2 readings.
- BMI auto-computes correctly (e.g. weight 70kg + height 170cm → 24.2).
- Reading list reflects new entries immediately (optimistic update + reconcile).
- Empty state when no vitals recorded ("No vitals recorded — Add reading").
- Mobile UX: bottom-sheet covers ≥80% viewport height; touch targets ≥44px.

### Suggested PR

**PR #1 — Vitals capture + sparklines + section upgrade.**

---

## Task 2 — `<VitalTrendModal>` (T5.23) — impl 2026-05-05

**Effort:** 0.5 day · **Source:** [T5 §T5.23](../../../Product%20plans/ehr/plan-t5-ehr-vitals-trends.md)

**Status:** ✅ impl 2026-05-05 — frontend-only; ready to smoke-test live. Files added: `frontend/components/ehr/VitalTrendModal.tsx`. Files modified: `frontend/components/ehr/sections/VitalsSection.tsx` (sparkline rows wired to trend modal tap target; `VitalTrendModal` mounted).

### Steps

1. Create `frontend/components/ehr/VitalTrendModal.tsx`. Modal opens when a sparkline is tapped in `<VitalsSection>`.
2. Implementation choice: minimal SVG line chart (same approach as sparkline, scaled up). If `recharts` is already in `package.json`, use it (verify before committing); otherwise build the SVG.
3. Time window: last 90 days, OR all readings if fewer (master-batch decision 25). Pill row at top of modal lets user switch to "last year" / "all time".
4. BP shows both systolic + diastolic on one chart (two lines, color-coded).
5. Reference range bands shaded (per Task 1 step 4).
6. Tap on a data point shows recorded date + note (if any).
7. "Recent readings" list below the chart, scrollable.
8. Modal close button + Esc-to-close.

### Done when

- Modal shows last 90 days minimum, or all readings if fewer.
- BP renders both lines on one chart.
- Tap on a data point shows date + note.
- Modal works at mobile widths (chart shrinks; readings list scrolls).
- Closes cleanly back to chart panel.

### Suggested PR

**PR #2 — Vital trend modal.** Depends on PR #1.

---

## Task 3 — `prescriptions.episode_id` additive FK + backfill (T5.24)

**Effort:** 0.25 day · **Source:** [T5 §T5.24](../../../Product%20plans/ehr/plan-t5-ehr-vitals-trends.md)

### Steps

1. Create `backend/migrations/0XX_prescriptions_episode_link.sql` per source-plan SQL block:
   ```sql
   ALTER TABLE prescriptions
     ADD COLUMN episode_id UUID NULL REFERENCES care_episodes(id) ON DELETE SET NULL;
   CREATE INDEX IF NOT EXISTS idx_prescriptions_episode
     ON prescriptions (episode_id, created_at DESC) WHERE episode_id IS NOT NULL;
   ```
2. **Same migration file** runs the backfill (per master-batch decision 29):
   ```sql
   UPDATE prescriptions p
   SET    episode_id = a.episode_id
   FROM   appointments a
   WHERE  p.appointment_id = a.id
     AND  p.episode_id IS NULL
     AND  a.episode_id IS NOT NULL;
   ```
3. Modify `backend/src/services/prescription-service.ts`:
   - In `createPrescription` and `updatePrescription`, populate `episode_id` from the parent appointment's `episode_id` automatically.
   - In `getLastPrescriptionInEpisode` (added by B1 / T2.14 — ensure that query uses `prescriptions.episode_id` directly now instead of joining through appointments).

### Done when

- Migration runs cleanly; backfill populates rows correctly.
- Verify post-deploy: `SELECT COUNT(*) FROM prescriptions WHERE episode_id IS NULL AND appointment_id IN (SELECT id FROM appointments WHERE episode_id IS NOT NULL)` returns **0**.
- New Rx created against an appointment with `episode_id` automatically gets the same `episode_id`.
- Legacy / orphan Rx with NULL `episode_id` continue to work (no NOT NULL constraint).
- T2.14's "copy from last visit" still works — verify after backfill.

### Suggested PR

**PR #3 — Episode link migration + backfill + service auto-populate.**

---

## Task 4 — Problem list view + section (T5.25) — impl 2026-05-05

**Effort:** 0.5 day · **Source:** [T5 §T5.25](../../../Product%20plans/ehr/plan-t5-ehr-vitals-trends.md)

**Status:** ✅ impl 2026-05-05 — migration + backend + frontend shipped. Files added: `backend/migrations/096_patient_problem_list_view.sql`, `frontend/components/ehr/sections/ProblemListSection.tsx`. Files modified: `backend/src/types/patient-chart.ts` (ProblemListItem + ProblemSource types), `backend/src/services/patient-chart-service.ts` (getProblemList), `backend/src/controllers/patient-chart-controller.ts` (listProblemsHandler), `backend/src/routes/api/v1/patient-chart-routes.ts` (GET /problems), `frontend/types/patient-chart.ts` (ProblemListItem + ProblemsListData), `frontend/lib/api/patient-chart.ts` (listPatientProblems), `frontend/components/ehr/PatientChartPanel.tsx` (Problem list section mounted between Chronic conditions and Vitals).

### Steps

1. Create `backend/migrations/0XX_patient_problem_list_view.sql` per source-plan SQL block. View `patient_problem_list_v` UNIONs:
   - `chronic` (from `patient_chronic_conditions WHERE archived_at IS NULL`)
   - `episodes` (from `care_episodes WHERE status = 'active'`)
   - `recurring` (diagnoses appearing ≥2 times in last 6 months in `prescriptions`, grouped by `LOWER(TRIM(provisional_diagnosis))` per master-batch decision 28)
2. View inherits RLS from base tables; no separate policy needed (verify by querying as `doctor_b` against `doctor_a`'s rows — should return empty).
3. Add `getProblemList(client, patientId)` in `backend/src/services/patient-chart-service.ts` selecting from the view.
4. Expose via `GET /api/v1/patients/:patientId/chart/problems` in `patient-chart-controller.ts`.
5. Create `frontend/components/ehr/sections/ProblemListSection.tsx`. Layout per source-plan sketch:
   ```
   Problem list
     🩺  Type 2 Diabetes                 since 2022-03
     🩺  Hypertension                     since 2024-08
     📋  Acne (recurring)                  diagnosed 4× in last 6mo
     🔄  Acne consultation episode         active · 2/3 follow-ups used
   ```
   Icon picks: `🩺` chronic / `📋` recurring / `🔄` active episode.
6. Add the new section to `<PatientChartPanel>` between `<ChronicConditionsSection>` and `<VitalsSection>` (or wherever it reads best with the existing sections).
7. Empty state: "No active problems recorded".
8. Lazy-load the problem list when the section is expanded (mobile accordion); pre-load on desktop.

### Done when

- View runs in <50ms p95 for a patient with 100 prescriptions (verify with a seeded test patient or `EXPLAIN ANALYZE`).
- Problem list populates correctly with mixed sources (chronic + episode + recurring).
- Recurring-diagnosis grouping is case-insensitive (TRIM + LOWER works — verify with mixed-case test data).
- Empty state for new patients.
- T6.30 (deferred) can later read this view as input — confirm the view shape doesn't change.

### Suggested PR

**PR #4 — Problem list view + service + section.** Depends on T1.3 (`<PatientChartPanel>`).

---

## Post-batch validation

Once Tasks 1–4 are merged:

- [ ] **All 4 source-plan acceptance criteria** pass.
- [ ] **Vitals capture E2E**: doctor opens chart panel → "+Add reading" → records BP 130/85 → row appears at top → sparkline NOT yet visible (only 1 reading).
- [ ] **Sparkline appears at ≥2 readings**: record a 2nd BP reading → sparkline appears in section header.
- [ ] **In-call vitals capture**: open in-call panel → "Patient chart" tab → record vitals → entry has `appointment_id = <current appt>`. Open chart panel from appointment-detail (different appointment same patient) → record vitals → entry has `appointment_id = NULL` (patient-level).
- [ ] **Trend modal**: tap sparkline → modal opens with full chart + readings list.
- [ ] **Episode FK**: pick an existing follow-up Rx attached to an appointment with `episode_id` → verify `prescriptions.episode_id` is populated post-migration.
- [ ] **Problem list E2E**: seed test patient with 2 chronic conditions, 1 active episode, and 3 prescriptions with same diagnosis "Acne" in last 60 days → problem list shows all 4 entries (2 chronic + 1 episode + 1 recurring "Acne (3×)").
- [ ] **Cross-doctor RLS**: verify `doctor_b` querying problem list for shared patient sees only their own rows (RLS inherited from base tables).
- [ ] **Type check + lint clean** for both backend + frontend.
- [ ] **Migration rollback** practiced on scratch DB.
- [ ] **Update tracking** — mark T5.22–T5.25 as ✓ in [plan-ehr-implementation-batch.md](./plan-ehr-implementation-batch.md); tag `[SHIPPED YYYY-MM-DD]` on each item in [plan-t5-ehr-vitals-trends.md](../../../Product%20plans/ehr/plan-t5-ehr-vitals-trends.md).

---

## Suggested PR ordering (solo dev)

```
PR #1: vitals capture + sparklines + section       (Task 1)
PR #2: vital trend modal                           (Task 2)  ← needs #1
PR #3: episode FK migration + backfill + service   (Task 3)  ← independent; can ship anytime
PR #4: problem list view + section                 (Task 4)  ← needs T1.3
```

PRs #1 / #3 / #4 are independent of each other (PR #2 only depends on #1). 2-dev parallel: #1+#2 on track 1, #3+#4 on track 2.

---

## Risks (per source plan §T5)

- Vitals widget feels heavy mid-call → all-fields-optional; doctor enters 1 field and saves.
- Problem list view becomes slow at scale → indexes on `prescriptions(doctor_id, patient_id, created_at)` already exist; can materialize in T5-v2 if needed.
- Recurring-diagnosis bucketing fooled by typos → case-insensitive grouping reduces noise; real fix is structured diagnosis coding (deferred to E4).
- Sparklines misleading with sparse data → ≥2 points threshold; trend modal shows full data.
- Episode FK backfill misses rows → post-deploy verification SQL returns 0 NULL count for episode-bearing appointments.

---

**Owner:** TBD. **Created:** 2026-05-03. **Status:** Drafted; start after Sub-batch A merges.
