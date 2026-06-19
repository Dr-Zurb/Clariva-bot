# Subjective tab — Phase 8: section reorder — execution order

> Sibling of [`plan-p8-subjective-section-reorder-batch.md`](../plan-p8-subjective-section-reorder-batch.md). Plan = what + why; this = who-runs-what-when + model.

**Cost-aware model strategy:** [AGENT-EXECUTION-EFFICIENCY-GUIDE.md](../../../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape:** `subj-23` does the parity-preserving refactor — turns the hardcoded section JSX into a registry + ordered render — and runs first. `subj-24` (doctor_settings order column + API) and `subj-25` (DnD chrome + local order state) both depend on subj-23's registry but touch disjoint surfaces — two parallel lanes. `subj-26` joins them (load default → merge → save-as-default). `subj-27` (whole-phase close-gate: cc/hopi + PDF/SMS byte-parity, a11y) runs last.

---

## Wave plan (4 waves)

```
Wave 1 (substrate + parity — ~3–4h):
  subj-23 (section registry [id→node] + ordered render in SubjectiveSection;
           default order = today's layout, byte-identical; no DnD/persist)

        │
        ├──────────────────────────────┐
        ▼                              ▼
Wave 2 (~2–3h)                  Wave 2 (~3–4h)
  subj-24 (doctor_settings         subj-25 (DnD reorder chrome:
   .subjective_section_order        left-grip sortable shell over all
   JSONB + Zod + service + API)     sections + keyboard + drop indicator)
   [Lane α]                         [Lane β]
        │                              │
        └──────────────┬───────────────┘
                       ▼
Wave 3 (~2–3h):
  subj-26 (load doctor default → merge with live registry →
           apply order; "save current order as my default")
                       │
                       ▼
Wave 4 (~2–4h):
  subj-27 (output parity + close-gate: cc/hopi byte-identical,
           PDF/SMS/snapshot unchanged, integration + a11y sweep)
```

---

## Wave-by-wave

| Step | Task | Size | Model | Pre-load | Notes |
|---|---|---|---|---|---|
| W1.0 | **subj-23** | M | Sonnet | `SubjectiveSection.tsx` (current hardcoded order + conditional linked/fallback sections); `HistoryFields.tsx`; `CollapsibleContainer.tsx` (`leadingActions`); `CustomSubsectionsField.tsx` (Phase-7 grip) | New `frontend/lib/cockpit/subjective-section-order.ts`: canonical section-id union + `DEFAULT_SECTION_ORDER` + `normalizeSectionOrder(stored, available)` merge helper. Refactor `SubjectiveSection` to build an id→node registry and render in resolved order; **default order reproduces today's layout byte-for-byte**. No DnD, no persistence. |
| W2.α | subj-24 | S | Auto/Sonnet | migration `145_doctor_settings_subjective_custom_subsections.sql` (clone target); `doctor-settings-service.ts`; `doctor-settings.ts` types; settings controller/route; `validation.ts` | Migration `146_doctor_settings_subjective_section_order.sql` (`JSONB DEFAULT '[]'`, `jsonb_typeof='array'` CHECK); `subjectiveSectionOrder` on the settings type; Zod = array of known section-id strings (dedupe, drop unknown); service get/upsert; GET (in settings payload) + PATCH; FE settings type + api client. |
| W2.β | subj-25 | M | Sonnet | subj-23 registry; `ComplaintList.tsx` + `complaint-drag.ts` (native DnD drop-intent); `CustomSubsectionsField.tsx` (`CustomSubsectionDragHandle` + keyboard reorder) | Shared `SortableSectionShell` (or per-section grip wrapper) rendering the left-edge grip via `leadingActions`; native HTML5 DnD (dragstart/dragover/drop + drop-intent + indicator line) reordering the registry's id list in local state; keyboard ArrowUp/ArrowDown on the focused grip; respects `disabled`; a11y. |
| W3.0 | subj-26 | S | Sonnet | subj-24 settings api; subj-25 reorder state; `useRxFormProviderSetup.ts` (or the cockpit mount point); `subjective-section-order.ts` merge helper | On mount, load the doctor's default order and `normalizeSectionOrder` it against the live registry (drop unknown, append new at canonical slot, filter conditional sections); apply as the initial order; "Save current section order as my default" → PATCH (24). |
| W4.0 | **subj-27** | M | **Opus** | subj-10/subj-22 close-gate fixtures; `prescription-pdf-composer.ts` + `PrescriptionDocument.tsx`; the SMS/snapshot text builders; the full Subjective tab | Assert `cc`/`hopi` derive byte-identically and PDF/SMS/snapshot section order is unchanged (output is UI-independent by design — this proves it); integration + a11y sweep (keyboard reorder, focus order, aria) across the tab. |

---

## Per-task model picks

| Task | Size | Model | Why |
|---|---|---|---|
| subj-23 | M | Sonnet | Parity-preserving refactor of a hand-built layout into a registry — correctness-sensitive (must not change default order or conditional mounting), but bounded and pattern-clear. |
| subj-24 | S | Auto/Sonnet | Additive `doctor_settings` column + API; near-verbatim clone of subj-21's `subjective_custom_subsections`. Lowest-risk slice. |
| subj-25 | M | Sonnet | Native DnD + keyboard reorder over the registry; bounded by the shipped ComplaintList + Phase-7 grip patterns. |
| subj-26 | S | Sonnet | Load + merge + save-as-default; the only subtlety is the registry-merge (never hide a section). |
| subj-27 | M | **Opus** | Whole-phase close-gate — byte-parity on `cc`/`hopi` + patient-facing PDF/SMS/snapshot + a11y sweep; highest blast radius (compliance + downstream artifacts). |

**Caps check:** 1 Opus in Phase 8 (subj-27, the close-gate slice). ✓

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-p8-subjective-section-reorder-batch.md#cross-cutting-acceptance-gate-whole-phase).

---

## References

- Batch plan: [`plan-p8-subjective-section-reorder-batch.md`](../plan-p8-subjective-section-reorder-batch.md).
- Tasks: [`task-subj-23-…`](./task-subj-23-section-registry-and-ordered-renderer.md) · [`task-subj-24-…`](./task-subj-24-doctor-settings-section-order.md) · [`task-subj-25-…`](./task-subj-25-drag-and-drop-reorder-chrome.md) · [`task-subj-26-…`](./task-subj-26-persist-and-seed-order.md) · [`task-subj-27-…`](./task-subj-27-output-parity-and-close-gate.md).
- Process: [`EXECUTION-ORDER-GUIDELINES.md`](../../../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`CODE_CHANGE_RULES.md`](../../../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-17. **Status:** ⏳ `Planned`.
