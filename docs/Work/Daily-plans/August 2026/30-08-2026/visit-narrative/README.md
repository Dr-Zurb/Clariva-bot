# Visit narrative — daily batches

> **Product plan:** [`plan-visit-narrative.md`](../../../../Product%20plans/plan-visit-narrative.md)
> All phases for this program live in this folder. Execute in order.

| Phase | Folder | Status | Batch plan | Execution order |
|---|---|---|---|---|
| 1 — one box | [`p1-one-box/`](./p1-one-box/) | **Shipped** 2026-08-30 (`vnb-01`–`vnb-05`). Live smoke residual | [`plan-p1-visit-narrative-one-box-batch.md`](./p1-one-box/plan-p1-visit-narrative-one-box-batch.md) | [`EXECUTION-ORDER-p1-visit-narrative-one-box.md`](./p1-one-box/Tasks/EXECUTION-ORDER-p1-visit-narrative-one-box.md) |
| 2 — transcript amendment | [`p2-transcript-amendment/`](./p2-transcript-amendment/) | **Gate-green** 2026-08-30 (`vnt-01`–`vnt-05`). Production ship blocked (attestation STOP). No live voice-consult smoke. **Opus throughout — Auto must not execute.** | [`plan-p2-visit-narrative-transcript-amendment-batch.md`](./p2-transcript-amendment/plan-p2-visit-narrative-transcript-amendment-batch.md) | [`EXECUTION-ORDER-p2-visit-narrative-transcript-amendment.md`](./p2-transcript-amendment/Tasks/EXECUTION-ORDER-p2-visit-narrative-transcript-amendment.md) |
| 3 — ambient walk-in | [`p3-ambient-walkin/`](./p3-ambient-walkin/) | ⛔ **Drafted 2026-08-31 — NOT promoted.** Blocked on counsel (`Business/tracks.md` L9) + a non-DRAFT policy version + VNA-Q1. **No `vna-*` task may be executed.** Each task file's §0 is expected to STOP. | [`plan-p3-visit-narrative-ambient-walkin-batch.md`](./p3-ambient-walkin/plan-p3-visit-narrative-ambient-walkin-batch.md) | [`EXECUTION-ORDER-p3-visit-narrative-ambient-walkin.md`](./p3-ambient-walkin/Tasks/EXECUTION-ORDER-p3-visit-narrative-ambient-walkin.md) |

**Phase 3 is written, not started.** Drafting the spec is what VN-DL-9 permits; merging capture code is what it forbids. The plan also asks whether Phase 3 should fork into its own program — VN-DL-9 says "own program", the product plan's phase table says Phase 3 here. That is unblock condition 4, an owner call.

**Prefix note:** `vnb` (Phase 1) · `vnt` (Phase 2) · `vna` (Phase 3). Surfaces are disjoint; numbering does not restart inside a phase.

**Predecessor:** [`../rx-fast-entry/`](../rx-fast-entry/) — its `p3-describe-visit` shipped the seed this program promotes. `RFE-Q4` and `RFE-DL-5` are superseded for this surface (recorded in both product plans).

**Owner demand lock (2026-08-30):** the structured form stays as is; **one** box takes anything — a vital, a medicine, a complaint, or the whole summary — and parses it into the respective fields. Deterministic parsers first, AI fallback.

**Created:** 2026-08-30.
