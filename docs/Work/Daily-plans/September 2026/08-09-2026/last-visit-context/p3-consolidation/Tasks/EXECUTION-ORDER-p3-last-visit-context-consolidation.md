# Execution order — p3 consolidation

```
lvc-12 ──► lvc-13 ──► lvc-14 ──► lvc-15
```

`lvc-13` and `lvc-14` both collapse a fetch. Do not start `lvc-15` until both are gone from the cockpit open path.
