# Subjective tab — Phase 8: doctor-reorderable subjective sections (drag-and-drop, per-doctor default) — 17 Jun 2026 batch plan

> **Phase 8 of the Subjective-tab program.** The Subjective tab renders its sections in a **hardcoded order** baked into [`SubjectiveSection.tsx`](../../../../../../../frontend/components/cockpit/rx/sections/SubjectiveSection.tsx) (Chief complaints → Patient background/PMH → Allergies → histories → free-text notes → custom subsections). Doctors want to **arrange these sections themselves** — drag a section by a left-edge grip to reorder, like the custom subsections already do (Phase 7) — and have that arrangement **stick across visits**. Phase 8 makes every top-level subjective section a draggable unit, persists the order as a per-doctor default in `doctor_settings`, and keeps the patient-facing PDF/SMS/snapshot output **byte-unchanged** (cockpit ordering is a UI concern only).
>
> **Source plan:** [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md) — new program item (section reorder); inherits **ST-D1..ST-D7** + the Phase-1/2 decision lock (structured JSONB, derived `cc`/`hopi`, per-doctor config).
>
> **Prefix note:** tasks are `subj-23..27`, continuing the program numbering.
>
> **Builds on:** Phase 7's drag affordance — the `GripVertical` handle + keyboard reorder + `CollapsibleContainer.leadingActions` slot already shipped in [`CustomSubsectionsField.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/CustomSubsectionsField.tsx) and [`CollapsibleContainer.tsx`](../../../../../../../frontend/components/ui/CollapsibleContainer.tsx); the native HTML5 DnD pattern (drop-intent + indicator line) in [`ComplaintList.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/ComplaintList.tsx) + [`complaint-drag.ts`](../../../../../../../frontend/lib/cockpit/complaint-drag.ts); and the per-doctor JSONB config precedent `doctor_settings.subjective_custom_subsections` (Phase 7, migration 145) + `cockpit_layout_presets`.
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). subj-23 (registry + parity refactor), subj-24 (settings column), subj-25 (DnD chrome), subj-26 (persist + seed) are Auto/Sonnet (additive config cloning shipped patterns + a parity-preserving refactor); subj-27 (whole-phase close-gate: `cc`/`hopi` + PDF/SMS byte-parity, a11y sweep) is the Opus-grade slice.
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p8-subjective-section-reorder.md`](./Tasks/EXECUTION-ORDER-p8-subjective-section-reorder.md).

---

## What Phase 8 does (one sentence)

> **Make every top-level Subjective-tab section a drag-reorderable unit (left-edge grip + keyboard), driven by an ordered section registry, with the arrangement persisted as a per-doctor default in `doctor_settings.subjective_section_order` and seeded on each visit — while the patient-facing PDF/SMS/snapshot and `cc`/`hopi` derivation stay byte-identical.**

---

## Scope (confirmed with doctor, 2026-06-17)

| Decision | Choice |
|---|---|
| What's reorderable | **Each top-level section block** in the Subjective tab (Chief complaints, Patient background/PMH, Allergies, Family history, Social/personal history, Past-surgical fallback, Free-text notes, Custom subsections-as-a-group). |
| Drag affordance | **Six-dot grip on the left edge** of each section header (reuse Phase-7 grip + `leadingActions`), plus keyboard ArrowUp/ArrowDown on the focused grip. |
| Persistence | **Per-doctor default** order in `doctor_settings` (like `cockpit_layout_presets` / `subjective_custom_subsections`); applies to every visit. **Not** per-prescription. |
| Patient-facing output | **Unchanged.** Cockpit section order is a UI/editing concern; the PDF/SMS/snapshot keep their canonical clinical order. |
| New section types | Order list **merges** gracefully — unknown stored ids are dropped, newly-added section types append at their canonical position so a future section is never hidden. |

---

## Decision lock (frozen for this phase)

- **P8-D1 — registry-driven render order.** `SubjectiveSection` renders from an ordered list of canonical section ids resolved against a **section registry** (id → node). The default order reproduces today's hardcoded layout **byte-for-byte** when no doctor override exists.
- **P8-D2 — per-doctor default only (T2-D2).** Order persists as one JSONB array of section ids on `doctor_settings` (doctor-scoped RLS, clone of `subjective_custom_subsections`). No per-visit / per-prescription order, no clinic sharing.
- **P8-D3 — UI-only; output untouched (ST-D2).** Reordering changes only the cockpit render order. `cc`/`hopi` derivation and the PDF/SMS/snapshot section order are **unchanged**; the Phase-3 byte-parity close-gate must still pass.
- **P8-D4 — order is config, not PHI.** `subjective_section_order` is a list of stable section-id strings (no patient data). Doctor-scoped, never logged; validated against the known-id enum (dedupe, drop unknown).
- **P8-D5 — graceful merge, never hide.** Stored order is reconciled with the live registry on load: unknown ids dropped; missing-but-available sections appended at their canonical slot. Conditional sections (linked PMH/allergies vs past-surgical fallback) are filtered to what's mountable for the current context.
- **P8-D6 — reuse Phase-7 drag + a11y primitives.** Grip, `leadingActions`, drop-intent helpers, and keyboard reorder come from the shipped Phase-7 / ComplaintList code; no new DnD library.

---

## What this phase does NOT do (deferred)

| Item | Why / lands |
|---|---|
| Per-visit / per-prescription section order | Out (P8-D2) — order is doctor-level config; per-visit ordering is unmotivated and would touch prescription storage + output parity. |
| Reordering sections **inside** a block (e.g. within Patient background) | Out — only top-level section blocks reorder. Custom-subsection internal order remains Phase-7's concern. |
| Changing PDF/SMS/snapshot section order to match the cockpit | Out (P8-D3) — patient-facing order is canonical/clinical; revisit only if doctors ask. |
| Hiding / showing sections (visibility toggles) | Out — reorder only. A per-section visibility flag is a clean follow-up. |
| Sharing a section order across doctors / clinic | Deferred (T2-D2). |

---

## Cross-cutting acceptance gate (whole phase)

- [x] ✅ `SubjectiveSection` renders from an ordered registry; with no doctor override the rendered order is **byte-identical** to today's hardcoded layout (parity test). _(subj-23)_
- [x] ✅ Migration `146_doctor_settings_subjective_section_order.sql` runs idempotently; `subjective_section_order` defaults to `'[]'::jsonb`; `jsonb_typeof='array'` CHECK; doctor-scoped RLS unchanged. _(subj-24)_
- [x] ✅ A doctor can drag any top-level section by its **left-edge grip** to reorder, and reorder via keyboard (ArrowUp/ArrowDown on the focused grip); the drop indicator mirrors the Phase-7/ComplaintList affordance. _(subj-25)_
- [x] ✅ The chosen order **persists** as the per-doctor default and re-applies on the next visit; "Save current section order as my default" works. _(subj-26)_
- [x] ✅ Order load **merges** with the live registry: unknown ids dropped, newly-available sections appended at their canonical slot, conditional sections filtered to what's mountable — no section is ever hidden by a stale stored order. _(subj-26)_
- [x] ✅ `cc`/`hopi` derive byte-identically (close-gate) and the PDF/SMS/snapshot output is **unchanged** — reorder is UI-only. _(subj-27)_
- [x] ✅ Integration + a11y sweep of the Subjective tab (keyboard reorder, focus, aria) passes. _(subj-27)_
- [x] ✅ `cd frontend; npx tsc --noEmit` + `npm run lint` clean for the slice; backend + frontend suites green (pre-existing unrelated failures routed — see subj-27 §3.2). _(subj-27)_

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| Phase 7 | Doctor-defined custom subsections + per-doctor default + PDF output | ✅ Done (subj-19..22) |
| **Phase 8** | **Doctor-reorderable subjective sections (drag-and-drop, per-doctor default)** | ⏳ Planned (subj-23..27) |

---

## Cost estimate

| Wave | Tasks | Sonnet / Auto | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | subj-23 (section registry + ordered renderer, parity refactor) | 1 (Sonnet) | 0 | ~3–4h |
| Wave 2 | subj-24 (doctor_settings order column + API) | 1 (Auto/Sonnet) | 0 | ~2–3h |
| Wave 2 | subj-25 (DnD reorder chrome + UI state) | 1 (Sonnet) | 0 | ~3–4h |
| Wave 3 | subj-26 (persist + seed: load default, merge, save-as-default) | 1 (Sonnet) | 0 | ~2–3h |
| Wave 4 | subj-27 (output parity + whole-phase close-gate) | 0 | 1 (Opus) | ~2–4h |
| **Total** | **5** | **4** | **1** | **~12–18h agent-time** |

---

## Sequencing notes

- **subj-23 first (substrate + parity).** The hardest correctness point: refactor the hardcoded JSX into a registry + ordered render **without changing the default layout**. Everything downstream needs the registry and the ordered-list render path. No DnD, no persistence yet — pure refactor under a parity test.
- **subj-24 + subj-25 next (parallel lanes after 23).** subj-24 adds the `doctor_settings` column + API (clones subj-21's `subjective_custom_subsections` path); subj-25 adds the drag chrome + local order state over the registry. Disjoint surfaces (settings/persistence vs UI/interaction); both depend only on subj-23's registry shape.
- **subj-26 after 24 + 25 (join).** Wires persistence to the UI: load the doctor default, merge with the live registry, and add "save current order as default". Needs both the settings API (24) and the reorder state (25).
- **subj-27 last (gate).** Whole-phase close-gate: assert `cc`/`hopi` byte-parity, PDF/SMS/snapshot unchanged (output is UI-independent by design), and run the integration + a11y sweep.

---

## References

- **Source:** [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md).
- **Patterns extended:** [`SubjectiveSection.tsx`](../../../../../../../frontend/components/cockpit/rx/sections/SubjectiveSection.tsx) (render order) · [`CustomSubsectionsField.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/CustomSubsectionsField.tsx) (grip + keyboard reorder, Phase 7) · [`CollapsibleContainer.tsx`](../../../../../../../frontend/components/ui/CollapsibleContainer.tsx) (`leadingActions`) · [`ComplaintList.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/ComplaintList.tsx) + [`complaint-drag.ts`](../../../../../../../frontend/lib/cockpit/complaint-drag.ts) (native DnD drop-intent) · [`doctor-settings-service.ts`](../../../../../../../backend/src/services/doctor-settings-service.ts) + migration `145` (`subjective_custom_subsections` precedent).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`TASK_MANAGEMENT_GUIDE.md`](../../../../../process/TASK_MANAGEMENT_GUIDE.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).
- Sibling: [`Tasks/EXECUTION-ORDER-p8-subjective-section-reorder.md`](./Tasks/EXECUTION-ORDER-p8-subjective-section-reorder.md).

---

**Created:** 2026-06-17.  
**Status:** ⏳ `Planned` (2026-06-17) — Phase 8 of the Subjective-tab program; section-reorder slice.  
**Next phase:** none planned.
