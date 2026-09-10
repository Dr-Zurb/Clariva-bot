# Execution order — Visit narrative Phase 1 (one box)

> Batch: [`plan-p1-visit-narrative-one-box-batch.md`](../plan-p1-visit-narrative-one-box-batch.md) · Product plan: [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md)
>
> **4 waves, 5 tasks, two lanes in wave 1 only.** Mount work and segmenter work are disjoint files; everything after shares the router result shape.
>
> **Pick Opus (max thinking) for vnb-03 and vnb-04.** Auto will not escalate. Hard-rules: router over AI clients + cross-tab apply.

---

## TL;DR for the executor

1. **Wave 1 — vnb-01 (Auto) ∥ vnb-02 (Auto).** Move the box to one mount per host; grow the segmenter kinds. Disjoint surfaces, run in parallel.
2. **Wave 2 — vnb-03 (Opus).** The deterministic-first router. Lock the widened proposal DTO here — vnb-04 renders it.
3. **Wave 3 — vnb-04 (Opus).** Proposal groups + apply for every target. Deterministic-on-Enter split lives here.
4. **Wave 4 — vnb-05 (Auto).** Telemetry dims, gate, docs.

---

## Wave / lane matrix

| Wave | Task | Title | Depends on | Lane | Size | Model |
|---|---|---|---|---|---|---|
| **1** | vnb-01 | Single mount + parse trigger | — | Lane α | M | Auto |
| **1** | vnb-02 | Segmenter kinds | — | Lane β | M | Auto |
| **2** | **vnb-03** | Deterministic-first router | vnb-02 (kinds), vnb-01 (trigger) | Lane α | **L** | **Opus** |
| **3** | **vnb-04** | Proposal groups + apply | vnb-03 (DTO) | Lane α | **L** | **Opus** |
| **4** | vnb-05 | Telemetry + gate | vnb-01..04 | Lane α | M | Auto |

```
vnb-01 ─┐
        ├──>  vnb-03  ──>  vnb-04  ──>  vnb-05  ──>  Phase 1 closed
vnb-02 ─┘        ▲                ▲
            Opus (router)   Opus (apply)
```

vnb-04 waits on vnb-03 because it renders the router's widened DTO. Do not start vnb-04 against a guessed shape.

---

## Wave detail

### Wave 1 — relocate + widen the primitive (vnb-01 ∥ vnb-02)

**Goal:** one box per host with an explicit parse trigger; a segmenter that labels vital / diagnosis / investigation / prose slices instead of dropping them.

**Gate:** both old mounts gone, capture-bar suites untouched and green; segmenter table tests cover the new kinds; no behavior change yet in what parses (router still the old two-client fan-out until wave 2).

### Wave 2 — route (vnb-03)

**Goal:** the VNB-D2 ladder in front of the AI fan-out. `spo2 98` and clean medicine lines stop reaching AI at all.

**Gate:** per-input-class tests pin exactly which recognizer/client fires and how many AI calls happen (including zero). Resolvers receive single lines (payload-asserted).

### Wave 3 — propose + apply (vnb-04)

**Goal:** every router output has a rendering group and an apply path that already exists in the form.

**Gate:** deterministic-on-Enter vs AI-confirm split per VNB-D4; prose appends preserve existing text; nothing model-touched lands without accept.

### Wave 4 — close (vnb-05)

**Goal:** `source` + kind counts on `[ehr:rxvisit]`; batch gate green; program docs updated.

---

## Model-selection rationale

Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

- **vnb-01 — Auto.** Component relocation against named hosts + an input-trigger change. No new AI surface.
- **vnb-02 — Auto.** Pure module widening with table tests, shape locked by the batch plan.
- **vnb-03 — Opus.** Orchestrates five recognizers and four model-backed clients with gates, aborts, and call-count guarantees. The easiest place in the program to accidentally add a fifth prompt or leak a paragraph into a resolver.
- **vnb-04 — Opus.** Cross-tab apply through five existing write paths plus the deterministic/confirm trust split. Five-plus files expected; that is the escalation trigger, not a licence to wander.
- **vnb-05 — Auto.** Telemetry dims + gate checklist against locked events.

---

## Pre-load (every task)

- Product plan VN-DL-1..6, 10, 11 · VN-Q1..Q4
- Phase locks VNB-D1…D7 + Scope Guard
- `frontend/components/cockpit/rx/subjective/VisitDescribeBar.tsx` (the seed)
- `frontend/lib/cockpit/visit-segmenter.ts` · `visit-parse-orchestrator.ts` · `visit-parse-apply.ts`
- `frontend/lib/cockpit/command-bar-set-vital.ts` (vital grammar + `applySetVitalWrites`)
- `frontend/lib/cockpit/medicine-line-parse.ts` · `rx-medicine-from-capture.ts` · `should-request-ai-med-parse.ts`
- `frontend/lib/api/complaint-parse.ts` · `medicine-parse.ts` · `diagnosis-parse.ts` · `investigation-parse.ts` (note: the last two are **resolvers**)
- `frontend/components/cockpit/rx/PrescriptionFormCompositionRoot.tsx` + the cockpit lifted-chrome mounts (`SafetyStickyStrip` precedent)
- `frontend/lib/telemetry/visit-describe.ts`

---

**Last Updated:** 2026-08-30
