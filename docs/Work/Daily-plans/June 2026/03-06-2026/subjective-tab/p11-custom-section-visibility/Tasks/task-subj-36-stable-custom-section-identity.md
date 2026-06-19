# Task subj-36: Stable custom-section identity (stop re-minting ids)

> **Filename:** `task-subj-36-stable-custom-section-identity.md` in `subjective-tab/p11-custom-section-visibility/Tasks/`.
> **Relative-link note:** `process/` = six `../`; `Reference/` = seven; `frontend/`/`backend/` = eight (per [`PHASED-PLANS-GUIDE.md`](../../../../../../process/PHASED-PLANS-GUIDE.md) §7). Same depth as the Phase-10 `Tasks/` folder.

---

## 📋 Task Overview

The load-bearing slice of Phase 11. Today a custom subsection's id (`crypto.randomUUID()`) is **re-minted** when the
per-doctor default template is autosaved and **again** when a fresh visit seeds from that template. So the
`custom_block:<uuid>` a doctor sees is never the same across visits — which is the sole reason Phase 10 excluded
custom blocks from the hidden set (P10-D4) and why custom-section *ordering* silently resets each visit. This task
makes the id **stable end-to-end**: `customSubsectionsToDefaultTemplate` and `seedCustomSubsectionsFromDefault`
**preserve** the existing id (still blanking bodies) instead of minting a new one. After this, a template-backed
custom section carries one id from creation → doctor-default autosave → every visit seed, making it a candidate
for ordinary hide/order persistence (subj-37/38). **No persistence-shape change, no new column — just identity.**

**Program / Phase:** subjective-tab · Phase 11 (custom-section visibility)
**Batch:** [`plan-p11-custom-section-visibility-batch.md`](../plan-p11-custom-section-visibility-batch.md)
**Execution order:** [`EXECUTION-ORDER-p11-custom-section-visibility.md`](./EXECUTION-ORDER-p11-custom-section-visibility.md)
**Estimated Time:** ~2–3 hours
**Status:** ✅ **DONE** — 2026-06-18

**Change Type:**
- [ ] **Behaviour change** — stabilises a Phase-7 identity/seeding behaviour. Follow [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md).

**Current State:**
- ✅ **What exists:** [`custom-subsections.ts`](../../../../../../../../frontend/lib/cockpit/custom-subsections.ts) with `createCustomSubsectionId` (`crypto.randomUUID()`), `customSubsectionsToDefaultTemplate` (re-mints ids + blanks bodies), `seedCustomSubsectionsFromDefault` (delegates to the template builder → re-mints again), and `customSubsectionsStructureKey` (title-only signature; **ignores ids**). The doctor-default autosave lives in [`CustomSubsectionsField.tsx`](../../../../../../../../frontend/components/cockpit/rx/subjective/CustomSubsectionsField.tsx) (`CustomSubsectionsChrome`); the fresh-visit seed is in [`useRxFormProviderSetup.ts`](../../../../../../../../frontend/components/cockpit/rx/useRxFormProviderSetup.ts).
- ❌ **What's missing:** any stable id across the create → template → seed chain. Both template + seed re-mint.

**Scope Guard:**
- Expected files touched: ≤ 3 (`custom-subsections.ts`; its unit test; possibly a seeding test fixture).
- **No** changes to the resolver/menu/backend (subj-37); **no** new column/migration; **no** `cc`/`hopi`/PDF change; **do not** change the persisted custom-subsection storage shape (titles/bodies/children unchanged — only id provenance).

**Reference Documentation:**
- [CODE_CHANGE_RULES.md](../../../../../../process/CODE_CHANGE_RULES.md) · [STANDARDS.md](../../../../../../../Reference/engineering/development/STANDARDS.md).

---

## ✅ Task Breakdown (Hierarchical)

### 1. Preserve ids in the template builder
- [x] ✅ 1.1 `customSubsectionsToDefaultTemplate`: keeps `section.id` / `child.id` (when present + valid) via `preserveOrMintCustomSubsectionId`; still blanks bodies + trims titles + filters empty. Mints a new id **only** when one is absent/malformed. - **Completed: 2026-06-18**
- [x] ✅ 1.2 Confirmed the doctor-default autosave in `CustomSubsectionsChrome` still fires on title/structure change — `customSubsectionsStructureKey` ignores ids, so the dedupe guard is unaffected (no code change needed). - **Completed: 2026-06-18**

### 2. Preserve ids in the visit seed
- [x] ✅ 2.1 `seedCustomSubsectionsFromDefault`: clones the template **id verbatim** (bodies stay blank) by delegating to the now id-preserving template builder. - **Completed: 2026-06-18**
- [x] ✅ 2.2 Verified the seed path in `useRxFormProviderSetup.ts` (fresh-visit branch) passes ids through unchanged; the existing-prescription branch already reads ids from the saved row (untouched). - **Completed: 2026-06-18**

### 3. Verification & Testing
- [x] ✅ 3.1 New test: build a template from a visit, then `seedCustomSubsectionsFromDefault(template)` twice → both seeds have **identical ids** matching the template. - **Completed: 2026-06-18**
- [x] ✅ 3.2 Regression: an ad-hoc section created via `createEmptyCustomSubsection()` keeps that uuid through template autosave + next-visit seed; plus a malformed/absent-id minting test. - **Completed: 2026-06-18**
- [x] ✅ 3.3 Audited seeding/custom-subsection tests; inverted only the two `custom-subsections-default.test.ts` cases asserting the old re-mint. Phase-7 storage/serialisation tests untouched. - **Completed: 2026-06-18**
- [x] ✅ 3.4 Lint clean; `custom-subsections-default.test.ts` + `rxFormContext.customSubsections.test.ts` + `CustomSubsectionsField.test.tsx` green (23 passed). `tsc` has pre-existing repo-wide errors from unrelated WIP — none in the touched files. - **Completed: 2026-06-18**

**Note:** mark items `- [x] ✅ N.N … - **Completed: YYYY-MM-DD**` as you go.

---

## 📁 Files to Create/Update

```
UPDATE: frontend/lib/cockpit/custom-subsections.ts (customSubsectionsToDefaultTemplate + seedCustomSubsectionsFromDefault preserve ids)
UPDATE: frontend/lib/cockpit/__tests__/custom-subsections*.test.ts OR add a focused id-stability test
DO NOT TOUCH: resolver/menu/backend (subj-37); persisted custom-subsection storage shape; buildRxPayload; cc/hopi/PDF
```

**When updating existing code:**
- [ ] Change **only** id provenance. Titles, bodies (blank-on-template), children, trimming, and the structure key must behave identically. The diff should read as "reuse id when present" — nothing else.

---

## 🧠 Design Constraints (NO IMPLEMENTATION)

- **Stable id across the chain (P11-D1).** create → doctor-default autosave → per-visit seed all carry the same id for a template-backed block.
- **Template-backed only (P11-D3).** Ad-hoc blocks not in the doctor template keep a per-visit id until saved into the template; cross-visit identity is a property of template membership.
- **Bodies still blank on template + seed (ST / subj-21).** Identity stabilises; content semantics (template carries structure, not visit data) are unchanged.
- **No storage-shape change.** The persisted `subjective_custom_subsections` JSON keeps the same fields; only which id value lands there changes.
- **No output effect.** This task does not touch `buildRxPayload` or the hidden set — those land in subj-37/38.

**DO NOT include** code or signatures.

---

## 🌍 Global Safety Gate (MANDATORY)

- [ ] **Data touched?** **No** new storage — same `subjective_custom_subsections` shape; only id provenance changes (doctor-scoped config, not PHI).
- [ ] **Any PHI in logs?** **No.**
- [ ] **External API or AI call?** **No.**
- [ ] **Retention / deletion impact?** **No new patient surface.**

---

## ✅ Acceptance & Verification Criteria

- [ ] Seeding the same template twice yields identical custom-section ids; template autosave preserves the id.
- [ ] Doctor-default autosave still fires on title/structure change; no double-write regression.
- [ ] Existing custom-subsection storage/serialisation behaviour unchanged; `tsc`/lint/tests green.

**See also:** [DEFINITION_OF_DONE.md](../../../../../../../Reference/engineering/development/DEFINITION_OF_DONE.md).

---

## 📝 Notes

This is the one slice with real blast radius: it shifts a Phase-7 (subj-21) seeding behaviour that everything else
in Phase 11 depends on. Done right, it has a free bonus — custom-section **ordering** (which already persists
`custom_block` ids in `subjective_section_order` but loses them to re-mint each visit) starts surviving across
visits without any further change. Get the audit in 3.3 right: only invert tests that assert the *old* re-mint, not
the storage/serialisation contracts from Phase 7.

---

## 🔗 Related Tasks

- [`task-subj-37-custom-sections-hideable.md`](./task-subj-37-custom-sections-hideable.md) — consumes the stable id to drop the `custom_block` special-casing.
- [`task-subj-38-integration-and-verification.md`](./task-subj-38-integration-and-verification.md) — proves remount-survival + order persistence + output parity.
- Predecessor lock: [`../../p10-section-visibility/Tasks/task-subj-33-visibility-resolver-and-autosave.md`](../../p10-section-visibility/Tasks/task-subj-33-visibility-resolver-and-autosave.md) (P10-D4 — the exclusion this phase removes).

---

**Last Updated:** 2026-06-18
**Pattern:** stabilise identity by preserving ids through the template/seed chain (no storage-shape change).
**Reference:** `process/CODE_CHANGE_RULES.md`
