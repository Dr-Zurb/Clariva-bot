# cpv-03 · BMI badge in VitalsGrid

> **Status:** ✅ Done (2026-05-26). `computeBmi` in `lib/cockpit/bmi.ts`; `<BmiBadge>` inline on weight chip with WHO tooltip + category colors.

> **Wave 2 / Lane α** of [cockpit-polish-visual](../plan-cockpit-polish-visual-batch.md). Resolves issue #15 — VitalsGrid lacks BMI badge despite height + weight present.

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | S (~50 LOC delta + ~40 LOC tests) |
| **Model** | Auto |
| **Wave** | 2 |
| **Depends on** | — |
| **Blocks** | cpv-08 (close-out) |

---

## Goal

Compute BMI from `height_cm` + `weight_kg` in `<VitalsGrid>` and render a `<BmiBadge>` inline next to the weight chip (DL-3). Tooltip shows WHO classification + category color.

---

## What to do

### 1. Open `frontend/components/cockpit/rx/inputs/VitalsGrid.tsx`

Read the existing implementation. Identify the field names — likely `heightCm` + `weightKg` (or similar) via `useRxForm()`.

### 2. Add BMI helper

Create `frontend/lib/cockpit/bmi.ts` (~30 LOC):

```ts
export interface BmiResult {
  value: number; // rounded to 1 decimal
  category: "underweight" | "normal" | "overweight" | "obese";
  /** WHO classification label, e.g. "Normal (18.5–24.9)" */
  label: string;
}

/**
 * BMI = weight(kg) / (height(m))^2. Returns null when inputs missing or invalid.
 * Categories follow WHO adult classification.
 */
export function computeBmi(
  heightCm: number | null | undefined,
  weightKg: number | null | undefined,
): BmiResult | null {
  if (heightCm == null || weightKg == null) return null;
  if (heightCm <= 0 || weightKg <= 0) return null;
  const heightM = heightCm / 100;
  const value = Math.round((weightKg / (heightM * heightM)) * 10) / 10;
  if (!Number.isFinite(value)) return null;

  let category: BmiResult["category"];
  let label: string;
  if (value < 18.5) {
    category = "underweight";
    label = "Underweight (< 18.5)";
  } else if (value < 25) {
    category = "normal";
    label = "Normal (18.5–24.9)";
  } else if (value < 30) {
    category = "overweight";
    label = "Overweight (25–29.9)";
  } else {
    category = "obese";
    label = "Obese (≥ 30)";
  }

  return { value, category, label };
}
```

### 3. Add `<BmiBadge>` sub-component in `VitalsGrid.tsx` (or as a sibling file)

```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { BmiResult } from "@/lib/cockpit/bmi";

const categoryClass: Record<BmiResult["category"], string> = {
  underweight: "bg-blue-100 text-blue-800 border-blue-300",
  normal: "bg-green-100 text-green-800 border-green-300",
  overweight: "bg-amber-100 text-amber-800 border-amber-300",
  obese: "bg-red-100 text-red-800 border-red-300",
};

function BmiBadge({ bmi }: { bmi: BmiResult }): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={
            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium " +
            categoryClass[bmi.category]
          }
          aria-label={`BMI ${bmi.value} — ${bmi.label}`}
        >
          BMI {bmi.value}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>{bmi.label}</p>
      </TooltipContent>
    </Tooltip>
  );
}
```

(Color tokens — cpv-06 may refactor these to semantic tokens. For now use Tailwind palette directly; cpv-06 cleans up.)

### 4. Wire into `VitalsGrid`

Inside `<VitalsGrid>`, compute BMI and render the badge inline next to the weight chip:

```tsx
import { computeBmi } from "@/lib/cockpit/bmi";

// inside the component:
const heightCm = rxForm.fields.heightCm ?? null;
const weightKg = rxForm.fields.weightKg ?? null;
const bmi = computeBmi(heightCm, weightKg);

// in the JSX, next to the weight chip:
<div className="flex items-center gap-2">
  {/* existing weight input/chip */}
  {bmi ? <BmiBadge bmi={bmi} /> : null}
</div>
```

(Adjust the field-access path to match the actual `RxFormFields` shape.)

### 5. Tests

#### `frontend/lib/cockpit/__tests__/bmi.test.ts` (new, ~50 LOC)

```ts
import { describe, it, expect } from "vitest";
import { computeBmi } from "../bmi";

describe("computeBmi", () => {
  it("returns null when height missing", () => {
    expect(computeBmi(null, 65)).toBeNull();
  });

  it("returns null when weight missing", () => {
    expect(computeBmi(170, null)).toBeNull();
  });

  it("classifies underweight", () => {
    expect(computeBmi(170, 50)?.category).toBe("underweight");
  });

  it("classifies normal", () => {
    expect(computeBmi(170, 65)?.category).toBe("normal");
  });

  it("classifies overweight", () => {
    expect(computeBmi(170, 80)?.category).toBe("overweight");
  });

  it("classifies obese", () => {
    expect(computeBmi(170, 95)?.category).toBe("obese");
  });

  it("rounds to 1 decimal", () => {
    const result = computeBmi(175, 70);
    expect(result?.value).toBeCloseTo(22.9, 1);
  });

  it("returns null for zero/negative inputs", () => {
    expect(computeBmi(0, 65)).toBeNull();
    expect(computeBmi(170, -5)).toBeNull();
  });
});
```

#### Update `__tests__/VitalsGrid.test.tsx`

```tsx
describe("VitalsGrid BMI badge (cpv-03)", () => {
  it("renders BMI badge when both height and weight set", () => {
    renderWithProvider({ heightCm: 170, weightKg: 65 });
    expect(screen.getByText(/BMI 22\.5/)).toBeInTheDocument();
  });

  it("hides BMI badge when height missing", () => {
    renderWithProvider({ heightCm: null, weightKg: 65 });
    expect(screen.queryByText(/BMI/)).not.toBeInTheDocument();
  });

  it("hides BMI badge when weight missing", () => {
    renderWithProvider({ heightCm: 170, weightKg: null });
    expect(screen.queryByText(/BMI/)).not.toBeInTheDocument();
  });

  it("aria-label includes category", () => {
    renderWithProvider({ heightCm: 170, weightKg: 65 });
    expect(screen.getByLabelText(/normal/i)).toBeInTheDocument();
  });
});
```

### 6. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test lib/cockpit/__tests__/bmi.test.ts
pnpm --filter frontend test components/cockpit/rx/inputs/__tests__/VitalsGrid.test.tsx
```

---

## Acceptance gate

- [x] `computeBmi` helper exists with 4 categories + WHO labels.
- [x] `<BmiBadge>` renders inline next to the weight chip when both vitals set.
- [x] Badge color matches category (4 distinct colors).
- [x] Tooltip shows category label.
- [x] aria-label is descriptive.
- [x] Tests cover all categories + null cases.
- [x] tsc + lint clean.

---

## Anti-goals

- ❌ Don't add a BMI history / trend view — capture-inbox.
- ❌ Don't add pediatric BMI calculation — adult WHO classification only.
- ❌ Don't make the badge editable — it's derived, not input.
- ❌ Don't persist BMI to the DB — derived at render time only.

---

## Notes

- BMI is derived from existing height + weight fields; no schema change.
- WHO adult classification is the standard. Pediatric (BMI-for-age) is a separate flow; capture-inbox if pediatric patients dogfood reveals a need.
- The tooltip is a soft enhancement; the visible label + color carry the information for non-tooltip users.
- cpv-06 may later replace the `bg-blue-100` etc. tokens with semantic ones (`bg-info-subtle`); leave as-is here.
