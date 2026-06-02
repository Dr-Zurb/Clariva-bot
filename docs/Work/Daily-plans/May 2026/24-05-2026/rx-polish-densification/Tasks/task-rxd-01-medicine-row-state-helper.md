# rxd-01 · medicine-row-state helper

> **Wave 1** of [rx-polish-densification](../plan-rx-polish-densification-batch.md). Pure helper + truth-table tests; unblocks the two-state row rendering in rxd-02.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | XS (~30 LOC helper + ~90 LOC tests) |
| **Model** | Auto |
| **Wave** | 1 |
| **Depends on** | — |
| **Blocks** | rxd-02 |

---

## Goal

Single pure function deciding whether a `MedicineRowValue` is "complete + valid" enough to collapse into summary mode. Centralised so rxd-02 (component), rxd-03 (parent), and any future telemetry / validation reuse the same definition.

---

## What to do

### 1. Create `frontend/lib/cockpit/medicine-row-state.ts`

```ts
import type { MedicineRowValue } from "@/components/consultation/MedicineRow";

/**
 * Whether a medicine row is "complete + valid" — the gate for collapsing
 * from editor-mode to summary-mode (rxd-02 / R-RX-POLISH/2.1).
 *
 * Rules (DL-1 of rx-polish-densification):
 *  - drug name non-empty (trimmed)
 *  - dosage non-empty (trimmed)
 *  - frequency present (structured `frequencyCode` OR legacy text `frequency`)
 *  - duration present (structured `durationValue` + `durationUnit` OR legacy text `duration`)
 *  - route + instructions are OPTIONAL — a row can be complete without them
 *  - `drugMasterId` is OPTIONAL — free-text drug names are valid
 */
export function isMedicineRowComplete(value: MedicineRowValue): boolean {
  if (!value.medicineName.trim()) return false;
  if (!value.dosage.trim()) return false;

  const hasFrequency =
    value.frequencyCode !== null || value.frequency.trim().length > 0;
  if (!hasFrequency) return false;

  const hasStructuredDuration =
    value.durationValue !== null && value.durationUnit !== null;
  const hasLegacyDuration = value.duration.trim().length > 0;
  if (!hasStructuredDuration && !hasLegacyDuration) return false;

  return true;
}
```

### 2. Create `frontend/lib/cockpit/__tests__/medicine-row-state.test.ts`

Cover at least these cases (one `it()` per row):

| Case | Expected |
|---|---|
| Empty value (all fields empty/null) | `false` |
| Only `medicineName` set | `false` |
| `medicineName` + `dosage` only | `false` |
| `medicineName` + `dosage` + `frequencyCode` (no duration) | `false` |
| `medicineName` + `dosage` + `frequencyCode` + structured duration | `true` |
| `medicineName` + `dosage` + legacy text `frequency` + legacy `duration` | `true` |
| Complete with `route` + `instructions` empty | `true` (route/instructions optional) |
| Complete with `drugMasterId` null but free-text drug name | `true` |
| Whitespace-only fields treated as empty | `false` |
| `durationValue` set but `durationUnit` null | falls back to legacy text — `false` if legacy `duration` also empty |
| Both structured + legacy present (doctor used both pickers) | `true` |

Use the standard project test scaffolding (Vitest + the existing test layout). Don't import React; this helper is pure.

### 3. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test lib/cockpit/__tests__/medicine-row-state.test.ts
```

---

## Acceptance gate

- [ ] `isMedicineRowComplete` exported.
- [ ] All truth-table cases pass.
- [ ] tsc + lint clean.

---

## Anti-goals

- ❌ Don't add React imports. Pure helper.
- ❌ Don't validate `drugMasterId` non-null — DL-1 explicitly allows free-text.
- ❌ Don't expand validation to include route or instructions — DL-1 keeps them optional.
- ❌ Don't return error reasons / messages — boolean only. Phase 4 can add a richer `{ valid, reasons }` shape if needed; capture-inbox.

---

## Notes

- The `MedicineRowValue` type is already exported from `MedicineRow.tsx` — re-import it to keep one source of truth.
- This helper is intentionally lean — adding more rules (e.g. drug-master-id required for safety checks) would belong in a separate `isMedicineRowSafe` function in `rx-polish-favorites` or beyond; don't entangle here.
