/**
 * ReadyCard — unit tests (Vitest + RTL).
 *
 * cs-10 acceptance criteria:
 *   - Renders one "Start *" button (label adapts to modality).
 *   - Renders a "Switch modality" trigger that opens a dropdown with the
 *     OTHER modalities (current modality excluded).
 *   - Does NOT render a "Mark no-show" button.
 *   - Lobby banner is shown when `showLobbyBanner=true`.
 *
 * Run: `vitest run frontend/components/consultation/cockpit/__tests__/ReadyCard.test.tsx`
 */

import React, { createRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

import ReadyCard from "../ReadyCard";
import type { Appointment } from "@/types/appointment";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// ConsultationLauncher is a heavyweight component (Twilio, Supabase, router).
// Stub it out — ReadyCard's CTA calls the forwarded ref, not the launcher's UI.
vi.mock("@/components/consultation/ConsultationLauncher", () => ({
  default: React.forwardRef(function MockLauncher(_props: unknown, _ref: unknown) {
    return <div data-testid="consultation-launcher" />;
  }),
}));

vi.mock("@/lib/api", () => ({
  resendConsultationLink: vi.fn().mockResolvedValue({ data: { sent: true } }),
}));

vi.mock("@/lib/format-date", () => ({
  formatDate: (_iso: string) => "Mon, Jan 01, 2026",
  formatTime: (_iso: string) => "10:30",
}));

// Radix DropdownMenu requires a real DOM environment. The jsdom environment
// handles it adequately for open/close interactions.

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAppointment(
  overrides: Partial<Appointment> = {},
): Appointment {
  return {
    id: "appt-1",
    doctor_id: "doc-1",
    patient_id: "pat-1",
    patient_name: "Ravi Sharma",
    patient_phone: "+91 98765 43210",
    appointment_date: "2026-01-01T10:30:00.000Z",
    status: "confirmed",
    consultation_type: "video",
    consultation_session: null,
    notes: null,
    ...overrides,
  } as Appointment;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderReadyCard(
  overrides: Partial<Appointment> = {},
  props: Partial<React.ComponentProps<typeof ReadyCard>> = {},
) {
  const appointment = makeAppointment(overrides);
  return render(
    <ReadyCard
      appointment={appointment}
      token="test-token"
      {...props}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ReadyCard — cs-10 primary CTA", () => {
  it("renders 'Start video consult' for a video appointment", () => {
    renderReadyCard({ consultation_type: "video" });
    expect(
      screen.getByRole("button", { name: /start video consult/i }),
    ).toBeInTheDocument();
  });

  it("renders 'Start voice call' for a voice appointment", () => {
    renderReadyCard({ consultation_type: "voice" });
    expect(
      screen.getByRole("button", { name: /start voice call/i }),
    ).toBeInTheDocument();
  });

  it("renders 'Start chat' for a text appointment", () => {
    renderReadyCard({ consultation_type: "text" });
    expect(
      screen.getByRole("button", { name: /start chat/i }),
    ).toBeInTheDocument();
  });

  it("renders 'Mark patient called' for an in_clinic appointment", () => {
    renderReadyCard({ consultation_type: "in_clinic" });
    expect(
      screen.getByRole("button", { name: /mark patient called/i }),
    ).toBeInTheDocument();
  });

  it("calls launcherRef.current.start with 'video' when primary button is clicked", () => {
    const startFn = vi.fn();
    const launcherRef = createRef<{ start: (m: string) => void; isLive: boolean }>();
    // Inject imperative handle via ref
    // Note: because ConsultationLauncher is mocked, launcherRef.current stays null.
    // We test the callLauncherStart helper by attaching a fake ref object directly.
    const fakeRef = { current: { start: startFn, isLive: false } };

    renderReadyCard(
      { consultation_type: "video" },
      // @ts-expect-error – passing fake ref for test
      { launcherRef: fakeRef },
    );

    fireEvent.click(screen.getByRole("button", { name: /start video consult/i }));
    expect(startFn).toHaveBeenCalledWith("video");
  });

  it("calls launcherRef.current.start with 'video' for in_clinic (maps to video internally)", () => {
    const startFn = vi.fn();
    const fakeRef = { current: { start: startFn, isLive: false } };

    renderReadyCard(
      { consultation_type: "in_clinic" },
      // @ts-expect-error – passing fake ref for test
      { launcherRef: fakeRef },
    );

    fireEvent.click(screen.getByRole("button", { name: /mark patient called/i }));
    expect(startFn).toHaveBeenCalledWith("video");
  });
});

describe("ReadyCard — cs-10 Switch modality dropdown", () => {
  it("shows 'Switch modality' link for video appointment", () => {
    renderReadyCard({ consultation_type: "video" });
    expect(screen.getByText(/switch modality/i)).toBeInTheDocument();
  });

  it("video appointment: dropdown offers voice + chat but NOT video", () => {
    renderReadyCard({ consultation_type: "video" });

    // Open the dropdown
    fireEvent.click(screen.getByText(/switch modality/i));

    expect(screen.queryByRole("menuitem", { name: /switch to video/i })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /switch to voice/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /switch to chat/i })).toBeInTheDocument();
  });

  it("voice appointment: dropdown offers video + chat but NOT voice", () => {
    renderReadyCard({ consultation_type: "voice" });

    fireEvent.click(screen.getByText(/switch modality/i));

    expect(screen.getByRole("menuitem", { name: /switch to video/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /switch to voice/i })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /switch to chat/i })).toBeInTheDocument();
  });

  it("text appointment: dropdown offers video + voice but NOT chat", () => {
    renderReadyCard({ consultation_type: "text" });

    fireEvent.click(screen.getByText(/switch modality/i));

    expect(screen.getByRole("menuitem", { name: /switch to video/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /switch to voice/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /switch to chat/i })).not.toBeInTheDocument();
  });

  it("in_clinic appointment: does NOT show 'Switch modality' link", () => {
    renderReadyCard({ consultation_type: "in_clinic" });
    expect(screen.queryByText(/switch modality/i)).not.toBeInTheDocument();
  });

  it("selecting 'Switch to voice' from a video appointment calls start('voice')", () => {
    const startFn = vi.fn();
    const fakeRef = { current: { start: startFn, isLive: false } };

    renderReadyCard(
      { consultation_type: "video" },
      // @ts-expect-error – passing fake ref for test
      { launcherRef: fakeRef },
    );

    fireEvent.click(screen.getByText(/switch modality/i));
    fireEvent.click(screen.getByRole("menuitem", { name: /switch to voice/i }));
    expect(startFn).toHaveBeenCalledWith("voice");
  });
});

describe("ReadyCard — cs-10 Mark no-show is absent", () => {
  it("does NOT render a 'Mark no-show' button in the ready state", () => {
    renderReadyCard();
    expect(
      screen.queryByRole("button", { name: /mark no.show/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/no.show/i)).not.toBeInTheDocument();
  });

  it("does NOT render a 'Mark no-show' button in the lobby state", () => {
    renderReadyCard(
      {
        consultation_session: {
          id: "sess-1",
          actual_started_at: new Date(Date.now() - 10 * 60_000).toISOString(),
        } as Appointment["consultation_session"],
      },
      { showLobbyBanner: true },
    );
    expect(
      screen.queryByRole("button", { name: /mark no.show/i }),
    ).not.toBeInTheDocument();
  });
});

describe("ReadyCard — lobby banner", () => {
  it("does NOT show lobby banner when showLobbyBanner is false", () => {
    renderReadyCard({}, { showLobbyBanner: false });
    expect(screen.queryByText(/waiting for patient/i)).not.toBeInTheDocument();
  });

  it("shows lobby banner with 'Waiting for patient' when showLobbyBanner is true", () => {
    renderReadyCard({}, { showLobbyBanner: true });
    expect(screen.getByText(/waiting for patient/i)).toBeInTheDocument();
  });

  it("shows 'Resend link' button in the lobby banner", () => {
    renderReadyCard({}, { showLobbyBanner: true });
    expect(
      screen.getByRole("button", { name: /resend link/i }),
    ).toBeInTheDocument();
  });
});
