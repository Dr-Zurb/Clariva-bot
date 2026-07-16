import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { ObjectiveSection } from "@/components/cockpit/rx/sections/ObjectiveSection";

// vit-10..12 gave VitalsGrid doctor-scoped trend/demographics queries (needs a
// QueryClient); these tests cover ObjectiveSection layout, not vitals internals.
vi.mock("@/components/cockpit/rx/inputs/VitalsGrid", () => ({
  VitalsGrid: () => <div data-testid="vitals-grid-stub" />,
}));

vi.mock("@/components/cockpit/rx/inputs/ExamSystemList", () => ({
  ExamSystemList: ({ disabled }: { disabled?: boolean }) => (
    <div data-testid="exam-system-list">
      <button type="button" data-testid="exam-mark-all-normal" disabled={disabled}>
        Mark all normal
      </button>
    </div>
  ),
}));

const mockGetDoctorSettings = vi.fn();
const mockPatchDoctorSettings = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDoctorSettings: (...args: unknown[]) => mockGetDoctorSettings(...args),
    getAppointmentById: vi.fn().mockResolvedValue({ data: { appointment: { consultation_type: "in_clinic" } } }),
    patchDoctorSettings: (...args: unknown[]) => mockPatchDoctorSettings(...args),
    updatePrescription: vi.fn().mockResolvedValue({ data: {} }),
    createPrescription: vi.fn(),
  };
});

const prescriptionIdRef = { current: null as string | null };

beforeEach(() => {
  mockGetDoctorSettings.mockReset();
  mockPatchDoctorSettings.mockReset();
  mockGetDoctorSettings.mockResolvedValue({
    data: {
      settings: { objective_section_order: [], objective_section_collapsed: {} },
    },
  });
  mockPatchDoctorSettings.mockImplementation(async (_token, payload) => ({
    data: {
      settings: {
        objective_section_order: payload.objective_section_order ?? [],
        objective_section_collapsed: payload.objective_section_collapsed ?? {},
      },
    },
  }));
});

function renderSection(initial?: Partial<RxFormFields>) {
  const initialFields = {
    ...createEmptyRxFormFields(),
    ...initial,
  };

  return render(
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
      <ObjectiveSection />
    </RxFormProvider>,
  );
}

function renderSectionDisabled(ui: ReactElement) {
  return render(
    <RxFormProvider
      appointmentId="appt-1"
      patientId="pat-1"
      token="test-token"
      entryMode="structured"
      initialFields={createEmptyRxFormFields()}
      autosaveEnabled={false}
      prescriptionIdRef={prescriptionIdRef}
      onPrescriptionCreated={() => {}}
    >
      {ui}
    </RxFormProvider>,
  );
}

describe("ObjectiveSection — structured exam (obj-03)", () => {
  it("renders structured exam cards between vitals and reports", () => {
    renderSection();
    expect(screen.getByTestId("exam-system-list")).toBeInTheDocument();
    expect(screen.getByTestId("exam-mark-all-normal")).toBeInTheDocument();
    expect(screen.getByTestId("test-results-list")).toBeInTheDocument();
  });

  it("renders the Notes free-text section", () => {
    const { container } = renderSection();
    expect(
      container.querySelector('[data-objective-section-id="notes"]'),
    ).not.toBeNull();
    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.getByTestId("objective-notes-textarea")).toBeInTheDocument();
  });
});

describe("ObjectiveSection — R-HISTORY enhancements", () => {
  it("renders Vitals grid + structured exam + notes + reports", async () => {
    renderSection();
    expect(screen.getByTestId("exam-system-list")).toBeInTheDocument();
    expect(screen.getByTestId("test-results-list")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle Notes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle Reports" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Toggle Notes" })).toHaveAttribute(
        "aria-expanded",
        "true",
      ),
    );
  });

  it("disables structured exam when disabled prop set", () => {
    renderSectionDisabled(<ObjectiveSection disabled />);
    expect(screen.getByTestId("exam-mark-all-normal")).toBeDisabled();
  });
});
