# Teleconsult-aware examination — execution order

> Sibling of [`plan-teleconsult-exam-batch.md`](../plan-teleconsult-exam-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** `docs/Work/process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`

> **Shape.** `tc-01` is the substrate — the per-subsection `remote` flag, the teleconsult WNL lines, and a readable `consultationType` — everything downstream reads it. `tc-02` applies the teleconsult UI preset across the 5 exam bodies (reorder + greyed/collapsed/tagged in-person-only + opt-in). `tc-03` scopes "Mark normal" and appends the limitation caveat to `examination_findings` (guarding in-clinic byte-parity). `tc-04` closes the parity / behaviour / a11y / verification gate. Linear chain.

---

## Wave plan (4 waves)

```
Wave 1 (substrate — ~2–3h):
  tc-01 (remote-feasibility flag + teleconsult WNL lines on subsection schema;
         surface consultationType as form state; pure resolvers + unit tests)
        │
        ▼
Wave 2 (~4–6h):
  tc-02 (teleconsult exam UI preset across the 5 system bodies + ExamSubsectionCollapsible
         tag/deemphasis; assessable-first, in-person-only greyed/collapsed/tagged,
         opt-in expand, patient-assisted flip, no auto-normal)
        │
        ▼
Wave 3 (~3–4h):
  tc-03 (scoped teleconsult "Mark normal" line + auto limitation caveat in
         examination_findings; in-clinic byte-parity)
        │
        ▼
Wave 4 (~2–3h):
  tc-04 (in-clinic parity + teleconsult behaviours + a11y + verification gate)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **tc-01** | S–M | Sonnet | the 5 `*-exam-finding-schema.ts` subsection defs (`CVS/RESP/ABD/CNS/GENERAL_EXAM_SUBSECTIONS`); `exam-schema.ts` (`normalLine`, fallback); `RxFormContext.tsx` + `useRxFormProviderSetup.ts` (`loadConsultationType`, seed path) | Add `remote` flag + teleconsult WNL line; resolvers; **surface `consultationType`** as readable form state (today it only seeds vitals defaults). Pure data + plumbing — **no UI, no derivation change**. |
| W2.0 | tc-02 | M–L | **Opus** | tc-01 flags/resolvers; `ExamSubsectionCollapsible.tsx` (header/tag slot, open-state hook); all 5 `Exam*SystemBody.tsx`; the exam-subsection-collapse tests | Branch bodies on `isTeleconsult`: assessable-first order; `in_person_only` greyed + collapsed + **"In-person only"** tag; opt-in expand; **"Patient-assisted"** once data entered; suppress auto-open/auto-normal. In-clinic layout untouched. Opus per 5+ file refactor. |
| W3.0 | tc-03 | M | **Opus** | tc-01 WNL lines; `exam-finding-utils.ts` + `deriveExaminationFindingsFromExam` in `RxFormContext.tsx`; `ExamSystemStatusToolbar` normal wiring; `examDerivationParity` / `objectiveLayoutParity` / `rxFormContext.exam` suites | Teleconsult normal → scoped WNL line; append visit-level caveat to `examination_findings`; **in-clinic derivation byte-identical**. Opus per locked derived-text contract. |
| W4.0 | tc-04 | S–M | Sonnet | tc-01/02/03 output; existing exam/objective suites to mirror | In-clinic parity green; teleconsult behaviours (order, tag, opt-in, patient-assisted, scoped normal, caveat); a11y (tag announced, keyboard opt-in); `tsc`/lint/test gate (FE). |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| tc-01 | S–M | Sonnet | Pure data + a small `consultationType` selector; no schema/DB, no derived-text, low blast radius. |
| tc-02 | M–L | **Opus** | Touches all 5 exam bodies + the shared collapsible wrapper with new UX semantics (de-emphasis, tags, opt-in, suppressed auto-normal) → the "5+ file refactor" escalation. |
| tc-03 | M | **Opus** | Modifies the **locked** `examination_findings` derived-text contract (scoped normal + caveat) and must prove in-clinic byte-parity — same posture as `obj-30`. |
| tc-04 | S–M | Sonnet | Parity + behaviour + a11y + tests; blast radius low, contract proof lives in tc-03. |

**Caps check:** ≤1 Opus per wave ✓. **Batch Opus count = 2** (tc-02, tc-03). **No migration** ⇒ no schema-escalation.

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-teleconsult-exam-batch.md#cross-cutting-acceptance-gate-whole-batch).

---

## References

- Batch plan: [`plan-teleconsult-exam-batch.md`](../plan-teleconsult-exam-batch.md) · overview [`README.md`](../README.md).
- Tasks: [`task-tc-01-…`](./task-tc-01-exam-remote-feasibility-schema.md) · [`task-tc-02-…`](./task-tc-02-teleconsult-exam-ui-preset.md) · [`task-tc-03-…`](./task-tc-03-scoped-normal-and-limitation-derivation.md) · [`task-tc-04-…`](./task-tc-04-teleconsult-exam-close-gate.md).
- Process: `docs/Work/process/EXECUTION-ORDER-GUIDELINES.md` · `CODE_CHANGE_RULES.md`.

---

**Created:** 2026-07-02. **Status:** Committed — not yet implemented.
