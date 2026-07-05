# Objective tab — Phase 6: trends (vital sparklines + BMI / pediatric growth charts) — 18 Jun 2026 batch plan

> **Phase 6 of the Objective-tab program — the read-only payoff phase.** Phases 1–5 made the Objective tab *structured* (system-wise exam + Vitals 2.0), gave it the *layout engines*, the *scoped-template engine*, and *point-of-care results + media*. Every visit now captures clean, typed vitals (`vitals_bp_*`, `vitals_hr`, `vitals_wt_kg`, `vitals_ht_cm`, `vitals_spo2`, `vitals_glucose_mg_dl`, … migrations 103 + 151) on each `prescriptions` row. **But the doctor still cannot SEE a vital move over time** — every value is a point-in-time number with no history beside it (P2 shipped only a *last-visit ghost value*). Phase 6 turns that accumulated per-visit vitals history into **read-only trends**: an inline **sparkline** per vital, an expandable **weight / BMI trend chart**, and **pediatric growth-percentile charts** (weight / height / head-circumference vs a reference dataset). It writes **nothing** and changes the derived output by **zero bytes** — trends are a pure projection of data the chart already owns.
>
> **Source plan:** [`Product plans/ehr/objective-tab/plan-objective-tab.md`](../../../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md) — phase P6 (trends). Catalog detail: [`exam-catalog.md`](../../../../../capture/features/objective-tab/exam-catalog.md) §B3 (trends).
>
> **Prefix note:** tasks are `obj-25..29` (program numbering continues from P5's `obj-20..24`).
>
> **Builds on:** the shipped per-visit vitals columns on `prescriptions` (migrations 103 + 151); the existing per-patient prescription read path [`listPrescriptionsByPatient`](../../../../../../../backend/src/services/prescription-service.ts) (vitals columns + `created_at`, already doctor-scoped by RLS); P2's derived-vitals helpers ([`vitals-derive.ts`](../../../../../../../frontend/lib/cockpit/vitals-derive.ts)) for BMI / units / range flags + the **last-visit ghost value** affordance the sparkline extends; the `VitalsGrid` host. The charting library [`recharts`](../../../../../../../frontend/package.json) is **already a dependency** — no new package. **Reuse, do not fork.**
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). This is the **lightest** Objective phase: **no migration, no new column, no PHI write, no new server surface** (it reuses the shipped per-patient prescription read). obj-25 (the read-only trend-series selector + hook) and obj-26/27 (sparklines + BMI chart) are Sonnet. obj-28 (pediatric growth charts) is Sonnet but **content-heavy** (it bundles a static WHO/IAP reference dataset) and carries the one open decision (P6-D3). obj-29 (close-gate: view-only proof + a11y + sparse-data states + verification) is **Opus** (parity-fixture rigor, mirrors obj-04/obj-15/obj-19/obj-24).
>
> **Opus density:** **1 Opus task** (obj-29 close-gate) — well under the ≤2/phase line, because P6 ships no migration / storage / RLS surface. This is the easiest phase to land in the program.
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p6-objective-tab-trends.md`](./Tasks/EXECUTION-ORDER-p6-objective-tab-trends.md).

---

## What Phase 6 does (one sentence)

> **Project the already-captured per-visit vitals history (`prescriptions.vitals_*` over `created_at`, read through the shipped doctor-scoped per-patient prescription path) into read-only trends — an inline sparkline per vital, an expandable weight/BMI chart, and pediatric weight/height/HC growth-percentile charts against a bundled reference dataset — all client-rendered with the existing `recharts` dependency, writing nothing and changing the derived `buildRxPayload` output by zero bytes.**

---

## Scope (draft 2026-06-19 — confirm before promotion)

| Trend surface | Data source | Reads/writes | Mechanism | Status |
|---|---|---|---|---|
| Per-vital sparkline (inline, last N visits) | `prescriptions.vitals_*` over `created_at` (per patient) | **read-only** | `recharts` mini-line in `VitalsGrid`, extends P2's ghost value | **new (obj-26)** |
| Weight / BMI trend chart (adult, expandable) | weight + derived BMI over visits | **read-only** | expandable `recharts` line/area chart | **new (obj-27)** |
| Pediatric growth charts (wt/ht/HC percentiles) | weight/height/HC over age, + DOB + sex | **read-only** + a **bundled static reference dataset** (no PHI) | percentile curves vs WHO/IAP reference | **new (obj-28)** |
| Trend data foundation (series selector + hook) | the shipped per-patient prescription read | **read-only** | pure transform + a query hook | **new (obj-25)** |
| BP/HR/SpO₂/glucose detail trends | same per-visit vitals | **read-only** | reuse the obj-27 chart shell per metric | **new (obj-27, stretch)** |
| Lab-result trends (HbA1c, etc. over time) | `test_results_json` (P5) over visits | — | **deferred** — needs cross-visit result identity (P7+) | out |
| Vitals captured outside a visit (home monitoring) | — | — | **deferred** — no non-visit vitals store exists | out |

**Key simplification vs. P1–P5:** P6 adds **no schema and no server surface**. Every prior Objective phase added a column, a config surface, or a storage tag; P6 only *reads* what those phases already persist. The genuinely new artifact is the **static pediatric reference dataset** (obj-28) — public WHO/IAP percentile parameters bundled as app data, not PHI, not a migration.

---

## Decision lock (draft — freezes on promotion)

- **P6-D1 — trends are read-only views; no new schema, no server write (binds OBJ-D2/OBJ-D7 discipline).** Every trend is a pure projection of the per-visit `prescriptions.vitals_*` history already captured by P2, read through the **shipped** doctor-scoped per-patient prescription path (`listPrescriptionsByPatient`). A trend **never** writes a row, never changes `buildRxPayload`, and never reaches the PDF/SMS/snapshot. Re-proven byte-for-byte in the obj-29 close-gate.
- **P6-D2 — chart with the existing `recharts` dependency; no new package.** All sparklines + charts render client-side with the already-installed `recharts`. No new charting/d3 dependency, no server-side image generation.
- **P6-D3 — pediatric growth percentiles use a bundled static reference dataset, keyed by DOB + sex; absent DOB/sex hides the growth chart (graceful).** Ship a small, versioned, public reference dataset (WHO 0–5y + IAP/CDC for older children; **region default India**) as app data — *config, not PHI*. When the patient has no DOB or no recorded sex, the growth chart is hidden (never errors, never guesses). Resolves catalog §I open-Q (growth-chart data source) → **bundled WHO/IAP LMS parameters, versioned in-repo.**
- **P6-D4 — sparkline = inline last-N (default 5) visits; full chart on expand.** Each `VitalsGrid` field shows a compact inline sparkline of its recent values (extending P2's single ghost value into a mini-series); the expandable detail chart shows the full available range. Sparse data (0/1 points) renders a graceful empty/single-dot state — **never an error, never a misleading line**.
- **P6-D5 — trends are visit-derived, not a new vitals event store.** The series is "vitals as recorded on each completed prescription over time", not a dedicated longitudinal vitals table. A separate non-visit vitals timeline (home monitoring, nurse-station captures) is **deferred** to a later phase if demand proves it.
- **P6-D6 — additive + view-only; everything stays optional and degradable.** No removal of columns/fields/helpers. A patient with one visit, missing vitals, or no pediatric data still renders the tab cleanly — trends are progressive enhancement over the point-in-time grid, never a precondition for it.

---

## What this phase does NOT do (deferred)

| Item | Why / lands |
|---|---|
| Lab-result trends (HbA1c / lipid / TSH over time) | Needs cross-visit *result identity* (matching "the same test" across visits) — a structured-results follow-up (P7+), not a vitals projection. |
| Non-visit / home-monitoring vitals timeline | No store for vitals captured outside a completed prescription exists; `P6-D5` defers it. |
| Writing/editing historical vitals from the trend view | `P6-D1` — trends are strictly read-only; editing stays in the per-visit `VitalsGrid`. |
| Server-rendered chart images (for PDF/SMS) | `P6-D2` — charts are an in-cockpit decision-support view; the patient-facing PDF/SMS contract (`OBJ-D2`) is unchanged. A PDF trend snapshot is a separate decision. |
| Predictive/alerting analytics on trends | Out of scope — this phase visualizes, it does not interpret or alert. |
| Coded reference-range engine per age/sex band | Range flags stay as P2 shipped; the growth dataset is percentile-only. |

---

## Cross-cutting acceptance gate (whole phase)

Phase 6 is green only when **all** hold:

- [x] A read-only trend-series selector projects the per-patient prescription history into a typed per-vital time series (value + timestamp + unit), tolerant of missing/sparse values; it reuses the **shipped** doctor-scoped per-patient read and adds **no** new server surface, column, or migration. _(obj-25)_
- [x] Each `VitalsGrid` field renders an inline sparkline of its recent values (last N, default 5), extending P2's ghost value; sparse/single/zero-point data renders gracefully (no error, no misleading line). _(obj-26)_
- [x] An expandable weight/BMI trend chart renders the full available range with accessible axes/labels; the same chart shell serves BP/HR/SpO₂/glucose detail trends. _(obj-27)_
- [x] Pediatric weight/height/HC growth-percentile charts render against a bundled static reference dataset keyed by DOB + sex; absent DOB/sex hides the chart gracefully; the reference dataset is versioned, documented as **config not PHI**, and carries no patient data. _(obj-28)_
- [x] **View-only parity:** no trend surface changes `buildRxPayload` by a byte; trends never write a row or reach the PDF/SMS/snapshot; charts read only already-authorized, doctor-scoped data; no new dependency added (recharts reused). _(obj-29)_
- [x] a11y: sparklines + charts have text/aria descriptions and accessible labels; trends are keyboard-reachable and degrade to a readable summary; empty/sparse states are announced. _(obj-29)_
- [x] `cd frontend && npx tsc --noEmit && npm run lint && npm test` clean for the slice; `cd backend && npm test` green (pre-existing unrelated failures routed, not introduced). _(obj-29)_

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| P1 | Structured system-wise exam cards + derived-text contract (obj-01..04) | ✅ Complete |
| P2 | Vitals 2.0 (obj-05..08) | ✅ Complete |
| P3 | Layout engines + modality/specialty default visibility (obj-09..15) | ✅ Complete (2026-06-19) |
| P4 | Exam templates + specialty packs (obj-16..19) | ✅ Complete (2026-06-19) |
| P5 | Point-of-care results + media (obj-20..24) | ✅ Complete (2026-06-19) |
| **P6** | **Trends (vital sparklines + BMI / pediatric growth charts) (obj-25..29)** | ✅ Complete (2026-06-20) |

---

## Tasks (draft)

| Task | Title | Size | Model |
|---|---|---|---|
| `obj-25` | Trend data foundation: read-only per-vital time-series selector + query hook over the shipped per-patient prescription read (no schema, no new server surface) | S–M | Sonnet |
| `obj-26` | Vital sparklines: inline last-N mini-trend per `VitalsGrid` field (extends P2 ghost value) + graceful sparse-data states | M | Sonnet |
| `obj-27` | Weight / BMI trend chart: expandable `recharts` detail chart (adult), reusable shell for BP/HR/SpO₂/glucose | M | Sonnet |
| `obj-28` | Pediatric growth charts: weight/height/HC percentile curves vs a bundled static WHO/IAP reference dataset, keyed by DOB + sex | M–L | Sonnet (content-heavy; carries P6-D3 open decision) |
| `obj-29` | Close-gate: trend view-only byte-parity + a11y + sparse/empty-data states + verification gate | M | **Opus** |

---

## Cost estimate

| Wave | Tasks | Auto/Sonnet | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | obj-25 (trend-series selector + hook) | 1 | 0 | ~2–3h |
| Wave 2 | obj-26 (sparklines) | 1 | 0 | ~3–4h |
| Wave 3 | obj-27 (weight/BMI + reusable chart shell) | 1 | 0 | ~3–4h |
| Wave 4 | obj-28 (pediatric growth charts + reference dataset) | 1 | 0 | ~4–5h |
| Wave 5 | obj-29 (close-gate + verification) | 0 | 1 | ~2–4h |
| **Total** | **5** | **4** | **1** | **~14–20h agent-time** |

**Caps check:** ≤1 Opus per wave ✓. **Phase Opus count = 1** — the lightest phase in the program (no migration / storage / RLS). obj-26/27 *could* run in parallel after obj-25 if a second runner is available (both consume the obj-25 series, neither depends on the other); obj-28 depends only on obj-25 + the chart shell, so it can also branch.

---

## Sequencing notes

- **obj-25 first (read-only substrate).** A pure transform: take the shipped per-patient prescription list and project a typed `{ metric, points: { value, unit, at }[] }` series per vital, tolerant of nulls/sparse rows. A thin query hook wraps the existing read (no new endpoint). Everything downstream consumes this series — freeze its shape first.
- **obj-26 next (sparklines).** The smallest visible win: an inline `recharts` mini-line per `VitalsGrid` field, extending P2's last-visit ghost value into a recent-history glance. Graceful with 0/1 points.
- **obj-27 (weight/BMI + chart shell).** The first expandable detail chart (weight + derived BMI), built as a **reusable chart shell** so BP/HR/SpO₂/glucose detail trends reuse it. Accessible axes + range.
- **obj-28 (pediatric growth charts).** The one content-heavy task: bundle a small versioned WHO/IAP percentile reference dataset (config, not PHI), plot the child's weight/height/HC against percentile curves keyed by DOB + sex, hide gracefully when DOB/sex is absent. Carries the P6-D3 open decision (confirm the reference source/region at promotion).
- **obj-29 last (prove + gate).** View-only byte-parity (no trend reaches `buildRxPayload`), a11y sweep, empty/sparse-data states, verification gate. Mirrors obj-04 + obj-15 + obj-19 + obj-24.

---

## Open questions (resolve before promotion)

- [ ] **P6-D3 reference source/region** — confirm WHO 0–5y + IAP (India) for older children vs CDC; confirm the dataset is bundled in-repo (versioned) vs fetched. Catalog §I.
- [ ] **Sparkline N** — default last-5 visits, or a fixed time window (e.g. 12 months)? (P6-D4 default = last 5.)
- [ ] **Trend home** — sparklines inline in `VitalsGrid` only, or also a dedicated "Trends" expandable section in the Objective tab registry (P3)? (Draft: inline + an expandable detail, no new top-level registry section.)
- [ ] **PDF trend snapshot** — explicitly deferred (P6-D2); confirm no patient-facing surface needs it in this phase.

---

## References

- **Source:** [`Product plans/ehr/objective-tab/plan-objective-tab.md`](../../../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md) — P6.
- **Catalog detail:** [`capture/features/objective-tab/exam-catalog.md`](../../../../../capture/features/objective-tab/exam-catalog.md) §B3 (trends) + §I (open questions).
- **Pattern precedents reused:** P2 vitals + derived helpers ([`p2-vitals-2/`](../p2-vitals-2/)); the per-patient prescription read ([`prescription-service.ts`](../../../../../../../backend/src/services/prescription-service.ts)); the P1/P3/P4/P5 close-gate rigor ([`objectiveLayoutParity.test.tsx`](../../../../../../../frontend/components/cockpit/rx/sections/__tests__/objectiveLayoutParity.test.tsx) + siblings).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-20. **Status:** ✅ **Complete** (2026-06-20) — Phase 6 of the Objective-tab program; trends slice landed (obj-25..29).
