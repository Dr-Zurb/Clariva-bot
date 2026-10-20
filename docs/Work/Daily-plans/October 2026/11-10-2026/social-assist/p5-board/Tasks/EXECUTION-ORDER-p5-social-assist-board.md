# Execution order — p5 board tools

> Sibling document of [`plan-p5-social-assist-board-batch.md`](../plan-p5-social-assist-board-batch.md).

One lane. Each task edits the same board. No new record, so none of these is the payments or PHI tier.

```
Wave 1 (Add — ~3h, single lane sequential):
  Lane α  ──── soc-15 (M, Sonnet)

Wave 2 (Topic — ~2h, single lane sequential):
  Lane α  ──── soc-16 (S, Sonnet)

Wave 3 (Find a card — ~6h, single lane sequential):
  Lane α  ──── soc-17 (M, Sonnet) ──> soc-18 (M, Sonnet)

Wave 4 (Gate — ~2h, single lane sequential):
  Lane α  ──── soc-19 (M, Sonnet)
```

**Wall-clock:** ~13h.
**Agent-time:** ~13h.

**Bottleneck:** Wave 3. Filter and sort have to be true before expand can reuse them.

### Wave 1 — Add

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-15 | M | Sonnet | `SocialBoard.tsx`, the Content tests | Take the top bar off. + on each column. |

### Wave 2 — Topic

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-16 | S | Sonnet | `SocialCardPanel.tsx` | The record already stores a topic. Show it on a thought. |

### Wave 3 — Find a card

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-17 | M | Sonnet | soc-16 | Per column. Not one filter for the whole board. |
| 1 | soc-18 | M | Sonnet | soc-17 | Wide view uses that column’s filter and sort. |

### Wave 4 — Gate

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-19 | M | Sonnet | Phase 5 gate in the batch plan | Dummy titles only. |

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| soc-15 | M | Sonnet | UI move of an add that already exists. |
| soc-16 | S | Sonnet | One field on a panel. The API already accepts a topic. |
| soc-17 | M | Sonnet | View state on the board. No migration. |
| soc-18 | M | Sonnet | Same cards, a wider layout. |
| soc-19 | M | Sonnet | Gate. |

## Acceptance gates

### Wave 1

- [ ] + on Thoughts, Chosen, and Making adds a title in that column.
- [ ] + on Ready asks for the file and creates a Ready card.
- [ ] The top bar is gone.

### Wave 2

- [ ] A thought can save a topic and still has no format field.
- [ ] Chosen still asks for the format and the words.

### Wave 3

- [ ] Each column filters and sorts on its own.
- [ ] Expand groups by topic and closes back to the board.

### Wave 4

- [x] The phase gate in the batch plan is checked, with the date. — 2026-10-15
- [x] Schedule and Analytics still behave as phase 4 left them. — 2026-10-15
