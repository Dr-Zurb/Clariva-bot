import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CameraSwitchButton } from "../CameraSwitchButton";

const devices = [
  {
    deviceId: "front",
    label: "Front Camera",
    facing: "front" as const,
    isCurrent: true,
    groupId: "g1",
  },
  {
    deviceId: "back",
    label: "Back Camera",
    facing: "back" as const,
    isCurrent: false,
    groupId: "g1",
  },
];

describe("CameraSwitchButton", () => {
  it("renders a flip control on mobile when canFlip even with one camera", () => {
    render(
      <CameraSwitchButton
        devices={[devices[0]]}
        current="front"
        flip={vi.fn()}
        switchTo={vi.fn()}
        isFlipping={false}
        hasMultipleCameras={false}
        canFlip
        currentFacing="front"
        forceLayout="mobile"
      />,
    );
    expect(screen.getByTestId("camera-flip-button")).toHaveAttribute(
      "aria-label",
      "Switch to back camera",
    );
  });

  it("hides when neither canFlip nor multiple cameras", () => {
    const { container } = render(
      <CameraSwitchButton
        devices={[devices[0]]}
        current="front"
        flip={vi.fn()}
        switchTo={vi.fn()}
        isFlipping={false}
        hasMultipleCameras={false}
        canFlip={false}
        forceLayout="mobile"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
