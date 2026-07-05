# SOAP data placement — Phase 1: results consolidation (single authoring home) — 25 Jun 2026 batch plan

> **Phase 1 of the SOAP data-placement program.** Today the same `prescriptions.test_results` value is editable in **two** SOAP panes: in **Objective** via `TestResultsList`'s legacy free-text textarea (`showLegacyTextarea`, alongside the structured rows), and again in **Plan** via the standalone `TestResultsField`. Two editors for one field means a result typed in Plan and a result typed in Objective race for the same column, and it muddies the mental model (results belong to Objective, not Plan). Phase 1 **removes the Plan-side editor** so Objective is the single authoring home for results. **Frontend-only — no schema, no API, no data migration:** the value already persists in `prescriptions.test_results` and is derived by `buildRxPayload` from the structured rows (with legacy free-text passthrough), so removing the Plan UI changes nothing downstream.
>
> **Source plan:** [`Product plans/ehr/soap-data-placement/plan-soap-data-placement.md`](../../../../../Product%20plans/ehr/soap-data-placement/plan-soap-data-placement.md) — Phase P1; decision **SDP-D1**; inherits `SDP-D1..D5`.
>
> **Prefix note:** task is `sdp-01` (program numbering starts here; P2 = `sdp-02..04`, P3 = `sdp-05..07`).
>
> **Builds on:** the shipped Objective-tab P5 derived-results contract (`test_results_json` → `test_results` derive in `buildRxPayload`, `RxFormContext.tsx`) and the Objective `TestResultsList` (which already hosts the structured rows + the legacy textarea escape hatch). **Reuse, do not fork.**
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). `sdp-01` is **Auto/Sonnet** — a UI-only removal of one duplicate field + test updates; no schema, no PHI column, no RLS, no migration. No Opus tasks in this phase.
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p1-soap-data-placement-results-consolidation.md`](./Tasks/EXECUTION-ORDER-p1-soap-data-placement-results-consolidation.md).

---

## What Phase 1 does (one sentence)

> **Remove the duplicate `TestResultsField` from the Plan section so the Objective `TestResultsList` (structured rows + legacy free-text escape hatch) is the single authoring home for test results, update the tests that asserted the Plan-side field, and prove `buildRxPayload` output is unchanged.**

---

## Scope

| Surface | Change | Mechanism |
|---|---|---|
| Plan section | **Remove** `TestResultsField` (component + its render in `PlanSection`) | delete the component + call site |
| Objective section | **Unchanged** — keeps structured rows + the legacy `test_results` textarea (`showLegacyTextarea`) | no change |
| `buildRxPayload` / derivation | **Unchanged** — `test_results` still derives from `testResultsStructured`, legacy text passthrough | no change |
| Tests | Update any test asserting the Plan-side test-results field; add/keep a payload-parity assertion | vitest |

**Out of scope:** removing the Objective legacy textarea (SDP-D5 keeps the escape hatch); any schema/API/migration; P2 media; P3 timeline.

---

## Decision lock (inherited)

Inherits **SDP-D1** (results' single authoring home is Objective; remove the Plan editor) and **SDP-D5** (note ≠ chart; additive only — the Objective legacy escape hatch stays). No new decisions in this phase.

---

## Cross-cutting acceptance gate (whole phase)

Phase 1 is green only when **all** hold:

- [x] `TestResultsField` no longer renders in the Plan section; the field is not reachable from Plan in any mount surface (appointment-detail / in-call / post-call read-only). _(sdp-01)_
- [x] The Objective `TestResultsList` still hosts structured rows + the legacy `test_results` textarea escape hatch (unchanged). _(sdp-01)_
- [x] `buildRxPayload` output is **byte-identical** for the same form state before/after the removal — `test_results` still derives from structured rows with legacy free-text passthrough; no field dropped (proven by `objectiveResultsParity` + `rxFormContext.testResults`). _(sdp-01)_
- [x] No test asserted the Plan-side field (composition-root mocks `PlanSection`); the parity suites cover the no-regression claim. _(sdp-01)_
- [x] Lint clean on the touched file; targeted vitest slice **55/55 pass**. Repo-wide `tsc` errors are pre-existing unrelated WIP noise — none in `PlanSection.tsx` or the slice. _(sdp-01)_

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| **P1** | **Results consolidation — remove the duplicate Plan-side editor (sdp-01)** | ✅ Complete (2026-06-25) |
| P2 | Per-complaint symptom media (sdp-02..04) | 🗒 Drafted |
| P3 | Investigations & results timeline (sdp-05..07) | 🗒 Drafted |

---

## Tasks

| Task | Title | Size | Model |
|---|---|---|---|
| `sdp-01` | Remove the Plan-side `TestResultsField`; Objective is the single results home; update tests + prove payload parity | S | Auto/Sonnet |

---

## Sequencing notes

- Single-task phase. `sdp-01` is a self-contained, frontend-only removal. It ships independently and immediately — it is the safe "align the obvious duplication" slice before the larger P2 (media) and P3 (timeline) work.

---

## References

- **Source:** [`Product plans/ehr/soap-data-placement/plan-soap-data-placement.md`](../../../../../Product%20plans/ehr/soap-data-placement/plan-soap-data-placement.md) — P1, `SDP-D1`/`SDP-D5`.
- **Pattern precedent:** Objective-tab P5 derived-results contract — [`../../18-06-2026/objective-tab/p5-poc-results-media/`](../../../18-06-2026/objective-tab/p5-poc-results-media/).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-25. **Status:** ✅ `Complete` (2026-06-25) — Phase 1 of the SOAP data-placement program; results consolidated to a single Objective home by sdp-01.
