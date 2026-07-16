# Objective Reports section — 08 Jul 2026 program plan

> **Program plan.** Collapses the Objective tab's three investigation sections (`test_results` + `point_of_care` + `media`) into **one "Reports" section**, then builds it up: verifiable library-backed lab panels, photo upload, LLM extraction behind a mandatory verify dialog, and an imaging kind (photo and/or findings). Phased so R1 ships as pure UI cleanup (no migration) and the schema/AI phases sit behind Opus gates per the agent contract.
>
> **Overview + decisions:** [`README.md`](./README.md) (decision locks `RPT-D1..D8`).
>
> **Builds on (reuse, do not fork):** `test_results_json` + tolerant Zod (`obj-20`, migration 154); the `prescription-attachments` bucket + signed URLs + `objective/` tagging (`obj-22`); the shipped verify-before-apply parse services (`complaint-parse-service.ts`, `medicine-parse-service.ts`) + tiered `config/openai.ts`; the static-catalog discipline of `exam-schema.ts` / `test-result-catalog.ts`.
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-objective-reports.md`](./Tasks/EXECUTION-ORDER-objective-reports.md).

---

## What this program does (one sentence)

> **Make investigations one "Reports" section, retire the in-clinic/POC *section* split (keep the `source` field), model lab results as verifiable panels backed by a researched static test library with reference ranges, add photo upload + multimodal-LLM extraction that never auto-commits, and add an imaging kind with optional photo and/or findings — with `test_results` TEXT derivation parity byte-identical and every migration/AI phase Opus-gated.**

---

## Scope

| Surface | Change | Mechanism | Task |
|---|---|---|---|
| Section registry | drop `point_of_care` as a section; relabel `test_results`→"Reports"; retire `media` as a standalone section | `objective-section-order.ts` + `ObjectiveSection.tsx` sectionBody | `rpt-01` |
| Modality default layout | remove POC-specific hide logic; simplify video/async hidden sets | `objective-default-layout.ts` | `rpt-01` |
| Chip catalog | merge patient-brought + POC chips into one suggestion list | `test-result-catalog.ts` | `rpt-01` |
| Row data model | add report grouping (`reportId`) + reference-range fields; new `lab_reports_json` column | `prescription.ts` types (FE+BE), migration 159, `validation.ts` | `rpt-02` |
| Derivation parity | `test_results` TEXT still derived from rows on save (OBJ-D2) | `test-results.ts` derivation | `rpt-02` |
| Lab-test library | analytes / panels / units / ranges / aliases (researched) + panel scaffolding + custom row | new static catalog module | `rpt-03` |
| Photos + imaging | link attachments per report; imaging kind (photo and/or findings) | reuse attachment strip; report-scoped filter | `rpt-04` |
| Extraction | vision→JSON, alias match, sanity checks, mandatory verify dialog | new BE service + FE dialog (parse-service pattern) | `rpt-05` |
| Per-doctor library | persist custom tests to the doctor's picker; (later) lab trend view | `doctor_settings` JSON or small table | `rpt-06` |
| Verification | tsc/lint/test parity; derivation byte-identical; PHI discipline | tests + QA notes per task | all |

**Out of scope:** DB-backed catalog (v1 is static TS); radiology narrative extraction; test *ordering* (Plan side); removing `source` from the schema; cross-visit trend UI (R5 stretch). See [`README.md` → deferred](./README.md#what-this-program-does-not-do-deferred).

---

## Decision lock

Frozen in [`README.md` → Decision lock](./README.md#decision-lock-freezes-on-promotion): **RPT-D1** one "Reports" section · **RPT-D2** retire POC section, keep `source` field · **RPT-D3** rows group into report panels; ungrouped→"Other results" · **RPT-D4** static TS lab library (v1) · **RPT-D5** ranges are defaults, printed range wins, auto-flag overridable · **RPT-D6** extraction never auto-commits (verify-before-apply) · **RPT-D7** imaging photo optional (photo and/or findings) · **RPT-D8** derivation parity + PHI discipline (no RLS edits, no PHI logs).

---

## Cross-cutting acceptance gate (whole program)

The program is green only when **all** hold:

- [ ] Objective tab shows **one** "Reports" section; `point_of_care` is gone as a section and no stored layout referencing it breaks (dropped gracefully by `resolveInitialSectionOrder`). _(rpt-01)_
- [ ] `test_results` TEXT is **byte-identical** to today for the same row content (OBJ-D2 derivation parity suite green). _(rpt-01, rpt-02)_
- [ ] Lab rows can be grouped under a report header; ungrouped legacy rows still render; old prescriptions load unchanged. _(rpt-02)_
- [ ] Picking a panel scaffolds its analyte rows with unit + default reference range prefilled; a custom test can be added. _(rpt-03)_
- [ ] A report photo can be uploaded and viewed; imaging can be saved with findings only (no photo) or a photo only. _(rpt-04)_
- [ ] Extraction output **never** enters the form without an explicit verify-dialog confirm; flagged/unmatched rows are highlighted; failure degrades to manual entry. _(rpt-05)_
- [ ] No PHI in logs; new columns reuse existing `prescriptions` RLS with **no policy edits**; migration is idempotent with a documented rollback. _(rpt-02, rpt-05)_
- [ ] `cd frontend && npx tsc --noEmit && npm run lint && npm test` and (where BE touched) `cd backend && npm run typecheck && npm test` clean for the slice (pre-existing unrelated failures routed, not introduced). _(all)_

---

## Tasks

| Task | Title | Size | Model |
|---|---|---|---|
| `rpt-01` | Merge to one "Reports" section (retire POC section, fold media, merge chips, simplify modality seeds) | M | Sonnet |
| `rpt-02` | Lab report grouping + reference-range row fields + `lab_reports_json` migration + Zod + derivation parity | L | **Opus** (migration + PHI column) |
| `rpt-03` | Researched lab-test library (analytes/panels/units/ranges/aliases) + panel scaffolding + custom row | M–L | Sonnet (+ content review pass) |
| `rpt-04` | Photos per report + imaging kind (photo and/or findings) | M | Sonnet |
| `rpt-05` | Lab-photo extraction (vision→JSON, alias match, sanity checks) + mandatory verify dialog | L | **Opus** (external AI on PHI) |
| `rpt-06` | Per-doctor custom test library (+ optional lab trend view) | M | Sonnet |

---

## Cost estimate

| Wave | Tasks | Auto/Sonnet | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | rpt-01 (merge sections) | 1 | 0 | ~3–4h |
| Wave 2 | rpt-02 (model + migration) | 0 | 1 | ~4–6h |
| Wave 3 | rpt-03 (lab library) | 1 | 0 | ~4–6h + content research |
| Wave 4 | rpt-04 (photos + imaging) | 1 | 0 | ~3–4h |
| Wave 5 | rpt-05 (extraction + verify) | 0 | 1 | ~5–8h |
| Wave 6 | rpt-06 (custom library) — optional | 1 | 0 | ~3–4h |
| **Total** | **6** | **4** | **2** | **~22–32h agent-time + content research** |

**Caps check:** ≤1 Opus per wave ✓. **Program Opus count = 2** (rpt-02 migration/PHI, rpt-05 AI-on-PHI) — both are agent-contract escalations, flagged in-task. rpt-03 content research (units/ranges/aliases for ~30–40 analytes) is a **human/review pass**, not agent time.

---

## Sequencing notes

- **rpt-01 first (pure cleanup, no migration).** Merging the sections is independent of the model work and delivers the visible win immediately. It also fixes the modality-seed simplification once, so later tasks don't re-touch layout. Low blast radius → Sonnet. Ship it before anything else.
- **rpt-02 next (substrate for everything structured).** The grouped-report model + range fields must land before the library (rpt-03) and extraction (rpt-05) have somewhere to write. Migration + PHI column ⇒ **Opus + STOP/flag** per the agent contract; prove `test_results` derivation byte-identical.
- **rpt-03 (content-heavy).** The library is mostly researched static data; agent wires the module + panel scaffolding + custom row, but the unit/range/alias content needs a clinical review pass before trusting the defaults (RPT-D5). Depends on rpt-02's field shape.
- **rpt-04 (photos + imaging).** Reuses the shipped attachment bucket; adds report-scoped linking + the imaging kind. Can start once rpt-02 defines report headers. Sonnet.
- **rpt-05 (extraction) last of the build.** Needs the model (rpt-02), the library for alias matching (rpt-03), and photo linking (rpt-04) all in place. External AI on PHI images ⇒ **Opus + STOP/flag**; verify-before-apply is the invariant.
- **rpt-06 optional.** Per-doctor custom library + trend view are additive; ship or drop without touching the core section.

---

## References

- **Overview / decisions:** [`README.md`](./README.md).
- **Reused pipeline:** `frontend/lib/cockpit/test-results.ts` + `test-result-catalog.ts`; `backend/src/utils/validation.ts` (`testResultRowSchema`); migration `backend/migrations/154_prescriptions_test_results_json.sql`.
- **Attachments:** `backend/src/services/prescription-attachment-service.ts`; `frontend/lib/cockpit/objective-media.ts`.
- **AI verify precedent:** `backend/src/services/complaint-parse-service.ts`, `medicine-parse-service.ts`; `backend/src/config/openai.ts`.
- **Process:** `docs/Work/process/PHASED-PLANS-GUIDE.md` · `EXECUTION-ORDER-GUIDELINES.md` · `CODE_CHANGE_RULES.md`. **DoD:** `docs/Reference/engineering/development/DEFINITION_OF_DONE.md`. **Agent contract:** `.cursor/rules/00-agent-contract.mdc`.

---

**Created:** 2026-07-08. **Status:** Draft — not committed, not implemented.
