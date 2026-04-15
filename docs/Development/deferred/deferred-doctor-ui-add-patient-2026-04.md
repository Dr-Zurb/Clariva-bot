# Deferred: Doctor dashboard — add patient (manual registration)

**Status:** ⏸️ **DEFERRED**

**Context:** Ability for staff/doctors to create a patient record from the dashboard (walk-in, phone intake, comp care) without going through the Instagram bot. Needed so **manual** patients can appear in the Patients list under rules that don’t depend on bot payment (see [patient visibility plan](../Daily-plans/April%202026/15-04-2026/README.md) — 15 Apr 2026).

**Defer reason:** No doctor-facing “add patient” flow exists yet; product scope (fields, duplicate handling, MRN assignment on create) should be designed alongside **Patients list visibility** rules. Blocking on clearer roster semantics first avoids rework.

**Resume when:**

- You are ready to implement **Settings / Patients / Add** (or equivalent) UI + API.
- You have decided how **manual** registration assigns **MRN** (immediate on save vs. after first appointment) and how it interacts with **free** / **₹0** service paths.

---

## When you pick this up

1. **API:** `POST` or reuse patterns from booking services; service-role writes; audit logs.
2. **MRN:** Either call `assign_patient_mrn` / `assignMrnAfterPayment`-style helper on create, or set a **`registered_via: 'manual'`** + visibility flag — align with [15-04-2026 plan](../Daily-plans/April%202026/15-04-2026/README.md).
3. **Duplicates:** Reuse or mirror `findPossiblePatientMatches` / merge flows where appropriate.
4. **RLS:** Doctor-scoped access; consistent with existing patient routes.

---

## Related

- Patient list visibility & registration triggers: `docs/Development/Daily-plans/April 2026/15-04-2026/README.md`
- `listPatientsForDoctor`: `backend/src/services/patient-service.ts`

---

**Last updated:** 2026-04-15
