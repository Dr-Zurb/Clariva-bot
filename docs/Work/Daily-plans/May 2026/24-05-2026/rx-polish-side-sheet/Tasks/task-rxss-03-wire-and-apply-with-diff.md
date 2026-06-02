# rxss-03 · Wire + Apply with diff

> **Wave 3** of [rx-polish-side-sheet](../plan-rx-polish-side-sheet-batch.md). Production wire-up + diff logic.

| **Size** | S-M | **Model** | Auto | **Wave** | 3 | **Depends on** | rxss-02 | **Blocks** | rxss-04 |

---

## What to do

### 1. Diff helper `frontend/lib/cockpit/rx-diff.ts`

```ts
import type { MedicineRowValue } from "@/components/consultation/MedicineRow";
import type { PrescriptionMedicine } from "@/types/prescription";

export interface MedicineDiffRow {
  status: "added" | "removed" | "unchanged";
  value: MedicineRowValue;
  /** Source — "current" or "prior" — useful for the diff preview UI. */
  source: "current" | "prior";
}

/**
 * Convert a PrescriptionMedicine (DB shape) to MedicineRowValue (form shape).
 */
export function medicineToRowValue(m: PrescriptionMedicine): MedicineRowValue {
  return {
    medicineName: m.medicine_name ?? "",
    dosage: m.dosage ?? "",
    route: m.route ?? "",
    frequency: m.frequency ?? "",
    duration: m.duration ?? "",
    instructions: m.instructions ?? "",
    drugMasterId: m.drug_master_id ?? null,
    frequencyCode: m.frequency_code ?? null,
    durationValue: m.duration_value ?? null,
    durationUnit: m.duration_unit ?? null,
    routeCode: m.route_code ?? null,
  };
}

/**
 * Compute the result of applying `priorMeds` to `currentMeds` in the given mode.
 * - "append": result = currentMeds + priorMeds (de-duped by drug name + dosage)
 * - "replace": result = priorMeds (current discarded)
 */
export function applyMode(
  currentMeds: MedicineRowValue[],
  priorMeds: MedicineRowValue[],
  mode: "append" | "replace",
): MedicineRowValue[] {
  if (mode === "replace") return priorMeds.slice();
  const seenKey = (m: MedicineRowValue) =>
    `${m.medicineName.toLowerCase().trim()}|${m.dosage.toLowerCase().trim()}`;
  const seen = new Set(currentMeds.map(seenKey));
  const additions = priorMeds.filter((m) => !seen.has(seenKey(m)));
  return [...currentMeds, ...additions];
}

/** Per-row diff for the preview UI. */
export function diffMedicines(
  currentMeds: MedicineRowValue[],
  finalMeds: MedicineRowValue[],
): MedicineDiffRow[] {
  const finalKeys = new Set(finalMeds.map((m) => `${m.medicineName}|${m.dosage}`));
  const currentKeys = new Set(currentMeds.map((m) => `${m.medicineName}|${m.dosage}`));

  const rows: MedicineDiffRow[] = [];
  for (const m of finalMeds) {
    const k = `${m.medicineName}|${m.dosage}`;
    rows.push({
      status: currentKeys.has(k) ? "unchanged" : "added",
      value: m,
      source: currentKeys.has(k) ? "current" : "prior",
    });
  }
  // For "replace" mode, current-not-in-final means "removed":
  for (const m of currentMeds) {
    const k = `${m.medicineName}|${m.dosage}`;
    if (!finalKeys.has(k)) rows.push({ status: "removed", value: m, source: "current" });
  }
  return rows;
}
```

Tests in `frontend/lib/cockpit/__tests__/rx-diff.test.ts` covering append (de-dup), replace, diff rows.

### 2. Apply confirm UI inside `<PreviousRxSideSheet>`

When the doctor clicks `[Apply]` on a prior Rx row, show an in-sheet overlay (not a new sheet):

```tsx
function ApplyPreview({ priorRx, current, onCancel, onConfirm }: {...}) {
  const [mode, setMode] = useState<"append" | "replace">("append");
  const priorMeds = priorRx.medicines.map(medicineToRowValue);
  const final = applyMode(current, priorMeds, mode);
  const rows = diffMedicines(current, final);
  return (
    <div className="...">
      <ToggleGroup value={mode} onChange={setMode}>
        <ToggleItem value="append">Append</ToggleItem>
        <ToggleItem value="replace">Replace</ToggleItem>
      </ToggleGroup>
      {rows.map(/* render with color-coding: added=green, removed=red strikethrough, unchanged=neutral */)}
      <Button onClick={() => onConfirm(final)}>Confirm Apply</Button>
      <Button variant="ghost" onClick={onCancel}>Cancel</Button>
    </div>
  );
}
```

### 3. Apply confirm handler in parent (e.g. `RxWorkspace`)

```ts
function handleApplyPriorRx(priorRx: PrescriptionWithRelations) {
  // Pop the ApplyPreview overlay — when the doctor confirms:
  // (inside the preview):
  const onConfirm = (final: MedicineRowValue[]) => {
    setMedicines(final);
    setField("fromPrescriptionId", priorRx.id);
    trackCockpitV2RRxPolishSideSheetApplied({
      priorRxId: priorRx.id,
      mode, // "append" | "replace"
      medicineCount: final.length,
    });
    sideSheet.close("previous-rx");
  };
}
```

### 4. Swap the popover trigger for side-sheet open

Find the existing trigger:

```powershell
# rg "PreviousRxPopover" frontend/components/consultation/cockpit
```

Likely in `RxWorkspace.tsx` or `PrescriptionForm.tsx` cockpit branch. Replace the `<PreviousRxPopover>` render with a button:

```tsx
<button
  onClick={() => sideSheet.open("previous-rx")}
  className="..."
>
  Previous Rx ({priorRxCount})
</button>
```

Keep `<PreviousRxPopover>` import for the appointment-detail / in-call / post-call mounts (DL-1 — these stay unchanged).

### 5. `RxFormContext` `fromPrescriptionId`

Check if `fromPrescriptionId` field already exists on `RxFormContext`. If yes, just call `setField('fromPrescriptionId', ...)`. If not, add it as a new field per the existing pattern. Backend should already accept it (legacy carry-over field).

### 6. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test
```

---

## Acceptance gate

- [x] Diff helper + tests pass.
- [x] Apply preview overlay works in-sheet.
- [x] Append vs Replace toggle works.
- [x] Confirm writes medicines + `fromPrescriptionId`.
- [x] Cockpit Plan-zone trigger opens side sheet (not popover).
- [x] Non-cockpit mounts still use popover (DL-1).

---

## Anti-goals

- ❌ Don't make Append/Replace selection persistent across opens.
- ❌ Don't add field-level diff inside individual medicines (e.g. "dosage changed from 250mg to 500mg") in v1 — capture-inbox.
- ❌ Don't preserve the doctor's order vs prior Rx's order in Replace — DL specifies prior wins fully.
