import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VitalsGrid } from "@/components/cockpit/rx/inputs/VitalsGrid";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getLastPrescriptionInEpisode, getPatientById } from "@/lib/api";
import type { PrescriptionWithRelations } from "@/types/prescription";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getLastPrescriptionInEpisode: vi
      .fn()
      .mockResolvedValue({ data: { prescription: null } }),
    getPatientById: vi.fn().mockResolvedValue({
      data: {
        patient: {
          id: "pat-1",
          name: "Test",
          phone: "999",
          date_of_birth: "1990-01-01",
          gender: "male",
          created_at: "2020-01-01T00:00:00.000Z",
          updated_at: "2020-01-01T00:00:00.000Z",
        },
      },
    }),
  };
});

vi.mock("@/hooks/queries/useVitalsTrendsQuery", async () => {
  const { buildVitalsTrendSeries, indexVitalsTrendSeries } = await import(
    "@/lib/cockpit/vitals-trends"
  );
  const { buildCategoricalVitalTimelines } = await import(
    "@/lib/cockpit/categorical-vitals-timeline"
  );
  const {
    buildCustomVitalTextTimelines,
    buildCustomVitalTrendSeries,
    indexCustomVitalTrendSeries,
  } = await import("@/lib/cockpit/custom-vitals-trends");
  const empty = buildVitalsTrendSeries([]);
  const emptyCustom = buildCustomVitalTrendSeries([]);
  return {
    useVitalsTrendsQuery: () => ({
      series: empty,
      byMetric: indexVitalsTrendSeries(empty),
      categoricalTimelines: buildCategoricalVitalTimelines([]),
      customTrendSeries: emptyCustom,
      byCustomId: indexCustomVitalTrendSeries(emptyCustom),
      customTextTimelines: buildCustomVitalTextTimelines([]),
      isLoading: false,
      isEmpty: true,
      error: null,
    }),
  };
});

vi.mock("@/components/cockpit/rx/objective/PediatricGrowthChartsSection", () => ({
  PediatricGrowthChartsSection: () => null,
}));

vi.mock("@/lib/cockpit/vitals-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cockpit/vitals-visibility")>();
  return {
    ...actual,
    fetchVitalsHidden: vi.fn().mockResolvedValue([]),
    saveVitalsHidden: vi.fn().mockResolvedValue([]),
  };
});

import { fetchVitalsHidden } from "@/lib/cockpit/vitals-visibility";

const mockedGetLast = vi.mocked(getLastPrescriptionInEpisode);
const mockedFetchVitalsHidden = vi.mocked(fetchVitalsHidden);

async function waitForVitalsSettingsLoaded() {
  await waitFor(() => expect(mockedFetchVitalsHidden).toHaveBeenCalled());
}

async function revealVital(menuLabel: string) {
  await waitForVitalsSettingsLoaded();
  if (!screen.queryByRole("button", { name: `Show ${menuLabel}` })) {
    fireEvent.click(screen.getByTestId("vitals-manager-trigger"));
  }
  const showBtn = await screen.findByRole("button", { name: `Show ${menuLabel}` });
  fireEvent.click(showBtn);
}

async function revealExtendedVitals() {
  await revealVital("Glasgow Coma Scale (GCS)");
  await revealVital("Waist Circumference");
}
const mockedGetPatient = vi.mocked(getPatientById);

const prescriptionIdRef = { current: null as string | null };

function renderWithProvider(initial?: Partial<RxFormFields>) {
  const initialFields = {
    ...createEmptyRxFormFields(),
    ...initial,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
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
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("VitalsGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetLast.mockResolvedValue({ data: { prescription: null } });
    mockedGetPatient.mockResolvedValue({
      data: {
        patient: {
          id: "pat-1",
          name: "Test",
          phone: "999",
          date_of_birth: "1990-01-01",
          gender: "male",
          created_at: "2020-01-01T00:00:00.000Z",
          updated_at: "2020-01-01T00:00:00.000Z",
        },
      },
    });
  });

  describe("BP / glucose cluster row", () => {
    it("isolates cluster cards above numeric vitals so they never share a row with HR", async () => {
      renderWithProvider();
      await waitForVitalsSettingsLoaded();
      const clusterRow = screen.getByTestId("vitals-cluster-row");
      expect(clusterRow).toContainElement(screen.getByTestId("bp-readings-block"));
      expect(clusterRow).toContainElement(screen.getByTestId("glucose-readings-block"));
      expect(clusterRow).not.toContainElement(
        screen.getByLabelText(/Pulse Rate \(PR\) in bpm/i),
      );
    });

    it("spans multi-reading BP full width within the cluster row only", async () => {
      renderWithProvider({
        vitalsBpReadings: [
          { systolic: 120, diastolic: 80, posture: null, limb: null, sequenceLabel: null },
          { systolic: 118, diastolic: 76, posture: null, limb: null, sequenceLabel: null },
        ],
      });
      await waitForVitalsSettingsLoaded();
      expect(screen.getByTestId("bp-readings-block")).toHaveAttribute("data-bp-grid-span", "full");
    });

    it("spans multi-reading glucose full width within the cluster row only", async () => {
      renderWithProvider({
        vitalsGlucoseReadings: [
          { valueMgDl: 95, timing: "fasting", device: null, sequenceLabel: null, note: null },
          { valueMgDl: 142, timing: "post_prandial_2h", device: null, sequenceLabel: null, note: null },
        ],
      });
      await waitForVitalsSettingsLoaded();
      expect(screen.getByTestId("glucose-readings-block")).toHaveAttribute(
        "data-glucose-grid-span",
        "full",
      );
      expect(screen.getByTestId("glucose-reading-row-0")).toBeInTheDocument();
      expect(screen.getByTestId("glucose-reading-row-1")).toBeInTheDocument();
      expect(screen.getByTestId("glucose-readings-block")).toContainElement(
        screen.getByTestId("glucose-reading-row-1"),
      );
      expect(screen.getByTestId("glucose-reading-context-toggle-0")).toBeInTheDocument();
      expect(screen.getByTestId("glucose-reading-context-toggle-1")).toBeInTheDocument();
    });
  });

  describe("VitalsGrid BMI badge (cpv-03)", () => {
    it("renders BMI badge when both height and weight set", () => {
      renderWithProvider({ vitalsHtCm: 170, vitalsWtKg: 65 });
      expect(screen.getByTestId("weight-height-derived-row")).toBeInTheDocument();
      expect(screen.getByText(/BMI 22\.5/)).toBeInTheDocument();
      expect(screen.getByText(/BSA 1\.75/)).toBeInTheDocument();
    });

    it("hides BMI badge when height missing", () => {
      renderWithProvider({ vitalsHtCm: null, vitalsWtKg: 65 });
      expect(screen.queryByTestId("weight-height-derived-row")).not.toBeInTheDocument();
      expect(screen.queryByText(/^BMI \d/)).not.toBeInTheDocument();
    });

    it("hides BMI badge when weight missing", () => {
      renderWithProvider({ vitalsHtCm: 170, vitalsWtKg: null });
      expect(screen.queryByTestId("weight-height-derived-row")).not.toBeInTheDocument();
      expect(screen.queryByText(/^BMI \d/)).not.toBeInTheDocument();
    });

    it("aria-label includes category", () => {
      renderWithProvider({ vitalsHtCm: 170, vitalsWtKg: 65 });
      expect(screen.getByLabelText(/normal/i)).toBeInTheDocument();
    });

    it("shows derived vitals help with WHO ranges", async () => {
      renderWithProvider({ vitalsHtCm: 170, vitalsWtKg: 65 });
      fireEvent.click(screen.getByTestId("derived-vitals-help"));
      await waitFor(() => {
        expect(screen.getByTestId("derived-vitals-help-panel")).toBeInTheDocument();
      });
      expect(screen.getByText("Normal")).toBeInTheDocument();
      expect(screen.getByText("18.5–24.9")).toBeInTheDocument();
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
      expect(screen.queryByText(/^BMI \d/)).not.toBeInTheDocument();
    });
  });

  describe("existing 7-input behavior", () => {
    it("renders all 7 numeric inputs", () => {
      renderWithProvider();
      expect(screen.getByLabelText(/Systolic blood pressure/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Diastolic blood pressure/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Pulse Rate \(PR\) in bpm/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Temperature in °C/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Oxygen Saturation \(SpO₂\) in %/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Weight in kg/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Height in cm$/i)).toBeInTheDocument();
    });
  });

  describe("grouped vitals grid (vit-05)", () => {
    it("renders registry vitals under clinical group labels when revealed", async () => {
      renderWithProvider();
      await revealVital("Oxygen Flow Rate (O₂)");
      await revealVital("Blood Ketones");
      expect(screen.getByLabelText(/Oxygen Flow Rate \(O₂\) in L\/min/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Blood Ketones in mmol\/L/i)).toBeInTheDocument();
      expect(screen.getByTestId("vitals-group-core")).toBeInTheDocument();
      expect(screen.getByTestId("vitals-group-respiratory")).toBeInTheDocument();
      expect(screen.getByTestId("vitals-group-metabolic")).toBeInTheDocument();
      expect(screen.getAllByText("Respiratory").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Metabolic").length).toBeGreaterThan(0);
    });
  });

  describe("categorical context vitals (vit-06)", () => {
    it("renders paired context selects inline under HR, Temp, and SpO₂", () => {
      renderWithProvider();
      expect(screen.getByTestId("vitals-measurement-context-bar")).toBeInTheDocument();
      expect(screen.getByTestId("vital-context-vitalsPulseRhythm")).toBeInTheDocument();
      expect(screen.getByTestId("vital-context-vitalsHrSource")).toBeInTheDocument();
      expect(screen.getByTestId("vital-context-vitalsTempSite")).toBeInTheDocument();
      expect(screen.getByTestId("vital-context-vitalsTempDevice")).toBeInTheDocument();
      expect(screen.getByTestId("vital-context-vitalsO2DeliveryMethod")).toBeInTheDocument();
      expect(screen.getByTestId("vital-context-vitalsSpo2Device")).toBeInTheDocument();
    });

    it("renders glucose timing per reading row in the glucose block", () => {
      renderWithProvider();
      const timing = screen.getByLabelText(/Glucose measurement timing/i) as HTMLSelectElement;
      expect(timing).toBeTruthy();
      const values = Array.from(timing.options).map((o) => o.value);
      expect(values).toContain("fasting");
      expect(values).toContain("post_prandial_2h");
      fireEvent.change(timing, { target: { value: "fasting" } });
      expect(timing.value).toBe("fasting");
    });

    it("renders measured differently on core vitals", () => {
      renderWithProvider();
      expect(screen.getByTestId("vital-provenance-trigger-vitalsWtKg")).toBeInTheDocument();
      expect(screen.getByTestId("vital-provenance-trigger-vitalsTempC")).toBeInTheDocument();
      expect(screen.getByTestId("vital-provenance-trigger-vitalsSpo2")).toBeInTheDocument();
      expect(screen.getByTestId("vital-provenance-trigger-vitalsHr")).toBeInTheDocument();
      expect(screen.getByTestId("vital-provenance-trigger-vitalsRr")).toBeInTheDocument();
      expect(screen.getByTestId("vital-provenance-trigger-vitalsHtCm")).toBeInTheDocument();
      expect(screen.getByTestId("glucose-reading-context-toggle-0")).toBeInTheDocument();
      expect(screen.getByTestId("glucose-readings-block")).toBeInTheDocument();
    });

    it("clears RR low-confidence badge when measured differently is set to clinic staff", async () => {
      renderWithProvider();
      expect(screen.getByTestId("vital-low-confidence-badge-vitalsRr")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("vital-provenance-trigger-vitalsRr"));
      const measuredBy = await screen.findByLabelText("Vital measured by override");
      fireEvent.change(measuredBy, { target: { value: "nurse" } });
      await waitFor(() => {
        expect(screen.queryByTestId("vital-low-confidence-badge-vitalsRr")).not.toBeInTheDocument();
      });
    });

    it("flags patient-measured RR with a low-confidence badge", () => {
      renderWithProvider();
      expect(screen.getByTestId("vital-low-confidence-badge-vitalsRr")).toBeInTheDocument();
    });

    it("flags patient palpation HR source with a low-confidence badge", () => {
      renderWithProvider({ vitalsHrSource: "palpation" });
      expect(screen.getByTestId("vital-low-confidence-badge-vitalsHr")).toBeInTheDocument();
    });

    it("flags blank HR source for patient default", () => {
      renderWithProvider();
      expect(screen.getByTestId("vital-low-confidence-badge-vitalsHr")).toBeInTheDocument();
    });

    it("does not flag oximeter HR source for patient default", () => {
      renderWithProvider({ vitalsHrSource: "oximeter" });
      expect(screen.queryByTestId("vital-low-confidence-badge-vitalsHr")).not.toBeInTheDocument();
    });

    it("does not flag RR when measured by clinic staff", () => {
      renderWithProvider({
        vitalsMeasurementContext: { measuredBy: "nurse", setting: "clinic" },
      });
      expect(screen.queryByTestId("vital-low-confidence-badge-vitalsRr")).not.toBeInTheDocument();
    });

    it("auto-sums GCS E/V/M into the canonical total when all components are entered", async () => {
      renderWithProvider();
      await revealVital("Glasgow Coma Scale (GCS)");

      fireEvent.change(screen.getByLabelText(/GCS Eye \(E\) in \/4/i), { target: { value: "4" } });
      fireEvent.change(screen.getByLabelText(/GCS Verbal \(V\) in \/5/i), { target: { value: "5" } });
      fireEvent.change(screen.getByLabelText(/GCS Motor \(M\) in \/6/i), { target: { value: "6" } });

      await waitFor(() => {
        expect((screen.getByLabelText(/Glasgow Coma Scale \(GCS\) in \/15/i) as HTMLInputElement).value).toBe("15");
      });
    });

    it("allows total-only GCS entry with empty E/V/M fields in the same card", async () => {
      renderWithProvider();
      await revealVital("Glasgow Coma Scale (GCS)");
      const total = screen.getByLabelText(/Glasgow Coma Scale \(GCS\) in \/15/i) as HTMLInputElement;
      fireEvent.change(total, { target: { value: "14" } });
      expect(total.value).toBe("14");
      expect(screen.getByLabelText(/GCS Eye \(E\) in \/4/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/GCS Verbal \(V\) in \/5/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/GCS Motor \(M\) in \/6/i)).toBeInTheDocument();
    });

    it("shows on-demand GCS scoring reference without cluttering the card", async () => {
      renderWithProvider();
      await revealVital("Glasgow Coma Scale (GCS)");

      expect(screen.getByTestId("gcs-criteria-help")).toBeInTheDocument();
      expect(screen.getByTestId("gcs-criteria-help-vitalsGcsE")).toBeInTheDocument();
      expect(screen.queryByText("Spontaneous")).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId("gcs-criteria-help"));
      expect(screen.getByText("Adult GCS reference")).toBeInTheDocument();
      expect(screen.getByText("Abnormal flexion (decorticate)")).toBeInTheDocument();
    });

    it("renders unified pupils card with L/R size and reactivity", async () => {
      renderWithProvider();
      await revealVital("Pupils");

      expect(screen.getByTestId("pupils-section")).toBeInTheDocument();
      expect(screen.getByTestId("pupil-row-l")).toBeInTheDocument();
      expect(screen.getByTestId("pupil-row-r")).toBeInTheDocument();
      expect(screen.getByLabelText(/Pupil Size \(L\) in mm/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Pupil Size \(R\) in mm/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Pupil Reactivity \(L\)/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Pupil Reactivity \(R\)/i)).toBeInTheDocument();
      expect(screen.queryByText("Pupil Size (L)", { selector: "label" })).not.toBeInTheDocument();
    });
  });

  describe("extended vitals (obj-07)", () => {
    it("renders extended numeric fields and posture/limb after unhiding", async () => {
      renderWithProvider();
      await revealExtendedVitals();
      expect(screen.getByLabelText(/Respiratory Rate \(RR\) in breaths\/min/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Blood glucose value$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Glasgow Coma Scale \(GCS\) in \/15/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Waist Circumference in cm/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/BP measurement posture/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/BP measurement limb/i)).toBeInTheDocument();
    });

    it("renders the pediatric fields (HC, MUAC) in a collapsible group", async () => {
      renderWithProvider();
      await revealVital("Head Circumference (HC)");
      await revealVital("Mid-Upper Arm Circumference (MUAC)");
      expect(screen.getByText(/Paediatric vitals/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Head Circumference \(HC\) in cm/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Mid-Upper Arm Circumference \(MUAC\) in cm/i)).toBeInTheDocument();
    });

    it("posture select is constrained to the allowed set", async () => {
      renderWithProvider();
      await revealExtendedVitals();
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

    it("stores canonical mg/dL when glucose entered, shown converted in mmol/L", async () => {
      renderWithProvider();
      const glucose = screen.getByLabelText(/^Blood glucose value$/i) as HTMLInputElement;
      fireEvent.change(glucose, { target: { value: "110" } });

      const mmolToggle = screen.getByRole("button", { name: "mmol/L" });
      fireEvent.click(mmolToggle);
      const mmolInput = screen.getByLabelText(/^Blood glucose value$/i) as HTMLInputElement;
      expect(Number(mmolInput.value)).toBeCloseTo(6.1, 1);
    });

    it("exposes the unit toggle as a labelled, keyboard-operable group", () => {
      renderWithProvider();
      expect(screen.getByRole("group", { name: /Temperature unit/i })).toBeInTheDocument();
      const fToggle = screen.getByRole("button", { name: "°F" });
      expect(fToggle).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(fToggle);
      expect(screen.getByRole("button", { name: "°F" })).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("range flags + derived badges", () => {
    it("flags an out-of-range heart rate", () => {
      renderWithProvider({ vitalsHr: 200 });
      expect(screen.getByLabelText(/Pulse Rate \(PR\): Above normal/i)).toBeInTheDocument();
    });

    it("does not flag an in-range heart rate", () => {
      renderWithProvider({ vitalsHr: 72 });
      expect(screen.queryByLabelText(/Pulse Rate \(PR\) (above|below) normal range/i)).not.toBeInTheDocument();
    });

    it("shows the MAP badge next to BP", () => {
      renderWithProvider({
        vitalsBpSystolic: 120,
        vitalsBpDiastolic: 80,
        vitalsBpReadings: [{ systolic: 120, diastolic: 80 }],
      });
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
      const hrInput = screen.getByLabelText(/Pulse Rate \(PR\) in bpm/i) as HTMLInputElement;
      expect(hrInput.value).toBe("");
    });
  });

  describe("inline sparklines (obj-26)", () => {
    it("does not render sparklines when trend history is empty", () => {
      renderWithProvider();
      expect(screen.queryByRole("img", { name: /trend/i })).not.toBeInTheDocument();
    });
  });

  describe("quick-fill chips", () => {
    it("fills an empty heart rate from an inline chip and hides chips when filled", () => {
      renderWithProvider();
      expect(screen.getByTestId("vital-vitalsHr-quick-fill")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("vital-vitalsHr-quick-fill-72"));

      const hrInput = screen.getByLabelText(/Pulse Rate \(PR\) in bpm/i) as HTMLInputElement;
      expect(hrInput.value).toBe("72");
      expect(screen.queryByTestId("vital-vitalsHr-quick-fill")).not.toBeInTheDocument();
    });

    it("fills primary BP from a pair chip", () => {
      renderWithProvider();
      fireEvent.click(screen.getByTestId("bp-primary-quick-fill-120-80"));

      const sysInput = screen.getByLabelText(/Systolic blood pressure/i) as HTMLInputElement;
      const diaInput = screen.getByLabelText(/Diastolic blood pressure/i) as HTMLInputElement;
      expect(sysInput.value).toBe("120");
      expect(diaInput.value).toBe("80");
      expect(screen.queryByTestId("bp-primary-quick-fill")).not.toBeInTheDocument();
    });
  });

  describe("all within normal limits", () => {
    it("fills empty visible vitals after confirmation", async () => {
      renderWithProvider();
      await waitForVitalsSettingsLoaded();
      fireEvent.click(screen.getByTestId("vitals-wnl-fill-trigger"));
      expect(screen.getByTestId("vitals-wnl-fill-dialog")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Fill" }));

      const hrInput = screen.getByLabelText(/Pulse Rate \(PR\) in bpm/i) as HTMLInputElement;
      const sysInput = screen.getByLabelText(/Systolic blood pressure/i) as HTMLInputElement;
      expect(hrInput.value).toBe("80");
      expect(sysInput.value).toBe("120");
    });

    it("disables WNL when every bandable vital is already filled", () => {
      renderWithProvider({
        vitalsHr: 72,
        vitalsRr: 16,
        vitalsTempC: 37,
        vitalsSpo2: 98,
        vitalsBpReadings: [{ systolic: 120, diastolic: 80 }],
        vitalsGlucoseReadings: [{ valueMgDl: 110, timing: null, device: null, sequenceLabel: null, note: null }],
      });
      expect(screen.getByTestId("vitals-wnl-fill-trigger")).toBeDisabled();
    });
  });

  describe("copy last visit", () => {
    it("copies a previous heart rate when the ghost chip is clicked", async () => {
      mockedGetLast.mockResolvedValue({
        data: {
          prescription: {
            id: "rx-prev",
            vitals_hr: 72,
          } as unknown as PrescriptionWithRelations,
        },
      });
      renderWithProvider();

      const ghostBtn = await screen.findByTestId("vital-last-visit-vitalsHr");
      fireEvent.click(ghostBtn);

      const hrInput = screen.getByLabelText(/Pulse Rate \(PR\) in bpm/i) as HTMLInputElement;
      expect(hrInput.value).toBe("72");
    });

    it("copies previous glucose from the ghost chip", async () => {
      mockedGetLast.mockResolvedValue({
        data: {
          prescription: {
            id: "rx-prev",
            vitals_glucose_mg_dl: 108,
          } as unknown as PrescriptionWithRelations,
        },
      });
      renderWithProvider();

      const ghostBtn = await screen.findByTestId("glucose-primary-last-visit");
      fireEvent.click(ghostBtn);

      const glucoseInput = screen.getByLabelText(/^Blood glucose value$/i) as HTMLInputElement;
      expect(glucoseInput.value).toBe("108");
    });

    it("copies previous BP from the ghost chip", async () => {
      mockedGetLast.mockResolvedValue({
        data: {
          prescription: {
            id: "rx-prev",
            vitals_bp_systolic: 118,
            vitals_bp_diastolic: 76,
          } as unknown as PrescriptionWithRelations,
        },
      });
      renderWithProvider();

      const ghostBtn = await screen.findByTestId("bp-primary-last-visit");
      fireEvent.click(ghostBtn);

      const sysInput = screen.getByLabelText(/Systolic blood pressure/i) as HTMLInputElement;
      const diaInput = screen.getByLabelText(/Diastolic blood pressure/i) as HTMLInputElement;
      expect(sysInput.value).toBe("118");
      expect(diaInput.value).toBe("76");
    });
  });

  describe("all-trends affordance", () => {
    it("hides the All trends button when no vital has prior history", () => {
      renderWithProvider();
      expect(screen.queryByTestId("all-vital-trends-trigger")).not.toBeInTheDocument();
    });
  });
});
