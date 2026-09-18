# Task vnb-05: Telemetry dims + Phase 1 gate

> **Filename:** `task-vnb-05-telemetry-and-gate.md` in this phase's `Tasks/` folder.
> **Relative-link note:** `process/` = six `../`; `Product plans/` = six; `Reference/` = seven; `frontend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7).

---

## 📋 Task Overview

Close the phase. `[ehr:rxvisit]` gains `source` (`typed` | `dictated`) and per-group kind counts — the numbers VN-Q6 needs to unlock Phase 2. Run the batch acceptance gate, update program docs.

**Program / Phase:** visit-narrative · Phase 1 (one box)
**Batch:** [`plan-p1-visit-narrative-one-box-batch.md`](../plan-p1-visit-narrative-one-box-batch.md)
**Execution order:** [`EXECUTION-ORDER-p1-visit-narrative-one-box.md`](./EXECUTION-ORDER-p1-visit-narrative-one-box.md)
**Estimated Time:** ~2 hours
**Status:** ✅ Complete — 2026-08-30

**Change Type:**
- [ ] **New feature**
- [x] **Update existing** — widens `visit-describe.ts` events; follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md)

**Current State:** (checked against the codebase)
- ✅ **What exists:** `visit-describe.ts` — `visitDescribeShown` (counts per tab), `visitDescribeAccepted` (tab + count), `visitDescribeDismissed`; `[ehr:rxvisit]` prefix; counts-only.
- ✅ **Now present:** `source` (`typed` \| `dictated`); per-group det/AI counts on shown; accepted carries `kind` + `detCount`/`aiCount`; dismissed carries `source`.
- ⚠️ **Notes:** Counts, enums, and lengths only. No parameter that can carry text (VNB-D7).

**Scope Guard:**
- Expected files touched: ≤ 5 (telemetry module + call sites + tests + docs)
- Any expansion requires explicit approval.

**Reference Documentation:**
- [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md) — VN-DL-11, VN-Q6
- Batch lock VNB-D7 · batch acceptance gate (this task runs it)
- [FRONTEND_TESTING.md](../../../../../../../Reference/engineering/development/FRONTEND_TESTING.md)

---

## ✅ Task Breakdown (Hierarchical)

### 1. Telemetry
- [x] ✅ 1.1 `source: 'typed' | 'dictated'` on shown / accepted / dismissed. - **Completed: 2026-08-30**
- [x] ✅ 1.2 Kind counts per group (subjective / vitals / assessment / investigations / plan / prose) with the deterministic-vs-AI split. - **Completed: 2026-08-30**
- [x] ✅ 1.3 Type-level lock: no string param that can carry content (mirror the `rx-command-bar.ts` pattern). - **Completed: 2026-08-30**

### 2. Gate
- [x] ✅ 2.1 Run the batch acceptance gate top to bottom; tick items on the batch plan. - **Completed: 2026-08-30**
- [x] ✅ 2.2 Grep `[ehr:rxvisit]` call sites: counts/enums only. - **Completed: 2026-08-30**
- [x] ✅ 2.3 Full frontend suite + `npx tsc --noEmit` + lint. - **Completed: 2026-08-30**
- [x] ✅ 2.4 Manual smoke script for the operator (authenticated browser): the four gate inputs (`spo2 98` · medicine line · `fever` · whole paragraph) on both hosts. - **Completed: 2026-08-30**

### 3. Docs
- [x] ✅ 3.1 Batch plan + program README + product plan statuses. - **Completed: 2026-08-30**
- [x] ✅ 3.2 Record any residuals (live smoke, follow-ups) on the batch plan Notes. - **Completed: 2026-08-30**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/telemetry/visit-describe.ts
UPDATE: frontend/lib/cockpit/__tests__/visit-parse-apply.test.ts (telemetry cases)
UPDATE: call sites in VisitDescribeBar / proposal wiring
UPDATE: batch plan + program README + product plan (statuses)
```

**Existing Code Status:**
- ✅ Events + prefix — EXIST; widen dims in place.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- Counts-only, forever. A `source`/`kind` enum is fine; a free-string field is a **STOP**.
- Accept-rate math happens off-device from counts; nothing is computed or stored client-side.

**DO NOT include:** code, pseudo-code, function signatures, or schemas in this task file.

---

## 🌍 Global Safety Gate (MANDATORY)

- [x] **Data touched?** No.
- [x] **Any PHI in logs?** No — dims are enums and integers.
- [x] **External API or AI call?** No.
- [x] **Retention / deletion impact?** No.

---

## ✅ Acceptance & Verification Criteria

Task is complete **ONLY when:**
- [x] Dims live; type-level content lock tested.
- [x] Batch acceptance gate fully ticked (or residuals recorded).
- [x] Full suite + type-check + lint green.
- [x] Program docs current.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 🐛 Issues Encountered & Resolved

**Issue:** Full `vitest run` is not green repo-wide (pre-existing `ComplaintList` timeout, `PlanSection` flake, `SubjectiveSection` QueryClient).
**Solution:** Recorded on the batch plan. Program suites (segmenter / router / proposal / apply / describe-bar / MedicineCaptureBar) are green. Touched-file lint + tsc filter clean.

---

## 📝 Notes

- The two-week VN-Q6 measurement window opens when this task closes — note the date on the product plan.

---

## 🔗 Related Tasks

- [`task-vnb-04-proposal-groups-and-apply.md`](./task-vnb-04-proposal-groups-and-apply.md) (dependency)

---

**Last Updated:** 2026-08-30
**Pattern:** Counts-only telemetry + batch gate
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/PHASED-PLANS-GUIDE.md`
