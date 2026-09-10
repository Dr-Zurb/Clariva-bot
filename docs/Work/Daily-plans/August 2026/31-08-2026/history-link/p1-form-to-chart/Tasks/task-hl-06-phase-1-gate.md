# Task hl-06: Phase 1 gate

> **Model: Sonnet / Auto.** Verify, don't build.

---

## 📋 Task Overview

Run the batch gate. Record residuals. Update indexes. Do not add features.

**Program / Phase:** history-link · Phase 1
**Batch:** [`plan-p1-history-link-form-to-chart-batch.md`](../plan-p1-history-link-form-to-chart-batch.md)
**Estimated Time:** ~2 hours
**Status:** ⏳ **PENDING**
**Completed:** —

**Change Type:**
- [x] **Update existing** — docs + standing tests

**Scope Guard:** tests + docs only. Failing items go back to the owning task.

---

## ✅ Task Breakdown

### 1. Standing assertions
- [ ] 1.1 History verifier rejects join + Rx-share tokens.
- [ ] 1.2 POST does not insert chart rows.
- [ ] 1.3 GET public form payload has no chart PHI keys.

### 2. Batch gate
- [ ] 2.1 Tick the batch acceptance list honestly.
- [ ] 2.2 Full suites; pre-existing failures listed separately.
- [ ] 2.3 Telemetry/logs: counts + ids only.

### 3. Docs
- [ ] 3.1 Batch + program README + product-plan phase table status.
- [ ] 3.2 `tracks.md` P1 next action → Phase 2 desk send **or** execute residuals. One action.
- [ ] 3.3 `DB_SCHEMA.md` / `RLS_POLICIES.md` already done in hl-01 — confirm.

---

**Last Updated:** 2026-08-31
**Completed:** —
