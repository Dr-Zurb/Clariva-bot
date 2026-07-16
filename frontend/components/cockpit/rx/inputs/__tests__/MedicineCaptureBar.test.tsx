/**
 * MedicineCaptureBar — med-lib-02 AI / catalog capture gates.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MedicineCaptureBar } from "@/components/cockpit/rx/inputs/MedicineCaptureBar";
import type { RxMedicine } from "@/components/cockpit/rx/RxFormContext";

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

vi.mock("@/components/ehr/DrugAutocomplete", () => ({
  default: ({
    inputId,
    value,
    onChange,
    placeholder,
    disabled,
  }: {
    inputId?: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    disabled?: boolean;
  }) => (
    <input
      id={inputId}
      aria-label={placeholder ?? "Medicine name"}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

describe("MedicineCaptureBar", () => {
  const onAddDrug = vi.fn();
  const onAddMedicines = vi.fn();

  beforeEach(() => {
    onAddDrug.mockReset();
    onAddMedicines.mockReset();
    mockParseMedicineWithAI.mockReset();
    mockSearchDrugs.mockReset();
  });

  function renderBar() {
    return render(
      <MedicineCaptureBar
        token="tok"
        onAddDrug={onAddDrug}
        onAddMedicines={onAddMedicines}
      />,
    );
  }

  it("commits a clean sig line without calling AI", () => {
    renderBar();
    const input = screen.getByLabelText(/Add medicine/i);
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

  it("auto-gates vernacular residue to AI and commits on accept", async () => {
    // Different AI name → panel (same-name hits auto-accept without confirm).
    mockParseMedicineWithAI.mockResolvedValue({
      success: true,
      data: {
        medicines: [
          {
            name: "Norvasc",
            strengthValue: 5,
            strengthUnit: "mg",
            doseQty: 1,
            doseUnit: "tab",
            frequencyCode: "OD",
          },
        ],
      },
    });

    renderBar();
    const input = screen.getByLabelText(/Add medicine/i);
    fireEvent.change(input, {
      target: { value: "amlodipine 5 mg od subah le raha hai" },
    });
    fireEvent.keyDown(input.parentElement!, { key: "Enter" });

    await waitFor(() => {
      expect(mockParseMedicineWithAI).toHaveBeenCalled();
    });
    expect(await screen.findByTestId("chart-med-ai-proposal")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("chart-med-ai-accept-0"));
    expect(onAddMedicines).toHaveBeenCalledWith([
      expect.objectContaining({ medicineName: "Norvasc", dosage: "5 mg" }),
    ]);
  });

  it("autogate shows Keep as typed below; arrow + Enter keeps typed fallback", async () => {
    mockParseMedicineWithAI.mockResolvedValue({
      success: true,
      data: {
        medicines: [
          {
            name: "Norvasc",
            strengthValue: 5,
            strengthUnit: "mg",
            doseQty: 1,
            doseUnit: "tab",
            frequencyCode: "OD",
          },
        ],
      },
    });

    renderBar();
    const input = screen.getByLabelText(/Add medicine/i);
    fireEvent.change(input, {
      target: { value: "amlodipine 5 mg od subah le raha hai" },
    });
    fireEvent.keyDown(input.parentElement!, { key: "Enter" });

    const panel = await screen.findByTestId("chart-med-ai-proposal");
    const keep = screen.getByTestId("chart-med-ai-keep-as-typed");
    expect(keep).toHaveTextContent(/Keep “amlodipine 5 mg od subah le raha hai” as typed/i);

    fireEvent.keyDown(panel, { key: "ArrowDown" });
    expect(keep).toHaveFocus();
    fireEvent.keyDown(panel, { key: "Enter" });

    expect(onAddMedicines).toHaveBeenCalledWith([
      expect.objectContaining({
        medicineName: expect.stringMatching(/amlodipine/i),
      }),
    ]);
  });

  it("shows Refine for multi-word lines and runs escalation tier", async () => {
    mockParseMedicineWithAI.mockResolvedValue({
      success: true,
      data: { medicines: [{ name: "Paracetamol", strengthValue: 500, strengthUnit: "mg" }] },
    });

    renderBar();
    const input = screen.getByLabelText(/Add medicine/i);
    fireEvent.change(input, { target: { value: "pcm 500 bd" } });

    fireEvent.click(screen.getByTestId("medicine-capture-refine"));
    await waitFor(() => {
      expect(mockParseMedicineWithAI).toHaveBeenCalledWith(
        "tok",
        expect.objectContaining({ tier: "escalation" }),
      );
    });
  });

  it("commits bare dose qty lines without calling AI", () => {
    renderBar();
    const input = screen.getByLabelText(/Add medicine/i);
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

  it("auto-accepts a single same-name AI hit without showing the panel", async () => {
    mockParseMedicineWithAI.mockResolvedValue({
      success: true,
      data: {
        medicines: [
          {
            name: "Amlodipine",
            strengthValue: 5,
            strengthUnit: "mg",
            doseQty: 1,
            doseUnit: "tab",
            frequencyCode: "OD",
          },
        ],
      },
    });

    renderBar();
    const input = screen.getByLabelText(/Add medicine/i);
    fireEvent.change(input, {
      target: { value: "amlodipine 5 mg od subah le raha hai" },
    });
    fireEvent.keyDown(input.parentElement!, { key: "Enter" });

    await waitFor(() => {
      expect(onAddMedicines).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("chart-med-ai-proposal")).not.toBeInTheDocument();
    expect(onAddMedicines).toHaveBeenCalledWith([
      expect.objectContaining({ medicineName: "Amlodipine", dosage: "5 mg" }),
    ]);
  });

  it("fail-soft: autogate AI error commits the typed fallback", async () => {
    mockParseMedicineWithAI.mockRejectedValue(new Error("boom"));

    renderBar();
    const input = screen.getByLabelText(/Add medicine/i);
    fireEvent.change(input, {
      target: { value: "amlodipine 5 mg od subah le raha hai" },
    });
    fireEvent.keyDown(input.parentElement!, { key: "Enter" });

    await waitFor(() => {
      expect(onAddMedicines).toHaveBeenCalled();
    });
    expect(onAddMedicines.mock.calls[0]![0][0]).toEqual(
      expect.objectContaining({ medicineName: expect.stringMatching(/amlodipine/i) }),
    );
  });
});
