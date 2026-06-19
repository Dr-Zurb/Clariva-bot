# Subjective tab — Phase 11: hideable + reorderable custom sections (stable identity) — 18 Jun 2026 batch plan

> **Phase 11 of the Subjective-tab program.** Phase 10 made the **static** top-level Subjective sections hideable via the "Manage sections" menu, persisted per-doctor in [`subjective_section_hidden`](../../../../../../../backend/migrations/148_doctor_settings_subjective_section_hidden.sql). Custom sections (`custom_block:<uuid>`) were deliberately excluded (P10-D4) because their ids **re-mint every visit**, so a stored hidden id would be stale on the next visit. Phase 11 removes that exclusion by **stabilising the custom-section identity** end-to-end (create → doctor-default template → per-visit seed), after which a custom block becomes a first-class `SubjectiveSectionId` that hides, unhides, and reorders **exactly like any static section** — no special-casing.
>
> **Source plan:** [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md) — continues the program; inherits **ST-D1..ST-D7** + the Phase-10 visibility lock (view-only hidden set, per-doctor default).
>
> **Prefix note:** tasks are `subj-36..38`, continuing the program numbering.
>
> **Builds on:** Phase 7's per-doctor custom-subsection template ([`subjective_custom_subsections`](../../../../../../../frontend/lib/cockpit/custom-subsections.ts)); Phase 8's [`SubjectiveSectionId`](../../../../../../../frontend/lib/cockpit/subjective-section-order.ts) identity scheme (static ids + `custom_block:<uuid>`) + per-doctor `subjective_section_order`; Phase 10's hidden set + resolver ([`subjective-section-visibility.ts`](../../../../../../../frontend/lib/cockpit/subjective-section-visibility.ts)) + "Manage sections" menu ([`SectionManagerMenu.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/SectionManagerMenu.tsx)).
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). subj-36 (identity stabilisation) is the load-bearing slice — it shifts a Phase-7 seeding behaviour — so it runs **Opus**. subj-37 (drop the custom-block special-casing across FE + BE) and subj-38 (contract inversion + verification) are Auto/Sonnet.
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p11-custom-section-visibility.md`](./Tasks/EXECUTION-ORDER-p11-custom-section-visibility.md).

---

## What Phase 11 does (one sentence)

> **Give doctor-template custom sections a stable, cross-visit id so they flow through `subjective_section_hidden` (and `subjective_section_order`) as ordinary `SubjectiveSectionId`s — letting a doctor hide/unhide and reorder custom sections exactly like static ones, persisted per-doctor and surviving a patient reopen, with the hidden state staying view-only (a hidden custom section's data still prints).**

---

## Why this phase exists (the bug behind P10-D4)

Custom-subsection ids are `crypto.randomUUID()` and are **regenerated** at two points:

- `customSubsectionsToDefaultTemplate` re-mints when the per-doctor default template is autosaved.
- `seedCustomSubsectionsFromDefault` re-mints again when a fresh visit clones the template.

So the id a doctor sees in the menu is never the same across visits. Phase 10 therefore excluded `custom_block:*` from the hidden set (P10-D4) and the resolver passes them through untouched. **The same re-minting also silently breaks custom-section ordering**: `subjective_section_order` already persists `custom_block` ids, but `syncCustomBlockIdsInOrder` drops them as stale on the next visit, so custom sections always fall back to their default slot. Stabilising the id fixes **both** hide and order in one change.

---

## Scope (proposed — confirm before building)

| Decision | Choice |
|---|---|
| Identity | **Template-backed custom sections keep one stable id** from creation → doctor-default autosave → per-visit seed. No re-minting. |
| What's controllable | Custom sections become **hideable/unhideable + reorderable like any static section**; persisted in `doctor_settings` (`subjective_section_hidden` / `subjective_section_order`). |
| Output effect | **View-only (inherits P10-D6).** Hiding a custom section never removes its data from Rx/PDF/SMS/snapshot. |
| Storage shape | No new column — `subjective_section_hidden` and `subjective_section_order` already hold `string[]`; they now retain `custom_block:<stableId>`. |
| Cross-visit persistence scope | **Only template-backed blocks** carry cross-visit hide/order. An ad-hoc block added in one visit but never saved to the doctor template keeps a per-visit id (no cross-visit identity). |
| Backfill | **None.** Existing stale `custom_block` ids in stored arrays continue to be dropped-on-read; new stable ids accrue going forward. |
| Special-casing | **Removed.** Resolver / serialiser / menu / backend validation stop treating `custom_block:*` differently. |

---

## Decision lock (proposed — freeze on confirmation)

- **P11-D1 — stable custom-section id.** A template-backed custom subsection keeps one id from creation, through doctor-default autosave, through each visit's seed. `customSubsectionsToDefaultTemplate` and `seedCustomSubsectionsFromDefault` preserve ids instead of minting new ones.
- **P11-D2 — `custom_block:<stableId>` is a first-class `SubjectiveSectionId`.** It flows through `subjective_section_hidden` and `subjective_section_order` with **no special-casing** — the resolver, serialiser, menu, and backend validation treat it like a static id.
- **P11-D3 — cross-visit hide/order requires a template-backed block.** Only blocks present in the doctor's `subjective_custom_subsections` template carry a stable id and therefore cross-visit hide/order. Ad-hoc per-visit blocks reconcile away as today (unknown id ⇒ dropped-on-read, never bricks a save).
- **P11-D4 — view-only; output untouched (inherits P10-D6 / ST-D2).** Hiding a custom section changes only the cockpit render. `buildRxPayload` never reads the hidden set; a hidden custom section **with data still prints**.
- **P11-D5 — no backfill / tolerant reconciliation.** Stored stale `custom_block` ids are dropped-on-read (existing behaviour); no data migration. The hidden-set + order arrays remain tolerant (drop unknown ids, dedupe, cap).
- **P11-D6 — reuse Phase-10 machinery.** No new persistence mechanism, column, or debounce pattern. The hide autosave, one-shot hydration, and resolver from Phase 10 are reused verbatim once the id is stable.

---

## What this phase does NOT do (deferred)

| Item | Why / lands |
|---|---|
| New migration / new column | Not needed — `subjective_section_hidden` + `subjective_section_order` are generic `string[]`. |
| Cross-visit hide for **ad-hoc** (non-template) blocks | Out (P11-D3) — only template-backed blocks have a stable id. |
| Backfilling existing doctors' stale stored ids | Out (P11-D5) — dropped-on-read; new stable ids accrue forward. |
| Hiding **removing data from the Rx/PDF** | Out (P11-D4) — explicitly view-only; output parity preserved. |
| Retiring the in-page drag grips / add-custom footer | Out — unchanged from Phase 10 (menu remains additive). |

---

## Cross-cutting acceptance gate (whole phase)

- [x] A template-backed custom section keeps the **same id** across: creation → doctor-default autosave → a fresh visit seed (no re-mint). _(subj-36)_
- [x] `subjective_custom_subsections` autosave still fires on title/structure change (the structure key ignores ids). _(subj-36)_
- [x] Resolver filters a **hidden, mountable** custom block out of the render plan; a non-mountable / unknown custom id passes through (tolerant). _(subj-37)_
- [x] Hide autosave persists `custom_block:<stableId>` in `subjective_section_hidden`; backend Zod accepts custom-block ids (validates via `isSubjectiveSectionId`), dedupes, caps size. _(subj-37)_
- [x] "Manage sections" menu shows a hide/unhide toggle on **every** mountable row, including custom sections; reorder + hidden-count + all-hidden empty-state still work. _(subj-37)_
- [x] Hiding/unhiding a custom section survives a Subjective tab toggle and a patient reopen (per-doctor default re-applies via the stable id). _(subj-38)_
- [x] Custom-section **order** now persists across visits (bonus from the stable id). _(subj-38)_
- [x] `cc`/`hopi` derive byte-identically and PDF/SMS/snapshot are unchanged — the hidden set never reaches `buildRxPayload`; a hidden custom section **with data still prints**. _(subj-38)_
- [x] FE + BE suites green for the slice; lint clean on touched files. _(subj-38)_

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| Phase 7 | Doctor-defined custom subsections + per-doctor default + PDF output | ✅ Done (subj-19..22) |
| Phase 8 | Doctor-reorderable subjective sections (drag-and-drop, per-doctor default) | ✅ Done (subj-23..27) |
| Phase 9 | Remembered section collapse/expand state (per-doctor default) | ✅ Done (subj-28..31) |
| Phase 10 | Hide/unhide **static** sections + "Manage sections" menu (per-doctor default) | ✅ Done (subj-32..35) |
| **Phase 11** | **Stable custom-section identity → hideable + reorderable custom sections** | ✅ Done (subj-36..38) |

---

## Open questions (confirm before build)

1. **P11-D3** — confirm cross-visit hide/order should require the block be in the doctor template (recommended). Alternative: persist hide for any block (rejected — no stable id, would brick on reopen).
2. **Wave-1 blast radius** — re-mint removal touches the Phase-7 seeding path. Confirm there is no product expectation that a fresh visit's custom blocks get *new* ids (there should not be — bodies are blanked, structure/identity is the doctor's).

---

**Created:** 2026-06-18. **Status:** ✅ Done (subj-36..38).
**Pattern:** stabilise custom-section identity → drop Phase-10 `custom_block` special-casing → custom sections become ordinary `SubjectiveSectionId`s for hide + order.
**Reference:** `process/CODE_CHANGE_RULES.md`
