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
    fireEvent.click(screen.getByTestId("rx-revision-reason-dose_correction"));
    fireEvent.click(screen.getByTestId("rx-revision-reason-confirm"));
    expect(onConfirm).toHaveBeenCalledWith("dose_correction", undefined);
  });
});
