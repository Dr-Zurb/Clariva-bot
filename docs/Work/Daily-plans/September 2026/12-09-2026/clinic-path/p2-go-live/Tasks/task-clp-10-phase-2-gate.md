# Task clp-10: Phase 2 gate

## 📋 Task Overview

Prove two dummy doctors. Do not use real patient records.

**Program / Phase:** clinic-path · Phase 2 (go-live)  
**Batch:** [`plan-p2-clinic-path-go-live-batch.md`](../plan-p2-clinic-path-go-live-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p2-clinic-path-go-live.md`](./EXECUTION-ORDER-p2-clinic-path-go-live.md)  
**Estimated Time:** 1 hour  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-09-12 — unit proof; live dummy walk needs migration 232 applied

**Change Type:**
- [x] **Update existing** — verification + docs

**Current State:**
- Gate is this task. Do not start until `clp-06`…`clp-09` are in tree.

**Scope Guard:**
- Dummy data only
- Do not claim repo-wide health from focused tests

---

## ✅ Task Breakdown

### 1. Two-account proof
- [ ] 1.1 **Not yet** dummy: practice + pricing + availability + verified → Getting started complete without Instagram; Instagram step still visible and optional
- [ ] 1.2 **Yes** dummy (or backfilled existing): same three setup steps without Instagram → still incomplete
- [ ] 1.3 Connecting Instagram later still marks the step done for both

### 2. Checks
- [ ] 2.1 Focused tests for the onboarding AND and the settings write
- [ ] 2.2 Type-check / lint on files this phase touched
- [ ] 2.3 Residuals recorded (who can flip Yes → Not yet later is out of scope unless already built)

### 3. Docs
- [ ] 3.1 Onboarding / getting-started copy in-product matches the optional rule
- [ ] 3.2 Sync the go-live rule into the canonical onboarding note if one exists; otherwise leave a one-line residual

---

## 🌍 Global Safety Gate

- [x] **Data touched?** Y — dummy doctor settings only
- [x] **Any PHI in logs?** MUST be No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N for the walk

---

## ✅ Acceptance & Verification Criteria

- [ ] Both dummy accounts behave as CLP-DL-7
- [ ] No real patient data used
- [ ] Phase 2 residuals listed; do not mark Shipped if focused checks fail

---

## 🔗 Related Tasks

- [`task-clp-09-optional-checklist-step.md`](./task-clp-09-optional-checklist-step.md)
- [Phase 1](../../p1-discovery/)

**Last Updated:** 2026-09-12  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
