import type { ReactElement } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { SubjectiveSection } from "@/components/cockpit/rx/sections/SubjectiveSection";
import {
  DEFAULT_SECTION_ORDER,
  normalizeSectionOrder,
  resolveAvailableSectionIds,
  type SubjectiveSectionId,
} from "@/lib/cockpit/subjective-section-order";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    updatePrescription: vi.fn().mockResolvedValue({ data: {} }),
    createPrescription: vi.fn(),
  };
});

vi.mock("@/components/ehr/sections/ProblemOrientedMedicalSection", () => ({
  default: () => <div data-testid="problem-oriented-stub" />,
}));

vi.mock("@/components/ehr/sections/AllergiesSection", () => ({
  default: () => <div data-testid="allergies-stub" />,
}));

const prescriptionIdRef = { current: "rx-1" as string | null };

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

function readRenderedSectionOrder(container: HTMLElement): SubjectiveSectionId[] {
  const root = container.querySelector("#rx-symptoms");
  expect(root).toBeTruthy();
  return Array.from(root!.querySelectorAll("[data-subjective-section-id]")).map(
    (el) => el.getAttribute("data-subjective-section-id") as SubjectiveSectionId,
  );
}

describe("SubjectiveSection section order (subj-23)", () => {
  it("renders fallback-mode sections in DEFAULT_SECTION_ORDER", () => {
    const { container } = renderWithRxForm(<SubjectiveSection heading={null} />);

    const available = resolveAvailableSectionIds(false);

    expect(readRenderedSectionOrder(container)).toEqual(
      normalizeSectionOrder(DEFAULT_SECTION_ORDER, available),
    );

    const root = container.querySelector("#rx-symptoms")!;
    expect(within(root).getByLabelText("Chief complaints")).toBeInTheDocument();
    expect(
      within(root).getByRole("button", { name: "Toggle Past surgical history" }),
    ).toBeInTheDocument();
    expect(within(root).getByText("Family history", { exact: true })).toBeInTheDocument();
    expect(
      within(root).getByText("Social / personal history", { exact: true }),
    ).toBeInTheDocument();
    expect(within(root).getByText("Free-text notes (optional)")).toBeInTheDocument();
    expect(within(root).getByTestId("custom-subsections-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("patient-background-zone")).not.toBeInTheDocument();
    expect(screen.queryByTestId("patient-allergies-zone")).not.toBeInTheDocument();
  });

  it("renders linked-chart sections in DEFAULT_SECTION_ORDER", () => {
    const { container } = renderWithRxForm(
      <SubjectiveSection heading={null} patientId="pat-1" token="test-token" />,
    );

    const available = resolveAvailableSectionIds(true);

    expect(readRenderedSectionOrder(container)).toEqual(
      normalizeSectionOrder(DEFAULT_SECTION_ORDER, available),
    );

    const root = container.querySelector("#rx-symptoms")!;
    expect(within(root).getByTestId("patient-background-zone")).toBeInTheDocument();
    expect(within(root).getByTestId("patient-allergies-zone")).toBeInTheDocument();
    expect(readRenderedSectionOrder(container)).not.toContain("past_surgical");
    expect(within(root).getByTestId("problem-oriented-stub")).toBeInTheDocument();
    expect(within(root).getByTestId("allergies-stub")).toBeInTheDocument();
  });

  it("keeps toolbar and heading outside the ordered section list", () => {
    const { container } = renderWithRxForm(<SubjectiveSection />);

    const root = container.querySelector("#rx-symptoms")!;
    const heading = root.querySelector("h3");
    const toolbar = root.querySelector(".flex.flex-wrap.items-center.justify-end");
    const firstOrdered = root.querySelector("[data-subjective-section-id]");

    expect(heading?.textContent).toBe("Subjective");
    expect(toolbar).toBeTruthy();
    expect(firstOrdered?.getAttribute("data-subjective-section-id")).toBe("chief_complaints");

    const children = Array.from(root.children);
    const headingIdx = children.indexOf(heading!);
    const toolbarIdx = children.indexOf(toolbar!);
    const firstOrderedIdx = children.indexOf(firstOrdered as Element);
    expect(headingIdx).toBeLessThan(firstOrderedIdx);
    expect(toolbarIdx).toBeLessThan(firstOrderedIdx);
    expect(toolbar!.closest("[data-subjective-section-id]")).toBeNull();
  });
});
