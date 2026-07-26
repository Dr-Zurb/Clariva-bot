/**
 * DoctorDashboardEventFeed — alerts-v1 · alr-01 / alr-02 + alerts-v2 · alr2-06.
 *
 * Covers: empty + populated mount, copy for replay + v2 kinds, Load more,
 * Mark all as read, severity sort/style, deep-link hrefs.
 */

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { DashboardEvent } from "@/lib/api";
import {
  describeEvent,
  DoctorDashboardEventFeed,
  eventDeepLink,
  eventSeverity,
} from "../DoctorDashboardEventFeed";

const getDashboardEventsMock = vi.fn();
const acknowledgeDashboardEventMock = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getDashboardEvents: (...args: unknown[]) => getDashboardEventsMock(...args),
    acknowledgeDashboardEvent: (...args: unknown[]) =>
      acknowledgeDashboardEventMock(...args),
  };
});

const SAMPLE_RECORDING: DashboardEvent = {
  id: "evt-1",
  eventKind: "patient_replayed_recording",
  sessionId: "sess-1",
  payload: {
    artifact_type: "audio",
    recording_access_audit_id: "audit-1",
    patient_display_name: "Ravi",
    replayed_at: "2026-07-20T10:00:00.000Z",
    consult_date: "2026-07-18",
    accessed_by_role: "patient",
    accessed_by_user_id: "user-1",
  },
  acknowledgedAt: null,
  createdAt: "2026-07-20T10:05:00.000Z",
};

const SAMPLE_VIDEO: DashboardEvent = {
  id: "evt-2",
  eventKind: "patient_replayed_video",
  sessionId: "sess-2",
  payload: {
    artifact_type: "video",
    recording_access_audit_id: "audit-2",
    patient_display_name: "Meera",
    replayed_at: "2026-07-20T11:00:00.000Z",
    consult_date: "2026-07-19",
    accessed_by_role: "patient",
    accessed_by_user_id: "user-2",
  },
  acknowledgedAt: null,
  createdAt: "2026-07-20T11:05:00.000Z",
};

const SAMPLE_REVOKE: DashboardEvent = {
  id: "evt-3",
  eventKind: "patient_revoked_video_mid_session",
  sessionId: "sess-3",
  payload: {
    video_escalation_audit_id: "vea-1",
    revoked_at: "2026-07-20T12:00:00.000Z",
    patient_display_name: "",
    consult_started_at: "2026-07-20",
  },
  acknowledgedAt: null,
  createdAt: "2026-07-20T12:05:00.000Z",
};

const SAMPLE_SLA_BREACH: DashboardEvent = {
  id: "evt-sla",
  eventKind: "booking_review_sla_breach",
  sessionId: null,
  payload: {
    severity: "action_needed",
    review_request_id: "rev-1",
    patient_display_name: "Meera",
    requested_at: "2026-07-20T08:00:00.000Z",
    sla_deadline_at: "2026-07-20T08:30:00.000Z",
  },
  acknowledgedAt: null,
  createdAt: "2026-07-20T09:00:00.000Z",
};

const SAMPLE_NO_SHOW: DashboardEvent = {
  id: "evt-noshow",
  eventKind: "appointment_no_show",
  sessionId: null,
  payload: {
    severity: "info",
    appointment_id: "appt-99",
    patient_display_name: "Ravi",
    appointment_date: "2026-07-19",
  },
  acknowledgedAt: null,
  createdAt: "2026-07-20T13:00:00.000Z",
};

describe("describeEvent", () => {
  it("pins copy for replay and alerts-v2 event kinds", () => {
    expect(describeEvent(SAMPLE_RECORDING)).toMatch(
      /Ravi replayed the audio of your consult/
    );

    expect(
      describeEvent({
        ...SAMPLE_RECORDING,
        payload: {
          ...SAMPLE_RECORDING.payload,
          artifact_type: "transcript",
          action_kind: "downloaded",
        },
      })
    ).toMatch(/Ravi downloaded the transcript of your consult/);

    expect(describeEvent(SAMPLE_VIDEO)).toMatch(
      /Meera replayed the video of your consult/
    );

    expect(describeEvent(SAMPLE_REVOKE)).toMatch(
      /Your patient turned off video recording during your consult/
    );

    expect(describeEvent(SAMPLE_SLA_BREACH)).toBe(
      "A booking request for Meera is past its review deadline."
    );

    expect(describeEvent(SAMPLE_NO_SHOW)).toMatch(
      /Ravi didn't show for their appointment/
    );

    expect(
      describeEvent({
        ...SAMPLE_NO_SHOW,
        payload: { ...SAMPLE_NO_SHOW.payload, patient_display_name: "" },
      })
    ).toMatch(/^A patient didn't show/);
  });
});

describe("eventDeepLink / eventSeverity", () => {
  it("deep-links SLA → booking-review and no-show → appointment", () => {
    expect(eventDeepLink(SAMPLE_SLA_BREACH)).toBe("/dashboard/booking-review");
    expect(eventDeepLink(SAMPLE_NO_SHOW)).toBe(
      "/dashboard/appointments/appt-99"
    );
    expect(eventDeepLink(SAMPLE_RECORDING)).toBeNull();
  });

  it("treats SLA breach as action_needed and no-show as info", () => {
    expect(eventSeverity(SAMPLE_SLA_BREACH)).toBe("action_needed");
    expect(eventSeverity(SAMPLE_NO_SHOW)).toBe("info");
    expect(eventSeverity(SAMPLE_RECORDING)).toBe("info");
  });
});

describe("DoctorDashboardEventFeed", () => {
  beforeEach(() => {
    getDashboardEventsMock.mockReset();
    acknowledgeDashboardEventMock.mockReset();
  });

  it("renders the empty state when there are no events", async () => {
    getDashboardEventsMock.mockResolvedValue({
      data: { events: [] },
    });

    render(<DoctorDashboardEventFeed token="test-token" />);

    expect(screen.getByText("Loading notifications…")).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText("You're all caught up. No unread notifications.")
      ).toBeInTheDocument();
    });

    expect(getDashboardEventsMock).toHaveBeenCalledWith("test-token", {
      unreadOnly: true,
      limit: 10,
    });
  });

  it("renders populated event rows from getDashboardEvents", async () => {
    getDashboardEventsMock.mockResolvedValue({
      data: { events: [SAMPLE_RECORDING] },
    });

    render(<DoctorDashboardEventFeed token="test-token" />);

    await waitFor(() => {
      expect(
        screen.getByText(/Ravi replayed the audio of your consult/i)
      ).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Mark as read" })).toBeInTheDocument();
    expect(screen.getByText("Notifications")).toBeInTheDocument();
  });

  it("Load more appends the next page and advances the cursor", async () => {
    const page2: DashboardEvent = {
      ...SAMPLE_VIDEO,
      id: "evt-page-2",
    };

    getDashboardEventsMock
      .mockResolvedValueOnce({
        data: { events: [SAMPLE_RECORDING], nextCursor: "cursor-1" },
      })
      .mockResolvedValueOnce({
        data: { events: [page2] },
      });

    render(<DoctorDashboardEventFeed token="test-token" />);

    await waitFor(() => {
      expect(
        screen.getByText(/Ravi replayed the audio of your consult/i)
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => {
      expect(
        screen.getByText(/Meera replayed the video of your consult/i)
      ).toBeInTheDocument();
    });

    expect(getDashboardEventsMock).toHaveBeenLastCalledWith("test-token", {
      unreadOnly: true,
      limit: 10,
      cursor: "cursor-1",
    });
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("Mark all as read acknowledges every unread row", async () => {
    getDashboardEventsMock.mockResolvedValue({
      data: { events: [SAMPLE_RECORDING, SAMPLE_VIDEO] },
    });
    acknowledgeDashboardEventMock.mockResolvedValue(undefined);

    render(<DoctorDashboardEventFeed token="test-token" />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Mark all as read" })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));

    await waitFor(() => {
      expect(acknowledgeDashboardEventMock).toHaveBeenCalledTimes(2);
    });
    expect(acknowledgeDashboardEventMock).toHaveBeenCalledWith(
      "test-token",
      "evt-1"
    );
    expect(acknowledgeDashboardEventMock).toHaveBeenCalledWith(
      "test-token",
      "evt-2"
    );

    await waitFor(() => {
      expect(
        screen.getByText("You're all caught up. No unread notifications.")
      ).toBeInTheDocument();
    });
  });

  it("sorts action-needed above info and renders deep-links + Action needed tag", async () => {
    // Deliberately return info first so client sort must reorder.
    getDashboardEventsMock.mockResolvedValue({
      data: { events: [SAMPLE_NO_SHOW, SAMPLE_SLA_BREACH] },
    });

    render(<DoctorDashboardEventFeed token="test-token" />);

    await waitFor(() => {
      expect(screen.getByText("Action needed")).toBeInTheDocument();
    });

    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/past its review deadline/);
    expect(items[1]).toHaveTextContent(/didn't show for their appointment/);

    const slaLink = screen.getByRole("link", {
      name: /A booking request for Meera is past its review deadline/,
    });
    expect(slaLink).toHaveAttribute("href", "/dashboard/booking-review");

    const noShowLink = screen.getByRole("link", {
      name: /Ravi didn't show for their appointment/,
    });
    expect(noShowLink).toHaveAttribute(
      "href",
      "/dashboard/appointments/appt-99"
    );

    // Deep-link does not auto-acknowledge — Mark as read still present.
    expect(
      screen.getAllByRole("button", { name: "Mark as read" })
    ).toHaveLength(2);
  });
});
