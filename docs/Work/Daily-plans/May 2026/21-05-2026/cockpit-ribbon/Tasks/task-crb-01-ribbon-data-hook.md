# crb-01 · Ribbon data hook

> **Wave 1** of the [cockpit-ribbon batch](../plan-cockpit-ribbon-batch.md). Compose existing chart endpoints into a single ribbon-shaped data structure.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | XS-S (one new file, ~80-120 LOC, no backend changes) |
| **Model** | **Auto** — straightforward composition; no architectural decisions; no security surface |
| **Wave** | 1 |
| **Depends on** | (none for compile; `useRxForm` not used here) |
| **Blocks** | crb-02 (component consumes this hook) |

---

## Goal

Build `usePatientRibbonData(patientId, token)` — a single React hook that composes existing chart endpoints into the data shape the `<PatientRibbon>` component needs.

The ribbon needs five slots' worth of data:
1. **Identity** — age (years), sex, weight (kg)
2. **Allergies** — list of `{ id, name, reaction?, severity? }` (max ~3 visible + overflow popover)
3. **Chronic conditions** — list of `{ id, name, since? }`
4. **Active medications count** — integer (count of medicines on the most recent active prescription)
5. **🎯 Treating Dx** — NOT in this hook; `<PatientRibbon>` reads it directly from `useRxForm()`. This hook only handles patient-bound data.

---

## What to do

### 1. Pick the file location

Two valid options based on existing convention; **pick whichever matches the dominant pattern in the codebase already**:

- `frontend/hooks/usePatientRibbonData.ts` — if `frontend/hooks/` exists and has SWR-style composed hooks
- `frontend/lib/patient-profile/use-ribbon-data.ts` — if patient-profile-specific hooks live under `frontend/lib/patient-profile/`

Discovery step: run `Glob` on both paths and check which sibling files exist. If neither has the right precedent, default to `frontend/hooks/usePatientRibbonData.ts`.

### 2. Discover the existing endpoint client wrappers

Find:
- The allergies wrapper — likely `listAllergies(patientId, token)` or similar in `frontend/lib/api/patient-chart.ts` or `frontend/lib/api.ts`.
- The chronic-conditions wrapper — likely `listChronicConditions` or `listConditions`.
- Active meds count source — TWO valid paths:
  - **Path A (preferred):** Most recent prescription's `medicines` array length (filter for `is_active !== false`). The existing `getRecentPrescription(patientId, token)` or `listPrescriptions(patientId, token, { limit: 1 })` likely exposes this.
  - **Path B (fallback):** A `?status=active` filter on the prescriptions list endpoint, if it exists.
  - Pick the one that's already wired client-side and documents the choice in a code comment.
- Identity (age + sex + weight): TWO valid paths:
  - **Path 1 (preferred):** From `appointment.patient_demographics` if cs-03 already populates it on the appointment-detail response. Check `frontend/types/appointment.ts` and `frontend/lib/api/appointments.ts` for a `patient_demographics` field.
  - **Path 2 (fallback):** A separate `getPatient(patientId, token)` call.
  - Pick path 1 if available — it's free (already on the response). Document the choice.

### 3. Define the return shape

```ts
export interface RibbonIdentity {
  ageYears: number | null;
  sex: 'M' | 'F' | 'O' | null;
  weightKg: number | null;
}

export interface RibbonAllergyChip {
  id: string;
  name: string;
  reaction?: string | null;
  severity?: 'mild' | 'moderate' | 'severe' | null;
}

export interface RibbonChronicChip {
  id: string;
  name: string;
  since?: string | null; // ISO date or display label
}

export interface RibbonData {
  identity: RibbonIdentity;
  allergies: RibbonAllergyChip[];
  chronicConditions: RibbonChronicChip[];
  activeMedsCount: number;
  isLoading: boolean;
  error: Error | null;
}

export function usePatientRibbonData(
  patientId: string | null,
  token: string | null,
): RibbonData;
```

### 4. Implementation pattern

Match the dominant pattern in the codebase. If existing chart sections use SWR, use SWR. If they use `useEffect`-based fetches with `useState`, match that. **Do not introduce a new pattern** for this single hook.

Common shape (SWR):
```ts
export function usePatientRibbonData(patientId, token) {
  const { data: allergies, isLoading: l1 } = useSWR(
    patientId && token ? ['ribbon-allergies', patientId] : null,
    () => listAllergies(patientId!, token!),
  );
  const { data: chronic, isLoading: l2 } = useSWR(/* ... */);
  const { data: latestRx, isLoading: l3 } = useSWR(/* ... */);
  const { data: identity, isLoading: l4 } = useSWR(/* ... */); // or derive from appointment

  return {
    identity: deriveIdentity(identity),
    allergies: (allergies ?? []).map(toRibbonAllergy),
    chronicConditions: (chronic ?? []).map(toRibbonChronic),
    activeMedsCount: countActiveMedicines(latestRx),
    isLoading: l1 || l2 || l3 || l4,
    error: null,
  };
}
```

Edge cases:
- `patientId == null` (walk-in) → return early with empty arrays + `isLoading: false`.
- All endpoints return `null` / 404 → empty arrays / null identity / `activeMedsCount: 0`.
- Any single endpoint errors → set `error` to that error; do NOT block the whole ribbon (the component renders partial data).

### 5. Smoke at React DevTools

Add a quick dev-only fixture page (or use an existing one) where you can call the hook with a known patientId + token and inspect the returned shape in React DevTools. Verify:
- All four data fields populate.
- `isLoading` flips from `true` to `false` within 500ms on a warm cache.
- Walk-in case (patientId null) returns the empty shape immediately.

This fixture is throw-away — DON'T commit it. Verify locally only.

---

## Files touched

- **New:** `frontend/hooks/usePatientRibbonData.ts` (or `frontend/lib/patient-profile/use-ribbon-data.ts` per discovery).

That's the entire surface. No backend changes, no new API client wrappers, no new packages.

---

## Acceptance gate

- [ ] Hook compiles. `pnpm --filter frontend tsc --noEmit` clean.
- [ ] `pnpm --filter frontend lint` clean for the new file.
- [ ] React DevTools smoke at a dev fixture: with a known `patientId + token`, all four data fields populate within 500ms.
- [ ] Walk-in case (`patientId == null`) returns `{ identity: { ageYears: null, sex: null, weightKg: null }, allergies: [], chronicConditions: [], activeMedsCount: 0, isLoading: false, error: null }` synchronously.
- [ ] Code comment documents which discovery path was picked for identity (Path 1 vs Path 2) and active meds count (Path A vs Path B).
- [ ] No new packages installed. No new endpoints created. No backend changes.

---

## Anti-goals

- ❌ Don't add new backend endpoints. The ribbon is a presentational composition over existing data.
- ❌ Don't subscribe to `useRxForm()` in this hook. The 🎯 Treating Dx is read by the component, not this hook.
- ❌ Don't introduce a new fetch pattern (e.g., don't add React Query if the codebase uses SWR, or vice versa).
- ❌ Don't optimize prematurely. Single-fetch-per-endpoint is fine; existing chart sections do the same.
- ❌ Don't commit the dev fixture page.

---

## Notes

- This hook is **not used in production yet** — crb-02 will be the first consumer at the dev-fixture-page level, then crb-03 wires the consuming component into the production page.
- The hook composes ~3-4 endpoints. Each existing endpoint has its own SWR cache key, so React DevTools "Profiler" will show 3-4 separate network calls on first render. That's expected; no batching needed.
- If discovery reveals that `appointment.patient_demographics` doesn't exist (cs-03 not landed in this code path yet), use Path 2 (`getPatient`) and capture-inbox a follow-up: "patient_demographics on appointment-detail response — needed for cockpit-ribbon Path 1 optimization."
