import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { SubjectiveSection } from "@/components/cockpit/rx/sections/SubjectiveSection";
import {
  resolveInitialSectionOrder,
  resolveStaticSectionIds,
  type SubjectiveSectionId,
} from "@/lib/cockpit/subjective-section-order";

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

const FALLBACK_STATIC = resolveStaticSectionIds(false);

describe("SubjectiveSection order persistence (subj-26)", () => {
  beforeEach(() => {
    mockGetDoctorSettings.mockReset();
    mockPatchDoctorSettings.mockReset();
    mockUpdatePrescription.mockReset();
    mockGetDoctorSettings.mockResolvedValue({
      data: { settings: { subjective_section_order: [], subjective_section_collapsed: {} } },
    });
  });

  it("applies a stored doctor default on mount", async () => {
    mockGetDoctorSettings.mockResolvedValue({
      data: {
        settings: {
          subjective_section_order: [
            "social_history",
            "chief_complaints",
            "family_history",
            "free_text_notes",
            "custom_subsections",
            "past_surgical",
          ],
        },
      },
    });

    const { container } = renderWithRxForm(<SubjectiveSection heading={null} />);

    await waitFor(() => {
      expect(readRenderedSectionOrder(container)).toEqual([
        "social_history",
        "chief_complaints",
        "family_history",
        "free_text_notes",
        "past_surgical",
      ]);
    });
  });

  it("uses the canonical layout when the stored default is empty", async () => {
    const { container } = renderWithRxForm(<SubjectiveSection heading={null} />);

    await waitFor(() => {
      expect(readRenderedSectionOrder(container)).toEqual(
        resolveInitialSectionOrder([], false, []),
      );
    });
  });

  it("merges stored order by dropping removed ids and appending newly-available sections", async () => {
    mockGetDoctorSettings.mockResolvedValue({
      data: {
        settings: {
          subjective_section_order: [
            "chief_complaints",
            "legacy_removed_section",
            "family_history",
            "free_text_notes",
          ],
        },
      },
    });

    const { container } = renderWithRxForm(
      <SubjectiveSection heading={null} patientId="pat-1" token="test-token" />,
    );

    await waitFor(() => {
      expect(readRenderedSectionOrder(container)).toEqual(
        resolveInitialSectionOrder(
          [
            "chief_complaints",
            "legacy_removed_section",
            "family_history",
            "free_text_notes",
          ],
          true,
          [],
        ),
      );
    });

    const order = readRenderedSectionOrder(container);
    expect(order).toContain("patient_background");
    expect(order).toContain("allergies");
    expect(order).toContain("social_history");
    expect(order).not.toContain("past_surgical");
    expect(order).not.toContain("legacy_removed_section" as SubjectiveSectionId);
  });

  it("re-applies the stored default on a remount", async () => {
    mockGetDoctorSettings.mockResolvedValue({
      data: {
        settings: {
          subjective_section_order: ["custom_subsections", "chief_complaints"],
        },
      },
    });

    const first = renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitFor(() => {
      expect(readRenderedSectionOrder(first.container)[0]).toBe("chief_complaints");
    });
    first.unmount();

    const second = renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitFor(() => {
      expect(readRenderedSectionOrder(second.container)[0]).toBe("chief_complaints");
    });
  });

  it("autosaves section order after reorder (debounced) and round-trips the current order", async () => {
    mockPatchDoctorSettings.mockResolvedValue({
      data: {
        settings: {
          subjective_section_order: [
            "family_history",
            "chief_complaints",
            "past_surgical",
            "social_history",
            "free_text_notes",
          ],
          subjective_section_collapsed: {},
        },
      },
    });

    const { container } = renderWithRxForm(<SubjectiveSection heading={null} />);
    await waitFor(() => {
      expect(mockGetDoctorSettings).toHaveBeenCalled();
    });

    const familyGrip = screen.getByRole("button", { name: /Reorder Family history/i });
    familyGrip.focus();
    fireEvent.keyDown(familyGrip, { key: "ArrowUp" });
    fireEvent.keyDown(familyGrip, { key: "ArrowUp" });

    const orderBeforeSave = readRenderedSectionOrder(container);
    expect(orderBeforeSave[0]).toBe("family_history");

    await waitFor(
      () => {
        expect(mockPatchDoctorSettings).toHaveBeenCalledTimes(1);
        expect(mockPatchDoctorSettings).toHaveBeenCalledWith("test-token", {
          subjective_section_order: orderBeforeSave,
        });
      },
      { timeout: 1500 },
    );
    expect(mockUpdatePrescription).not.toHaveBeenCalled();
    expect(screen.getByText("Layout saved")).toBeInTheDocument();
  });

  it("does not autosave section order when disabled", async () => {
    renderWithRxForm(<SubjectiveSection heading={null} disabled />);
    await waitFor(() => {
      expect(mockGetDoctorSettings).toHaveBeenCalled();
    });

    expect(mockPatchDoctorSettings).not.toHaveBeenCalled();
  });
});
