/**
 * obj-12 — objective hide/unhide via the "Manage sections" menu: delta persist,
 * hydration, all-hidden empty-state, preview read-only, and a11y.
 */

import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
  type RxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { PrescriptionFormShellProvider } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { ObjectiveSection } from "@/components/cockpit/rx/sections/ObjectiveSection";
import type { RxFormProviderSetup } from "@/components/cockpit/rx/useRxFormProviderSetup";
import type { ObjectiveSectionId } from "@/lib/cockpit/objective-section-order";

const mockGetDoctorSettings = vi.fn();
const mockPatchDoctorSettings = vi.fn();
const mockUpdatePrescription = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDoctorSettings: (...args: unknown[]) => mockGetDoctorSettings(...args),
    patchDoctorSettings: (...args: unknown[]) => mockPatchDoctorSettings(...args),
    updatePrescription: (...args: unknown[]) => mockUpdatePrescription(...args),
    createPrescription: vi.fn(),
  };
});

const prescriptionIdRef = { current: "rx-1" as string | null };

function renderWithRxForm(
  ui: ReactElement,
  initialFields: RxFormFields = createEmptyRxFormFields(),
) {
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
      {ui}
    </RxFormProvider>,
  );
}

function renderWithShell(ui: ReactElement, shell: Partial<RxFormProviderSetup>) {
  const prescriptionIdRefLocal = { current: "rx-1" as string | null };
  const initialFields = createEmptyRxFormFields();
  const fullShell = {
    loading: false,
    initialFields,
    entryMode: "structured" as const,
    setEntryMode: vi.fn(),
    prescription: null,
    setPrescription: vi.fn(),
    prescriptionIdRef: prescriptionIdRefLocal,
    attachments: [],
    setAttachments: vi.fn(),
    setInitialFields: vi.fn(),
    generateInstanceIds: (n: number) => Array.from({ length: n }, (_, i) => `m-${i}`),
    instanceIdSeqRef: { current: 0 },
    medicineInstanceIds: ["m-0"],
    setMedicineInstanceIds: vi.fn(),
    subjectiveSectionOrder: [],
    setSubjectiveSectionOrder: vi.fn(),
    subjectiveSectionCollapsed: {},
    setSubjectiveSectionCollapsed: vi.fn(),
    subjectiveSectionHidden: [],
    setSubjectiveSectionHidden: vi.fn(),
    objectiveDefaults: null,
    setObjectiveDefaults: vi.fn(),
    providerProps: {
      key: "test",
      appointmentId: "appt-1",
      patientId: "pat-1",
      token: "test-token",
      entryMode: "structured" as const,
      initialFields,
      autosaveEnabled: false,
      prescriptionIdRef: prescriptionIdRefLocal,
      onPrescriptionCreated: vi.fn(),
    },
    ...shell,
  } satisfies RxFormProviderSetup;

  return render(
    <RxFormProvider
      appointmentId="appt-1"
      patientId="pat-1"
      token="test-token"
      entryMode="structured"
      initialFields={initialFields}
      autosaveEnabled={false}
      prescriptionIdRef={prescriptionIdRefLocal}
      onPrescriptionCreated={() => {}}
    >
      <PrescriptionFormShellProvider value={fullShell}>{ui}</PrescriptionFormShellProvider>
    </RxFormProvider>,
  );
}

function readRenderedSectionOrder(container: HTMLElement): ObjectiveSectionId[] {
  const root = container.querySelector('[aria-label="Objective"]')!;
  return Array.from(root.querySelectorAll("[data-objective-section-id]")).map(
    (el) => el.getAttribute("data-objective-section-id") as ObjectiveSectionId,
  );
}

function openMenu() {
  fireEvent.click(screen.getByTestId("objective-section-manager-trigger"));
}

async function hideSectionViaMenu(label: string) {
  if (!screen.queryByRole("button", { name: `Hide ${label}` })) {
    openMenu();
  }
  await waitFor(() => {
    expect(screen.getByRole("button", { name: `Hide ${label}` })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole("button", { name: `Hide ${label}` }));
}

function hiddenPatchCalls() {
  return mockPatchDoctorSettings.mock.calls.filter(
    (call) =>
      call[1] &&
      typeof call[1] === "object" &&
      "objective_section_hidden" in (call[1] as Record<string, unknown>),
  );
}

async function waitForSettingsLoaded() {
  await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());
}

beforeEach(() => {
  mockGetDoctorSettings.mockReset();
  mockPatchDoctorSettings.mockReset();
  mockUpdatePrescription.mockReset();
  mockGetDoctorSettings.mockResolvedValue({
    data: {
      settings: {
        objective_section_order: [],
        objective_section_collapsed: {},
        objective_section_hidden: [],
      },
    },
  });
  mockPatchDoctorSettings.mockImplementation(async (_token, payload) => ({
    data: {
      settings: {
        objective_section_order: payload.objective_section_order ?? [],
        objective_section_collapsed: payload.objective_section_collapsed ?? {},
        objective_section_hidden: payload.objective_section_hidden ?? [],
      },
    },
  }));
});

describe("ManageObjectiveSectionsMenu — hide/unhide (obj-12)", () => {
  it("autosaves delta-only hidden ids after hiding sections via the menu", async () => {
    const { container } = renderWithRxForm(<ObjectiveSection heading={null} />);
    await waitForSettingsLoaded();

    await hideSectionViaMenu("Test results");
    await hideSectionViaMenu("Legacy free-text vitals");

    await waitFor(
      () => {
        expect(hiddenPatchCalls().length).toBeGreaterThan(0);
        const last = hiddenPatchCalls().at(-1)?.[1] as {
          objective_section_hidden: string[];
        };
        expect(last.objective_section_hidden).toEqual(
          expect.arrayContaining(["test_results", "legacy_vitals"]),
        );
        expect(last.objective_section_hidden).not.toContain("vitals");
      },
      { timeout: 1500 },
    );

    const order = readRenderedSectionOrder(container);
    expect(order).not.toContain("test_results");
    expect(order).not.toContain("legacy_vitals");
    expect(order).toContain("vitals");
    expect(mockUpdatePrescription).not.toHaveBeenCalled();
  });

  it("hides the trigger count and updates label after hiding", async () => {
    renderWithRxForm(<ObjectiveSection heading={null} />);
    await waitForSettingsLoaded();

    expect(screen.getByTestId("objective-section-manager-trigger")).toHaveTextContent(
      "Manage sections",
    );

    await hideSectionViaMenu("Examination");

    await waitFor(() => {
      expect(screen.getByTestId("objective-section-manager-trigger")).toHaveTextContent(
        "1 hidden",
      );
    });
  });

  it("hydrates from a shell-provided hidden set without fetching", async () => {
    const { container } = renderWithShell(<ObjectiveSection heading={null} />, {
      objectiveDefaults: {
        sectionOrder: [],
        sectionCollapsed: {},
        sectionHidden: ["test_results", "legacy_exam"] as ObjectiveSectionId[],
        customSections: [],
      },
    });

    await waitFor(() => {
      const order = readRenderedSectionOrder(container);
      expect(order).not.toContain("test_results");
      expect(order).not.toContain("legacy_exam");
      expect(order).toContain("vitals");
    });
    expect(mockGetDoctorSettings).not.toHaveBeenCalled();
  });

  it("renders the all-hidden empty-state while keeping the menu reachable", async () => {
    renderWithShell(<ObjectiveSection heading={null} />, {
      objectiveDefaults: {
        sectionOrder: [],
        sectionCollapsed: {},
        sectionHidden: [
          "vitals",
          "exam",
          "test_results",
          "legacy_exam",
          "legacy_vitals",
        ] as ObjectiveSectionId[],
        customSections: [],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("objective-all-hidden-empty")).toBeInTheDocument();
      expect(screen.getByTestId("objective-section-manager-trigger")).toBeInTheDocument();
    });
  });

  it("does not autosave the hidden set when disabled, but keeps the menu reachable", async () => {
    renderWithRxForm(<ObjectiveSection heading={null} disabled />);
    await waitForSettingsLoaded();

    expect(hiddenPatchCalls()).toHaveLength(0);
    expect(screen.getByTestId("objective-section-manager-trigger")).toBeInTheDocument();

    openMenu();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Hide Vitals" })).toBeDisabled();
    });
  });

  it("exposes accessible toggle state (aria-pressed) for hide buttons", async () => {
    renderWithRxForm(<ObjectiveSection heading={null} />);
    await waitForSettingsLoaded();

    openMenu();
    const hideVitals = await screen.findByRole("button", { name: "Hide Vitals" });
    expect(hideVitals).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(hideVitals);
    const showVitals = await screen.findByRole("button", { name: "Show Vitals" });
    expect(showVitals).toHaveAttribute("aria-pressed", "true");
  });
});
