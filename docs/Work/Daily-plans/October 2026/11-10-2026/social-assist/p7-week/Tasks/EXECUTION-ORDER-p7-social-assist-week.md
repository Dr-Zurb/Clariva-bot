# Execution order — p7 week

> Sibling document of [`plan-p7-social-assist-week-batch.md`](../plan-p7-social-assist-week-batch.md).

One UI task, then the signed-in walk. One lane.

```
Wave 1 (Week — ~3h, single lane sequential):
  Lane α  ──── soc-23 (M, Sonnet)

Wave 2 (Gate — ~1h, single lane sequential):
  Lane α  ──── soc-24 (S, Sonnet)
```

**Wall-clock:** ~4h.
**Agent-time:** ~4h.

**Bottleneck:** Wave 1. Do not add a sender, an hour grid, or a second view in this phase.

### Wave 1 — Week

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-23 | M | Sonnet | `SocialSchedule.tsx`, the Ready time field | Replace the day list. Keep the time on the card. |

### Wave 2 — Gate

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-24 | S | Sonnet | Phase 7 gate in the batch plan | Dummy title. Two times in one week. No patient name. No Instagram call. |

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| soc-23 | M | Sonnet | A view over a time that already exists. |
| soc-24 | S | Sonnet | Gate. |

## Acceptance gates

### Wave 1

- [x] The visible week shows a timed card on its day. — 2026-10-15
- [x] Clearing the time removes the chip. — 2026-10-15
- [x] Nothing is sent to Instagram. — 2026-10-15

### Wave 2

- [x] A signed-in walk matches the batch gate. — 2026-10-15
