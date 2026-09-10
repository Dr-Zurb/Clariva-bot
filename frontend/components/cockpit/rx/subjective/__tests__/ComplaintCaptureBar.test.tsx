import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ComplaintCaptureBar } from "@/components/cockpit/rx/subjective/ComplaintCaptureBar";

describe("ComplaintCaptureBar hint", () => {
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
});
