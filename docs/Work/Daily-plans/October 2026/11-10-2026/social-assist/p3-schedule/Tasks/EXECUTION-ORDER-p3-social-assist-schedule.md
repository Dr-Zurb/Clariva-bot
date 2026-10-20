# Execution order — p3 schedule

> Sibling document of [`plan-p3-social-assist-schedule-batch.md`](../plan-p3-social-assist-schedule-batch.md).

```
Wave 1 (Time and list — ~6h, single lane sequential):
  Lane α  ──── soc-07 (M, Sonnet) ──> soc-08 (M, Sonnet) ──> soc-09 (S, Sonnet)
```

**Wall-clock:** ~6h.
**Agent-time:** ~6h.

One lane. The list reads the time `soc-07` stores. They are not independent.

### Wave 1 — Time and list

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-07 | M | Sonnet | Ready card from `soc-05`, public slug | Store a time. Do not call Instagram. |
| 1 | soc-08 | M | Sonnet | soc-07 | Day list on the Schedule tab. |
| 2 | soc-09 | S | Sonnet | Phase 3 gate | Browser pass. Confirm no publish request. |

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| soc-07 | M | Sonnet | One timestamp on a card that already exists. |
| soc-08 | M | Sonnet | A list of those cards. |
| soc-09 | S | Sonnet | Gate. |

## Acceptance gates

### Wave 1

- [ ] A Ready card with a file accepts a time and shows on Schedule that day.
- [ ] A card with no file cannot take a time.
- [ ] No request is sent to Instagram to publish.
- [ ] Analytics has no posted cards.
