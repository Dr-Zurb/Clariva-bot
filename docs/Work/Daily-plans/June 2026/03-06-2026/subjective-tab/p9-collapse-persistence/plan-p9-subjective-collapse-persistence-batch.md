# Subjective tab — Phase 9: remembered section collapse/expand state (per-doctor default) — 18 Jun 2026 batch plan

> **Phase 9 of the Subjective-tab program.** Each top-level Subjective section is a [`CollapsibleContainer`](../../../../../../../frontend/components/ui/CollapsibleContainer.tsx) whose open/closed state is **ephemeral local component state** seeded from a hardcoded `defaultOpen` (some content-aware). Because the state lives only in the mounted component, two routine actions throw it away: toggling the Subjective tab off then on (unmounts/remounts [`SubjectiveSection`](../../../../../../../frontend/components/cockpit/rx/sections/SubjectiveSection.tsx)), and closing then reopening a patient (remounts the cockpit). The doctor's deliberate collapse choices are lost and the hardcoded defaults snap back ("it opens some sections automatically"). Phase 9 makes a doctor's collapse/expand choice for each top-level section **stick** by persisting it as a per-doctor default in `doctor_settings`, resolved against the existing defaults on each mount.
>
> **Source plan:** [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md) — new program item (collapse persistence); inherits **ST-D1..ST-D7** + the Phase-1/2 decision lock (structured JSONB, derived `cc`/`hopi`, per-doctor config).
>
> **Prefix note:** tasks are `subj-28..31`, continuing the program numbering.
>
> **Builds on:** Phase 8's per-doctor `doctor_settings.subjective_section_order` ([migration `146`](../../../../../../../backend/migrations/146_doctor_settings_subjective_section_order.sql)) + the [`SubjectiveSectionId`](../../../../../../../frontend/lib/cockpit/subjective-section-order.ts) identity scheme (static ids + `custom_block:<uuid>`) + the debounced layout-autosave pattern already in `SubjectiveSection`; the per-doctor JSONB config precedent `doctor_settings.subjective_custom_subsections` (Phase 7, migration 145) + `cockpit_layout_presets`; and the controlled-mode support already present in `CollapsibleContainer` (`open` + `onOpenChange`).
>
> **Cost-aware model strategy:** [`AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md). subj-28 (new `doctor_settings` column + API) is **Opus** (hard rule: new migration). subj-29 (resolver + autosave lib), subj-30 (wire controlled collapse), subj-31 (integration + verification) are Auto/Sonnet (additive config cloning shipped patterns; no output-parity risk).
>
> **Exec order:** [`Tasks/EXECUTION-ORDER-p9-subjective-collapse-persistence.md`](./Tasks/EXECUTION-ORDER-p9-subjective-collapse-persistence.md).

---

## What Phase 9 does (one sentence)

> **Persist each doctor's open/closed choice for the top-level Subjective sections as a per-doctor `doctor_settings.subjective_section_collapsed` map (`{ sectionId: isOpen }`), resolve it over the existing per-section defaults on every mount (absent key ⇒ current default, including content-aware ones), and autosave changes — so toggling the tab or reopening a patient restores the doctor's layout instead of snapping back to the hardcoded defaults; patient-facing output is untouched.**

---

## Scope (confirmed with doctor, 2026-06-18)

| Decision | Choice |
|---|---|
| What's remembered | **Open/closed state of each top-level Subjective section** (Chief complaints, Patient background/PMH, Allergies, Family history, Social/personal history, Past-surgical fallback, Free-text notes). |
| Persistence | **Per-doctor default** in `doctor_settings` (like `subjective_section_order` / `subjective_custom_subsections`); applies to every visit; syncs across devices. **Not** per-prescription. |
| Storage shape | A JSONB **object** map `{ [sectionId]: boolean /* true = open */ }`. Absence of a key = fall back to that section's existing default. |
| Depth | **Top-level sections only.** Nested cluster collapsibles (e.g. inside Social history / Patient background) keep their current local + content-aware defaults — out of scope. |
| Custom blocks | **Out of scope for cross-visit memory** — `custom_block:<uuid>` ids are re-minted per visit (seed mints fresh UUIDs), so a per-doctor map can't track them. They keep their default-open behaviour. |
| Patient-facing output | **Unchanged.** Collapse state is a pure UI/editing concern; PDF/SMS/snapshot and `cc`/`hopi` are byte-identical (collapse never reaches `buildRxPayload`). |

---

## Decision lock (frozen for this phase)

- **P9-D1 — per-doctor default only (T2-D2).** Collapse state persists as one JSONB object on `doctor_settings` (doctor-scoped RLS, clone of `subjective_section_order`). No per-visit / per-prescription state, no clinic sharing.
- **P9-D2 — map of explicit overrides, not a full snapshot.** Store `{ sectionId: isOpen }` only for sections the doctor has explicitly toggled. **Absence of a key ⇒ use the section's current default** (including content-aware defaults like `defaultOpen={hasFamilyHistoryStructuredContent(value)}`). An explicit stored value always wins over the default.
- **P9-D3 — top-level sections only.** Only the top-level section blocks persist. Nested cluster collapsibles keep their existing local/content-aware defaults; this phase does not touch them.
- **P9-D4 — static section ids only; custom blocks excluded.** Keys are the **static** `SubjectiveSectionId`s (stable across visits). `custom_block:<uuid>` ids are excluded from the persisted map because the seed re-mints UUIDs per visit; custom blocks render with their default-open behaviour.
- **P9-D5 — collapse is config, not PHI.** `subjective_section_collapsed` is a map of stable section-id strings → booleans (no patient data). Doctor-scoped, never logged; validated against the known-id set (drop unknown keys, coerce non-boolean).
- **P9-D6 — UI-only; output untouched (ST-D2).** Collapse state changes only the cockpit render; `cc`/`hopi` derivation and the PDF/SMS/snapshot are unchanged. `buildRxPayload` never reads collapse state. The Phase-3 byte-parity close-gate stays green by construction.
- **P9-D7 — reuse controlled `CollapsibleContainer` + the Phase-8 autosave pattern.** Drive each top-level container via `open`/`onOpenChange`; debounce-autosave the map exactly like `saveSubjectiveSectionOrder`. No new persistence mechanism, no new UI primitive.

---

## What this phase does NOT do (deferred)

| Item | Why / lands |
|---|---|
| Per-visit / per-prescription collapse state | Out (P9-D1) — collapse is doctor-level config; per-visit memory would touch prescription storage for no clinical value. |
| Remembering collapse of **nested** cluster collapsibles | Out (P9-D3) — top-level only; nested clusters keep content-aware defaults. Clean follow-up if asked. |
| Cross-visit collapse memory for **custom blocks** | Out (P9-D4) — block UUIDs are re-minted per visit. Needs a stable key (title-based or a per-visit ephemeral store) — separate slice if doctors ask. |
| A "reset my section layout to defaults" control | Out — trivial follow-up (PATCH an empty map); not requested. |
| Changing any `defaultOpen` heuristic | Out — defaults are unchanged; this phase only remembers explicit overrides on top. |

---

## Cross-cutting acceptance gate (whole phase)

- [x] Migration `147_doctor_settings_subjective_section_collapsed.sql` runs idempotently; `subjective_section_collapsed` defaults to `'{}'::jsonb`; `jsonb_typeof = 'object'` CHECK; doctor-scoped RLS unchanged. _(subj-28)_
- [x] Zod validates an object of `sectionId → boolean`; drops unknown keys / non-boolean values; GET/PATCH round-trip. _(subj-28)_
- [x] Resolver merges stored map over per-section defaults: explicit key wins; absent key ⇒ current default (content-aware defaults preserved for untouched sections). _(subj-29)_
- [x] Autosave persists **only** explicit overrides (omits keys equal to the resolved default) and excludes `custom_block:*` keys; debounced; one PATCH per settle. _(subj-29 / subj-30)_
- [x] Toggling the Subjective tab off→on, and closing→reopening the patient, **restores** the doctor's collapse choices instead of snapping back to defaults. _(subj-31)_
- [x] Each top-level section is driven by controlled `open`/`onOpenChange`; keyboard + aria-expanded behaviour unchanged; `disabled` (preview) mode unaffected. _(subj-30 / subj-31)_
- [x] `cc`/`hopi` derive byte-identically and PDF/SMS/snapshot are unchanged — collapse never reaches `buildRxPayload`. _(subj-31)_
- [x] `cd frontend; npx tsc --noEmit` + `npm run lint` clean for the slice; backend + frontend suites green (pre-existing unrelated failures routed, not gate-blocking).

---

## Phase plan position

| Phase | Scope | Status |
|---|---|---|
| Phase 7 | Doctor-defined custom subsections + per-doctor default + PDF output | ✅ Done (subj-19..22) |
| Phase 8 | Doctor-reorderable subjective sections (drag-and-drop, per-doctor default) | ✅ Done (subj-23..27) |
| **Phase 9** | **Remembered section collapse/expand state (per-doctor default)** | ✅ Done (subj-28..31) |

---

## Cost estimate

| Wave | Tasks | Sonnet / Auto | Opus | Wall-clock |
|---|---|---|---|---|
| Wave 1 | subj-28 (doctor_settings collapse map column + API) | 0 | 1 (Opus — migration) | ~2–3h |
| Wave 2 | subj-29 (collapse resolver + debounced autosave lib) | 1 (Auto) | 0 | ~2–3h |
| Wave 3 | subj-30 (wire top-level sections to controlled collapse + persist) | 1 (Auto) | 0 | ~2–3h |
| Wave 4 | subj-31 (integration + remount-survival + a11y + verification gate) | 1 (Auto/Sonnet) | 0 | ~1–2h |
| **Total** | **4** | **3** | **1** | **~7–11h agent-time** |

---

## Sequencing notes

- **subj-28 first (storage + transport).** Lands `subjective_section_collapsed` on `doctor_settings` + types + Zod + service + API + FE client. Near-verbatim clone of subj-24's `subjective_section_order` path, but the value is a JSONB **object** (map) not an array. Opus because it adds a migration.
- **subj-29 next (resolver + autosave, the correctness keystone).** Pure FE lib: resolve initial open-state per section from `stored ∪ defaults`, and a save helper that serialises **only explicit overrides** (omit keys equal to default; drop `custom_block:*`). Unit-tested in isolation. Depends only on subj-28's transport shape + the existing `SubjectiveSectionId` set.
- **subj-30 after 29 (join).** Lift each top-level section's open state into `SubjectiveSection`, drive the `CollapsibleContainer`s via controlled `open`/`onOpenChange`, hydrate from the stored map on mount, and debounce-autosave changes (mirror the Phase-8 layout autosave). Surfaces the stored map at the cockpit mount alongside `subjectiveSectionOrder`.
- **subj-31 last (prove the fix + gate).** Integration test that collapse survives a remount (tab toggle + patient reopen), a11y sweep (controlled mode keeps keyboard/aria), and the verification gate. Lightweight close-gate — collapse is UI-only by construction, so output parity is asserted structurally, not via fixtures.

---

## References

- **Source:** [`Product plans/ehr/subjective-tab/plan-subjective-tab.md`](../../../../../Product%20plans/ehr/subjective-tab/plan-subjective-tab.md).
- **Patterns extended:** [`SubjectiveSection.tsx`](../../../../../../../frontend/components/cockpit/rx/sections/SubjectiveSection.tsx) (mount + layout autosave) · [`subjective-section-order.ts`](../../../../../../../frontend/lib/cockpit/subjective-section-order.ts) (`SubjectiveSectionId`, save helper) · [`CollapsibleContainer.tsx`](../../../../../../../frontend/components/ui/CollapsibleContainer.tsx) (controlled `open`/`onOpenChange`) · [`doctor-settings-service.ts`](../../../../../../../backend/src/services/doctor-settings-service.ts) + migration `146` (`subjective_section_order` precedent) · [`useRxFormProviderSetup.ts`](../../../../../../../frontend/components/cockpit/rx/useRxFormProviderSetup.ts) (settings hydration point).
- **Process:** [`PHASED-PLANS-GUIDE.md`](../../../../../process/PHASED-PLANS-GUIDE.md) · [`TASK_MANAGEMENT_GUIDE.md`](../../../../../process/TASK_MANAGEMENT_GUIDE.md) · [`CODE_CHANGE_RULES.md`](../../../../../process/CODE_CHANGE_RULES.md).
- Sibling: [`Tasks/EXECUTION-ORDER-p9-subjective-collapse-persistence.md`](./Tasks/EXECUTION-ORDER-p9-subjective-collapse-persistence.md).

---

**Created:** 2026-06-18.  
**Status:** ✅ `Done` (2026-06-18) — Phase 9 of the Subjective-tab program; collapse-persistence slice.  
**Next phase:** none planned.
