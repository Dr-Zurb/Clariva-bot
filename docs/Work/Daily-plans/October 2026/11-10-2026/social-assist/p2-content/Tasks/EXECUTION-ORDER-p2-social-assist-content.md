# Execution order — p2 content

> Sibling document of [`plan-p2-social-assist-content-batch.md`](../plan-p2-social-assist-content-batch.md).

The user decides model switches. One careful task: `soc-03` (RLS on a new doctor-owned record). `soc-05` stays Sonnet if it follows the existing signed-upload pattern and a new bucket.

```
Wave 1 (Record — ~6h, single lane sequential):
  Lane α  ──── soc-03 (L, Sonnet)

Wave 2 (Board and file — ~8h, single lane sequential):
  Lane α  ──── soc-04 (M, Sonnet) ──> soc-05 (L, Sonnet)

Wave 3 (Gate — ~2h, single lane sequential):
  Lane α  ──── soc-06 (M, Sonnet)
```

**Wall-clock:** ~16h.
**Agent-time:** ~16h.

**Bottleneck:** Wave 1. The board cannot start until the record exists. Wave 2 is one lane because the file attaches to the card the board just rendered.

### Wave 1 — Record

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-03 | L | Sonnet | Migrations through `245`, `COMPLIANCE.md`, `routes/api/v1/index.ts` | Read migrations in order. Doctor-only RLS. No patient columns. |

### Wave 2 — Board and file

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-04 | M | Sonnet | Phase 1 Content tab, soc-03 API | Four columns. Move and create. |
| 1 | soc-05 | L | Sonnet | `letterhead-service` signed upload, visit-documents bucket name | New store. Do not reuse visit documents. |

### Wave 3 — Gate

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | soc-06 | M | Sonnet | Phase 2 gate in the batch plan | Browser pass with a dummy title and a dummy file. |

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| soc-03 | L | Sonnet | New doctor-owned rows and RLS. No patient data, so not the payments/PHI tier. Raise if the policy shape is unclear. |
| soc-04 | M | Sonnet | UI on an API that already exists. |
| soc-05 | L | Sonnet | Format fields plus a file, following an existing upload pattern. |
| soc-06 | M | Sonnet | Gate. |

## Acceptance gates

### Wave 1

- [ ] A signed-in doctor can create, read, update, and delete only their own cards.
- [ ] A card has a column, a title, and optional format and topic.
- [ ] Another doctor gets nothing.
- [ ] Logs are ids only.

### Wave 2

- [ ] Content shows Thoughts and ideas, Chosen, Making, Ready.
- [ ] Words on the card follow the format tag.
- [ ] Ready requires the file. Making does not have the file.
- [ ] The file is not in visit-document storage.

### Wave 3

- [ ] The phase gate in the batch plan is checked, with the date.
- [ ] Schedule and Analytics are still empty.
