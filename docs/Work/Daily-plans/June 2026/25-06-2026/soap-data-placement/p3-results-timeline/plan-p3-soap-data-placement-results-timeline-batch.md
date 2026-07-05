# SOAP data placement — Phase 3: investigations & results timeline — 25 Jun 2026 batch plan

> **Phase 3 of the SOAP data-placement program (the "new angle").** P1 gave results a single authoring home (Objective); P2 pinned symptom photos to complaints. But the doctor still cannot see, in one place, **"what did I order / what came back"** across visits — the SOAP note is per-encounter, and the chart panel has Allergies / Conditions / Problems / Vitals / Previous-Rx but **no results timeline.** Phase 3 adds a **read-only "Investigations & Results" section to `PatientChartPanel`**, a pure longitudinal projection across the patient's prescriptions of **ordered** investigations (`prescriptions.investigations`) + **resulted** rows (`prescriptions.test_results_json`) + a per-visit media indicator. This is the longitudinal home for "investigations + reports together" (SDP-D2/D4) — it **never** changes SOAP authoring (note ≠ chart, SDP-D5).
>
> **Source plan:** [`Product plans/ehr/soap-data-placement/plan-soap-data-placement.md`](../../../../../Product%20plans/ehr/soap-data-placement/plan-soap-data-placement.md) — Phase P3; decision **SDP-D4**; inherits `SDP-D1..D5`.
>
> **Prefix note:** tasks are `sdp-05..07` (program numbering continues from P2's `sdp-02..04`).
>
> **Builds on:** the shipped chart-panel pattern — read-only doctor-scoped endpoints in [`patient-chart-routes.ts`](../../../../../../../backend/src/routes/api/v1/patient-chart-routes.ts) → [`patient-chart-controller.ts`](../../../../../../../backend/src/controllers/patient-chart-controller.ts) → [`patient-chart-service.ts`](../../../../../../../backend/src/services/patient-chart-service.ts) (the `/problems` T5.25 read-only handler is the closest analog), the chart UI host [`PatientChartPanel.tsx`](../../../../../../../frontend/components/ehr/PatientChartPanel.tsx) + its `SectionWrapper` + count-callback pattern (e.g. [`PreviousRxSection.tsx`](../../../../../../../frontend/components/ehr/sections/PreviousRxSection.tsx)), and the shipped results columns from objective-tab P5 (`prescriptions.investigations` text + `test_results_json` rows). **Reuse, do not fork.**
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). `sdp-05` (the new `GET /chart/results` read endpoint — service aggregation + controller + route + PHI-safe doctor-scoped reads) is **Opus** — a **new cross-layer endpoint reading PHI** across prescriptions. `sdp-06` (the `ResultsTimelineSection` UI in `PatientChartPanel`) and `sdp-07` (close-gate: projection correctness + read-only + a11y + verification) are **Sonnet** (thin consumers of the shipped chart-section pattern).
>
> **⚠️ Escalation note (agent contract):** `sdp-05` trips the "new endpoint / cross-layer" rule → **run on Opus.** It adds **no** migration, table, or view (P3-D1 — direct `prescriptions` query + TS assembly), but the new endpoint + PHI reads are Opus-grade. Keep ≤1 Opus task in this phase.
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p3-soap-data-placement-results-timeline.md`](./Tasks/EXECUTION-ORDER-p3-soap-data-placement-results-timeline.md).

---

## What Phase 3 does (one sentence)

> **Add a read-only `GET /api/v1/patients/:patientId/chart/results` endpoint that projects each of the patient's prescriptions into a date-sorted timeline of ordered investigations + resulted rows + a media indicator (doctor-scoped, PHI-safe, no new schema), and render it as a `ResultsTimelineSection` in `PatientChartPanel` after Vitals — authoring stays in SOAP.**

---

## Scope

| Surface | Change | Mechanism | Task |
|---|---|---|---|
| Read endpoint | new `GET /chart/results` — list the patient's prescriptions' results, date-desc | route + controller + service (mirror `/problems`) | `sdp-05` |
| Aggregation | per visit: `{ date, ordered: investigations text, resulted: test_results_json rows, mediaCount }` | TS assembly over a direct `prescriptions` query | `sdp-05` |
| Ownership / PHI | doctor-scoped (same path as previous-Rx / problem-list); `logDataAccess`; never log values | service | `sdp-05` |
| Chart UI | `ResultsTimelineSection` mounted in `PatientChartPanel` after Vitals, before Previous Rx | `SectionWrapper` + count callback | `sdp-06` |
| API wrapper | `getPatientResultsTimeline(patientId, token)` in `lib/api.ts` | mirror `getChartVitals` | `sdp-06` |
| Read-only | view-only — no add/edit (authoring stays in SOAP, SDP-D5) | UI | `sdp-06` |

**Out of scope:** any write/edit from the chart; new table/view/migration; precise attachment↔result-row linkage (per-visit media indicator only); coded (LOINC) results; charting/sparklines (that's objective-tab P6 trends).

---

## Decision lock (Phase 3 — freezes on promotion)

- **P3-D1 — read-only projection, no new schema.** The endpoint queries `prescriptions` directly (the patient's rows, selecting `investigations`, `test_results_json`, `created_at`/visit date) and assembles the timeline in TS. **No new table, view, or migration** (truest to SDP-D4). If read volume later warrants, a `patient_results_timeline_v` view is a fast-follow — not P3.
- **P3-D2 — the timeline row is per visit.** One entry per prescription: `{ visitDate, ordered (investigations text, nullable), resulted (test_results_json rows, possibly empty), mediaCount }`. Sorted visit-date descending. Ordered + resulted live under the same visit so the "ordered last visit → resulted this visit" loop reads naturally.
- **P3-D3 — doctor-scoped + PHI-safe (mirror the chart reads).** Same ownership enforcement as the shipped chart endpoints; `logDataAccess` with ids/counts only — never investigation/result values.
- **P3-D4 — mounts in `PatientChartPanel`, read-only, after Vitals.** A `SectionWrapper`-wrapped `ResultsTimelineSection` with a count badge; no add/edit affordances (SDP-D5 — authoring stays in SOAP). Honors the panel's desktop / in-call / mobile layouts + `readonly` mode.
- **P3-D5 — media is a per-visit indicator, not per-result.** Show a count/thumbnail of that visit's report-scan (`objective`) attachments alongside its results; precise attachment-to-result-row linkage is deferred (not modeled today).

---

## What this phase does NOT do (deferred)

| Item | Why / lands |
|---|---|
| New table / view / migration | P3-D1 — direct `prescriptions` query + TS assembly; a view is a perf fast-follow only. |
| Any write/edit of results from the chart | SDP-D5 — the chart is a read surface; authoring stays in Objective. |
| Precise attachment↔result-row linkage | P3-D5 — per-visit media indicator only; not modeled today. |
| Trend sparklines / charts for results | Objective-tab P6 (trends). |
| Pulling *pending* orders from a separate orders system | No orders system exists; "ordered" = the `investigations` text on the visit. |

---

## Cross-cutting acceptance gate (whole phase)

Phase 3 is green only when **all** hold:

- [ ] `GET /chart/results` returns the patient's visits date-desc, each with ordered investigations + resulted rows + media count; **doctor-scoped**; **PHI-safe logs** (ids/counts only); **no new table/view/migration**. _(sdp-05)_
- [ ] A patient with no results returns an empty timeline cleanly; a visit with only an order (no result) and a visit with only a result both render correctly. _(sdp-05/06)_
- [ ] `ResultsTimelineSection` renders in `PatientChartPanel` after Vitals (count badge), read-only, across desktop / in-call / mobile + `readonly` mode; no add/edit affordances. _(sdp-06)_
- [ ] Projection correctness: ordered text + resulted rows attribute to the right visit/date; media count matches that visit's objective report-scan attachments. _(sdp-07)_
- [ ] a11y: the timeline is keyboard + screen-reader navigable; no PHI in labels/logs. _(sdp-07)_
- [ ] `cd frontend && npx tsc --noEmit && npm run lint && npm test` clean for the slice; `cd backend && npm test` green (pre-existing unrelated failures routed, not introduced). _(sdp-07)_

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| P1 | Results consolidation (sdp-01) | ✅ Complete (2026-06-25) |
| P2 | Per-complaint symptom media (sdp-02..04) | ✅ Complete (2026-06-25, separate session) |
| **P3** | **Investigations & results timeline (sdp-05..07)** | 🚧 Committed |

---

## Tasks

| Task | Title | Size | Model |
|---|---|---|---|
| `sdp-05` | `GET /chart/results` read endpoint: route + controller + service aggregation (ordered + resulted + media) over a direct `prescriptions` query; doctor-scoped; PHI-safe; no new schema | M | **Opus** (new cross-layer endpoint + PHI reads) |
| `sdp-06` | `ResultsTimelineSection` in `PatientChartPanel` (after Vitals) + `getPatientResultsTimeline` API wrapper; read-only; layout/`readonly` aware | M | Sonnet |
| `sdp-07` | Close-gate: projection correctness (attribution + media count) + empty/edge states + read-only + a11y + verification | S–M | Sonnet |

---

## Cost estimate

| Wave | Tasks | Auto/Sonnet | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | sdp-05 (read endpoint + aggregation) | 0 | 1 (endpoint/PHI) | ~3–4h |
| Wave 2 | sdp-06 (chart section + API wrapper) | 1 | 0 | ~3–4h |
| Wave 3 | sdp-07 (close-gate) | 1 | 0 | ~2–3h |
| **Total** | **3** | **2** | **1** | **~8–11h agent-time** |

**Caps check:** ≤1 Opus per wave ✓. **Phase Opus count = 1** (sdp-05).

---

## Sequencing notes

- **sdp-05 first (the endpoint).** The UI needs the timeline shape + endpoint before it can render. Opus per the new-endpoint / PHI-reads rule; bounded by P3-D1 (no schema — direct query + TS assembly).
- **sdp-06 next (the section).** Mirror a shipped chart section (`PreviousRxSection` / `ProblemListSection`) + `SectionWrapper`; mount after Vitals; read-only.
- **sdp-07 last (prove + gate).** Projection correctness (right visit/date attribution, media count), empty/edge states, read-only across all panel layouts, a11y, verification gate.

---

## References

- **Source:** [`Product plans/ehr/soap-data-placement/plan-soap-data-placement.md`](../../../../../Product%20plans/ehr/soap-data-placement/plan-soap-data-placement.md) — P3, `SDP-D4`.
- **Prior phases:** [`../p1-results-consolidation/`](../p1-results-consolidation/) · [`../p2-complaint-media/`](../p2-complaint-media/).
- **Pattern precedent:** the chart-panel read-only `/problems` handler (T5.25) + `ProblemListSection` / `PreviousRxSection`.
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-25. **Status:** 🚧 `Committed` (2026-06-25) — Phase 3 of the SOAP data-placement program; **not yet implemented**.
