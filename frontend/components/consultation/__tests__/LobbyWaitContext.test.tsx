import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LobbyWaitContext from "@/components/consultation/LobbyWaitContext";
import { DOCTOR_BUSY_OTHER_PATIENT } from "@/lib/consultation/lobby-wait-copy";
import type { PatientOpdSnapshot } from "@/types/opd-session";

const baseSnapshot = (): PatientOpdSnapshot => ({
  appointmentId: "appt-1",
  status: "confirmed",
  opdMode: "slot",
  suggestedPollSeconds: 20,
});

describe("LobbyWaitContext (crc-12)", () => {
  it("renders nothing when the snapshot is absent", () => {
    const { container } = render(<LobbyWaitContext snapshot={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("lobby-wait-context")).not.toBeInTheDocument();
  });

  it("renders the shared busy-other, delay, and queue ETA copy when present", () => {
    render(
      <LobbyWaitContext
        snapshot={{
          ...baseSnapshot(),
          opdMode: "queue",
          doctorBusyWith: "other_patient",
          delayMinutes: 7,
          etaMinutes: 15,
          etaRange: { minMinutes: 10, maxMinutes: 20 },
        }}
      />
    );

    expect(screen.getByTestId("lobby-wait-context")).toBeInTheDocument();
    expect(screen.getByText(DOCTOR_BUSY_OTHER_PATIENT)).toBeInTheDocument();
    expect(screen.getByText("Running late")).toBeInTheDocument();
    expect(screen.getByText(/About 7 minutes behind/i)).toBeInTheDocument();
    expect(screen.getByText(/Estimated wait: about/i)).toBeInTheDocument();
    expect(screen.getByText("15 min")).toBeInTheDocument();
    expect(screen.getByText("(range 10–20 min)")).toBeInTheDocument();
  });
});
