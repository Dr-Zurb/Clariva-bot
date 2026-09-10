import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CallStageHeader from "../CallStageHeader";

vi.mock("@/hooks/useCallDuration", () => ({
  useCallDuration: () => ({ formatted: "01:23", seconds: 83 }),
}));

describe("CallStageHeader", () => {
  it("renders counterparty, duration, and REC without overlaying tiles", () => {
    render(
      <CallStageHeader
        counterpartyName="Patient"
        connectedAt={new Date()}
        remoteNetworkLevel={4}
        status="live"
        recordingActive
      />,
    );

    const header = screen.getByTestId("call-stage-header");
    expect(header).toBeInTheDocument();
    expect(header.className).toMatch(/bg-card/);
    // Name in the title row + "Patient" caption on the network bars.
    expect(screen.getAllByText("Patient").length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByRole("button", { name: /Patient's connection/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("01:23")).toBeInTheDocument();
    expect(screen.getByText("REC")).toBeInTheDocument();
  });

  it("offers a direct Full screen action (no Fill Consult tab)", () => {
    const onFs = vi.fn();
    render(
      <CallStageHeader
        counterpartyName="Patient"
        connectedAt={null}
        remoteNetworkLevel={null}
        status="live"
        onExpandFullscreen={onFs}
      />,
    );

    expect(screen.queryByText("Fill Consult tab")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("call-stage-expand"));
    expect(onFs).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("call-stage-expand")).toHaveTextContent(
      "Full screen",
    );
  });

  it("shows Exit when expanded", () => {
    const onExit = vi.fn();
    render(
      <CallStageHeader
        counterpartyName="Patient"
        connectedAt={null}
        remoteNetworkLevel={null}
        status="live"
        fillTabActive
        onExitExpand={onExit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /exit/i }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
