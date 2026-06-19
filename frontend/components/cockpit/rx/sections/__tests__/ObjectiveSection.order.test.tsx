import type { ReactElement } from "react";
import { render, screen, within } from "@testing-library/react";
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

const mockGetDoctorSettings = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDoctorSettings: (...args: unknown[]) => mockGetDoctorSettings(...args),
    patchDoctorSettings: vi.fn(),
  };
});

beforeEach(() => {
  mockGetDoctorSettings.mockReset();
  mockGetDoctorSettings.mockResolvedValue({
    data: { settings: { objective_section_order: [], objective_section_collapsed: {} } },
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
  it("renders sections in DEFAULT_OBJECTIVE_SECTION_ORDER", () => {
    const { container } = renderWithRxForm(<ObjectiveSection />);

    const available = resolveAvailableSectionIds();

    expect(readRenderedSectionOrder(container)).toEqual(
      normalizeSectionOrder(DEFAULT_OBJECTIVE_SECTION_ORDER, available),
    );

    const root = container.querySelector('[aria-label="Objective"]')!;
    expect(within(root).getByText("Vitals", { exact: true })).toBeInTheDocument();
    expect(within(root).getByTestId("exam-system-list")).toBeInTheDocument();
    expect(within(root).getByLabelText("Test results (patient-brought)")).toBeInTheDocument();
    expect(within(root).getByText("Free-text exam (legacy)")).toBeInTheDocument();
    expect(within(root).getByText("Legacy free-text vitals")).toBeInTheDocument();
  });

  it("keeps heading outside the ordered section list", () => {
    const { container } = renderWithRxForm(<ObjectiveSection />);

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

  it("omits heading shell when heading is null", () => {
    const { container } = renderWithRxForm(<ObjectiveSection heading={null} />);

    const root = container.querySelector('[aria-label="Objective"]')!;
    expect(root.querySelector("h3")).toBeNull();
    expect(readRenderedSectionOrder(container)[0]).toBe("vitals");
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
        ["unknown_section", "vitals", "legacy_exam", "vitals"],
        available,
      ),
    ).toEqual([
      "vitals",
      "exam",
      "test_results",
      "legacy_exam",
      "legacy_vitals",
    ]);
  });

  it("normalizeSectionOrder preserves stored relative order for known ids", () => {
    const available = resolveAvailableSectionIds();

    expect(
      normalizeSectionOrder(
        ["legacy_vitals", "vitals", "test_results"],
        available,
      ),
    ).toEqual([
      "legacy_vitals",
      "vitals",
      "exam",
      "test_results",
      "legacy_exam",
    ]);
  });
});
