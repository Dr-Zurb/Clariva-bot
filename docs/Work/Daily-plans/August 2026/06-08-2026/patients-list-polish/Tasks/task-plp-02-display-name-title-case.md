# Task plp-02: Display-name title case on Patients list

> **Links:** batch [`../plan-patients-list-polish-batch.md`](../plan-patients-list-polish-batch.md) · exec [`./EXECUTION-ORDER-patients-list-polish.md`](./EXECUTION-ORDER-patients-list-polish.md)

---

## 📋 Task Overview

Show consistent title-cased patient names on the list table **without** writing back to the database. Fixes mixed casing like `akashdeep singh` vs `Ramesh Masih`.

**Program / Batch:** patients-list-polish · Wave 1  
**Estimated Time:** ~45–60 min  
**Status:** ✅ DONE (2026-08-06)  
**Change Type:** Update existing  
**Model:** Composer / Sonnet  
**Depends on:** none  

**Decisions:** PLP-D2 · **OQ2 default:** simple whitespace-split title case  

---

## Current state

- ✅ `nameAndRiskPillsCell` links with `{patient.name}` as stored.
- ✅ `avatarCell` / `initials()` already uppercases initials.
- ❌ No shared display formatter; list looks inconsistent across IG-sourced vs manually entered names.

---

## ✅ Task Breakdown

### 1. Helper
- [ ] 1.1 Add `formatPatientDisplayName(name: string): string` in `frontend/lib/patients-v2/list-utils.ts`.
- [ ] 1.2 Behavior: trim; split on whitespace; capitalize first letter of each token (`toLocaleUpperCase` / `toLocaleLowerCase` with default locale OK); preserve empty → `""`.
- [ ] 1.3 Do **not** invent surname particle rules (Singh/von/etc.) — OQ2 default.
- [ ] 1.4 Unit tests for: already title case, all lowercase, ALL CAPS, multi-word, leading/trailing spaces, empty.

### 2. Wire list cells
- [ ] 2.1 Use the helper in `nameAndRiskPillsCell` for the visible link text.
- [ ] 2.2 Keep `href` / patient id / stored name for exports as-is unless export already uses display (CSV may stay raw — prefer **raw in CSV** for fidelity).
- [ ] 2.3 Optional (only if trivial same PR): `PatientIdentityStrip` / quick peek title — skip if it expands file count; list is mandatory.

### 3. Verification
- [ ] 3.1 Unit tests for the helper green.
- [ ] 3.2 Manual: list shows title case; network/DB name unchanged (no PATCH).
- [ ] 3.3 Typecheck + lint.

---

## 📁 Files

```
UPDATE: frontend/lib/patients-v2/list-utils.ts
UPDATE: frontend/components/patients-v2/list/PatientsTableColumns.tsx
CREATE or UPDATE: frontend/lib/patients-v2/__tests__/list-utils*.test.ts  (or colocated test matching repo pattern)
DO NOT TOUCH: patient update APIs, merge modal name writes, backend
```

---

## ⚠️ Scope Guard / DO NOT TOUCH

- **Never** persist title-cased names.
- Do not change search matching (search still uses server/raw fields).
- Do not expand into a full i18n name library.

---

## 🌍 Global Safety Gate

- [ ] **Data touched?** N (display only)  
- [ ] **Any PHI in logs?** No — do not log names while debugging  
- [ ] **External API or AI call?** N  
- [ ] **Retention / deletion impact?** N  

---

## ✅ Acceptance Criteria

- [ ] List name column uses `formatPatientDisplayName`.
- [ ] Helper unit-tested for the cases in 1.4.
- [ ] No API writes of name.
- [ ] Lint / typecheck green.

---

**Created:** 2026-08-06.
