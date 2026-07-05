# Plan — SOAP data placement (results · media · longitudinal results view)

## Give every clinical datum exactly one authoring home, and a longitudinal read home — without breaking SOAP

> **Status:** `Drafted` 2026-06-25. Phase 1 ✅ `Complete` (frontend-only). Phase 2 ✅ `Complete` (per-complaint media — separate session). Phase 3 🚧 `Committed` 2026-06-25 (promoted to task files; not yet implemented — `sdp-05` Opus, new `/chart/results` endpoint).
>
> **Why now:** as the Objective tab matured (structured exam, Vitals 2.0, structured results, media), three placement gaps surfaced that span more than one SOAP pane and so don't belong to the objective-tab program: (1) **results are editable in two panes** — the same `prescriptions.test_results` value has a free-text editor in **both** Objective (`TestResultsList` legacy textarea) **and** Plan (`TestResultsField`); (2) **symptom photos have no home next to the complaint that prompted them** (media is Objective-only today); (3) there is **no longitudinal "what did I order / what came back" view** — the chart panel has Allergies / Conditions / Problems / Vitals / Previous-Rx, but no results timeline.
>
> **Governing principle (the whole plan in one line):** placement follows **who produced the datum, when, and intent.** An investigation *ordered* is a future action → **Plan**; a result *reviewed* is fact-at-this-visit → **Objective**. Media attaches **where it is described** (symptom photo → Subjective complaint; report/scan → Objective). The desire to see "investigations + reports together" is a **chart/longitudinal** need, served by a read-only timeline — **not** by restructuring per-encounter SOAP authoring (note ≠ chart).
>
> **Schema posture:** additive only. P1 is **frontend-only** (no schema, no API — the derived-text contract already handles results). P2 reuses the shipped `prescription_attachments` storage with a new path segment (no new bucket/column/RLS). P3 is a **read-only projection** of shipped columns (no new table).
>
> **Depends on:** the shipped Objective-tab P5 structured results + media (`prescriptions.test_results_json`, `prescription_attachments` `objective/` path segment), the subjective structured complaints (`prescriptions.complaints` JSONB with a stable per-complaint `id`), and the EHR T1 `PatientChartPanel`.

---

## Scope — what each datum's home is

| Datum | Authoring home | Longitudinal home | Disposition |
|---|---|---|---|
| Investigations **ordered** (pending) | **Plan** (`InvestigationsChipRow` / `investigationsOrders`) | Results timeline (P3) | ✅ already correct — affirm |
| Results **reviewed** (patient-brought + in-clinic POC) | **Objective** (`TestResultsList` structured rows + legacy escape hatch) | Results timeline (P3) | **Consolidate** — remove the duplicate Plan editor (P1) |
| Report / scan media (lab PDF, ECG, X-ray) | **Objective** (`ObjectiveMediaStrip`) | Results timeline (P3) | ✅ already correct |
| Symptom photo (rash / wound / swelling) | **Subjective**, pinned to the complaint | — | **New** — per-complaint media (P2) |
| Vitals, structured exam | **Objective** | Vitals trends (shipped P6) | ✅ already correct |
| Mental state exam (MSE) | Objective (observed) when it lands | — | Deferred (objective-tab open Q) |

**Decision rationale (own vs. link):** an *ordered* investigation has no result yet — it is an instruction for the future, so it lives in Plan. A *result* (whether the patient brought it or it was run in-clinic) is data the clinician reviews as fact this visit, so it lives in Objective. Merging the two into one section conflates an action with data; the satisfying "ordered last visit → resulted this visit" loop is a **longitudinal** view, served by P3.

---

## Decisions — LOCKED 2026-06-25

| ID | Decision | Implication |
|----|----------|-------------|
| **SDP-D1** | **Results have a single authoring home: Objective.** Remove the Plan-side free-text test-results editor (`TestResultsField` in `PlanSection`). The Objective `TestResultsList` (structured rows + legacy textarea escape hatch) is canonical. | **Frontend-only**, no data loss — the value already lives in `prescriptions.test_results` and is edited from Objective; `buildRxPayload` derivation is unchanged. P1. |
| **SDP-D2** | **Investigations *ordered* stay Plan-owned; only *results* surface in Objective.** | Affirms the shipped split; no change. Cross-referenced by P3 (the timeline reads both). |
| **SDP-D3** | **Symptom media is per-complaint (Option B), via the shipped `prescription_attachments` storage tagged `subjective/{complaintId}/`.** No new bucket / column / RLS — the prescription-scoped policy (migration 026) already covers it, mirroring the shipped `objective/` segment (P5-D4). Pinned to the complaint's stable `id`. | P2. Orphan handling (complaint deleted) specified in the P2 task. Backend service + validation change is **Opus** (storage + PHI media + RLS verify). |
| **SDP-D4** | **A read-only "Investigations & Results" timeline lives in the chart panel** (`PatientChartPanel`), a pure projection across the patient's prescriptions of `investigations` (ordered) + `test_results_json` rows (resulted) + patient-brought media, date-sorted. **No new table** (mirrors the P6 trends posture). | P3. New read-only `GET /chart/results` endpoint + a `ResultsTimelineSection` — **Opus** (new endpoint + cross-layer). SOAP authoring is untouched. |
| **SDP-D5** | **Note ≠ chart; additive only.** SOAP panes remain the per-encounter *authoring* surface; aggregation / longitudinal views live in the chart panel. All legacy escape hatches (free-text results, free-text vitals/exam) are retained. | No removal of columns/sections; no AI/OCR parse of scans (compliance gate, same as subj-14 §4). |

---

## Phases

> Promotion is **one phase at a time** ([`PHASED-PLANS-GUIDE.md`](../../../process/PHASED-PLANS-GUIDE.md) §6). Only **Phase 1** is promoted to dated task files today; P2–P3 are drafted here and promote as sibling `pN-` subfolders under the **same** program folder when their decisions are confirmed.

| Phase | Theme | Items | Schema | Model | Status |
|---|---|---|---|---|---|
| **P1** | Results consolidation — remove the duplicate Plan-side test-results editor; Objective is the single home | `sdp-01` | none (frontend-only) | Auto/Sonnet | ✅ **Complete** 2026-06-25 → [`Daily-plans/.../25-06-2026/soap-data-placement/p1-results-consolidation/`](../../../Daily-plans/June%202026/25-06-2026/soap-data-placement/p1-results-consolidation/) |
| **P2** | Per-complaint symptom media — `subjective/{complaintId}/` attachment segment + a per-complaint photo strip in Subjective | `sdp-02..04` | none (reuse `prescription_attachments`) | **Opus** (storage/PHI/RLS) + Sonnet | ✅ **Complete** 2026-06-25 → [`Daily-plans/.../25-06-2026/soap-data-placement/p2-complaint-media/`](../../../Daily-plans/June%202026/25-06-2026/soap-data-placement/p2-complaint-media/) |
| **P3** | Investigations & Results timeline — read-only `GET /chart/results` projection + `ResultsTimelineSection` in `PatientChartPanel` | `sdp-05..07` | none (read-only projection) | **Opus** (new endpoint, cross-layer) | **Committed** 2026-06-25 (not implemented) → [`Daily-plans/.../25-06-2026/soap-data-placement/p3-results-timeline/`](../../../Daily-plans/June%202026/25-06-2026/soap-data-placement/p3-results-timeline/) |

### P2 detail (promoted — see the [batch plan](../../../Daily-plans/June%202026/25-06-2026/soap-data-placement/p2-complaint-media/plan-p2-soap-data-placement-complaint-media-batch.md); decisions `P2-D1..D5` freeze there)
- `sdp-02` — **Opus.** Backend: extend `AttachmentCategory` to `'objective' | 'subjective'`; add the `subjective/{complaintId}/` path segment in `createUploadUrl` + Zod (`ATTACHMENT_CATEGORY_VALUES` + optional `complaintId`) + controller wiring; verify (do not widen) the prescription-scoped RLS covers it; PHI-safe logs. No migration/column/bucket/policy.
- `sdp-03` — Sonnet. Frontend: extract the shared upload/thumbnail logic from `ObjectiveMediaStrip` into a reusable strip; new `subjective-media.ts`; render a compact per-complaint "Photos" affordance in `ComplaintCard`, filtered by `complaintId`.
- `sdp-04` — Sonnet. Non-destructive orphan handling (photo pinned to a deleted complaint → "Other photos" fallback) + read-only mode + a11y + verification close-gate.

### P3 detail (promoted — see the [batch plan](../../../Daily-plans/June%202026/25-06-2026/soap-data-placement/p3-results-timeline/plan-p3-soap-data-placement-results-timeline-batch.md); decisions `P3-D1..D5` freeze there)
- `sdp-05` — **Opus.** Backend: read-only `GET /api/v1/patients/:patientId/chart/results` aggregating ordered (`investigations`) + resulted (`test_results_json`) + a per-visit media count across the patient's prescriptions, date-desc; doctor-scoped; PHI-safe. **Direct `prescriptions` query + TS assembly — no new table/view/migration** (P3-D1).
- `sdp-06` — Sonnet. Frontend: `getPatientResultsTimeline` wrapper + `ResultsTimelineSection` in `PatientChartPanel` (mirror the `SectionWrapper` + count-callback pattern), read-only, slotted after Vitals.
- `sdp-07` — Sonnet. Close-gate: projection correctness (visit/date attribution + media count) + empty/edge states + read-only across layouts + a11y + verification.

---

## What this program does NOT do (deferred)

| Item | Why / lands |
|---|---|
| Remove the legacy free-text results / vitals / exam escape hatches | SDP-D5 — retained as the unstructured fallback the derived contracts round-trip. |
| AI / OCR parse of report scans or dictated results | Compliance gate (same as subj-14 §4). |
| MSE structured block placement | Objective-vs-Assessment open question (objective-tab program). |
| Pushing ordered investigations *into* the per-visit Objective pane | SDP-D2 — they stay Plan-owned; surfacing happens only in the P3 longitudinal view. |
| External-lab order routing / coded (LOINC) results | Out of scope (EHR roadmap non-goals). |

---

## Plan rules

- **Status legend:** `Drafted` / `Committed` / `Shipped` / `Deferred` / `Killed`.
- **Item IDs / task prefix:** `sdp`, numbered continuously across phases (P1 = `sdp-01`).
- **Decision IDs:** prefix `SDP-` (distinct from the objective `OBJ-`, subjective `ST-`, EHR `E` locks).
- **Promotion path:** when a phase's decisions are confirmed, this plan promotes that phase to a dated batch under `docs/Work/Daily-plans/June 2026/25-06-2026/soap-data-placement/p{N}-<slug>/plan-p{N}-soap-data-placement-<slug>-batch.md` and marks it `Committed`. **Later phases promote as sibling subfolders under the same `soap-data-placement/` folder** (created 25-06-2026), not under the later day's date.
- **Binding inheritance:** every phase inherits `SDP-D1..SDP-D5`. Especially binding: **SDP-D2** (ordered = Plan; resulted = Objective) and **SDP-D5** (note ≠ chart; additive only).

---

## Reference

- **Objective-tab program** (the structured results + media this builds on): [`objective-tab/plan-objective-tab.md`](../objective-tab/plan-objective-tab.md) — P5 (`test_results_json`, `prescription_attachments` `objective/` segment).
- **EHR roadmap / chart panel:** [`plan-00-ehr-roadmap.md`](../plan-00-ehr-roadmap.md) (T1 `PatientChartPanel`, T5 trends).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../process/PHASED-PLANS-GUIDE.md) · [`TASK_MANAGEMENT_GUIDE.md`](../../../process/TASK_MANAGEMENT_GUIDE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../process/EXECUTION-ORDER-GUIDELINES.md).

---

**Created:** 2026-06-25.  
**Owner:** TBD.  
**Predecessor pattern:** Objective-tab program (shipped) — structured-results + attachment patterns reused, not re-derived.
