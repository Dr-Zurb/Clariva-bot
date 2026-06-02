import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VitalsGrid } from "@/components/cockpit/rx/inputs/VitalsGrid";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { TooltipProvider } from "@/components/ui/tooltip";

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
});
