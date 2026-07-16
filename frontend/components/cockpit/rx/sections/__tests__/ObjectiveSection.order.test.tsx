import type { ReactElement } from "react";
import { render, screen, within, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { ObjectiveSection } from "@/components/cockpit/rx/sections/ObjectiveSection";
import {
  DEFAULT_OBJECTIVE_SECTION_ORDER,
  normalizeSectionOrder,
  resolveAvailableSectionIds,
  type ObjectiveSectionId,
} from "@/lib/cockpit/objective-section-order";

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

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDoctorSettings: (...args: unknown[]) => mockGetDoctorSettings(...args),
    getAppointmentById: vi.fn().mockResolvedValue({ data: { appointment: { consultation_type: "in_clinic" } } }),
    patchDoctorSettings: vi.fn(),
  };
});

beforeEach(() => {
  mockGetDoctorSettings.mockReset();
  mockGetDoctorSettings.mockResolvedValue({
    data: {
      settings: {
        objective_section_order: [],
        objective_section_collapsed: {},
        objective_section_hidden: [],
        specialty: null,
      },
    },
  });
});

const prescriptionIdRef = { current: null as string | null };

function renderWithRxForm(ui: ReactElement) {
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

function readRenderedSectionOrder(container: HTMLElement): ObjectiveSectionId[] {
  const root = container.querySelector('[aria-label="Objective"]');
  expect(root).toBeTruthy();
  return Array.from(root!.querySelectorAll("[data-objective-section-id]")).map(
    (el) => el.getAttribute("data-objective-section-id") as ObjectiveSectionId,
  );
}

describe("ObjectiveSection section order (obj-09)", () => {
  it("renders sections in DEFAULT_OBJECTIVE_SECTION_ORDER", async () => {
    const { container } = renderWithRxForm(<ObjectiveSection />);

    const available = resolveAvailableSectionIds();

    await waitFor(() => {
      expect(readRenderedSectionOrder(container)).toEqual(
        normalizeSectionOrder(DEFAULT_OBJECTIVE_SECTION_ORDER, available),
      );
    });

    const root = container.querySelector('[aria-label="Objective"]')!;
    expect(within(root).getByText("Vitals", { exact: true })).toBeInTheDocument();
    expect(within(root).getByTestId("exam-system-list")).toBeInTheDocument();
    expect(within(root).getByTestId("test-results-list")).toBeInTheDocument();
    expect(within(root).getByText("Reports")).toBeInTheDocument();
    expect(within(root).queryByText("Free-text exam (legacy)")).not.toBeInTheDocument();
    expect(within(root).queryByText("Legacy free-text vitals")).not.toBeInTheDocument();
  });

  it("keeps heading outside the ordered section list", async () => {
    const { container } = renderWithRxForm(<ObjectiveSection />);

    await waitFor(() => {
      expect(
        container.querySelector("[data-objective-section-id]"),
      ).toBeInTheDocument();
    });

    const root = container.querySelector('[aria-label="Objective"]')!;
    const heading = root.querySelector("h3");
    const firstOrdered = root.querySelector("[data-objective-section-id]");

    expect(heading?.textContent).toBe("Objective");
    expect(firstOrdered?.getAttribute("data-objective-section-id")).toBe("vitals");

    const children = Array.from(root.children);
    const headingIdx = children.indexOf(heading!);
    const firstOrderedIdx = children.indexOf(firstOrdered as Element);
    expect(headingIdx).toBeLessThan(firstOrderedIdx);
    expect(heading!.closest("[data-objective-section-id]")).toBeNull();
  });

  it("omits heading shell when heading is null", async () => {
    const { container } = renderWithRxForm(<ObjectiveSection heading={null} />);

    await waitFor(() => {
      expect(readRenderedSectionOrder(container)[0]).toBe("vitals");
    });

    const root = container.querySelector('[aria-label="Objective"]')!;
    expect(root.querySelector("h3")).toBeNull();
  });
});

describe("objective-section-order merge (obj-09)", () => {
  it("normalizeSectionOrder returns canonical order when stored is empty", () => {
    const available = resolveAvailableSectionIds();
    expect(normalizeSectionOrder([], available)).toEqual(available);
    expect(normalizeSectionOrder(DEFAULT_OBJECTIVE_SECTION_ORDER, available)).toEqual(
      available,
    );
  });

  it("normalizeSectionOrder drops unknown ids and appends missing-available at canonical slots", () => {
    const available = resolveAvailableSectionIds();

    expect(
      normalizeSectionOrder(
        ["unknown_section", "vitals", "legacy_vitals", "vitals"] as ObjectiveSectionId[],
        available,
      ),
    ).toEqual(["vitals", "exam", "notes", "test_results"]);
  });

  it("normalizeSectionOrder preserves stored relative order for known ids", () => {
    const available = resolveAvailableSectionIds();

    expect(
      normalizeSectionOrder(["exam", "vitals", "test_results"], available),
    ).toEqual(["exam", "vitals", "notes", "test_results"]);
  });

  it("normalizeSectionOrder drops retired point_of_care / media / legacy ids (rpt-01)", () => {
    const available = resolveAvailableSectionIds();
    expect(
      normalizeSectionOrder(
        [
          "vitals",
          "point_of_care" as ObjectiveSectionId,
          "media" as ObjectiveSectionId,
          "legacy_exam" as ObjectiveSectionId,
          "legacy_vitals" as ObjectiveSectionId,
          "exam",
        ],
        available,
      ),
    ).toEqual(["vitals", "exam", "notes", "test_results"]);
  });
});
