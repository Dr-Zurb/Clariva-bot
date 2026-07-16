import type { ReactElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { DiagnosisRowsList } from "@/components/cockpit/rx/inputs/DiagnosisRowsList";
import { searchDiagnoses } from "@/lib/api/diagnosis-catalog";
import { resolveDiagnosisWithAI } from "@/lib/api/diagnosis-parse";

vi.mock("@/lib/api/diagnosis-catalog", () => ({
  searchDiagnoses: vi.fn(),
}));

vi.mock("@/lib/api/diagnosis-parse", () => ({
  resolveDiagnosisWithAI: vi.fn(),
}));

vi.mock("@/hooks/queries/usePatientConditionsQuery", () => ({
  usePatientConditionsQuery: vi.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
  })),
}));

const htnRow = {
  id: "d-1",
  code: "BA00",
  title: "Essential hypertension",
  synonyms: ["high blood pressure", "BP high"],
  chapter: "Circulatory",
  created_at: "",
  updated_at: "",
};

const prescriptionIdRef = { current: null as string | null };

function renderList(ui: ReactElement) {
  return render(
    <RxFormProvider
      appointmentId="appt-1"
      patientId="pat-1"
      token="test-token"
      entryMode="structured"
      initialFields={{ ...createEmptyRxFormFields(), diagnoses: [] }}
      autosaveEnabled={false}
      prescriptionIdRef={prescriptionIdRef}
      onPrescriptionCreated={() => {}}
    >
      {ui}
    </RxFormProvider>,
  );
}

describe("DiagnosisRowsList — ICD coding (asmt-06)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(searchDiagnoses).mockResolvedValue({
      success: true,
      data: { results: [htnRow] },
      meta: { timestamp: "", requestId: "" },
    });
    // asmt-07: default the AI resolver to "no suggestions" (degrade to typed).
    vi.mocked(resolveDiagnosisWithAI).mockResolvedValue({
      success: true,
      data: { suggestions: [] },
      meta: { timestamp: "", requestId: "" },
    });
  });

  it("selecting a catalog entry sets the ICD code + canonical title and shows a code chip", async () => {
    renderList(<DiagnosisRowsList />);
    const capture = screen.getByTestId("diagnosis-capture-input");
    fireEvent.change(capture, { target: { value: "hyper" } });
    fireEvent.focus(capture);

    const option = await screen.findByText("Essential hypertension");
    fireEvent.mouseDown(option);

    // Card carries the canonical ICD title as the label + an ICD code chip.
    expect(
      await screen.findByDisplayValue("Essential hypertension"),
    ).toBeInTheDocument();
    const chip = await screen.findByTestId(/^diagnosis-code-chip-/);
    expect(chip).toHaveTextContent("BA00");
    expect(chip).toHaveAttribute("title", "Essential hypertension");
  });

  it("free-text Enter commits an uncoded card with no code chip when the AI finds nothing (ASMT-D3)", async () => {
    vi.mocked(searchDiagnoses).mockResolvedValue({
      success: true,
      data: { results: [] },
      meta: { timestamp: "", requestId: "" },
    });
    renderList(<DiagnosisRowsList />);
    const capture = screen.getByTestId("diagnosis-capture-input");
    fireEvent.change(capture, { target: { value: "Rare syndrome" } });
    fireEvent.keyDown(capture, { key: "Enter" });

    expect(await screen.findByDisplayValue("Rare syndrome")).toBeInTheDocument();
    expect(screen.queryByTestId(/^diagnosis-code-chip-/)).not.toBeInTheDocument();
  });

  it("surfaces a catalog-constrained AI suggestion on the free-text (no-match) path; accepting codes the card (asmt-07)", async () => {
    vi.mocked(searchDiagnoses).mockResolvedValue({
      success: true,
      data: { results: [] },
      meta: { timestamp: "", requestId: "" },
    });
    vi.mocked(resolveDiagnosisWithAI).mockResolvedValue({
      success: true,
      data: {
        suggestions: [
          { code: "5A11", title: "Type 2 diabetes mellitus", confidence: 0.9 },
        ],
      },
      meta: { timestamp: "", requestId: "" },
    });

    renderList(<DiagnosisRowsList />);
    const capture = screen.getByTestId("diagnosis-capture-input");
    fireEvent.change(capture, { target: { value: "sugar" } });
    fireEvent.keyDown(capture, { key: "Enter" });

    // The resolver ran on the free-text line and a proposal is offered.
    const useBtn = await screen.findByTestId("diagnosis-ai-accept-0");
    expect(vi.mocked(resolveDiagnosisWithAI)).toHaveBeenCalledWith(
      "test-token",
      expect.objectContaining({ text: "sugar" }),
    );
    expect(screen.getByText("Type 2 diabetes mellitus")).toBeInTheDocument();

    fireEvent.click(useBtn);

    // Accepting sets the canonical ICD title + code and dismisses the proposal.
    expect(
      await screen.findByDisplayValue("Type 2 diabetes mellitus"),
    ).toBeInTheDocument();
    const chip = await screen.findByTestId(/^diagnosis-code-chip-/);
    expect(chip).toHaveTextContent("5A11");
    expect(screen.queryByTestId("diagnosis-ai-proposal")).not.toBeInTheDocument();
  });

  it("keeps the typed text as an uncoded card when the AI suggestion is declined (asmt-07)", async () => {
    vi.mocked(searchDiagnoses).mockResolvedValue({
      success: true,
      data: { results: [] },
      meta: { timestamp: "", requestId: "" },
    });
    vi.mocked(resolveDiagnosisWithAI).mockResolvedValue({
      success: true,
      data: {
        suggestions: [
          { code: "5A11", title: "Type 2 diabetes mellitus", confidence: 0.9 },
        ],
      },
      meta: { timestamp: "", requestId: "" },
    });

    renderList(<DiagnosisRowsList />);
    const capture = screen.getByTestId("diagnosis-capture-input");
    fireEvent.change(capture, { target: { value: "sugar" } });
    fireEvent.keyDown(capture, { key: "Enter" });

    const keepBtn = await screen.findByTestId("diagnosis-ai-keep-as-typed");
    fireEvent.click(keepBtn);

    expect(await screen.findByDisplayValue("sugar")).toBeInTheDocument();
    expect(screen.queryByTestId(/^diagnosis-code-chip-/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("diagnosis-ai-proposal")).not.toBeInTheDocument();
  });

  it("Shift+Enter forces an uncoded card and never calls the AI resolver (asmt-07)", async () => {
    vi.mocked(searchDiagnoses).mockResolvedValue({
      success: true,
      data: { results: [] },
      meta: { timestamp: "", requestId: "" },
    });

    renderList(<DiagnosisRowsList />);
    const capture = screen.getByTestId("diagnosis-capture-input");
    fireEvent.change(capture, { target: { value: "weird text" } });
    fireEvent.keyDown(capture, { key: "Enter", shiftKey: true });

    expect(await screen.findByDisplayValue("weird text")).toBeInTheDocument();
    expect(screen.queryByTestId(/^diagnosis-code-chip-/)).not.toBeInTheDocument();
    expect(vi.mocked(resolveDiagnosisWithAI)).not.toHaveBeenCalled();
  });
});
