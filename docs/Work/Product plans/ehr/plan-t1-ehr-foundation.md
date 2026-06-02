# Plan T1 — EHR foundation (chart context spine)

## Make every clinical interaction start with the patient's chart in view

> **Read-order:** [README.md](./README.md) → [plan-f01](./plan-f01-prescription-foundation-status.md) → [plan-00](./plan-00-ehr-roadmap.md) → **plan-t1 (this file)**.
>
> **Status:** `Drafted` 2026-05-03. Unblocked. Pre-approved by Decisions E1 / E2 / E6 in plan-00.
>
> **Effort:** ~3 dev-days for the 6 items.
>
> **Schema:** 1 migration adding 3 additive tables. Doctor-only RLS mirrors migration 026.

---

## Why this is T1 (and why nothing ships before it)

Today's prescription form is a 7-textarea blank canvas. The doctor types CC, HOPI, dx, plan, etc. — but they have **zero context** about who they're treating. They don't see:

- Allergies (did this patient already tell us last visit they're allergic to penicillin?)
- Chronic conditions (diabetic? hypertensive? pregnant?)
- Current medications (what are they already taking that I might interact with?)
- Recent vitals (BP trend? last weight?)
- Last 3 visits' Rx (what's been tried already?)

The doctor either re-asks the patient (annoying — patient feels like the doctor doesn't read the chart) or flies blind (dangerous). Every other tier above this needs the data this tier creates:

- **T2's "copy from last visit"** needs the previous-Rx surface T1.6 builds out.
- **T4's allergy-clash banner** needs `patient_allergies` from T1.1.
- **T5's vitals trends** need `patient_vitals` from T1.1.
- **T6's AI auto-draft** uses every chart-context surface T1 ships as input prompt context.

There is no shipping order in which T1 isn't first.

---

## Decisions LOCKED 2026-05-03

| ID | Decision | Implication |
|----|----------|-------------|
| **T1-D1** | **Patient-level data, NOT visit-level.** `patient_allergies` / `patient_chronic_conditions` / `patient_vitals` belong to the patient, not to a single appointment. | A patient seen by the same doctor 4 times has ONE allergies row updated across visits, not 4 disjoint rows. Vitals is the exception (history, one row per recording). |
| **T1-D2** | **Doctor-scoped, even though the data is patient-level.** Each row carries `doctor_id`. Same patient seen by Dr. A and Dr. B has TWO `patient_allergies` rows, one per doctor. | Privacy + RLS simplicity. Doctors don't share patient records cross-doctor in V1 (Decision E4 defers FHIR/ABDM). |
| **T1-D3** | **Soft delete via `archived_at`, not `DELETE`.** Doctors must be able to "remove" an entry without losing audit trail. | Schema includes `archived_at TIMESTAMPTZ NULL`; queries filter `WHERE archived_at IS NULL`. Mirrors `consultation_messages` doctrine. |
| **T1-D4** | **Chart panel is the LEFT column on `lg+`, a top-collapsed accordion on `<lg`.** Per Decision E2 / E6. | One responsive component, no separate mobile build. Item T1.3 owns the layout. |

---

## Items

### T1.1 — Schema: `patient_allergies`, `patient_chronic_conditions`, `patient_vitals`

**Status:** `Drafted`. **Effort:** 0.5 day. **Files to create / touch:**

- `backend/migrations/0XX_patient_chart_context.sql` (new — pick the next available number at commit time).

**Spec.** Three additive tables, all doctor-scoped per T1-D2, all soft-deletable per T1-D3, all RLS-fenced doctor-only per migration 026 §4. Indexes target the chart-panel hot path: `WHERE doctor_id = $1 AND patient_id = $2 AND archived_at IS NULL`.

```sql
-- ============================================================================
-- T1.1 — Patient chart context
-- ============================================================================
-- Migration: 0XX_patient_chart_context.sql
-- Description:
--   Three patient-level, doctor-scoped tables that back the <PatientChartPanel>
--   surface. All soft-deletable; all doctor-only RLS mirroring migration 026.
-- ============================================================================

-- Allergies ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_allergies (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id   UUID NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
    patient_id  UUID NOT NULL REFERENCES patients(id)       ON DELETE CASCADE,
    allergen    TEXT NOT NULL,                              -- free text in v1; T2 may canonicalize against drug_master
    severity    TEXT NOT NULL DEFAULT 'unknown' CHECK (
                  severity IN ('mild', 'moderate', 'severe', 'unknown')
                ),
    reaction    TEXT NULL,                                  -- e.g. "rash", "anaphylaxis"
    note        TEXT NULL,
    archived_at TIMESTAMPTZ NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_allergies_chart_lookup
  ON patient_allergies (doctor_id, patient_id)
  WHERE archived_at IS NULL;

-- Chronic conditions ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_chronic_conditions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id     UUID NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
    patient_id    UUID NOT NULL REFERENCES patients(id)     ON DELETE CASCADE,
    condition     TEXT NOT NULL,                            -- "Type 2 Diabetes", "Hypertension", etc.
    diagnosed_on  DATE NULL,                                -- doctor enters approx date if known
    note          TEXT NULL,
    archived_at   TIMESTAMPTZ NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_chronic_conditions_chart_lookup
  ON patient_chronic_conditions (doctor_id, patient_id)
  WHERE archived_at IS NULL;

-- Vitals (history; one row per recording) -----------------------------------
CREATE TABLE IF NOT EXISTS patient_vitals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    patient_id      UUID NOT NULL REFERENCES patients(id)   ON DELETE CASCADE,
    appointment_id  UUID NULL REFERENCES appointments(id)   ON DELETE SET NULL,
    -- core vitals (all nullable — doctor records what's available)
    bp_systolic     INTEGER  NULL CHECK (bp_systolic  BETWEEN 40 AND 300),
    bp_diastolic    INTEGER  NULL CHECK (bp_diastolic BETWEEN 20 AND 200),
    heart_rate      INTEGER  NULL CHECK (heart_rate   BETWEEN 20 AND 250),
    temperature_c   NUMERIC(4,1) NULL CHECK (temperature_c BETWEEN 30 AND 45),
    spo2            INTEGER  NULL CHECK (spo2 BETWEEN 50 AND 100),
    weight_kg       NUMERIC(5,2) NULL CHECK (weight_kg BETWEEN 0 AND 500),
    height_cm       NUMERIC(5,1) NULL CHECK (height_cm BETWEEN 0 AND 300),
    bmi             NUMERIC(4,1) NULL,                      -- generated client-side; persisted for trend convenience
    note            TEXT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at     TIMESTAMPTZ NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_vitals_chart_lookup
  ON patient_vitals (doctor_id, patient_id, recorded_at DESC)
  WHERE archived_at IS NULL;

-- RLS ------------------------------------------------------------------------
ALTER TABLE patient_allergies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_chronic_conditions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_vitals               ENABLE ROW LEVEL SECURITY;

-- Four CRUD policies per table; mirrors migration 026 §4 shape. Pattern only:
CREATE POLICY patient_allergies_select_own   ON patient_allergies            FOR SELECT USING (auth.uid() = doctor_id);
CREATE POLICY patient_allergies_insert_own   ON patient_allergies            FOR INSERT WITH CHECK (auth.uid() = doctor_id);
CREATE POLICY patient_allergies_update_own   ON patient_allergies            FOR UPDATE USING (auth.uid() = doctor_id) WITH CHECK (auth.uid() = doctor_id);
CREATE POLICY patient_allergies_delete_own   ON patient_allergies            FOR DELETE USING (auth.uid() = doctor_id);
-- (repeat the four-policy block for patient_chronic_conditions and patient_vitals)

-- updated_at triggers (use existing project convention; see migration 026)
```

**Acceptance.**

- Migration runs cleanly on a fresh DB and on the current dev DB (idempotent).
- Three tables exist with the columns above.
- Inserting / selecting from each table as `doctor_a` returns only `doctor_a`'s rows even when patient is shared.
- Indexes are present (verify with `\d+ patient_allergies` in psql).
- Soft-delete query pattern works: `UPDATE patient_allergies SET archived_at = now() WHERE id = $1` followed by SELECT excluding archived returns no rows.

---

### T1.2 — Backend service + routes

**Status:** `Drafted`. **Effort:** 0.5 day. **Files to create / touch:**

- `backend/src/services/patient-chart-service.ts` (new) — owns CRUD against the three T1.1 tables.
- `backend/src/controllers/patient-chart-controller.ts` (new) — REST handlers.
- `backend/src/routes/api/v1/patient-chart-routes.ts` (new) — route table.
- `backend/src/index.ts` — mount the new router under `/api/v1/patients/:patientId/chart`.

**Spec.** Three resource groups under `/api/v1/patients/:patientId/chart`: `allergies`, `conditions`, `vitals`. Each supports `GET /` (list non-archived), `POST /` (create), `PATCH /:id` (update incl. `archived_at`), `DELETE /:id` (hard delete; opt-in fallback only — soft delete is the norm). All authenticated as the doctor; service uses `req.user.id` for `doctor_id`. No service-role calls — RLS does the access control.

```ts
// backend/src/services/patient-chart-service.ts (sketch)
//
// All functions: take `doctorAuthClient: SupabaseClient` (the per-request
// client built from the doctor's JWT, NOT service-role). RLS enforces the
// `auth.uid() = doctor_id` filter — service code does NOT add it manually.

export async function listAllergies(client, patientId) {
  const { data, error } = await client
    .from('patient_allergies')
    .select('*')
    .eq('patient_id', patientId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listAllergies failed: ${error.message}`);
  return data ?? [];
}

export async function createAllergy(client, patientId, input) {
  const { data, error } = await client
    .from('patient_allergies')
    .insert({ ...input, patient_id: patientId })
    .select('*')
    .single();
  if (error) throw new Error(`createAllergy failed: ${error.message}`);
  return data;
}

// updateAllergy / archiveAllergy follow the same shape; PATCH /:id with
// { archived_at: 'now()' } is how soft-delete is exposed.

// Mirror these for patient_chronic_conditions and patient_vitals.
```

**Acceptance.**

- All three resource groups respond correctly to GET / POST / PATCH.
- `PATCH /allergies/:id` with body `{ archived_at: <ISO timestamp> }` soft-deletes and the row stops appearing in list.
- A different doctor's JWT cannot see / write rows belonging to the first doctor (RLS-enforced; verify with two test users).
- Body validation rejects out-of-range vitals values (e.g. `bp_systolic: 5000`) — the DB CHECK is the second line of defense.

---

### T1.3 — `<PatientChartPanel>` component (left rail desktop / accordion mobile)

**Status:** `Drafted`. **Effort:** 1 day. **Files to create / touch:**

- `frontend/components/ehr/PatientChartPanel.tsx` (new).
- `frontend/components/ehr/sections/AllergiesSection.tsx` (new).
- `frontend/components/ehr/sections/ChronicConditionsSection.tsx` (new).
- `frontend/components/ehr/sections/VitalsSection.tsx` (new).
- `frontend/components/ehr/sections/PreviousRxSection.tsx` (new — hosts T1.6).
- `frontend/lib/api/patient-chart.ts` (new) — typed client wrappers around the T1.2 routes.
- `frontend/types/patient-chart.ts` (new) — `PatientAllergy`, `PatientChronicCondition`, `PatientVitalsReading`.

**Spec.** A single component that takes `{ patientId, doctorId, layout }` props.

- `layout='desktop'` — fixed left rail at `w-80` (320px), full-height, inside the appointment-detail page's left column on `lg+`.
- `layout='mobile'` — top-collapsed accordion above the form, sections stacked.
- `layout='in-call'` — narrower (`w-64`), compact density, scrollable. (In-call surface from Decision E6.)

Internal structure: vertical stack of sections, each with title + add button + rows. Each section is an independent component so future tiers can swap implementations (T5 owns the sparkline upgrade in `<VitalsSection>`).

```tsx
// frontend/components/ehr/PatientChartPanel.tsx (skeleton)

interface Props {
  patientId: string;
  doctorId: string;
  layout?: 'desktop' | 'mobile' | 'in-call';
}

export function PatientChartPanel({ patientId, doctorId, layout = 'desktop' }: Props) {
  const isAccordion = layout === 'mobile';

  return (
    <aside
      className={
        layout === 'desktop' ? 'w-80 shrink-0 border-r border-gray-200 bg-white p-4 overflow-y-auto'
      : layout === 'in-call' ? 'w-64 shrink-0 border-r border-gray-200 bg-white p-3 overflow-y-auto text-sm'
      :                        'w-full bg-white border-b border-gray-200'
      }
    >
      <ChartHeader patientId={patientId} compact={layout !== 'desktop'} />
      <SectionWrapper title="Allergies" startCollapsed={isAccordion}>
        <AllergiesSection patientId={patientId} doctorId={doctorId} />
      </SectionWrapper>
      <SectionWrapper title="Chronic conditions" startCollapsed={isAccordion}>
        <ChronicConditionsSection patientId={patientId} doctorId={doctorId} />
      </SectionWrapper>
      <SectionWrapper title="Vitals" startCollapsed={isAccordion}>
        <VitalsSection patientId={patientId} doctorId={doctorId} layout={layout} />
      </SectionWrapper>
      <SectionWrapper title="Previous prescriptions" startCollapsed={isAccordion}>
        <PreviousRxSection patientId={patientId} doctorId={doctorId} />
      </SectionWrapper>
    </aside>
  );
}
```

**Acceptance.**

- Mounts cleanly in all three host surfaces (appointment-detail / in-call / post-call read-only).
- On `<lg`, sections are collapsed by default; tap to expand.
- Empty states render (no allergies → "No allergies recorded — Add" CTA).
- Add / archive flows update the section list optimistically + reconcile with server.
- Layout passes a manual responsive review at 375px / 768px / 1024px / 1440px.

---

### T1.4 — Mount `<PatientChartPanel>` in appointment-detail page

**Status:** `Drafted`. **Effort:** 0.25 day. **Files to touch:**

- `frontend/app/dashboard/appointments/[id]/page.tsx` — restructure layout.

**Spec.** Today the page is a single-column scroll. Restructure to a 12-column CSS grid on `lg+`:

```
| chart panel (3) | prescription form (6) | (T2/T3 actions panel — 3, optional later)|
```

On `<lg`, stack: chart panel accordion on top, then the form full-width.

```tsx
// frontend/app/dashboard/appointments/[id]/page.tsx (excerpt)
<div className="grid grid-cols-1 lg:grid-cols-12 gap-0 min-h-screen">
  <div className="lg:col-span-3 lg:border-r border-gray-200">
    <PatientChartPanel
      patientId={appointment.patient_id}
      doctorId={appointment.doctor_id}
      layout={isDesktop ? 'desktop' : 'mobile'}
    />
  </div>
  <div className="lg:col-span-9 p-6">
    {/* Existing <PrescriptionForm /> mounts here, unchanged */}
  </div>
</div>
```

**Acceptance.**

- The existing prescription form still works end-to-end (no regression).
- Chart panel is visible on left at `lg+`, accordion on top at `<lg`.
- Page does not jank on resize across the breakpoint.

---

### T1.5 — Mount `<PatientChartPanel>` in in-call quick-actions surface

**Status:** `Drafted`. **Effort:** 0.5 day. **Files to touch:**

- `frontend/components/consultation/InCallActionPanel.tsx` (and / or `InCallQuickActions.tsx` depending on which one hosts the prescription button content) — add a "Patient chart" tab/section beside the existing "Prescription" surface.

**Spec.** When the doctor opens quick actions during a call, they should see the chart panel (compact `layout='in-call'`) without losing the call tile. Two arrangements work; pick one based on which fits better:

- **(a) Side-by-side tabs:** "Patient chart" / "Prescription" toggle inside the action panel.
- **(b) Stacked:** Chart panel on top (collapsible), Rx form below.

Recommend (a) for in-call — more screen real estate goes to whichever is active, which matters during a 768px-wide laptop side panel.

**Acceptance.**

- Doctor can switch between chart and prescription mid-call.
- Chart edits made in-call persist after the call ends (no "in-call only" data — rows hit the database, RLS fenced).
- Compact layout reads cleanly at the in-call panel width (~360–440px usable).

---

### T1.6 — Previous-Rx history (last 3 visits, expandable)

**Status:** `Drafted`. **Effort:** 0.5 day. **Files to touch:**

- `frontend/components/ehr/sections/PreviousRxSection.tsx` (new from T1.3).
- `backend/src/services/prescription-service.ts` — add `listRecentPrescriptionsByPatient(patientId, limit=3)`. Returns `[{ id, appointment_id, created_at, provisional_diagnosis, medicine_count }]`. Lightweight — no full body, no attachments.
- `frontend/lib/api/prescription.ts` — typed wrapper.

**Spec.** Replaces today's "previous Rx" inline view in the appointment-detail page (which shows only the most recent and only on the appointment page). The chart panel section shows up to 3 prior Rx as collapsed cards; tapping one expands inline showing the full Rx (medicines + dx + plan). Tapping again collapses. Includes a "View all" link that opens a dedicated patient-history page (out of scope for T1; placeholder link).

```tsx
// PreviousRxSection.tsx (sketch)
const recent = useRecentPrescriptions(patientId, 3);

return (
  <div className="space-y-2">
    {recent.length === 0 && <EmptyState text="No prior prescriptions" />}
    {recent.map((rx) => (
      <PreviousRxCard
        key={rx.id}
        summary={rx}
        onExpand={() => setExpandedId(rx.id)}
        expanded={expandedId === rx.id}
      />
    ))}
    {recent.length === 3 && (
      <Link href={`/dashboard/patients/${patientId}/history`} className="text-xs text-blue-600">
        View all visits
      </Link>
    )}
  </div>
);
```

**Acceptance.**

- Most recent 3 prescriptions appear in the chart panel (newest first).
- Empty state for new patients works.
- Expand/collapse works smoothly without scroll-jump.
- T2.10 ("copy from last visit") will hook into the same data path — make sure the service returns `medicines[]` when needed (lazy load on expand is fine).

---

## Out of scope for T1

- Drug autocomplete on allergen entry — T2.7 will retro-canonicalize allergens against `drug_master` if the doctor opts in.
- Vitals trend sparklines — T5.21 owns this.
- Problem list aggregation view — T5.23 owns this.
- ICD-10 / SNOMED coding for chronic conditions — Decision E4 defers.
- Patient-side view of their own chart — not in V1.
- Multi-doctor sharing of chart context (Doctor A sees Doctor B's notes on shared patient) — Decision E4 defers.

---

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Chart panel pushes Rx form too narrow on 1024px screens | Make chart panel collapsible on desktop (keep state in localStorage). Per Q1 in plan-00 — default is "yes, collapsible". |
| Doctors don't fill chart context (no entries → no value) | T6 (deferred) will auto-suggest from chat / transcript. T1 itself adds a one-tap "Add allergy" / "Add condition" CTA in empty states; UI nudges only, no forced fields. |
| Chronic conditions become a dumping ground (free text "diabetes", "Type 2 diabetes", "T2DM") | Acceptable in V1 (Decision E4 defers ICD-10). T6 may canonicalize later. |
| Vitals captured during call get associated with wrong appointment | Schema requires explicit `appointment_id` (nullable). UI in T5 captures the current appointment context from URL / props; T1's vitals section in chart panel adds without `appointment_id` (patient-level entry). |

---

## Sequencing inside T1

```
T1.1 (schema)
  └→ T1.2 (backend)
       └→ T1.3 (component)
            ├→ T1.4 (mount in appointment-detail)
            ├→ T1.5 (mount in in-call panel)
            └→ T1.6 (previous-Rx section)
```

T1.4 / T1.5 / T1.6 can ship in parallel once T1.3 is in. T1.5 needs the in-call host components to expose a slot — verify before commit that `InCallActionPanel` has space for the new section.

---

**Created:** 2026-05-03. **Status:** `Drafted`. **Owner:** TBD.
