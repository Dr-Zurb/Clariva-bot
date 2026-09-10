# Task plp-01: KPI tile — hide zero deltas + attention only when count > 0

> **Links:** batch [`../plan-patients-list-polish-batch.md`](../plan-patients-list-polish-batch.md) · exec [`./EXECUTION-ORDER-patients-list-polish.md`](./EXECUTION-ORDER-patients-list-polish.md)

---

## 📋 Task Overview

Quiet empty KPI chrome on the Patients list: stop showing `—` when the 7-day delta is zero, and apply amber `attention` styling only when the tile’s count is greater than zero.

**Program / Batch:** patients-list-polish · Wave 1  
**Estimated Time:** ~45–60 min  
**Status:** ✅ DONE (2026-08-06)  
**Change Type:** Update existing  
**Model:** Composer / Sonnet  
**Depends on:** none  

**Decisions:** PLP-D4, PLP-D5  

---

## Current state

- ✅ `KpiTile` shows a minus / `—` when `delta7d === 0` (`formatDelta` / bottom row).
- ✅ `PatientsKpiStrip` sets `severity: "attention"` for Follow-up overdue and Possible duplicates **unconditionally**.
- ❌ Zero deltas look like missing data; amber at count `0` trains doctors to ignore attention chrome.

---

## ✅ Task Breakdown

### 1. Delta row
- [ ] 1.1 In `KpiTile.tsx`, when `delta7d === 0` (and not loading / muted), **omit the delta row** (render nothing) — do not show `—` or a Minus icon.
- [ ] 1.2 Keep ↑ / ↓ formatting for nonzero deltas; keep inverted colors for `attention` severity.
- [ ] 1.3 Update `aria-label` so zero-delta tiles do not claim a “7-day change 0” if the row is omitted (e.g. `"{label}: {count}"` only).

### 2. Attention severity
- [ ] 2.1 In `PatientsKpiStrip.tsx`, pass `severity="attention"` only when the resolved tile count is `> 0` for follow-up overdue and possible duplicates.
- [ ] 2.2 When count is `0` or loading, use `severity="default"` (or equivalent non-amber shell).

### 3. Verification
- [ ] 3.1 Manual: with all-zero deltas, tiles show label + count only.
- [ ] 3.2 Manual: Follow-up overdue = 0 → no amber; set a filter/fixture with overdue > 0 → amber returns.
- [ ] 3.3 Update any snapshot / unit tests that assert `—` for zero delta.
- [ ] 3.4 Typecheck + lint for touched files.

---

## 📁 Files

```
UPDATE: frontend/components/patients-v2/list/KpiTile.tsx
UPDATE: frontend/components/patients-v2/list/PatientsKpiStrip.tsx
UPDATE: frontend/components/patients-v2/list/__tests__/*   (if present; else add focused test)
DO NOT TOUCH: backend KPI endpoints, PatientsToolbar segment list (plp-03)
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- Do not change KPI fetch, segment IDs, or click → filter behavior.
- Do not redesign tile layout beyond delta/attention rules.
- Do not log patient counts in a way that includes PII (counts alone are fine; no names).

---

## 🌍 Global Safety Gate

- [ ] **Data touched?** N  
- [ ] **Any PHI in logs?** No  
- [ ] **External API or AI call?** N  
- [ ] **Retention / deletion impact?** N  

---

## ✅ Acceptance Criteria

- [ ] Zero `delta7d` → no delta UI.
- [ ] Amber only when attention tile count > 0.
- [ ] Nonzero deltas still color correctly (inverted for attention tiles).
- [ ] Lint / typecheck green for touched slice.

---

**Created:** 2026-08-06.
