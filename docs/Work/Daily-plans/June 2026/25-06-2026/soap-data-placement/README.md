# SOAP data placement — daily batches

> **Product plan:** [`plan-soap-data-placement.md`](../../../../Product%20plans/ehr/soap-data-placement/plan-soap-data-placement.md)
> All phases for this program live in this folder. Execute in order.

Give every clinical datum exactly one **authoring** home (per-encounter SOAP) and one **longitudinal** read home (chart panel), without breaking SOAP. The governing rule: an investigation *ordered* is a future action → **Plan**; a result *reviewed* is fact-at-this-visit → **Objective**; media attaches **where it is described**; "investigations + reports together" is a **chart** need, served by a read-only timeline (note ≠ chart).

**Task prefix:** `sdp` (stable across phases). **Numbering:** continuous — `sdp-01` (P1), `sdp-02..04` (P2), `sdp-05..07` (P3). Decisions `SDP-D1..D5` in the product plan carry across all phases.

| Phase | Folder | Status | Batch plan | Execution order |
|---|---|---|---|---|
| 1 — results consolidation | [`p1-results-consolidation/`](./p1-results-consolidation/) | ✅ Complete (sdp-01) | [`plan-p1-…`](./p1-results-consolidation/plan-p1-soap-data-placement-results-consolidation-batch.md) | [`EXECUTION-ORDER-p1-…`](./p1-results-consolidation/Tasks/EXECUTION-ORDER-p1-soap-data-placement-results-consolidation.md) |
| 2 — per-complaint symptom media | [`p2-complaint-media/`](./p2-complaint-media/) | ✅ Complete (sdp-02..04) | [`plan-p2-…`](./p2-complaint-media/plan-p2-soap-data-placement-complaint-media-batch.md) | [`EXECUTION-ORDER-p2-…`](./p2-complaint-media/Tasks/EXECUTION-ORDER-p2-soap-data-placement-complaint-media.md) |
| 3 — investigations & results timeline | [`p3-results-timeline/`](./p3-results-timeline/) | 🚧 Committed (sdp-05..07) — not implemented | [`plan-p3-…`](./p3-results-timeline/plan-p3-soap-data-placement-results-timeline-batch.md) | [`EXECUTION-ORDER-p3-…`](./p3-results-timeline/Tasks/EXECUTION-ORDER-p3-soap-data-placement-results-timeline.md) |

**Decision lock:** the product plan's `SDP-D1..SDP-D5` carry forward. Especially binding: **SDP-D2** (ordered = Plan; resulted = Objective), **SDP-D5** (note ≠ chart; additive only).

**Deferred (not scheduled):** legacy escape-hatch sunset, AI/OCR scan parse, MSE placement — see the product plan's "does NOT do" table.

**Predecessor (patterns reused):** Objective-tab program — [`../../18-06-2026/objective-tab/`](../../18-06-2026/objective-tab/) (structured results + attachment storage).
