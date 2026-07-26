# admin-console-v2 — execution order

> Sibling of [`../plan-admin-console-v2-batch.md`](../plan-admin-console-v2-batch.md).
> **Weight: Auto** — frontend + reuse of an existing admin endpoint. No migration, no new auth surface.

```
Wave 1:  ACON2-01  admin-only "Admin console" entry point
                   (isAdmin: layout → DashboardShell → Header → HeaderProfileMenu)
Wave 2:  ACON2-02  /admin/doctors/invite form (reuse invite endpoint via admin JWT)
Wave 3:  ACON2-03  close gate (typecheck + lint; dogfood invite)
```

**Depends on:** `admin-console-v1` (role + guard + `/admin` shell) — ✅ shipped.
**Parallel-safe:** ACON2-01 and ACON2-02 touch different files; 01 first only so the invite page is reachable from the UI.

**Created:** 2026-07-22. **Status:** ✅ Complete (Auto). Owner dogfood: profile-menu link + invite.
