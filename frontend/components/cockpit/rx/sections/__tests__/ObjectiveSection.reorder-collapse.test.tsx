/**
 * obj-11 — objective reorder (keyboard) + collapse-memory persistence + merge.
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

function orderPatchCalls() {
  return mockPatchDoctorSettings.mock.calls.filter(
    (call) =>
      call[1] &&
      typeof call[1] === "object" &&
      "objective_section_order" in (call[1] as Record<string, unknown>),
  );
}

function collapsePatchCalls() {
  return mockPatchDoctorSettings.mock.calls.filter(
    (call) =>
      call[1] &&
      typeof call[1] === "object" &&
      "objective_section_collapsed" in (call[1] as Record<string, unknown>),
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
    data: { settings: { objective_section_order: [], objective_section_collapsed: {} } },
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

describe("ObjectiveSection reorder (obj-11)", () => {
  it("moves a section down with ArrowDown on the grip and persists the order", async () => {
    const { container } = renderWithRxForm(<ObjectiveSection heading={null} />);
    await waitForSettingsLoaded();

    expect(readRenderedSectionOrder(container)).toEqual([
      "vitals",
      "exam",
      "test_results",
      "legacy_exam",
      "legacy_vitals",
    ]);

    const grip = screen.getByRole("button", { name: /Reorder Vitals/i });
    fireEvent.keyDown(grip, { key: "ArrowDown" });

    expect(readRenderedSectionOrder(container)).toEqual([
      "exam",
      "vitals",
      "test_results",
      "legacy_exam",
      "legacy_vitals",
    ]);

    await waitFor(
      () => {
        const last = orderPatchCalls().at(-1)?.[1] as {
          objective_section_order: ObjectiveSectionId[];
        };
        expect(last.objective_section_order).toEqual([
          "exam",
          "vitals",
          "test_results",
          "legacy_exam",
          "legacy_vitals",
        ]);
      },
      { timeout: 1500 },
    );
  });

  it("hydrates a stored order from the shell and merges stale/unknown ids (no section lost)", async () => {
    const { container } = renderWithShell(<ObjectiveSection heading={null} />, {
      objectiveDefaults: {
        // stale unknown id + a missing-but-available `exam` + duplicate
        sectionOrder: ["legacy_vitals", "bogus_section", "vitals", "vitals"] as ObjectiveSectionId[],
        sectionCollapsed: {},
        sectionHidden: [],
        customSections: [],
      },
    });

    await waitFor(() => {
      const order = readRenderedSectionOrder(container);
      // unknown dropped, dupes removed, missing appended at canonical slots — all 5 present.
      expect(order).toHaveLength(5);
      expect(new Set(order)).toEqual(
        new Set(["vitals", "exam", "test_results", "legacy_exam", "legacy_vitals"]),
      );
      expect(order[0]).toBe("legacy_vitals");
    });
    expect(mockGetDoctorSettings).not.toHaveBeenCalled();
  });

  it("does not autosave order when disabled", async () => {
    renderWithRxForm(<ObjectiveSection heading={null} disabled />);
    await waitForSettingsLoaded();
    expect(screen.queryByRole("button", { name: /Reorder Vitals/i })).not.toBeInTheDocument();
    expect(orderPatchCalls()).toHaveLength(0);
  });
});

describe("ObjectiveSection collapse-memory (obj-11)", () => {
  it("opens vitals/exam by default and collapses legacy blocks", async () => {
    renderWithRxForm(<ObjectiveSection heading={null} />);
    await waitForSettingsLoaded();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Toggle Vitals" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    });
    expect(screen.getByRole("button", { name: "Toggle Examination" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Toggle Free-text exam (legacy)" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("autosaves delta-only collapse overrides after toggling sections", async () => {
    renderWithRxForm(<ObjectiveSection heading={null} />);
    await waitForSettingsLoaded();

    const vitalsToggle = await screen.findByRole("button", { name: "Toggle Vitals" });
    await waitFor(() => expect(vitalsToggle).toHaveAttribute("aria-expanded", "true"));
    fireEvent.click(vitalsToggle); // vitals: true -> false (delta)

    const legacyToggle = screen.getByRole("button", { name: "Toggle Free-text exam (legacy)" });
    fireEvent.click(legacyToggle); // legacy_exam: false -> true (delta)

    await waitFor(
      () => {
        const last = collapsePatchCalls().at(-1)?.[1] as {
          objective_section_collapsed: Record<string, boolean>;
        };
        expect(last.objective_section_collapsed).toEqual({
          vitals: false,
          legacy_exam: true,
        });
        expect(last.objective_section_collapsed).not.toHaveProperty("exam");
      },
      { timeout: 1500 },
    );
    expect(mockUpdatePrescription).not.toHaveBeenCalled();
  });

  it("hydrates collapse state from the shell without fetching", async () => {
    renderWithShell(<ObjectiveSection heading={null} />, {
      objectiveDefaults: {
        sectionOrder: [],
        sectionCollapsed: { vitals: false, legacy_exam: true },
        sectionHidden: [],
        customSections: [],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Toggle Vitals" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      expect(
        screen.getByRole("button", { name: "Toggle Free-text exam (legacy)" }),
      ).toHaveAttribute("aria-expanded", "true");
    });
    expect(mockGetDoctorSettings).not.toHaveBeenCalled();
  });

  it("does not autosave collapse overrides when disabled", async () => {
    renderWithRxForm(<ObjectiveSection heading={null} disabled />);
    await waitForSettingsLoaded();
    expect(collapsePatchCalls()).toHaveLength(0);
  });
});
