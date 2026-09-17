import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MedicinesSectionTemplateButton } from "@/components/cockpit/rx/inputs/MedicinesSectionTemplateButton";
import { createEmptyRxFormFields } from "@/components/cockpit/rx/RxFormContext";

const mockMarkSeen = vi.fn();

vi.mock("@/components/cockpit/rx/RxFormContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/cockpit/rx/RxFormContext")>();
  return {
    ...actual,
    useRxForm: () => ({
      token: "tok",
      state: { fields: createEmptyRxFormFields() },
    }),
  };
});

vi.mock("@/hooks/useDoctorMedicinePackSuggestions", () => ({
  useDoctorMedicinePackSuggestions: () => ({
    suggestions: [],
    unseenCount: 2,
    isLoading: false,
    dismissPack: vi.fn(),
    markSeen: mockMarkSeen,
    removePack: vi.fn(),
  }),
}));

vi.mock("@/components/ehr/TemplatePicker", () => ({
  default: () => null,
}));

describe("MedicinesSectionTemplateButton suggestion nudge", () => {
  beforeEach(() => {
    mockMarkSeen.mockReset();
  });

  it("dots the templates icon when unseen pack suggestions exist", () => {
    render(<MedicinesSectionTemplateButton onMedicinesApplied={vi.fn()} />);
    expect(
      screen.getByTestId("medicines-template-suggestion-nudge")
    ).toBeInTheDocument();
    expect(screen.getByTestId("medicines-section-template")).toHaveAttribute(
      "aria-label",
      "Templates, 2 new pack suggestions"
    );
  });
});
