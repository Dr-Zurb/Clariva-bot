# Subjective tab — Phase 9: collapse persistence — execution order

> Sibling of [`plan-p9-subjective-collapse-persistence-batch.md`](../plan-p9-subjective-collapse-persistence-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** `subj-28` lands the `doctor_settings.subjective_section_collapsed` column + API (storage/transport) and runs first — **Opus**, because it adds a migration. `subj-29` is the pure resolver/autosave lib (merge stored over defaults; serialise only explicit overrides) and depends only on subj-28's shape. `subj-30` wires `SubjectiveSection`'s top-level containers to controlled collapse + persistence using subj-29's lib. `subj-31` proves the fix (collapse survives remount), runs the a11y sweep, and closes the verification gate. Strictly linear — each slice consumes the previous.

---

## Wave plan (4 waves, linear)

```
Wave 1 (storage + transport — ~2–3h):
  subj-28 (doctor_settings.subjective_section_collapsed JSONB object
           + type + Zod (object: id→bool, drop unknown) + service + API + FE client)
           [Opus — new migration 147]
        │
        ▼
Wave 2 (resolver — ~2–3h):
  subj-29 (subjective-section-collapse.ts: resolve open-state from
           stored ∪ defaults; save helper omits default-equal keys +
           drops custom_block:* ; unit tests)
        │
        ▼
Wave 3 (wire — ~2–3h):
  subj-30 (SubjectiveSection: controlled open/onOpenChange per top-level
           section, hydrate from stored map, debounced autosave;
           surface map at cockpit mount)
        │
        ▼
Wave 4 (prove + gate — ~1–2h):
  subj-31 (remount-survival integration test (tab toggle + patient reopen),
           a11y sweep, output-parity assertion (structural), verification gate)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **subj-28** | M | **Opus** | `146_doctor_settings_subjective_section_order.sql` + `145`; `doctor-settings-service.ts` (SELECT list, `normalize…`, `allowedKeys`, accessors); `doctor-settings.ts` types (both sides); `validation.ts` (`subjectiveSectionOrderSchema`); settings controller/route; FE doctor-settings api client | Migration `147_doctor_settings_subjective_section_collapsed.sql` (`JSONB DEFAULT '{}'`, `jsonb_typeof='object'` CHECK); `subjectiveSectionCollapsed` on types both sides; Zod = record of `string → boolean` (drop unknown keys, coerce/skip non-boolean, cap size); service read + upsert; GET in payload + PATCH allowed key; FE client get/set. Object-valued clone of subj-24. |
| W2.0 | subj-29 | S–M | Auto | subj-28 transport shape; `subjective-section-order.ts` (`SubjectiveSectionId`, `isCustomBlockSectionId`, `saveSubjectiveSectionOrder` autosave shape); the current `defaultOpen` values in `SubjectiveSection.tsx` + the content-aware `hasXContent` predicates | `frontend/lib/cockpit/subjective-section-collapse.ts`: `resolveSectionOpenState(stored, defaultsById)` (explicit key wins; absent ⇒ default); `collapseOverridesToPersist(current, defaultsById)` (omit keys equal to default; drop `custom_block:*`); `saveSubjectiveSectionCollapsed(token, map)`. Pure + unit-tested. |
| W3.0 | subj-30 | M | Auto | subj-29 lib; `SubjectiveSection.tsx` (render loop, layout-autosave effect, `storedSectionOrder` hydration); `CollapsibleContainer.tsx` (`open`/`onOpenChange`); `useRxFormProviderSetup.ts` (surface stored map next to `subjectiveSectionOrder`) | Lift per-section open state into `SubjectiveSection` (`Record<SubjectiveSectionId, boolean>`); pass controlled `open`/`onOpenChange` into each top-level container; seed from `resolveSectionOpenState` on mount; debounce-autosave overrides (mirror the Phase-8 layout autosave). Content-aware defaults computed from current visit fields feed `defaultsById`. |
| W4.0 | **subj-31** | S–M | Auto/Sonnet | subj-30 wiring; existing `SubjectiveSection.*.test.tsx` (remount/a11y patterns); `buildRxPayload` (assert no collapse read) | Integration test: collapse choices survive an unmount/remount (tab toggle) and a fresh mount with the stored map (patient reopen); a11y sweep (aria-expanded, keyboard toggle, `disabled` mode); structural assertion that `buildRxPayload` / PDF path never reference collapse; run verification gate. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| subj-28 | M | **Opus** | New migration file (hard rule) on a PHI-adjacent settings table; object-valued JSONB + validation. Even though the value is config, the migration forces Opus. |
| subj-29 | S–M | Auto | Pure, well-bounded lib mirroring `subjective-section-order.ts`; the only subtlety (omit default-equal keys, drop custom blocks) is fully unit-testable. |
| subj-30 | M | Auto | Controlled-mode wiring over an existing primitive + a clone of the shipped layout-autosave effect; bounded to `SubjectiveSection` + the mount hook. |
| subj-31 | S–M | Auto/Sonnet | Tests + a11y + verification; no output-parity fixture risk (UI-only by construction), so no Opus gate needed. |

**Caps check:** 1 Opus in Phase 9 (subj-28, the migration slice). ✓

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p9-subjective-collapse-persistence-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p9-subjective-collapse-persistence-batch.md`](../plan-p9-subjective-collapse-persistence-batch.md).
- Tasks: [`task-subj-28-…`](./task-subj-28-doctor-settings-collapse-map.md) · [`task-subj-29-…`](./task-subj-29-collapse-resolver-and-autosave.md) · [`task-subj-30-…`](./task-subj-30-wire-controlled-collapse.md) · [`task-subj-31-…`](./task-subj-31-integration-and-verification.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-18. **Status:** ✅ `Done` (2026-06-18).
