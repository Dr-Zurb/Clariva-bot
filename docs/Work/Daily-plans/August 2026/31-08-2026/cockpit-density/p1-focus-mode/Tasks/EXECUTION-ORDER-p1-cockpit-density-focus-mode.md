# p1 — cockpit-density · focus mode — execution order

> Sibling of [`plan-p1-cockpit-density-focus-mode-batch.md`](../plan-p1-cockpit-density-focus-mode-batch.md).

```
Wave 1 (Build — single lane sequential):
  Lane α  ──── ckd-01 → ckd-02 → ckd-03 → ckd-04
```

| Step | Task | Notes |
|---|---|---|
| 0 | ckd-01 | Describe into palette. Contained in shell + bar. |
| 1 | ckd-02 | Pathname-based chrome hide. No live-only gate. |
| 2 | ckd-03 | Needs dashboard root id from ckd-02. |
| 3 | ckd-04 | Gate. |

**Created:** 2026-08-31.
