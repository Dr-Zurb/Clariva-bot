# Objective tab — Phase 3: layout engines + modality/specialty defaults — execution order

> Sibling of [`plan-p3-objective-tab-layout-engines-batch.md`](../plan-p3-objective-tab-layout-engines-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** `obj-09` is the keystone — the parity-preserving refactor of `ObjectiveSection` into an ordered **objective section registry** (`ObjectiveSectionId` + ordered renderer). It must land first and prove byte-identical default layout; every engine downstream renders through it. `obj-10` (the `doctor_settings` config columns + API) is the transport layer and can start once the registry's id set is frozen. `obj-11` (reorder + collapse) and `obj-12` (visibility + "Manage sections" menu) are disjoint engine lanes that overlap after 09 + 10. `obj-13` (custom sections) and `obj-14` (modality/specialty seed) build on the resolver. `obj-15` proves output byte-parity across all layout permutations, runs the a11y sweep, and closes the verification gate.

---

## Wave plan (5 waves)

```
Wave 1 (keystone — ~3–4h):
  obj-09 (ObjectiveSectionId + objective section registry + ordered renderer;
          parity refactor of ObjectiveSection — default layout byte-identical)
          [Auto — parity-preserving refactor under a test]
        │
        ▼
Wave 2 (transport — ~2–3h):
  obj-10 (migration 152: objective_section_order / _collapsed / _hidden /
          objective_custom_sections on doctor_settings + BE type/Zod/service/API + FE client)
          [Opus — new migration]
        │
        ▼
Wave 3 (engines — ~5–7h):
  obj-11 (reorder grips + keyboard + collapse-memory over the registry;
          one-shot hydration + debounced delta autosave; persist/seed)   [Lane α]
  obj-12 (hidden delta resolver + "Manage sections" menu;
          always-reachable trigger + all-hidden empty-state)             [Lane β]
        │
        ▼
Wave 4 (content + defaults — ~4–6h):
  obj-13 (custom objective sections; reuse subjective engine; derive text OBJ-D2)  [Lane α]
  obj-14 (modality + specialty default-visibility seed; override-wins)             [Lane β]
        │
        ▼
Wave 5 (prove + gate — ~2–4h):
  obj-15 (output byte-parity across layout permutations, engine round-trips,
          a11y sweep, verification gate)
          [Opus — parity fixtures]
```

**Total wall-clock:** ~16–24h agent-time (Wave 3 + Wave 4 lanes overlap).

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **obj-09** | M | Auto | `ObjectiveSection.tsx` (current hardcoded order); subjective `subjective-section-order.ts` (`SubjectiveSectionId` + ordered-renderer precedent); `SortableSectionShell` / `section-reorder-context.tsx` | New `objective-section-order.ts`: `ObjectiveSectionId` (`vitals`/`exam`/`test_results`/`legacy_exam`/`legacy_vitals` + `custom_block:<uuid>`), registry (id → node), default order, mountable-id resolver. Refactor `ObjectiveSection` to render through it. **Default layout byte-identical** (parity test). No persistence/DnD yet. |
| W2.0 | **obj-10** | M | **Opus** | `148_doctor_settings_subjective_section_hidden.sql` (latest doctor_settings layout migration; next free = 152); `doctor-settings-service.ts`, `types/doctor-settings.ts`, `utils/validation.ts` (subjective config Zod precedent); FE `doctor-settings` client | Migration `152_doctor_settings_objective_layout.sql` (additive `objective_section_order` array, `objective_section_collapsed` map, `objective_section_hidden` array, `objective_custom_sections` array; `jsonb_typeof` CHECKs; config-not-PHI comments). BE type + Zod (id-tolerant) + service GET/PATCH + route. FE settings client + cockpit hydration point. |
| W3.α | obj-11 | M | Auto | obj-09 registry; obj-10 API; subjective `section-reorder-context.tsx` + `subjective-section-collapse.ts` (grip/keyboard + one-shot hydration + delta autosave) | Wire DnD grips + keyboard reorder + remembered collapse over the objective registry; load per-doctor default, merge with live registry, debounce-autosave order + collapse deltas; "save current order as default". |
| W3.β | obj-12 | M | Auto | obj-09 registry; obj-10 API; subjective P10 hidden-delta resolver + "Manage sections" menu | Hidden delta set (static ids only; absent ⇒ visible) filtered from the render plan; "Manage sections" popover (hide/unhide + add-custom + reorder) top-right; trigger always reachable; hidden-count; all-hidden empty-state. |
| W4.α | obj-13 | M | Auto | obj-09 registry; obj-10 `objective_custom_sections`; subjective `custom-subsections.ts` + `CustomSubsectionsField.tsx`; `buildRxPayload` exam/test derivation | Custom objective free-text sections (per-doctor default + per-visit); reuse the subjective engine; derive into `examination_findings`/`test_results` text on save (OBJ-D2); registry slot `custom_block:<uuid>`. |
| W4.β | obj-14 | S–M | Auto | obj-09 default order + obj-12 hidden resolver; consult modality source (appointment type) + doctor specialty (profile); `exam-catalog.md` §E2/§G | Compute the default order + hidden seed from modality (in-person/video/voice) + specialty; feed the resolver as the **default** only; an explicit stored override always wins; seed never reaches output. |
| W5.0 | **obj-15** | S–M | **Opus** | obj-09..14; P1 `examDerivationParity.test.tsx` (close-gate fixture pattern); subjective P8/P10 output-parity tests | Fixtures: `examination_findings`/`test_results`/`vitals_*` byte-parity across every layout/visibility/custom/seed permutation; layout state never reaches `buildRxPayload`; hidden section with data still prints; order/collapse/hidden/custom survive remount; a11y sweep (grip keyboard, menu focus/roles, custom-section labels); run verification gate. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| obj-09 | M | Auto | Parity-preserving refactor cloning the proven subjective registry/ordered-renderer; no schema, no output write. Bounded to `ObjectiveSection` + one new lib. |
| obj-10 | M | **Opus** | New migration file (hard rule) on `doctor_settings`; four config columns + Zod + service + API. Highest-risk slice — Opus. |
| obj-11 | M | Auto | Reorder + collapse cloned from shipped subjective engines over obj-09's registry; config-only persistence. |
| obj-12 | M | Auto | Hidden delta + menu cloned from subjective P10; net-new UI surface, no output-parity risk. |
| obj-13 | M | Auto | Custom sections reuse the subjective custom-subsection engine; derived-text path mirrors P1. |
| obj-14 | S–M | Auto | Bounded pure seed logic (modality/specialty → default order/hidden); override-wins; unit-tested. |
| obj-15 | S–M | **Opus** | Output byte-parity + engine round-trip fixtures — same parity-risk profile that made P1's close-gate Opus. |

**Caps check:** 2 Opus in Phase 3 (obj-10 migration; obj-15 parity gate); ≤1 Opus per wave. ✓

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p3-objective-tab-layout-engines-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p3-objective-tab-layout-engines-batch.md`](../plan-p3-objective-tab-layout-engines-batch.md).
- Product plan: [`Product plans/ehr/objective-tab/plan-objective-tab.md`](../../../../../../Product%20plans/ehr/objective-tab/plan-objective-tab.md) — P3, `OBJ-D2`/`OBJ-D6`.
- Catalog detail: [`capture/features/objective-tab/exam-catalog.md`](../../../../../../capture/features/objective-tab/exam-catalog.md) §D/§E2/§G.
- Tasks: [`obj-09`](./task-obj-09-objective-section-registry-and-renderer.md) · [`obj-10`](./task-obj-10-doctor-settings-objective-layout-columns.md) · [`obj-11`](./task-obj-11-reorder-and-collapse-engines.md) · [`obj-12`](./task-obj-12-visibility-and-manage-sections-menu.md) · [`obj-13`](./task-obj-13-custom-objective-sections.md) · [`obj-14`](./task-obj-14-modality-specialty-default-visibility.md) · [`obj-15`](./task-obj-15-layout-close-gate.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-18. **Status:** ⏳ `Drafted`.
