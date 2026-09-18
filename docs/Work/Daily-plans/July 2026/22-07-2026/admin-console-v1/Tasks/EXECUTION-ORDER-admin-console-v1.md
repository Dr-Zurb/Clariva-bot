# admin-console-v1 — execution order

> Sibling of [`../plan-admin-console-v1-batch.md`](../plan-admin-console-v1-batch.md).
> **⚠️ OPUS batch — touches auth. Design pass before execution.**

```
Wave 0:  Opus design pass (confirm decision lock; verify token verifier surfaces
         app_metadata.role; decide dual-auth guard shape; admin-flag mechanism)
Wave 1:  ACON-01  admin role + requireAdmin guard; dual-auth review endpoints;
                  stamp reviewer id (backend)
Wave 2:  ACON-02  /admin/verifications list + detail UI (inline doc preview,
                  approve/reject) — server-side admin gate
Wave 3:  ACON-03  close gate (tests, admin-flag runbook, dogfood)
```

**Depends on:** `doctor-verification-v1` spine (service layer + endpoints) — ✅ shipped.
**Blocks (recommended):** `doctor-verification-v1` VER-05 go-live gate — enforce only once a reliable approval path exists.

**Created:** 2026-07-22. **Status:** ✅ Complete (Opus). Owner dogfood: flag admin + review one signup.
