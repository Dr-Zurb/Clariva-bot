# Navigation performance — Phase 4: data-path latency — batch plan

> **Product plan (what + why + decision locks):** [`../../../../../Product%20plans/plan-navigation-performance.md`](../../../../../Product%20plans/plan-navigation-performance.md) — R-DB-PROFILE + R-FANOUT (+ R-DB-POOL, profile-gated).
>
> **The last lever for the *cold* server floor.** Phases 1–3 removed the auth tax, cached repeat-nav (TanStack Query), and made cold nav *feel* instant (skeletons + SSR streaming). But the **first-visit data still lands at backend speed**: a trivial authenticated GET sits at ~484 ms p50 (the Supabase **PostgREST round-trip**, not auth — Phase 1 finding), and patient-overview is ~2.5 s cold. Phase 4 attacks that data path directly.
>
> **Encodes:** **NP-DL-1** (measure first — np-09 profiles before np-10 changes anything), **NP-DL-5** (no API/route/contract change), **NP-DL-6** (prove wins in a **prod** build), **NP-DL-7** (preserve tenant isolation — no hand-rolled cross-table JOIN; cross-tenant parity battery before any flip), and mitigates **NP-R8** (data-path change leaks rows across tenants).
>
> **Cost-aware model strategy:** [`../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p4-navigation-performance-data-path.md`](./Tasks/EXECUTION-ORDER-p4-navigation-performance-data-path.md).

---

## The problem this phase fixes (verified in code + measurement)

Phases 1–3 took everything *off* the data path; what's left **is** the data path. Three concrete, code-verified causes of the residual cold floor:

1. **Per-request serial round-trip waterfalls.** `getPatientOverview` (`backend/src/services/patient-overview-service.ts`) runs **~4 sequential Supabase waves**: `findPatientByIdWithAdmin` → `Promise.all[appointment + conversation ownership checks]` → `Promise.all[6 chart sections]` → `fetchPaymentEvents`. At ~400–500 ms per PostgREST round-trip from this host, that alone is ~1.6–2 s before composition — consistent with the ~2.5 s baseline.
2. **Fetch-all-then-count-in-JS.** `computePatientsKpis` pulls **every** appointment row and **every** follow-up prescription for the doctor and counts them in TypeScript (`latestAptByPatient`, `followupOverduePatients`, …) rather than asking Postgres to count. Large payloads + serial reads, behind only a 60 s LRU.
3. **The PostgREST RTT floor itself.** Even a trivial single-table GET is ~484 ms p50. Whether that's **cross-region network**, **PostgREST/connection overhead**, or **query time** is *not yet attributed* — and the right fix depends on which it is.

Phase 3 hid (1)–(3) perceptually; Phase 4 actually shrinks them.

---

## Scope (this phase)

| Task | Title | Status |
|---|---|---|
| [np-09](./Tasks/task-np-09-db-path-profile.md) | **Profile the data-path floor** (measure-first): attribute the ~484 ms / ~2.5 s into RTT vs PostgREST overhead vs round-trip count, per hot endpoint; emit a ranked lever recommendation | ✅ done |
| [np-10](./Tasks/task-np-10-fanout-reduction.md) | **Collapse per-request round-trips + SQL-side counts**: parallelize the overview waterfall within per-section gating, move KPI counts DB-side, drop redundant page fan-out | ✅ done |

**Profile-gated (NOT in scope until np-09 says so):** **R-DB-POOL** — pooled direct-Postgres (`postgres.js`/`pg` + pgBouncer/Supavisor) for the hottest reads. Promotes to **np-11** only if np-09 attributes the dominant cost to PostgREST/connection overhead and **NP-Q7 = go**. If region RTT dominates, co-location (NP-Q5 lever c) is the cheaper win and direct-PG is skipped.

**Order (see exec-order):** np-09 (Wave 1, ~0.5–1d) measures and decides; np-10 (Wave 2, ~2–4d) ships the safe fan-out win against the np-09 numbers. Strictly sequential — NP-DL-1 forbids changing the data path before it's attributed.

**Deliverable:** a `p4-measurement-results.md` attributing the floor + ranking levers (np-09); a **materially faster cold patient-overview** (fewer sequential round-trips, proven in prod vs the np-09 profile) and **KPI counts computed DB-side** (no full-row-set transfer) (np-10); **tenant-isolation parity battery green**; **zero API/route/contract change**.

---

## Decision locks honoured

- **NP-DL-1 — measure first.** np-09 is pure measurement/attribution; np-10 may not start until the profile exists. The lever ranking (parallelize vs aggregate vs pooled-PG vs co-locate) is an *output* of np-09, not a guess.
- **NP-DL-5 — no contract change.** Same endpoints, shapes, routes. np-10 changes *how many* round-trips a handler makes and *where* counting happens — never the response contract.
- **NP-DL-6 — prove in prod.** `next build` / prod API; the np-09 numbers and np-10's before/after are taken from a prod build, not `dev`.
- **NP-DL-7 — preserve tenant isolation (the governing constraint this phase).** Every read stays gated on `doctor_id` exactly as the per-section TS services do today. **No hand-rolled multi-table JOIN** (the explicit cross-tenant-leak warning in `patient-overview-service.ts`). Any SQL-side count or RPC keeps the same ownership predicate and passes a cross-tenant parity battery **before** flip.

---

## Security note (NP-DL-7 / NP-R8 — read before np-10)

The hot aggregators already run on the **service-role (admin) client**, which **bypasses RLS**; tenant isolation today is enforced **in TypeScript** (`.eq('doctor_id', userId)` in every section service). That means any Phase 4 change which moves work into SQL — a `SECURITY DEFINER` RPC, a broader `select` embed, or (later) direct-PG — inherits the **full** responsibility for the `doctor_id` gate. The risk is silent cross-tenant row leakage, not a crash. Mitigation is mandatory and gates the phase:

- Prefer optimizations that **stay inside the existing per-section service functions** (parallelize, `select`-embed within one owned table set, PostgREST `count`) — they keep the gate where it already is.
- For anything that can't (a new RPC, direct-PG), add a **cross-tenant parity battery**: same inputs, two doctors, assert zero row bleed, run **before** the new path goes live.
- **NP-Q8** leans PostgREST `count` over a new RPC precisely to avoid adding SQL surface that re-implements the gate.

---

## Acceptance gate (phase)

- [x] **Floor attributed (np-09).** `p4-measurement-results.md` breaks the ~484 ms trivial-GET and the ~2.5 s patient-overview into RTT vs PostgREST overhead vs round-trip count, **per hot endpoint**, in a prod build (NP-DL-6), with a ranked lever recommendation that resolves **NP-Q7**.
- [x] **Fewer round-trips (np-10).** Patient-overview makes materially fewer **sequential** Supabase waves than the ~4 today; cold server time drops measurably vs the np-09 profile.
- [x] **DB-side counts (np-10).** `computePatientsKpis` no longer transfers full appointment/prescription row sets to count in JS (PostgREST `count`/`head` or a reviewed RPC — NP-Q8).
- [x] **Tenant isolation proven (NP-DL-7 / NP-R8).** A cross-tenant parity battery is green for every changed read path **before** flip; no hand-rolled cross-table JOIN introduced.
- [x] **No contract/route/surface change (NP-DL-5).**
- [x] **Hygiene.** `npm run typecheck`/`tsc` clean; existing backend tests green; no behaviour change beyond latency.

---

#### Phase 4 result (2026-05-31)

**Shipped** (np-09/10 `✅ DONE`; [`p4-measurement-results.md`](./p4-measurement-results.md) + [`p4-np10-measurement-results.md`](./p4-np10-measurement-results.md)).

| Metric | np-09 baseline | After np-10 | Notes |
|--------|---------------:|------------:|-------|
| Patient overview (in-process p50) | **1833 ms** | **949 ms** | **−48%**; ~4 serial waves → ~2 |
| KPI cold (in-process p50) | **~2350 ms** | **1011 ms** | **−57%**; parallel wave + `count`/`head` for new patients |
| Trivial GET floor | **454 ms** | unchanged | Per-RTT cost is infra (co-location), not code |
| NP-Q7 (direct-PG) | — | **NO-GO** | np-11 not promoted; co-location + np-10 wins first |

**North-star (< ~100 ms cold server floor):** not met on trivial GET — remaining gap is **~230–450 ms per PostgREST round-trip** (HTTPS + hosted Supabase). Next infra lever: **co-locate API with Supabase region** (DEL edge / ap-south-1). np-11 (direct-PG) stays deferred unless co-located floor still > ~100 ms.

---

**Prior phase:** [`../p3-perceived-streaming/`](../p3-perceived-streaming/) (felt-speed). Baseline: [`../p0-measure/baseline.md`](../p0-measure/baseline.md) · Phase-1 finding: [`../p1-backend-tax/p1-measurement-results.md`](../p1-backend-tax/p1-measurement-results.md).
**Next:** with the cold floor addressed, the program's North-star (sub-100 ms authenticated cold reads) is either met or bounded by infra (region). Remaining items are deployment-layer (NP-D3 edge/ISR) and bundle-size (NP-D2) — separate axes, out of this plan.
