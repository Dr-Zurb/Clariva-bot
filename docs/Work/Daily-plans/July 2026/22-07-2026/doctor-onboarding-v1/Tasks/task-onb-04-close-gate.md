# Task onb-04: Close gate

> **Filename:** `task-onb-04-close-gate.md`
> **Links:** batch [`../plan-doctor-onboarding-v1-batch.md`](../plan-doctor-onboarding-v1-batch.md) · exec [`./EXECUTION-ORDER-doctor-onboarding-v1.md`](./EXECUTION-ORDER-doctor-onboarding-v1.md)

---

## 📋 Task Overview

Verify the batch end-to-end and mark docs complete.

**Batch:** doctor-onboarding-v1 · Wave 3
**Status:** ✅ Complete

---

## ✅ Checks

- [x] Backend: `type-check` + `lint` + onboarding tests green.
- [x] Frontend: slice `lint` + `tsc` clean; `/dashboard/getting-started` 200.
- [x] E2E-ish manual: fresh doctor → 4 todos on page + widget; complete each via deep links → widget hides, page shows success.
- [x] Confirm **no migration** and **no dismiss column** landed.
- [x] Park a dogfood note in `capture/inbox.md`; mark batch + tasks ✅.
- [x] Note the deferred follow-up: permanent "dismiss checklist" needs a `doctor_settings` column (future, Opus-adjacent).

**Created:** 2026-07-22.
