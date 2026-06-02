# Navigation performance — Phase 4 (data-path latency) — execution order

> Sibling document of [`plan-p4-navigation-performance-data-path-batch.md`](../plan-p4-navigation-performance-data-path-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.

**Cost-aware model strategy:** [`../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

## Wave plan (2 waves)

```
Wave 1 (Measure & attribute — ~0.5–1d, single lane):
  Lane α  ──── np-09 (S, Sonnet 4.6)   profile the floor; attribute RTT vs PostgREST vs round-trips; rank levers
        ⇣ (resolves NP-Q7; tells np-10 which endpoints/waves to cut)
Wave 2 (Collapse round-trips + DB-side counts — ~2–4d, single lane):
  Lane α  ──── np-10 (L, Sonnet 4.6*)  parallelize overview waterfall; KPI counts DB-side; drop redundant fan-out
                                       (*escalate to Opus if it must add an RPC / direct-PG — NP-DL-7)
```

**Total wall-clock:** ~2.5–5d.
**Total agent-time (sequential equivalent):** ~2.5–5d.

---

## Why this shape (§5 lane gate)

- **Strictly sequential — NP-DL-1.** np-10 may not touch the data path until np-09 has attributed it. The whole point of the measure-first lock is that the lever (parallelize vs aggregate vs pooled-PG vs co-locate) is *chosen from evidence*. The §5 "independent lanes" test fails by construction (np-10 consumes np-09's output), so single-lane.
- **np-09 is light and decisive; np-10 is the deep one.** np-09 produces a numbers doc + a go/no-go on NP-Q7. np-10 then does the safe, certain win (fewer sequential round-trips + DB-side counts) on the endpoints np-09 ranked worst.
- **R-DB-POOL is not in this wave plan.** It promotes to **np-11 (Opus)** only if np-09 + NP-Q7 say PostgREST/connection overhead dominates. If region RTT dominates, the recommendation is co-location (infra), not direct-PG.
- **Dependencies:** np-09 needs Phases 1–3 shipped (so it measures the *current* floor, not the auth tax). np-10 needs the np-09 profile.

---

## Lane-by-lane details

### Wave 1 — Measure & attribute (single lane)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | np-09 | S | Sonnet 4.6 | `backend/src/config/database.ts` (REST-only client; **no PG driver today**), `backend/src/services/patient-overview-service.ts` (the ~4-wave aggregator + `computePatientsKpis`), `backend/src/middleware/auth.ts` (post-Phase-1 timing hooks), `../../p1-backend-tax/p1-measurement-results.md`, `../../p0-measure/baseline.md` | Attribute the floor per hot endpoint: round-trips/req, payload size, p50/p95 server time, **RTT vs PostgREST overhead vs query time**, and a same-region-vs-cross-region check. **Measurement-only** (no behaviour change). Output: `p4-measurement-results.md` + ranked levers + NP-Q7 resolution. |

### Wave 2 — Collapse round-trips + DB-side counts (single lane)

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | np-10 | L | Sonnet 4.6* | the np-09 profile, `patient-overview-service.ts`, the per-section services it calls (`patient-chart-service`, `prescription-service`, `appointment-service`, `patient-service`, `patient-matching-service`), `backend/src/utils/db-helpers.ts` | Parallelize the remaining **serial** waves within per-section gating (NP-DL-7); `select`-embed sub-reads; replace KPI fetch-all-then-count-in-JS with PostgREST `count`/`head` (RPC only if unavoidable — NP-Q8). **Prove tenant isolation before flip.** `*`Escalate this task to **Opus** if it introduces a `SECURITY DEFINER` RPC or direct-PG. |

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| np-09 | S | Sonnet 4.6 | Measurement + attribution + a recommendation doc. No production code change, no PHI logic — reads the hot services and times them. |
| np-10 | L | Sonnet 4.6 (→ Opus if RPC/direct-PG) | The **safe** path (parallelize within existing owned-table services + PostgREST `count`) keeps the `doctor_id` gate exactly where it is today → Sonnet. The moment it adds new SQL surface (RPC) or a direct-PG path, it becomes a **tenant-isolation** change (NP-DL-7 / NP-R8) and escalates to Opus with the parity battery as the gate. |

**Caps respected:** 0 Opus tasks **promoted** this phase (≤ 1 Opus/wave, ≤ 2/batch). np-11 (direct-PG, Opus) is profile-gated and not yet promoted.

---

## Acceptance gates per wave

### Wave 1 gate
- [x] `p4-measurement-results.md` exists and attributes the ~484 ms trivial-GET **and** the ~2.5 s patient-overview into RTT / PostgREST overhead / round-trip count, per hot endpoint, in a prod build (NP-DL-6); ranked lever recommendation present; **NP-Q7 resolved** (go/no-go on direct-PG, or co-locate).

### Wave 2 gate
- [x] Patient-overview makes materially fewer **sequential** Supabase waves than ~4; measured cold server-time drop vs the np-09 profile (prod).
- [x] `computePatientsKpis` counts DB-side (no full-row-set transfer for new_30d/new_7d; parallel wave).
- [x] **Cross-tenant parity battery green** for every changed read path **before** flip (NP-DL-7 / NP-R8); no hand-rolled multi-table JOIN.
- [x] No endpoint/shape/route change (NP-DL-5); `tsc`/typecheck clean; backend tests green.
- [x] **Phase gate (batch plan):** all boxes in the batch-plan acceptance gate ticked.

---

## Cost estimate

| Wave | Tasks | Sonnet 4.6 chats | Opus chats | Wall-clock |
|---|---|---|---|---|
| 1 — profile | np-09 | 1 | 0 | ~0.5–1d |
| 2 — fan-out | np-10 (→ Opus if RPC/direct-PG) | 1 | 0 (1 if escalated) | ~2–4d |

_(np-11 direct-PG, if NP-Q7 = go, adds ~1 Opus chat + ~3–5d — separate promotion.)_

---

## References

- Plan: [`plan-p4-navigation-performance-data-path-batch.md`](../plan-p4-navigation-performance-data-path-batch.md)
- Product plan: [`../../../../../../Product%20plans/plan-navigation-performance.md`](../../../../../../Product%20plans/plan-navigation-performance.md)
- Model strategy: [`../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)
- Prior phase: [`../../p3-perceived-streaming/`](../../p3-perceived-streaming/) · Phase-1 finding: [`../../p1-backend-tax/p1-measurement-results.md`](../../p1-backend-tax/p1-measurement-results.md) · baseline: [`../../p0-measure/baseline.md`](../../p0-measure/baseline.md)
