# Execution order — Rx fast entry Phase 3 (describe-visit)

> Batch: [`plan-p3-rx-fast-entry-describe-visit-batch.md`](../plan-p3-rx-fast-entry-describe-visit-batch.md) · Product plan: [`plan-rx-fast-entry.md`](../../../../../../Product%20plans/plan-rx-fast-entry.md)
>
> **3 waves, 4 tasks, one lane.** Orchestrator + proposal + apply share the result shape. No parallel lane.
>
> **Pick Opus (max thinking) for rfed-02 and rfed-04.** Auto will not escalate. Hard-rules: AI path + five-plus-file apply.

---

## TL;DR for the executor

1. **rfed-01 first (Auto).** Pure cue-phrase segmenter + unit tests. No React, no fetch.
2. **rfed-02 next (Opus).** Fan-out to the two existing parse clients. Lock the result shape the UI will render.
3. **rfed-03 (Auto).** Tab-grouped proposal. No writes.
4. **rfed-04 last (Opus).** Apply through existing builders, wire mic-first capture, Phase 3 gate.

---

## Wave / lane matrix

| Wave | Task | Title | Depends on | Lane | Size | Model |
|---|---|---|---|---|---|---|
| **1** | rfed-01 | Cue-phrase segmenter | — | Lane α | M | Auto |
| **2** | **rfed-02** | Fan-out orchestrator | rfed-01 | Lane α | **L** | **Opus** |
| **2** | rfed-03 | Tab-grouped proposal | rfed-02 | Lane α (serial) | M | Auto |
| **3** | **rfed-04** | Apply + gate | rfed-01..03 | Lane α | **L** | **Opus** |

```
rfed-01  ──>  rfed-02  ──>  rfed-03  ──>  rfed-04  ──>  Phase 3 closed
                 ▲
            Opus (AI path)
```

rfed-03 waits on rfed-02 because it renders the orchestrator result. Do not start rfed-03 against a guessed shape.

---

## Wave detail

### Wave 1 — segmenter (rfed-01)

**Goal:** a paragraph becomes labelled slices. No network.

**Gate:** cue table covered by unit tests; leftover slice when nothing matches.

### Wave 2 — propose (rfed-02 → rfed-03)

**Goal:** slices become confirmable cards, grouped by tab.

**Gate:** only the two existing clients are called; proposal cannot dispatch.

### Wave 3 — apply + close (rfed-04)

**Goal:** accept writes through the capture-bar / template-apply paths; batch gate green.

---

## Model-selection rationale

Per [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md):

- **rfed-01 — Auto.** Pure function + tests. No PHI path of its own.
- **rfed-02 — Opus.** Orchestrates model-backed clients, abort, tiers, leftover fallback. Easy to accidentally add a third prompt.
- **rfed-03 — Auto.** Presentational, against a locked result shape.
- **rfed-04 — Opus.** Cross-tab apply + capture-bar wiring. Five-plus files is expected; that is the escalation trigger, not a licence to wander.

---

## Pre-load (every task)

- Product plan RFE-DL-5…DL-8 · RFE-Q4
- Phase locks RFE3-D1…D7
- `frontend/lib/api/complaint-parse.ts` · `medicine-parse.ts`
- `frontend/components/cockpit/rx/subjective/ComplaintCaptureBar.tsx`
- `frontend/components/cockpit/rx/inputs/MedicineCaptureBar.tsx`
- `frontend/components/cockpit/rx/subjective/AiRefineProposal.tsx`
- `frontend/lib/cockpit/apply-subjective-template.ts` · `apply-plan-template.ts` / medicines apply
- `frontend/lib/text/use-speech-recognition.ts`
- `backend/src/services/complaint-parse-service.ts` header guarantees (inherit, do not copy)

---

**Last Updated:** 2026-08-30
