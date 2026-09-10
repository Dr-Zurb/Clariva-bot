# p1 — history-link · form → reviewable evidence — execution order

> Sibling of [`plan-p1-history-link-form-to-chart-batch.md`](../plan-p1-history-link-form-to-chart-batch.md).
>
> ⛔ **Drafted.** Do not open implementation chats until the batch is `Committed`.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (5 waves)

```
Wave 1 (Store — ~5h, single lane sequential):
  Lane α  ──── **hl-01 (L, Opus)**

Wave 2 (Token — ~3h, single lane sequential):
  Lane α  ──── hl-02 (M, Sonnet)

Wave 3 (Public form — ~5h, single lane sequential):
  Lane α  ──── **hl-03 (L, Opus)**

Wave 4 (Send + accept — ~5h, 2 parallel lanes after hl-03):
  Lane α  ──── hl-04 (S, Sonnet)                                 [dm-copy]
  Lane β  ──── (waits on hl-03) ──> **hl-05 (L, Opus)**          [visit UI]

Wave 5 (Gate — ~2h, single lane sequential):
  Lane α  ──── hl-06 (M, Sonnet)
```

**Total wall-clock with parallelism:** ~20h.
**Total agent-time (sequential equivalent):** ~20h (Wave 4 overlap is small; hl-04 is ~1h).

The bottleneck is Wave 3 — unauthenticated PHI write. Wave 4 Lane α can run the moment hl-03's URL shape is locked (it only needs the path + mint helper).

---

## Lane-by-lane details

### Wave 1 — Store

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **hl-01** | L | **Opus** | `087`, `128`, `224` (house pattern), `MIGRATIONS_AND_CHANGE.md` | Next unclaimed number after `224`. No ALTER of chart tables. |

### Wave 2 — Token

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | hl-02 | M | Sonnet | `consultation-token.ts`, `prescription-token-service.ts`, `config/env.ts` | `kind: 'history-form'`. Waits on HL-Q2. |

### Wave 3 — Public form

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | **hl-03** | L | **Opus** | `public-prescription-controller.ts`, `/r/[id]`, `/c/history/[sessionId]`, `asyncHandler` | Unauthenticated POST. Zod in controller. No chart writes. |

### Wave 4 — Send + accept

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | hl-04 | S | Sonnet | `dm-copy.ts` payment/booking confirmation + snap tests, `notification-service.ts` | One extra line. Snapshot must pin the rest. |
| 0 | **hl-05** | L | **Opus** | existing allergy/med/condition create services, Subjective tab, VN accept-card posture | Waits on hl-03 (row shape). Per-item only. |

### Wave 5 — Gate

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | hl-06 | M | Sonnet | whole phase diff | Honest ticks. Pre-existing suite flakes recorded separately. |

**Branch suggestion:** `feat/hl-p1-form-to-chart` (single branch; Wave 4 lanes only if worktrees).

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| hl-01 | L | **Opus** | New PHI table + RLS |
| hl-02 | M | Sonnet | Copy of a locked HMAC pattern |
| hl-03 | L | **Opus** | Public PHI write |
| hl-04 | S | Sonnet | Copy + snapshot |
| hl-05 | L | **Opus** | Writes doctor-scoped chart rows |
| hl-06 | M | Sonnet | Gate / docs |

Two Opus in the batch (hl-01, hl-03) plus a third (hl-05). Over the §8 cap of two — accept it: three hard-rules surfaces, no honest Sonnet substitute for accept-into-chart.

---

## Acceptance gates per wave

**Wave 1:** table exists; no clinical text required on the row beyond the four answer columns; RLS proven closed to anon/authenticated; types + `DB_SCHEMA.md` updated.

**Wave 2:** mint/verify unit tests; wrong `kind` fails; join token fails; expiry fails.

**Wave 3:** GET form / POST sidecar / 409 second POST / 410 expired / no chart writes. All Wave 1–2 green.

**Wave 4:** DM snapshot + one link line; accept strip maps four fields; no Add all; dedup. All Wave 3 green.

**Wave 5:** full batch gate; docs; tracks P1 next-action updated.

---

## Cost estimate

| Wave | Tasks | Sonnet | Opus | Wall-clock |
|---|---|---|---|---|
| 1 | 1 | 0 | 1 | ~5h |
| 2 | 1 | 1 | 0 | ~3h |
| 3 | 1 | 0 | 1 | ~5h |
| 4 | 2 | 1 | 1 | ~5h |
| 5 | 1 | 1 | 0 | ~2h |
| **Total** | **6** | **3** | **3** | **~20h** |

---

## References

- Plan: [`plan-p1-history-link-form-to-chart-batch.md`](../plan-p1-history-link-form-to-chart-batch.md)
- Product: [`plan-history-link.md`](../../../../../../Product%20plans/plan-history-link.md)
- [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md)

---

**Created:** 2026-08-31.
