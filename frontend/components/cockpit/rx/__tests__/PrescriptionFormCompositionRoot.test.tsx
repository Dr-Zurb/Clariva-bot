/**
 * ppd-02 — PrescriptionFormCompositionRoot omits Subjective/Objective when lifted.
 */

import { useCallback, useRef, useState } from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import {
  PrescriptionFormCompositionRoot,
  type PrescriptionFormCompositionRootProps,
} from "@/components/cockpit/rx/PrescriptionFormCompositionRoot";
import type { DrugMasterRow } from "@/types/drug-master";

vi.mock("@/components/cockpit/rx/sections/PlanSection", () => ({
  PlanSection: () => (
    <section aria-label="Plan" data-testid="rx-section-plan" />
  ),
}));

// Stub the doctor-scoped reads VitalsGrid/ObjectiveSection issue on mount so the
// composition root renders without live fetches in jsdom.
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDoctorSettings: vi.fn().mockResolvedValue({ data: { settings: {} } }),
    getLastPrescriptionInEpisode: vi
      .fn()
      .mockResolvedValue({ data: { prescription: null } }),
    getPatientById: vi.fn().mockResolvedValue({
      data: { patient: { date_of_birth: null, gender: null } },
    }),
  };
});

// VitalsGrid (inside ObjectiveSection) reads the per-patient trends query (vit-10..12);
// stub it so the composition root renders without a live read.
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

const prescriptionIdRef = { current: null as string | null };

function renderCompositionRoot(
  props: Partial<PrescriptionFormCompositionRootProps> = {},
) {
  function Harness() {
    const [medicineInstanceIds, setMedicineInstanceIds] = useState<string[]>(
      [],
    );
    const nextIdRef = useRef(0);
    const generateInstanceIds = useCallback((count: number) => {
      return Array.from({ length: count }, () => {
        nextIdRef.current += 1;
        return `instance-${nextIdRef.current}`;
      });
    }, []);
    const [drugMasterIndex, setDrugMasterIndex] = useState<
      ReadonlyMap<string, DrugMasterRow>
    >(new Map());

    return (
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="t"
        entryMode="structured"
        initialFields={createEmptyRxFormFields()}
        autosaveEnabled={false}
        prescriptionIdRef={prescriptionIdRef}
        onPrescriptionCreated={() => {}}
      >
        <PrescriptionFormCompositionRoot
          token="t"
          medicineInstanceIds={medicineInstanceIds}
          setMedicineInstanceIds={setMedicineInstanceIds}
          generateInstanceIds={generateInstanceIds}
          drugMasterIndex={drugMasterIndex}
          setDrugMasterIndex={setDrugMasterIndex}
          allergies={[]}
          ddiInteractions={[]}
          isAcked={() => false}
          onAcknowledge={vi.fn()}
          onAckDdi={vi.fn()}
          {...props}
        />
      </RxFormProvider>
    );
  }

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  );
}

function expectAllFourSections(): void {
  expect(screen.getByRole("region", { name: "Subjective" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Objective" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Assessment" })).toBeInTheDocument();
  expect(screen.getByTestId("rx-section-plan")).toBeInTheDocument();
}

describe("PrescriptionFormCompositionRoot", () => {
  it("default — renders all four SOAP sections", () => {
    renderCompositionRoot();
    expectAllFourSections();
  });

  it("subjectiveLifted — omits SubjectiveSection", () => {
    renderCompositionRoot({ subjectiveLifted: true });
    expect(
      screen.queryByRole("region", { name: "Subjective" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Objective" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Assessment" })).toBeInTheDocument();
    expect(screen.getByTestId("rx-section-plan")).toBeInTheDocument();
  });

  it("objectiveLifted — omits ObjectiveSection", () => {
    renderCompositionRoot({ objectiveLifted: true });
    expect(screen.getByRole("region", { name: "Subjective" })).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Objective" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Assessment" })).toBeInTheDocument();
    expect(screen.getByTestId("rx-section-plan")).toBeInTheDocument();
  });

  it("both lifted — only Assessment + Plan render", () => {
    renderCompositionRoot({
      subjectiveLifted: true,
      objectiveLifted: true,
    });
    expect(
      screen.queryByRole("region", { name: "Subjective" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Objective" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Assessment" })).toBeInTheDocument();
    expect(screen.getByTestId("rx-section-plan")).toBeInTheDocument();
  });

  it("defaults preserved — omitting lift props matches explicit false", () => {
    const { unmount: unmountDefault } = renderCompositionRoot();
    expectAllFourSections();
    unmountDefault();

    renderCompositionRoot({
      subjectiveLifted: false,
      objectiveLifted: false,
    });
    expectAllFourSections();
  });
});
