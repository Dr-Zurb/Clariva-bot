# Cockpit-v3 Objective tab — daily batches

> **Product plan:** [`plan-objective-tab.md`](../../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md)  
> All phases for this program live in this folder. Execute in order.

The Objective tab today is a numeric vitals grid + three free-text areas (general / systemic
exam packed into one `examination_findings` column via a `--- SYSTEMIC ---` delimiter, plus a
test-results textarea). This program turns the exam into **structured system-wise cards**
(tri-state: not examined / normal / abnormal), adds **Vitals 2.0**, and ports the subjective
layout engines (reorder · collapse · visibility · custom sections · templates). The
patient-facing `examination_findings` becomes a **derived mirror** so the PDF / SMS / snapshot
break by zero bytes.

**Task prefix:** `obj` (stable across phases). **Numbering:** continuous — `obj-01..04`
(Phase 1), `obj-05..08` (Phase 2), `obj-09..15` (Phase 3). Item structure maps to the product plan's `OBJ-D1..D7` decision lock.

| Phase | Folder | Status | Batch plan | Execution order |
|---|---|---|---|---|
| 1 — structured exam | [`p1-structured-exam/`](./p1-structured-exam/) | ✅ Complete (obj-01..04) | [`plan-p1-…`](./p1-structured-exam/plan-p1-objective-tab-structured-exam-batch.md) | [`EXECUTION-ORDER-p1-…`](./p1-structured-exam/Tasks/EXECUTION-ORDER-p1-objective-tab-structured-exam.md) |
| 2 — vitals 2.0 | [`p2-vitals-2/`](./p2-vitals-2/) | ✅ Complete (obj-05..08) | [`plan-p2-…`](./p2-vitals-2/plan-p2-objective-tab-vitals-2-batch.md) | [`EXECUTION-ORDER-p2-…`](./p2-vitals-2/Tasks/EXECUTION-ORDER-p2-objective-tab-vitals-2.md) |
| 3 — layout engines + modality/specialty defaults | [`p3-layout-engines/`](./p3-layout-engines/) | 🗒 Drafted (obj-09..15) | [`plan-p3-…`](./p3-layout-engines/plan-p3-objective-tab-layout-engines-batch.md) | [`EXECUTION-ORDER-p3-…`](./p3-layout-engines/Tasks/EXECUTION-ORDER-p3-objective-tab-layout-engines.md) |
| 4 — exam templates + specialty packs | _(drafted)_ | 🗒 Drafted | — | — |
| 5 — point-of-care results + media | _(drafted)_ | 🗒 Drafted | — | — |
| 6 — trends | _(drafted)_ | 🗒 Drafted | — | — |

**Decision lock:** the product plan's `OBJ-D1..OBJ-D7` carry forward across all phases.
Especially binding: **OBJ-D1** (exam = `examination_json` JSONB, mirror the medicines/complaints
pattern), **OBJ-D2** (`examination_findings` derived — zero downstream change; legacy rows
byte-identical), **OBJ-D3** (C3 hybrid — typed 5 core systems, long tail via templates/custom).

**Deferred (not scheduled):** specialty exam packs, AI exam parse, legacy `vitalsText` sunset,
MSE placement — see [`../../../../capture/features/objective-tab/`](../../../../capture/features/objective-tab/) (`backlog.md` · `exam-catalog.md`).

**Sibling program (engines reused):** Subjective tab — [`../../03-06-2026/subjective-tab/`](../../03-06-2026/subjective-tab/).
**Predecessor:** Cockpit-v3 — [`../../../May 2026/30-05-2026/cockpit-v3/`](../../../May%202026/30-05-2026/cockpit-v3/) (the shell this tab lives in).
