/**
 * obj-08 close-gate — Vitals 2.0 binding contracts.
 *
 * Phase 2 is green only when these hold. This file is the acceptance owner;
 * it proves obj-05 (storage/mapping), obj-06 (converters/flags/derived), and
 * obj-07 (grid) correct rather than re-implementing them:
 *
 *   1. Canonical-storage unit round-trip with no drift beyond display precision (P2-D2).
 *   2. The shipped 7 vitals map through `buildRxPayload` value-identical (no regression, P2-D6).
 *   3. Range flags + MAP/BSA are deterministic and correct at band edges / age-sex variants (P2-D3).
 *   4. Edge inputs (out-of-range, partial, ghost present/absent) are deterministic and never throw.
 *   5. Grid a11y + canonical round-trip (load → reflect → edit → save) with read-only ghosts (P2-D5).
 *
 * Synthetic fixtures only — no PHI in logs/snapshots.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  buildRxPayload,
  createEmptyRxFormFields,
  rxFormFieldsFromPrescription,
  useRxForm,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { VitalsGrid } from "@/components/cockpit/rx/inputs/VitalsGrid";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  cToF,
  fToC,
  cmToIn,
  inToCm,
  kgToLb,
  lbToKg,
  mgDlToMmolL,
  mmolLToMgDl,
  computeMap,
  computeBsa,
  evaluateRange,
} from "@/lib/cockpit/vitals-derive";
import { getLastPrescriptionInEpisode } from "@/lib/api";
import type { PrescriptionWithRelations } from "@/types/prescription";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getLastPrescriptionInEpisode: vi
      .fn()
      .mockResolvedValue({ data: { prescription: null } }),
  };
});

const mockedGetLast = vi.mocked(getLastPrescriptionInEpisode);

// ---------------------------------------------------------------------------
// 1.2 — Shipped-7-vitals regression (pure buildRxPayload, no component).
// ---------------------------------------------------------------------------

describe("obj-08 close-gate · shipped 7-vitals payload parity (P2-D6)", () => {
  const SHIPPED_7 = {
    vitalsBpSystolic: 128,
    vitalsBpDiastolic: 82,
    vitalsHr: 76,
    vitalsTempC: 37.1,
    vitalsSpo2: 98,
    vitalsWtKg: 71.5,
    vitalsHtCm: 172,
  } as const;

  it("maps the shipped 7 vitals value-identical and leaves extended vitals null", () => {
    const fields = { ...createEmptyRxFormFields(), ...SHIPPED_7 };
    const payload = buildRxPayload(fields);

    // The shipped 7 are byte-identical to the input.
    expect(payload.vitalsBpSystolic).toBe(128);
    expect(payload.vitalsBpDiastolic).toBe(82);
    expect(payload.vitalsHr).toBe(76);
    expect(payload.vitalsTempC).toBe(37.1);
    expect(payload.vitalsSpo2).toBe(98);
    expect(payload.vitalsWtKg).toBe(71.5);
    expect(payload.vitalsHtCm).toBe(172);

    // Vitals 2.0 must not perturb the baseline: all extended map to null.
    expect(payload.vitalsRr).toBeNull();
    expect(payload.vitalsPainScore).toBeNull();
    expect(payload.vitalsGlucoseMgDl).toBeNull();
    expect(payload.vitalsGcsTotal).toBeNull();
    expect(payload.vitalsBpPosture).toBeNull();
    expect(payload.vitalsBpLimb).toBeNull();
    expect(payload.vitalsHeadCircumferenceCm).toBeNull();
    expect(payload.vitalsMuacCm).toBeNull();
    expect(payload.vitalsWaistCm).toBeNull();
  });

  it("save → reload → re-save is a stable fixed point for the shipped 7", () => {
    const first = buildRxPayload({ ...createEmptyRxFormFields(), ...SHIPPED_7 });
    const reloaded = {
      id: "rx-1",
      appointment_id: "appt-1",
      patient_id: "pat-1",
      doctor_id: "doc-1",
      type: "structured",
      vitals_bp_systolic: first.vitalsBpSystolic ?? null,
      vitals_bp_diastolic: first.vitalsBpDiastolic ?? null,
      vitals_hr: first.vitalsHr ?? null,
      vitals_temp_c: first.vitalsTempC ?? null,
      vitals_spo2: first.vitalsSpo2 ?? null,
      vitals_wt_kg: first.vitalsWtKg ?? null,
      vitals_ht_cm: first.vitalsHtCm ?? null,
    } as unknown as PrescriptionWithRelations;
    const second = buildRxPayload(rxFormFieldsFromPrescription(reloaded));

    expect(second.vitalsBpSystolic).toBe(first.vitalsBpSystolic);
    expect(second.vitalsTempC).toBe(first.vitalsTempC);
    expect(second.vitalsWtKg).toBe(first.vitalsWtKg);
  });
});

// ---------------------------------------------------------------------------
// 1.3 / 1.4 / 1.5 — Range flags, derived determinism, edge inputs (pure).
// ---------------------------------------------------------------------------

describe("obj-08 close-gate · range flags + derived determinism (P2-D3)", () => {
  it("flags adult HR at the 60/100 band edges", () => {
    const ctx = { ageYears: 30 };
    expect(evaluateRange("vitalsHr", 59, ctx)).toBe("low");
    expect(evaluateRange("vitalsHr", 60, ctx)).toBe("normal");
    expect(evaluateRange("vitalsHr", 100, ctx)).toBe("normal");
    expect(evaluateRange("vitalsHr", 101, ctx)).toBe("high");
  });

  it("uses age-variant RR bands (infant vs adult)", () => {
    expect(evaluateRange("vitalsRr", 40, { ageYears: 0.5 })).toBe("normal");
    expect(evaluateRange("vitalsRr", 40, { ageYears: 30 })).toBe("high");
  });

  it("uses sex-variant waist cutoffs", () => {
    expect(evaluateRange("vitalsWaistCm", 85, { sex: "male" })).toBe("normal");
    expect(evaluateRange("vitalsWaistCm", 85, { sex: "female" })).toBe("high");
  });

  it("computes MAP/BSA against known references; null-safe with no throw", () => {
    expect(computeMap(120, 80)).toBe(93.3);
    expect(computeBsa(170, 70)).toBe(1.82);
    expect(computeMap(null, 80)).toBeNull();
    expect(computeBsa(170, null)).toBeNull();
    expect(() => computeMap(undefined, undefined)).not.toThrow();
  });

  it("handles out-of-CHECK-range + missing inputs deterministically (never throws)", () => {
    // Beyond the migration CHECK bound still classifies without throwing.
    expect(evaluateRange("vitalsBpSystolic", 9999, { ageYears: 30 })).toBe("high");
    expect(evaluateRange("vitalsHr", null)).toBeNull();
    // Vitals with no advisory band return null rather than a bogus flag.
    expect(evaluateRange("vitalsWtKg", 70)).toBeNull();
    expect(evaluateRange("vitalsPainScore", 9)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 1.1 / 2.x — Component round-trip + a11y over the grid.
// ---------------------------------------------------------------------------

const prescriptionIdRef = { current: null as string | null };

function VitalsProbe() {
  const { state } = useRxForm();
  return (
    <pre data-testid="vitals-probe">
      {JSON.stringify({
        wt: state.fields.vitalsWtKg,
        temp: state.fields.vitalsTempC,
        ht: state.fields.vitalsHtCm,
        glucose: state.fields.vitalsGlucoseMgDl,
      })}
    </pre>
  );
}

function readProbe(): { wt: number | null; temp: number | null; ht: number | null; glucose: number | null } {
  return JSON.parse(screen.getByTestId("vitals-probe").textContent ?? "{}");
}

function renderGrid(initial?: Partial<RxFormFields>) {
  return render(
    <TooltipProvider>
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="tok"
        entryMode="structured"
        initialFields={{ ...createEmptyRxFormFields(), ...initial }}
        autosaveEnabled={false}
        prescriptionIdRef={prescriptionIdRef}
        onPrescriptionCreated={() => {}}
      >
        <VitalsGrid />
        <VitalsProbe />
      </RxFormProvider>
    </TooltipProvider>,
  );
}

describe("obj-08 close-gate · unit round-trip parity (P2-D2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetLast.mockResolvedValue({ data: { prescription: null } });
  });

  it("temp °F: entered value stores canonical °C and re-displays with no drift", () => {
    renderGrid();
    fireEvent.click(screen.getByRole("button", { name: "°F" }));
    const input = screen.getByLabelText(/Temp in °F/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "100.4" } });

    expect(readProbe().temp).toBeCloseTo(fToC(100.4), 6); // canonical stored
    expect(Number((screen.getByLabelText(/Temp in °F/i) as HTMLInputElement).value)).toBeCloseTo(
      100.4,
      1,
    ); // re-display, no drift
  });

  it("weight lb: entered value stores canonical kg and re-displays with no drift", () => {
    renderGrid();
    fireEvent.click(screen.getByRole("button", { name: "lb" }));
    const input = screen.getByLabelText(/Weight in lb/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "154.3" } });

    expect(readProbe().wt).toBeCloseTo(lbToKg(154.3), 6);
    expect(Number((screen.getByLabelText(/Weight in lb/i) as HTMLInputElement).value)).toBeCloseTo(
      154.3,
      1,
    );
  });

  it("height in: entered value stores canonical cm and re-displays with no drift", () => {
    renderGrid();
    // "in" is shared by height/HC/MUAC/waist toggles — scope to the Height group.
    const heightGroup = screen.getByRole("group", { name: /Height unit/i });
    fireEvent.click(within(heightGroup).getByRole("button", { name: "in" }));
    const input = screen.getByLabelText(/Height in in/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "66.9" } });

    expect(readProbe().ht).toBeCloseTo(inToCm(66.9), 6);
    expect(Number((screen.getByLabelText(/Height in in/i) as HTMLInputElement).value)).toBeCloseTo(
      66.9,
      1,
    );
  });

  it("glucose mmol/L: entered value stores canonical mg/dL and re-displays with no drift", () => {
    renderGrid();
    fireEvent.click(screen.getByRole("button", { name: "mmol/L" }));
    const input = screen.getByLabelText(/Glucose in mmol\/L/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "6" } });

    expect(readProbe().glucose).toBeCloseTo(mmolLToMgDl(6), 6);
    expect(Number((screen.getByLabelText(/Glucose in mmol\/L/i) as HTMLInputElement).value)).toBeCloseTo(
      6,
      1,
    );
  });

  it("toggling units alone never mutates the stored canonical value", () => {
    renderGrid({ vitalsWtKg: 70 });
    expect(readProbe().wt).toBe(70);
    fireEvent.click(screen.getByRole("button", { name: "lb" }));
    fireEvent.click(screen.getByRole("button", { name: "kg" }));
    expect(readProbe().wt).toBe(70); // no drift from a pure display toggle
  });
});

describe("obj-08 close-gate · canonical round-trip load → edit (P2-D2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetLast.mockResolvedValue({ data: { prescription: null } });
  });

  it("hydrates stored canonical vitals into the grid, then reflects an edit", () => {
    const row = {
      id: "rx-1",
      appointment_id: "appt-1",
      doctor_id: "doc-1",
      type: "structured",
      vitals_glucose_mg_dl: 108,
      vitals_temp_c: 38,
    } as unknown as PrescriptionWithRelations;

    renderGrid(rxFormFieldsFromPrescription(row));

    // Reflects stored canonical values in the active (canonical) unit.
    expect((screen.getByLabelText(/Glucose in mg\/dL/i) as HTMLInputElement).value).toBe("108");
    expect((screen.getByLabelText(/Temp in °C/i) as HTMLInputElement).value).toBe("38");

    // Edit → state reflects the new canonical value.
    fireEvent.change(screen.getByLabelText(/Glucose in mg\/dL/i), { target: { value: "120" } });
    expect(readProbe().glucose).toBe(120);
  });
});

describe("obj-08 close-gate · ghost values read-only (P2-D5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hydrates last-visit ghosts read-only and never overwrites the live entry", async () => {
    mockedGetLast.mockResolvedValue({
      data: {
        prescription: {
          id: "rx-prev",
          vitals_hr: 80,
        } as unknown as PrescriptionWithRelations,
      },
    });
    renderGrid();

    expect(await screen.findByText(/prev 80 bpm/i)).toBeInTheDocument();
    expect((screen.getByLabelText(/HR in bpm/i) as HTMLInputElement).value).toBe("");
  });

  it("renders no ghost text when there is no prior prescription", async () => {
    mockedGetLast.mockResolvedValue({ data: { prescription: null } });
    renderGrid();
    // Allow the async fetch to settle, then assert no ghost captions.
    expect(await screen.findByLabelText(/HR in bpm/i)).toBeInTheDocument();
    expect(screen.queryByText(/^prev /i)).not.toBeInTheDocument();
  });
});

describe("obj-08 close-gate · grid a11y sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetLast.mockResolvedValue({ data: { prescription: null } });
  });

  it("labels every core + extended input", () => {
    renderGrid();
    for (const label of [
      /Systolic blood pressure/i,
      /Diastolic blood pressure/i,
      /HR in bpm/i,
      /Temp in °C/i,
      /SpO₂ in %/i,
      /Weight in kg/i,
      /Height in cm/i,
      /Resp rate in breaths\/min/i,
      /Pain in \/10/i,
      /Glucose in mg\/dL/i,
      /GCS in \/15/i,
      /Waist in cm/i,
      /BP measurement posture/i,
      /BP measurement limb/i,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("exposes unit toggles as labelled groups of aria-pressed buttons", () => {
    renderGrid();
    expect(screen.getByRole("group", { name: /Weight unit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "kg" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "lb" })).toHaveAttribute("aria-pressed", "false");
  });

  it("gives range flags and derived badges aria-labels", () => {
    renderGrid({ vitalsHr: 200, vitalsBpSystolic: 120, vitalsBpDiastolic: 80, vitalsHtCm: 170, vitalsWtKg: 70 });
    expect(screen.getByLabelText(/HR above normal range/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mean arterial pressure/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Body surface area/i)).toBeInTheDocument();
  });

  it("renders the pediatric group as a native keyboard-operable disclosure", () => {
    const { container } = renderGrid();
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.querySelector("summary")?.textContent).toMatch(/Pediatric vitals/i);
  });
});
