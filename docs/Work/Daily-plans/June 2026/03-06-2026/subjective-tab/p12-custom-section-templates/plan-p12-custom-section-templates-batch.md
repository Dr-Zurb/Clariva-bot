# Subjective tab — Phase 12: custom-section templates + delete safeguards — 18 Jun 2026 batch plan

> **Phase 12 of the Subjective-tab program.** Phase 6 (`subj-15..18`) gave every *static* subjective subsection its own scoped Templates button on `doctor_rx_templates` (`scope` discriminator + `TemplatePicker`). Phase 7 (`subj-19..22`) added doctor-defined **custom sections** with a per-doctor structure default. Phase 11 (`subj-36..38`) stabilised the custom-section **id** end-to-end so a `custom_block:<id>` is the same across visits. Phase 12 closes the loop: **custom sections become first-class template citizens** — they get the same save/apply Templates button as static sections (a new `custom_block` scope), they ride inside the **whole-subjective** template, and **deleting a custom section is guarded** by a confirmation dialog that surfaces (and optionally archives) any templates linked to it.
>
> **Source plan:** [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md) — extends **ST.8** (templates) onto custom sections; inherits **ST-D1..ST-D7** + the Phase-6 scoped-template lock (**P6-D1..D6**) + the Phase-11 stable-id lock (**P11-D1..D6**).
>
> **Prefix note:** tasks are `subj-39..42`, continuing the program numbering.
>
> **Builds on:** Phase 6's scoped templates ([`141_doctor_rx_templates_scope.sql`](../../../../../../../backend/migrations/141_doctor_rx_templates_scope.sql), [`apply-subjective-template.ts`](../../../../../../../frontend/lib/cockpit/apply-subjective-template.ts), [`SubjectiveSectionTemplateButton.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/SubjectiveSectionTemplateButton.tsx), [`TemplatePicker.tsx`](../../../../../../../frontend/components/ehr/TemplatePicker.tsx), [`rx-template-service.ts`](../../../../../../../backend/src/services/rx-template-service.ts)); Phase 7's custom-subsection model ([`custom-subsections.ts`](../../../../../../../frontend/lib/cockpit/custom-subsections.ts)); Phase 11's stable id + hideable custom blocks ([`subjective-section-order.ts`](../../../../../../../frontend/lib/cockpit/subjective-section-order.ts), [`SectionManagerMenu.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/SectionManagerMenu.tsx)).
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). subj-39 (scope enum migration + storage shape across FE + BE) is the load-bearing slice — it touches a migration + 5+ files across layers — so it runs **Opus**. subj-40/41/42 are Auto/Sonnet (clone the shipped Phase-6 save/apply path; orchestration; tests).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p12-custom-section-templates.md`](./Tasks/EXECUTION-ORDER-p12-custom-section-templates.md).

---

## What Phase 12 does (one sentence)

> **Give doctor-defined custom sections the same Templates affordance static sections already have — a `custom_block` scope on `doctor_rx_templates` that saves/applies a single custom section, plus inclusion of custom sections in the whole-subjective (`subjective_full`) template as merge-by-id snapshots — and guard custom-section deletion with a confirmation dialog that surfaces data loss, the doctor-default removal, and any linked templates (with an opt-in to archive them), never silently cascading.**

---

## The problem this phase solves

Custom sections sit outside the named-template world today. They have a per-doctor **structure default** (auto-saved `subjective_custom_subsections`) and they are now stable-id, hideable, reorderable (Phase 11) — but:

- There is **no "save as template" / Templates picker** for a custom section the way `chief_complaints`/`family_history`/etc. have (`SubjectiveSectionTemplateButton`).
- `subjective_json` carries no `customSubsections`, so the **whole-subjective** template silently drops custom sections on save/apply (`apply-subjective-template.ts`).
- **Deleting** a custom section (the trash control added alongside the Manage-sections menu) is unguarded — it discards the visit's data, removes the section from the doctor default, and would orphan any future linked templates, all with no warning.

---

## Scope (recommended — confirm before building)

| Decision | Choice |
|---|---|
| Template storage | **Reuse `doctor_rx_templates`** with a **new `custom_block` scope** (inherits P6-D1 — one table, one discriminator). **No** new per-section table. |
| Content shape | Extend `subjective_json` with **`customSubsections?: CustomSubsection[]`** — `custom_block` scope stores an array of **one**; `subjective_full` stores **N**. **No second column / no PHI column** — reuse the existing JSON. |
| Link / surfacing | A `custom_block` template records the source **stable block id** so the picker **surfaces the current section's templates first**; it is **not** a hard FK. Cross-apply to another section is allowed (title is advisory). |
| Cross-visit template ownership | **Template-backed custom sections only** (those in the doctor default) carry a stable id; **ad-hoc** per-visit blocks can still save a template but it won't re-link until the section is template-backed (inherits P11-D3). |
| Whole-subjective inclusion | `subjective_full` save **captures** custom sections; apply **merges by id** — overwrite body/children of a same-id section, **create** an absent one. Re-creating a previously deleted section is allowed (informational, not blocked). |
| Delete behaviour | **Guarded by a confirmation dialog.** It enumerates: visit data loss, removal from the doctor default, count of linked `custom_block` templates, count of `subjective_full` templates that embed the section. Offers **"also archive N linked templates"** (default **off** — keep). **Never** silently cascades; **never** edits `subjective_full` snapshots. |
| Cascade mechanism | **Archive (soft-delete)**, reusing `archiveRxTemplate` + `archived_at` — reversible, audit-visible. Not a hard `DELETE`. |
| Output effect | **View-only (inherits P11-D4 / P6-D2).** Templates are doctor-scoped config; applying fills form state; `buildRxPayload`/PDF/SMS untouched. |

---

## Decision lock (recommended — freeze on confirmation)

- **P12-D1 — one table, new `custom_block` scope.** Reuse `doctor_rx_templates` + `TemplatePicker`; add `custom_block` to the scope enum. Inherits P6-D1.
- **P12-D2 — content rides `subjective_json.customSubsections`.** No new column. `custom_block` = array of one; `subjective_full` = array of N. Bodies/children persist as authored (doctor boilerplate, not patient PHI).
- **P12-D3 — surface by stable id, don't hard-link.** A `custom_block` template stores its source block id for picker prioritisation only. Applying never requires the section to still exist; tolerant reconciliation drops unknown ids (inherits P11-D5).
- **P12-D4 — delete is guarded, archival, opt-in.** A confirm dialog precedes every custom-section delete; cascade is **archive** and **opt-in**; `subjective_full` snapshots are never mutated by a delete.
- **P12-D5 — merge-by-id on whole-template apply.** `subjective_full` apply overwrites a same-id custom section's body/children and creates absent ones; never duplicates by title.
- **P12-D6 — view-only; output untouched (inherits P11-D4 / ST-D2).** No `buildRxPayload`/PDF/SMS change. The save/apply path is form-state + doctor-settings only.

---

## What this phase does NOT do (deferred)

| Item | Why / lands |
|---|---|
| New per-section template table | Out (P12-D1) — reuse the scoped `doctor_rx_templates`. |
| New column for custom-section template content | Out (P12-D2) — reuse `subjective_json`. The only migration is the scope-enum widen. |
| Hard cascade `DELETE` of linked templates | Out (P12-D4) — archive + opt-in only; silent cascade rejected as data-loss-prone. |
| Cross-visit template ownership for **ad-hoc** blocks | Out (P11-D3) — only template-backed (stable-id) sections re-link. |
| Clinic-wide / shared custom-section templates | Out (P6-D5) — doctor-scoped RLS unchanged. |
| Hiding/removing a custom section changing **output** | Out (P12-D6) — view-only. |

---

## Cross-cutting acceptance gate (whole phase)

- [x] Migration `149_…` widens the `doctor_rx_templates` scope CHECK enum to include `custom_block`, runs idempotently, doctor-scoped RLS unchanged. _(subj-39)_
- [x] `subjective_json.customSubsections` round-trips through create/list/get on both `custom_block` and `subjective_full` scopes; validation tolerant (drops malformed). _(subj-39)_
- [x] Each custom section header shows a Templates button: **save** snapshots only that section; **apply** fills (or creates) that section; the picker surfaces the section's own templates first. _(subj-40)_
- [x] Whole-subjective template **captures** custom sections and **applies** them merge-by-id (overwrite same-id, create absent); static-subjective behaviour unchanged. _(subj-41)_
- [x] Deleting a custom section opens a confirm dialog enumerating data loss + doctor-default removal + linked `custom_block` count + `subjective_full` embed count, with an opt-in to archive linked templates; cancelling is a no-op. _(subj-41)_
- [x] Opting to archive cascades via `archiveRxTemplate` (soft); `subjective_full` snapshots are untouched; tolerant reconciliation on apply of a stale/absent id. _(subj-42)_
- [x] `cc`/`hopi`/PDF/SMS byte-identical — the template path never reaches `buildRxPayload` (view-only). _(subj-42)_
- [x] Targeted backend + frontend suites green; lint clean on edited files (pre-existing unrelated failures routed, not gate-blocking). _(subj-42)_

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| Phase 6 | Scoped per-subsection templates + PMH/allergy server-apply + full-template upgrade | ✅ Done (subj-15..18) |
| Phase 7 | Doctor-defined custom subsections + per-doctor default + PDF output | ✅ Done (subj-19..22) |
| Phase 11 | Stable custom-section identity → hideable + reorderable custom sections | ✅ Done (subj-36..38) |
| **Phase 12** | **Custom-section templates + whole-template inclusion + guarded delete** | ✅ Done (subj-39..42) |

---

## Cost estimate

| Wave | Tasks | Sonnet / Auto | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | subj-39 (scope enum migration + storage shape FE+BE) | 0 | 1 (Opus) | ~3–4h |
| Wave 2 | subj-40 (custom-section save/apply + Templates button) | 1 (Sonnet) | 0 | ~3–4h |
| Wave 3 | subj-41 (full-template inclusion + delete-warning dialog) | 1 (Sonnet) | 0 | ~3–4h |
| Wave 4 | subj-42 (cascade/archival wiring + verification) | 1 (Auto) | 0 | ~2–3h |
| **Total** | **4** | **3** | **1** | **~11–15h agent-time** |

**Caps check:** 1 Opus in Phase 12 (subj-39 — the migration + cross-layer storage slice). ✓

---

## Sequencing notes

- **subj-39 first (substrate, Opus + migration STOP).** Widens the scope enum, extends `subjective_json` with `customSubsections`, threads types/validation/service/normaliser + the picker's scope labels & content summary for `custom_block`. No buttons, no apply logic. Migrations are a hard-rules STOP item — this slice is Opus by design.
- **subj-40 next (per-section save/apply).** Clones the Phase-6 `SubjectiveSectionTemplateButton` path into a custom-section button; scoped save reads the live block, apply fills/creates the block. Surfacing-by-id in the picker. Depends on subj-39.
- **subj-41 (full template + delete dialog).** Folds custom sections into `subjective_full` capture/apply (merge-by-id) and adds the delete-confirmation dialog to `handleRemoveCustomSection` in `SubjectiveSection.tsx`. The dialog's counts are computed client-side from `listRxTemplates(custom_block)` + `listRxTemplates(subjective_full)`.
- **subj-42 last (cascade + gate).** Wires the opt-in archive (loop `archiveRxTemplate`), proves tolerant reconciliation + output parity, runs the verification gate, updates status.

---

## Open questions (confirm before build)

1. **P12-D2 storage** — reuse `subjective_json.customSubsections` (recommended, no new column) vs a dedicated `custom_block_json`. Confirm reuse.
2. **P12-D4 cascade** — archive + opt-in (recommended) vs the originally-floated hard cascade-delete. Confirm archive.
3. **P12-D5 resurrection** — applying a `subjective_full` template that embeds a since-deleted custom section should **re-create** it (recommended, informational) vs **skip** vs **prompt**. Confirm re-create.
4. **Surfacing** — link by stable id for picker ordering (recommended) vs also offer a global "all custom-section templates" list regardless of section. Confirm.

---

## References

- **Source:** [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md) — ST.8 templates extended to custom sections.
- **Shipped infra extended:** [`141_doctor_rx_templates_scope.sql`](../../../../../../../backend/migrations/141_doctor_rx_templates_scope.sql) · [`rx-template-service.ts`](../../../../../../../backend/src/services/rx-template-service.ts) · [`apply-subjective-template.ts`](../../../../../../../frontend/lib/cockpit/apply-subjective-template.ts) · [`SubjectiveSectionTemplateButton.tsx`](../../../../../../../frontend/components/cockpit/rx/subjective/SubjectiveSectionTemplateButton.tsx) · [`TemplatePicker.tsx`](../../../../../../../frontend/components/ehr/TemplatePicker.tsx) · [`custom-subsections.ts`](../../../../../../../frontend/lib/cockpit/custom-subsections.ts).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md) · [`MIGRATIONS_AND_CHANGE.md`](../../../../../../Reference/engineering/development/MIGRATIONS_AND_CHANGE.md).
- Sibling: [`Tasks/EXECUTION-ORDER-p12-custom-section-templates.md`](./Tasks/EXECUTION-ORDER-p12-custom-section-templates.md).

---

**Created:** 2026-06-18. **Status:** ✅ Done (subj-39..42).
**Pattern:** reuse the scoped `doctor_rx_templates` substrate for a new `custom_block` scope + fold custom sections into the whole-subjective template + guard delete with an archival, opt-in dialog.
**Reference:** `process/CODE_CHANGE_RULES.md`
