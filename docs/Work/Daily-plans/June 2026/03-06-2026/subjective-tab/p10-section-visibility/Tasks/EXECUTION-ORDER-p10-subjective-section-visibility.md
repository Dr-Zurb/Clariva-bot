# Subjective tab — Phase 10: section visibility — execution order

> Sibling of [`plan-p10-subjective-section-visibility-batch.md`](../plan-p10-subjective-section-visibility-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** `subj-32` lands the `doctor_settings.subjective_section_hidden` column + API (storage/transport) and runs first — **Opus**, because it adds a migration. `subj-33` is the pure resolver/autosave lib (filter hidden from the render plan, mode-aware; serialise only the hidden delta) and depends only on subj-32's shape. `subj-34` builds the "Manage sections" menu and wires `SubjectiveSection` to filter by the resolver + hydrate + autosave, reusing the existing reorder/add-custom machinery. `subj-35` proves the fix (visibility survives remount; hidden-with-data still prints), runs the a11y sweep on the menu, and closes the verification gate. Strictly linear — each slice consumes the previous.

---

## Wave plan (4 waves, linear)

```
Wave 1 (storage + transport — ~2–3h):
  subj-32 (doctor_settings.subjective_section_hidden JSONB array
           + type + Zod (array of ids, drop unknown, dedupe, cap)
           + service + API + FE client)
           [Opus — new migration 148]
        │
        ▼
Wave 2 (resolver — ~2–3h):
  subj-33 (subjective-section-visibility.ts: resolveVisibleSections
           (filter hidden from render plan, mode-aware) +
           hiddenOverridesToPersist (static+mountable only, drop
           custom_block:*) + save helper; unit tests)
        │
        ▼
Wave 3 (menu + wire — ~3–4h):
  subj-34 (SectionManagerMenu popover: hide/unhide + add custom +
           reorder; anchor top-right of SubjectiveSection; filter
           render plan; one-shot hydrate; debounced delta autosave;
           hidden-count + all-hidden empty-state; keep existing
           grips/footer)
        │
        ▼
Wave 4 (prove + gate — ~1–2h):
  subj-35 (remount-survival integration test (tab toggle + patient
           reopen); hidden-with-data still in buildRxPayload; menu
           a11y sweep; structural output-parity; verification gate)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **subj-32** | M | **Opus** | `147_doctor_settings_subjective_section_collapsed.sql` + `146` + `145`; `doctor-settings-service.ts` (SELECT list, `normalize…`, `allowedKeys`, accessors); `doctor-settings.ts` types (both sides); `validation.ts` (`subjectiveSectionOrderSchema` / `subjectiveSectionCollapsedSchema`); settings controller/route; FE doctor-settings api client | Migration `148_doctor_settings_subjective_section_hidden.sql` (`JSONB DEFAULT '[]'`, `jsonb_typeof='array'` CHECK); `subjectiveSectionHidden` on types both sides; Zod = array of `string` ids (drop unknown, dedupe, cap size); service read + upsert; GET in payload + PATCH allowed key; FE client get/set. Array-valued clone of subj-24. |
| W2.0 | subj-33 | S–M | Auto | subj-32 transport shape; `subjective-section-order.ts` (`SubjectiveSectionId`, `isCustomBlockSectionId`, `isStaticSubjectiveSectionId`, `resolveStaticSectionIds`/`resolveAvailableSectionIds`); `subjective-section-collapse.ts` (delta-serialise + save-helper shape to clone) | `frontend/lib/cockpit/subjective-section-visibility.ts`: `resolveVisibleSections(order, hiddenIds, mountableIds)` (drop hidden ids that are mountable; keep order); `hiddenOverridesToPersist(hiddenIds, mountableIds)` (static + mountable only; drop `custom_block:*`); `serializeHiddenIds`; `saveSubjectiveSectionHidden(token, ids)`. Pure + unit-tested. |
| W3.0 | subj-34 | M–L | Auto/Sonnet | subj-33 lib; `SubjectiveSection.tsx` (render plan, header row, layout/collapse autosave + one-shot hydration); `SortableSectionShell` / `section-reorder-context.tsx` (reorder reuse); `CustomSubsectionsField.tsx` (add-custom reuse); a UI popover/menu primitive in `components/ui`; `useRxFormProviderSetup.ts` (surface stored hidden set) | New `SectionManagerMenu` (popover anchored top-right next to CarryForward/Preset): mountable-section list with hide/unhide toggles + drag reorder + "add custom"; filter the render plan via `resolveVisibleSections`; one-shot hydrate from the stored set; debounce-autosave the hidden delta (clone the collapse autosave); hidden-count badge; all-hidden empty-state in the body; trigger always rendered. Keep existing grips/footer. |
| W4.0 | **subj-35** | S–M | Auto/Sonnet | subj-34 wiring; existing `SubjectiveSection.*.test.tsx` (remount/a11y/collapse-persist patterns); `buildRxPayload` (assert hidden-with-data still present) | Integration test: visibility survives unmount/remount (tab toggle) + fresh mount with stored set (patient reopen); a hidden section that has data still appears in `buildRxPayload`/PDF path; menu a11y (keyboard open/close, focus return, roles); structural assertion that `buildRxPayload`/PDF/SMS never reference `subjective_section_hidden`; run verification gate. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| subj-32 | M | **Opus** | New migration file (hard rule) on a PHI-adjacent settings table; array JSONB + validation. Config value, but the migration forces Opus. |
| subj-33 | S–M | Auto | Pure, well-bounded lib mirroring `subjective-section-order.ts` + `subjective-section-collapse.ts`; the only subtlety (mountable/static-only delta, drop custom blocks) is fully unit-testable. |
| subj-34 | M–L | Auto/Sonnet | Net-new UI surface (popover) but composed from shipped primitives + cloned autosave/hydration; bounded to the menu component + `SubjectiveSection` + the mount hook. Sonnet if the popover/a11y plumbing gets fiddly. |
| subj-35 | S–M | Auto/Sonnet | Tests + a11y + verification; no output-parity fixture risk (view-only by construction), so no Opus gate needed. |

**Caps check:** 1 Opus in Phase 10 (subj-32, the migration slice). ✓

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p10-subjective-section-visibility-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p10-subjective-section-visibility-batch.md`](../plan-p10-subjective-section-visibility-batch.md).
- Tasks: [`task-subj-32-…`](./task-subj-32-doctor-settings-hidden-set.md) · [`task-subj-33-…`](./task-subj-33-visibility-resolver-and-autosave.md) · [`task-subj-34-…`](./task-subj-34-section-manager-menu.md) · [`task-subj-35-…`](./task-subj-35-integration-and-verification.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-18. **Status:** ✅ Done (subj-32..35).
