# Execution order — p4 show up ready

> Sibling document of [`plan-p4-clinic-link-show-up-batch.md`](../plan-p4-clinic-link-show-up-batch.md). The plan covers what and why. This doc covers who-runs-what-when.
>
> **Do not start this order until `clk-19` is green.** It is. This phase adds no migration and no SMS.

The user decides model switches. One careful task in the batch: `clk-21`.

```
Wave 1 (The three sentences — ~4h, single lane):
  Lane α  ──── clk-20 (M)

Wave 2 (Share, waiting room, dark list — ~4h wall, 3 parallel lanes):
  Lane α  ──── clk-21 (M)                          [share the prep URL]
  Lane β  ──── clk-22 (S)                          [video sentence on the waiting room]
  Lane γ  ──── clk-23 (S)                          [no public order list]

Wave 3 (Gate — ~3h):
  Lane α  ──── clk-24 (M)
```

**Wall-clock:** ~11h (Wave 2 runs share, the waiting-room line, and the dark-list guard together).
**Agent-time:** ~15h.

**Bottleneck:** Wave 2, lane α. Sharing mints a history-form token from a join token. That is a downgrade, and it must not ride the polled snapshot.

### Wave 1 — The three sentences

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | clk-20 | M | `prep/page.tsx`, `PatientVisitSession`, public history read | One copy module. `consultation_type` only. Text and null show nothing. |

### Wave 2 — Share, the waiting room, and the dark list

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0α | clk-21 | M | `history-form-token.ts`, `consultation-token.ts`, session snapshot handler | Mint on the tap. Never on the poll. |
| 0β | clk-22 | S | `PatientVideoWaitingRoom.tsx`, `VideoConsultPreCall.tsx` | Do not rebuild the check. Do not cancel. |
| 0γ | clk-23 | S | `desk-lab-orders-service.ts`, public history read | No public order labels. No fulfillment write. |

Lane test: the waiting room does not import the public history controller. The public history read does not import `listPendingLabAppointments`. The share response path starts with `/book/prep?t=` and the body does not contain the consultation token.

### Wave 3 — Gate

| Step | Task | Size | Pre-load | Notes |
|---|---|---|---|---|
| 0 | clk-24 | M | Phase 4 gate in the batch plan | Dummy visits only. No new behavior. |

## Per-task picks

| Task | Size | Why this one is heavier |
|---|---|---|
| clk-20 | M | The same three sentences on two pages, from two different tokens. |
| clk-21 | M | A join token must not leak into the shared URL, and a prep token must not land on a cached poll. |
| clk-22 | S | One sentence next to a check that already exists. |
| clk-23 | S | A guard so the unfinished desk list is not shown to a patient. |
| clk-24 | M | Gate. The token downgrade was already reviewed on clk-21. |

## Acceptance gates

### Wave 1

- [x] Video, voice, and in-clinic each show only their sentence on the prep page and on `/my-visit`.
- [x] Text and a missing type show no sentence.

### Wave 2

- [x] Share uses `/book/prep?t=`. The join URL is not the shared URL.
- [x] The snapshot poll has no prep token.
- [x] The video waiting room shows the video sentence and the existing check. Deny and skip do not cancel.
- [x] Public prep returns no order label. A patient upload does not write a fulfillment row.

### Wave 3

- [x] Every batch gate box is checked, or a blocking task is named.
- [x] The walk used dummy visits. Those visits were cancelled afterward.
