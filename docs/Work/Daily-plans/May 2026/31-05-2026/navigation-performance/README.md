# Navigation performance — daily batches

> **Product plan (what + why + phase table + decision locks):** [`plan-navigation-performance.md`](../../../../Product%20plans/plan-navigation-performance.md)
> All phases for this program live in this folder. Execute **in order** — Phase 0 (baseline) gates everything; Phase 1 (backend tax) is the multiplier that speeds up every page; Phase 2 makes re-navigation instant.

| Phase | Folder | Batch plan | Execution order | Tasks | Status |
|---|---|---|---|---|---|
| 0 — measure | [`p0-measure/`](./p0-measure/) | [`plan-p0-navigation-performance-measure-batch.md`](./p0-measure/plan-p0-navigation-performance-measure-batch.md) | [`EXECUTION-ORDER-p0-navigation-performance-measure.md`](./p0-measure/Tasks/EXECUTION-ORDER-p0-navigation-performance-measure.md) | np-01 | ✅ shipped |
| 1 — backend tax | [`p1-backend-tax/`](./p1-backend-tax/) | [`plan-p1-navigation-performance-backend-tax-batch.md`](./p1-backend-tax/plan-p1-navigation-performance-backend-tax-batch.md) | [`EXECUTION-ORDER-p1-navigation-performance-backend-tax.md`](./p1-backend-tax/Tasks/EXECUTION-ORDER-p1-navigation-performance-backend-tax.md) | np-02..03 | ✅ shipped (p50 −29%) |
| 2 — cache + dedupe | [`p2-cache-dedupe/`](./p2-cache-dedupe/) | [`plan-p2-navigation-performance-cache-dedupe-batch.md`](./p2-cache-dedupe/plan-p2-navigation-performance-cache-dedupe-batch.md) | [`EXECUTION-ORDER-p2-navigation-performance-cache-dedupe.md`](./p2-cache-dedupe/Tasks/EXECUTION-ORDER-p2-navigation-performance-cache-dedupe.md) | np-04..06 | ✅ shipped¹ |
| 3 — perceived + streaming | [`p3-perceived-streaming/`](./p3-perceived-streaming/) | [`plan-p3-navigation-performance-perceived-streaming-batch.md`](./p3-perceived-streaming/plan-p3-navigation-performance-perceived-streaming-batch.md) | [`EXECUTION-ORDER-p3-navigation-performance-perceived-streaming.md`](./p3-perceived-streaming/Tasks/EXECUTION-ORDER-p3-navigation-performance-perceived-streaming.md) | np-07..08 | ✅ shipped |
| 4 — data-path latency | [`p4-data-path/`](./p4-data-path/) | [`plan-p4-navigation-performance-data-path-batch.md`](./p4-data-path/plan-p4-navigation-performance-data-path-batch.md) | [`EXECUTION-ORDER-p4-navigation-performance-data-path.md`](./p4-data-path/Tasks/EXECUTION-ORDER-p4-navigation-performance-data-path.md) | np-09..10 | ✅ shipped (overview −48%, KPI −57%) |

¹ **Phase 2 shipped (np-04/05/06 `✅ DONE`) but its prod repeat-nav measurement was not recorded** — folded into the Phase 3 gate, which re-measures the same surfaces (closes NP-DL-1/NP-DL-6 for both).

**Task prefix:** `np-*` — numbered **continuously** across all phases (Phase 0 = np-01, Phase 1 = np-02..03, Phase 2 = np-04..06, Phase 3 = np-07..08, Phase 4 = np-09..10, np-11 gated). Do not restart at 01 per phase.

**Why phased:** the program plan defines the phases (product plan §Sequencing). Phases 0–4 are **shipped** (auth tax removed; TanStack cache + dedupe + SSR-auth; `loading.tsx` skeletons + server streaming; data-path fan-out reduction + DB-side KPI counts). **np-11 (direct-PG)** remains **profile-gated NO-GO** (NP-Q7) — co-locate API with Supabase region before revisiting.

**Decision locks confirmed (2026-05-31 chat):** NP-DL-1 (measure first), NP-DL-2 (preserve security + compliance), NP-DL-3 (backend tax first), **NP-DL-4 (one cache library → TanStack Query, NP-Q1 locked)**, NP-DL-5 (no contract change), NP-DL-6 (validate in prod build), **NP-DL-7 (preserve tenant isolation on data-path changes — added for Phase 4)**. **NP-Q6 locked** (migration order); **NP-Q7 = NO-GO** on direct-PG (np-09: round-trip count dominates, not PostgREST overhead — co-locate first), **NP-Q8 = PostgREST `count`** (np-10: no RPC). All locks resolved.
