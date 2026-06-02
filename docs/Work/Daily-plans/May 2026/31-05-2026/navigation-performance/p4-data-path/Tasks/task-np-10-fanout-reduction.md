# np-10 · Collapse per-request round-trips + move counts DB-side (within per-section tenant gating)

> **Phase 4, Wave 2** of [navigation-performance](../plan-p4-navigation-performance-data-path-batch.md). Shrinks the cold data-path floor (product-plan R-FANOUT / F1/F6) by cutting **sequential** Supabase round-trips on the hot read endpoints and making Postgres do the counting — **without** changing any contract (NP-DL-5) and **without** weakening tenant isolation (**NP-DL-7** / NP-R8). Driven by the np-09 profile.

| **Size** | L | **Model** | Sonnet 4.6 *(→ Opus if it must add an RPC / direct-PG — NP-DL-7)* | **Wave** | 2 | **Depends on** | np-09 (profile) | **Blocks** | — | **Status** | ✅ DONE |

---

## 📋 Task overview

The hot aggregators are slow mostly because of **serial round-trips** and **fetch-all-then-count-in-JS**, each paying the ~400–500 ms PostgREST RTT. This task removes avoidable sequential hops and pushes counting into the database — staying **inside the existing per-section service functions** so the `doctor_id` tenant gate never moves. Scope and priority follow the **np-09 profile**: optimize the endpoints/waves it ranked worst.

**Change type:** **Update existing** backend services. MUST follow [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md). **Do not start before np-09** (NP-DL-1).

**Deliverable:** [`../p4-np10-measurement-results.md`](../p4-np10-measurement-results.md)

---

## ✅ Task breakdown (hierarchical)

### 1. Collapse the patient-overview waterfall (within owned-table services)
- [x] 1.1 Fold wave A + wave B: resolve the patient row **and** the appointment/conversation ownership checks in a single parallel batch (the ownership checks don't depend on the patient row's contents, only its id, which is the input) → one wave instead of two.
- [x] 1.2 Remove the strict serial position of wave D (`fetchPaymentEvents`): it only needs `appointmentIds`, which come from the appointments section — start it the moment that section resolves rather than after **all** six, or fetch appointments slightly ahead so payments overlaps the deterministic derivation. No new endpoint.
- [x] 1.3 Where a section service issues multiple sub-reads on **its own owned tables**, use PostgREST `select` embedding to merge them into one round-trip (only within a single ownership boundary — never across tenants/tables that would require a hand-rolled JOIN, NP-DL-7).

### 2. Move KPI counts DB-side (NP-Q8)
- [x] 2.1 Replace the fetch-all-then-count-in-JS in `computePatientsKpis` with PostgREST **`count`/`head:true`** queries that carry the **same predicates** (`doctor_id`, date windows, `follow_up_value` not-null, `source='episode'`, etc.) — so Postgres returns counts, not row sets.
- [x] 2.2 Only if a count genuinely can't be expressed via PostgREST filters, add a **`SECURITY DEFINER` RPC** that takes `doctor_id` and enforces it internally — and **escalate this task to Opus** (it becomes a tenant-isolation change). Default lean is PostgREST `count` (NP-Q8), no new SQL surface.
- [x] 2.3 Keep the 60 s LRU; the win is payload + per-call cost, not cache policy.

### 3. Drop redundant page-level fan-out *(only if np-09 shows it matters)*
- [x] 3.1 Where the page already receives data from one endpoint, stop a sibling endpoint re-fetching it (e.g. `/overview` already returns `vitals_trends`). This is a **caller** change (fewer requests), not a contract change (NP-DL-5 preserved). Coordinate with the Phase-2/3 query keys so the cache stays coherent. *(Deferred — np-09 ranked backend aggregators; no caller change required for wave-2 gate.)*

### 4. Prove tenant isolation (NP-DL-7 / NP-R8 — gating)
- [x] 4.1 For **every** changed read path, run a **cross-tenant parity battery**: two doctors, overlapping patient/appointment fixtures; assert each doctor sees exactly their own rows/counts and **zero** bleed — **before** the new path is considered done.
- [x] 4.2 Diff the response payloads (shape + values) of the changed endpoints against the pre-change version on a fixture to confirm **identical contracts** (NP-DL-5).

### 5. Verify (prod build — NP-DL-6)
- [x] 5.1 Patient-overview makes **materially fewer sequential** Supabase waves than ~4; measure cold server-time vs the np-09 profile and record the delta.
- [x] 5.2 KPI endpoint transfers counts, not full row sets (confirm in logs/network).
- [x] 5.3 `tsc`/typecheck clean; backend tests green; no new errors.

---

## 🌍 Global safety gate (MANDATORY)

- [x] **Data touched?** Same clinical reads, fewer/recomposed round-trips. **Service-role bypasses RLS → the `doctor_id` TS gate MUST remain on every read** (NP-DL-7). Parity battery (4.1) is the proof.
- [x] **Any PHI in logs / serialized state?** No new PHI surfaces; counts/timings only in any logging.
- [x] **External API or AI call?** No — same Supabase backend, fewer hops.
- [x] **Retention / deletion impact?** None (reads only; no schema unless a reviewed RPC, which escalates to Opus).

---

## ✅ Acceptance & verification criteria

- [x] Patient-overview makes materially fewer **sequential** round-trips than the ~4 baseline; cold server-time drop measured vs the np-09 profile (prod, NP-DL-6).
- [x] `computePatientsKpis` computes counts **DB-side** (no full-row-set transfer).
- [x] **Cross-tenant parity battery green** for every changed read path **before** flip (NP-DL-7 / NP-R8).
- [x] Response contracts byte-identical to pre-change on fixtures (NP-DL-5); no endpoint/shape/route change.
- [x] `tsc`/typecheck clean; backend tests green.

## 🚫 Anti-goals

- ❌ **No hand-rolled multi-table JOIN** that composes tables across ownership boundaries (cross-tenant leak risk — NP-DL-7).
- ❌ Don't change response shapes, endpoints, or routes (NP-DL-5).
- ❌ Don't drop the `doctor_id` gate on any read "because it's faster".
- ❌ Don't add a `SECURITY DEFINER` RPC or direct-PG **without** escalating to Opus + the parity battery.
- ❌ Don't start before the np-09 profile exists (NP-DL-1).
- ❌ Don't weaken the per-surface `staleTime`/freshness Phase 2–3 set (NP-R4).

---

## 🔗 Related

- Depends on: [`task-np-09-db-path-profile.md`](./task-np-09-db-path-profile.md) (the profile that scopes this)
- Results: [`../p4-np10-measurement-results.md`](../p4-np10-measurement-results.md)
- Baseline: [`../../p0-measure/baseline.md`](../../p0-measure/baseline.md) · Phase-1 finding: [`../../p1-backend-tax/p1-measurement-results.md`](../../p1-backend-tax/p1-measurement-results.md)

---

**Last Updated:** 2026-05-31
**Reference:** `process/TASK_MANAGEMENT_GUIDE.md` · `process/CODE_CHANGE_RULES.md` · `process/EXECUTION-ORDER-GUIDELINES.md`
