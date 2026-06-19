# Cockpit-v3 Subjective tab — daily batches

> **Product plan:** [`plan-subjective-tab.md`](../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md)  
> All phases for this program live in this folder. Execute in order.

The Subjective tab today is two raw fields — a Chief-complaint `<input>` and an HOPI
`<textarea>`. This program turns it into **structured complaint cards** (OLDCARTS,
complaint-type aware) + **owned histories** (Family / Social / Past-surgical) + **linked**
patient-background sections (PMH / allergies / meds), all engineered so doctors *tap*
instead of *type*. `cc` / `hopi` become **derived** so the PDF / SMS / snapshot are untouched.

**Task prefix:** `subj` (stable across phases). **Numbering:** continuous — `subj-01..05`
(Phase 1), `subj-06..08` (Phase 2), `subj-09..10` (Phase 3), `subj-11..12` (Phase 4),
`subj-13..14` (Phase 5), `subj-15..18` (Phase 6), `subj-19..22` (Phase 7), `subj-23..27` (Phase 8),
`subj-28..31` (Phase 9).
Item IDs `ST.1..ST.10` in the product plan map 1:1 to `subj-01..10`; Phase 4 is a post-close
enhancement from doctor field-feedback (2026-06-04); Phase 6 generalises the Phase-2 subjective
preset into scoped per-subsection templates (2026-06-17); Phase 7 adds doctor-defined custom
subsections (own headings + one nested level), seeded from a per-doctor default (2026-06-17);
Phase 8 makes every top-level subjective section drag-reorderable, persisted as a per-doctor
default (2026-06-17); Phase 9 remembers each section's collapse/expand state as a per-doctor
default (2026-06-18).

| Phase | Folder | Status | Batch plan | Execution order |
|---|---|---|---|---|
| 1 — complaint cards | [`p1-complaint-cards/`](./p1-complaint-cards/) | ✅ Done (2026-06-03) | [`plan-p1-…`](./p1-complaint-cards/plan-p1-subjective-tab-complaint-cards-batch.md) | [`EXECUTION-ORDER-p1-…`](./p1-complaint-cards/Tasks/EXECUTION-ORDER-p1-subjective-tab-complaint-cards.md) |
| 2 — fast entry | [`p2-fast-entry/`](./p2-fast-entry/) | ✅ Done (2026-06-03) | [`plan-p2-…`](./p2-fast-entry/plan-p2-subjective-tab-fast-entry-batch.md) | [`EXECUTION-ORDER-p2-…`](./p2-fast-entry/Tasks/EXECUTION-ORDER-p2-subjective-tab-fast-entry.md) |
| 3 — polish | [`p3-polish/`](./p3-polish/) | ✅ Done (2026-06-03) — close-gate **PASSED** | [`plan-p3-…`](./p3-polish/plan-p3-subjective-tab-polish-batch.md) | [`EXECUTION-ORDER-p3-…`](./p3-polish/Tasks/EXECUTION-ORDER-p3-subjective-tab-polish.md) |
| 4 — rapid capture + nesting | [`p4-rapid-capture/`](./p4-rapid-capture/) | ⏳ Planned (subj-11..12) | [`plan-p4-…`](./p4-rapid-capture/plan-p4-subjective-tab-rapid-capture-batch.md) | [`EXECUTION-ORDER-p4-…`](./p4-rapid-capture/Tasks/EXECUTION-ORDER-p4-subjective-tab-rapid-capture.md) |
| 5 — free-text parsing | [`p5-freetext-parsing/`](./p5-freetext-parsing/) | ⏳ Planned (subj-13..14) | — | — |
| 6 — section templates | [`p6-section-templates/`](./p6-section-templates/) | ⏳ Planned (subj-15..18) | [`plan-p6-…`](./p6-section-templates/plan-p6-subjective-section-templates-batch.md) | [`EXECUTION-ORDER-p6-…`](./p6-section-templates/Tasks/EXECUTION-ORDER-p6-subjective-section-templates.md) |
| 7 — custom subsections | [`p7-custom-subsections/`](./p7-custom-subsections/) | ⏳ Planned (subj-19..22) | [`plan-p7-…`](./p7-custom-subsections/plan-p7-subjective-custom-subsections-batch.md) | [`EXECUTION-ORDER-p7-…`](./p7-custom-subsections/Tasks/EXECUTION-ORDER-p7-subjective-custom-subsections.md) |
| 8 — section reorder | [`p8-section-reorder/`](./p8-section-reorder/) | ⏳ Planned (subj-23..27) | [`plan-p8-…`](./p8-section-reorder/plan-p8-subjective-section-reorder-batch.md) | [`EXECUTION-ORDER-p8-…`](./p8-section-reorder/Tasks/EXECUTION-ORDER-p8-subjective-section-reorder.md) |
| 9 — collapse persistence | [`p9-collapse-persistence/`](./p9-collapse-persistence/) | ⏳ Planned (subj-28..31) | [`plan-p9-…`](./p9-collapse-persistence/plan-p9-subjective-collapse-persistence-batch.md) | [`EXECUTION-ORDER-p9-…`](./p9-collapse-persistence/Tasks/EXECUTION-ORDER-p9-subjective-collapse-persistence.md) |

> **Program v1 complete (2026-06-03).** All 10 tasks (`subj-01..10`) done; the whole-program close-gate (`subj-10`) PASSED — `cc`/`hopi` derive byte-identically and the PDF/SMS/snapshot are unchanged. Two pre-existing failures outside this surface (cockpit-v3 p6 layouts; `@react-pdf/renderer` jest-ESM infra) were verified pre-existing and routed, not gate-blocking.
>
> **Phase 4 added (2026-06-04, planned).** A post-close enhancement from doctor field-feedback: a **rapid-capture bar** (type → Enter → collapsed card → repeat; details via click-to-expand) and **one level of nested associated complaints** (a chief complaint owning associated complaint cards, chips + nested cards coexisting via a promote path). Additive — subj-11 is a pure interaction rewire; subj-12 extends the `complaints` JSONB shape with **no migration**. Note: subj-12 deliberately extends the `hopi` derivation (indented associated sub-lines), so the close-gate fixtures update with it; `cc` stays unchanged.
>
> **Phase 7 added (2026-06-17, planned).** Doctor-defined **custom subsections**: a custom heading + free-text body, with **one level** of sub-subsections, stored as a new `custom_subsections` JSONB array on `prescriptions` (derived TEXT mirror for the PDF), **seeded on each new visit** from a per-doctor default held in `doctor_settings` (seed-on-empty, never clobber), and rendered into the patient-facing PDF/SMS/snapshot. Strictly additive — `cc`/`hopi` derive byte-unchanged (subj-22 close-gate). Depth hard-capped at 2 in UI + Zod.
>
> **Phase 8 added (2026-06-17, planned).** **Doctor-reorderable subjective sections**: every top-level section block (chief complaints, patient background, allergies, family/social history, past-surgical fallback, free-text notes, custom subsections) becomes drag-reorderable via a left-edge grip + keyboard, driven by an ordered **section registry**, with the arrangement persisted as a per-doctor default in `doctor_settings.subjective_section_order` and reconciled with the live registry on each load (never hide a new section). **UI-only** — patient-facing PDF/SMS/snapshot section order and `cc`/`hopi` derivation are byte-unchanged (subj-27 close-gate). Reuses the Phase-7 grip + `complaint-drag` drop-intent primitives.
>
> **Phase 9 added (2026-06-18, planned).** **Remembered section collapse/expand state**: a doctor's open/closed choice for each top-level Subjective section persists as a per-doctor map `doctor_settings.subjective_section_collapsed` (`{ sectionId: isOpen }`), resolved over the existing per-section defaults on every mount (absent key ⇒ current default, including content-aware ones) and debounce-autosaved — so toggling the tab or reopening a patient restores the doctor's layout instead of snapping back to the hardcoded `defaultOpen`s. Stores **only explicit overrides** (delta from default); **static section ids only** (custom blocks excluded — their UUIDs re-mint per visit). **UI-only** — collapse never reaches `buildRxPayload`, so PDF/SMS/snapshot + `cc`/`hopi` are byte-unchanged (subj-31). Reuses the controlled `CollapsibleContainer` + the Phase-8 layout-autosave pattern.

**Decision lock:** the product plan's `ST-D1..ST-D7` carry forward across all phases.
Especially binding: **ST-D1** (complaints = JSONB array, mirror the medicines pattern),
**ST-D2** (`cc`/`hopi` derived — zero downstream change), **ST-D3** (own FH/SH/PSH, link
PMH/allergy/meds), **ST-D5** (every owned field gets the full fast-entry stack).

**Deferred (not scheduled):** Specialty-based subjective section catalog + presets — [`../../../capture/features/subjective-tab/`](../../../capture/features/subjective-tab/) (`backlog.md` · `section-catalog.md`).

**Predecessor:** Cockpit-v3 program — [`../../../May 2026/30-05-2026/cockpit-v3/`](../../../May%202026/30-05-2026/cockpit-v3/) (the shell this tab lives in).
