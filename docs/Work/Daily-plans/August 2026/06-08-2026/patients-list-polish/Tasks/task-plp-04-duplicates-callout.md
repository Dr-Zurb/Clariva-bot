# Task plp-04: Elevate duplicates callout when count > 0

> **Links:** batch [`../plan-patients-list-polish-batch.md`](../plan-patients-list-polish-batch.md) · exec [`./EXECUTION-ORDER-patients-list-polish.md`](./EXECUTION-ORDER-patients-list-polish.md)

---

## 📋 Task Overview

When possible duplicates ≥ 1, show a clear inline callout above the patients table that opens the existing duplicates review/merge flow. Keep the KPI tile (PLP-OQ1 default) but stop relying on it alone for discoverability.

**Program / Batch:** patients-list-polish · Wave 2  
**Estimated Time:** ~1–1.5 h  
**Status:** ✅ DONE (2026-08-06)  
**Change Type:** Update existing  
**Model:** Sonnet  
**Depends on:** preferred after plp-03  

**Decisions:** PLP-D6 · OQ1 keep KPI tile  

---

## Current state

- ✅ `getPossibleDuplicates` → `duplicateGroups` on `PatientsV2Page`.
- ✅ KPI “Possible duplicates” opens `DuplicatesCollapsedChip` via `duplicatesPopoverOpen`.
- ✅ Chip also sits in the toolbar `duplicatesSlot`.
- ❌ With count `1`, the signal competes with four other KPIs and is easy to miss.

---

## ✅ Task Breakdown

### 1. Callout UI
- [ ] 1.1 When `duplicateGroups.length > 0`, render a compact banner/alert between toolbar and table (or immediately above table) e.g. “{n} possible duplicate group(s) — Review”.
- [ ] 1.2 Primary action opens the existing duplicates popover/dialog (`setDuplicatesPopoverOpen(true)` or equivalent).
- [ ] 1.3 Dismiss for the session is optional; if added, use sessionStorage keyed by doctor — **do not** permanently hide without a way to reopen (KPI / chip remain).
- [ ] 1.4 Use existing Alert / soft banner patterns from the UI kit; no new dependency.

### 2. Wire merge refresh
- [ ] 2.1 Reuse `handleDuplicatesMerged` so merge → refresh groups + KPIs + table.
- [ ] 2.2 Callout disappears when `duplicateGroups.length === 0`.

### 3. Copy & a11y
- [ ] 3.1 No patient names in the callout text (group count only).
- [ ] 3.2 Button/link keyboard accessible; `aria` describes action.

### 4. Verification
- [ ] 4.1 Manual: with ≥1 group, callout visible; Review opens same flow as KPI click.
- [ ] 4.2 Manual: after merge to zero groups, callout gone.
- [ ] 4.3 Typecheck + lint.

---

## 📁 Files

```
UPDATE: frontend/components/patients-v2/PatientsV2Page.tsx
CREATE (optional): frontend/components/patients-v2/list/DuplicatesCallout.tsx
UPDATE: frontend/components/patients-v2/list/DuplicatesCollapsedChip.tsx  (reuse only; avoid rewrite)
DO NOT TOUCH: merge API / MergePatientsModal business rules
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- Do not change duplicate detection algorithm.
- Do not remove the KPI tile or toolbar chip in this task.
- Do not show PHI (names, phones) in the callout.

---

## 🌍 Global Safety Gate

- [ ] **Data touched?** N (reads existing duplicate groups client-side)  
- [ ] **Any PHI in logs?** No  
- [ ] **External API or AI call?** N (existing fetch only)  
- [ ] **Retention / deletion impact?** N  

---

## ✅ Acceptance Criteria

- [ ] Callout visible iff duplicate group count > 0.
- [ ] Review opens existing merge/review UI.
- [ ] Post-merge refresh clears callout when empty.
- [ ] Lint / typecheck green.

---

**Created:** 2026-08-06.
