# Visit narrative Phase 2 (transcript → chart amendment) — execution order

> Sibling document of [`plan-p2-visit-narrative-transcript-amendment-batch.md`](../plan-p2-visit-narrative-transcript-amendment-batch.md). The plan covers what and why; this doc covers who-runs-what-when and which model.
>
> **Committed** 2026-08-30. VN-Q5 = **(b)**. VN-Q6 **skipped by owner**. Start at `vnt-01`. **Opus throughout (VN-DL-13). Auto must not run these tasks.**

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md) · Product plan: [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md)

---

## Wave plan (5 waves)

```
Wave 0 (Provenance table — ~3h, single lane sequential)   [struck entirely if VN-Q5 = (a)]:
  Lane α  ──── vnt-01 (M, Opus)

Wave 1 (Extraction route — ~6h, single lane sequential):
  Lane α  ──── vnt-02 (L, Opus)

Wave 2 (Evidence tier — ~4h, single lane sequential):
  Lane α  ──── vnt-03 (L, Opus)

Wave 3 (Amendment surface — ~5h, single lane sequential):
  Lane α  ──── vnt-04 (L, Opus)

Wave 4 (Close — ~3h, single lane sequential):
  Lane α  ──── vnt-05 (M, Opus)
```

**Total wall-clock with parallelism:** ~21h (no parallel lanes — see below).
**Total agent-time (sequential equivalent):** ~21h.

> The product plan estimated 14–20h. The overage is `vnt-02`'s compliance pre-flight, which was not scoped when that estimate was written.

**The bottleneck is Wave 1** — `vnt-02` locks the span contract that Waves 2–4 all render against, and its compliance pre-flight can end the phase outright, so nothing downstream can be started speculatively against it.

**No parallel lanes anywhere in this batch.** `vnt-01` and `vnt-02` would pass the §5 lane gate on file disjointness, but [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) §7 biases migration + service work in the same backend area to sequential, and §8 caps Opus at one per wave. `vnt-01` is nonetheless **off the critical path** (VNT-D1): it can be run at any point before Wave 3, so an undecided VN-Q5 must not hold up a phase that is four-fifths independent of it.

---

## Lane-by-lane details

### Wave 0 — remember where it came from (single lane sequential)

**Goal:** one append-only row per accepted transcript-derived item, anchored to the transcript and a character span.

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [`vnt-01`](./task-vnt-01-narrative-provenance-table.md) | M | **Opus** | `migrations/061`, `migrations/223`, `MIGRATIONS_AND_CHANGE.md` | **Blocked on VN-Q5.** Struck entirely if the answer is (a). |

### Wave 1 — read the transcript (single lane sequential)

**Goal:** the first and only new AI route in this program. Transcript text in, condensed doctor-editable draft out, every line anchored to a server-verified span.

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [`vnt-02`](./task-vnt-02-extraction-pass.md) | L | **Opus** | `complaint-parse-service.ts`, `ai-service.ts#redactPhiForAI`, `constants/recording-attestation.ts`, `rate-limiters.ts` | Waits on the VN-Q6 window. Read VNT-D2 / D3 / D6 / D7 before writing a line. **§1 is expected to STOP.** |

This is the task where the phase either holds its shape or becomes a SOAP-blob writer.

### Wave 2 — show the evidence (single lane sequential)

**Goal:** the Phase-1 proposal grows an evidence tier — a transcript row shows the verbatim quote it came from, sliced from the transcript, never echoed from the model.

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [`vnt-03`](./task-vnt-03-evidence-tier-proposal.md) | L | **Opus** | `visit-parse-orchestrator.ts`, `visit-parse-apply.ts`, `VisitParseProposal.tsx`, `vnt-02`'s locked contract | Waits on `vnt-02`. Do **not** start against a guessed response shape — Phase 1 avoided exactly this by locking the DTO in `vnb-03`. |

### Wave 3 — offer the amendment (single lane sequential)

**Goal:** an entry with a usable transcript offers to review it; accepting opens that consult's form in an amendment context (VNT-D5).

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [`vnt-04`](./task-vnt-04-chart-amendment-surface.md) | L | **Opus** | `patient-consult-timeline-service.ts`, `ConsultTimelinePane.tsx`, `visit-parse-apply.ts` | Waits on `vnt-03`, **and on VNT-Q1 answered from the code**. Consumes `vnt-01` if VN-Q5 ≠ (a). |

### Wave 4 — close (single lane sequential)

**Goal:** `source: "transcript"` on `[ehr:rxvisit]` with counts only; erasure proven by a standing test; gate green; docs updated.

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| 0 | [`vnt-05`](./task-vnt-05-phase-2-gate.md) | M | **Opus** | `telemetry/visit-describe.ts`, the batch acceptance gate, `vnb-05` as precedent | Waits on all of Waves 0–3. |

---

## Per-task model picks

| Task | Size | Recommended model | Why |
|---|---|---|---|
| `vnt-01` | M | **Opus** | A new table adjacent to PHI whose erasure obligation must be *inherited* correctly rather than reinvented. The agent contract escalates migrations on its own. |
| `vnt-02` | L | **Opus** | A new AI hop over clinical text, with a server-side anti-hallucination guarantee, a chunking policy, and a compliance verification that can end in STOP. The hardest task in the program. |
| `vnt-03` | L | **Opus** | Widening a shipped DTO and component without changing what typed input does, plus carving a trust-split exception into `splitVisitProposal` — the one line most likely to ship a silent transcript write. |
| `vnt-04` | L | **Opus** | Writes onto a chart that may correspond to a document already in the patient's hands, across a navigation boundary, through an existing form context. |
| `vnt-05` | M | **Opus** *per the inherited lock* | Gate-checklist shaped and would normally be Auto. **VN-DL-13** says Phase 2 is Opus throughout, and an exec order does not re-litigate a product-plan lock. Noted, not argued. |

> **Opus cap deliberately exceeded.** [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) §8 caps Opus at two per batch, on the reasoning that a third usually means the spec is under-tightened. That is not the reason here — every task touches stored PHI, a model over patient speech, or a write to a clinical record, and **VN-DL-13** locked "Opus throughout" at the product-plan level. If cost becomes the binding constraint, `vnt-05` and then `vnt-03` are the two candidates to downgrade, and that is an **owner decision**, not an executor's.

---

## Acceptance gates per wave

**Wave 0 — `vnt-01`**
- [ ] VN-Q5 recorded with a real answer; the migration matches it.
- [ ] Migration `224` applies cleanly and re-applies as a no-op; reverse documented in-file.
- [ ] Append-only proven: `UPDATE` raises, `DELETE` raises.
- [ ] Deleting a transcript removes its provenance rows — **asserted on dev**, not read off the DDL.
- [ ] RLS proven closed to anon and authenticated.
- [ ] Under VN-Q5 = (b): no column can hold clinical free text.
- [ ] Type-check + lint clean.

**Wave 1 — `vnt-02`**
- [ ] All Wave 0 gates still green (or Wave 0 recorded as struck).
- [ ] §1 resolved in writing — a recorded basis for the AI hop, or a recorded STOP.
- [ ] A completed transcript returns a draft; every line resolves to a verified span.
- [ ] The fabrication test passes: a line with an unresolvable span is dropped **by the service**.
- [ ] The response carries no model-echoed quote text.
- [ ] Over-length transcripts surface the condition; never silently truncated.
- [ ] Redaction applied, mini tier, fail-soft, rate-limited, doctor-scoped — each asserted.
- [ ] Exactly one new route, service, and prompt builder. Zero PHI in logs.

**Wave 2 — `vnt-03`**
- [x] All Wave 1 gates still green.
- [x] A transcript row renders its verbatim quote, sliced from the transcript.
- [x] **No transcript item auto-applies** — including a cleanly-parsed vital; asserted on the write path.
- [x] No bulk accept reachable for any transcript group.
- [x] Rows with unresolvable spans never render; quote text renders literally, never as markup.
- [x] Phase-1 suites green; every changed test justified against VNT-D8.

**Wave 3 — `vnt-04`**
- [x] All Wave 2 gates still green.
- [x] VNT-Q1 answered from the code; the surface's copy matches the answer.
- [x] A consult with a usable transcript offers the review; one without offers nothing; processing / failed / retention-deleted each read distinctly.
- [x] Per-item accept only; abandoning the context writes nothing; re-review does not double-apply.
- [x] Doctor-scoped server-side; clinic staff rejected at the route.
- [x] `visit-parse-apply.ts` is still the only writer — grepped, not recalled.

**Wave 4 — `vnt-05`**
- [x] All Wave 3 gates still green.
- [x] `[ehr:rxvisit]` carries `source: "transcript"`; no event parameter can carry text, asserted by test.
- [x] Deleting a transcript removes provenance rows — **proven by a CI test**.
- [x] Every batch acceptance-gate item checked against a real observation.
- [x] Batch plan, program README, and product plan updated with VN-Q5 / VN-Q6 / VNT-Q1 answers as executed.
- [x] Full type-check + lint + suites green; new flakes distinguished from the three known Phase-1 ones.

---

## Cost estimate

| Wave | Tasks | Auto chats | Opus chats | Wall-clock |
|---|---|---|---|---|
| 0 | `vnt-01` | 0 | 1 | ~3h |
| 1 | `vnt-02` | 0 | 1 | ~6h |
| 2 | `vnt-03` | 0 | 1 | ~4h |
| 3 | `vnt-04` | 0 | 1 | ~5h |
| 4 | `vnt-05` | 0 | 1 | ~3h |
| **Total** | **5** | **0** | **5** | **~21h** |

**Runtime cost:** transcription is already sunk (`WHISPER_USD_PER_MINUTE = 0.006`, `DEEPGRAM_USD_PER_MINUTE = 0.0043`). This phase adds one mini-tier extraction pass per reviewed consult, bounded by the VNT-Q2 chunk cap. No new per-minute audio spend — that would be Phase 3.

---

## Pre-load (every task)

- Product plan VN-DL-7, 8, 11, 12, 13 · VN-Q5, VN-Q6
- Phase locks VNT-D1…D8 + VNT-Q1…Q3 + Scope Guard
- [`../../p1-one-box/`](../../p1-one-box/) — the shipped spine this phase feeds
- `backend/migrations/061_consultation_transcripts.sql` — the source table, its status ladder, its RLS posture
- `backend/migrations/223_visit_payments.sql` — current house migration pattern (deny-all RLS, append-only triggers, documented rollback)
- `backend/src/services/voice-transcription-service.ts` · `voice-transcription-worker.ts` · `backend/src/types/consultation-transcript.ts` — read-only context: how a transcript reaches `completed`
- `backend/src/services/complaint-parse-service.ts` · `medicine-parse-service.ts` — the AI-service pattern to mirror (runner seam, redaction, tier, audit, fail-soft)
- `backend/src/services/ai-service.ts#redactPhiForAI` — and its actual, limited scope (VNT-D7)
- `backend/src/constants/recording-attestation.ts` — the compliance basis `vnt-02` §1 must verify
- `backend/src/services/patient-consult-timeline-service.ts` · `backend/src/controllers/patient-consult-timeline-controller.ts` · `frontend/components/patients-v2/ConsultTimelinePane.tsx` — the `vnt-04` host, which already carries `artifacts.hasTranscript`
- `frontend/lib/cockpit/visit-parse-orchestrator.ts` · `visit-parse-apply.ts` · `frontend/components/cockpit/rx/subjective/VisitParseProposal.tsx` — the Phase-1 spine being widened
- `frontend/lib/telemetry/visit-describe.ts` — the events gaining `transcript`

---

## References

- Batch plan: [`plan-p2-visit-narrative-transcript-amendment-batch.md`](../plan-p2-visit-narrative-transcript-amendment-batch.md)
- Product plan: [`plan-visit-narrative.md`](../../../../../../Product%20plans/plan-visit-narrative.md)
- Prior phase exec order: [`EXECUTION-ORDER-p1-visit-narrative-one-box.md`](../../p1-one-box/Tasks/EXECUTION-ORDER-p1-visit-narrative-one-box.md)
- [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) · [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

---

**Last Updated:** 2026-08-30
