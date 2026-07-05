# Task sdp-05: `GET /chart/results` read endpoint (ordered + resulted + media projection)

> **Filename:** `task-sdp-05-results-timeline-endpoint.md` in `soap-data-placement/p3-results-timeline/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Add a read-only `GET /api/v1/patients/:patientId/chart/results` endpoint that projects the patient's prescriptions into a date-sorted **investigations & results timeline**: per visit, the **ordered** investigations (`prescriptions.investigations` text) + **resulted** rows (`prescriptions.test_results_json`) + a per-visit media count (objective report-scan attachments). Mirrors the shipped read-only chart endpoints (the `/problems` T5.25 handler is the closest analog). **No new table, view, or migration (P3-D1)** — a direct `prescriptions` query + TS assembly. Doctor-scoped, PHI-safe. Backend-only substrate; the UI lands in `sdp-06`.

**Program / Phase:** soap-data-placement · Phase 3 (investigations & results timeline)
**Batch:** [`plan-p3-soap-data-placement-results-timeline-batch.md`](../plan-p3-soap-data-placement-results-timeline-batch.md)
**Execution order:** [`EXECUTION-ORDER-p3-soap-data-placement-results-timeline.md`](./EXECUTION-ORDER-p3-soap-data-placement-results-timeline.md)
**Estimated Time:** ~3–4 hours
**Status:** 🗒 **DRAFTED** — not started. **Model: Opus** (new cross-layer endpoint + PHI reads).

**Change Type:**
- [ ] **Add new** read endpoint (route + controller + service). Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:** (check existing code first!)
- ✅ **What exists:** the read-only chart endpoint pattern — `router.get('/problems', listProblemsHandler)` in [`patient-chart-routes.ts`](../../../../../../../../backend/src/routes/api/v1/patient-chart-routes.ts); `listProblemsHandler` in [`patient-chart-controller.ts`](../../../../../../../../backend/src/controllers/patient-chart-controller.ts); the doctor-scoped read + `logDataAccess` in [`patient-chart-service.ts`](../../../../../../../../backend/src/services/patient-chart-service.ts); the results columns (`prescriptions.investigations` text + `test_results_json` rows) from objective-tab P5; the `objective/` attachment segment (for the media count).
- ❌ **What's missing:** the `/chart/results` route + handler + the aggregation service fn + the timeline response type.

**Scope Guard:**
- Expected files touched: ≤ 5 — `patient-chart-routes.ts` (one GET), `patient-chart-controller.ts` (one handler), `patient-chart-service.ts` (aggregation), `types/patient-chart.ts` (timeline type), + a service test. **DO NOT** add a migration / table / view (P3-D1 — direct query + TS assembly); **DO NOT** add any write/edit endpoint (read-only, SDP-D5).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md) (Canonical Contracts) · [RECIPES.md](../../../../../../../Reference/engineering/development/RECIPES.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Service aggregation
- [x] ✅ 1.1 Read the patient's prescriptions (doctor-scoped, same ownership path as previous-Rx / problem-list), selecting visit date + `investigations` + `test_results_json`. - **Completed: 2026-06-25**
- [x] ✅ 1.2 Project to a timeline: per visit `{ visitDate, ordered: string|null, resulted: TestResultRow[], mediaCount }`, sorted visit-date descending (P3-D2). - **Completed: 2026-06-25**
- [x] ✅ 1.3 Media count = that visit's `objective` report-scan attachments (per-visit indicator, P3-D5); precise per-result linkage deferred. - **Completed: 2026-06-25**
- [x] ✅ 1.4 `logDataAccess` with patient id + counts only — never investigation/result values (P3-D3). - **Completed: 2026-06-25**

### 2. Controller + route
- [x] ✅ 2.1 `listResultsTimelineHandler` (asyncHandler; validate `patientId`; call service; respond via the canonical success shape). - **Completed: 2026-06-25**
- [x] ✅ 2.2 Register `router.get('/results', listResultsTimelineHandler)` in `patient-chart-routes.ts`. - **Completed: 2026-06-25**

### 3. Types
- [x] ✅ 3.1 Timeline response type in `types/patient-chart.ts`; reuse the shipped `TestResultRow` shape for `resulted`. - **Completed: 2026-06-25**

### 4. Verification & Testing
- [x] ✅ 4.1 Service test: ordered-only / result-only / both / none visits project correctly; date-desc; media count; doctor-scoping; PHI-safe. - **Completed: 2026-06-25**
- [x] ✅ 4.2 `cd backend && npm test` green for the slice. - **Completed: 2026-06-25**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: backend/src/routes/api/v1/patient-chart-routes.ts (GET /results)
UPDATE: backend/src/controllers/patient-chart-controller.ts (listResultsTimelineHandler)
UPDATE: backend/src/services/patient-chart-service.ts (results-timeline aggregation)
UPDATE: backend/src/types/patient-chart.ts (timeline response type)
CREATE/UPDATE: backend/tests/unit/services/* (projection + edge cases + scoping)
DO NOT TOUCH: any migration/table/view; any write/edit endpoint; SOAP authoring paths
```

**When updating existing code:**
- [ ] Mirror the `/problems` read-only handler + service shape; controllers orchestrate only.
- [ ] Reuse the existing doctor-scoped prescription read; do not invent a new access path.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Read-only projection, no schema (P3-D1).** Direct `prescriptions` query + TS assembly; no view/migration.
- **Per-visit row (P3-D2).** Ordered + resulted under the same visit; date-desc.
- **PHI-safe + doctor-scoped (P3-D3).** ids/counts in logs only.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **Yes — read-only** PHI (investigations + results across the patient's prescriptions).
  - [ ] **RLS verified?** **Yes** — doctor-scoped via the same ownership path as the shipped chart reads; no new policy.
- [ ] **Any PHI in logs?** **No** — `logDataAccess` ids/counts only; never values.
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No** — read-only.
- [ ] **Migration?** **No** (P3-D1). Still **Opus** per the new-endpoint / PHI-reads rule.

---

## ✅ Acceptance & Verification Criteria

- [ ] `GET /chart/results` returns the patient's visits date-desc with ordered + resulted + media count; doctor-scoped; PHI-safe; no new schema.
- [ ] Edge cases (none / order-only / result-only) project correctly.
- [ ] `cd backend && npm test` green for the slice.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

The longitudinal projection that makes "investigations + reports together" real — without touching SOAP authoring. Mirrors the `/problems` read-only chart endpoint.

---

## 🔗 Related Tasks

- [`task-sdp-06-results-timeline-section.md`](./task-sdp-06-results-timeline-section.md) — the chart section that consumes this endpoint.
- [`task-sdp-07-results-timeline-close-gate.md`](./task-sdp-07-results-timeline-close-gate.md) — projection-correctness + a11y + verification gate.

---

**Last Updated:** 2026-06-25
**Pattern:** clone the read-only `/problems` chart endpoint; aggregate the patient's prescriptions in TS (no view/migration).
**Reference:** `process/CODE_CHANGE_RULES.md`
