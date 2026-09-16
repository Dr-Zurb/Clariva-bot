/**
 * MedicineCaptureBar — deterministic Enter; AI refine lives on the card.
 * Catalog names autocomplete the field; frequent combos mint a card.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MedicineCaptureBar } from "@/components/cockpit/rx/inputs/MedicineCaptureBar";
import type { RxMedicine } from "@/components/cockpit/rx/RxFormContext";
import { resetDrugMasterCatalogCache } from "@/lib/drug-master-catalog";
import type { DrugMasterRow } from "@/types/drug-master";

const mockParseMedicineWithAI = vi.fn();
const mockSearchDrugs = vi.fn();

vi.mock("@/lib/api/medicine-parse", () => ({
  parseMedicineWithAI: (...args: unknown[]) => mockParseMedicineWithAI(...args),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    searchDrugs: (...args: unknown[]) => mockSearchDrugs(...args),
  };
});

const mockClearCombo = vi.fn();
const mockUseDoctorMedicineCombos = vi.fn(() => ({
  combos: [] as unknown[],
  isLoading: false,
  clearCombo: mockClearCombo,
}));

vi.mock("@/hooks/useDoctorMedicineCombos", () => ({
  useDoctorMedicineCombos: (...args: unknown[]) =>
    mockUseDoctorMedicineCombos(...args),
}));

vi.mock("@/hooks/useDoctorDrugUsage", () => ({
  useDoctorDrugUsage: () => ({ scores: {}, isLoading: false }),
}));

function catalogDrug(
  name: string,
  extras: Partial<Pick<DrugMasterRow, "strength" | "form">> = {}
): DrugMasterRow {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    generic_name: name,
    brand_names: [],
    strength: extras.strength ?? null,
    form: extras.form ?? null,
    route_default: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const MULTIVITAMIN_COMBO = {
  medicineName: "Multivitamin",
  nameKey: "multivitamin",
  dosage: "",
  doseQty: 1,
  doseUnit: "tab",
  frequencyCode: "OD",
  frequency: "",
  durationValue: 10,
  durationUnit: "days",
  duration: "10 days",
  foodTiming: null,
  routeCode: null,
  route: "",
  form: null,
  drugMasterId: null,
  useCount: 24,
  lastUsedAt: "2026-09-01T00:00:00Z",
};

describe("MedicineCaptureBar", () => {
  const onAddMedicines = vi.fn();

  beforeEach(() => {
    resetDrugMasterCatalogCache();
    onAddMedicines.mockReset();
    mockParseMedicineWithAI.mockReset();
    mockSearchDrugs.mockReset();
    mockSearchDrugs.mockResolvedValue({ data: { results: [] } });
    mockUseDoctorMedicineCombos.mockReset();
    mockClearCombo.mockReset();
    mockClearCombo.mockResolvedValue(undefined);
    mockUseDoctorMedicineCombos.mockReturnValue({
      combos: [],
      isLoading: false,
      clearCombo: mockClearCombo,
    });
  });

  function renderBar() {
    return render(
      <MedicineCaptureBar token="tok" onAddMedicines={onAddMedicines} />
    );
  }

  function getCaptureInput() {
    return screen.getByRole("combobox");
  }

  it("commits a clean sig line without calling AI", () => {
    renderBar();
    const input = getCaptureInput();
    fireEvent.change(input, {
      target: { value: "amlodipine 5 mg 1 tab od 30 days" },
    });
    fireEvent.keyDown(input.parentElement!, { key: "Enter" });

    expect(mockParseMedicineWithAI).not.toHaveBeenCalled();
    expect(onAddMedicines).toHaveBeenCalledTimes(1);
    const [meds] = onAddMedicines.mock.calls[0] as [RxMedicine[]];
    expect(meds[0]?.medicineName.toLowerCase()).toContain("amlodipine");
    expect(meds[0]?.frequencyCode).toBe("OD");
  });

  it("commits a vernacular line as typed without calling AI", async () => {
    renderBar();
    const input = getCaptureInput();
    fireEvent.change(input, {
      target: { value: "amlodipine 5 mg od subah le raha hai" },
    });
    fireEvent.keyDown(input.parentElement!, { key: "Enter" });

    await waitFor(() => {
      expect(onAddMedicines).toHaveBeenCalled();
    });
    expect(mockParseMedicineWithAI).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("chart-med-ai-proposal")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("medicine-capture-refine")
    ).not.toBeInTheDocument();
    expect(onAddMedicines).toHaveBeenCalledWith([
      expect.objectContaining({
        medicineName: expect.stringMatching(/amlodipine/i),
      }),
    ]);
  });

  it("does not show a capture-bar Refine button", () => {
    renderBar();
    const input = getCaptureInput();
    fireEvent.change(input, { target: { value: "pcm 500 bd" } });
    expect(
      screen.queryByTestId("medicine-capture-refine")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /refine/i })
    ).not.toBeInTheDocument();
  });

  it("shows a structured preview on a clean sig line", () => {
    renderBar();
    fireEvent.change(getCaptureInput(), {
      target: { value: "amlodipine 5 mg od" },
    });
    expect(screen.getByText(/adds/i)).toBeInTheDocument();
    expect(screen.getByText("amlodipine")).toBeInTheDocument();
    expect(screen.queryByText(/plain text/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/didn/i)).not.toBeInTheDocument();
  });

  it("flags leftover tokens the parser did not classify", () => {
    renderBar();
    fireEvent.change(getCaptureInput(), {
      target: { value: "amlodipine 5 mg od avoid grapefruit" },
    });
    const hint = screen.getByText(/didn't understand/i);
    expect(hint.textContent).toMatch(/avoid grapefruit/);
  });

  it("warns when a long line has no recognised sig", () => {
    renderBar();
    fireEvent.change(getCaptureInput(), {
      target: { value: "sugar ki goli roz" },
    });
    expect(
      screen.getByText(/adds as plain text — no dose or frequency recognised/i)
    ).toBeInTheDocument();
  });

  it("stays silent on a 1–2 word catalog search", () => {
    renderBar();
    fireEvent.change(getCaptureInput(), {
      target: { value: "amlodipine" },
    });
    expect(screen.queryByText(/plain text/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/adds/i)).not.toBeInTheDocument();
  });

  it("commits the first frequent combo on Enter without ArrowDown", async () => {
    mockUseDoctorMedicineCombos.mockReturnValue({
      combos: [MULTIVITAMIN_COMBO],
      isLoading: false,
      clearCombo: mockClearCombo,
    });

    renderBar();
    const input = getCaptureInput();
    fireEvent.change(input, { target: { value: "multi" } });

    await waitFor(() => {
      expect(screen.getByTestId("medicine-combo-list")).toBeInTheDocument();
    });
    const first = screen.getByTestId("medicine-combo-option");
    expect(first.textContent).toMatch(/Multivitamin/);
    expect(first).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(onAddMedicines).toHaveBeenCalledWith([
        expect.objectContaining({
          medicineName: "Multivitamin",
          frequencyCode: "OD",
          durationValue: 10,
        }),
      ]);
    });
  });

  it("commits a highlighted combo with ArrowDown then Enter", async () => {
    mockUseDoctorMedicineCombos.mockReturnValue({
      combos: [
        MULTIVITAMIN_COMBO,
        {
          ...MULTIVITAMIN_COMBO,
          durationValue: 30,
          duration: "30 days",
          useCount: 4,
          lastUsedAt: "2026-08-01T00:00:00Z",
        },
      ],
      isLoading: false,
      clearCombo: mockClearCombo,
    });

    renderBar();
    const input = getCaptureInput();
    fireEvent.change(input, { target: { value: "multi" } });

    await waitFor(() => {
      expect(screen.getByTestId("medicine-combo-list")).toBeInTheDocument();
    });
    const options = screen.getAllByTestId("medicine-combo-option");
    expect(options[0]).toHaveTextContent("Most frequent");
    expect(options[0]).not.toHaveTextContent("24");
    expect(options[1]).not.toHaveTextContent("Most frequent");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const highlighted = screen.getAllByTestId("medicine-combo-option");
    expect(highlighted).toHaveLength(2);
    expect(highlighted[1]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(onAddMedicines).toHaveBeenCalledWith([
        expect.objectContaining({
          medicineName: "Multivitamin",
          frequencyCode: "OD",
          durationValue: 30,
        }),
      ]);
    });
  });

  it("clears a frequent combo without minting the card", async () => {
    mockUseDoctorMedicineCombos.mockReturnValue({
      combos: [MULTIVITAMIN_COMBO],
      isLoading: false,
      clearCombo: mockClearCombo,
    });

    renderBar();
    fireEvent.change(getCaptureInput(), { target: { value: "multi" } });
    await waitFor(() => {
      expect(screen.getByTestId("medicine-combo-clear")).toBeInTheDocument();
    });
    fireEvent.mouseDown(screen.getByTestId("medicine-combo-clear"));
    expect(mockClearCombo).toHaveBeenCalledWith(
      expect.objectContaining({
        medicineName: "Multivitamin",
        durationValue: 10,
      })
    );
    expect(onAddMedicines).not.toHaveBeenCalled();
  });

  it("autocompletes a catalog name without minting a card", async () => {
    mockSearchDrugs.mockResolvedValue({
      data: {
        results: [
          catalogDrug("Prednisolone", { form: "tablet", strength: "10mg" }),
        ],
      },
    });
    mockUseDoctorMedicineCombos.mockReturnValue({
      combos: [MULTIVITAMIN_COMBO],
      isLoading: false,
      clearCombo: mockClearCombo,
    });

    renderBar();
    const input = getCaptureInput();
    fireEvent.change(input, { target: { value: "predni" } });

    const catalog = await screen.findByTestId("medicine-catalog-option");
    expect(catalog).toHaveTextContent("Tab Prednisolone 10mg");
    fireEvent.mouseDown(catalog);

    expect(onAddMedicines).not.toHaveBeenCalled();
    expect(input).toHaveValue("Tab Prednisolone 10mg");
  });

  it("commits the typed line after a catalog autocomplete", async () => {
    mockSearchDrugs.mockResolvedValue({
      data: {
        results: [
          catalogDrug("Prednisolone", { form: "tablet", strength: "10mg" }),
        ],
      },
    });

    renderBar();
    const input = getCaptureInput();
    fireEvent.change(input, { target: { value: "predni" } });

    fireEvent.mouseDown(await screen.findByTestId("medicine-catalog-option"));
    expect(input).toHaveValue("Tab Prednisolone 10mg");

    fireEvent.change(input, {
      target: { value: "Tab Prednisolone 10mg 1 od 10 days" },
    });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onAddMedicines).toHaveBeenCalledWith([
        expect.objectContaining({
          medicineName: expect.stringMatching(/prednisolone/i),
          form: "tablet",
          dosage: expect.stringMatching(/10\s*mg/i),
          frequencyCode: "OD",
          durationValue: 10,
        }),
      ]);
    });
  });

  it("hides combos once a sig token is typed", () => {
    mockUseDoctorMedicineCombos.mockReturnValue({
      combos: [MULTIVITAMIN_COMBO],
      isLoading: false,
      clearCombo: mockClearCombo,
    });

    renderBar();
    fireEvent.change(getCaptureInput(), {
      target: { value: "multivitamin 1 od" },
    });
    expect(screen.queryByTestId("medicine-combo-list")).not.toBeInTheDocument();
    expect(screen.getByText(/adds/i)).toBeInTheDocument();
  });

  it("commits bare dose qty lines without calling AI", () => {
    renderBar();
    const input = getCaptureInput();
    fireEvent.change(input, {
      target: { value: "Tolezomab 5mg 1 od" },
    });
    fireEvent.keyDown(input.parentElement!, { key: "Enter" });

    expect(mockParseMedicineWithAI).not.toHaveBeenCalled();
    expect(onAddMedicines).toHaveBeenCalledWith([
      expect.objectContaining({
        medicineName: "Tolezomab",
        dosage: "5 mg",
        doseQty: 1,
        doseUnit: "tab",
        frequencyCode: "OD",
      }),
    ]);
  });
});
