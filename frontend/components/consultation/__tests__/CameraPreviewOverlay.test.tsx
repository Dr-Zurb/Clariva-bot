/**
 * text-C1 — CameraPreviewOverlay tests.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CameraPreviewOverlay } from "@/components/consultation/CameraPreviewOverlay";

describe("CameraPreviewOverlay", () => {
  it("renders preview actions and sends caption", () => {
    const onSend = vi.fn();
    render(
      <CameraPreviewOverlay
        previewUrl="blob:preview"
        onRetake={vi.fn()}
        onSwitchToGallery={vi.fn()}
        onCancel={vi.fn()}
        onSend={onSend}
      />,
    );

    expect(screen.getByTestId("camera-preview-overlay")).toBeInTheDocument();
    expect(screen.getByAltText("Captured photo preview")).toHaveAttribute(
      "src",
      "blob:preview",
    );

    const caption = screen.getByTestId("camera-preview-caption");
    fireEvent.change(caption, { target: { value: "Rash on left arm" } });
    fireEvent.click(screen.getByTestId("camera-preview-send"));

    expect(onSend).toHaveBeenCalledWith("Rash on left arm");
  });

  it("calls cancel on Escape", () => {
    const onCancel = vi.fn();
    render(
      <CameraPreviewOverlay
        previewUrl="blob:preview"
        onRetake={vi.fn()}
        onSwitchToGallery={vi.fn()}
        onCancel={onCancel}
        onSend={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
