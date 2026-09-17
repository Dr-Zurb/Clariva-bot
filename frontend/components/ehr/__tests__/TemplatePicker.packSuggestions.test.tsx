import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import TemplatePicker from "@/components/ehr/TemplatePicker";
import type { DoctorMedicinePackSuggestion } from "@/lib/api/doctor-medicine-pack-suggestions";
import type { DoctorRxTemplate } from "@/types/rx-template";

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

    expect(screen.getByTestId("medicine-pack-suggestion-save")).toHaveTextContent(
      "Save"
    );
    fireEvent.click(screen.getByTestId("medicine-pack-suggestion-save"));
    expect(onSave).toHaveBeenCalledWith(PACK);
    fireEvent.click(screen.getByTestId("medicine-pack-suggestion-dismiss"));
    expect(onDismiss).toHaveBeenCalledWith(PACK);
  });

  it("caps a long pack at three lines until +more is opened", async () => {
    const longPack: DoctorMedicinePackSuggestion = {
      ...PACK,
      medicines: [
        ...PACK.medicines,
        { ...PACK.medicines[0]!, medicineName: "Cetirizine", nameKey: "cetirizine" },
        { ...PACK.medicines[0]!, medicineName: "Pantoprazole", nameKey: "pantoprazole" },
        { ...PACK.medicines[0]!, medicineName: "Domperidone", nameKey: "domperidone" },
      ],
    };

    render(
      <TemplatePicker
        open
        onClose={vi.fn()}
        token="tok"
        variant="subjective"
        scope="medicines"
        onApply={vi.fn()}
        packSuggestions={[longPack]}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("medicine-pack-suggestion-more")).toHaveTextContent(
        "+2 more"
      );
    });
    expect(screen.getByText(/Azithromycin/)).toBeInTheDocument();
    expect(screen.queryByText(/Domperidone/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("medicine-pack-suggestion-more"));
    expect(screen.getByText(/Domperidone/)).toBeInTheDocument();
    expect(screen.getByTestId("medicine-pack-suggestion-more")).toHaveTextContent(
      "Show less"
    );
  });

  it("adds a just-saved pack to Saved with its medicine lines visible", async () => {
    const saved = makeSavedTemplate("cadadded", [
      { medicineName: "Aspirin", doseQty: 1, doseUnit: "tab", frequencyCode: "OD", durationValue: 30, durationUnit: "days" },
      { medicineName: "Atorvastatin", doseQty: 1, doseUnit: "tab", frequencyCode: "OD", durationValue: 30, durationUnit: "days" },
    ]);
    const onSave = vi.fn().mockResolvedValue(saved);

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
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("medicine-pack-suggestion-save")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("medicine-pack-suggestion-save"));

    await waitFor(() => {
      expect(screen.getByTestId("medicines-saved-template")).toHaveTextContent(
        "cadadded"
      );
    });
    expect(screen.getByTestId("medicines-saved-template")).toHaveTextContent(
      "Aspirin"
    );
    expect(screen.getByTestId("medicines-saved-template")).toHaveTextContent(
      "Atorvastatin"
    );
  });

  it("caps a saved long pack at three lines until +more is opened", async () => {
    const saved = makeSavedTemplate("cadadded", [
      { medicineName: "Aspirin" },
      { medicineName: "Atorvastatin" },
      { medicineName: "Clopidogrel" },
      { medicineName: "Metoprolol" },
      { medicineName: "Ramipril" },
    ]);
    mockListRxTemplates.mockResolvedValue({ data: { templates: [saved] } });

    render(
      <TemplatePicker
        open
        onClose={vi.fn()}
        token="tok"
        variant="subjective"
        scope="medicines"
        onApply={vi.fn()}
        packSuggestions={[]}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("medicines-saved-template-more")).toHaveTextContent(
        "+2 more"
      );
    });
    expect(screen.getByText(/Aspirin/)).toBeInTheDocument();
    expect(screen.queryByText(/Ramipril/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("medicines-saved-template-more"));
    expect(screen.getByText(/Ramipril/)).toBeInTheDocument();
  });
});

function makeSavedTemplate(
  name: string,
  medicines: DoctorRxTemplate["medicines_json"],
): DoctorRxTemplate {
  return {
    id: `tpl-${name}`,
    doctor_id: "doc-1",
    name,
    description: null,
    scope: "medicines",
    medicines_json: medicines,
    cc: null,
    hopi: null,
    provisional_diagnosis: null,
    investigations: null,
    follow_up: null,
    patient_education: null,
    clinical_notes: null,
    subjective_json: {},
    objective_json: {},
    plan_json: {},
    assessment_json: {},
    pmh_json: { conditions: [], medications: [] },
    allergies_json: { allergies: [] },
    use_count: 0,
    last_used_at: null,
    archived_at: null,
    created_at: "2026-09-17T00:00:00Z",
    updated_at: "2026-09-17T00:00:00Z",
  };
}
