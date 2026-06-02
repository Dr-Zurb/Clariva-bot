# Task cp-08: Frontend `Appointment` type — add `patient_age` + `patient_sex`

## 09 May 2026 — Batch [Cockpit polish](../plan-cockpit-polish-batch.md) — Phase 4, Lane δ-BE step 1 — **XS, ~30m**

---

## Task overview

Mirror the backend payload widening (`cp-07`) on the frontend type. Adds `patient_age: number | null` and `patient_sex: "male" | "female" | "other" | null` to `frontend/types/appointment.ts § Appointment`. The cockpit header redesign (`cp-09`) will read these fields with a graceful fallback (`patient_age && /${patient_sex}`), so even if cp-09 lands first the UI compiles cleanly — but the type must update before the lane δ-BE chat closes.

**Estimated time:** ~30 min. Pure type addition + scan for downstream consumers that might need null-handling.

**Status:** Pending.

**Hard deps:** **cp-07** — backend ships first to validate the contract. (Technically the type can be added before backend ships and the runtime would just always carry `undefined`, but the contract should land in the codebase together.)

**Source:** [plan-cockpit-polish-batch.md § CP-D6](../plan-cockpit-polish-batch.md#decision-lock-locked-2026-05-09-copied-here-for-stability).

---

## Model & execution guidance

**Recommended model:** **Sonnet 4.6 Medium** (or **Composer** for the trivial type add — but a quick Sonnet pass catches downstream null-handling).

**New chat?** **Yes** (or stitched after cp-07 in lane δ-BE). Pre-load:
- This task file.
- `frontend/types/appointment.ts` (the file to extend).
- The cp-07 final spec (paste the field union from the locked privacy block-comment).

**Estimated turns:** 1 turn.

---

## Acceptance criteria

### Step 1: extend the type

- [ ] In `frontend/types/appointment.ts`, add the two fields:

  ```ts
  export type PatientSex = 'male' | 'female' | 'other';

  export interface Appointment {
    // ... existing fields
    patient_name: string;
    patient_phone: string | null;
    /**
     * CP-D6: server-computed from patients.date_of_birth at fetch time.
     * Null when appointment.patient_id is null (legacy guest rows) or DOB
     * is unset on the patient record.
     */
    patient_age: number | null;
    /**
     * CP-D6: read directly from patients.gender. Null for guest rows
     * or patients with unset gender.
     */
    patient_sex: PatientSex | null;
    // ... existing fields
  }
  ```

- [ ] If the existing `patient_phone` field is currently typed `string` (non-null), correct it to `string | null` while you're in the file (legacy guest rows have null phone). Confirm by reading 2–3 consumers — if they already null-check, the change is safe; if not, that's a separate hygiene fix and can be flagged in the close-gate.
- [ ] Export `PatientSex` from `frontend/types/appointment.ts` so downstream code can use it (e.g. cp-09's display formatter).

### Step 2: audit consumers

- [ ] Run `rg "patient_age|patient_sex" frontend/`. Should return:
  - The type file just edited (this task).
  - The graceful-fallback in cp-09 (`CockpitHeader.tsx`) once that ships.
  - Possibly other surfaces that already expected the field.
- [ ] Run `rg "differenceInYears|computeAge|patient.*age" frontend/`. If any frontend code currently computes age client-side from `appointment.patient_id` → `getPatientById` → `date_of_birth`, **flag it** in the close-gate (and in cp-09's spec, suggest dropping that code in favour of the new server-computed field). Don't touch it in this task.

### Type-check + lint

- [ ] `cd frontend && npx tsc --noEmit` — clean.
- [ ] `cd frontend && npx next lint` — no new errors.

### Smoke

- [ ] Manual: open `lib/api.ts § getAppointment` (or wherever the cockpit fetches the appointment), inspect the network response in dev tools after cp-07 ships, confirm both fields are present and typed correctly.

---

## Out of scope

- **UI display logic** — that's `cp-09`. This task only updates the type contract.
- **Other type files** — if `frontend/types/patient.ts` already has a `gender` enum, this task may want to import it and reuse:

  ```ts
  import type { PatientGender } from "@/types/patient";
  export type PatientSex = PatientGender;  // alias for the appointment surface
  ```

  Use this approach if the patient type's enum is identical. If they diverge for any reason (e.g. backend `patients.gender` allows `'prefer_not_to_say'` but the appointment payload narrows it), keep them as separate types and document why in a JSDoc.

- **Backend type changes** — owned by cp-07.

---

## Files expected to touch

**Modified:**
- `frontend/types/appointment.ts` (~10 LOC — two new fields + JSDoc + `PatientSex` export)

**New:** none.

---

## Notes / open decisions

1. **Why `patient_sex` instead of `patient_gender`?** Match the API field name from cp-07. The frontend type mirrors the wire format exactly.
2. **What if some legacy frontend code already accesses `appointment.patient_age`?** Unlikely — `rg` would have found it. If it exists (e.g. as a `// TODO: backend should provide this` comment), this task removes the comment and lets the new typed access work directly.
3. **Should the new fields be `required` (non-optional in the interface)?** Yes — typed as `T | null` not `T?`. The backend always returns the field key; the value is null when data is unavailable. Required-with-null is more honest than optional-undefined.
4. **What if backend fails to ship cp-07 first and this types lands first?** TypeScript will compile fine (the runtime just carries `undefined` until backend ships, which the cp-09 graceful fallback handles). But — bad sequencing means runtime mismatches the type for ~minutes. Coordinate within lane δ-BE: cp-07 ships → run a smoke curl → cp-08 lands.

---

## References

- **Type to extend:** `frontend/types/appointment.ts § Appointment`
- **Backend contract source:** [task-cp-07-appointment-demographics-backend.md § Step 3](./task-cp-07-appointment-demographics-backend.md#step-3-sonnet-update-the-appointment-type)
- **Patient gender type (read-only reference):** `frontend/types/patient.ts § PatientGender`

---

**Owner:** TBD
**Created:** 2026-05-09
**Status:** Pending
