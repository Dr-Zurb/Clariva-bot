# Execution order — p2 go-live

```
clp-06 ──► clp-07 ──► clp-08 ──► clp-09 ──► clp-10
```

One lane. `clp-07` needs the persisted field. `clp-08` and `clp-09` both read it — do not start `clp-10` until both are in tree.

Read `docs/Reference/engineering/compliance/COMPLIANCE.md` and `docs/Reference/engineering/development/MIGRATIONS_AND_CHANGE.md` before `clp-06`.

**Created:** 2026-09-12.
