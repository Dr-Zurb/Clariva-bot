# Task pr-01: `/dashboard/patients-v2` route shells + ESLint zone + frontend type extensions

## 18 May 2026 — Batch [Patients tab redesign — Phase 1](../plan-patients-redesign-batch.md) — Wave 1, Lane α step 0 — **S, ~2h**

---

## Task overview

Land the scaffolding the rest of the batch builds on: the two new `app/` routes (`/dashboard/patients-v2/page.tsx` and `/dashboard/patients-v2/[id]/page.tsx`), the ESLint zone for `frontend/components/patients-v2/**`, and the type extensions in `frontend/types/patient.ts` that Wave 2's API surfaces and Wave 3–5's components consume. After this task ships, the two new routes render placeholder text under the existing dashboard chrome — no real data, no real components, just the auth + token mount pattern mirroring the v1 routes.

The Strangler Fig cutover (DL-1) requires that the v1 routes at `/dashboard/patients` and `/dashboard/patients/[id]` stay untouched throughout Waves 1–5; this task does not modify them. The v2 routes live alongside the v1 routes until Wave 6's flip.

**Estimated time:** ~2h (30min route scaffolding + 30min ESLint zone + 1h type extensions + verification).

**Status:** Pending.

**Hard deps:** None at the batch level. Stacks on `main` (or `feature/cockpit-v2-recursive-shell` if cv2-01 hasn't merged — the placeholder client islands don't import the shell yet, so either base works).

**Source:** [plan-patients-redesign-batch.md § Wave 1](../plan-patients-redesign-batch.md#wave-1--foundation-2-tasks-5h-single-sequential-lane) + DL-1, DL-7.

---

## Model & execution guidance

**Recommended model:** Auto. Route shells + ESLint zone + type extensions are bounded, well-precedented work. The v1 routes in `frontend/app/dashboard/patients/page.tsx` and `frontend/app/dashboard/patients/[id]/page.tsx` are the exact pattern to mirror (auth, token fetch, redirect on missing JWT).

**Per-message escalation rule:** Escalate the single message to Opus 4.7 only if the ESLint zone's `no-restricted-imports` config trips on a corner case (e.g. the existing config uses `overrides` in a way that conflicts with adding a new restricted-imports scope). The ppr-01 batch already established the pattern; this task replicates it.

**New chat?** Yes — fresh Auto chat. Pre-load:

- This task file.
- `frontend/app/dashboard/patients/page.tsx` (the v1 list route — pattern reference).
- `frontend/app/dashboard/patients/[id]/page.tsx` (the v1 detail route — pattern reference).
- `frontend/types/patient.ts` (the type module this task extends).
- `frontend/.eslintrc.json` (the existing zone config — match the pattern of any existing `no-restricted-imports` block).
- `frontend/components/patient-profile/Shell.tsx` (NOT modified; reference for the `PaneDefinition` import path so the type extensions resolve correctly).
- `frontend/lib/patient-profile/types.ts` (the `PaneDefinition` re-export the new types reference).
- Source plan §DL-1, §DL-7.

**Estimated turns:** 2–3 turns (1 routes + ESLint + 1 type extensions + 1 verification).

---

## Acceptance criteria

### Step 1 — Server Component route shells

- [ ] **New file** `frontend/app/dashboard/patients-v2/page.tsx`. Mirror the v1 list-route pattern: Server Component that fetches `user` + `session` from `@/lib/supabase/server`, redirects to `/login` if absent, then mounts `<PatientsV2Page token={token} />` (the client island, created in this task). No data fetch yet — that's pr-05/pr-07's job.
- [ ] **New file** `frontend/app/dashboard/patients-v2/[id]/page.tsx`. Mirror the v1 detail-route pattern: Server Component with `{ params: Promise<{ id: string }> }`, fetches user + session, redirects to `/login` if absent, fetches the patient via existing `getPatientById(id, token)`, handles 404 + 403 errors per the v1 pattern, then mounts `<PatientV2Page patient={patient} token={token} userId={user.id} />`.
- [ ] **New file** `frontend/components/patients-v2/PatientsV2Page.tsx`. Client component (`"use client"`). Renders a placeholder card with text "Patients v2 — coming soon (Wave 3 lights this up)." No imports from `@/components/patients/**`.
- [ ] **New file** `frontend/components/patients-v2/PatientV2Page.tsx`. Client component. Props: `{ patient: Patient; token: string; userId?: string }`. Renders a placeholder card with the patient's name + "Patient detail v2 — coming soon (Wave 4 lights this up)." No imports from `@/components/patients/**`.

### Step 2 — ESLint zone for `frontend/components/patients-v2/**`

- [ ] **Extend `frontend/.eslintrc.json`** (or `.eslintrc.cjs` — task identifies the actual file) with an `overrides` entry scoped to `frontend/components/patients-v2/**/*.{ts,tsx}`:

  ```json
  {
    "files": ["frontend/components/patients-v2/**/*.{ts,tsx}"],
    "rules": {
      "no-restricted-imports": [
        "error",
        {
          "patterns": [
            {
              "group": ["@/components/patients/*"],
              "message": "The v2 patients tree must not import from the legacy v1 tree, except for MergePatientsModal (use @/components/patients/MergePatientsModal explicitly until pr-14 moves it). Build the v2 component inside frontend/components/patients-v2/."
            },
            {
              "group": ["**/ResizablePanelGroup", "@/components/ui/resizable"],
              "message": "Direct use of <ResizablePanelGroup> is forbidden outside the patient-profile Shell. Mount <PatientProfileShell> with a PaneDefinition[] instead. See cv2-01's ESLint rule."
            }
          ],
          "paths": []
        }
      ]
    }
  }
  ```

  If the existing eslintrc uses a different format (e.g. flat config in `eslint.config.mjs`), translate the pattern accordingly — keep the message strings intact.

- [ ] **The legacy `MergePatientsModal` exception** must be explicit: the rule allows `@/components/patients/MergePatientsModal` exactly (pr-08 imports it as-is; pr-14 moves the file to `frontend/components/patients-v2/MergePatientsModal.tsx` and the exception goes away). Achieve this via a sub-pattern allow-list in the rule config OR via a per-file `// eslint-disable-next-line no-restricted-imports` comment in pr-08's file (task picks the cleaner approach).

- [ ] **Verify the zone fires.** Create a temporary file `frontend/components/patients-v2/__lint-test__.tsx` with an import from `@/components/patients/PatientCockpit`; run `pnpm --filter frontend lint frontend/components/patients-v2/__lint-test__.tsx`; expect an error message containing "The v2 patients tree must not import…". Delete the temp file.

### Step 3 — Type extensions in `frontend/types/patient.ts`

The new types are surfaces the rest of the batch consumes. They're listed here exhaustively so pr-02 / pr-03 / pr-04 / Wave 3 / Wave 5 can import without inventing names.

- [ ] **Add** the segment id union:

  ```ts
  /**
   * Filterable segments on the v2 patients list (DL-4 / DL-6).
   * Server-computed; clients pass the literal in `?segment=`.
   */
  export type PatientSegmentId =
    | 'active-90d'           // last_appointment_date >= now() - 90d
    | 'new-30d'              // created_at >= now() - 30d
    | 'at-risk-followup'     // any prescription with follow_up_value indicating a date in the past AND no subsequent visit
    | 'no-show-prone'        // appointments where status = 'no_show' >= 2 of last 4
    | 'has-allergies'        // patient_allergies row exists with archived_at IS NULL
    | 'has-open-episodes'    // patient_problem_list_v row exists with source = 'episode' AND episode_status IS NOT 'closed'
    | 'untagged';            // patient_tag IS NULL OR ''
  ```

- [ ] **Add** the sort id union:

  ```ts
  export type PatientListSortId =
    | 'last-visit-desc'
    | 'last-visit-asc'
    | 'created-at-desc'
    | 'created-at-asc'
    | 'name-asc';
  ```

- [ ] **Add** the filters envelope:

  ```ts
  /** Query params accepted by `GET /api/v1/patients` (DL-4). */
  export interface PatientListFilters {
    q?: string;                // free-text; matches name / phone / MRN / IG handle (case-insensitive substring)
    segment?: PatientSegmentId;
    sort?: PatientListSortId;
    page?: number;             // 1-indexed
    pageSize?: number;         // default 50, max 200
  }

  /** Response shape from `GET /api/v1/patients`. Extends the v1 shape with pagination metadata. */
  export interface PatientsListPagedData {
    patients: PatientSummary[];
    total: number;
    page: number;
    pageSize: number;
  }
  ```

- [ ] **Add** the saved-view shape (DL-9):

  ```ts
  /**
   * Doctor-scoped saved view for the patients list.
   * Persisted via `doctor_cockpit_layout_presets` with `kind = 'patients_list_view'`.
   */
  export interface PatientSavedView {
    id: string;
    name: string;
    is_default: boolean;
    filters: PatientListFilters;
    columns?: string[];        // optional visible-column list (when omitted, defaults apply)
    created_at: string;
    updated_at: string;
  }
  ```

- [ ] **Add** the overview-aggregator response shape (DL-5). Mirror the shape defined in the source plan exactly — pr-03 will return this shape verbatim:

  ```ts
  export interface PatientOverviewSnapshot {
    blood_group: string | null;
    height_cm: number | null;
    weight_kg: number | null;
    bmi: number | null;
    preferred_language: string | null;
  }

  export interface PatientCurrentMedication {
    drug_name: string;
    dose: string | null;
    frequency: string | null;
    prescribed_at: string;
    prescriber_doctor_id: string;
    still_taking: boolean | null;
  }

  export interface PatientVitalsTrendPoint {
    recorded_at: string;
    value: number;
  }

  export interface PatientVitalsTrends {
    bp_systolic: PatientVitalsTrendPoint[];
    bp_diastolic: PatientVitalsTrendPoint[];
    heart_rate: PatientVitalsTrendPoint[];
    spo2: PatientVitalsTrendPoint[];
    weight_kg: PatientVitalsTrendPoint[];
    bmi: PatientVitalsTrendPoint[];
  }

  export type PatientActivityKind =
    | 'visit'
    | 'message'
    | 'prescription'
    | 'payment'
    | 'no_show'
    | 'file_upload';

  export interface PatientActivityRow {
    kind: PatientActivityKind;
    occurred_at: string;
    summary: string;
    href: string | null;
  }

  export interface PatientCarePlan {
    next_step: string | null;
    overdue: string[];
    rationale: string[];
  }

  export type PatientRiskFlagSeverity = 'info' | 'warning' | 'danger';

  export interface PatientRiskFlag {
    code: string;              // machine-readable identifier (e.g. 'BP_TREND_RISING')
    label: string;             // human-readable explanation
    severity: PatientRiskFlagSeverity;
  }

  export interface PatientSixVisitStripEntry {
    appointment_id: string;
    occurred_at: string;
    status: import('./appointment').AppointmentStatus;
    modality: import('./appointment').ConsultationModality;
    chief_complaint: string | null;
  }

  /** DL-5 — `GET /api/v1/patients/:id/overview` response payload. */
  export interface PatientOverviewData {
    patient: Patient;
    snapshot: PatientOverviewSnapshot;
    active_problems: import('./patient-chart').ProblemListItem[];
    allergies: import('./patient-chart').PatientAllergy[];
    chronic_conditions: import('./patient-chart').PatientChronicCondition[];
    current_medications: PatientCurrentMedication[];
    vitals_trends: PatientVitalsTrends;
    recent_activity: PatientActivityRow[];
    care_plan: PatientCarePlan | null;
    risk_flags: PatientRiskFlag[];
    six_visit_strip: PatientSixVisitStripEntry[];
  }

  /** DL-6 — `GET /api/v1/patients/kpis` response payload. */
  export interface PatientsKpis {
    active_90d: { count: number; delta_7d: number };
    new_30d: { count: number; delta_7d: number };
    followup_overdue: { count: number; delta_7d: number };
    open_episodes: { count: number; delta_7d: number };
    possible_duplicates: { count: number; delta_7d: number };
    /** Server-computed cache window in seconds (DL-6 = 60). */
    cache_ttl_seconds: number;
  }
  ```

- [ ] **Preserve** all existing type exports (`Patient`, `PatientSummary`, `DuplicateGroupPatient`, `PatientsListData`, `PossibleDuplicatesData`, `ConsentStatus`, `PatientDetailData`). No order change in the file's existing block.

### Step 4 — Verification (deterministic)

- [ ] `pnpm --filter frontend tsc --noEmit` clean. Every existing consumer of `Patient` / `PatientSummary` still compiles; the new types are exported but not yet imported (pr-04 onwards consumes them).
- [ ] `pnpm --filter frontend lint` clean. The new ESLint zone applies but no real v2 component imports anything banned yet.
- [ ] Navigate to `/dashboard/patients-v2` (logged in) — placeholder card renders, dashboard chrome around it.
- [ ] Navigate to `/dashboard/patients-v2/<known-patient-id>` (logged in) — placeholder card with the patient's name renders. 404 on a bad id. 403 on a patient belonging to a different doctor.
- [ ] Navigate to `/dashboard/patients` (the v1 route) — renders identically to pre-batch. No regression.
- [ ] `rg "@/components/patients-v2" frontend/app/dashboard/patients` returns zero (the v1 routes do not depend on the v2 tree).

---

## Out of scope

- **Any list or detail UI** — pr-05/pr-06/pr-07 light up the list; pr-09 lights up the detail shell.
- **Any API client wrappers** — pr-04 owns `frontend/lib/api/patients.ts`.
- **Any backend changes** — pr-02 + pr-03 own the backend side.
- **Renaming or modifying the v1 routes** — DL-1 keeps them live through Wave 5.
- **Moving `MergePatientsModal`** — pr-14 moves it during the v1 sweep.

---

## Files expected to touch

**New:**

- `frontend/app/dashboard/patients-v2/page.tsx` (~30 LOC — list route Server Component).
- `frontend/app/dashboard/patients-v2/[id]/page.tsx` (~60 LOC — detail route Server Component with the v1 error-handling pattern).
- `frontend/components/patients-v2/PatientsV2Page.tsx` (~15 LOC — placeholder client island).
- `frontend/components/patients-v2/PatientV2Page.tsx` (~25 LOC — placeholder client island).

**Modified:**

- `frontend/.eslintrc.json` (or the actual eslintrc filename — ~25 LOC delta — new override block for the v2 zone).
- `frontend/types/patient.ts` (~120 LOC delta — Step 3's type additions).

**Read but do not modify in this task:**

- `frontend/app/dashboard/patients/page.tsx` (precedent pattern).
- `frontend/app/dashboard/patients/[id]/page.tsx` (precedent pattern).
- `frontend/components/patient-profile/Shell.tsx` (referenced via import path validation).

**Tests:** None. The route shells are too thin to warrant unit tests; the ESLint zone verification is the manual step above.

---

## Notes / open decisions

1. **Why are the v2 routes Server Components even though the islands are `"use client"`?** Mirrors the v1 pattern. Auth + token fetch belongs server-side; client islands take props. This task ships the same shape so pr-05 / pr-09 can drop into the existing pattern without refactoring.

2. **Why the ESLint zone now, not in pr-09?** The zone protects every file added in Waves 1–5. If we add it later, intermediate tasks could accidentally import from the v1 tree (e.g. reusing the v1 `PatientCockpitRail` in pr-07's table quick-peek) and we wouldn't catch it until the cutover. Cheaper to enforce from t=0.

3. **Why pre-declare every type the batch needs?** Two reasons. (a) pr-02 / pr-03 can ship their backend shapes against typed contracts the frontend can validate. (b) It moves the type-decision conversation into one task (this one) rather than spreading it across the batch, which keeps the type surface internally consistent.

4. **Could the saved-view shape diverge from cc-08's `cockpit_layout_preset`?** cc-08's table has columns `id, doctor_id, name, layout_json JSONB, is_default, created_at, updated_at`. If `kind` doesn't exist yet, pr-06 adds it as a column via a single XS migration (the task spec for pr-06 explicitly does the discovery `rg`). The `PatientSavedView` type in this task already presumes the column exists — pr-06 will reconcile.

5. **Why `import('./appointment')` syntax for `AppointmentStatus` instead of a top-level `import`?** Cyclic-import avoidance — `./appointment` already imports from `./patient` indirectly via `consultation_session`. Inline `import()` types break the cycle at the type level without runtime cost.

---

## References

- **Affected files:** see "Files expected to touch" above.
- **Source decisions:** [plan-patients-redesign-batch.md § DL-1 (Strangler Fig)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration), [§DL-5 (Overview aggregator shape)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration), [§DL-6 (KPIs)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration), [§DL-9 (Saved views)](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration).
- **Wave gate:** [`EXECUTION-ORDER-patients-redesign.md` § Wave 1 gate](./EXECUTION-ORDER-patients-redesign.md#wave-1-gate-after-pr-01--pr-02).
- **Precedent batch:** [`Daily-plans/May 2026/13-05-2026/patient-profile-shell-rebuild/Tasks/task-ppr-01-new-route-and-page-shell.md`](../../../13-05-2026/patient-profile-shell-rebuild/Tasks/task-ppr-01-new-route-and-page-shell.md) — same shape of route shell + ESLint zone work.
- **Next task:** [`task-pr-02-list-endpoint-server-side-filters.md`](./task-pr-02-list-endpoint-server-side-filters.md) — Wave 1, Lane α step 1. Consumes the types this task ships.

---

**Owner:** TBD
**Created:** 2026-05-18
**Status:** Pending
