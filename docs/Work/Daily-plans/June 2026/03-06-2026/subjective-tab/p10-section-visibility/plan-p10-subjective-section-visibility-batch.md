# Subjective tab — Phase 10: hide/unhide sections + "Manage sections" menu (per-doctor default) — 18 Jun 2026 batch plan

> **Phase 10 of the Subjective-tab program.** Phases 8–9 let a doctor **reorder** the top-level Subjective sections ([`subjective_section_order`](../../../../../../../backend/migrations/146_doctor_settings_subjective_section_order.sql)) and **remember collapse/expand** state ([`subjective_section_collapsed`](../../../../../../../backend/migrations/147_doctor_settings_subjective_section_collapsed.sql)). Both are visible-but-toggled states. Phase 10 adds the missing third axis — **visibility**: letting a doctor *hide* sections they never use so they stop rendering entirely, and surfacing all three controls (hide/unhide, add custom, reorder) in one **"Manage sections" menu** anchored top-right of the Subjective section. Hidden is a pure view preference: a hidden section's data still flows to the Rx/PDF untouched.
>
> **Source plan:** [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md) — new program item (section visibility); inherits **ST-D1..ST-D7** + the Phase-1/2 decision lock (structured JSONB, derived `cc`/`hopi`, per-doctor config).
>
> **Prefix note:** tasks are `subj-32..35`, continuing the program numbering.
>
> **Builds on:** Phase 8's per-doctor `doctor_settings.subjective_section_order` + the [`SubjectiveSectionId`](../../../../../../../frontend/lib/cockpit/subjective-section-order.ts) identity scheme (static ids + `custom_block:<uuid>`); Phase 9's per-doctor `subjective_section_collapsed` map + the **one-shot hydration + debounced delta-autosave** pattern now stable in [`SubjectiveSection`](../../../../../../../frontend/components/cockpit/rx/sections/SubjectiveSection.tsx) ([`subjective-section-collapse.ts`](../../../../../../../frontend/lib/cockpit/subjective-section-collapse.ts)); the per-doctor JSONB config precedents (`subjective_custom_subsections`, `cockpit_layout_presets`); the existing in-page reorder grips ([`SortableSectionShell`](../../../../../../../frontend/components/cockpit/rx/subjective/section-reorder-context.tsx)) and add-custom footer ([`CustomSubsectionsChrome`](../../../../../../../frontend/components/cockpit/rx/subjective/CustomSubsectionsField.tsx)).
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). subj-32 (new `doctor_settings` column + API) is **Opus** (hard rule: new migration). subj-33 (visibility resolver + autosave lib) is Auto. subj-34 (the "Manage sections" menu component + wiring) is Auto/Sonnet (net-new UI surface, no output-parity risk). subj-35 (integration + a11y + verification) is Auto/Sonnet.
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p10-subjective-section-visibility.md`](./Tasks/EXECUTION-ORDER-p10-subjective-section-visibility.md).

---

## What Phase 10 does (one sentence)

> **Let each doctor hide/unhide top-level Subjective sections — persisted as a per-doctor `doctor_settings.subjective_section_hidden` delta set (only hidden ids stored; absent ⇒ visible), filtered out of the render plan on every mount — and consolidate hide/unhide + add-custom + reorder into one "Manage sections" menu top-right of the Subjective section; hidden is view-only, so a hidden section's data still flows byte-identically to the Rx/PDF.**

---

## Scope (confirmed with doctor, 2026-06-18)

| Decision | Choice |
|---|---|
| What's controllable | **Visibility (rendered / not rendered) of each top-level Subjective section** — distinct from collapse (rendered, body closed). |
| Persistence | **Per-doctor default** in `doctor_settings` (like `subjective_section_order` / `subjective_section_collapsed`); applies to every visit; syncs across devices. **Not** per-prescription. |
| Output effect | **View-only.** Hiding a section never removes its data from the Rx/PDF/SMS/snapshot or from `cc`/`hopi`. A hidden section with content still prints. |
| Storage shape | A JSONB **array** of hidden static section ids (delta — only what's hidden). Absence of an id = visible. |
| Lockable sections | **None.** Any top-level section is hideable, **including Chief complaints** — so the menu trigger must stay reachable and an all-hidden empty-state must exist. |
| Custom blocks | **Out of scope for the hidden set** — `custom_block:<uuid>` ids re-mint per visit; custom blocks are removed by **deletion**, not by a hidden flag. |
| Menu consolidation | **Add** the "Manage sections" menu (hide/unhide + add custom + reorder), but **keep** the existing in-page drag grips + add-custom footer for now (both write the same `subjective_section_order`). |
| Depth | **Top-level sections only.** Nested cluster collapsibles are unaffected. |

---

## Decision lock (frozen for this phase)

- **P10-D1 — per-doctor default only (T2-D2).** Visibility persists as one JSONB array on `doctor_settings` (doctor-scoped RLS, clone of `subjective_section_order`). No per-visit / per-prescription state, no clinic sharing.
- **P10-D2 — delta set of hidden ids, not a full snapshot.** Store only the ids the doctor has hidden. **Absence of an id ⇒ visible.** This keeps the set minimal and lets newly-added sections default to visible without back-filling existing doctors.
- **P10-D3 — top-level sections only.** Only the top-level section blocks can be hidden. Nested cluster collapsibles are untouched.
- **P10-D4 — static section ids only; custom blocks excluded.** The hidden set holds **static** `SubjectiveSectionId`s. `custom_block:<uuid>` ids are never written (they re-mint per visit and are removed via deletion).
- **P10-D5 — visibility is config, not PHI.** `subjective_section_hidden` is an array of stable section-id strings (no patient data). Doctor-scoped, never logged; validated against the known-id set (drop unknown ids, dedupe, cap size).
- **P10-D6 — view-only; output untouched (ST-D2).** Hiding changes only the cockpit render. `cc`/`hopi` derivation and the PDF/SMS/snapshot are byte-identical whether a section is hidden or shown — `buildRxPayload` never reads the hidden set. The Phase-3 byte-parity close-gate stays green by construction.
- **P10-D7 — no locks; menu must stay reachable.** Any top-level section (incl. `chief_complaints`) is hideable. Therefore: (a) the "Manage sections" trigger is **always** rendered (even in preview/`disabled`, read-only), (b) it shows a **hidden-count** affordance, and (c) when *all* sections are hidden the body shows an **empty-state** pointing back at the menu — never a blank tab.
- **P10-D8 — reuse the Phase-9 hydration/autosave shape + existing primitives.** Visibility hydrates one-shot from the stored set (the `hasHydratedRef` guard added in the Phase-9 bugfix) and debounce-autosaves the delta exactly like `saveSubjectiveSectionCollapsed`. The menu reuses the existing reorder + add-custom machinery; no new persistence mechanism, no second debounce pattern.

---

## What this phase does NOT do (deferred)

| Item | Why / lands |
|---|---|
| Per-visit / per-prescription visibility | Out (P10-D1) — visibility is doctor-level config. |
| Hiding **nested** cluster collapsibles | Out (P10-D3) — top-level only. |
| Cross-visit hidden memory for **custom blocks** | Out (P10-D4) — block UUIDs re-mint per visit; custom blocks are removed by deletion. |
| Hiding **removing data from the Rx/PDF** | Out (P10-D6) — explicitly view-only; output parity preserved. A "section excluded from output" feature would be a separate, riskier slice touching `buildRxPayload`. |
| Retiring the in-page drag grips / add-custom footer | Out (menu_consolidation = add+keep) — the menu is additive for now; consolidating to a single source is a clean follow-up. |
| "Reset to default layout" that clears order + hidden + collapse together | **Optional in subj-34**; flagged as the one cross-field write. If it lands, it ships with a test; otherwise it's a fast-follow. |

---

## Cross-cutting acceptance gate (whole phase)

- [x] Migration `148_doctor_settings_subjective_section_hidden.sql` runs idempotently; `subjective_section_hidden` defaults to `'[]'::jsonb`; `jsonb_typeof = 'array'` CHECK; doctor-scoped RLS unchanged. _(subj-32)_
- [x] Zod validates an array of `sectionId` strings; drops unknown ids, dedupes, caps size; GET/PATCH round-trip. _(subj-32)_
- [x] Resolver filters hidden ids out of the render plan for **currently-mountable** sections only (mode-aware); absent id ⇒ visible. _(subj-33)_
- [x] Autosave persists **only** the hidden delta (never visible ids) and excludes `custom_block:*` ids; debounced; one PATCH per settle; one-shot hydration (no stale-echo clobber). _(subj-33 / subj-34)_
- [x] "Manage sections" menu (top-right) lists mountable sections with hide/unhide toggles, an add-custom action, and reorder; trigger always reachable; hidden-count shown; all-hidden empty-state renders. _(subj-34)_
- [x] Hiding/unhiding survives a Subjective tab toggle and a patient reopen (per-doctor default re-applies). _(subj-35)_
- [x] `cc`/`hopi` derive byte-identically and PDF/SMS/snapshot are unchanged — the hidden set never reaches `buildRxPayload`; a hidden section **with data still prints**. _(subj-35)_
- [x] Menu is keyboard + screen-reader accessible (focus trap/return, `aria-expanded`/`role`); preview/`disabled` mode shows visibility read-only without autosave. _(subj-35)_
- [x] Frontend slice lint + targeted test suites green; pre-existing repo-wide frontend `tsc` baseline (social-history WIP) not gate-blocking. _(subj-35)_

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| Phase 7 | Doctor-defined custom subsections + per-doctor default + PDF output | ✅ Done (subj-19..22) |
| Phase 8 | Doctor-reorderable subjective sections (drag-and-drop, per-doctor default) | ✅ Done (subj-23..27) |
| Phase 9 | Remembered section collapse/expand state (per-doctor default) | ✅ Done (subj-28..31) |
| **Phase 10** | **Hide/unhide sections + "Manage sections" menu (per-doctor default)** | ✅ Done (subj-32..35) |

---

## Cost estimate

| Wave | Tasks | Sonnet / Auto | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | subj-32 (doctor_settings hidden set column + API) | 0 | 1 (Opus — migration) | ~2–3h |
| Wave 2 | subj-33 (visibility resolver + debounced autosave lib) | 1 (Auto) | 0 | ~2–3h |
| Wave 3 | subj-34 ("Manage sections" menu + wiring) | 1 (Auto/Sonnet) | 0 | ~3–4h |
| Wave 4 | subj-35 (integration + a11y + output-parity + verification gate) | 1 (Auto/Sonnet) | 0 | ~1–2h |
| **Total** | **4** | **3** | **1** | **~8–12h agent-time** |

---

## Sequencing notes

- **subj-32 first (storage + transport).** Lands `subjective_section_hidden` on `doctor_settings` + types + Zod + service + API + FE client. Near-verbatim clone of subj-24's `subjective_section_order` path (both are arrays); the only new logic is tolerant id validation. Opus because it adds a migration.
- **subj-33 next (resolver + autosave).** Pure FE lib: `resolveVisibleSections(order, hiddenIds, mountableIds)` (filter hidden from the render plan, mode-aware) + `hiddenOverridesToPersist(...)` (drop non-mountable/non-static + `custom_block:*`) + a thin save helper. Reuses the Phase-9 one-shot-hydration + delta-serialise discipline. Unit-tested in isolation.
- **subj-34 after 33 (the menu + join).** Build the "Manage sections" popover (hide/unhide list + add-custom + reorder), anchor it top-right of `SubjectiveSection`, filter the render plan by the resolver, hydrate one-shot from the stored set, and debounce-autosave the delta. Keep the existing grips/footer; both write `subjective_section_order`. Surface the stored hidden set at the cockpit mount alongside `subjectiveSectionOrder` / `subjectiveSectionCollapsed`.
- **subj-35 last (prove + gate).** Integration test that visibility survives a remount (tab toggle + patient reopen) and that a hidden section with data still appears in `buildRxPayload`; a11y sweep on the menu (keyboard, focus, roles); structural output-parity assertion; verification gate.

---

## References

- **Source:** [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md).
- **Patterns extended:** [`SubjectiveSection.tsx`](../../../../../../../frontend/components/cockpit/rx/sections/SubjectiveSection.tsx) (render plan + layout/collapse autosave + one-shot hydration) · [`subjective-section-order.ts`](../../../../../../../frontend/lib/cockpit/subjective-section-order.ts) (`SubjectiveSectionId`, mountable-id resolvers, save helper) · [`subjective-section-collapse.ts`](../../../../../../../frontend/lib/cockpit/subjective-section-collapse.ts) (resolver + delta serialiser to clone) · [`doctor-settings-service.ts`](../../../../../../../backend/src/services/doctor-settings-service.ts) + migrations `146`/`147` (array/map precedents) · [`useRxFormProviderSetup.ts`](../../../../../../../frontend/components/cockpit/rx/useRxFormProviderSetup.ts) (settings hydration point) · [`CustomSubsectionsField.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/CustomSubsectionsField.tsx) (add-custom reuse).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`TASK_MANAGEMENT_GUIDE.md`](../../../../../process/TASK_MANAGEMENT_GUIDE.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).
- Sibling: [`Tasks/EXECUTION-ORDER-p10-subjective-section-visibility.md`](./Tasks/EXECUTION-ORDER-p10-subjective-section-visibility.md).

---

**Created:** 2026-06-18.  
**Status:** 📝 `Planned` — Phase 10 of the Subjective-tab program; section-visibility slice.  
**Next phase:** none planned.
