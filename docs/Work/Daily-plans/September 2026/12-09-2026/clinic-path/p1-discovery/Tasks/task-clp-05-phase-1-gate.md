# Task clp-05: Phase 1 gate

## 📋 Task Overview

Prove a clinic searcher can stay on the right pitch, and that `/` is still the creator homepage.

**Program / Phase:** clinic-path · Phase 1 (discovery)  
**Batch:** [`plan-p1-clinic-path-discovery-batch.md`](../plan-p1-clinic-path-discovery-batch.md)  
**Execution order:** [`EXECUTION-ORDER-p1-clinic-path-discovery.md`](./EXECUTION-ORDER-p1-clinic-path-discovery.md)  
**Estimated Time:** 0.5 hours  
**Status:** ✅ **COMPLETED**  
**Completed:** 2026-09-12

**Change Type:**
- [x] **Update existing** — docs sync only if the walk is green

**Current State:**
- Gate is this task. Do not start until `clp-01`…`clp-04` are in tree.

**Scope Guard:**
- No new features
- Do not claim repo-wide `tsc` health

**Reference Documentation:**
- [`DEFINITION_OF_DONE.md`](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md)
- [`BRAND.md`](../../../../../../../Reference/business/BRAND.md)
- [`ICP_AND_FIRST_CUSTOMER.md`](../../../../../../../Reference/business/ICP_AND_FIRST_CUSTOMER.md)

---

## ✅ Task Breakdown

### 1. Walk (browser or closest substitute)
- [ ] 1.1 `/` — creator hero unchanged; "For clinics" visible
- [ ] 1.2 `/clinics` — clinic pitch; price matches locked sheet; nav does not bounce to `/#what-converts`
- [ ] 1.3 `/pricing` — unchanged locked sheet
- [ ] 1.4 `/demo` — not Instagram-only
- [ ] 1.5 Sitemap lists the public marketing routes

### 2. Checks
- [ ] 2.1 Lint the files this phase touched
- [ ] 2.2 Record residuals honestly

### 3. Docs
- [ ] 3.1 Note `/clinics` as the second public pitch in `BRAND.md`
- [ ] 3.2 Point Raj's public URL at `/clinics` in `ICP_AND_FIRST_CUSTOMER.md` if that file still sends him to `/`

---

## 🌍 Global Safety Gate

- [x] **Data touched?** N
- [x] **Any PHI in logs?** No
- [x] **External API or AI call?** N
- [x] **Retention / deletion impact?** N

---

## ✅ Acceptance & Verification Criteria

- [ ] All five walk items pass
- [ ] `/` still reads as the creator homepage
- [ ] Residuals listed (Instagram still required to go live — that is Phase 2)

---

## 📝 Notes

Phase 1 does **not** let a clinic complete onboarding. Say that in the residual, not as a bug.

---

## 🔗 Related Tasks

- [`task-clp-04-demo-copy.md`](./task-clp-04-demo-copy.md)
- [Phase 2](../../p2-go-live/)

**Last Updated:** 2026-09-12  
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md`
