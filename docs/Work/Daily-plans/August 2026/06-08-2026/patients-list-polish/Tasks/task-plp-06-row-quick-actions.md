# Task plp-06: Row quick actions

> **Links:** batch [`../plan-patients-list-polish-batch.md`](../plan-patients-list-polish-batch.md) · exec [`./EXECUTION-ORDER-patients-list-polish.md`](./EXECUTION-ORDER-patients-list-polish.md)

---

## 📋 Task Overview

Add lightweight per-row actions on the Patients table so doctors can Call or Copy phone (and Start consult **only if** an existing helper is one import away) without opening the full chart. Name → detail navigation remains primary.

**Program / Batch:** patients-list-polish · Wave 3  
**Estimated Time:** ~1.5–2.5 h  
**Status:** ✅ DONE (2026-08-06)  
**Change Type:** Update existing  
**Model:** Sonnet  
**Depends on:** none (after Wave 2 preferred)  

**Decisions:** PLP-D9 · **OQ3:** Start consult only if wiring is cheap  

---

## Current state

- ✅ Phone cell already supports reveal + `tel:` style affordances (`PhoneCellInner`).
- ✅ Name links to `/dashboard/patients-v2/{id}`.
- ✅ Bulk bar covers Export CSV / Tag for multi-select.
- ❌ No single-row overflow for common actions; one patient still requires chart navigation for call/copy rituals that could be list-native.

---

## ✅ Task Breakdown

### 1. Discover existing patterns
- [ ] 1.1 Search for Start consult / `SplitStartButton` / dial helpers used elsewhere in the dashboard.
- [ ] 1.2 Decide OQ3: include Start consult **only** if reuse is ≤ ~1 component import + patient id; otherwise ship Call + Copy phone only and note deferral in task Notes.

### 2. Actions UI
- [ ] 2.1 Add a trailing actions column **or** row hover/overflow menu (prefer `DropdownMenu` pattern from UI kit).
- [ ] 2.2 Actions (minimum): **Copy phone**, **Call** (`tel:` with revealed/full number — do not put full number in DOM attributes unnecessarily beyond `href` needs; match existing phone cell privacy posture).
- [ ] 2.3 Actions must `stopPropagation` so they don’t trigger row navigation if rows are clickable.
- [ ] 2.4 Keyboard: menu trigger focusable; items labeled.

### 3. Column prefs
- [ ] 3.1 If adding a column, register it in `PATIENT_LIST_COLUMN_DEFS` / defaults as always-on or default-visible; don’t break saved view column lists (unknown ids ignored today — verify).

### 4. Verification
- [ ] 4.1 Manual: Copy phone works; Call opens dialer intent; name link still works.
- [ ] 4.2 Manual: actions don’t select/deselect checkbox unintentionally.
- [ ] 4.3 No phone/name logged.
- [ ] 4.4 Typecheck + lint; unit smoke if menu labels are tested elsewhere.

---

## 📁 Files

```
UPDATE: frontend/components/patients-v2/list/PatientsTable.tsx
UPDATE: frontend/components/patients-v2/list/PatientsTableColumns.tsx
UPDATE: frontend/lib/patients-v2/list-preferences.ts   (if new column id)
UPDATE (optional): existing Start consult helper — import only
DO NOT TOUCH: bulk tag API, patient detail routes redesign
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- Do not build a new consult booking flow.
- Do not show unmasked phone in the table by default (reveal-on-demand stays).
- Do not expand into Inbox deep-links unless already trivial.

---

## 🌍 Global Safety Gate

- [ ] **Data touched?** N  
- [ ] **Any PHI in logs?** No (phones/names must not be logged)  
- [ ] **External API or AI call?** N (unless Start consult uses existing client call — no new endpoints)  
- [ ] **Retention / deletion impact?** N  

---

## ✅ Acceptance Criteria

- [ ] Per-row Copy phone + Call available without opening chart.
- [ ] Name → detail still works.
- [ ] Start consult either shipped via reuse or explicitly deferred in Notes with OQ3.
- [ ] Lint / typecheck green.

---

## 📝 Notes

(Fill at close: Start consult included? Y/N + pointer.)

---

**Created:** 2026-08-06.
