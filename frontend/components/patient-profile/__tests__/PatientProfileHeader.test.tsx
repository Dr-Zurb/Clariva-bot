/**
 * CockpitHeader — snapshot tests + unit tests (Vitest + RTL).
 *
 * Run: `vitest run frontend/components/consultation/cockpit/__tests__/CockpitHeader.test.tsx`
 *
 * NOTE: This test file requires a Vitest + RTL setup. A vitest.config.ts (or
 * vitest.config.mts) pointing at the frontend workspace must be present.
 * Dependencies needed:
 *   npm i -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom \
 *             @testing-library/user-event jsdom
 *
 * cp-09 scope:
 *   - 6 snapshot cases covering each CockpitState
 *   - formatDemographics unit tests (edge-case matrix)
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useSearchParams } from "next/navigation";

import CockpitHeader, {
  formatDemographics,
  shouldOfferMarkNoShowInReady,
} from "@/components/patient-profile/PatientProfileHeader";
import type { CockpitHeaderProps } from "@/components/patient-profile/PatientProfileHeader";
import type { Appointment } from "@/types/appointment";
import type { CockpitState } from "@/lib/patient-profile/state";

// ---------------------------------------------------------------------------
// Global mocks — keep noise-free snapshots
// ---------------------------------------------------------------------------

// RunningBehindBadge reads real time; stub it out to avoid time-dependent snapshots.
vi.mock(
  "@/components/consultation/cockpit/RunningBehindBadge",
  () => ({
    RunningBehindBadge: () => null,
  }),
);

// PatientProfileQueueRail (née CockpitQueueRail) makes API calls; replace with a static stub.
vi.mock(
  "@/components/patient-profile/PatientProfileQueueRail",
  () => ({
    CockpitQueueRail: () => null,
  }),
);

// resendConsultationLink is never called in snapshot tests.
vi.mock("@/lib/api", () => ({
  resendConsultationLink: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAppointment(
  overrides: Partial<Appointment> & Record<string, unknown> = {},
): Appointment {
  const base: Appointment = {
    id: "appt-001",
    doctor_id: "doc-1",
    patient_id: "pat-1",
    patient_name: "Ravi Sharma",
    patient_phone: "+91 98765 43210",
    appointment_date: "2026-05-09T10:30:00.000Z",
    status: "confirmed",
    notes: "Regular check-up",
    created_at: "2026-05-01T08:00:00.000Z",
    updated_at: "2026-05-09T09:00:00.000Z",
    consultation_type: "video",
    consultation_session: null,
  };
  return { ...base, ...overrides } as Appointment;
}

const DEFAULT_HANDLERS: Pick<
  CockpitHeaderProps,
  | "onStartConsult"
  | "onReschedule"
  | "onCancelAppointment"
  | "onFinishVisit"
  | "onMarkNoShow"
> = {
  onStartConsult: vi.fn(),
  onReschedule: vi.fn(),
  onCancelAppointment: vi.fn(),
  onFinishVisit: vi.fn(),
  onMarkNoShow: vi.fn(),
};

function renderHeader(
  state: CockpitState,
  apptOverrides: Partial<Appointment> & Record<string, unknown> = {},
  propOverrides: Partial<CockpitHeaderProps> = {},
) {
  const appointment = makeAppointment(apptOverrides);
  const { container } = render(
    <CockpitHeader
      appointment={appointment}
      state={state}
      token="test-token"
      {...DEFAULT_HANDLERS}
      {...propOverrides}
    />,
  );
  return container;
}

// ---------------------------------------------------------------------------
// formatDemographics — unit tests
// ---------------------------------------------------------------------------

describe("formatDemographics", () => {
  it("returns null when both age and sex are null", () => {
    expect(formatDemographics(null, null)).toBeNull();
  });

  it("returns null when both are undefined", () => {
    expect(formatDemographics(undefined, undefined)).toBeNull();
  });

  it("returns age-only string when sex is null", () => {
    expect(formatDemographics(42, null)).toBe("42 y");
  });

  it("returns sex-only string (uppercased first char) when age is null", () => {
    expect(formatDemographics(null, "male")).toBe("M");
    expect(formatDemographics(null, "female")).toBe("F");
    expect(formatDemographics(null, "other")).toBe("O");
  });

  it("returns combined string when both present", () => {
    expect(formatDemographics(42, "male")).toBe("42 y / M");
    expect(formatDemographics(28, "female")).toBe("28 y / F");
  });

  it("formats age=0 as '0 y'", () => {
    expect(formatDemographics(0, null)).toBe("0 y");
  });

  it("formats age < 1 as '< 1 y'", () => {
    expect(formatDemographics(0.5, null)).toBe("< 1 y");
  });

  it("handles large ages correctly", () => {
    expect(formatDemographics(104, "male")).toBe("104 y / M");
  });

  it("handles 'prefer_not_to_say' sex gracefully (first letter)", () => {
    expect(formatDemographics(35, "prefer_not_to_say")).toBe("35 y / P");
  });
});

// ---------------------------------------------------------------------------
// shouldOfferMarkNoShowInReady — unit tests (CP-D5)
// ---------------------------------------------------------------------------

const noShowFixture: Pick<Appointment, "appointment_date"> = {
  appointment_date: "2025-01-01T10:00:00Z",
};

describe("shouldOfferMarkNoShowInReady", () => {
  it("returns true when appointment is overdue (slot mode)", () => {
    expect(
      shouldOfferMarkNoShowInReady(
        { ...noShowFixture, appointment_date: "2025-01-01T10:00:00Z" },
        false,
        new Date("2025-01-01T10:30:00Z"),
      ),
    ).toBe(true);
  });

  it("returns false when appointment is more than 5 min away (slot mode)", () => {
    expect(
      shouldOfferMarkNoShowInReady(
        { ...noShowFixture, appointment_date: "2025-01-01T10:00:00Z" },
        false,
        new Date("2025-01-01T09:50:00Z"),
      ),
    ).toBe(false);
  });

  it("returns true when appointment is exactly 5 min away (boundary)", () => {
    expect(
      shouldOfferMarkNoShowInReady(
        { ...noShowFixture, appointment_date: "2025-01-01T10:00:00Z" },
        false,
        new Date("2025-01-01T09:55:00Z"),
      ),
    ).toBe(true);
  });

  it("returns true regardless of time in OPD queue mode", () => {
    expect(
      shouldOfferMarkNoShowInReady(
        { ...noShowFixture, appointment_date: "2025-01-01T18:00:00Z" },
        true,
        new Date("2025-01-01T09:00:00Z"),
      ),
    ).toBe(true);
  });

  it("returns true when appointment_date is null (defensive — legacy data)", () => {
    expect(
      shouldOfferMarkNoShowInReady(
        { appointment_date: null as unknown as string },
        false,
        new Date("2025-01-01T10:00:00Z"),
      ),
    ).toBe(true);
  });

  it("returns true when appointment_date is malformed (defensive)", () => {
    expect(
      shouldOfferMarkNoShowInReady(
        { appointment_date: "not-a-date" },
        false,
        new Date("2025-01-01T10:00:00Z"),
      ),
    ).toBe(true);
  });

  it("returns true when appointment is in the past (slot mode)", () => {
    expect(
      shouldOfferMarkNoShowInReady(
        { appointment_date: "2025-01-01T08:00:00Z" },
        false,
        new Date("2025-01-01T10:00:00Z"),
      ),
    ).toBe(true);
  });

  it("returns false when appointment is 10 min in the future (slot mode)", () => {
    expect(
      shouldOfferMarkNoShowInReady(
        { appointment_date: "2025-01-01T10:10:00Z" },
        false,
        new Date("2025-01-01T10:00:00Z"),
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CockpitHeader — snapshot tests (one per CockpitState)
// ---------------------------------------------------------------------------

describe("CockpitHeader snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders ready state with full demographics", () => {
    const container = renderHeader("ready", {
      patient_age: 42,
      patient_sex: "male",
      medical_record_number: "MRN-00123",
    } as any);
    expect(container).toMatchSnapshot();
  });

  it("renders ready state without demographics (null fallback)", () => {
    const container = renderHeader("ready", {
      patient_age: null,
      patient_sex: null,
      // No MRN either — ensures row 2 degrades gracefully
      patient_id: null,
    } as any);
    expect(container).toMatchSnapshot();
  });

  it("renders live state", () => {
    const container = renderHeader("live", {
      patient_age: 28,
      patient_sex: "female",
      medical_record_number: "MRN-00456",
      consultation_type: "video",
      consultation_session: {
        id: "sess-1",
        modality: "video",
        status: "live",
        provider: "twilio",
        provider_session_id: "room-abc123",
        actual_started_at: "2026-05-09T10:32:00.000Z",
        actual_ended_at: null,
      },
    } as any);
    expect(container).toMatchSnapshot();
  });

  it("renders wrap_up state", () => {
    const container = renderHeader(
      "wrap_up",
      {
        patient_age: 55,
        patient_sex: "male",
        medical_record_number: "MRN-00789",
        consultation_session: {
          id: "sess-2",
          modality: "video",
          status: "ended",
          provider: "twilio",
          provider_session_id: "room-def456",
          actual_started_at: "2026-05-09T10:30:00.000Z",
          actual_ended_at: "2026-05-09T10:50:00.000Z",
        },
      } as any,
      { finishBusy: false },
    );
    expect(container).toMatchSnapshot();
  });

  it("renders ended state — no primary CTA, shows Completed badge", () => {
    const container = renderHeader("ended", {
      status: "completed",
      patient_age: 33,
      patient_sex: "female",
      medical_record_number: "MRN-00321",
      consultation_session: {
        id: "sess-3",
        modality: "video",
        status: "ended",
        provider: "twilio",
        provider_session_id: "room-ghi789",
        actual_started_at: "2026-05-09T09:00:00.000Z",
        actual_ended_at: "2026-05-09T09:20:00.000Z",
      },
    } as any);
    expect(container).toMatchSnapshot();
  });

  it("renders terminal state — single subdued row, no demographics, no row 2", () => {
    const container = renderHeader("terminal", {
      status: "no_show",
      patient_age: 40,
      patient_sex: "male",
    } as any);
    expect(container).toMatchSnapshot();
  });

  it("renders terminal state with cancelled status", () => {
    const container = renderHeader("terminal", {
      status: "cancelled",
    } as any);
    expect(container).toMatchSnapshot();
  });

  it("renders ready state with OPD queue token", () => {
    const container = renderHeader("ready", {
      patient_age: 38,
      patient_sex: "female",
      medical_record_number: "MRN-00999",
      opd_queue_event_type: "token",
      opd_token_number: 4,
    } as any);
    expect(container).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// CS-04: OPD token chip — behaviour tests
// ---------------------------------------------------------------------------

describe("OPD token chip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'Token #3' chip when opd_queue_event_type='token' and opd_token_number=3", () => {
    renderHeader("ready", {
      opd_queue_event_type: "token",
      opd_token_number: 3,
    } as any);
    expect(screen.getByText("Token #3")).toBeInTheDocument();
  });

  it("does NOT render any token chip when opd_queue_event_type=null and opd_token_number=null", () => {
    renderHeader("ready", {
      opd_queue_event_type: null,
      opd_token_number: null,
    } as any);
    expect(screen.queryByText(/Token #/)).not.toBeInTheDocument();
    expect(screen.queryByText(/#\?/)).not.toBeInTheDocument();
  });

  it("does NOT render token chip for 'group' event type (suppress — no per-patient token)", () => {
    renderHeader("ready", {
      opd_queue_event_type: "group",
      opd_token_number: 7,
    } as any);
    expect(screen.queryByText(/Token #/)).not.toBeInTheDocument();
  });

  it("renders 'Token #0' chip when opd_token_number=0 (zero is a valid token position)", () => {
    renderHeader("ready", {
      opd_queue_event_type: "token",
      opd_token_number: 0,
    } as any);
    expect(screen.getByText("Token #0")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// CS-02: Mark no-show kebab item — behaviour tests
// ---------------------------------------------------------------------------

describe("Mark no-show kebab item", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is absent when onMarkNoShow prop is not provided", () => {
    renderHeader("ready", {}, { onMarkNoShow: undefined });
    const trigger = screen.getByRole("button", { name: /more options/i });
    fireEvent.click(trigger);
    expect(screen.queryByText("Mark no-show")).not.toBeInTheDocument();
  });

  it("appears in the kebab menu when appointment is overdue (ready state)", () => {
    // past appointment → canMarkNoShow=true
    renderHeader("ready", { appointment_date: "2020-01-01T10:00:00Z" } as any);
    fireEvent.click(screen.getByRole("button", { name: /more options/i }));
    expect(screen.getByText("Mark no-show")).toBeInTheDocument();
  });

  it("is enabled when appointment is overdue in ready state", () => {
    renderHeader("ready", { appointment_date: "2020-01-01T10:00:00Z" } as any);
    fireEvent.click(screen.getByRole("button", { name: /more options/i }));
    // Radix DropdownMenuItem sets aria-disabled="true" when disabled
    const item = screen.getByText("Mark no-show").closest("[role='menuitem']");
    expect(item).not.toHaveAttribute("aria-disabled", "true");
  });

  it("is disabled when appointment is far in the future (ready state)", () => {
    renderHeader("ready", { appointment_date: "2099-12-31T10:00:00Z" } as any);
    fireEvent.click(screen.getByRole("button", { name: /more options/i }));
    const item = screen.getByText("Mark no-show").closest("[role='menuitem']");
    expect(item).toHaveAttribute("aria-disabled", "true");
  });

  it("is always enabled in lobby state regardless of appointment time", () => {
    renderHeader("lobby", { appointment_date: "2099-12-31T10:00:00Z" } as any);
    fireEvent.click(screen.getByRole("button", { name: /more options/i }));
    const item = screen.getByText("Mark no-show").closest("[role='menuitem']");
    expect(item).not.toHaveAttribute("aria-disabled", "true");
  });

  it("is always enabled in live state", () => {
    renderHeader("live", { appointment_date: "2099-12-31T10:00:00Z" } as any);
    fireEvent.click(screen.getByRole("button", { name: /more options/i }));
    const item = screen.getByText("Mark no-show").closest("[role='menuitem']");
    expect(item).not.toHaveAttribute("aria-disabled", "true");
  });

  it("calls onMarkNoShow when clicked", () => {
    const onMarkNoShow = vi.fn();
    renderHeader(
      "ready",
      { appointment_date: "2020-01-01T10:00:00Z" } as any,
      { onMarkNoShow },
    );
    fireEvent.click(screen.getByRole("button", { name: /more options/i }));
    fireEvent.click(screen.getByText("Mark no-show"));
    expect(onMarkNoShow).toHaveBeenCalledTimes(1);
  });

  it("shows the 'm' keyboard shortcut hint in the menu item", () => {
    renderHeader("lobby", {});
    fireEvent.click(screen.getByRole("button", { name: /more options/i }));
    // The hint span renders 'm' alongside the label
    const menu = screen.getByRole("menu");
    expect(menu).toHaveTextContent("m");
    expect(
      screen.getByText("Mark no-show").closest("[aria-keyshortcuts='m']"),
    ).toBeInTheDocument();
  });
});

describe("CockpitHeader · BackLink (nav-back-01)", () => {
  beforeEach(() => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as ReturnType<
      typeof useSearchParams
    >);
  });

  it("defaults back link to OPD when no from param is present", () => {
    renderHeader("ready");
    const link = screen.getByRole("link", { name: "Back to OPD" });
    expect(link).toHaveAttribute("href", "/dashboard/opd-today");
  });

  it("routes back to OPD when from=opd-today", () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("from=opd-today") as ReturnType<typeof useSearchParams>,
    );
    renderHeader("ready");
    const link = screen.getByRole("link", { name: "Back to OPD" });
    expect(link).toHaveAttribute("href", "/dashboard/opd-today");
  });

  it("preserves OPD session date when from=opd-today&date=...", () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("from=opd-today&date=2026-05-09") as ReturnType<
        typeof useSearchParams
      >,
    );
    renderHeader("ready");
    const link = screen.getByRole("link", { name: "Back to OPD" });
    expect(link).toHaveAttribute("href", "/dashboard/opd-today?date=2026-05-09");
    expect(link.textContent).toBe("←");
  });

  it("routes back to patient profile when from=patients-v2 with pid", () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("from=patients-v2&pid=pat-1") as ReturnType<
        typeof useSearchParams
      >,
    );
    renderHeader("ready");
    const link = screen.getByRole("link", { name: "Back to Patient profile" });
    expect(link).toHaveAttribute("href", "/dashboard/patients-v2/pat-1");
  });
});
