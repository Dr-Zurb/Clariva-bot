import type { ReactElement } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProblemOrientedMedicalSection from "@/components/ehr/sections/ProblemOrientedMedicalSection";
import { queryKeys } from "@/lib/query/keys";
import type {
  ConditionWithMedications,
  MedicalBackgroundGrouped,
  PatientChronicCondition,
} from "@/types/patient-chart";

const getPatientMedicalBackground = vi.fn();
const createPatientCondition = vi.fn();
const archivePatientCondition = vi.fn();
const updatePatientCondition = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getPatientMedicalBackground: (...a: unknown[]) => getPatientMedicalBackground(...a),
    createPatientCondition: (...a: unknown[]) => createPatientCondition(...a),
    archivePatientCondition: (...a: unknown[]) => archivePatientCondition(...a),
    updatePatientCondition: (...a: unknown[]) => updatePatientCondition(...a),
  };
});

vi.mock("@/lib/api/diagnosis-catalog", () => ({
  searchDiagnoses: vi.fn().mockResolvedValue({
    success: true,
    data: { results: [] },
    meta: { timestamp: "", requestId: "" },
  }),
}));

function makeCondition(
  overrides: Partial<ConditionWithMedications> = {},
): ConditionWithMedications {
  return {
    id: "cond-1",
    doctor_id: "doc-1",
    patient_id: "pat-1",
    condition: "Hypertension",
    status: "active",
    diagnosed_on: null,
    diagnosed_ago_value: null,
    diagnosed_ago_unit: null,
    resolved_ago_value: null,
    resolved_ago_unit: null,
    on_treatment: null,
    acuity: null,
    code: null,
    code_title: null,
    note: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    medications: [],
    ...overrides,
  };
}

function emptyBackground(
  overrides: Partial<MedicalBackgroundGrouped> = {},
): MedicalBackgroundGrouped {
  return {
    conditions: [],
    unlinkedMedications: [],
    links: [],
    notes: null,
    ...overrides,
  };
}

const CONDITIONS_KEY = queryKeys.patient("pat-1").conditions();

function setup(background: MedicalBackgroundGrouped) {
  getPatientMedicalBackground.mockResolvedValue({
    success: true,
    data: { medicalBackground: background },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const view = (ui: ReactElement) =>
    render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  view(
    <ProblemOrientedMedicalSection
      patientId="pat-1"
      token="test-token"
      layout="desktop"
      mode="default"
    />,
  );
  return { queryClient, invalidateSpy };
}

describe("ProblemOrientedMedicalSection · shared condition cache", () => {
  beforeEach(() => {
    getPatientMedicalBackground.mockReset();
    createPatientCondition.mockReset();
    archivePatientCondition.mockReset();
    updatePatientCondition.mockReset();
  });

  it("loads conditions from the medical-background query", async () => {
    setup(emptyBackground({ conditions: [makeCondition()] }));
    expect(
      await screen.findByRole("button", { name: "Remove condition Hypertension" }),
    ).toBeInTheDocument();
    expect(getPatientMedicalBackground).toHaveBeenCalledWith("test-token", "pat-1");
  });

  it("adds a condition via quick-add and invalidates the shared conditions key", async () => {
    createPatientCondition.mockImplementation(
      async (
        _t: string,
        _p: string,
        payload: {
          condition: string;
          status: string;
          code?: string | null;
          codeTitle?: string | null;
        },
      ) => ({
        success: true,
        data: {
          condition: makeCondition({
            id: "cond-new",
            condition: payload.condition,
            status: payload.status as PatientChronicCondition["status"],
            code: payload.code ?? null,
            code_title: payload.codeTitle ?? null,
          }),
        },
      }),
    );
    const { invalidateSpy } = setup(emptyBackground());

    const group = await screen.findByTestId("pmh-quick-add");
    fireEvent.click(within(group).getByRole("button", { name: /\+ Essential hypertension/i }));

    await waitFor(() => {
      expect(createPatientCondition).toHaveBeenCalledWith(
        "test-token",
        "pat-1",
        expect.objectContaining({
          condition: "Essential hypertension",
          status: "active",
          code: "BA00",
          codeTitle: "Essential hypertension",
        }),
      );
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: CONDITIONS_KEY });
    });
    expect(
      screen.getByRole("button", { name: "Remove condition Essential hypertension" }),
    ).toBeInTheDocument();
    expect(screen.getByText("BA00")).toBeInTheDocument();
  });

  it("removes a condition and invalidates the shared conditions key", async () => {
    archivePatientCondition.mockResolvedValue({
      success: true,
      data: { condition: makeCondition({ archived_at: "2026-07-10T00:00:00Z" }) },
    });
    const { invalidateSpy } = setup(emptyBackground({ conditions: [makeCondition()] }));

    const removeBtn = await screen.findByRole("button", {
      name: "Remove condition Hypertension",
    });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(archivePatientCondition).toHaveBeenCalledWith("test-token", "pat-1", "cond-1");
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Remove condition Hypertension" }),
      ).not.toBeInTheDocument();
    });
    // Both surfaces were patched optimistically — mark stale without refetch.
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: CONDITIONS_KEY,
      refetchType: "none",
    });
  });

  it("restores the condition when archive fails", async () => {
    archivePatientCondition.mockRejectedValueOnce(new Error("network down"));
    setup(emptyBackground({ conditions: [makeCondition()] }));

    const removeBtn = await screen.findByRole("button", {
      name: "Remove condition Hypertension",
    });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("network down");
    });
    expect(
      screen.getByRole("button", { name: "Remove condition Hypertension" }),
    ).toBeInTheDocument();
  });

  it("surfaces a load error without getting stuck on the loading state", async () => {
    getPatientMedicalBackground.mockRejectedValue(new Error("boom"));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ProblemOrientedMedicalSection
          patientId="pat-1"
          token="test-token"
          layout="desktop"
          mode="default"
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });
});
