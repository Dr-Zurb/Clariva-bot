# doctor-verification-v1 — execution order

> Sibling of [`../plan-doctor-verification-v1-batch.md`](../plan-doctor-verification-v1-batch.md).
> **⚠️ OPUS batch — design pass before execution.**

```
Wave 0:  Opus design pass ✅ (decisions locked; CRON_SECRET admin; doctors SELECT-only)
Wave 1:  VER-01  migration: doctor_verification table + RLS            ✅
Wave 2:  VER-02  storage bucket + secure signed-upload service          ✅
Wave 3:  VER-03  doctor "get verified" submit flow (+ frontend)         ✅
Wave 4:  VER-04  admin review (approve/reject), CRON_SECRET-gated        ✅
Wave 5:  VER-05  go-live gate enforcement (IG connect + booking)        ✅
Wave 6:  VER-06  close gate                                             ✅ eng / ⏳ dogfood
```

**Created:** 2026-07-22. **Status:** ✅ Spine + VER-05 gate shipped (Opus).
