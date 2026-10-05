# Execution order — p1 outbound hardening

```
mca-01 ──► mca-02 ──► mca-03 ──► mca-04 ──► mca-05
```

One lane. `mca-01` and `mca-02` do not share files, but keep them sequential so one chat owns the Meta send-path pass. `mca-03` reads the result of `mca-01`. `mca-05` does not start until the four prior tasks are in tree.

**Created:** 2026-09-15.
