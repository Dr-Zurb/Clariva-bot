/**
 * EndedConsultBody — unit tests (ecb-01, 2026-05-27).
 *
 * Covers the four discriminator branches the component renders:
 *   - completed-with-session (text / voice / video × duration shapes)
 *   - completed-no-session
 *   - cancelled
 *   - no-show
 *
 * Plus telemetry one-shot semantics — `appointmentId` gates emission so
 * unit tests can omit it to stay quiet.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { EndedConsultBody } from "@/components/cockpit/middle/EndedConsultBody";

const trackEndedBody = vi.fn();
vi.mock("@/lib/patient-profile/telemetry", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/patient-profile/telemetry")>();
  return {
    ...actual,
    trackCockpitV2REndedConsultBodyLanded: (...args: unknown[]) =>
      trackEndedBody(...args),
  };
});

beforeEach(() => {
  trackEndedBody.mockClear();
});

describe("EndedConsultBody · cancelled branch (terminal)", () => {
  it("renders the cancelled copy with destructive icon", () => {
    render(
      <EndedConsultBody
        state="terminal"
        appointmentStatus="cancelled"
        modality={null}
        startedAt={null}
        endedAt={null}
        durationSeconds={null}
      />,
    );
    const region = screen.getByRole("region", { name: "Appointment cancelled" });
    expect(region).toBeInTheDocument();
    expect(region.textContent).toContain("Appointment cancelled");
    expect(region.textContent).toContain(
      "This visit was cancelled before it took place.",
    );
  });
});

describe("EndedConsultBody · no-show branch (terminal)", () => {
  it("renders the no-show copy with warning icon", () => {
    render(
      <EndedConsultBody
        state="terminal"
        appointmentStatus="no_show"
        modality={null}
        startedAt={null}
        endedAt={null}
        durationSeconds={null}
      />,
    );
    const region = screen.getByRole("region", {
      name: "Patient did not attend",
    });
    expect(region).toBeInTheDocument();
    expect(region.textContent).toContain("Patient did not attend");
    expect(region.textContent).toContain("Reschedule from the header menu.");
  });
});

describe("EndedConsultBody · completed-no-session branch", () => {
  it("renders the visit-completed copy when no session row exists", () => {
    render(
      <EndedConsultBody
        state="ended"
        appointmentStatus="completed"
        modality={null}
        startedAt={null}
        endedAt={null}
        durationSeconds={null}
      />,
    );
    const region = screen.getByRole("region", { name: "Visit completed" });
    expect(region).toBeInTheDocument();
    expect(region.textContent).toContain("Visit completed");
    expect(region.textContent).toContain(
      "No consultation recorded for this visit.",
    );
  });

  it("falls back to no-session copy when modality is present but endedAt is null", () => {
    // Defensive: a stale session row missing actual_ended_at should not
    // confidently render "Voice consultation ended" with no timestamp.
    render(
      <EndedConsultBody
        state="ended"
        appointmentStatus="completed"
        modality="voice"
        startedAt="2026-05-27T10:00:00Z"
        endedAt={null}
        durationSeconds={null}
      />,
    );
    expect(screen.getByText("Visit completed")).toBeInTheDocument();
  });
});

describe("EndedConsultBody · completed-with-session branch", () => {
  it.each([
    ["text", "Text consultation ended"],
    ["voice", "Voice consultation ended"],
    ["video", "Video consultation ended"],
  ] as const)(
    "renders %s modality copy with time and duration",
    (modality, expectedTitle) => {
      render(
        <EndedConsultBody
          state="ended"
          appointmentStatus="completed"
          modality={modality}
          startedAt="2026-05-27T15:30:00Z"
          endedAt="2026-05-27T15:42:00Z"
          durationSeconds={720}
        />,
      );
      const region = screen.getByRole("region", { name: expectedTitle });
      expect(region).toBeInTheDocument();
      expect(region.textContent).toContain(expectedTitle);
      // 720s = 12 min. Server-computed duration takes priority over
      // start/end arithmetic.
      expect(region.textContent).toContain("12 min");
    },
  );

  it("uses server-computed duration when present, ignores arithmetic", () => {
    render(
      <EndedConsultBody
        state="ended"
        appointmentStatus="completed"
        modality="video"
        startedAt="2026-05-27T15:30:00Z"
        endedAt="2026-05-27T15:42:00Z"
        // 9 server-canonical minutes — diverges from the 12-min start/end
        // arithmetic. We trust the server.
        durationSeconds={540}
      />,
    );
    const region = screen.getByRole("region");
    expect(region.textContent).toContain("9 min");
    expect(region.textContent).not.toContain("12 min");
  });

  it("falls back to start/end arithmetic when durationSeconds is null", () => {
    render(
      <EndedConsultBody
        state="ended"
        appointmentStatus="completed"
        modality="voice"
        startedAt="2026-05-27T15:30:00Z"
        endedAt="2026-05-27T15:38:00Z"
        durationSeconds={null}
      />,
    );
    expect(screen.getByRole("region").textContent).toContain("8 min");
  });

  it("renders '<1 min' for sub-minute consultations", () => {
    render(
      <EndedConsultBody
        state="ended"
        appointmentStatus="completed"
        modality="voice"
        startedAt="2026-05-27T15:30:00Z"
        endedAt="2026-05-27T15:30:20Z"
        durationSeconds={20}
      />,
    );
    expect(screen.getByRole("region").textContent).toContain("<1 min");
  });

  it("omits the duration meta when neither field is usable", () => {
    render(
      <EndedConsultBody
        state="ended"
        appointmentStatus="completed"
        modality="text"
        startedAt={null}
        endedAt="2026-05-27T15:30:00Z"
        durationSeconds={null}
      />,
    );
    const region = screen.getByRole("region");
    expect(region.textContent).toContain("Text consultation ended");
    expect(region.textContent).not.toContain("min");
  });
});

describe("EndedConsultBody · telemetry (ecb-01 DL-5)", () => {
  it("fires landed telemetry exactly once with the appointmentId provided", () => {
    render(
      <EndedConsultBody
        state="ended"
        appointmentStatus="completed"
        modality="video"
        startedAt="2026-05-27T15:30:00Z"
        endedAt="2026-05-27T15:42:00Z"
        durationSeconds={720}
        appointmentId="appt-ecb-1"
      />,
    );
    expect(trackEndedBody).toHaveBeenCalledTimes(1);
    expect(trackEndedBody).toHaveBeenCalledWith({
      appointmentId: "appt-ecb-1",
      mode: "completed-with-session",
      modality: "video",
    });
  });

  it("does NOT fire telemetry when appointmentId is omitted (test mounts)", () => {
    render(
      <EndedConsultBody
        state="terminal"
        appointmentStatus="cancelled"
        modality={null}
        startedAt={null}
        endedAt={null}
        durationSeconds={null}
      />,
    );
    expect(trackEndedBody).not.toHaveBeenCalled();
  });

  it("emits modality='n/a' for terminal / completed-no-session modes", () => {
    render(
      <EndedConsultBody
        state="terminal"
        appointmentStatus="no_show"
        modality={null}
        startedAt={null}
        endedAt={null}
        durationSeconds={null}
        appointmentId="appt-ecb-noshow"
      />,
    );
    expect(trackEndedBody).toHaveBeenCalledWith({
      appointmentId: "appt-ecb-noshow",
      mode: "no-show",
      modality: "n/a",
    });
  });
});
