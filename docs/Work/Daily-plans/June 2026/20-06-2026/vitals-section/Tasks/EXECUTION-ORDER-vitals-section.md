# Vitals 3.0 — execution order

> Sibling of [`../plan-vitals-section-batch.md`](../plan-vitals-section-batch.md). Plan = what + why; this = who-runs-what-when + model + the migration/Opus boundary.
>
> **Cost-aware model strategy:** [`../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md`](../../../../process/AGENT-EXECUTION-EFFICIENCY-GUIDE.md)

> **Shape.** `vit-01` freezes the **catalog + storage-agnostic registry** — the substrate everything reads. `vit-02` is the **one migration** (additive `vitals_json` + `vitals_hidden`) → a **hard STOP / Opus**. `vit-03` plumbs the contract + **derived-text byte-parity** (Opus-grade). `vit-04` wires form-state/payload. With the data layer frozen, VP2 (render), VP3 (hide/unhide), VP4 (trends) are independent frontend branches that can interleave; `vit-13` closes the view-only / a11y / parity gate. Two Opus tasks total: `vit-02` (migration) and `vit-13` (close-gate); `vit-03` runs with Opus-grade care under the migration gate.

---

## Wave plan

```
Wave 1 — catalog freeze:
  vit-01 (storage-agnostic registry + full catalog; pure module, no UI/storage)
        │
        ▼
Wave 2 — ⚠️ MIGRATION (STOP / Opus):
  vit-02 (prescriptions.vitals_json + doctor_settings.vitals_hidden; additive, reversible)
        │
        ▼
Wave 3 — contract + parity (Opus-grade):
  vit-03 (types + Zod + service read/write + derived-text mirror byte-parity)
        │
        ▼
Wave 4 — payload wiring:
  vit-04 (RxFormFields + buildRxPayload + load/serialize for json vitals)
        │
        ├───────────────┬───────────────┐
        ▼               ▼               ▼
Wave 5 (render)    Wave 6 (hide)    Wave 7 (trends)     ← branches; interleavable
  vit-05, vit-06     vit-07            vit-10
                     vit-08            vit-11
                     vit-09            vit-12
        └───────────────┴───────────────┘
                        ▼
Wave 8 — close-gate (Opus):
  vit-13 (byte-parity + visibility round-trip + a11y + sparse + verification)
```

> Single-threaded order: **vit-01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12 → 13**. VP2/VP3/VP4 only *optionally* parallel once `vit-04` lands (they all read the frozen registry + form-state but touch different components).

---

## Wave-by-wave

| Step | Task | Model | Pre-load | Notes |
|---|---|---|---|---|
| W1 | **vit-01** | Sonnet | `frontend/lib/cockpit/vitals-schema.ts` (registry to extend), `vitals-derive.ts` | Add `group` + `storage` to `VitalDefinition`; define every new vital. Pure data — no UI, no storage. Freezes the catalog. |
| W2 | **vit-02** | **Opus / STOP** | `backend/migrations/152_doctor_settings_objective_layout.sql` (clone target), `153/154` (json-column precedent), `.cursor/rules/migrations.mdc`, `MIGRATIONS_AND_CHANGE.md` | **Confirm approach before writing SQL.** Additive `prescriptions.vitals_json` (object CHECK) + `doctor_settings.vitals_hidden` (array CHECK). No RLS change (both tables already covered). Reversible (documented rollback). |
| W3 | **vit-03** | **Opus-grade** | `backend/src/types/prescription.ts`, `backend/src/services/prescription-service.ts`, `backend/src/utils/validation.ts`, the P5 `test_results_json` derive/validate path | Types + Zod (registry-driven bounds) + service read/write + **derived-text mirror**. Gate: shipped-column rows derive byte-identically; json vitals additive. |
| W4 | **vit-04** | Sonnet | `frontend/components/cockpit/rx/RxFormContext.tsx` (`buildRxPayload`, `RxFormFields`), `frontend/types/prescription.ts` | Thread json vitals through form-state + payload + load/serialize; canonical-unit discipline (P2-D2); round-trip stable. |
| W5 | **vit-05** | Sonnet | `VitalsGrid.tsx`, `VitalsExtended.tsx`, `vitals-schema.ts` | Registry-driven **grouped** numeric grid; reuse `VitalField`. No hardcoded list. |
| W5 | **vit-06** | Sonnet | obj-07 posture/limb selects in `VitalsExtended.tsx` | Categorical/context selects + GCS E/V/M auto-sum. |
| W6 | **vit-07** | Sonnet | `frontend/lib/cockpit/objective-section-visibility.ts` (clone), migration 152 transport | Pure `resolveVisibleVitals` (core-on default) + `vitals_hidden` load/save. No specialty input (V3-D3). |
| W6 | **vit-08** | Sonnet | `ManageObjectiveSectionsMenu.tsx` (clone) | Grouped hide/unhide menu, **no locks**, has-data hint, hide-with-data warning. |
| W6 | **vit-09** | Sonnet | the obj per-visit override pattern in `ObjectiveSection.tsx` | ✅ Ephemeral "+ Add vital" working override; never mutates saved default. |
| W7 | **vit-10** | Sonnet | `frontend/lib/cockpit/vitals-trends.ts` | ✅ Storage-aware series read (column *or* `vitals_json`) for all numeric vitals. |
| W7 | **vit-11** | Sonnet | `VitalSparkline.tsx`, `TrendChart.tsx`, `components/ui/popover` | ✅ Clickable sparkline → per-vital chart popover + registry reference band. |
| W7 | **vit-12** | Sonnet | `CollapsibleContainer`, `TrendChart.tsx` | ✅ "Vital trends" overview (≥1 reading only) + categorical value-timeline. |
| W8 | **vit-13** | **Opus** | `objectiveLayoutParity.test.tsx`, `objectiveTrendsParity.test.tsx` (fixture shapes), `buildRxPayload` | Byte-parity + visibility round-trip + a11y + sparse + verification gate. |

---

## Per-task model picks

| Task | Model | Why |
|---|---|---|
| vit-01 | Sonnet | Pure registry data; bounded; no schema/server. |
| **vit-02** | **Opus** | New `prescriptions` column = hard-rules STOP; migration + CHECK + reversibility must not be guessed. |
| vit-03 | **Opus-grade** | Derived-text byte-parity + contract across BE/FE — the parity-risk surface; runs under the migration gate. |
| vit-04 | Sonnet | Form-state/payload wiring over a frozen contract; byte-parity asserted, low blast radius. |
| vit-05, vit-06 | Sonnet | Registry-driven render; client only. |
| vit-07, vit-08, vit-09 | Sonnet | Clone the shipped objective visibility engine one level deeper; UX-only, no payload impact. |
| vit-10, vit-11, vit-12 | Sonnet | Read-only `recharts` over a frozen series; reuse existing chart shell. |
| **vit-13** | **Opus** | View-only byte-parity fixtures + a11y + sparse states — mirrors obj-15/obj-29. |

**Caps check:** ≤1 Opus per wave ✓. **Program Opus count = 2** (`vit-02` migration, `vit-13` close-gate); `vit-03` is Opus-grade care folded under VP1's migration gate.

---

## Acceptance gate

See the [batch plan's cross-cutting gate](../plan-vitals-section-batch.md#cross-cutting-acceptance-gate-whole-program).

---

## References

- Batch plan: [`../plan-vitals-section-batch.md`](../plan-vitals-section-batch.md) · Program README: [`../README.md`](../README.md).
- Tasks: [`task-vit-01-…`](./task-vit-01-storage-agnostic-vitals-registry.md) … [`task-vit-13-…`](./task-vit-13-vitals-close-gate.md).
- Pattern precedents: objective-tab P3 layout engines + P6 trends — [`../../../18-06-2026/objective-tab/`](../../../18-06-2026/objective-tab/).
- Process: [`../../../../process/EXECUTION-ORDER-GUIDELINES.md`](../../../../process/EXECUTION-ORDER-GUIDELINES.md) · [`../../../../process/CODE_CHANGE_RULES.md`](../../../../process/CODE_CHANGE_RULES.md).

---

**Created:** 2026-06-20. **Status:** 🗒 `Drafted`.
