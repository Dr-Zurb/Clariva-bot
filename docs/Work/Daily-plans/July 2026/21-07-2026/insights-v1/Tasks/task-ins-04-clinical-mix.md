# Task ins-04: Clinical mix — top Dx / meds / investigations (Tier 3)

> **Filename:** `task-ins-04-clinical-mix.md`
> **Links:** batch [`../plan-insights-v1-batch.md`](../plan-insights-v1-batch.md) · exec [`./EXECUTION-ORDER-insights-v1.md`](./EXECUTION-ORDER-insights-v1.md)

---

## 📋 Task Overview

Give the doctor a **de-identified** view of their own practice patterns: top diagnoses, top prescribed medicines, top investigations ordered — as aggregate counts over the range.

`GET /api/v1/dashboard/insights/clinical-mix?from&to&limit` →
```
{
  range,
  topDiagnoses:      [{ label, code?, count }],
  topMedicines:      [{ label, count }],
  topInvestigations: [{ label, count }]
}
```

**Program / Batch:** insights-v1 · Wave 4
**Estimated Time:** ~3–4 hours
**Status:** ✅ Done (2026-07-21). **Model: Sonnet.**

**Diagnosis source pick (batch Q3):** prefer `prescriptions.diagnoses_json` (`label` + optional ICD `code`); fall back to `appointments.diagnosis_tags[]` when no structured labels exist in the window. Surfaced as `diagnosesSource` on the DTO.
**Change Type:** ✅ Add read-only endpoint + service helpers + widgets + tests.
**Depends on:** `ins-01`/`ins-02` patterns.

**Current State:**
- ✅ Sources: `prescriptions.diagnoses_json` (ICD-coded rows) + `appointments.diagnosis_tags[]`; `prescription_medicines.medicine_name`; `prescriptions.investigations_orders_json`.
- ✅ `doctor_drug_usage` / `doctor_drug_favorites` already model prescribing patterns (reference, not required).
- ❌ No clinical-mix aggregation or widgets.

**Scope Guard:**
- **CRITICAL — de-identified only.** Output is `{ label, count }` rows. **No patient names, no per-patient linkage, no free-text notes** in the response (INS-D2).
- **DO NOT** add a migration or write to any table.
- **DO NOT** re-implement the range control — reuse `ins-02`'s.

---

## ✅ Task Breakdown

### 1. Backend
- [x] 1.1 Add `getClinicalMix({ doctorId, from, to, limit })` to `dashboard-insights-service.ts`; extend controller + route with `GET .../clinical-mix`.
- [x] 1.2 **Top diagnoses:** prefer structured `prescriptions.diagnoses_json` (label + optional ICD code); fall back to `appointments.diagnosis_tags[]`. Document the pick (batch open Q3). Count occurrences, `ORDER BY count DESC LIMIT limit` (default 10).
- [x] 1.3 **Top medicines:** count `prescription_medicines.medicine_name` (normalize case/trim); top N.
- [x] 1.4 **Top investigations:** count normalized labels from `investigations_orders_json`; top N.
- [x] 1.5 Zod: `from`/`to` + optional `limit` (1–50, default 10). Doctor-scoped, read-only, aggregate rows only.

### 2. Frontend
- [x] 2.1 `useClinicalMixQuery` + query options (mirror prior).
- [x] 2.2 `ClinicalMix.tsx` — three ranked lists (Dx / Meds / Investigations) with counts; reuse shared range control; empty state graceful.

### 3. Tests
- [x] 3.1 Backend: seeded prescriptions → correct top-N ordering + counts; Dx fallback path covered; case/whitespace normalization.
- [x] 3.2 Backend: `limit` bounds enforced; empty range no throw; response contains **no** patient identifiers.
- [x] 3.3 Frontend: mocked data → three ranked lists render; empty/loading states.

### 4. Verification
- [x] 4.1 `cd backend && npm run type-check && npm run lint && npm test` — slice green (31 insights tests).
- [x] 4.2 `cd frontend && npx tsc --noEmit && npm run lint && npm test` — slice green (20 insights UI tests).

---

## 📁 Files to Create/Update

```
UPDATE: backend/src/services/dashboard-insights-service.ts        (getClinicalMix)
UPDATE: backend/src/controllers/dashboard-insights-controller.ts  (clinical-mix handler)
UPDATE: backend/src/routes/api/v1/dashboard-insights.ts           (GET /clinical-mix)
UPDATE: backend/src/**/__tests__/dashboard-insights-service.test.ts
CREATE: frontend/hooks/queries/useClinicalMixQuery.ts
CREATE: frontend/components/dashboard/insights/ClinicalMix.tsx (+ __tests__)
UPDATE: frontend/lib/query/options.ts + keys.ts
UPDATE: frontend/components/dashboard/insights/PracticeHealthOverview.tsx (mount clinical mix)
DO NOT TOUCH: any migration; prescription/appointment writes
```

---

## 🧠 Design Constraints

- **De-identified aggregate rows only** — `{ label, count }`. No patient linkage, no free-text.
- **Doctor-scoped, read-only.** Prefer structured JSON over free text for labels; normalize before counting.
- **Reuse** range control + query patterns; no new chart dep.

---

## ✅ Acceptance Criteria

- [x] `GET .../clinical-mix` returns top Dx / meds / investigations as `{ label, count }`, doctor-scoped, Zod-validated, read-only.
- [x] Response contains no patient identifiers or free-text notes.
- [x] Widget shows three ranked lists; verification gate green both sides.

---

**Created:** 2026-07-21.
