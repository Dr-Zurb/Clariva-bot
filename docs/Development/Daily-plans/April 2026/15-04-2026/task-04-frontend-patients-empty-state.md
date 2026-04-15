# Task 04: Frontend — Patients page empty state / helper copy
## 2026-04-15 — Phase D

---

## Task Overview

After the API returns an **MRN-filtered** list ([task-01](./task-01-patients-list-mrn-filter.md)), some doctors may see an **empty** Patients list even when conversations exist. Add a clear **empty state** and/or short **tooltip** explaining that patients appear after **registration** (first completed payment or zero-fee completion per task-02), without sounding broken.

**Estimated Time:** 1–2 hours  
**Status:** DONE  
**Completed:** 2026-04-15

**Change Type:**
- [x] **Update existing** — UI copy and components only; follow [CODE_CHANGE_RULES.md](../../../../task-management/CODE_CHANGE_RULES.md) for frontend standards

**Current State:**
- **What exists:** `frontend/lib/api.ts` `fetchPatients`; dashboard patients page and list UI
- **What's missing:** User-facing explanation when `patients.length === 0` (and optionally loading vs empty distinction)
- **Notes:** Manual “add patient” is deferred — do **not** promise a button unless product wants a placeholder CTA

**Scope Guard:**
- Expected files touched: 1–3 frontend files
- No backend changes unless API error handling needed

**Reference Documentation:**
- [FRONTEND_STANDARDS.md](../../../../Reference/FRONTEND_STANDARDS.md)
- [15-04-2026 README](./README.md)

---

## Task Breakdown

### 1. Locate UI
- [x] 1.1 Find patients list page component(s) (`app/dashboard/patients` or equivalent)
- [x] 1.2 Confirm empty state is not already sufficient

### 2. Implement empty state
- [x] 2.1 When list is empty and not loading, show friendly copy (1–2 sentences)
- [x] 2.2 Optional: link to appointments or help doc — only if product approves (skipped — no link)
- [x] 2.3 Match existing dashboard typography/spacing ([user rules] polish)

### 3. Verification
- [x] 3.1 Manual check: empty API response renders correctly
- [x] 3.2 Lint / typecheck for touched files

---

## Files to Create/Update

- `frontend/app/dashboard/patients/...` — REVIEW (glob for exact path)
- Shared UI component if pattern exists

**Existing Code Status:** VERIFY paths with glob before editing.

---

## Design Constraints

- Accessible text; no alarmist wording (“error”) for legitimate empty roster
- Do not expose internal field names (MRN) to patients; doctor UI can mention “completed registration” or “first visit confirmed” per product copy review

---

## Global Safety Gate

- [x] **Data touched?** No backend
- [x] **Any PHI in logs?** N/A
- [x] **External API or AI call?** No
- [x] **Retention / deletion impact?** No

---

## Acceptance Criteria

- [x] Empty list is explained for doctors who only have pre-registration chats
- [x] Non-empty behavior unchanged
- [x] Copy aligned with [task-03](./task-03-reference-docs-registered-patient.md) terminology where possible

---

## Related Tasks

- [Task 01](./task-01-patients-list-mrn-filter.md) — prerequisite for visible empty state in real data

---

**Last Updated:** 2026-04-15  
**Reference:** [TASK_TEMPLATE.md](../../../../task-management/TASK_TEMPLATE.md)
