# Teleconsult-aware examination — 02 Jul 2026 batch plan

> **Program batch.** Makes the objective-tab **examination** section teleconsult-aware: reorder to remotely-assessable findings first, render the un-performable IPPA subsections (Auscultation / Palpation / Percussion) **greyed + collapsed + tagged "In-person only"** (opt-in expand, never auto-normal), scope "Mark normal" to the assessable surface, and append a teleconsultation limitation caveat to the derived exam text. **View + derivation preset only — no migration, in-clinic output byte-identical to today.**
>
> **Overview + decisions:** [`README.md`](./README.md) (decision locks `TC-D1..D6`).
>
> **Builds on (reuse, do not fork):** the teleconsult provenance defaults in [`measurement-context.ts`](../../../../../../frontend/lib/cockpit/measurement-context.ts); the shared collapsible subsection wrapper `ExamSubsectionCollapsible.tsx` shipped with the exam-subsection-collapse work; the flat-findings + byte-parity discipline from `obj-30`; the per-system subsection schemas (`*-exam-finding-schema.ts`).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-teleconsult-exam.md`](./Tasks/EXECUTION-ORDER-teleconsult-exam.md).

---

## What this batch does (one sentence)

> **Add a per-subsection `remote` feasibility flag + a teleconsult WNL line to the exam schema, surface the appointment's `consultationType` to the exam layer, and — when teleconsult — render assessable subsections first with in-person-only subsections greyed/collapsed/tagged (opt-in, never auto-normal), scope "Mark normal", and suffix `examination_findings` with a limitation caveat; in-clinic stays byte-identical.**

---

## Scope

| Surface | Change | Mechanism | Task |
|---|---|---|---|
| Subsection schema | add `remote: "assessable" \| "in_person_only"` to each rendered subsection; add per-system teleconsult WNL line | edit the `*-exam-finding-schema.ts` subsection defs + `exam-schema.ts` fallback; pure data | `tc-01` |
| Modality plumbing | expose `consultationType` as readable RX-form state (today it only seeds vitals defaults) | `RxFormContext` selector / state | `tc-01` |
| Resolvers | `resolveSubsectionRemoteFeasibility`, `teleconsultNormalLine(systemId)`, `isTeleconsult(...)` | pure helpers + unit tests | `tc-01` |
| Exam UI preset | teleconsult layout: assessable-first order; in-person-only greyed + collapsed + **"In-person only"** tag; opt-in expand; **"Patient-assisted"** tag once data entered; no auto-open/auto-normal for in-person-only | extend `ExamSubsectionCollapsible` (tag/deemphasis prop) + branch in the 5 system bodies on `isTeleconsult` | `tc-02` |
| "Mark normal" | teleconsult normal derives the **scoped** WNL line | body normal-line wiring | `tc-03` |
| Derivation | append visit-level teleconsult caveat to `examination_findings`; in-clinic unchanged | `exam-finding-utils.ts` / `deriveExaminationFindingsFromExam` | `tc-03` |
| Verification | in-clinic byte-parity + teleconsult behaviours + a11y + FE gate | tests | `tc-04` |

**Out of scope:** any migration/column; storing "not assessed"; device-audio capture; new teleconsult-only systems (Derm/MSK/ENT); patient pre-visit intake; any change to in-clinic behaviour/output (parity gate).

---

## Decision lock

Frozen in [`README.md` → Decision lock](./README.md#decision-lock-freezes-on-promotion): **TC-D1** view/no-migration · **TC-D2** per-subsection `remote` flag · **TC-D3** display-de-emphasised-opt-in (not hidden) · **TC-D4** scoped "Mark normal" · **TC-D5** auto caveat + in-clinic byte-parity · **TC-D6** modality from `consultationType` surfaced as form state.

---

## Cross-cutting acceptance gate (whole batch)

The batch is green only when **all** hold:

- [ ] In-clinic (`consultation_type = in_clinic`, or absent) examination UI **and** derived `examination_findings` are **byte-identical to pre-change** — proven by the existing parity suites staying green. _(tc-03/tc-04)_
- [ ] Each rendered subsection resolves a correct `remote` feasibility; Inspection/observable = `assessable`, Auscultation/Palpation/Percussion = `in_person_only`. _(tc-01)_
- [ ] `consultationType` is readable by the exam layer (not inferred from vitals `measurementContext`). _(tc-01)_
- [ ] In teleconsult: assessable subsections render first; `in_person_only` subsections render **greyed + collapsed + tagged "In-person only"**, are **opt-in** to expand, and are **never auto-expanded / auto-marked normal**. _(tc-02)_
- [ ] Recording a finding inside an expanded `in_person_only` subsection stores it exactly as today and flips its tag to **"Patient-assisted"**. _(tc-02)_
- [ ] Teleconsult "Mark normal" derives the **scoped** WNL line; `examination_findings` carries the teleconsult limitation caveat. _(tc-03)_
- [ ] a11y: the feasibility tag is announced (not colour-only); opt-in expand is keyboard-operable; no PHI in labels/logs. _(tc-04)_
- [ ] `cd frontend && npx tsc --noEmit && npm run lint && npm test` clean for the slice (pre-existing unrelated failures routed, not introduced). _(tc-04)_

---

## Tasks

| Task | Title | Size | Model |
|---|---|---|---|
| `tc-01` | Remote-feasibility flag + teleconsult WNL lines on the subsection schema; surface `consultationType` as form state; pure resolvers + unit tests | S–M | Sonnet |
| `tc-02` | Teleconsult exam UI preset across the 5 system bodies + `ExamSubsectionCollapsible` tag/deemphasis; reorder, greyed/collapsed/tagged in-person-only, opt-in, patient-assisted flip, no auto-normal | M–L | **Opus** (5+ files + UX semantics) |
| `tc-03` | Scoped teleconsult "Mark normal" line + auto limitation caveat in `examination_findings`; in-clinic byte-parity | M | **Opus** (locked derived-text contract) |
| `tc-04` | Close gate: parity + teleconsult behaviours + a11y + verification | S–M | Sonnet |

---

## Cost estimate

| Wave | Tasks | Auto/Sonnet | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | tc-01 (schema + plumbing + resolvers) | 1 | 0 | ~2–3h |
| Wave 2 | tc-02 (UI preset across bodies) | 0 | 1 (5+ files) | ~4–6h |
| Wave 3 | tc-03 (scoped normal + caveat derivation) | 0 | 1 (derived-text) | ~3–4h |
| Wave 4 | tc-04 (close gate) | 1 | 0 | ~2–3h |
| **Total** | **4** | **2** | **2** | **~11–16h agent-time** |

**Caps check:** ≤1 Opus per wave ✓. **Batch Opus count = 2** (tc-02 UI refactor, tc-03 derived-text). No migration ⇒ no schema-escalation.

---

## Sequencing notes

- **tc-01 first (substrate).** The UI + derivation both need the `remote` flag, the teleconsult WNL lines, and a readable `consultationType`. Pure data + light plumbing → Sonnet.
- **tc-02 next (the visible change).** Branch the 5 bodies on `isTeleconsult`; reuse `ExamSubsectionCollapsible` for the tag + de-emphasis. Opus per the 5+ file rule.
- **tc-03 (semantics + text).** Scoped normal + caveat suffix; the parity guard for in-clinic lives here. Opus per the derived-text contract.
- **tc-04 last (prove + gate).** In-clinic parity, teleconsult behaviours, a11y, verification gate.

---

## References

- **Overview / decisions:** [`README.md`](./README.md).
- **Provenance precedent:** `frontend/lib/cockpit/measurement-context.ts` (teleconsult defaults).
- **Prior parity discipline:** `obj-30` exam-card + flat-findings; the exam-subsection-collapse work (`ExamSubsectionCollapsible.tsx`).
- **Process:** `docs/Work/process/PHASED-PLANS-GUIDE.md` · `EXECUTION-ORDER-GUIDELINES.md` · `CODE_CHANGE_RULES.md`. **DoD:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`.

---

**Created:** 2026-07-02. **Status:** Committed — not yet implemented.
