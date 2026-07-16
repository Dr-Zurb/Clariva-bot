import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiagnosisAiProposal } from "@/components/cockpit/rx/inputs/DiagnosisAiProposal";

const suggestion = {
  code: "5A11",
  title: "Type 2 diabetes mellitus",
  confidence: 0.9,
};

const suggestion2 = {
  code: "5A10",
  title: "Type 1 diabetes mellitus",
  confidence: 0.7,
};

describe("DiagnosisAiProposal (asmt-07)", () => {
  it("shows a loading state and a keep-as-typed row (not in the header)", () => {
    const onKeepAsTyped = vi.fn();
    render(
      <DiagnosisAiProposal
        status="loading"
        suggestions={[]}
        typedText="sugar"
        onAccept={vi.fn()}
        onKeepAsTyped={onKeepAsTyped}
      />,
    );
    expect(screen.getByText(/finding icd match/i)).toBeInTheDocument();
    const keep = screen.getByTestId("diagnosis-ai-keep-as-typed");
    expect(keep).toHaveTextContent(/Keep “sugar” as free text/i);
    fireEvent.click(keep);
    expect(onKeepAsTyped).toHaveBeenCalledTimes(1);
  });

  it("renders each suggestion with its code chip and applies it on Use", () => {
    const onAccept = vi.fn();
    render(
      <DiagnosisAiProposal
        status="ready"
        suggestions={[suggestion]}
        typedText="sugar"
        onAccept={onAccept}
        onKeepAsTyped={vi.fn()}
      />,
    );
    expect(screen.getByText("Type 2 diabetes mellitus")).toBeInTheDocument();
    expect(screen.getByText("5A11")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("diagnosis-ai-accept-0"));
    expect(onAccept).toHaveBeenCalledWith(suggestion);
  });

  it("places Keep as the last listbox option after the ICD matches", () => {
    render(
      <DiagnosisAiProposal
        status="ready"
        suggestions={[suggestion, suggestion2]}
        typedText="head ache"
        onAccept={vi.fn()}
        onKeepAsTyped={vi.fn()}
      />,
    );
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveAttribute("data-testid", "diagnosis-ai-accept-0");
    expect(options[1]).toHaveAttribute("data-testid", "diagnosis-ai-accept-1");
    expect(options[2]).toHaveAttribute("data-testid", "diagnosis-ai-keep-as-typed");
    expect(options[2]).toHaveTextContent(/Keep “head ache” as free text/i);
  });

  it("auto-focuses the first match and navigates with arrow keys + Enter", () => {
    const onAccept = vi.fn();
    const onKeepAsTyped = vi.fn();
    render(
      <DiagnosisAiProposal
        status="ready"
        suggestions={[suggestion, suggestion2]}
        typedText="sugar"
        onAccept={onAccept}
        onKeepAsTyped={onKeepAsTyped}
      />,
    );

    const panel = screen.getByTestId("diagnosis-ai-proposal");
    const first = screen.getByTestId("diagnosis-ai-accept-0");
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(panel, { key: "ArrowDown" });
    const second = screen.getByTestId("diagnosis-ai-accept-1");
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(panel, { key: "ArrowDown" });
    const keep = screen.getByTestId("diagnosis-ai-keep-as-typed");
    expect(keep).toHaveFocus();
    expect(keep).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(panel, { key: "Enter" });
    expect(onKeepAsTyped).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("accepts the highlighted match with Enter", () => {
    const onAccept = vi.fn();
    render(
      <DiagnosisAiProposal
        status="ready"
        suggestions={[suggestion, suggestion2]}
        typedText="sugar"
        onAccept={onAccept}
        onKeepAsTyped={vi.fn()}
      />,
    );

    const first = screen.getByTestId("diagnosis-ai-accept-0");
    expect(first).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId("diagnosis-ai-proposal"), {
      key: "Enter",
    });
    expect(onAccept).toHaveBeenCalledWith(suggestion);
  });

  it("keeps typed text on Escape", () => {
    const onKeepAsTyped = vi.fn();
    render(
      <DiagnosisAiProposal
        status="ready"
        suggestions={[suggestion]}
        typedText="sugar"
        onAccept={vi.fn()}
        onKeepAsTyped={onKeepAsTyped}
      />,
    );
    fireEvent.keyDown(screen.getByTestId("diagnosis-ai-proposal"), {
      key: "Escape",
    });
    expect(onKeepAsTyped).toHaveBeenCalledTimes(1);
  });

  it("degrades to a keep-only message on error", () => {
    render(
      <DiagnosisAiProposal
        status="error"
        suggestions={[]}
        typedText="sugar"
        onAccept={vi.fn()}
        onKeepAsTyped={vi.fn()}
      />,
    );
    expect(screen.getByText(/couldn.t match/i)).toBeInTheDocument();
    expect(screen.queryByTestId("diagnosis-ai-accept-0")).not.toBeInTheDocument();
    expect(screen.getByTestId("diagnosis-ai-keep-as-typed")).toBeInTheDocument();
  });
});
