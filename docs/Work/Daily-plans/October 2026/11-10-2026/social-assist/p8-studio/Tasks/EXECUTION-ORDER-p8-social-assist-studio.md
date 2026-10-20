# Execution order — p8 studio

> Sibling document of [`plan-p8-social-assist-studio-batch.md`](../plan-p8-social-assist-studio-batch.md).

One lane. The notebook, the composer, and the footer all edit the same card sheet, so they do not run side by side.

```
Wave 1 (Notebook — ~3h, single lane sequential):
  Lane α  ──── soc-25 (M, Sonnet)

Wave 2 (Composer — ~7h, single lane sequential):
  Lane α  ──── soc-26 (L, Sonnet) → soc-27 (S, Sonnet)

Wave 3 (Finish the post — ~7h, single lane sequential):
  Lane α  ──── soc-28 (M, Sonnet) → soc-29 (M, Sonnet)

Wave 4 (Gate — ~1h, single lane sequential):
  Lane α  ──── soc-30 (S, Sonnet)
```

**Wall-clock:** ~18h.
**Agent-time:** ~18h.

**Bottleneck:** Wave 2. Do not add carousel slides, an assistant tab, or a publish call in this phase.

### Wave 1 — Notebook

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-25 | M | Sonnet | The thought sheet, `SocialCardPanel.tsx` | Chosen opens the notebook. **Start making** picks the format and moves the card. |

### Wave 2 — Composer

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-26 | L | Sonnet | soc-25, the format fields already on the card | Three panes. No format yet means the three choices first. |
| 1 | soc-27 | S | Sonnet | `wordsForFormat`, the words schema | Keep the other format’s words. Caption max 2200. |

### Wave 3 — Finish the post

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-28 | M | Sonnet | The resources bar, the media slot from soc-26 | A line or a selection fills a field. A dragged file becomes the one that posts. |
| 1 | soc-29 | M | Sonnet | The Ready drop rule, the time on a Ready card | **Mark ready** uses that rule. **Schedule** sets the existing time. |

### Wave 4 — Gate

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-30 | S | Sonnet | Phase 8 gate in the batch plan | Dummy title. One thought taken through to a time. No patient name. No Instagram call. |

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| soc-25 | M | Sonnet | Reuse the notebook. One new button. |
| soc-26 | L | Sonnet | The layout. Three panes, two columns, one card. |
| soc-27 | S | Sonnet | A save rule and a length. |
| soc-28 | M | Sonnet | Drag and selection into fields that already exist. |
| soc-29 | M | Sonnet | The footer uses the Ready rule that already exists. |
| soc-30 | S | Sonnet | Gate. |

## Acceptance gates

### Wave 1

- [x] A Chosen card opens the notebook. — 2026-10-15
- [x] **Start making** asks for a format and the card is then in Making. — 2026-10-15

### Wave 2

- [x] Making and Ready show the thought, the post, and a preview. — 2026-10-15
- [x] Switching format and saving keeps the other format’s words. — 2026-10-15

### Wave 3

- [x] A line from the thought can land in a field. — 2026-10-15
- [x] A file from the resources bar can become the file that posts. — 2026-10-15
- [x] **Mark ready** stays off until that file can post. — 2026-10-15
- [x] **Schedule** sets a time. Nothing is sent. — 2026-10-15

### Wave 4

- [x] A signed-in walk matches the batch gate. — 2026-10-15
