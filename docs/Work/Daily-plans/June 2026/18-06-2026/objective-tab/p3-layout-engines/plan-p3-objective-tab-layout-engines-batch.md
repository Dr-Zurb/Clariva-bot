# Objective tab — Phase 3: layout engines (reorder · collapse · visibility · custom objective sections) + modality/specialty default visibility — 18 Jun 2026 batch plan

> **Phase 3 of the Objective-tab program.** Phases 1–2 made the Objective tab *structured* — system-wise exam cards ([`examination_json`](../../../../../../../backend/migrations/150_prescriptions_examination_json.sql)) and Vitals 2.0 ([`151_prescriptions_vitals_2.sql`](../../../../../../../backend/migrations/151_prescriptions_vitals_2.sql)) — but the tab still renders its sections in a **hardcoded order** baked into [`ObjectiveSection.tsx`](../../../../../../../frontend/components/cockpit/rx/sections/ObjectiveSection.tsx) (Vitals → structured exam → Test results → legacy free-text exam → legacy vitals), with no reorder, no remembered collapse, no hide/unhide, no custom sections, and no consult-type/specialty awareness. Phase 3 **ports the subjective-tab layout engines** (shipped across subjective P8–P11) to Objective — driven by an **objective section registry** — and adds the objective-specific headline: **modality-aware + specialty default visibility** (OBJ-D6). The patient-facing PDF/SMS/snapshot and the derived `examination_findings`/`test_results`/`vitals_*` stay **byte-unchanged** — layout is a cockpit-only concern.
>
> **Source plan:** [`Product plans/ehr/objective-tab/plan-objective-tab.md`](../../../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md) — phase P3 (layout engines + OBJ-D6); inherits `OBJ-D1..OBJ-D7`.
>
> **Prefix note:** tasks are `obj-09..15` (program numbering continues from P2's `obj-05..08`).
>
> **Builds on:** the **Subjective-tab** layout engines (shipped) — the section-registry + ordered-render refactor ([`subjective-section-order.ts`](../../../../../../../frontend/lib/cockpit/subjective-section-order.ts), `SubjectiveSectionId`), the DnD grips + keyboard reorder ([`section-reorder-context.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/section-reorder-context.tsx)), the one-shot-hydration + debounced delta-autosave collapse pattern ([`subjective-section-collapse.ts`](../../../../../../../frontend/lib/cockpit/subjective-section-collapse.ts)), the hidden-delta + "Manage sections" menu, the custom-subsections engine ([`custom-subsections.ts`](../../../../../../../frontend/lib/cockpit/custom-subsections.ts)), and the per-doctor JSONB config precedents on `doctor_settings` (migrations 145–148). **Reuse, do not fork** ([`exam-catalog.md`](../../../../../../capture/features/objective-tab/exam-catalog.md) §D, §J.5).
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). obj-09 (registry + parity refactor) and obj-11..14 (engine wiring, menu, custom sections, modality/specialty defaults) are Auto/Sonnet (additive config cloning of shipped patterns over a parity-preserving refactor). obj-10 (the `doctor_settings` config columns) is **Opus** (hard rule: new migration). obj-15 (whole-phase output-parity close-gate + a11y) is **Opus** (parity-fixture risk).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p3-objective-tab-layout-engines.md`](./Tasks/EXECUTION-ORDER-p3-objective-tab-layout-engines.md).

---

## What Phase 3 does (one sentence)

> **Refactor `ObjectiveSection` to render from an ordered objective section registry, port the subjective reorder / collapse-memory / hide-unhide / custom-section engines (persisted as per-doctor `doctor_settings` config — `objective_section_order` / `objective_section_collapsed` / `objective_section_hidden` / `objective_custom_sections`), consolidate the controls into a "Manage sections" menu, and seed default visibility/order from the consult modality (in-person / video / voice) and the doctor's specialty — while the derived `examination_findings` / `test_results` / `vitals_*` and the PDF/SMS/snapshot stay byte-identical.**

---

## Scope (draft 2026-06-18 — confirm before promotion)

| Decision | Choice |
|---|---|
| What's controllable | **Each top-level Objective section block**: `vitals`, `exam` (structured system cards), `test_results`, `legacy_exam` (collapsed free-text), `legacy_vitals` (collapsed `vitalsText`), and doctor-defined `custom_block:<uuid>` objective sections. |
| Engines ported | **Reorder** (DnD grip + keyboard), **collapse memory**, **hide/unhide** (delta set + "Manage sections" menu), **custom sections** — all from the shipped subjective engines, reused over an objective registry. |
| Persistence | **Per-doctor default** in `doctor_settings` (clone of `subjective_section_*` + `subjective_custom_subsections`); applies to every visit; syncs across devices. **Not** per-prescription. |
| Modality/specialty defaults (OBJ-D6) | The **default** section order + hidden set is seeded by the consult **modality** (in-person → full exam; video → observed-on-video + home vitals; voice/async → patient-reported + uploads) and the doctor's **specialty** (emphasis per `exam-catalog.md` §E2). A doctor's explicit override always wins over the seed. |
| Output effect | **View-only (OBJ-D2).** No layout state ever reaches `buildRxPayload`; `examination_findings`/`test_results`/`vitals_*` derive byte-identically whether a section is reordered, collapsed, hidden, or custom. A hidden section with data still prints. |
| Custom objective sections | Doctor-defined free-text blocks (reuse the subjective custom-subsection engine), derived into `examination_findings` (or `test_results`) text on save per OBJ-D2; per-doctor default + per-visit instances. |
| Vitals / exam internals | **Unchanged** — `VitalsGrid` (P2) and `ExamSystemList` (P1) are untouched; P3 only governs how the section blocks are ordered/collapsed/hidden/seeded. |
| Patient-facing output | **Unchanged contract.** Cockpit layout is an editing concern; PDF/SMS/snapshot keep their canonical clinical order. |

---

## Decision lock (draft — freezes on promotion)

- **P3-D1 — registry-driven render order (clone P8-D1).** `ObjectiveSection` renders from an ordered list of canonical `ObjectiveSectionId`s resolved against an **objective section registry** (id → node). The default order reproduces today's hardcoded layout **byte-for-byte** when no doctor override + no modality/specialty seed applies (obj-09 parity refactor).
- **P3-D2 — per-doctor default config, not PHI (clone P8-D2/P10-D5).** Order/collapse/hidden/custom persist as JSONB on `doctor_settings` (doctor-scoped RLS, clones of the `subjective_section_*` columns). Config strings only (no patient data); never logged; validated against the known-id set (dedupe, drop unknown, cap size).
- **P3-D3 — view-only; output untouched (OBJ-D2).** No layout/visibility/custom state reaches `buildRxPayload`. `examination_findings`/`test_results`/`vitals_*` and the PDF/SMS/snapshot are byte-identical regardless of layout. The P1 derivation close-gate stays green by construction (re-proven in obj-15).
- **P3-D4 — delta sets + graceful merge (clone P8-D5/P10-D2).** Hidden = delta of hidden ids (absent ⇒ visible). Order merges with the live registry on load (unknown ids dropped, newly-available sections appended at their canonical slot, conditional sections filtered to mountable). No section is ever hidden by a stale stored value.
- **P3-D5 — modality + specialty seed the DEFAULT only (OBJ-D6).** Consult modality and doctor specialty compute a **default** order + hidden set when the doctor has no stored override for a section. An explicit doctor choice (stored order/hidden) **always wins**; the seed never overrides a deliberate setting and never reaches output.
- **P3-D6 — reuse the shipped engines + a11y primitives.** Grips, `leadingActions`, drop-intent helpers, keyboard reorder, the one-shot-hydration + debounced delta-autosave shape, the hidden-delta resolver, and the custom-section engine come from the shipped subjective code. No new DnD library, no second persistence mechanism.
- **P3-D7 — additive only; legacy escape hatches stay (OBJ-D7).** The legacy free-text exam + `vitalsText` blocks remain (as hideable sections). No removal of existing sections, columns, or helpers.

---

## What this phase does NOT do (deferred)

| Item | Why / lands |
|---|---|
| Per-visit / per-prescription layout | Out (P3-D2) — layout is doctor-level config. |
| Changing PDF/SMS/snapshot section order to match the cockpit | Out (P3-D3) — patient-facing order is canonical/clinical. |
| Exam templates + specialty *packs* (preselected exam content) | P4 — P3 seeds *visibility/order*, not template content (`doctor_rx_templates` scopes). |
| Point-of-care split + media sections (`point_of_care`, `media`) | P5 — those section ids append to the registry when P5 lands; P3 leaves their slots reserved. |
| Pediatric/vitals trends, sparklines | P6. |
| "Section excluded from output" (a layout state that *does* change the Rx) | Out (P3-D3) — a separate, riskier slice touching `buildRxPayload`. |
| Removing legacy `vitalsText` / free-text exam | OBJ-D7 — kept as hideable escape hatches; sunset is a separate decision. |

---

## Cross-cutting acceptance gate (whole phase)

Phase 3 is green only when **all** hold:

- [x] ✅ `ObjectiveSection` renders from an ordered registry; with no doctor override + no seed, the rendered order is **byte-identical** to today's hardcoded layout (parity test). _(obj-09)_
- [x] ✅ Migration `152_doctor_settings_objective_layout.sql` runs idempotently; the four `objective_*` config columns default to `'[]'`/`'{}'`; `jsonb_typeof` CHECKs; doctor-scoped RLS unchanged; config-not-PHI. _(obj-10)_
- [x] ✅ Zod validates each config shape (array of ids / collapse map / hidden delta / custom-section array); drops unknown ids, dedupes, caps size; GET/PATCH round-trip. _(obj-10)_
- [x] ✅ A doctor can reorder section blocks by grip + keyboard; collapse/expand is remembered; both persist as per-doctor defaults and re-apply next visit. _(obj-11)_
- [x] ✅ Hide/unhide works via the "Manage sections" menu (always reachable; hidden-count; all-hidden empty-state); the hidden set is a static-id delta. _(obj-12)_
- [x] ✅ Custom objective sections can be added/edited/removed, persist as a per-doctor default, and derive into `examination_findings`/`test_results` text on save (OBJ-D2). _(obj-13)_
- [x] ✅ Default order + hidden set seed correctly from consult modality + specialty; an explicit doctor override always wins; the seed never reaches output. _(obj-14)_
- [x] ✅ **Output parity:** `examination_findings`/`test_results`/`vitals_*` derive byte-identically and PDF/SMS/snapshot are unchanged across every layout/visibility/custom permutation — no layout state reaches `buildRxPayload`; a hidden section with data still prints. _(obj-15)_
- [x] ✅ a11y: reorder + menu + custom sections are keyboard + screen-reader operable; `disabled` mode is read-only with no autosave. _(obj-15)_
- [x] ✅ `npx tsc --noEmit` + eslint clean for the slice; targeted frontend suites (761) + backend SMS-summary contract (4) green (pre-existing unrelated subjective-WIP failures routed, not introduced). _(obj-15)_

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| P1 | Structured system-wise exam cards + derived-text contract (obj-01..04) | ✅ Complete |
| P2 | Vitals 2.0 (obj-05..08) | ✅ Complete |
| **P3** | **Layout engines (reorder · collapse · visibility · custom) + modality/specialty default visibility (obj-09..15)** | ✅ Complete (2026-06-19) |
| P4 | Exam templates + specialty packs (scoped `doctor_rx_templates`) | 🗒 Drafted |

---

## Tasks

| Task | Title | Size | Model |
|---|---|---|---|
| [`obj-09`](./Tasks/task-obj-09-objective-section-registry-and-renderer.md) | Objective section registry + ordered renderer (parity refactor) | M | Auto |
| [`obj-10`](./Tasks/task-obj-10-doctor-settings-objective-layout-columns.md) | `doctor_settings` objective layout config columns (migration 152) + API | M | **Opus** |
| [`obj-11`](./Tasks/task-obj-11-reorder-and-collapse-engines.md) | Reorder (DnD + keyboard) + collapse-memory engines wired + persist/seed | M | Auto |
| [`obj-12`](./Tasks/task-obj-12-visibility-and-manage-sections-menu.md) | Hide/unhide visibility delta + "Manage sections" menu | M | Auto |
| [`obj-13`](./Tasks/task-obj-13-custom-objective-sections.md) | Custom objective sections (per-doctor default + derived text) | M | Auto |
| [`obj-14`](./Tasks/task-obj-14-modality-specialty-default-visibility.md) | Modality-aware + specialty default visibility (OBJ-D6) | S–M | Auto |
| [`obj-15`](./Tasks/task-obj-15-layout-close-gate.md) | Output-parity + engine round-trip + a11y close-gate + verification | S–M | **Opus** |

---

## Cost estimate

| Wave | Tasks | Auto/Sonnet | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | obj-09 (registry + parity refactor) | 1 | 0 | ~3–4h |
| Wave 2 | obj-10 (settings columns + API) | 0 | 1 (migration) | ~2–3h |
| Wave 3 | obj-11 (reorder + collapse), obj-12 (visibility + menu) | 2 | 0 | ~5–7h |
| Wave 4 | obj-13 (custom sections), obj-14 (modality/specialty seed) | 2 | 0 | ~4–6h |
| Wave 5 | obj-15 (output-parity close-gate + a11y + verification) | 0 | 1 | ~2–4h |
| **Total** | **7** | **5** | **2** | **~16–24h agent-time** |

**Caps check:** 2 Opus in Phase 3 (obj-10 migration; obj-15 parity gate); ≤1 Opus per wave. ✓

---

## Sequencing notes

- **obj-09 first (substrate + parity).** The hardest correctness point: refactor the hardcoded `ObjectiveSection` JSX into a registry + ordered render path **without changing the default layout** (parity test). Everything downstream needs the `ObjectiveSectionId` scheme + ordered renderer. No persistence, no DnD yet.
- **obj-10 next (storage + transport).** Lands the four `objective_*` config columns on `doctor_settings` + types/Zod/service/API + FE client + cockpit hydration. Near-verbatim clone of the subjective `doctor-settings` paths. Opus because it adds a migration.
- **obj-11 + obj-12 (parallel after 09 + 10).** Disjoint surfaces: obj-11 wires reorder + collapse over the registry (grips/keyboard + one-shot hydration + delta autosave); obj-12 adds the hidden delta + "Manage sections" menu. Both depend only on the registry (09) and the settings API (10).
- **obj-13 + obj-14 (after 11 + 12).** obj-13 adds custom objective sections (reuse the subjective engine; derive text per OBJ-D2). obj-14 computes the modality/specialty default seed feeding the resolver (override-wins).
- **obj-15 last (prove + gate).** Output byte-parity across layout permutations, engine round-trips (order/collapse/hidden/custom survive remount), a11y sweep, verification gate.

---

## References

- **Source:** [`Product plans/ehr/objective-tab/plan-objective-tab.md`](../../../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md) — P3, `OBJ-D2`/`OBJ-D6`.
- **Catalog detail:** [`capture/features/objective-tab/exam-catalog.md`](../../../../../../capture/features/objective-tab/exam-catalog.md) §D (layout-engine port) + §E2/§G (specialty/modality emphasis).
- **Subjective precedents (ported, not forked):** [`../../03-06-2026/subjective-tab/p8-section-reorder/`](../../../03-06-2026/subjective-tab/p8-section-reorder/) · [`p9-collapse-persistence/`](../../../03-06-2026/subjective-tab/p9-collapse-persistence/) · [`p10-section-visibility/`](../../../03-06-2026/subjective-tab/p10-section-visibility/) · [`p11-custom-section-visibility/`](../../../03-06-2026/subjective-tab/p11-custom-section-visibility/).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-18. **Status:** ✅ `Complete` (2026-06-19) — Phase 3 of the Objective-tab program (obj-09..15) shipped; cross-cutting gate green, output byte-parity proven, no source fixes needed.
