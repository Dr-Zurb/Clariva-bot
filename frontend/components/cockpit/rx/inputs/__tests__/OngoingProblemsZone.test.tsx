import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { OngoingProblemsZone } from "@/components/cockpit/rx/inputs/OngoingProblemsZone";
import { DiagnosisRowsList } from "@/components/cockpit/rx/inputs/DiagnosisRowsList";
import type { PatientChronicCondition } from "@/types/patient-chart";
import type { RxFormFields } from "@/components/cockpit/rx/RxFormContext";
import type { DiagnosisRow } from "@/types/prescription";

const listPatientConditions = vi.fn();
const updatePatientCondition = vi.fn();
const archivePatientCondition = vi.fn();
const createPatientCondition = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    listPatientConditions: (...args: unknown[]) => listPatientConditions(...args),
    updatePatientCondition: (...args: unknown[]) => updatePatientCondition(...args),
    archivePatientCondition: (...args: unknown[]) => archivePatientCondition(...args),
    createPatientCondition: (...args: unknown[]) => createPatientCondition(...args),
  };
});

vi.mock("@/lib/api/diagnosis-catalog", () => ({
  searchDiagnoses: vi.fn().mockResolvedValue({
    success: true,
    data: { results: [] },
    meta: { timestamp: "", requestId: "" },
  }),
}));

vi.mock("@/lib/api/diagnosis-parse", () => ({
  resolveDiagnosisWithAI: vi.fn().mockResolvedValue({
    success: true,
    data: { suggestions: [] },
    meta: { timestamp: "", requestId: "" },
  }),
}));

const prescriptionIdRef = { current: null as string | null };

const HTN: PatientChronicCondition = {
  id: "550e8400-e29b-41d4-a716-446655440011",
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
};

const GOUT: PatientChronicCondition = {
  ...HTN,
  id: "550e8400-e29b-41d4-a716-446655440022",
  condition: "Gout",
};

// Mutable server-side snapshot so an invalidate → refetch reflects the write
// (the two condition surfaces now share one query cache).
let serverConditions: PatientChronicCondition[] = [];

function renderZone(
  ui: ReactElement,
  initialFields: RxFormFields = createEmptyRxFormFields(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={initialFields}
        autosaveEnabled={false}
        prescriptionIdRef={prescriptionIdRef}
        onPrescriptionCreated={() => {}}
      >
        {ui}
      </RxFormProvider>
    </QueryClientProvider>,
  );
}

describe("OngoingProblemsZone", () => {
  beforeEach(() => {
    listPatientConditions.mockReset();
    updatePatientCondition.mockReset();
    archivePatientCondition.mockReset();
    createPatientCondition.mockReset();
    serverConditions = [{ ...HTN }];
    listPatientConditions.mockImplementation(async () => ({
      success: true,
      data: { conditions: serverConditions },
    }));
    createPatientCondition.mockImplementation(
      async (
        _token: string,
        _patientId: string,
        payload: {
          condition: string;
          status?: PatientChronicCondition["status"];
          code?: string | null;
          codeTitle?: string | null;
        },
      ) => {
        const created: PatientChronicCondition = {
          ...HTN,
          id: `cond-new-${serverConditions.length + 1}`,
          condition: payload.condition,
          status: payload.status ?? "active",
          acuity: null,
          code: payload.code ?? null,
          code_title: payload.codeTitle ?? null,
          note: null,
        };
        serverConditions = [...serverConditions, created];
        return { success: true, data: { condition: created } };
      },
    );
    updatePatientCondition.mockImplementation(
      async (
        _token: string,
        _patientId: string,
        id: string,
        patch: Partial<PatientChronicCondition>,
      ) => {
        serverConditions = serverConditions.map((c) =>
          c.id === id ? { ...c, ...patch } : c,
        );
        return {
          success: true,
          data: { condition: serverConditions.find((c) => c.id === id) },
        };
      },
    );
    archivePatientCondition.mockImplementation(
      async (_token: string, _patientId: string, id: string) => {
        serverConditions = serverConditions.map((c) =>
          c.id === id ? { ...c, archived_at: "2026-07-09T00:00:00Z" } : c,
        );
        return {
          success: true,
          data: { condition: serverConditions.find((c) => c.id === id) },
        };
      },
    );
  });

  it("loads active PMH conditions under a flat Known conditions heading", async () => {
    renderZone(<OngoingProblemsZone />);
    await waitFor(() => {
      expect(screen.getByTestId("ongoing-problems-zone")).toBeInTheDocument();
    });
    expect(screen.getByText("Known conditions")).toBeInTheDocument();
    // No outer collapsible toggle.
    expect(
      screen.queryByRole("button", { name: /toggle known conditions/i }),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId(`ongoing-problem-${HTN.id}`)).toBeInTheDocument();
    });
    expect(listPatientConditions).toHaveBeenCalledWith("test-token", "pat-1");
    expect(screen.getByDisplayValue("Hypertension")).toBeInTheDocument();
    expect(screen.getByTestId(`known-condition-status-${HTN.id}`)).toBeInTheDocument();
  });

  it("renames a condition via updatePatientCondition on blur", async () => {
    renderZone(<OngoingProblemsZone />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Hypertension")).toBeInTheDocument();
    });
    const input = screen.getByDisplayValue("Hypertension");
    fireEvent.change(input, { target: { value: "Essential hypertension" } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(updatePatientCondition).toHaveBeenCalledWith(
        "test-token",
        "pat-1",
        HTN.id,
        { condition: "Essential hypertension" },
      );
    });
  });

  it("marks Past via status chip and drops the card from the active list", async () => {
    renderZone(<OngoingProblemsZone />);
    await waitFor(() => {
      expect(screen.getByTestId(`ongoing-problem-${HTN.id}-toggle`)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(`ongoing-problem-${HTN.id}-toggle`));
    await waitFor(() => {
      expect(screen.getByTestId(`known-condition-status-${HTN.id}`)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Past" }));
    await waitFor(() => {
      expect(updatePatientCondition).toHaveBeenCalledWith(
        "test-token",
        "pat-1",
        HTN.id,
        { status: "resolved" },
      );
    });
    await waitFor(() => {
      expect(
        screen.queryByTestId(`ongoing-problem-${HTN.id}`),
      ).not.toBeInTheDocument();
    });
  });

  it("saves a note via updatePatientCondition on blur", async () => {
    renderZone(<OngoingProblemsZone />);
    await waitFor(() => {
      expect(
        screen.getByLabelText(`Note for ${HTN.condition}`),
      ).toBeInTheDocument();
    });
    const note = screen.getByLabelText(`Note for ${HTN.condition}`);
    fireEvent.change(note, { target: { value: "On amlodipine" } });
    fireEvent.blur(note);
    await waitFor(() => {
      expect(updatePatientCondition).toHaveBeenCalledWith(
        "test-token",
        "pat-1",
        HTN.id,
        { note: "On amlodipine" },
      );
    });
  });

  it("archives a condition on remove", async () => {
    renderZone(<OngoingProblemsZone />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /remove hypertension/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /remove hypertension/i }));
    await waitFor(() => {
      expect(archivePatientCondition).toHaveBeenCalledWith(
        "test-token",
        "pat-1",
        HTN.id,
      );
    });
    await waitFor(() => {
      expect(
        screen.queryByTestId(`ongoing-problem-${HTN.id}`),
      ).not.toBeInTheDocument();
    });
  });

  it("drops the card immediately and restores it when archive fails", async () => {
    let rejectArchive: ((err: Error) => void) | null = null;
    archivePatientCondition.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectArchive = reject;
        }),
    );
    renderZone(<OngoingProblemsZone />);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /remove hypertension/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /remove hypertension/i }));
    // Optimistic drop — gone before the network settles.
    await waitFor(() => {
      expect(
        screen.queryByTestId(`ongoing-problem-${HTN.id}`),
      ).not.toBeInTheDocument();
    });
    rejectArchive?.(new Error("network down"));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("network down");
    });
    expect(screen.getByTestId(`ongoing-problem-${HTN.id}`)).toBeInTheDocument();
  });

  it("sets acuity via the chip and persists it", async () => {
    renderZone(<OngoingProblemsZone />);
    await waitFor(() => {
      expect(screen.getByTestId(`ongoing-problem-${HTN.id}-toggle`)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(`ongoing-problem-${HTN.id}-toggle`));
    await waitFor(() => {
      expect(
        screen.getByTestId(`known-condition-acuity-${HTN.id}`),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Stable" }));
    await waitFor(() => {
      expect(updatePatientCondition).toHaveBeenCalledWith(
        "test-token",
        "pat-1",
        HTN.id,
        { acuity: "stable" },
      );
    });
  });

  it("adds a condition from Assessment via createPatientCondition and shows it", async () => {
    renderZone(<OngoingProblemsZone />);
    await waitFor(() => {
      expect(screen.getByTestId("known-condition-add")).toBeInTheDocument();
    });
    const add = screen.getByTestId("known-condition-add");
    fireEvent.change(add, { target: { value: "Gout" } });
    fireEvent.keyDown(add, { key: "Enter" });
    await waitFor(() => {
      expect(createPatientCondition).toHaveBeenCalledWith("test-token", "pat-1", {
        condition: "Gout",
        status: "active",
        code: null,
        codeTitle: null,
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Gout")).toBeInTheDocument();
    });
    const created = serverConditions.find((c) => c.condition === "Gout");
    expect(created).toBeDefined();
    expect(screen.getByTestId(`ongoing-problem-${created!.id}`)).toHaveAttribute(
      "data-open",
      "false",
    );
  });

  it("adds an ICD-mapped quick-add chip with code", async () => {
    serverConditions = [];
    renderZone(<OngoingProblemsZone />);
    const group = await screen.findByTestId("known-condition-quick-add");
    fireEvent.click(within(group).getByRole("button", { name: /\+ Asthma/i }));
    await waitFor(() => {
      expect(createPatientCondition).toHaveBeenCalledWith("test-token", "pat-1", {
        condition: "Asthma",
        status: "active",
        code: "CA23",
        codeTitle: "Asthma",
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Asthma")).toBeInTheDocument();
      expect(screen.getByText("CA23")).toBeInTheDocument();
    });
  });

  it("keeps add controls enabled and shows the card immediately while create is in flight", async () => {
    serverConditions = [];
    let resolveCreate!: (value: unknown) => void;
    createPatientCondition.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );

    renderZone(<OngoingProblemsZone />);
    const group = await screen.findByTestId("known-condition-quick-add");
    fireEvent.click(within(group).getByRole("button", { name: /\+ Asthma/i }));

    // Optimistic card appears before the network resolves.
    await waitFor(() => {
      expect(screen.getByText("Asthma")).toBeInTheDocument();
    });
    expect(screen.getByTestId("known-condition-add")).not.toBeDisabled();
    expect(
      within(group).getByRole("button", { name: /\+ Type 2 diabetes/i }),
    ).not.toBeDisabled();

    resolveCreate({
      success: true,
      data: {
        condition: {
          ...HTN,
          id: "cond-new-asthma",
          condition: "Asthma",
          code: "CA23",
          code_title: "Asthma",
          note: null,
        } satisfies PatientChronicCondition,
      },
    });
    serverConditions = [
      {
        ...HTN,
        id: "cond-new-asthma",
        condition: "Asthma",
        code: "CA23",
        code_title: "Asthma",
        note: null,
      },
    ];

    await waitFor(() => {
      expect(screen.getByTestId("ongoing-problem-cond-new-asthma")).toBeInTheDocument();
    });
  });

  it("shows a newly added condition at the top of the list immediately", async () => {
    serverConditions = [{ ...HTN }];
    let resolveCreate!: (value: unknown) => void;
    createPatientCondition.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );

    renderZone(<OngoingProblemsZone />);
    await waitFor(() => {
      expect(screen.getByTestId(`ongoing-problem-${HTN.id}`)).toBeInTheDocument();
    });

    const group = screen.getByTestId("known-condition-quick-add");
    fireEvent.click(within(group).getByRole("button", { name: /\+ Asthma/i }));

    await waitFor(() => {
      const items = within(
        screen.getByTestId("ongoing-problems-list"),
      ).getAllByRole("listitem");
      expect(items[0]).toHaveTextContent("Asthma");
      expect(items[1]).toHaveTextContent("Hypertension");
    });

    resolveCreate({
      success: true,
      data: {
        condition: {
          ...HTN,
          id: "cond-new-asthma",
          condition: "Asthma",
          code: "CA23",
          code_title: "Asthma",
          note: null,
        } satisfies PatientChronicCondition,
      },
    });
    serverConditions = [
      {
        ...HTN,
        id: "cond-new-asthma",
        condition: "Asthma",
        code: "CA23",
        code_title: "Asthma",
        note: null,
      },
      { ...HTN },
    ];

    await waitFor(() => {
      const items = within(
        screen.getByTestId("ongoing-problems-list"),
      ).getAllByRole("listitem");
      expect(
        within(items[0]).getByTestId("ongoing-problem-cond-new-asthma"),
      ).toBeInTheDocument();
      expect(items[1]).toHaveTextContent("Hypertension");
    });
  });

  it("skips creating a duplicate active condition (case-insensitive)", async () => {
    serverConditions = [{ ...GOUT }];
    renderZone(<OngoingProblemsZone />);
    await waitFor(() => {
      expect(screen.getByTestId(`ongoing-problem-${GOUT.id}`)).toBeInTheDocument();
    });
    const add = screen.getByTestId("known-condition-add");
    fireEvent.change(add, { target: { value: "gout" } });
    fireEvent.keyDown(add, { key: "Enter" });
    // Existing active row (case-insensitive) — create must not fire.
    await waitFor(() => {
      expect(createPatientCondition).not.toHaveBeenCalled();
    });
  });

  it("stamps conditionId onto a matching visit diagnosis after known-condition add", async () => {
    serverConditions = [];
    const goutDx: DiagnosisRow = {
      id: "dx-gout-1",
      label: "Gout",
      kind: "primary",
      certainty: "provisional",
      status: "new",
      note: null,
      acuity: null,
      conditionId: null,
    };
    renderZone(
      <>
        <OngoingProblemsZone />
        <DiagnosisRowsList />
      </>,
      {
        ...createEmptyRxFormFields(),
        diagnoses: [goutDx],
        provisionalDiagnosis: "Gout",
      },
    );
    expect(
      screen.queryByTestId("diagnosis-known-badge-dx-gout-1"),
    ).not.toBeInTheDocument();

    const add = await screen.findByTestId("known-condition-add");
    fireEvent.change(add, { target: { value: "Gout" } });
    fireEvent.keyDown(add, { key: "Enter" });

    await waitFor(() => {
      expect(createPatientCondition).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(
        screen.getByTestId("diagnosis-known-badge-dx-gout-1"),
      ).toBeInTheDocument();
    });
  });

  it("clears Known badge on visit diagnosis when known condition is removed", async () => {
    serverConditions = [{ ...GOUT }];
    const goutDx: DiagnosisRow = {
      id: "dx-gout-1",
      label: "Gout",
      kind: "primary",
      certainty: "provisional",
      status: "new",
      note: null,
      acuity: null,
      conditionId: GOUT.id,
    };
    renderZone(
      <>
        <OngoingProblemsZone />
        <DiagnosisRowsList />
      </>,
      {
        ...createEmptyRxFormFields(),
        diagnoses: [goutDx],
        provisionalDiagnosis: "Gout",
      },
    );
    await waitFor(() => {
      expect(
        screen.getByTestId("diagnosis-known-badge-dx-gout-1"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`ongoing-problem-${GOUT.id}-remove`));

    await waitFor(() => {
      expect(
        screen.queryByTestId("diagnosis-known-badge-dx-gout-1"),
      ).not.toBeInTheDocument();
    });
    expect(archivePatientCondition).toHaveBeenCalledWith(
      "test-token",
      "pat-1",
      GOUT.id,
    );
  });
});
