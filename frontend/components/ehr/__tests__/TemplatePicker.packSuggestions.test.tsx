import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import TemplatePicker from "@/components/ehr/TemplatePicker";
import type { DoctorMedicinePackSuggestion } from "@/lib/api/doctor-medicine-pack-suggestions";

const mockListRxTemplates = vi.fn();

vi.mock("@/lib/api", () => ({
  listRxTemplates: (...args: unknown[]) => mockListRxTemplates(...args),
  recordRxTemplateUse: vi.fn(),
  archiveRxTemplate: vi.fn(),
}));

const PACK: DoctorMedicinePackSuggestion = {
  useCount: 8,
  lastUsedAt: "2026-09-01T00:00:00Z",
  medicines: [
    {
      medicineName: "Azithromycin",
      nameKey: "azithromycin",
      dosage: "",
      doseQty: 1,
      doseUnit: "tab",
      frequencyCode: "OD",
      frequency: "",
      durationValue: 5,
      durationUnit: "days",
      duration: "",
      foodTiming: null,
      routeCode: null,
      route: "",
      form: null,
      drugMasterId: null,
    },
    {
      medicineName: "Paracetamol",
      nameKey: "paracetamol",
      dosage: "",
      doseQty: 1,
      doseUnit: "tab",
      frequencyCode: "TID",
      frequency: "",
      durationValue: 5,
      durationUnit: "days",
      duration: "",
      foodTiming: null,
      routeCode: null,
      route: "",
      form: null,
      drugMasterId: null,
    },
  ],
};

describe("TemplatePicker pack suggestions", () => {
  beforeEach(() => {
    mockListRxTemplates.mockReset();
    mockListRxTemplates.mockResolvedValue({ data: { templates: [] } });
  });

  it("lists suggested packs above the empty saved-template copy", async () => {
    const onSave = vi.fn();
    const onDismiss = vi.fn();
    const onOpened = vi.fn();

    render(
      <TemplatePicker
        open
        onClose={vi.fn()}
        token="tok"
        variant="subjective"
        scope="medicines"
        onApply={vi.fn()}
        packSuggestions={[PACK]}
        onSavePackSuggestion={onSave}
        onDismissPackSuggestion={onDismiss}
        onPackSuggestionsOpened={onOpened}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("medicine-pack-suggestion")).toHaveTextContent(
        "Azithromycin"
      );
    });
    expect(screen.getByText(/Used 8 times/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Use the save icon in the section header/)
    ).not.toBeInTheDocument();
    expect(onOpened).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("medicine-pack-suggestion-save"));
    expect(onSave).toHaveBeenCalledWith(PACK);
    fireEvent.click(screen.getByTestId("medicine-pack-suggestion-dismiss"));
    expect(onDismiss).toHaveBeenCalledWith(PACK);
  });
});
