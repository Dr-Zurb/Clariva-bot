# Task plp-07: Close gate — Patients list polish

> **Links:** batch [`../plan-patients-list-polish-batch.md`](../plan-patients-list-polish-batch.md) · exec [`./EXECUTION-ORDER-patients-list-polish.md`](./EXECUTION-ORDER-patients-list-polish.md)

---

## 📋 Task Overview

Verify the full polish batch against the decision lock and DEFINITION_OF_DONE; mark tasks/plan complete.

**Program / Batch:** patients-list-polish · Wave 4  
**Estimated Time:** ~45 min  
**Status:** ✅ DONE (2026-08-06)  
**Change Type:** Verification  
**Model:** Composer  
**Depends on:** plp-01 … plp-06  

---

## ✅ Task Breakdown

### 1. Decision lock checklist
- [ ] 1.1 PLP-D4/D5 — zero deltas hidden; amber only when count > 0 (`plp-01`).
- [ ] 1.2 PLP-D2 — display title case; no name writes (`plp-02`).
- [ ] 1.3 PLP-D3 — no duplicated primary chips; active KPI filter clearable (`plp-03`).
- [ ] 1.4 PLP-D6 — duplicates callout when count > 0 (`plp-04`).
- [ ] 1.5 PLP-D7 — default compact density (`plp-05`).
- [ ] 1.6 PLP-D9 — row actions additive; detail nav intact (`plp-06`).
- [ ] 1.7 PLP-D1/D8 — no backend/migration; push banner untouched.

### 2. Visual QA (manual on `/dashboard/patients-v2`)
- [ ] 2.1 Fresh preference state: compact rows, quieter KPIs.
- [ ] 2.2 KPI filter → table updates → clear pill works.
- [ ] 2.3 Secondary chips (allergies / untagged / no-show) still work.
- [ ] 2.4 Duplicates callout + Review path (skip merge if no safe fixture).
- [ ] 2.5 Mobile / narrow width: toolbar doesn’t overflow unusably (best-effort).

### 3. Verification gate
- [ ] 3.1 Frontend typecheck.
- [ ] 3.2 Frontend lint (touched packages).
- [ ] 3.3 Relevant unit tests (list-utils, KPI/toolbar if added).
- [ ] 3.4 Confirm no PHI in any new logs.

### 4. Close-out docs
- [ ] 4.1 Mark plp-01…plp-06 status ✅ with dates.
- [ ] 4.2 Update batch plan status to Complete; tick acceptance gate.
- [ ] 4.3 Update day README / program README status line.

---

## 📁 Files

```
UPDATE: docs only (status ticks) + any tiny fix found during QA
DO NOT TOUCH: new features beyond fixing regressions from this batch
```

---

## 🌍 Global Safety Gate

- [ ] **Data touched?** N  
- [ ] **Any PHI in logs?** No  
- [ ] **External API or AI call?** N  
- [ ] **Retention / deletion impact?** N  

---

## ✅ Acceptance Criteria

- [ ] All PLP-D* verified.
- [ ] Typecheck + lint + tests green.
- [ ] Batch plan marked complete.

---

**Created:** 2026-08-06.
