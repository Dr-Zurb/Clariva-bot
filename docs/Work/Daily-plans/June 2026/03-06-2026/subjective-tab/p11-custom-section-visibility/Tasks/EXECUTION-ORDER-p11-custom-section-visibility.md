# Subjective tab — Phase 11: custom-section visibility — execution order

> Sibling of [`plan-p11-custom-section-visibility-batch.md`](../plan-p11-custom-section-visibility-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** `subj-36` is the load-bearing slice — stabilise the custom-section id end-to-end (create → doctor-default autosave → per-visit seed) so a `custom_block:<id>` is the same across visits. It runs first and **Opus**, because it shifts a Phase-7 seeding behaviour that the whole phase depends on. `subj-37` removes the Phase-10 `custom_block` special-casing across the FE resolver/serialiser/menu and the BE hidden-set validation, so custom blocks hide/reorder like static ids. `subj-38` inverts the locked Phase-10 contracts ("never persist custom_block" → "persists by stable id"), proves remount-survival for a hidden custom section, asserts the view-only output parity, and closes the gate. Strictly linear — each slice consumes the previous.

---

## Wave plan (3 waves, linear)

```
Wave 1 (stable identity — ~2–3h):
  subj-36 (custom-subsections.ts: customSubsectionsToDefaultTemplate +
           seedCustomSubsectionsFromDefault preserve ids instead of
           re-minting; audit Phase-7 seeding tests; add stable-id test)
           [Opus — shifts Phase-7 seeding behaviour]
        │
        ▼
Wave 2 (drop special-casing — ~2–3h):
  subj-37 (subjective-section-visibility.ts: resolver no longer
           passes custom blocks through; serialiser keeps custom_block;
           isSectionHidden allows custom blocks. SectionManagerMenu:
           canHide for custom rows. Backend sanitizeSubjectiveSectionHidden
           + Zod accept custom-block ids via isSubjectiveSectionId.)
        │
        ▼
Wave 3 (prove + gate — ~1–2h):
  subj-38 (invert subj-33/34/35 custom_block contracts; remount-survival
           for a hidden custom section (tab toggle + patient reopen);
           custom-section order persists; hidden-with-data still prints;
           verification gate)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **subj-36** | S–M | **Opus** | `custom-subsections.ts` (`createCustomSubsectionId`, `customSubsectionsToDefaultTemplate`, `seedCustomSubsectionsFromDefault`, `customSubsectionsStructureKey`); `CustomSubsectionsField.tsx` (default autosave); `useRxFormProviderSetup.ts` (seed path); `rxFormContext.customSubsections.test.ts` + any seeding test | Make template + seed **preserve ids**. Confirm autosave still fires (structure key ignores ids). Add a test: seed the same template twice → identical ids. No migration. |
| W2.0 | subj-37 | M | Auto/Sonnet | subj-36 stable id; `subjective-section-visibility.ts` (`resolveVisibleSections`, `hiddenOverridesToPersist`, `isSectionHidden`); `SectionManagerMenu.tsx` (`canHide` gate); `backend/src/types/subjective-section-order.ts` (`isSubjectiveSectionId`, `sanitizeSubjectiveSectionHidden`); `backend/src/utils/validation.ts` (`subjectiveSectionHiddenSchema`) | Remove the `custom_block` bypass in the resolver; keep custom blocks in `hiddenOverridesToPersist`; `isSectionHidden` allows them; menu shows the eye toggle on custom rows; backend hidden sanitiser switches static-only → `isSubjectiveSectionId`. |
| W3.0 | **subj-38** | S–M | Auto/Sonnet | subj-37 wiring; `SubjectiveSection.visibility-persist.test.tsx`, `subjective-section-visibility.test.ts`, `doctor-settings-subjective-section-hidden.test.ts`, `visibility-output-parity.test.ts`; `buildRxPayload` | Invert the "drops/never-persists custom_block" contracts → "keeps/persists by stable id". Remount-survival for a hidden custom section. Custom-section order persists across visits. Hidden custom section with data still in `buildRxPayload`. Run gate. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| subj-36 | S–M | **Opus** | Shifts a Phase-7 identity/seeding behaviour the whole phase rests on; subtle (autosave + seed interplay, possible existing test expectations). The risk is concentrated here. |
| subj-37 | M | Auto/Sonnet | Mechanical removal of special-casing across FE + BE; bounded by the resolver/menu + the backend sanitiser. No migration. |
| subj-38 | S–M | Auto/Sonnet | Tests + contract inversion + verification; no output-parity fixture risk (view-only by construction). |

**Caps check:** 1 Opus in Phase 11 (subj-36, the identity slice). ✓

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p11-custom-section-visibility-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p11-custom-section-visibility-batch.md`](../plan-p11-custom-section-visibility-batch.md).
- Tasks: [`task-subj-36-…`](./task-subj-36-stable-custom-section-identity.md) · [`task-subj-37-…`](./task-subj-37-custom-sections-hideable.md) · [`task-subj-38-…`](./task-subj-38-integration-and-verification.md).
- Phase 10 (predecessor): [`../../p10-section-visibility/plan-p10-subjective-section-visibility-batch.md`](../../p10-section-visibility/plan-p10-subjective-section-visibility-batch.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-18. **Status:** ✅ Done (subj-36..38).
