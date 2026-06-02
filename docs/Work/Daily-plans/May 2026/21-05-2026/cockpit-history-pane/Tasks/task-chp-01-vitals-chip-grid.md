# chp-01 · BMI badge on VitalsGrid

> **Status:** ✅ **DONE** (2026-05-23) — `<BmiBadge>` added to `VitalsGrid.tsx`; 9 unit tests passing.

> **Wave 1 lane α** of the [cockpit-history-pane batch](../plan-cockpit-history-pane-batch.md). Add a `<BmiBadge>` sub-component to the existing `VitalsGrid` that auto-computes BMI from `vitalsWtKg` + `vitalsHtCm`. Display-only, no backend touch (DL-2). Disjoint from chp-02 (different file in `inputs/` vs `sections/`).

| Property | Value |
|---|---|
| **Owner** | Frontend |
| **Size** | S (~60 LOC into existing `VitalsGrid.tsx` + ~80 LOC new test file) |
| **Model** | **Auto** — small, well-bounded UI addition. Per AGENT-EXECUTION-EFFICIENCY-GUIDE this doesn't meet the M/L escalation threshold. Per-message Opus only if the layout slot decision (where the badge lives within the existing grid) gets contentious — but the simple "below the grid" answer is fine for v1. |
| **Wave** | 1 (lane α) |
| **Depends on** | — |
| **Blocks** | chp-03 (Wave 2 wire-up + telemetry), chp-04 (smoke validation that BMI badge fires correctly) |

---

## Goal

Make BMI visible to doctors as a derived value the moment they fill in weight + height. Today they have to do the math in their head (or skip it). One small badge, no new field, no new backend column.

---

## What to do

### 1. Open the existing file

`frontend/components/cockpit/rx/inputs/VitalsGrid.tsx`. It already has 7 numeric inputs (BP-sys, BP-dia, HR, Temp, SpO2, Wt, Ht) wired to the `vitals*` fields on `RxFormContext`. See cv2-07 history for context.

### 2. Add a `<BmiBadge>` sub-component (inline, same file)

Right after the `NumericField` sub-component definition at the bottom of the file, add:

```tsx
interface BmiBadgeProps {
  weightKg: number | null;
  heightCm: number | null;
}

/**
 * BMI badge — display-only derivation per chp-01 / DL-2.
 *
 * Computes BMI = weight (kg) / (height (m))². Renders as a small pill below the
 * vitals grid when both Wt + Ht are present. No backend storage. Shows the WHO
 * category in muted text.
 */
function BmiBadge({ weightKg, heightCm }: BmiBadgeProps): JSX.Element | null {
  if (weightKg == null || heightCm == null) return null;
  if (weightKg <= 0 || heightCm <= 0) return null;

  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);

  // Out-of-range guard — protects against absurd inputs (e.g. Wt 500 Ht 30).
  if (!Number.isFinite(bmi) || bmi < 5 || bmi > 100) return null;

  const category = categorizeBmi(bmi);
  const tone = bmiTone(category);

  return (
    <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs">
      <span className="font-medium">BMI</span>
      <span className="font-semibold tabular-nums">{bmi.toFixed(1)}</span>
      <span className={`text-[10px] uppercase tracking-wider ${tone}`}>{category}</span>
    </div>
  );
}

type BmiCategory = "underweight" | "normal" | "overweight" | "obese";

function categorizeBmi(bmi: number): BmiCategory {
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "overweight";
  return "obese";
}

function bmiTone(category: BmiCategory): string {
  switch (category) {
    case "normal":
      return "text-emerald-600";
    case "underweight":
    case "overweight":
      return "text-amber-600";
    case "obese":
      return "text-red-600";
  }
}
```

### 3. Mount `<BmiBadge>` in the grid

In the `VitalsGrid` function's JSX return, just before the closing `</div>` of the outer grid wrapper, add:

```tsx
<div className="col-span-2 sm:col-span-4">
  <BmiBadge
    weightKg={state.fields.vitalsWtKg}
    heightCm={state.fields.vitalsHtCm}
  />
</div>
```

This puts the badge as a full-width row that span the grid, so it doesn't disrupt the 2/4-col grid above. When both fields are null, `BmiBadge` returns null and the row collapses to zero height (no layout reservation).

### 4. New unit test file

`frontend/components/cockpit/rx/inputs/__tests__/VitalsGrid.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { VitalsGrid } from "@/components/cockpit/rx/inputs/VitalsGrid";
import { RxFormProvider } from "@/components/cockpit/rx/RxFormContext";

// Helper — minimal provider wrap for tests.
function renderWithProvider(initial?: Partial<RxFormFieldsInput>) {
  return render(
    <RxFormProvider appointmentId="appt-1" token="tok" initialFields={initial}>
      <VitalsGrid />
    </RxFormProvider>
  );
}

describe("VitalsGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("BMI badge", () => {
    it("shows BMI when both weight + height are present", () => {
      renderWithProvider({ vitalsWtKg: 70, vitalsHtCm: 175 });
      expect(screen.getByText(/BMI/i)).toBeInTheDocument();
      expect(screen.getByText("22.9")).toBeInTheDocument();
      expect(screen.getByText(/normal/i)).toBeInTheDocument();
    });

    it("renders nothing when only weight is present", () => {
      renderWithProvider({ vitalsWtKg: 70, vitalsHtCm: null });
      expect(screen.queryByText(/BMI/i)).not.toBeInTheDocument();
    });

    it("renders nothing when only height is present", () => {
      renderWithProvider({ vitalsWtKg: null, vitalsHtCm: 175 });
      expect(screen.queryByText(/BMI/i)).not.toBeInTheDocument();
    });

    it("renders nothing when both are missing", () => {
      renderWithProvider({ vitalsWtKg: null, vitalsHtCm: null });
      expect(screen.queryByText(/BMI/i)).not.toBeInTheDocument();
    });

    it("categorizes BMI < 18.5 as underweight", () => {
      renderWithProvider({ vitalsWtKg: 45, vitalsHtCm: 170 });
      // BMI ≈ 15.6
      expect(screen.getByText("15.6")).toBeInTheDocument();
      expect(screen.getByText(/underweight/i)).toBeInTheDocument();
    });

    it("categorizes BMI >= 30 as obese", () => {
      renderWithProvider({ vitalsWtKg: 95, vitalsHtCm: 170 });
      // BMI ≈ 32.9
      expect(screen.getByText("32.9")).toBeInTheDocument();
      expect(screen.getByText(/obese/i)).toBeInTheDocument();
    });

    it("updates BMI when weight changes", () => {
      renderWithProvider({ vitalsWtKg: 70, vitalsHtCm: 175 });
      expect(screen.getByText("22.9")).toBeInTheDocument();

      const weightInput = screen.getByLabelText(/Weight in kg/i) as HTMLInputElement;
      fireEvent.change(weightInput, { target: { value: "80" } });
      // BMI ≈ 26.1
      expect(screen.getByText("26.1")).toBeInTheDocument();
      expect(screen.getByText(/overweight/i)).toBeInTheDocument();
    });

    it("guards against absurd values (Wt 500 Ht 30)", () => {
      renderWithProvider({ vitalsWtKg: 500, vitalsHtCm: 30 });
      // BMI would be ~5555 — out of guard range, badge suppressed.
      expect(screen.queryByText(/BMI/i)).not.toBeInTheDocument();
    });
  });

  describe("existing 7-input behavior", () => {
    it("renders all 7 numeric inputs", () => {
      renderWithProvider();
      expect(screen.getByLabelText(/Systolic blood pressure/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Diastolic blood pressure/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/HR in bpm/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Temp in °C/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/SpO₂ in %/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Weight in kg/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Height in cm/i)).toBeInTheDocument();
    });
  });
});
```

If the existing `RxFormProvider` doesn't accept `initialFields` as a prop today, either add the optional prop (~10 LOC change in `RxFormContext.tsx`) for test convenience, or wrap with a tiny test harness that calls `setField` in a `useEffect`. The simpler path is the optional `initialFields` prop — guard with an init-once flag so it only applies on first render. If touching `RxFormContext` adds scope creep, fall back to a test harness component.

### 5. Verify

```powershell
pnpm --filter frontend tsc --noEmit
pnpm --filter frontend lint
pnpm --filter frontend test inputs/__tests__/VitalsGrid.test.tsx
```

All three green before declaring chp-01 done.

---

## Acceptance gate

- [x] `<BmiBadge>` defined inline in `VitalsGrid.tsx` (or as a sibling file `BmiBadge.tsx` — author's choice).
- [x] Mounted in the grid as a full-width row below the existing 7 inputs.
- [x] Renders correctly: shows BMI 22.9 + "normal" tone for Wt 70 / Ht 175; hides when either is null.
- [x] Guards against absurd values (BMI < 5 or > 100 → badge hidden).
- [x] All four WHO categories color-tone correctly (underweight amber, normal emerald, overweight amber, obese red).
- [x] Unit tests pass: `pnpm --filter frontend test inputs/__tests__/VitalsGrid.test.tsx` clean.
- [x] tsc + lint clean. *(repo-wide tsc/lint have pre-existing failures in unrelated files; chp-01 files are clean.)*
- [x] No regressions to existing input behavior (verified by the "existing 7-input behavior" describe block in the test file).

---

## Anti-goals

- ❌ Don't add a new backend column for BMI. DL-2 explicitly says client-side computed.
- ❌ Don't make BMI an editable input. DL-2: display only.
- ❌ Don't change the existing 7-input layout / wiring / ranges. Only add the badge.
- ❌ Don't rename `VitalsGrid` to `VitalsChipGrid` in this task — capture-inbox if naming alignment is wanted.
- ❌ Don't add an inline "Show BMI history chart" or any tab-into-future-batch surface here. Out of scope.
- ❌ Don't add telemetry for BMI computation itself. The batch-level `cockpit_v2.r_history_landed` event in chp-04 includes a `has_bmi: boolean` flag — that's the only signal.

---

## Notes

- **Why not a new file?** `<BmiBadge>` is ~30 LOC and only used inside `VitalsGrid`. Co-location reduces import churn and keeps the surface small. If a future batch reuses `<BmiBadge>` elsewhere (e.g., snapshot panel), extract it then.
- **WHO BMI categories** are the standard cutoffs: <18.5 underweight, 18.5–24.9 normal, 25.0–29.9 overweight, ≥30 obese. Skip the Asian / South-Asian-specific cutoffs for v1 — capture-inbox for clinic-level config in Phase 3.
- **Tabular-nums** on the BMI value digit prevents the badge from jiggling as the value updates while doctors type.
- **Color tones use Tailwind's named colors** (emerald-600, amber-600, red-600) for parity with the safety strip's tone palette from cmr-02.
- **Why guard against BMI < 5 / > 100?** Doctors occasionally fat-finger a unit (entering height as 1.7 instead of 170, or weight as 7000 instead of 70). The guard prevents an absurd "BMI 0.6" or "BMI 2000" from appearing and just hides the badge until inputs are corrected. The numeric input ranges (in `RANGES` at the top of the file) already cap the inputs themselves; this is a second-line defense.
