# Execution order — p12 review

> Sibling document of [`plan-p12-social-assist-review-batch.md`](../plan-p12-social-assist-review-batch.md).

One lane. The screen reads the handoff and the messages, so it does not start before those records exist.

```
Wave 1 (Records — ~8h, single lane sequential):
  Lane α  ──── soc-31 (M, Sonnet) → soc-32 (M, Sonnet)

Wave 2 (Doctor screen — ~8h, single lane sequential):
  Lane α  ──── soc-33 (L, Sonnet) → soc-34 (S, Sonnet)

Wave 3 (Gate — ~1h, single lane sequential):
  Lane α  ──── soc-35 (S, Sonnet)
```

**Wall-clock:** ~17h.
**Agent-time:** ~17h.

**Bottleneck:** Wave 1. Do not add an editor route, a video trimmer, or a new file store in this phase.

### Wave 1 — Records

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-31 | M | Sonnet | Migrations through `267`, `social_cards` RLS | Doctor-only. The note is not copied. |
| 1 | soc-32 | M | Sonnet | soc-31, Resources already on the card | A moment or a stretch. One existing Resource. |

### Wave 2 — Doctor screen

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-33 | L | Sonnet | Making composer, soc-32 | New component. Do not grow the panel with the thread. |
| 1 | soc-34 | S | Sonnet | `CardMarks` in `SocialBoard.tsx` | Making only. |

### Wave 3 — Gate

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-35 | S | Sonnet | The batch gate | Signed-in walk. Dummy title. Nothing sent. |

**Close review:** soc-31 adds a doctor-owned table and RLS. Read a current social-card migration before writing the policy. Do not invent a second RLS style.
