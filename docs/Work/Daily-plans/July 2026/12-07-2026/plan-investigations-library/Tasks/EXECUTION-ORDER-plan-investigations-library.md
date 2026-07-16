# Plan investigations library — execution order

> Sibling of [`README.md`](../README.md).

```
W0  inv-lib-01  Grow static library
      │
      ▼
W1  inv-lib-02  Panel checklist + search (this ship)
      │
      ▼
W2  inv-lib-03  Alias dedupe polish
      │
      ▼
W3  inv-lib-04  AI catalog resolve
      │
      ▼
W4  inv-lib-05  Structured JSON (Opus)
```

| Step | Task | Size | Notes |
|---|---|---|---|
| W0 | inv-lib-01 | M | Content + helpers; provisional ranges |
| W1 | inv-lib-02 | M | FE-only; flat string commit rule |
| W2 | inv-lib-03 | S | Case/alias dedupe |
| W3 | inv-lib-04 | M | Opus if new AI endpoint |
| W4 | inv-lib-05 | L | Migration — stop for Opus |
