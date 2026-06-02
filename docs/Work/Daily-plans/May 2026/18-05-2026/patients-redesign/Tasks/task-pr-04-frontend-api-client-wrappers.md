# Task pr-04: Frontend API client wrappers for the patients-v2 endpoints

## 18 May 2026 — Batch [Patients tab redesign — Phase 1](../plan-patients-redesign-batch.md) — Wave 2, Lane α step 1 — **XS, ~1h**

---

## Task overview

Add typed `fetch` wrappers for the new endpoints pr-02 and pr-03 ship so that Waves 3–5 import a clean surface from `frontend/lib/api/patients.ts` instead of writing inline `fetch` calls. Standard pattern matching the rest of `frontend/lib/api/**` — auth header from token, JSON parse, narrow error envelope, typed return.

This task is XS (~1h). It only ships the client wrappers; the components that consume them are Waves 3–5.

**Estimated time:** ~1h (15min file scaffolding + 30min six functions + 15min verification).

**Status:** Done.

**Hard deps:** pr-01 (the response shape types), pr-02 (the list endpoint params shape), pr-03 (the overview + KPIs endpoint shapes).

**Source:** [plan-patients-redesign-batch.md § Wave 2](../plan-patients-redesign-batch.md#wave-2--backend-aggregator--frontend-client-wrappers-2-tasks-5h-single-sequential-lane) + DL-4, DL-5, DL-6, DL-9.

---

## Model & execution guidance

**Recommended model:** Auto. Six thin `fetch` wrappers. Composer 2 would also work; Auto matches the rest of Wave 2.

**Per-message escalation rule:** N/A — task is bounded.

**New chat?** Yes — fresh Auto chat. Pre-load:

- This task file.
- `frontend/lib/api/index.ts` (the existing API client surface — pattern for how `getPatients` is currently exported).
- `frontend/lib/api/patient-chart.ts` (closest precedent — multiple wrappers for a single resource family).
- `frontend/lib/api/prescriptions.ts` (another precedent for resource-scoped client files).
- `frontend/types/patient.ts` (post-pr-01 — the shapes this task imports).
- Source plan §DL-4 / §DL-5 / §DL-6 / §DL-9.

**Estimated turns:** 1–2 turns.

---

## Acceptance criteria

### Step 1 — New file `frontend/lib/api/patients.ts`

- [x] **Imports**:

  ```ts
  import type {
    PatientListFilters,
    PatientsListPagedData,
    PatientOverviewData,
    PatientsKpis,
    PatientSavedView,
  } from '@/types/patient';
  ```

- [x] **`getPatientsList(token, filters)`** — converts `filters` to query params (skipping `undefined`), calls `GET /api/v1/patients?…`. Returns `PatientsListPagedData`.

  ```ts
  export async function getPatientsList(
    token: string,
    filters: PatientListFilters = {},
  ): Promise<PatientsListPagedData> {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.segment) params.set('segment', filters.segment);
    if (filters.sort) params.set('sort', filters.sort);
    if (filters.page !== undefined) params.set('page', String(filters.page));
    if (filters.pageSize !== undefined) params.set('pageSize', String(filters.pageSize));
    const qs = params.toString();
    const res = await fetch(`${API_BASE_URL}/api/v1/patients${qs ? '?' + qs : ''}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw await toApiError(res, 'Failed to load patients');
    const json = await res.json();
    return json.data as PatientsListPagedData;
  }
  ```

  (Reuse the `API_BASE_URL` + `toApiError` helpers from `frontend/lib/api/index.ts` — if they're not yet extracted, the task does the extraction as a 5-LOC change.)

- [x] **`getPatientOverview(token, patientId, options?)`** — calls `GET /api/v1/patients/:id/overview`. Optional `{ windowDays?: number }` query param for pr-12's Vitals tab (the longer-window fetch). Returns `PatientOverviewData`.

  ```ts
  export async function getPatientOverview(
    token: string,
    patientId: string,
    options: { windowDays?: number } = {},
  ): Promise<PatientOverviewData> { /* ... */ }
  ```

- [x] **`getPatientsKpis(token)`** — calls `GET /api/v1/patients/kpis`. Returns `PatientsKpis`. Honour the server's `Cache-Control: max-age=60` (the browser cache does this automatically; the wrapper doesn't add `cache: 'no-store'`).

- [x] **`getPatientSavedViews(token)`** — calls `GET /api/v1/doctor/cockpit-layout-presets?kind=patients_list_view` (reuses the existing cc-08 endpoint with a kind filter — if cc-08 doesn't accept `?kind=`, this task is the smallest possible upstream extension: add the filter as a 5-LOC change in `backend/src/controllers/doctor-settings-controller.ts`). Returns `PatientSavedView[]`.

- [x] **`upsertPatientSavedView(token, view)`** — calls `POST /api/v1/doctor/cockpit-layout-presets` (or `PUT` if `view.id` is set). Body is the cc-08 preset shape with `kind: 'patients_list_view'` discriminator + the `layout_json` populated from `view.filters` + `view.columns`. Returns the persisted `PatientSavedView`.

- [x] **`deletePatientSavedView(token, id)`** — calls `DELETE /api/v1/doctor/cockpit-layout-presets/:id`. Returns `void`. Throws on non-2xx.

### Step 2 — Re-export from the public surface

- [x] **In `frontend/lib/api/index.ts`** add the re-export (skipped — codebase imports per-file, e.g. `@/lib/api/patient-chart`):

  ```ts
  export {
    getPatientsList,
    getPatientOverview,
    getPatientsKpis,
    getPatientSavedViews,
    upsertPatientSavedView,
    deletePatientSavedView,
  } from './patients';
  ```

  (Or — if the project pattern is to import per-file from `@/lib/api/patients` rather than the barrel — skip this step. The task picks based on what the rest of the codebase does. `rg "from \"@/lib/api\"" frontend | head -20` reveals which.)

### Step 3 — Verification

- [x] `pnpm --filter frontend tsc --noEmit` clean (`npx tsc --noEmit` in `frontend/`).
- [x] `pnpm --filter frontend lint` clean (`npm run lint` — pre-existing warnings only).
- [x] Pre-existing callers of `getPatients` in `frontend/app/dashboard/patients/page.tsx` still resolve (the v1 helper stays in `frontend/lib/api.ts` unchanged).
- [ ] In the browser DevTools (with the dev server running and a doctor logged in), in the console: `import('/lib/api/patients').then(m => m.getPatientsList(token, { q: 'sm', segment: 'active-90d' }).then(console.log))` — returns the paginated payload.

---

## Out of scope

- **Component-level consumption.** Waves 3–5 own this. This task just exports the typed surface.
- **React Query / SWR wiring.** The codebase uses plain `fetch` in pages and `useEffect` in client components. Consumers (pr-05, pr-07, pr-09, pr-10, etc.) decide whether to wrap with React Query in their own scope.
- **Saved-view migration.** If cc-08's `doctor_cockpit_layout_presets` doesn't have a `kind` column yet, that migration belongs in pr-06 (the toolbar task that actually uses saved views). This task assumes the endpoint handles `?kind=` and pr-06 reconciles.

---

## Files expected to touch

**New:**

- `frontend/lib/api/patients.ts` (~120 LOC — six client wrappers + imports).

**Modified:**

- `frontend/lib/api/index.ts` (~10 LOC delta — re-exports, if the barrel pattern is used).
- Conditionally — `backend/src/controllers/doctor-settings-controller.ts` (~5 LOC delta — `?kind=` filter on the layout-presets list endpoint, only if it doesn't already exist).

**Read but do not modify in this task:**

- `frontend/lib/api/patient-chart.ts` (precedent).
- `frontend/lib/api/prescriptions.ts` (precedent).

---

## Notes / open decisions

1. **Why not extract `toApiError` first?** If it already exists, reuse it. If not, the wrappers can throw a thin `new Error(msg)` and Phase 2 extracts. Task picks based on what's in `frontend/lib/api/index.ts`.

2. **Why one file instead of one file per endpoint?** Resource-family pattern matches `patient-chart.ts`. Keeps related fetches close.

3. **Why no abort signal / cancellation?** The components consume via standard `useEffect` + cleanup; abort support is a Phase 2 enhancement. None of the consumers in Waves 3–5 need it.

---

## References

- **Affected files:** see "Files expected to touch".
- **Source decisions:** [§DL-4 / DL-5 / DL-6 / DL-9](../plan-patients-redesign-batch.md#decision-lock-frozen-for-batch-duration).
- **Wave gate:** [`EXECUTION-ORDER-patients-redesign.md` § Wave 2 gate](./EXECUTION-ORDER-patients-redesign.md#wave-2-gate-after-pr-03--pr-04).
- **Next task:** [`task-pr-05-patients-kpi-strip.md`](./task-pr-05-patients-kpi-strip.md) — Wave 3, Lane α step 0.

---

**Owner:** TBD
**Created:** 2026-05-18
**Status:** Pending
