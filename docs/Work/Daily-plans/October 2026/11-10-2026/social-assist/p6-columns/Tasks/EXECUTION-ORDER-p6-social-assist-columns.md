# Execution order — p6 named columns

> Sibling document of [`plan-p6-social-assist-columns-batch.md`](../plan-p6-social-assist-columns-batch.md).

One careful task: `soc-20` (a new doctor-owned record, and every existing card must stay in the column it is in today). One lane, because the board cannot add a column until that record exists.

```
Wave 1 (Record — ~6h, single lane sequential):
  Lane α  ──── soc-20 (L, Sonnet)

Wave 2 (Board — ~4h, single lane sequential):
  Lane α  ──── soc-21 (M, Sonnet)

Wave 3 (Gate — ~2h, single lane sequential):
  Lane α  ──── soc-22 (M, Sonnet)
```

**Wall-clock:** ~12h.
**Agent-time:** ~12h.

**Bottleneck:** Wave 1. Do not start the **+** at the end of the board until a card still lands in Thoughts and ideas, Chosen, Making, or Ready exactly as it did before.

### Wave 1 — Record

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-20 | L | Sonnet | Migrations through `251`, `COMPLIANCE.md`, the card service | Read migrations in order. Doctor-only access. Cards already saved stay put. |

### Wave 2 — Board

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-21 | M | Sonnet | Phase 5 board, soc-20 API | + before Ready. Rename and delete. Move lists the new column. |

### Wave 3 — Gate

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-22 | M | Sonnet | Phase 6 gate in the batch plan | Dummy title. Drag across the four columns. No patient name. Do not add a column. |

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| soc-20 | L | Sonnet | New doctor-owned rows. No patient columns. Raise if keeping Ready’s file rule and the posted card off the board is unclear. |
| soc-21 | M | Sonnet | UI on an API that already exists. |
| soc-22 | M | Sonnet | Gate. |

## Acceptance gates

### Wave 1

- [ ] The signed-in doctor can list, add, rename, and delete only their own named columns.
- [ ] A card that was in Making is still in Making.
- [ ] A posted card is still off the board, with its URL and visit count.
- [ ] Another doctor gets nothing. Logs are ids only.

### Wave 2

- [ ] A new column appears just before Ready and can hold a title.
- [ ] Delete returns those cards to Thoughts and ideas.
- [ ] Ready still requires the file.

### Wave 3

- [x] The phase gate in the batch plan is checked, with the date. — 2026-10-15
- [x] Schedule and Analytics are unchanged in meaning. — 2026-10-15
