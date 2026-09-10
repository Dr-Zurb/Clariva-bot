# Plan p3 — Describe-visit (Subjective + Plan)

## 30 Aug 2026 — Batch `rx-fast-entry` / `p3-describe-visit` (`rfed-01..04`) — **L, ~2 days · Opus**

> **Status:** ✅ Gate green 2026-08-30 (live smoke residual)
> **Product plan:** [`plan-rx-fast-entry.md`](../../../../../Product%20plans/plan-rx-fast-entry.md) (RFE-DL-1…RFE-DL-12 — inherited)
> **Prior phase:** [`../p2-command-bar/`](../p2-command-bar/)
> **Program:** [`../README.md`](../README.md) · Prefix `rfed`
> **Exec order:** [`Tasks/EXECUTION-ORDER-p3-rx-fast-entry-describe-visit.md`](./Tasks/EXECUTION-ORDER-p3-rx-fast-entry-describe-visit.md)

---

## Why this phase

Jump + unhide + set-value make the form findable. They do not make **dictating a visit** fast. Doctors already type one-liners into `ComplaintCaptureBar` and `MedicineCaptureBar`, each of which can call its own parser. There is no way to speak a short paragraph that contains both a complaint and a drug and see structured cards.

This phase adds that path — **mic-first, Subjective + Plan only** — as an orchestrator over parsers and apply builders that already exist. It is the first phase in this program that calls a model.

**Escalate:** five-plus files and an AI path. Auto will not pick a thinking model. **rfed-02 and rfed-04 are Opus (max thinking).** rfed-01 (pure segmenter) and rfed-03 (proposal UI) may run Auto after the result shape is locked.

---

## Decision lock (phase — inherits the product plan)

| ID | Phase decision |
|----|----------------|
| RFE-DL-1…RFE-DL-12 | Inherited. **Do not re-litigate.** |
| **RFE3-D1** | **No new parse endpoint.** Fan-out to `parseComplaintWithAI` and `parseMedicineWithAI` only. Diagnosis / investigation clients stay unused. |
| **RFE3-D2** | Segmenter is **deterministic and model-free**. Cue phrases only (complaint / exam / impression / plan / review / start-on / medicine). Unrecognised remainder is one leftover slice. Escalate the **whole original text** to both parsers only when **no** cue matches — still two calls, not a mega-prompt. |
| **RFE3-D3** | Placement is the **existing capture-bar family**, not a new box at the top of the Rx form. Mic-first (`use-speech-recognition.ts`). Out-of-tab hits render as "N items for Plan →" (or Subjective) on the bar that captured. |
| **RFE3-D4** | Confirm-to-apply. Per-item accept. **Add all per tab.** No global Add all. Typed/dictated source text is never silently discarded (same "Keep as typed" spirit as `AiRefineProposal`). |
| **RFE3-D5** | Apply goes through `buildSubjectiveTemplateApplyActions` / the plan medicines apply path the capture bars already use. Do not invent a third writer. |
| **RFE3-D6** | Tiers: mini (`default`) on auto-gate, flagship (`escalation`) on explicit refine. Same as the two existing clients. |
| **RFE3-D7** | Inherit PHI redaction + audit from the existing services. This phase adds **no** new model prompt file and **no** new audit event that could carry clinical text. Accept-rate logging is counts + tab kind only (RFE-DL-4). |

---

## Scope Guard — DO NOT TOUCH

- New `/parse` route or a SOAP-blob prompt.
- Diagnosis / investigation / exam parsers.
- Global Add all.
- Factory-visible sets.
- `SourceItem` action union (still deferred).
- New migration.
- New redaction helper (use `redactPhiForAI` already inside the services).

---

## Tasks

| ID | Title | Size | Model |
|----|-------|------|-------|
| [`rfed-01`](./Tasks/task-rfed-01-cue-segmenter.md) | Deterministic cue-phrase segmenter | M | Auto |
| [`rfed-02`](./Tasks/task-rfed-02-fanout-orchestrator.md) | Fan-out to complaint + medicine parse | L | **Opus** |
| [`rfed-03`](./Tasks/task-rfed-03-tab-grouped-proposal.md) | Tab-grouped proposal panel | M | Auto |
| [`rfed-04`](./Tasks/task-rfed-04-apply-and-gate.md) | Apply through existing builders + Phase 3 gate | L | **Opus** |

---

## Acceptance gate

- [x] Dictating (or pasting) a short Subjective+Plan paragraph proposes complaint cards and medicine cards. Nothing is written until accept. (VisitDescribeBar + proposal suites)
- [x] Cue phrases split the text; the complaint slice does not go to the medicine parser and vice versa, except the no-cue leftover path (both parsers, same original text). (rfed-01/02 suites)
- [x] Per-item accept + per-tab Add all. No global Add all. Source text can be kept as typed. (rfed-03/04 suites)
- [x] Accepted complaints / medicines appear via the same apply path as templates / capture bars. (`complaintFromAiParsed` / `rxMedicineFromAiMedicine`)
- [x] No new backend route. No diagnosis / investigation calls.
- [x] Telemetry / logs: no raw paragraph, no names, no drug strings. (`[ehr:rxvisit]`)
- [x] Type-check + lint clean. Segmenter + orchestrator + proposal + apply tests green. (touched files)

---

## Notes

- **Live dictation/paste smoke residual:** no authenticated browser this session. Operator: on a visit, paste `Complaint: fever. Plan: azithromycin 500` into Describe this visit → accept one complaint and one medicine → both land; dismiss/keep does not silent-fill.

---

## Risk register (phase)

| Risk | Mitigation |
|------|------------|
| Mega-prompt "because the segmenter missed something" | RFE3-D1 / D2. Whole-text fallback is still two existing clients. |
| Silent fill | RFE3-D4. |
| Third writer that desyncs from capture-bar commit | RFE3-D5. |
| File-budget creep across SOAP tabs | Subjective + Plan only. Other tabs are a later program. |
| Accept-rate logged with the line of text | RFE3-D7. Counts + tab kind. |

---

**Last Updated:** 2026-08-30
