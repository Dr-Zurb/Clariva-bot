import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChartMedAiProposal } from "@/components/ehr/chart/ChartMedAiProposal";
import type { AiParsedMedicine } from "@/lib/api/medicine-parse";

const med = (name: string, extra: Partial<AiParsedMedicine> = {}): AiParsedMedicine =>
  ({
    name,
    strengthValue: 5,
    strengthUnit: "mg",
    doseQty: 1,
    doseUnit: "tab",
    frequencyCode: "OD",
    ...extra,
  }) as AiParsedMedicine;

describe("ChartMedAiProposal (investigations-style keyboard)", () => {
  it("shows Keep as typed as a listbox row (not in the header)", () => {
    const onKeepAsTyped = vi.fn();
    render(
      <ChartMedAiProposal
        status="loading"
        medicines={[]}
        typedText="kjhkh 5mg"
        onAdd={vi.fn()}
        onAddAll={vi.fn()}
        onDismiss={vi.fn()}
        onKeepAsTyped={onKeepAsTyped}
      />,
    );
    expect(screen.getByText(/Reading with AI/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Keep as typed$/i })).not.toBeInTheDocument();
    const keep = screen.getByTestId("chart-med-ai-keep-as-typed");
    expect(keep).toHaveTextContent(/Keep “kjhkh 5mg” as typed/i);
    fireEvent.click(keep);
    expect(onKeepAsTyped).toHaveBeenCalledTimes(1);
  });

  it("places Keep as the last option after medicine suggestions", () => {
    render(
      <ChartMedAiProposal
        status="ready"
        medicines={[med("Amlodipine"), med("Metformin")]}
        typedText="aml + met"
        onAdd={vi.fn()}
        onAddAll={vi.fn()}
        onDismiss={vi.fn()}
        onKeepAsTyped={vi.fn()}
      />,
    );
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveAttribute("data-testid", "chart-med-ai-accept-0");
    expect(options[1]).toHaveAttribute("data-testid", "chart-med-ai-accept-1");
    expect(options[2]).toHaveAttribute("data-testid", "chart-med-ai-keep-as-typed");
  });

  it("auto-focuses the first match and navigates with arrows + Enter", () => {
    const onAdd = vi.fn();
    const onKeepAsTyped = vi.fn();
    render(
      <ChartMedAiProposal
        status="ready"
        medicines={[med("Amlodipine"), med("Metformin")]}
        typedText="line"
        onAdd={onAdd}
        onAddAll={vi.fn()}
        onDismiss={vi.fn()}
        onKeepAsTyped={onKeepAsTyped}
      />,
    );

    const panel = screen.getByTestId("chart-med-ai-proposal");
    const first = screen.getByTestId("chart-med-ai-accept-0");
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(panel, { key: "ArrowDown" });
    expect(screen.getByTestId("chart-med-ai-accept-1")).toHaveFocus();

    fireEvent.keyDown(panel, { key: "ArrowDown" });
    const keep = screen.getByTestId("chart-med-ai-keep-as-typed");
    expect(keep).toHaveFocus();
    expect(keep).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(panel, { key: "Enter" });
    expect(onKeepAsTyped).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("adds the highlighted medicine with Enter", () => {
    const onAdd = vi.fn();
    render(
      <ChartMedAiProposal
        status="ready"
        medicines={[med("Amlodipine"), med("Metformin")]}
        typedText="line"
        onAdd={onAdd}
        onAddAll={vi.fn()}
        onDismiss={vi.fn()}
        onKeepAsTyped={vi.fn()}
      />,
    );
    expect(screen.getByTestId("chart-med-ai-accept-0")).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId("chart-med-ai-proposal"), {
      key: "Enter",
    });
    expect(onAdd).toHaveBeenCalledWith(0);
  });

  it("keeps typed text on Escape when Keep is available", () => {
    const onKeepAsTyped = vi.fn();
    render(
      <ChartMedAiProposal
        status="ready"
        medicines={[med("Amlodipine")]}
        typedText="line"
        onAdd={vi.fn()}
        onAddAll={vi.fn()}
        onDismiss={vi.fn()}
        onKeepAsTyped={onKeepAsTyped}
      />,
    );
    fireEvent.keyDown(screen.getByTestId("chart-med-ai-proposal"), {
      key: "Escape",
    });
    expect(onKeepAsTyped).toHaveBeenCalledTimes(1);
  });

  it("Refine path: no Keep row; Esc dismisses", () => {
    const onDismiss = vi.fn();
    render(
      <ChartMedAiProposal
        status="ready"
        medicines={[med("Paracetamol")]}
        typedText="pcm 500"
        onAdd={vi.fn()}
        onAddAll={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.queryByTestId("chart-med-ai-keep-as-typed")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Dismiss AI suggestions/i)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId("chart-med-ai-proposal"), {
      key: "Escape",
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
