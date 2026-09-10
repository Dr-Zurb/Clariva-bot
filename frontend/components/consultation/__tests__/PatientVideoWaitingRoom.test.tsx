import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PatientVideoWaitingRoom from "@/components/consultation/PatientVideoWaitingRoom";

vi.mock("@/components/consultation/VideoConsultPreCall", () => ({
  default: ({
    onContinue,
    onSkipMic,
  }: {
    onContinue: (chosen: {
      cameraId: string | null;
      micId: string | null;
    }) => void;
    onSkipMic: (chosen: { cameraId: string | null }) => void;
  }) => (
    <div data-testid="video-consult-precall">
      <button
        type="button"
        onClick={() => onContinue({ cameraId: "cam-1", micId: "mic-1" })}
      >
        Continue
      </button>
      <button type="button" onClick={() => onSkipMic({ cameraId: "cam-1" })}>
        Skip mic check
      </button>
      <button
        type="button"
        onClick={() => onContinue({ cameraId: null, micId: "mic-1" })}
      >
        Continue audio-only
      </button>
    </div>
  ),
}));

vi.mock("@/components/consultation/CellularDataWarning", () => ({
  default: () => null,
}));

vi.mock("@/components/consultation/LobbyConnectionProbe", () => ({
  default: () => null,
}));

describe("PatientVideoWaitingRoom (crc-10)", () => {
  it("renders the device check and stay-on-this-page copy before the check is done", () => {
    render(
      <PatientVideoWaitingRoom
        scheduledStartAt={null}
        deviceCheckDone={false}
        onContinue={vi.fn()}
        onSkipMic={vi.fn()}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Waiting room" })
    ).toBeInTheDocument();
    expect(screen.getByText(/Stay on this page/i)).toBeInTheDocument();
    expect(screen.getByTestId("video-consult-precall")).toBeInTheDocument();
    expect(
      screen.getByTestId("video-consult-lobby-header")
    ).toBeInTheDocument();
  });

  it("hides the device check after Continue and shows the ready card", () => {
    render(
      <PatientVideoWaitingRoom
        scheduledStartAt={null}
        deviceCheckDone={true}
        onContinue={vi.fn()}
        onSkipMic={vi.fn()}
      />
    );

    expect(
      screen.queryByTestId("video-consult-precall")
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("video-lobby-ready")).toBeInTheDocument();
    expect(screen.getByText(/No extra tap needed/i)).toBeInTheDocument();
  });

  it("Continue and Skip mic both reach the parent (joinable paths, including camera-denied)", () => {
    const onContinue = vi.fn();
    const onSkipMic = vi.fn();
    render(
      <PatientVideoWaitingRoom
        scheduledStartAt={null}
        deviceCheckDone={false}
        onContinue={onContinue}
        onSkipMic={onSkipMic}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledWith({
      cameraId: "cam-1",
      micId: "mic-1",
    });

    fireEvent.click(screen.getByRole("button", { name: "Skip mic check" }));
    expect(onSkipMic).toHaveBeenCalledWith({ cameraId: "cam-1" });

    fireEvent.click(
      screen.getByRole("button", { name: "Continue audio-only" })
    );
    expect(onContinue).toHaveBeenCalledWith({ cameraId: null, micId: "mic-1" });
  });

  it("shows lobby wait context when a snapshot is present and falls back when it is not", () => {
    const { rerender } = render(
      <PatientVideoWaitingRoom
        scheduledStartAt={null}
        deviceCheckDone={false}
        onContinue={vi.fn()}
        onSkipMic={vi.fn()}
      />
    );
    expect(screen.queryByTestId("lobby-wait-context")).not.toBeInTheDocument();
    expect(screen.getByText(/Stay on this page/i)).toBeInTheDocument();

    rerender(
      <PatientVideoWaitingRoom
        scheduledStartAt={null}
        deviceCheckDone={false}
        onContinue={vi.fn()}
        onSkipMic={vi.fn()}
        snapshot={{
          appointmentId: "appt-1",
          status: "confirmed",
          opdMode: "slot",
          suggestedPollSeconds: 20,
          doctorBusyWith: "other_patient",
        }}
      />
    );
    expect(screen.getByTestId("lobby-wait-context")).toBeInTheDocument();
    expect(
      screen.getByText(/The doctor is with another patient/i)
    ).toBeInTheDocument();
  });
});
