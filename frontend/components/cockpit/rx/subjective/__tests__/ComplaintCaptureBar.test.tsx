import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ComplaintCaptureBar } from "@/components/cockpit/rx/subjective/ComplaintCaptureBar";

vi.mock("@/lib/api/complaint-master", () => ({
  searchComplaints: vi.fn().mockResolvedValue({
    success: true,
    data: { results: [] },
    meta: { timestamp: "", requestId: "" },
  }),
}));

const mockClearCombo = vi.fn();
const mockUseDoctorComplaintCombos = vi.fn(() => ({
  combos: [] as unknown[],
  isLoading: false,
  clearCombo: mockClearCombo,
}));

vi.mock("@/hooks/useDoctorComplaintCombos", () => ({
  useDoctorComplaintCombos: (...args: unknown[]) =>
    mockUseDoctorComplaintCombos(...args),
}));

describe("ComplaintCaptureBar hint", () => {
  beforeEach(() => {
    mockClearCombo.mockClear();
    mockUseDoctorComplaintCombos.mockReturnValue({
      combos: [],
      isLoading: false,
      clearCombo: mockClearCombo,
    });
  });

  function renderBar() {
    return render(<ComplaintCaptureBar onCapture={vi.fn()} />);
  }

  function typeDraft(value: string) {
    fireEvent.change(screen.getByLabelText(/Add chief complaint/i), {
      target: { value },
    });
  }

  it("stays silent on a short name with no details", () => {
    renderBar();
    typeDraft("chest pain");
    expect(screen.queryByText(/↵/)).not.toBeInTheDocument();
  });

  it("previews parsed details on a structured line", () => {
    renderBar();
    typeDraft("severe headache for 3 days at night");
    const hint = screen.getByText(/3 days/i);
    expect(hint.textContent).toMatch(/Severe/i);
    expect(hint.textContent).toMatch(/Night|night/i);
    expect(screen.queryByText(/plain text|negation|vernacular|one complaint/i)).not.toBeInTheDocument();
  });

  it("warns on negation without committing AI", () => {
    const onCapture = vi.fn();
    render(<ComplaintCaptureBar onCapture={onCapture} />);
    const input = screen.getByLabelText(/Add chief complaint/i);
    fireEvent.change(input, { target: { value: "no fever but cough" } });
    expect(
      screen.getByText(/negation isn't understood — it will stay in the name/i),
    ).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCapture).toHaveBeenCalledWith(
      expect.objectContaining({ name: "no fever but cough" }),
    );
  });

  it("warns that a long bare list adds as one complaint", () => {
    renderBar();
    typeDraft("fever cough loose motions body ache weakness");
    expect(
      screen.getByText(/no details recognised — adds as one complaint/i),
    ).toBeInTheDocument();
  });

  it("emits the frequent habit pack on Enter", async () => {
    mockUseDoctorComplaintCombos.mockReturnValue({
      combos: [
        {
          complaintName: "Headache",
          nameKey: "headache",
          category: "pain",
          severityBand: "moderate",
          laterality: null,
          character: null,
          associatedNames: ["photophobia", "nausea"],
          useCount: 12,
          lastUsedAt: "2026-09-01T00:00:00Z",
        },
      ],
      isLoading: false,
      clearCombo: mockClearCombo,
    });

    const onCapture = vi.fn();
    render(<ComplaintCaptureBar token="test-token" onCapture={onCapture} />);
    const input = screen.getByLabelText(/Add chief complaint/i);
    fireEvent.change(input, { target: { value: "he" } });

    await waitFor(() => {
      expect(screen.getByTestId("complaint-combo-option")).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Headache",
        combo: expect.objectContaining({
          severityBand: "moderate",
          associatedNames: ["photophobia", "nausea"],
        }),
      }),
    );
  });
});
