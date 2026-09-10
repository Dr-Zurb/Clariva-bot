import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LobbyConnectionProbe from "@/components/consultation/LobbyConnectionProbe";
import {
  readProbeAutoRunGate,
  runConnectionProbe,
} from "@/lib/consultation/connection-probe";

vi.mock("@/lib/consultation/connection-probe", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/lib/consultation/connection-probe")
    >();
  return {
    ...actual,
    readProbeAutoRunGate: vi.fn(),
    runConnectionProbe: vi.fn(),
  };
});

const readGate = vi.mocked(readProbeAutoRunGate);
const runProbe = vi.mocked(runConnectionProbe);

describe("LobbyConnectionProbe (crc-11)", () => {
  beforeEach(() => {
    readGate.mockReset();
    runProbe.mockReset();
  });

  it("shows an advisory result after a successful auto-run, never a raw Mbps figure", async () => {
    readGate.mockReturnValue({
      detection: "non-cellular",
      saveData: false,
      autoRun: true,
    });
    runProbe.mockResolvedValue("good");

    render(<LobbyConnectionProbe />);

    expect(await screen.findByTestId("lobby-connection-probe")).toHaveAttribute(
      "data-tier",
      "good"
    );
    expect(screen.getByText("Connection: Good")).toBeInTheDocument();
    expect(screen.queryByText(/Mbps/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Test again" })
    ).toBeInTheDocument();
  });

  it("uses Poor copy that names a concrete next step", async () => {
    readGate.mockReturnValue({
      detection: "unknown",
      saveData: false,
      autoRun: true,
    });
    runProbe.mockResolvedValue("poor");

    render(<LobbyConnectionProbe />);

    expect(await screen.findByTestId("lobby-connection-probe")).toHaveAttribute(
      "data-tier",
      "poor"
    );
    expect(screen.getByText(/move closer to your router/i)).toBeInTheDocument();
    expect(screen.getByText(/audio-only/i)).toBeInTheDocument();
    expect(screen.getByText(/voice consult/i)).toBeInTheDocument();
  });

  it("renders nothing when the probe fails", async () => {
    readGate.mockReturnValue({
      detection: "non-cellular",
      saveData: false,
      autoRun: true,
    });
    runProbe.mockRejectedValue(new Error("probe_http"));

    const { container } = render(<LobbyConnectionProbe />);

    await waitFor(() => {
      expect(runProbe).toHaveBeenCalled();
    });
    expect(
      screen.queryByTestId("lobby-connection-probe")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("lobby-connection-probe-idle")
    ).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("does not auto-run on cellular — waits for Test connection", async () => {
    readGate.mockReturnValue({
      detection: "cellular",
      saveData: false,
      autoRun: false,
    });

    render(<LobbyConnectionProbe />);

    expect(
      await screen.findByTestId("lobby-connection-probe-idle")
    ).toBeInTheDocument();
    expect(runProbe).not.toHaveBeenCalled();

    runProbe.mockResolvedValue("marginal");
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    expect(
      screen.getByTestId("lobby-connection-probe-running")
    ).toBeInTheDocument();
    expect(await screen.findByTestId("lobby-connection-probe")).toHaveAttribute(
      "data-tier",
      "marginal"
    );
    expect(screen.getByText("Connection: Fair")).toBeInTheDocument();
  });
});
