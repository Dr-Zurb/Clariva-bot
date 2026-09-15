# Execution order — p1 discovery

```
clp-01 ──► clp-02 ──► clp-03 ──► clp-04 ──► clp-05
```

One lane. `clp-03` needs `/clinics` to exist. `clp-01` may list `/clinics` in the sitemap before the page ships — do not start `clp-05` until all four prior tasks are in tree.

`clp-04` does not depend on `clp-02`/`clp-03` *logically*, but keep it sequential so one chat owns the public copy pass.

**Created:** 2026-09-12.
