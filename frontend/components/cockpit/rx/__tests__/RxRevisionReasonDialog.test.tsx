import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RxRevisionReasonDialog } from "@/components/cockpit/rx/RxRevisionReasonDialog";

describe("RxRevisionReasonDialog", () => {
  it("refuses confirm until a preset is chosen", () => {
    const onConfirm = vi.fn();
    render(
      <RxRevisionReasonDialog
        open
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByTestId("rx-revision-reason-confirm")).toBeDisabled();
    fireEvent.click(screen.getByTestId("rx-revision-reason-confirm"));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms a preset reason", () => {
    const onConfirm = vi.fn();
    render(
      <RxRevisionReasonDialog
        open
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByRole("heading", { name: "New slip" })).toBeInTheDocument();
    expect(screen.getByText("Reason")).toBeInTheDocument();
    expect(screen.getByText("Treatment change")).toBeInTheDocument();
    expect(screen.getByText("Item added")).toBeInTheDocument();
    expect(screen.queryByText(/why/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dose correction/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pharmacy/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("rx-revision-reason-treatment_change"));
    fireEvent.click(screen.getByTestId("rx-revision-reason-confirm"));
    expect(onConfirm).toHaveBeenCalledWith("treatment_change", undefined);
  });

  it("states the replace line without asking why", () => {
    render(
      <RxRevisionReasonDialog
        open
        replacesLine="Replaces the one issued at 7:11 AM."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Replaces the one issued at 7:11 AM."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("rx-revision-reason-confirm")).toHaveTextContent(
      "Issue new slip",
    );
  });
});
