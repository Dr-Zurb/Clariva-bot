/**
 * subj-27 close-gate — Subjective-tab reorder a11y + integration sweep.
 *
 * Phase 8 ships a UI-only reorder. This sweep proves the reorder chrome is
 * keyboard-operable and accessible, that `disabled` mode suppresses it, and
 * that conditional sections (linked PMH/allergies vs past-surgical fallback)
 * reorder + persist in both modes — all WITHOUT writing to the prescription
 * (so patient-facing output stays untouched; the byte-parity is proven on the
 * backend in `section-order-output-parity.test.ts`).
 */

import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { SubjectiveSection } from "@/components/cockpit/rx/sections/SubjectiveSection";
import type { SubjectiveSectionId } from "@/lib/cockpit/subjective-section-order";

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

describe("subj-27 · Subjective reorder a11y + integration sweep", () => {
  beforeEach(() => {
    mockGetDoctorSettings.mockReset();
    mockPatchDoctorSettings.mockReset();
    mockUpdatePrescription.mockReset();
    mockGetDoctorSettings.mockResolvedValue({
      data: {
        settings: {
          subjective_section_order: [],
          subjective_section_collapsed: {},
          subjective_section_hidden: [],
        },
      },
    });
  });

  it("every grip is keyboard-focusable with a clear, action-describing aria-label", async () => {
    renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    const grips = screen.getAllByTestId("subjective-section-drag-handle");
    expect(grips.length).toBeGreaterThan(0);
    for (const grip of grips) {
      expect(grip).toHaveAttribute("role", "button");
      expect(grip).toHaveAttribute("tabindex", "0");
      const label = grip.getAttribute("aria-label") ?? "";
      expect(label).toMatch(/^Reorder .+\. Use arrow keys to move\.$/);
    }
  });

  it("focus order is sane: each section's grip precedes its content in the DOM", async () => {
    const { container } = renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    const root = container.querySelector("#rx-symptoms")!;
    const shells = root.querySelectorAll("[data-subjective-section-id]");
    expect(shells.length).toBeGreaterThan(0);
    for (const shell of Array.from(shells)) {
      const grip = shell.querySelector('[data-testid="subjective-section-drag-handle"]');
      expect(grip).toBeTruthy();
      // The grip must come before the section body in document order so a
      // keyboard user reaches the reorder control first.
      expect(
        shell.compareDocumentPosition(grip!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("is fully keyboard-operable: reorder autosaves settings only, never the prescription", async () => {
    mockPatchDoctorSettings.mockResolvedValue({
      data: { settings: { subjective_section_order: [] } },
    });

    const { container } = renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    const familyGrip = getSectionReorderGrip("Family history");
    familyGrip.focus();
    expect(familyGrip).toHaveFocus();
    fireEvent.keyDown(familyGrip, { key: "ArrowUp" });
    fireEvent.keyDown(familyGrip, { key: "ArrowUp" });

    const order = readRenderedSectionOrder(container);
    expect(order[0]).toBe("family_history");

    await waitFor(
      () => {
        expect(mockPatchDoctorSettings).toHaveBeenCalledWith("test-token", {
          subjective_section_order: order,
        });
      },
      { timeout: 1500 },
    );
    // Reorder is UI-only — it must never touch prescription columns.
    expect(mockUpdatePrescription).not.toHaveBeenCalled();
  });

  it("disabled mode removes grips from the tab order and blocks reorder", async () => {
    const { container } = renderWithRxForm(
      <SubjectiveSection heading={null} disabled />,
    );
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    expect(screen.queryByTestId("subjective-section-drag-handle")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reorder/i })).not.toBeInTheDocument();
    expect(mockPatchDoctorSettings).not.toHaveBeenCalled();

    // Sections still render — only the reorder affordance is suppressed.
    const root = container.querySelector("#rx-symptoms")!;
    expect(within(root).getByLabelText("Chief complaints")).toBeInTheDocument();
  });

  it("linked mode: PMH + allergies sections are reorderable and autosave their order", async () => {
    mockPatchDoctorSettings.mockResolvedValue({
      data: { settings: { subjective_section_order: [] } },
    });

    const { container } = renderWithRxForm(
      <SubjectiveSection heading={null} patientId="pat-1" token="test-token" />,
    );
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    const order = readRenderedSectionOrder(container);
    expect(order).toContain("patient_background");
    expect(order).toContain("allergies");
    expect(order).not.toContain("past_surgical");

    const allergiesGrip = getSectionReorderGrip("Allergies");
    allergiesGrip.focus();
    fireEvent.keyDown(allergiesGrip, { key: "ArrowUp" });

    const reordered = readRenderedSectionOrder(container);
    expect(reordered).not.toEqual(order);
    expect(reordered).toContain("patient_background");
    expect(reordered).toContain("allergies");

    await waitFor(
      () => {
        expect(mockPatchDoctorSettings).toHaveBeenCalledWith("test-token", {
          subjective_section_order: reordered,
        });
      },
      { timeout: 1500 },
    );
  });

  it("fallback mode: past-surgical section is reorderable and PMH/allergies are absent", async () => {
    const { container } = renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    const order = readRenderedSectionOrder(container);
    expect(order).toContain("past_surgical");
    expect(order).not.toContain("patient_background");
    expect(order).not.toContain("allergies");

    const surgicalGrip = getSectionReorderGrip("Past surgical history");
    surgicalGrip.focus();
    fireEvent.keyDown(surgicalGrip, { key: "ArrowUp" });

    const reordered = readRenderedSectionOrder(container);
    expect(reordered.indexOf("past_surgical")).toBeLessThan(
      order.indexOf("past_surgical"),
    );
  });
});

describe("subj-31 · Subjective collapse a11y (controlled mode)", () => {
  beforeEach(() => {
    mockGetDoctorSettings.mockReset();
    mockPatchDoctorSettings.mockReset();
    mockUpdatePrescription.mockReset();
    mockGetDoctorSettings.mockResolvedValue({
      data: {
        settings: {
          subjective_section_order: [],
          subjective_section_collapsed: {},
          subjective_section_hidden: [],
        },
      },
    });
    mockPatchDoctorSettings.mockResolvedValue({
      data: {
        settings: {
          subjective_section_order: [],
          subjective_section_collapsed: {},
        },
      },
    });
  });

  it("aria-expanded tracks controlled open state and chevron toggles collapse", async () => {
    renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    const chiefToggle = screen.getByRole("button", { name: "Toggle chief complaints" });
    expect(chiefToggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(chiefToggle);
    expect(chiefToggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(chiefToggle);
    expect(chiefToggle).toHaveAttribute("aria-expanded", "true");
  });

  it("disabled mode suppresses collapse autosave without removing section content", async () => {
    const { container } = renderWithRxForm(<SubjectiveSection heading={null} disabled />);
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    const collapseCalls = mockPatchDoctorSettings.mock.calls.filter(
      (call) =>
        call[1] &&
        typeof call[1] === "object" &&
        "subjective_section_collapsed" in (call[1] as Record<string, unknown>),
    );
    expect(collapseCalls).toHaveLength(0);

    const root = container.querySelector("#rx-symptoms")!;
    expect(root).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Reorder/i })).not.toBeInTheDocument();
  });
});

describe("subj-35 · Manage sections menu a11y", () => {
  beforeEach(() => {
    mockGetDoctorSettings.mockReset();
    mockPatchDoctorSettings.mockReset();
    mockUpdatePrescription.mockReset();
    mockGetDoctorSettings.mockResolvedValue({
      data: {
        settings: {
          subjective_section_order: [],
          subjective_section_collapsed: {},
          subjective_section_hidden: [],
        },
      },
    });
    mockPatchDoctorSettings.mockResolvedValue({
      data: {
        settings: {
          subjective_section_order: [],
          subjective_section_collapsed: {},
          subjective_section_hidden: [],
        },
      },
    });
  });

  it("menu trigger is keyboard-focusable and exposes aria-expanded when open", async () => {
    renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    const trigger = screen.getByTestId("section-manager-menu-trigger");
    trigger.focus();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    await waitFor(() => {
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByTestId("section-manager-row-family_history")).toBeInTheDocument();
    });
  });

  it("hide toggles are labelled and reflect pressed state", async () => {
    renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId("section-manager-menu-trigger"));
    await waitFor(() => {
      expect(screen.getByTestId("section-manager-toggle-family_history")).toBeInTheDocument();
    });

    const toggle = screen.getByRole("button", { name: "Hide Family history" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("closing the menu with Escape returns focus to the trigger", async () => {
    renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    const trigger = screen.getByTestId("section-manager-menu-trigger");
    fireEvent.click(trigger);
    await waitFor(() => {
      expect(screen.getByTestId("section-manager-row-chief_complaints")).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });
  });

  it("reorder and add-custom controls in the menu are keyboard-operable", async () => {
    renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId("section-manager-menu-trigger"));
    await waitFor(() => {
      expect(screen.getByTestId("section-manager-add-custom")).toBeInTheDocument();
    });

    const moveUp = screen.getByRole("button", { name: "Move Family history up" });
    moveUp.focus();
    expect(moveUp).toHaveFocus();

    const addCustom = screen.getByTestId("section-manager-add-custom");
    expect(addCustom).not.toHaveAttribute("disabled");
  });

  it("disabled mode keeps the menu reachable read-only without visibility autosave", async () => {
    renderWithRxForm(<SubjectiveSection heading={null} disabled />);
    await waitFor(() => expect(mockGetDoctorSettings).toHaveBeenCalled());

    expect(screen.getByTestId("section-manager-menu-trigger")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("section-manager-menu-trigger"));
    await waitFor(() => {
      expect(screen.getByTestId("section-manager-toggle-family_history")).toBeDisabled();
    });

    const hiddenCalls = mockPatchDoctorSettings.mock.calls.filter(
      (call) =>
        call[1] &&
        typeof call[1] === "object" &&
        "subjective_section_hidden" in (call[1] as Record<string, unknown>),
    );
    expect(hiddenCalls).toHaveLength(0);
  });
});
