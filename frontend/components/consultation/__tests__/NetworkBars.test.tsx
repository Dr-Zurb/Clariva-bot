import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NetworkBars, { computePopoverPosition } from "../NetworkBars";

describe("computePopoverPosition", () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  });

  it("left-aligns when there is room to the right", () => {
    const trigger = {
      left: 40,
      right: 72,
      top: 100,
      bottom: 124,
      width: 32,
      height: 24,
    } as DOMRect;

    expect(computePopoverPosition(trigger, 120)).toEqual({
      top: 128,
      left: 40,
    });
  });

  it("right-aligns when the panel would overflow the viewport edge", () => {
    // CallStageHeader mounts bars near the right of the video column.
    const trigger = {
      left: 900,
      right: 932,
      top: 40,
      bottom: 64,
      width: 32,
      height: 24,
    } as DOMRect;

    const pos = computePopoverPosition(trigger, 120);
    expect(pos.left).toBe(932 - 224);
    expect(pos.top).toBe(68);
  });

  it("opens above when there is no room below", () => {
    const trigger = {
      left: 40,
      right: 72,
      top: 720,
      bottom: 744,
      width: 32,
      height: 24,
    } as DOMRect;

    const pos = computePopoverPosition(trigger, 120);
    expect(pos.top).toBe(720 - 4 - 120);
  });
});

describe("NetworkBars", () => {
  it("shows a visible caption to disambiguate whose connection it is", () => {
    render(
      <NetworkBars
        level={4}
        label="Your connection"
        caption="You"
        tooltip={<p>stats</p>}
      />,
    );
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Your connection/i }),
    ).toBeInTheDocument();
  });

  it("portals the stats popover to document.body so overflow parents cannot clip it", () => {
    render(
      <div style={{ overflow: "hidden", width: 80 }}>
        <NetworkBars
          level={3}
          label="Patient network"
          tooltip={<p>Patient&apos;s connection</p>}
        />
      </div>,
    );

    // Twilio level 3 → 2 of 4 bars (see networkLevelToBars).
    fireEvent.click(
      screen.getByRole("button", { name: /Patient network: 2 of 4 bars/i }),
    );

    const popover = screen.getByTestId("network-bars-popover");
    expect(popover).toBeInTheDocument();
    expect(popover.textContent).toContain("Patient's connection");
    expect(popover.parentElement).toBe(document.body);
  });

  it("notifies onOpenChange when the popover toggles", () => {
    const onOpenChange = vi.fn();
    render(
      <NetworkBars
        level={4}
        label="Your network"
        tooltip={<p>Your connection</p>}
        onOpenChange={onOpenChange}
      />,
    );

    // Twilio level 4 → 3 of 4 bars (see networkLevelToBars).
    fireEvent.click(
      screen.getByRole("button", { name: /Your network: 3 of 4 bars/i }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(true);

    fireEvent.click(
      screen.getByRole("button", { name: /Your network: 3 of 4 bars/i }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
