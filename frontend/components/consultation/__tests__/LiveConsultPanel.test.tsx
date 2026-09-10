import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LiveConsultPanel from "../LiveConsultPanel";
import type { Appointment } from "@/types/appointment";

const appointment = {
  id: "apt-1",
  doctor_id: "doc-1",
  patient_id: "pat-1",
  appointment_date: "2026-08-09T09:00:00.000Z",
  status: "confirmed",
  consultation_type: "video",
} as Appointment;

describe("LiveConsultPanel", () => {
  it("fills height and collapses modality switch by default", () => {
    render(
      <div style={{ height: 400 }}>
        <LiveConsultPanel
          appointment={appointment}
          token="tok"
          modality="video"
          roomSlot={<div data-testid="room">room</div>}
          modalitySwitchSlot={<button type="button">Switch</button>}
        />
      </div>,
    );

    const panel = screen.getByTestId("live-consult-panel");
    expect(panel).toHaveAttribute("data-fill-height", "true");
    expect(screen.getByText("Change modality").tagName).toBe("SUMMARY");
    expect(screen.getByTestId("room")).toBeInTheDocument();
  });

  it("keeps legacy stacked layout when fillHeight is false", () => {
    render(
      <LiveConsultPanel
        appointment={appointment}
        token="tok"
        modality="video"
        fillHeight={false}
        roomSlot={<div>room</div>}
        modalitySwitchSlot={<button type="button">Switch</button>}
      />,
    );

    expect(screen.getByTestId("live-consult-panel")).toHaveAttribute(
      "data-fill-height",
      "false",
    );
    expect(screen.queryByText("Change modality")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch" })).toBeInTheDocument();
  });

  it("omits the modality strip when cockpit video/voice pass a null slot", () => {
    render(
      <LiveConsultPanel
        appointment={appointment}
        token="tok"
        modality="video"
        roomSlot={<div data-testid="room">room</div>}
        modalitySwitchSlot={null}
      />,
    );

    expect(screen.queryByText("Change modality")).not.toBeInTheDocument();
    expect(screen.getByTestId("room")).toBeInTheDocument();
  });
});
