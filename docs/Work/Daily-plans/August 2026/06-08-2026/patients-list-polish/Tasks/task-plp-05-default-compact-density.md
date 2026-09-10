# Task plp-05: Default compact density (+ optional compact KPI strip)

> **Links:** batch [`../plan-patients-list-polish-batch.md`](../plan-patients-list-polish-batch.md) · exec [`./EXECUTION-ORDER-patients-list-polish.md`](./EXECUTION-ORDER-patients-list-polish.md)

---

## 📋 Task Overview

Make the Patients registry denser by default: new users (no stored preference) land on `compact`. Optionally tighten KPI tile padding so the table rises earlier on the page.

**Program / Batch:** patients-list-polish · Wave 3  
**Estimated Time:** ~45–75 min  
**Status:** ✅ DONE (2026-08-06)  
**Change Type:** Update existing  
**Model:** Composer / Sonnet  
**Depends on:** preferred after plp-01  

**Decisions:** PLP-D7  

---

## Current state

- ✅ `PatientsListDensity` = `"comfortable" | "compact"` in `list-preferences.ts`.
- ✅ `readDensityFromStorage()` / `writeDensityToStorage()`; page initializes with `useState("comfortable")` then hydrates from storage.
- ❌ Default before/without storage is comfortable — wrong for a registry.

---

## ✅ Task Breakdown

### 1. Preference default
- [ ] 1.1 Change the fallback in `readDensityFromStorage` (and any `DEFAULT_DENSITY` constant) to `"compact"`.
- [ ] 1.2 Keep respecting an explicit stored `"comfortable"` value.
- [ ] 1.3 Align `PatientsV2Page` initial `useState` with the same default to avoid a comfortable→compact flash when possible.

### 2. Optional KPI strip density
- [ ] 2.1 If cheap: add a slightly tighter padding class on `KpiTile` when list density is compact (pass prop from page → strip → tile). Skip if it balloons scope — table density is the must-have.

### 3. Verification
- [ ] 3.1 Cleared localStorage → list loads compact.
- [ ] 3.2 Toggle to comfortable persists across reload.
- [ ] 3.3 Unit test for default fallback if prefs helpers are tested.
- [ ] 3.4 Typecheck + lint.

---

## 📁 Files

```
UPDATE: frontend/lib/patients-v2/list-preferences.ts
UPDATE: frontend/components/patients-v2/PatientsV2Page.tsx
UPDATE (optional): frontend/components/patients-v2/list/KpiTile.tsx
UPDATE (optional): frontend/components/patients-v2/list/PatientsKpiStrip.tsx
DO NOT TOUCH: column preference schema, saved-view density (views don't store density today — keep it that way)
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- Do not migrate or wipe existing user preferences.
- Do not change table column defaults in this task.

---

## 🌍 Global Safety Gate

- [ ] **Data touched?** N (localStorage preference only)  
- [ ] **Any PHI in logs?** No  
- [ ] **External API or AI call?** N  
- [ ] **Retention / deletion impact?** N  

---

## ✅ Acceptance Criteria

- [ ] No stored preference → compact.
- [ ] Stored comfortable still honored.
- [ ] Lint / typecheck green.

---

**Created:** 2026-08-06.
