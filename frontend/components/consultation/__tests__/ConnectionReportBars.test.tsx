import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ConnectionReportBars from "../ConnectionReportBars";

vi.mock("@/hooks/useNetworkQuality", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useNetworkQuality")>();
  return {
    ...actual,
    useNetworkQuality: () => ({ level: 5, lastUpdated: new Date() }),
  };
});

vi.mock("@/hooks/useVideoCallStats", () => ({
  useVideoCallStats: () => ({
    rttMs: 28,
    jitterMs: 4,
    resolution: { width: 1280, height: 720 },
    fps: 30,
    kbpsSend: 1800,
    kbpsReceive: 1600,
    packetLossPct: 0.2,
    remoteResolution: { width: 640, height: 360 },
    remoteFps: 24,
    remoteFreezeCount: 0,
    qualityLimitationReason: "none",
  }),
}));

vi.mock("@/hooks/useConnectionBeacon", () => ({
  usePeerConnectionBeacon: () => ({
    beacon: {
      v: 1,
      t: Date.now(),
      level: 4,
      rttMs: 55,
      jitterMs: 8,
      lossPct: 1.2,
      res: { w: 1280, h: 720 },
      fps: 28,
      kbps: 1500,
      limit: "bandwidth",
    },
    stale: false,
  }),
}));

describe("ConnectionReportBars", () => {
  it("renders local bars without needing a room poll from the parent", () => {
    render(
      <ConnectionReportBars
        room={null}
        variant="local"
        label="Your connection"
        caption="You"
      />,
    );
    expect(
      screen.getByRole("button", { name: /Your connection/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("renders remote bars from the peer beacon", () => {
    render(
      <ConnectionReportBars
        room={null}
        variant="remote"
        label="Patient's connection"
        caption="Patient"
      />,
    );
    expect(
      screen.getByRole("button", { name: /Patient's connection/i }),
    ).toBeInTheDocument();
  });
});
