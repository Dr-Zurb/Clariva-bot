# Objective tab — Phase 4: exam templates + specialty packs (scoped `doctor_rx_templates`) — 18 Jun 2026 batch plan

> **Phase 4 of the Objective-tab program.** Phases 1–3 made the Objective tab *structured* (system-wise exam cards + Vitals 2.0) and gave it the *layout engines* (reorder · collapse · visibility · custom sections · modality/specialty default visibility). But the doctor still **re-types the same exam every visit** — there is no objective equivalent of the subjective "Templates" button. Phase 4 **ports the subjective scoped-template engine** (shipped across subjective P6, `subj-15..18`) to Objective: each objective section gets its own **Templates** button that saves/applies only that section's data, plus **specialty exam packs** — preselected starter templates per specialty (`exam-catalog.md` §E2) that fill *content* on top of P3's modality/specialty *visibility* seed. The derived `examination_findings` / `test_results` / `vitals_*` and the PDF/SMS/snapshot stay **byte-unchanged** — a template only fills the same structured form state a doctor would tap by hand.
>
> **Source plan:** [`Product plans/ehr/objective-tab/plan-objective-tab.md`](../../../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md) — phase P4 (exam templates + specialty packs); inherits `OBJ-D1..OBJ-D7`.
>
> **Prefix note:** tasks are `obj-16..19` (program numbering continues from P3's `obj-09..15`).
>
> **Builds on:** the **Subjective-tab** scoped-template engine (shipped — P6 `subj-15..18`): the `scope` discriminator on [`doctor_rx_templates`](../../../../../../../backend/migrations/119_doctor_rx_templates_subjective_json.sql) (migration 141), the scoped save/apply helpers ([`apply-subjective-template.ts`](../../../../../../../frontend/lib/cockpit/apply-subjective-template.ts)), the reusable section Templates button, and the `scope`/`variant`-aware [`TemplatePicker.tsx`](../../../../../../../frontend/components/ehr/TemplatePicker.tsx). And this program's own P3 deliverables: the objective section registry ([`objective-section-order.ts`](../../../../../../../frontend/lib/cockpit/objective-section-order.ts)), the custom-objective engine ([`custom-objective-sections.ts`](../../../../../../../frontend/lib/cockpit/custom-objective-sections.ts)), and the modality/specialty seed ([`objective-default-layout.ts`](../../../../../../../frontend/lib/cockpit/objective-default-layout.ts), `normalizeSpecialty`). **Reuse, do not fork** ([`exam-catalog.md`](../../../../../../capture/features/objective-tab/exam-catalog.md) §E).
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). obj-16 (the `objective_json` column + objective scope enum) is **Opus** (hard rule: new migration — additive JSONB column; downgrade to Auto only if the team's migration policy allows). obj-17 (form-state scoped apply + reusable button + wiring) and obj-18 (specialty packs catalog) are Sonnet (clone the shipped subjective path). obj-19 (whole-objective upgrade + output-parity/apply-round-trip/a11y close-gate) is **Opus** (parity-fixture rigor, mirrors obj-15).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p4-objective-tab-exam-templates.md`](./Tasks/EXECUTION-ORDER-p4-objective-tab-exam-templates.md).

---

## What Phase 4 does (one sentence)

> **Add objective scopes + an `objective_json` payload to the existing `doctor_rx_templates` table so each Objective section (whole-objective, vitals, structured exam, per-system, custom block) gets its own scoped "Templates" button that saves/applies only its own structured form state via the RxForm reducer — and ship specialty exam packs (preselected starter templates per specialty) that fill exam content on top of P3's modality/specialty visibility seed — all view-only against the derived output (OBJ-D2).**

---

## Scope (draft 2026-06-18 — confirm before promotion)

| Section | Data source | Save reads from | Apply mechanism | Scope value |
|---|---|---|---|---|
| Whole objective | RxForm state | exam + vitals + test results + custom sections | reducer dispatch | `objective_full` |
| Vitals | RxForm state | the `vitals_*` field set | reducer dispatch | `vitals` |
| Structured exam (all systems) | RxForm state | `fields.examFindings[]` | reducer dispatch | `exam_systemic` |
| Per-system exam | RxForm state | one `examFindings[]` entry | reducer dispatch | `exam_general` · `exam_cvs` · `exam_resp` · `exam_abd` · `exam_cns` |
| Custom objective block | RxForm state | one `fields.objectiveCustomSections[]` entry | reducer dispatch | `objective_custom_block` |
| **Specialty pack** | static starter catalog | n/a (read-only seed) | reducer dispatch (apply only) | applied as `objective_full` content |

**Key simplification vs. subjective P6:** every objective template is **pure RxForm state** (exam JSON + vitals columns + test-results text + custom sections). There is **no server-backed chart slice** (the subjective PMH/allergies `create-on-apply` + dedup + partial-failure recovery does **not** exist here). So Phase 4 is the *form-state half* of subjective P6 only — no `pmh_json`/`allergies_json` analog, no multi-row chart creates.

---

## Decision lock (draft — freezes on promotion)

- **P4-D1 — one table, reuse the `scope` discriminator (clone P6-D1).** Extend the shipped `doctor_rx_templates` + `scope` enum with the objective values above and add **one** additive `objective_json` JSONB payload column (mirror of `subjective_json`, migration 119). No per-section tables, no second template system.
- **P4-D2 — objective templates are form-state only (binding).** Apply = a reducer dispatch into `examFindings` / the `vitals_*` fields / `testResults` / `objectiveCustomSections`. A template **never** touches server chart rows, **never** writes `doctor_settings` layout/visibility/order config, and **never** writes the derived text directly. (The subjective P6 server-apply/dedup/partial-failure complexity is explicitly out of scope — it has no objective counterpart.)
- **P4-D3 — derived-text contract holds (OBJ-D2 / P3-D3).** Applying a template fills the same structured form state hand-entry fills; `buildRxPayload` then derives `examination_findings` / `test_results` exactly as today. Legacy/empty rows stay byte-identical. Re-proven in the obj-19 close-gate.
- **P4-D4 — specialty packs are seeded starter templates, not schema.** §E2 packs ship as a **static, read-only frontend catalog** of objective starter content per specialty bucket (reusing P3's `normalizeSpecialty`). They are *applied* through obj-17's engine and the doctor can then **save** the result as their own per-doctor template. Packs layer **content** on top of P3's modality/specialty **visibility** seed (P3-D5); a doctor's saved template / explicit edit always wins. No migration, no per-doctor seeding job.
- **P4-D5 — scoped apply is surgical (clone P6-D2).** A `vitals` template touches only vitals; an `exam_cvs` template touches only that system entry; `objective_full` composes the per-section payloads. Never cross-write another section.
- **P4-D6 — per-doctor + "Templates" everywhere (clone P6-D5/D6).** All objective scopes share the existing doctor-scoped RLS on `doctor_rx_templates`; no clinic sharing. Every objective Templates button (and the picker) reads **"Templates"**, matching subjective.
- **P4-D7 — additive only; legacy escape hatches stay (OBJ-D7).** Templates are additive over hand-entry; the legacy free-text exam + `vitalsText` blocks remain. No removal of sections, columns, or helpers.

---

## What this phase does NOT do (deferred)

| Item | Why / lands |
|---|---|
| Server-backed objective template slices (any `create-on-apply` chart rows) | N/A — objective data is all RxForm state; there is no PMH/allergies analog (contrast subjective P6). |
| Per-doctor seeding of specialty packs into `doctor_rx_templates` | Out (P4-D4) — packs are a read-only static catalog the doctor applies, then optionally saves as their own template. |
| Replace-mode apply (overwrite vs. merge) policy beyond the shipped subjective behaviour | Reuse subjective P6's apply semantics verbatim; no new merge mode. |
| Template management UI (rename / reorder / folders) | Out — reuse the picker's existing list + save-current (same as subjective P6). |
| Point-of-care / media template content | P5 — those sections don't exist until P5 lands; their scopes append to the enum then. |
| AI-suggested / specialty auto-apply on open | Out — packs are doctor-invoked; auto-apply is a later, riskier slice. |
| Typed schema for specialty systems (P/V, MSE, ROM) | `OBJ-D3` — long tail stays template/custom-section content, not typed schema. |

---

## Cross-cutting acceptance gate (whole phase)

Phase 4 is green only when **all** hold:

- [x] Migration `153_doctor_rx_templates_objective_json.sql` runs idempotently; adds `objective_json JSONB NOT NULL DEFAULT '{}'` with a `jsonb_typeof = 'object'` CHECK; extends the `scope` enum with the objective values; existing rows + RLS unchanged; config-not-PHI distinction documented. _(obj-16)_
- [x] Zod validates the `objective_json` shape (exam findings array / vitals subset / test-results text / custom-section array) and the new scope values; drops unknown keys; GET/PATCH round-trip; `listRxTemplates(scope)` filters the objective scopes. _(obj-16)_
- [x] Each objective section (vitals, structured exam, per-system, custom block) has a **Templates** button that saves only its own form state and applies only its own form state via the reducer — other sections untouched. _(obj-17)_
- [x] The apply path fills `examFindings` / `vitals_*` / `testResults` / `objectiveCustomSections` exactly as hand-entry; no layout/visibility config write; no server chart write. _(obj-17)_
- [x] Specialty exam packs render per the doctor's specialty bucket (P3 `normalizeSpecialty`), apply starter content through obj-17's engine, and can be saved as a per-doctor template; a doctor override always wins; packs never auto-persist. _(obj-18)_
- [x] Whole-objective template captures + applies exam + vitals + test results + custom sections under one "Templates" button with a combined applying state; existing per-section behaviour unchanged. _(obj-19)_
- [x] **Output parity:** `examination_findings` / `test_results` / `vitals_*` derive byte-identically and PDF/SMS/snapshot are unchanged whether content was hand-entered or template-applied; apply → save → reload → re-apply is a stable fixed point; no template state reaches `buildRxPayload` except through normal form state. _(obj-19)_
- [x] a11y: every Templates button + the picker + the specialty-pack affordance are keyboard + screen-reader operable; `disabled` mode hides the buttons (read-only). _(obj-19)_
- [x] `cd frontend && npx tsc --noEmit && npm run lint && npm test` clean for the slice; `cd backend && npm test` green (pre-existing unrelated failures routed, not introduced). _(obj-19)_

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| P1 | Structured system-wise exam cards + derived-text contract (obj-01..04) | ✅ Complete |
| P2 | Vitals 2.0 (obj-05..08) | ✅ Complete |
| P3 | Layout engines + modality/specialty default visibility (obj-09..15) | ✅ Complete (2026-06-19) |
| **P4** | **Exam templates + specialty packs (scoped `doctor_rx_templates` + `objective_json`) (obj-16..19)** | ✅ Complete (2026-06-19) |
| P5 | Point-of-care results + media (split `test_results`) | 🗒 Drafted |
| P6 | Trends (vital sparklines; BMI / pediatric growth charts) | 🗒 Drafted |

---

## Tasks

| Task | Title | Size | Model |
|---|---|---|---|
| [`obj-16`](./Tasks/task-obj-16-objective-template-scope-foundation.md) | Objective template scope + `objective_json` foundation (migration 153 + types/Zod/service/API/picker) | S–M | **Opus** (migration) |
| [`obj-17`](./Tasks/task-obj-17-form-state-scoped-objective-templates.md) | Form-state scoped objective templates: `apply-objective-template.ts` + reusable button + wire vitals/exam/per-system/custom | M | Sonnet |
| [`obj-18`](./Tasks/task-obj-18-specialty-exam-packs.md) | Specialty exam packs (static starter catalog per §E2; apply via obj-17; layered under doctor overrides + P3 seed) | M | Sonnet |
| [`obj-19`](./Tasks/task-obj-19-whole-objective-template-and-close-gate.md) | Whole-objective template upgrade + output-parity / apply-round-trip / a11y close-gate + verification | M | **Opus** |

---

## Cost estimate

| Wave | Tasks | Auto/Sonnet | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | obj-16 (scope + `objective_json` substrate + migration) | 0 | 1 (migration) | ~2–3h |
| Wave 2 | obj-17 (form-state scoped apply + button + wiring) | 1 | 0 | ~3–4h |
| Wave 3 | obj-18 (specialty packs catalog + affordance) | 1 | 0 | ~3–4h |
| Wave 4 | obj-19 (whole-objective upgrade + close-gate) | 0 | 1 | ~2–4h |
| **Total** | **4** | **2** | **2** | **~10–15h agent-time** |

**Caps check:** 2 Opus in Phase 4 (obj-16 migration; obj-19 parity gate); ≤1 Opus per wave. ✓ (matches P3's shape.)

---

## Sequencing notes

- **obj-16 first (substrate + storage).** Adds the `objective_json` payload column + the objective `scope` enum values + types/Zod/service/API + the picker's `objective` variant. Near-verbatim clone of subjective subj-15 plus the `objective_json` column (clone of migration 119's `subjective_json`). Everything downstream needs the scopes + payload shape frozen. Opus only because it lands a migration; the change is additive and idempotent.
- **obj-17 next (form-state apply).** The objective analog of subjective subj-16: generalise an `apply-objective-template.ts` engine (`buildObjectiveTemplateSavePayload(scope, fields)` / `buildObjectiveTemplateApplyActions(scope, template)` / `objectiveScopeHasContent`), build the reusable `ObjectiveSectionTemplateButton`, and wire vitals + structured exam + per-system + custom-block. Pure reducer dispatch — no server-apply, so simpler than subj-16/17 combined.
- **obj-18 (specialty packs).** Ships a static `objective-specialty-packs.ts` catalog keyed by P3's `normalizeSpecialty` bucket, plus the affordance that lets a doctor preview/apply a pack (through obj-17's engine) and save it as their own template. Reuses P3's specialty bucketing; layers content over P3's visibility seed.
- **obj-19 last (prove + gate).** Folds the per-section scopes into the whole-objective `objective_full` template, runs the output byte-parity gate (hand-entry vs. template-applied → identical payload), the apply→save→reload→re-apply fixed-point, the a11y sweep, and the verification gate. Mirrors obj-15 + subj-18.

---

## References

- **Source:** [`Product plans/ehr/objective-tab/plan-objective-tab.md`](../../../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md) — P4, `OBJ-D2`/`OBJ-D3`/`OBJ-D7`.
- **Catalog detail:** [`capture/features/objective-tab/exam-catalog.md`](../../../../../../capture/features/objective-tab/exam-catalog.md) §E1 (template scopes) + §E2 (specialty packs) + §H (quick entry / carry-forward).
- **Subjective precedent (ported, not forked):** [`../../../03-06-2026/subjective-tab/p6-section-templates/`](../../../03-06-2026/subjective-tab/p6-section-templates/) — the scoped-template engine (`subj-15..18`); take the **form-state half** only (no server-apply).
- **This program's P3 deliverables reused:** [`p3-layout-engines/`](../p3-layout-engines/) — registry, custom-objective engine, `objective-default-layout.ts` (`normalizeSpecialty`).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-19. **Status:** ✅ `Complete` (2026-06-19) — Phase 4 of the Objective-tab program; exam-templates + specialty-packs slice (obj-16..19 shipped; cross-cutting acceptance gate green).
