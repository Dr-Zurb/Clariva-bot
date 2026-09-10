# Plan p1 — One box (anything in)

## 30 Aug 2026 — Batch `visit-narrative` / `p1-one-box` (`vnb-01..05`) — **L, ~1.5–2 days · 2× Opus**

> **Status:** Shipped 2026-08-30 (live smoke residual — operator script below)
> **Product plan:** [`plan-visit-narrative.md`](../../../../../Product%20plans/plan-visit-narrative.md) (VN-DL-1…VN-DL-13 — this phase implements VN-DL-1..6, 10, 11)
> **Predecessor program:** [`../../rx-fast-entry/`](../../rx-fast-entry/) — `p3-describe-visit` shipped the seed. `RFE3-D1` / `RFE3-D3` were phase locks of that shipped batch and are superseded here (recorded in both product plans).
> **Program:** [`../README.md`](../README.md) · Prefix `vnb`
> **Exec order:** [`Tasks/EXECUTION-ORDER-p1-visit-narrative-one-box.md`](./Tasks/EXECUTION-ORDER-p1-visit-narrative-one-box.md)

---

## Why this phase

The owner demand (2026-08-30, verbatim in the product plan header): the structured form stays as is; **one box** takes anything — `spo2 98`, a full medicine line, a complaint, or the whole visit summary — and parses each piece into its respective field. Deterministic parsers where they carry, AI fallback where they don't.

Today the describe box is mounted **twice** (inside `ComplaintList` and `MedicineCaptureBar`), covers **two tabs** (complaints + medicines), and sends everything to AI. Meanwhile the codebase already owns deterministic recognizers the box never calls: the vital grammar from the `/` command bar, the medicine line parser behind the Plan capture bar, and the complaint catalog behind the Subjective autocomplete. The diagnosis and investigation **resolver** clients sit unused.

This phase: one mount, a deterministic-first router, four new segmenter kinds, proposal groups for every target, and applies that go through the exact paths the form already trusts.

**Escalate:** router-over-AI-clients and cross-tab apply are hard-rules surfaces. **vnb-03 and vnb-04 are Opus (max thinking).** vnb-01/02/05 run Auto against locked shapes.

---

## Decision lock (phase — inherits the product plan)

| ID | Phase decision |
|----|----------------|
| VN-DL-1…13 | Inherited. **Do not re-litigate.** |
| **VNB-D1** | **Mount points.** One `VisitDescribeBar` instance per host: top of the flat consultation form, and in the cockpit's lifted-chrome position (follow the `SafetyStickyStrip` / `AssessmentStrip` lifting precedent — the box must be visible regardless of which pane owns Subjective/Objective). The `ComplaintList` and `MedicineCaptureBar` mounts come down **in the same task**. |
| **VNB-D2** | **Recognizer ladder, locked order:** per slice — (1) `parseSetVitalCommand` (vitals grammar), (2) `parseMedicineLine` + the capture bar's `should-request-ai-med-parse` gate, (3) complaint-catalog exact match, (4) cue-kind AI routing (complaint → `parseComplaintWithAI`, medicine → `parseMedicineWithAI`, diagnosis → `resolveDiagnosisWithAI`, investigation → `resolveInvestigationWithAI`, prose → routed append), (5) no-cue leftover → existing complaint+medicine fan-out. Import the recognizers; never copy their tables. |
| **VNB-D3** | **Resolvers get lines, never paragraphs.** `resolveDiagnosisWithAI` / `resolveInvestigationWithAI` are called with a single cue-delimited slice line. Their catalog-bound output contracts are inherited: a term that does not re-resolve against the catalog is dropped, not invented. |
| **VNB-D4** | **Trust split (VN-DL-5 applied).** Deterministic hits (ladder steps 1–3, passing their own gates) apply on Enter — identical trust to typing the same line in a capture bar. Everything model-touched renders as confirm cards. No global Add all; per-tab Add all stays for extractor output only. |
| **VNB-D5** | **Prose routing appends, never replaces.** Cue-routed prose (advice / exam / note) appends to the target section's existing text via `setField` with a separator. |
| **VNB-D6** | **No new backend route, no new prompt file, no new redaction helper.** Frontend router + existing clients only. |
| **VNB-D7** | **Telemetry counts-only.** `[ehr:rxvisit]` gains `source` (`typed` \| `dictated`) and per-group kind counts. No parameter that can carry text. |

---

## Scope Guard — DO NOT TOUCH

- `ComplaintCaptureBar` / `MedicineCaptureBar` / `ComplaintAutocomplete` behavior (VN-DL-2 — their suites are the regression lock; removing the `VisitDescribeBar` mount lines and dead prop wiring is the only permitted edit).
- New `/parse` route or a SOAP-blob prompt.
- New parse services (allergies / histories / follow-up / referral — later phase; their cues route to prose).
- `use-speech-recognition` reachable from any patient-audio path (VN-DL-10).
- New migration. Narrative storage (VN-Q5 — Phase 2 STOP).
- Streaming STT.
- Factory-visible sets, `SourceItem` action union (still deferred from rx-fast-entry).

---

## Tasks

| ID | Title | Size | Model |
|----|-------|------|-------|
| [`vnb-01`](./Tasks/task-vnb-01-single-mount.md) | Single mount on both hosts + explicit parse trigger | M | Auto |
| [`vnb-02`](./Tasks/task-vnb-02-segmenter-kinds.md) | Segmenter kinds: vital / diagnosis / investigation / prose | M | Auto |
| [`vnb-03`](./Tasks/task-vnb-03-deterministic-first-router.md) | Deterministic-first router in front of the AI fan-out | L | **Opus** |
| [`vnb-04`](./Tasks/task-vnb-04-proposal-groups-and-apply.md) | Proposal groups + apply for every target | L | **Opus** — done 2026-08-30 |
| [`vnb-05`](./Tasks/task-vnb-05-telemetry-and-gate.md) | Telemetry dims + Phase 1 gate | M | Auto — done 2026-08-30 |

---

## Acceptance gate

- [x] `spo2 98` on Enter sets SpO₂ (unhiding the vital if hidden) — **zero AI calls** (router suite pins call counts).
- [x] `amlodipine 5mg 1 tab od 30 days` on Enter lands a medicine row — zero AI calls; a line failing the `should-request-ai-med-parse` gate goes to the AI confirm path instead (VN-Q3).
- [x] `fever` on Enter lands a complaint via the catalog — zero AI calls.
- [x] A rough whole-visit paragraph (complaint + vital + impression + order + drug + advice) proposes grouped cards: Subjective / Vitals / Assessment / Investigations / Medications / prose. AI-derived items are confirm cards; nothing model-touched lands silently.
- [x] Diagnosis / investigation clients receive single lines only; unresolvable terms are dropped (VNB-D3 suite).
- [x] The `ComplaintList` and `MedicineCaptureBar` mounts of `VisitDescribeBar` are gone; one instance per host; capture-bar suites pass **untouched**.
- [x] No new backend route. `[ehr:rxvisit]` events carry counts + `source` + kind only (grep the prefix).
- [x] Type-check + lint clean. Segmenter / router / proposal / apply / mount suites green.

### Operator smoke (authenticated browser — residual)

Run on **both** hosts (flat consult form + cockpit safety dock). DevTools → Console, filter `[ehr:rxvisit]`.

1. Type `spo2 98` → Enter. SpO₂ writes (unhides if hidden). Applied line. Zero network to parse clients. `shown` + `accepted` with `source: "typed"`, `vitalsDet: 1`.
2. Type `amlodipine 5 mg 2 tab od for 30 days after food` → Enter. Medicine row lands. `planDet: 1`.
3. Type `fever` → Enter. Catalog complaint lands. `subjectiveDet: 1`.
4. Paste a whole paragraph (`fever, spo2 98, impression viral fever, order LFT, amlodipine 5 mg 2 tab od for 30 days after food, advice rest`) → Enter. Det items apply; AI groups wait for Add. Accept one card; confirm the field. `shown` carries mixed det/AI counts.
5. Mic one short line → Done. `source: "dictated"` on `shown`.

### Residuals

- Live smoke above is operator-owned (no logged-in Rx session in this close).
- Full `vitest run` still carries pre-existing flakes (`ComplaintList` 5s timeout; `PlanSection` incomplete-row collapse; `SubjectiveSection` QueryClient). Program suites listed in the gate are green.
- VN-Q6 two-week accept-rate window **opens 2026-08-30**. Phase 2 stays Drafted until those numbers + VN-Q5 owner decision.

---

## Risk register (phase)

| Risk | Mitigation |
|------|------------|
| Router "helpfully" adds a fifth AI call or a combined prompt | VNB-D2 ladder is closed; VN-DL-6. Router suite pins which client fires per input class. |
| Resolvers fed paragraphs | VNB-D3; test with a multi-sentence slice asserting the call payload. |
| Deterministic apply fires on a junk parse | Ladder steps carry their own gates (`should-request-ai-med-parse`, catalog exact match, vital range checks already in the grammar). |
| Capture-bar regression while unmounting the seed | VN-DL-2 + Scope Guard; their suites must pass without edits. |
| Cockpit host has no obvious top slot and the box lands inside one pane | VNB-D1: lifted-chrome precedent; if neither host slot works cleanly, **STOP and surface** — do not bury the box in a tab. |
| Prose append clobbers typed notes | VNB-D5: append with separator; apply suite pins existing-text preservation. |

---

**Last Updated:** 2026-08-30
