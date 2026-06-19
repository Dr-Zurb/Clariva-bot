# Objective tab — Phase 1: structured exam — execution order

> Sibling of [`plan-p1-objective-tab-structured-exam-batch.md`](../plan-p1-objective-tab-structured-exam-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** `obj-01` is the keystone (migration + backend type/Zod/service + shared form state + the derived `examination_findings` contract) and must land first — everything reads that state. `obj-02` (the pure exam-system registry) depends only on the systemId set obj-01 freezes and can run alongside obj-03's scaffolding. `obj-03` wires `ObjectiveSection` to render the structured cards using obj-01's state + obj-02's registry. `obj-04` proves byte-parity (legacy rows derive identically), runs the a11y sweep, and closes the verification gate. Strictly linear at the keystone; obj-02/03 overlap; obj-04 last.

---

## Wave plan (3 waves)

```
Wave 1 (keystone — ~3–4h):
  obj-01 (migration 150 examination_json + BE type/Zod/service
          + RxFormFields.examFindings + reducer + buildRxPayload derivation)
          [Opus — new migration + PHI + derived-text contract]
        │
        ▼
Wave 2 (registry + UI — ~4–6h):
  obj-02 (exam-schema.ts: 5 core systems, normal lines, abnormal chips) [Lane α]
  obj-03 (ExamSystemCard + ExamSystemList; rewire ObjectiveSection)     [Lane β, consumes obj-02]
        │
        ▼
Wave 3 (prove + gate — ~2–3h):
  obj-04 (legacy byte-parity fixtures, structured-derivation determinism,
          a11y sweep, PDF/SMS/snapshot parity, verification gate)
          [Opus — output-parity fixtures]
```

**Total wall-clock:** ~9–13h agent-time (Wave 2 lanes overlap after obj-01).

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **obj-01** | M–L | **Opus** | `103_prescription_soap_fields_expansion.sql` + the `116` complaints expansion (additive-column + JSONB pattern); `RxFormContext.tsx` (medicines/complaints reducer + `buildRxPayload` L618+ + serialize L555/L706); `exam-findings.ts` (`parseExam`/`serializeExam`); `prescription-service.ts`, `types/prescription.ts`, `utils/validation.ts` (complaints Zod) | Migration `150_prescriptions_examination_json.sql` (`JSONB NOT NULL DEFAULT '[]'`, PHI comment); BE prescription type + Zod (array of `{ systemId, status, findings?, notes? }`; drop unknown systemId, coerce/skip bad status) + service select/insert mapping; `ExamSystemFinding` type + `examFindings` on `RxFormFields` + reducer actions + hydrate from `rx.examination_json`; `buildRxPayload` writes `examination_json` **and** derives `examination_findings` (structured → text in registry order; **empty json ⇒ pass existing free-text through unchanged**). |
| W2.α | obj-02 | S | Auto | obj-01 systemId set; `complaint-schema.ts` (registry shape precedent) | `frontend/lib/cockpit/exam-schema.ts`: the 5 core systems (`general`/`cvs`/`resp`/`abd`/`cns`) each with label, normal one-liner, abnormal chip palette; an OLDCARTS-style default for unknown systemIds. Pure data + a resolver; unit-tested. |
| W2.β | obj-03 | M | Auto | obj-01 `examFindings` state + actions; obj-02 registry; `MedicineRow.tsx`/`ComplaintCard.tsx` (card pattern); `ObjectiveSection.tsx` (current host, `VitalsGrid`, test-results, legacy `details`) | `ExamSystemCard` (tri-state toggle, one-tap WNL fills normal line, abnormal reveals chip palette + free text, notes) + `ExamSystemList` (the 5 cards + a "mark entire exam normal" header action); rewire `ObjectiveSection` to render the list above the kept (collapsed) general/systemic free-text fallback. `VitalsGrid` + test-results untouched. |
| W3.0 | **obj-04** | S–M | **Opus** | obj-01 derivation; existing PDF/notification mappers + any subjective `subj-10` close-gate fixtures (`examination_findings` parity precedent); `ObjectiveSection.*.test` patterns | Fixtures: legacy row (empty json + general/systemic text) ⇒ `buildRxPayload.examination_findings` **byte-identical**; structured row ⇒ deterministic string (registry order); PDF/SMS/snapshot snapshot-parity for legacy; a11y sweep (tri-state toggle keyboard/aria, `disabled` mode); run verification gate. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| obj-01 | M–L | **Opus** | New migration file (hard rule) on a PHI table; structured JSONB + Zod + service mapping + shared Rx form state + the **derived `examination_findings` contract** (output-parity risk into PDF/SMS/snapshot). Highest-risk slice — Opus. |
| obj-02 | S | Auto | Pure, bounded data registry + resolver, cloning `complaint-schema.ts`. No data/clinical path. |
| obj-03 | M | Auto | Structured-card UI cloned from the proven `MedicineRow`/`ComplaintCard` pattern over obj-01 state; bounded to `ObjectiveSection` + the two new card components. |
| obj-04 | S–M | **Opus** | Output-parity fixtures (byte-identical `examination_findings` for legacy rows feeding the PDF) — the same fixture-risk profile that made subjective's close-gate Opus. |

**Caps check:** 2 Opus in Phase 1 (obj-01 migration/contract keystone; obj-04 parity gate); ≤1 Opus per wave. ✓

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p1-objective-tab-structured-exam-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p1-objective-tab-structured-exam-batch.md`](../plan-p1-objective-tab-structured-exam-batch.md).
- Product plan: [`Product plans/ehr/objective-tab/plan-objective-tab.md`](../../../../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md) — P1, `OBJ-D1..D7`.
- Tasks: [`task-obj-01-…`](./task-obj-01-data-model-and-derived-contract.md) · [`task-obj-02-…`](./task-obj-02-exam-system-registry.md) · [`task-obj-03-…`](./task-obj-03-exam-card-and-host.md) · [`task-obj-04-…`](./task-obj-04-derivation-close-gate.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-18. **Status:** ⏳ `Planned`.
