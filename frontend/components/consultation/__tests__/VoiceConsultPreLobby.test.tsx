import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import VoiceConsultPreLobby from "@/components/consultation/VoiceConsultPreLobby";

vi.mock("@/components/consultation/VoiceConsultPreCall", () => ({
  default: ({ onJoin, onSkip }: { onJoin: () => void; onSkip: () => void }) => (
    <div data-testid="voice-consult-precall">
      <button type="button" onClick={onJoin}>
        Join call
      </button>
      <button type="button" onClick={onSkip}>
        Skip mic check
      </button>
    </div>
  ),
}));

describe("VoiceConsultPreLobby (crc-12)", () => {
  it("renders the mic check in holding before Start and does not auto-join", () => {
    const onJoin = vi.fn();
    render(
      <VoiceConsultPreLobby
        role="patient"
        counterpartyLabel="your doctor"
        holdingMode
        deviceCheckDone={false}
        onJoin={onJoin}
        onSkip={vi.fn()}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Waiting room" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("voice-consult-precall")).toBeInTheDocument();
    expect(screen.getByText(/Stay on this page/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Join call" }));
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it("hides the mic check after it is cached and shows the ready card", () => {
    render(
      <VoiceConsultPreLobby
        role="patient"
        counterpartyLabel="your doctor"
        holdingMode
        deviceCheckDone
        onJoin={vi.fn()}
        onSkip={vi.fn()}
      />
    );

    expect(
      screen.queryByTestId("voice-consult-precall")
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("voice-lobby-ready")).toBeInTheDocument();
    expect(screen.getByText(/No extra tap needed/i)).toBeInTheDocument();
  });

  it("keeps the doctor / late-opener precall chrome when not in holding mode", () => {
    render(
      <VoiceConsultPreLobby
        role="patient"
        counterpartyLabel="your doctor"
        onJoin={vi.fn()}
        onSkip={vi.fn()}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Voice consultation" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("voice-consult-precall")).toBeInTheDocument();
    expect(screen.queryByTestId("voice-lobby-ready")).not.toBeInTheDocument();
  });
});
