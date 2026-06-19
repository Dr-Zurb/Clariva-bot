import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VitalsGrid } from "@/components/cockpit/rx/inputs/VitalsGrid";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { TooltipProvider } from "@/components/ui/tooltip";
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

const prescriptionIdRef = { current: null as string | null };

function renderWithProvider(initial?: Partial<RxFormFields>) {
  const initialFields = {
    ...createEmptyRxFormFields(),
    ...initial,
  };

  return render(
    <TooltipProvider>
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="tok"
        entryMode="structured"
        initialFields={initialFields}
        autosaveEnabled={false}
        prescriptionIdRef={prescriptionIdRef}
        onPrescriptionCreated={() => {}}
      >
        <VitalsGrid />
      </RxFormProvider>
    </TooltipProvider>,
  );
}

describe("VitalsGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetLast.mockResolvedValue({ data: { prescription: null } });
  });

  describe("VitalsGrid BMI badge (cpv-03)", () => {
    it("renders BMI badge when both height and weight set", () => {
      renderWithProvider({ vitalsHtCm: 170, vitalsWtKg: 65 });
      expect(screen.getByText(/BMI 22\.5/)).toBeInTheDocument();
    });

    it("hides BMI badge when height missing", () => {
      renderWithProvider({ vitalsHtCm: null, vitalsWtKg: 65 });
      expect(screen.queryByText(/BMI/)).not.toBeInTheDocument();
    });

    it("hides BMI badge when weight missing", () => {
      renderWithProvider({ vitalsHtCm: 170, vitalsWtKg: null });
      expect(screen.queryByText(/BMI/)).not.toBeInTheDocument();
    });

    it("aria-label includes category", () => {
      renderWithProvider({ vitalsHtCm: 170, vitalsWtKg: 65 });
      expect(screen.getByLabelText(/normal/i)).toBeInTheDocument();
    });

    it("categorizes BMI < 18.5 as underweight", () => {
      renderWithProvider({ vitalsWtKg: 45, vitalsHtCm: 170 });
      expect(screen.getByLabelText(/underweight/i)).toBeInTheDocument();
      expect(screen.getByText(/BMI 15\.6/)).toBeInTheDocument();
    });

    it("categorizes BMI >= 30 as obese", () => {
      renderWithProvider({ vitalsWtKg: 95, vitalsHtCm: 170 });
      expect(screen.getByLabelText(/obese/i)).toBeInTheDocument();
      expect(screen.getByText(/BMI 32\.9/)).toBeInTheDocument();
    });

    it("updates BMI when weight changes", () => {
      renderWithProvider({ vitalsWtKg: 70, vitalsHtCm: 175 });
      expect(screen.getByText(/BMI 22\.9/)).toBeInTheDocument();

      const weightInput = screen.getByLabelText(/Weight in kg/i) as HTMLInputElement;
      fireEvent.change(weightInput, { target: { value: "80" } });
      expect(screen.getByText(/BMI 26\.1/)).toBeInTheDocument();
      expect(screen.getByLabelText(/overweight/i)).toBeInTheDocument();
    });

    it("guards against absurd values (Wt 500 Ht 30)", () => {
      renderWithProvider({ vitalsWtKg: 500, vitalsHtCm: 30 });
      expect(screen.queryByText(/BMI/)).not.toBeInTheDocument();
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

  describe("extended vitals (obj-07)", () => {
    it("renders the extended numeric fields and posture/limb selects", () => {
      renderWithProvider();
      expect(screen.getByLabelText(/Resp rate in breaths\/min/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Pain in \/10/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Glucose in mg\/dL/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/GCS in \/15/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Waist in cm/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/BP measurement posture/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/BP measurement limb/i)).toBeInTheDocument();
    });

    it("renders the pediatric fields (HC, MUAC) in a collapsible group", () => {
      renderWithProvider();
      expect(screen.getByText(/Pediatric vitals/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Head circ\. in cm/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/MUAC in cm/i)).toBeInTheDocument();
    });

    it("posture select is constrained to the allowed set", () => {
      renderWithProvider();
      const posture = screen.getByLabelText(/BP measurement posture/i) as HTMLSelectElement;
      const values = Array.from(posture.options).map((o) => o.value);
      expect(values).toEqual(["", "sitting", "standing", "supine"]);
      fireEvent.change(posture, { target: { value: "supine" } });
      expect(posture.value).toBe("supine");
    });
  });

  describe("unit toggles (display-only; canonical storage)", () => {
    it("flips weight display to lb without changing the stored (BMI) value", () => {
      renderWithProvider({ vitalsHtCm: 170, vitalsWtKg: 70 });
      const weightInput = screen.getByLabelText(/Weight in kg/i) as HTMLInputElement;
      expect(weightInput.value).toBe("70");
      expect(screen.getByText(/BMI 24\.2/)).toBeInTheDocument();

      const lbToggle = screen.getByRole("button", { name: "lb" });
      fireEvent.click(lbToggle);

      // Display switches to lb; canonical kg (hence BMI) is unchanged.
      const lbInput = screen.getByLabelText(/Weight in lb/i) as HTMLInputElement;
      expect(Number(lbInput.value)).toBeCloseTo(154.3, 1);
      expect(screen.getByText(/BMI 24\.2/)).toBeInTheDocument();
    });

    it("stores canonical mg/dL when glucose entered, shown converted in mmol/L", () => {
      renderWithProvider();
      const glucose = screen.getByLabelText(/Glucose in mg\/dL/i) as HTMLInputElement;
      fireEvent.change(glucose, { target: { value: "110" } });

      const mmolToggle = screen.getByRole("button", { name: "mmol/L" });
      fireEvent.click(mmolToggle);
      const mmolInput = screen.getByLabelText(/Glucose in mmol\/L/i) as HTMLInputElement;
      expect(Number(mmolInput.value)).toBeCloseTo(6.1, 1);
    });

    it("exposes the unit toggle as a labelled, keyboard-operable group", () => {
      renderWithProvider();
      expect(screen.getByRole("group", { name: /Temp unit/i })).toBeInTheDocument();
      const fToggle = screen.getByRole("button", { name: "°F" });
      expect(fToggle).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(fToggle);
      expect(screen.getByRole("button", { name: "°F" })).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("range flags + derived badges", () => {
    it("flags an out-of-range heart rate", () => {
      renderWithProvider({ vitalsHr: 200 });
      expect(screen.getByLabelText(/HR above normal range/i)).toBeInTheDocument();
    });

    it("does not flag an in-range heart rate", () => {
      renderWithProvider({ vitalsHr: 72 });
      expect(screen.queryByLabelText(/HR (above|below) normal range/i)).not.toBeInTheDocument();
    });

    it("shows the MAP badge next to BP", () => {
      renderWithProvider({ vitalsBpSystolic: 120, vitalsBpDiastolic: 80 });
      expect(screen.getByText(/MAP 93\.3/)).toBeInTheDocument();
    });

    it("shows the BSA badge next to weight", () => {
      renderWithProvider({ vitalsHtCm: 170, vitalsWtKg: 70 });
      expect(screen.getByText(/BSA 1\.82/)).toBeInTheDocument();
    });
  });

  describe("last-visit ghost values (P2-D5)", () => {
    it("renders previous-visit vitals as read-only ghosts without overwriting entry", async () => {
      mockedGetLast.mockResolvedValue({
        data: {
          prescription: {
            id: "rx-prev",
            vitals_hr: 72,
            vitals_temp_c: 37,
          } as unknown as PrescriptionWithRelations,
        },
      });
      renderWithProvider();

      // Ghost caption appears once the async fetch resolves.
      expect(await screen.findByText(/prev 72 bpm/i)).toBeInTheDocument();

      // The live input stays empty — ghost never overwrites the current entry.
      const hrInput = screen.getByLabelText(/HR in bpm/i) as HTMLInputElement;
      expect(hrInput.value).toBe("");
    });
  });
});
