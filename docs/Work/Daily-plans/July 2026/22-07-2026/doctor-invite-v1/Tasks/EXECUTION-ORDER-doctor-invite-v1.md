# doctor-invite-v1 — execution order

> Sibling of [`../plan-doctor-invite-v1-batch.md`](../plan-doctor-invite-v1-batch.md).
> **⚠️ Touches auth (service-role). Depends on admin role from `doctor-verification-v1` ver-04.**

```
Wave 1:  INV-01  admin invite endpoint (server-side service-role)   ✅
Wave 2:  INV-02  pre-fill from demo + close gate                    ✅
         (browser UI skipped — CRON_SECRET ops-gate / INV-D5)
```

**Created:** 2026-07-22. **Status:** ✅ Shipped.
