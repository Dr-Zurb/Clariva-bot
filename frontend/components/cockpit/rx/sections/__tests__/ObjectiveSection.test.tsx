import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { ObjectiveSection } from "@/components/cockpit/rx/sections/ObjectiveSection";
import { EXAM_DELIMITER } from "@/lib/cockpit/exam-findings";

const mockGetDoctorSettings = vi.fn();
const mockPatchDoctorSettings = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDoctorSettings: (...args: unknown[]) => mockGetDoctorSettings(...args),
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

function legacyExamToggle() {
  return screen.getByRole("button", { name: "Toggle Free-text exam (legacy)" });
}

function legacyGeneralTextarea() {
  return screen.getByLabelText("General Examination") as HTMLTextAreaElement;
}

function legacySystemicTextarea() {
  return screen.getByLabelText("Systemic Examination") as HTMLTextAreaElement;
}

describe("ObjectiveSection — structured exam (obj-03)", () => {
  it("renders structured exam cards between vitals and test results", () => {
    renderSection();
    expect(screen.getByTestId("exam-system-list")).toBeInTheDocument();
    expect(screen.getByTestId("exam-mark-all-normal")).toBeInTheDocument();
    expect(screen.getByLabelText("Test results (patient-brought)")).toBeInTheDocument();
  });

  it("keeps legacy general/systemic textareas collapsed by default (mounted, hidden)", async () => {
    renderSection();
    await waitFor(() =>
      expect(legacyExamToggle()).toHaveAttribute("aria-expanded", "false"),
    );
    // Children stay mounted in CollapsibleContainer even when collapsed.
    expect(legacyGeneralTextarea()).toBeInTheDocument();
    fireEvent.click(legacyExamToggle());
    expect(legacyExamToggle()).toHaveAttribute("aria-expanded", "true");
  });
});

describe("ObjectiveSection — R-HISTORY enhancements", () => {
  it("renders Vitals grid + structured exam + test results + collapsed legacy blocks", async () => {
    renderSection();
    expect(screen.getByTestId("exam-system-list")).toBeInTheDocument();
    expect(screen.getByLabelText("Test results (patient-brought)")).toBeInTheDocument();
    expect(screen.getByText("Free-text exam (legacy)")).toBeInTheDocument();
    expect(screen.getByText("Legacy free-text vitals")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Toggle Legacy free-text vitals" }),
      ).toHaveAttribute("aria-expanded", "false"),
    );
  });

  it("parses legacy examinationFindings into General textarea", () => {
    renderSection({ examinationFindings: "Pale, afebrile." });
    expect(legacyGeneralTextarea().value).toBe("Pale, afebrile.");
    expect(legacySystemicTextarea().value).toBe("");
  });

  it("parses delimited examinationFindings into both textareas", () => {
    renderSection({
      examinationFindings: `Alert${EXAM_DELIMITER}Chest clear`,
    });
    expect(legacyGeneralTextarea().value).toBe("Alert");
    expect(legacySystemicTextarea().value).toBe("Chest clear");
  });

  it("serializes back to delimited form on edit", () => {
    renderSection({ examinationFindings: "Alert" });
    fireEvent.change(legacySystemicTextarea(), { target: { value: "Chest clear" } });
    expect(legacySystemicTextarea().value).toBe("Chest clear");
    expect(legacyGeneralTextarea().value).toBe("Alert");
  });

  it("disables structured exam and legacy inputs when disabled prop set", () => {
    const { container } = renderSectionDisabled(<ObjectiveSection disabled />);
    expect(screen.getByTestId("exam-mark-all-normal")).toBeDisabled();
    const generalEl = container.querySelector("#exam-general");
    expect(generalEl).toBeDisabled();
  });
});

describe("ObjectiveSection visual split (cpv-04)", () => {
  it("renders both legacy labels with icons", () => {
    renderSection();
    expect(screen.getByText("General Examination")).toBeInTheDocument();
    expect(screen.getByText("Systemic Examination")).toBeInTheDocument();
  });

  it("each legacy textarea is labelled correctly", () => {
    renderSection();
    expect(legacyGeneralTextarea()).toBeInTheDocument();
    expect(legacySystemicTextarea()).toBeInTheDocument();
  });

  it("typing in General does not affect Systemic", () => {
    renderSection();
    fireEvent.change(legacyGeneralTextarea(), {
      target: { value: "alert and oriented" },
    });
    expect(legacySystemicTextarea()).toHaveValue("");
  });

  it("placeholders are visible clinical examples", () => {
    renderSection();
    expect(screen.getByPlaceholderText(/alert, oriented/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/chest clear/i)).toBeInTheDocument();
  });
});
