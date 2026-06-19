# Objective tab — Phase 1: structured system-wise exam cards + derived-text contract — 18 Jun 2026 batch plan

> **Phase 1 of the Objective-tab program.** The Objective exam today is two free-text areas — "General" and "Systemic" — packed into one [`examination_findings`](../../../../../../../backend/migrations/103_prescription_soap_fields_expansion.sql) column via a `--- SYSTEMIC ---` delimiter ([`exam-findings.ts`](../../../../../../../frontend/lib/cockpit/exam-findings.ts), rendered by [`ObjectiveSection.tsx`](../../../../../../../frontend/components/cockpit/rx/sections/ObjectiveSection.tsx)). There is no structure, no chips, no "within normal limits" shortcut, and none of the subjective fast-entry engines reach it. Phase 1 introduces **structured system-wise exam cards** — a typed `examination_json` JSONB array on `prescriptions`, surfaced as **tri-state** (not examined / normal / abnormal) cards for the **5 core systems** (general, CVS, resp, abdomen, CNS) — and makes `examination_findings` a **derived text mirror** so the PDF / SMS / snapshot break by zero bytes.
>
> **Source plan:** [`Product plans/ehr/objective-tab/plan-objective-tab.md`](../../../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md) — phase P1; freezes `OBJ-D1..OBJ-D7` for the program.
>
> **Prefix note:** tasks are `obj-01..04` (program numbering starts here).
>
> **Builds on:** the **Subjective-tab** patterns (shipped) — the `complaints` JSONB + derived-`cc`/`hopi` contract (the direct analog of `examination_json` → `examination_findings`), the `complaint-schema.ts` type-aware registry, and the `MedicineRow`/`ComplaintCard` structured-card UI. Reuses migration 103's additive-column pattern and `RxFormContext`'s medicine/complaint reducer + `buildRxPayload` derivation.
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). obj-01 (new migration + PHI JSONB + shared form state + the derived-text contract) is **Opus** (hard rule: new migration; plus output-parity risk). obj-02 (exam registry), obj-03 (card UI + host rewire) are Auto. obj-04 (derivation byte-parity close-gate) is **Opus** (output-parity fixtures).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p1-objective-tab-structured-exam.md`](./Tasks/EXECUTION-ORDER-p1-objective-tab-structured-exam.md).

---

## What Phase 1 does (one sentence)

> **Add a typed `prescriptions.examination_json` array, surface the 5 core body systems as tri-state exam cards (not examined / normal / abnormal) with one-tap "within normal limits" + abnormal chip palettes + a "mark entire exam normal" macro, and derive `examination_findings` text from it on save — so a row with no structured exam (legacy) derives byte-identically and the PDF / SMS / snapshot are unchanged.**

---

## Scope (confirmed 2026-06-18)

| Decision | Choice |
|---|---|
| Storage | **Typed JSONB** `examination_json` on `prescriptions` (OBJ-D1), mirroring `complaints`. One additive migration (150). |
| Systems in P1 | **5 core only** (OBJ-D3 C3): `general`, `cvs`, `resp`, `abd`, `cns`. Specialty/long-tail systems are **out** (ship via templates + custom sections in P3/P4). |
| Card model | **Tri-state** (OBJ-D4): absent system = not examined; `[Normal]` fills the normal one-liner; `[Abnormal]` reveals chips + free text. |
| Derived output | `examination_findings` is **derived** from `examination_json` in `buildRxPayload` (OBJ-D2). **Legacy rows (empty `examination_json`) pass their existing free-text through unchanged** — byte-identical (obj-04 gate). |
| Free-text fallback | The general/systemic textareas stay as the escape hatch (OBJ-D7), kept (collapsed) under the structured cards; their content feeds the legacy-passthrough path. |
| Visibility / order / collapse | **Out** — all 5 cards visible, vitals open. Layout engines + modality/specialty defaults are P3 (OBJ-D6). |
| Vitals | **Unchanged** — `VitalsGrid` stays as-is; Vitals 2.0 is P2. |
| Patient-facing output | **Unchanged** for legacy rows; structured rows render a clean derived string. PDF/SMS/snapshot read the derived text (no structured PDF blocks in P1). |

---

## Decision lock (frozen for this phase)

- **P1-D1 — typed JSONB, mirror complaints (OBJ-D1).** `examination_json` is a JSONB array on `prescriptions`; element = `{ systemId, status, findings?, notes? }`. Reducer actions and hydration clone the `complaints` path.
- **P1-D2 — `examination_findings` is derived; legacy passes through (OBJ-D2).** `buildRxPayload` derives the text from `examination_json`. When `examination_json` is empty, the existing `examination_findings` (general + systemic delimiter text) is emitted **unchanged** — the close-gate (obj-04) proves byte-parity on legacy fixtures.
- **P1-D3 — C3 hybrid, 5 core systems (OBJ-D3).** Only `general`/`cvs`/`resp`/`abd`/`cns` are typed in P1. The registry has an OLDCARTS-style default so unknown/custom systemIds still render (future-proofing, not exercised in P1 UI).
- **P1-D4 — tri-state, chips frontend-only (OBJ-D4).** The per-system normal one-liner + abnormal chip palette live in a frontend `exam-schema.ts` registry. Zod validates `examination_json` shape (drop unknown systemIds, coerce/skip bad status) but does **not** enforce the chip vocabulary.
- **P1-D5 — exam JSONB is PHI.** `examination_json` holds clinical findings → PHI. Doctor-scoped RLS (migration 026 covers new columns), never logged, column comment marks it PHI.
- **P1-D6 — additive only; no removal.** The general/systemic textareas + legacy `vitalsText` stay (OBJ-D7). No deletion of existing exam fields, columns, or the delimiter helper in this phase.
- **P1-D7 — no layout chrome, no templates, no carry-forward.** Reorder/collapse/visibility (P3), templates/specialty packs (P4), and carry-forward are explicitly out of P1.

---

## What this phase does NOT do (deferred)

| Item | Why / lands |
|---|---|
| Specialty / long-tail exam systems (gynae P/V·P/S, ortho ROM, derm lesion, ENT, MSE) | Out (P1-D3) — C3 long tail ships via templates + custom objective sections (P3/P4). |
| Section reorder / collapse memory / visibility / modality defaults | Out (P1-D7) — ported from subjective in P3 (OBJ-D6). |
| Exam templates, specialty presets, "normal cardiac exam" macros across visits | Out — P4. ("Mark entire exam normal" within a visit **is** in P1.) |
| Carry-forward last visit's exam | Out — later phase. |
| Vitals 2.0 (RR, pain, glucose, units, range flags) | Out — P2; `VitalsGrid` untouched. |
| Structured exam blocks **in the PDF** | Out — PDF reads the derived `examination_findings` text in P1; structured PDF rendering is a later enhancement. |
| Removing legacy free-text exam / `vitalsText` | Out (P1-D6 / OBJ-D7) — kept as the escape hatch; sunset is a separate decision. |

---

## Cross-cutting acceptance gate (whole phase)

Phase 1 is green only when **all** hold:

- [x] ✅ `examination_json` migration (150) is idempotent, RLS doctor-scoped, PHI-commented; default `[]` reads back. (obj-01)
- [x] ✅ `examination_json` round-trips through the prescription read/write path (BE type + Zod + service); unknown systemIds dropped, bad status coerced/skipped — never bricks a save. (obj-01)
- [x] ✅ The 5 core system cards render tri-state; one-tap WNL fills the normal one-liner; abnormal reveals chips + free text; "mark entire exam normal" sets all 5. (obj-03)
- [x] ✅ **Byte-parity:** for a legacy row (empty `examination_json`, existing general/systemic text), `buildRxPayload` emits `examination_findings` **byte-identical** to today; PDF body carries no exam field + SMS summary ignores exam (asserted) → outputs unchanged. (obj-04 fixtures)
- [x] ✅ Structured rows derive a clean, deterministic `examination_findings` string (stable ordering: systems in registry order — single-sourced from `exam-schema.ts`). (obj-04)
- [x] ✅ No PHI in logs; the general/systemic textareas + `vitalsText` still work (escape hatch intact — collapsed legacy block). (obj-03)
- [x] ✅ Backend exam tests green (33) + frontend exam suite green (58) + lint clean on touched files. Pre-existing repo-wide `tsc --noEmit` debt (unrelated `social-history-*` / `subjective-section-*` files) routed, not introduced. (obj-04)

---

## Tasks

| Task | Title | Size | Model |
|---|---|---|---|
| [`obj-01`](./Tasks/task-obj-01-data-model-and-derived-contract.md) | Data model + form state + derived `examination_findings` contract | M–L | **Opus** |
| [`obj-02`](./Tasks/task-obj-02-exam-system-registry.md) | Exam-system schema registry (`exam-schema.ts`) | S | Auto |
| [`obj-03`](./Tasks/task-obj-03-exam-card-and-host.md) | `ExamSystemCard` + `ExamSystemList`; rewire `ObjectiveSection` | M | Auto |
| [`obj-04`](./Tasks/task-obj-04-derivation-close-gate.md) | Derivation byte-parity close-gate + a11y + verification | S–M | **Opus** |

---

## References

- Exec order: [`Tasks/EXECUTION-ORDER-p1-objective-tab-structured-exam.md`](./Tasks/EXECUTION-ORDER-p1-objective-tab-structured-exam.md).
- Product plan: [`Product plans/ehr/objective-tab/plan-objective-tab.md`](../../../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md).
- Subjective precedent: [`../../03-06-2026/subjective-tab/p1-complaint-cards/`](../../../03-06-2026/subjective-tab/p1-complaint-cards/) (the `complaints`→`cc`/`hopi` analog).
- Process: [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-18. **Status:** ⏳ `Planned`.
