import type { ReactElement } from "react";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { SubjectiveSection } from "@/components/cockpit/rx/sections/SubjectiveSection";
import type { SubjectiveSectionId } from "@/lib/cockpit/subjective-section-order";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getDoctorSettings: vi.fn().mockResolvedValue({
      data: { settings: { subjective_section_order: [] } },
    }),
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

function getSectionReorderGrip(label: string) {
  return screen.getByRole("button", {
    name: new RegExp(`Reorder ${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
  });
}

function renameSectionViaPencil(displayName: string, newTitle: string) {
  fireEvent.click(screen.getByRole("button", { name: `Rename ${displayName}` }));
  const titleInput = screen.getByLabelText("Section title");
  fireEvent.change(titleInput, { target: { value: newTitle } });
  fireEvent.keyDown(titleInput, { key: "Enter" });
}

describe("SubjectiveSection reorder (subj-25)", () => {
  it("renders a reorder grip for each top-level section when enabled", () => {
    renderWithRxForm(<SubjectiveSection heading={null} />);

    expect(getSectionReorderGrip("Chief complaints")).toBeInTheDocument();
    expect(getSectionReorderGrip("Past surgical history")).toBeInTheDocument();
    expect(getSectionReorderGrip("Family history")).toBeInTheDocument();
    expect(getSectionReorderGrip("Social / personal history")).toBeInTheDocument();
    expect(getSectionReorderGrip("Free-text notes")).toBeInTheDocument();
  });

  it("renders one grip per custom block that reorders among subjective peers", async () => {
    const { container } = renderWithRxForm(<SubjectiveSection heading={null} />);

    fireEvent.click(screen.getByTestId("custom-subsections-add-first"));
    await waitFor(() => {
      expect(screen.getByLabelText("Section title")).toBeInTheDocument();
    });
    renameSectionViaPencil("Untitled section", "Menstrual history");

    expect(
      screen.getByRole("button", { name: /Reorder Menstrual history/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Move custom sections group/i }),
    ).not.toBeInTheDocument();

    const before = readRenderedSectionOrder(container);
    const menstrualIdx = before.findIndex((id) => id.startsWith("custom_block:"));
    expect(menstrualIdx).toBeGreaterThan(-1);

    const grip = getSectionReorderGrip("Menstrual history");
    grip.focus();
    fireEvent.keyDown(grip, { key: "ArrowUp" });

    const after = readRenderedSectionOrder(container);
    expect(after.indexOf(before[menstrualIdx]!)).toBeLessThan(menstrualIdx);
  });

  it("keyboard ArrowDown on a grip moves the section one slot down", () => {
    const { container } = renderWithRxForm(<SubjectiveSection heading={null} />);

    const before = readRenderedSectionOrder(container);
    expect(before.indexOf("family_history")).toBe(2);

    const familyGrip = getSectionReorderGrip("Family history");
    familyGrip.focus();
    fireEvent.keyDown(familyGrip, { key: "ArrowDown" });

    const after = readRenderedSectionOrder(container);
    expect(after.indexOf("family_history")).toBe(3);
    expect(after.indexOf("social_history")).toBe(2);
  });

  it("keyboard ArrowUp on a grip moves the section one slot up", () => {
    const { container } = renderWithRxForm(<SubjectiveSection heading={null} />);

    const socialGrip = getSectionReorderGrip("Social / personal history");
    socialGrip.focus();
    fireEvent.keyDown(socialGrip, { key: "ArrowUp" });

    const after = readRenderedSectionOrder(container);
    expect(after.indexOf("social_history")).toBe(2);
    expect(after.indexOf("family_history")).toBe(3);
  });

  it("hides reorder grips and blocks reorder when disabled", () => {
    const { container } = renderWithRxForm(<SubjectiveSection heading={null} disabled />);

    expect(screen.queryByTestId("subjective-section-drag-handle")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reorder/i })).not.toBeInTheDocument();

    const root = container.querySelector("#rx-symptoms")!;
    expect(within(root).getByLabelText("Chief complaints")).toBeInTheDocument();
  });

  it("does not put reorder grips on the fixed toolbar", () => {
    renderWithRxForm(<SubjectiveSection />);

    const toolbar = screen
      .getByTestId("subjective-template-trigger")
      .closest(".flex.flex-wrap.items-center.justify-end");
    expect(toolbar).toBeTruthy();
    expect(within(toolbar!).queryByTestId("subjective-section-drag-handle")).not.toBeInTheDocument();
  });
});
