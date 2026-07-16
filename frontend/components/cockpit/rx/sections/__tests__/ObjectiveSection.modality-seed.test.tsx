/**
 * obj-14 (OBJ-D6) — modality/specialty default seed wired through the shell.
 *
 * Proves the view-only contract end-to-end in <ObjectiveSection>:
 *   - the seed sets the DEFAULT visible layout (order + hidden) when the doctor
 *     has no override;
 *   - a doctor override wins WHOLESALE over the seed (P3-D5);
 *   - the seed is never persisted on mount (no autosave fires from it alone).
 */

import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { PrescriptionFormShellProvider } from "@/components/cockpit/rx/PrescriptionFormShellContext";
import { ObjectiveSection } from "@/components/cockpit/rx/sections/ObjectiveSection";
import type {
  DoctorObjectiveDefaults,
  RxFormProviderSetup,
} from "@/components/cockpit/rx/useRxFormProviderSetup";
import { resolveDefaultLayout } from "@/lib/cockpit/objective-default-layout";
import type { ObjectiveSectionId } from "@/lib/cockpit/objective-section-order";

// vit-10..12 gave VitalsGrid doctor-scoped trend/demographics queries (needs a
// QueryClient); these tests cover ObjectiveSection layout, not vitals internals.
vi.mock("@/components/cockpit/rx/inputs/VitalsGrid", () => ({
  VitalsGrid: () => <div data-testid="vitals-grid-stub" />,
}));

const mockGetDoctorSettings = vi.fn();
const mockPatchDoctorSettings = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDoctorSettings: (...args: unknown[]) => mockGetDoctorSettings(...args),
    patchDoctorSettings: (...args: unknown[]) => mockPatchDoctorSettings(...args),
    updatePrescription: vi.fn(),
    createPrescription: vi.fn(),
  };
});

const EMPTY_DEFAULTS: DoctorObjectiveDefaults = {
  sectionOrder: [],
  sectionCollapsed: {},
  sectionHidden: [],
  customSections: [],
};

beforeEach(() => {
  mockGetDoctorSettings.mockReset();
  mockPatchDoctorSettings.mockReset();
  mockGetDoctorSettings.mockResolvedValue({ data: { settings: {} } });
  mockPatchDoctorSettings.mockResolvedValue({ data: { settings: {} } });
});

function renderWithShell(shell: Partial<RxFormProviderSetup>) {
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
    objectiveDefaults: EMPTY_DEFAULTS,
    setObjectiveDefaults: vi.fn(),
    planDefaults: null,
    setPlanDefaults: vi.fn(),
    assessmentDefaults: null,
    setAssessmentDefaults: vi.fn(),
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

  const ui: ReactElement = (
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
      <PrescriptionFormShellProvider value={fullShell}>
        <ObjectiveSection />
      </PrescriptionFormShellProvider>
    </RxFormProvider>
  );
  return render(ui);
}

function renderedOrder(container: HTMLElement): ObjectiveSectionId[] {
  const root = container.querySelector('[aria-label="Objective"]')!;
  return Array.from(root.querySelectorAll("[data-objective-section-id]")).map(
    (el) => el.getAttribute("data-objective-section-id") as ObjectiveSectionId,
  );
}

describe("obj-14 · modality/specialty seed wiring (OBJ-D6)", () => {
  it("applies the video seed default: full registry visible (nothing hidden)", async () => {
    const { container } = renderWithShell({
      objectiveSeed: resolveDefaultLayout({ modality: "video" }),
    });

    await waitFor(() => expect(renderedOrder(container)).toContain("vitals"));
    const order = renderedOrder(container);
    expect(order).toEqual(["vitals", "exam", "notes", "test_results"]);
    expect(order).toContain("exam");
    expect(order).toContain("test_results");
  });

  it("applies the voice seed default: test results lead, uploads visible, structured exam hidden", async () => {
    const { container } = renderWithShell({
      objectiveSeed: resolveDefaultLayout({ modality: "voice" }),
    });

    await waitFor(() => expect(renderedOrder(container)[0]).toBe("test_results"));
    const order = renderedOrder(container);
    // rpt-01: async = Reports lead + vitals + notes; exam hidden (media lives inside Reports).
    expect(order).toEqual(["test_results", "vitals", "notes"]);
    expect(order).not.toContain("exam");
  });

  it("a doctor override wins wholesale over the seed (notes stay visible)", async () => {
    const { container } = renderWithShell({
      objectiveDefaults: {
        ...EMPTY_DEFAULTS,
        // Doctor reordered exam-first and hid only test_results; notes remain visible.
        sectionOrder: ["exam", "vitals", "notes", "test_results"],
        sectionHidden: ["test_results"],
      },
      objectiveSeed: resolveDefaultLayout({ modality: "voice" }),
    });

    await waitFor(() => expect(renderedOrder(container)[0]).toBe("exam"));
    // Override hidden wins wholesale → exam the seed would hide stays visible; notes kept.
    expect(renderedOrder(container)).toEqual([
      "exam",
      "vitals",
      "notes",
    ]);
  });

  it("never persists the seed on mount (no autosave from the seed alone)", async () => {
    const { container } = renderWithShell({
      objectiveSeed: resolveDefaultLayout({ modality: "voice" }),
    });

    await waitFor(() => expect(renderedOrder(container)[0]).toBe("test_results"));
    // Give any debounced autosave a chance to (not) fire.
    await new Promise((r) => setTimeout(r, 50));

    const seedPersistCalls = mockPatchDoctorSettings.mock.calls.filter(
      (c) =>
        c[1] &&
        ("objective_section_hidden" in c[1] || "objective_section_order" in c[1]),
    );
    expect(seedPersistCalls).toEqual([]);
  });
});
