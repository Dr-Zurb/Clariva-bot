# Plan tab chrome — execution order

> Sibling of [`README.md`](../README.md). Plan = what + why; this = who-runs-what-when.

```
Wave 0 (reorder — ~30m):
  plan-c-01  Investigations above Medications; safety after meds
        │
        ▼
Wave 1 (L1 cards — ~2–3h):
  plan-c-02  CollapsibleContainer L1 + depthTone + sticky + scroll
        │
        ▼
Wave 2 (L2):
  plan-c-03  Advice/Education L2 (med-row depth deferred)
        │
        ▼
Wave 3:
  plan-c-04  Close gate ✅
```

| Step | Task | Size | Model | Notes |
|---|---|---|---|---|
| W0 | plan-c-01 | S | Sonnet | JSX reorder + tests |
| W1 | plan-c-02 | M | Sonnet | L1 cards; preserve testids |
| W2 | plan-c-03 | M | Sonnet | Advice/Education L2 only; med-row deferred |
| W3 | plan-c-04 | S | Sonnet | Verification ✅ |

**Caps:** no migration / PHI / RLS. Med-row depth → Opus only if MedicineRow + 5+ files.
