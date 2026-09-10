/**
 * Unit tests for useNextAppointmentRoute (pf-10) queue-mode eligibility.
 *
 * Regression (2026-08-31): any status filter on the queue-mode "next" makes
 * the cockpit report "No more patients in the queue" while the rail shows
 * the next token (statuses like in_consultation / completed linger on rows
 * from earlier in the day). Product rule: finish means move next — the
 * target is the entry directly after the current one, regardless of status.
 * A status filter only applies as a fallback when the current appointment
 * isn't part of today's queue.
 *
 * Run: `vitest run frontend/hooks/__tests__/useNextAppointmentRoute.test.tsx`
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useNextAppointmentRoute } from "@/hooks/useNextAppointmentRoute";
import type { PipelineEntry } from "@/hooks/useDoctorDayPipeline";

const mockPipeline = vi.fn();

vi.mock("@/hooks/useDoctorDayPipeline", () => ({
  useDoctorDayPipeline: (opts: unknown) => mockPipeline(opts),
}));

function entry(
  id: string,
  tokenNumber: number,
  status: PipelineEntry["status"],
  isCurrent = false,
): PipelineEntry {
  return {
    id,
    label: `Patient ${tokenNumber}`,
    status,
    position: tokenNumber,
    tokenNumber,
    href: `/dashboard/appointments/${id}`,
    isCurrent,
    appointmentDate: "2026-08-31",
    consultationType: "in_clinic",
  };
}

function pipelineResult(
  entries: PipelineEntry[],
  currentIndex: number | null,
  source: "queue" | "schedule" = "queue",
): Record<string, unknown> {
  return {
    entries,
    currentIndex,
    doneCount: 0,
    activeCount: 0,
    missedCount: 0,
    totalCount: entries.length,
    source,
    isLoading: false,
    error: null,
  };
}

describe("useNextAppointmentRoute § queue eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("advances to an in_consultation row (stale from a previously opened visit)", () => {
    // The screenshot scenario: #23 done, #24 current just completed,
    // #25 stuck at in_consultation, #26 waiting.
    mockPipeline.mockReturnValue(
      pipelineResult(
        [
          entry("appt-23", 23, "completed"),
          entry("appt-24", 24, "completed", true),
          entry("appt-25", 25, "in_consultation"),
          entry("appt-26", 26, "waiting"),
        ],
        1,
      ),
    );

    const { result } = renderHook(() =>
      useNextAppointmentRoute({ currentAppointmentId: "appt-24", token: "t" }),
    );

    expect(result.current.next?.appointmentId).toBe("appt-25");
    expect(result.current.next?.url).toBe("/dashboard/appointments/appt-25");
  });

  it("advances to the literal next token even when it is already completed", () => {
    // "Finish means move next" — #49 already done from earlier in the day
    // must still be the target, exactly like the rail shows it as next.
    mockPipeline.mockReturnValue(
      pipelineResult(
        [
          entry("appt-47", 47, "completed"),
          entry("appt-48", 48, "completed", true),
          entry("appt-49", 49, "completed"),
          entry("appt-50", 50, "waiting"),
        ],
        1,
      ),
    );

    const { result } = renderHook(() =>
      useNextAppointmentRoute({ currentAppointmentId: "appt-48", token: "t" }),
    );

    expect(result.current.next?.appointmentId).toBe("appt-49");
    expect(result.current.isLastInQueue).toBe(false);
  });

  it("advances into missed / skipped rows rather than reporting an empty queue", () => {
    mockPipeline.mockReturnValue(
      pipelineResult(
        [
          entry("appt-1", 1, "completed", true),
          entry("appt-2", 2, "missed"),
          entry("appt-3", 3, "skipped"),
          entry("appt-4", 4, "waiting"),
        ],
        0,
      ),
    );

    const { result } = renderHook(() =>
      useNextAppointmentRoute({ currentAppointmentId: "appt-1", token: "t" }),
    );

    expect(result.current.next?.appointmentId).toBe("appt-2");
  });

  it("returns null only when the current row is the last in the queue", () => {
    mockPipeline.mockReturnValue(
      pipelineResult(
        [
          entry("appt-1", 1, "waiting"),
          entry("appt-2", 2, "completed", true),
        ],
        1,
      ),
    );

    const { result } = renderHook(() =>
      useNextAppointmentRoute({ currentAppointmentId: "appt-2", token: "t" }),
    );

    expect(result.current.next).toBeNull();
    expect(result.current.isLastInQueue).toBe(true);
  });

  it("falls back to the first active row when the current visit is not in the queue", () => {
    mockPipeline.mockReturnValue(
      pipelineResult(
        [
          entry("appt-1", 1, "completed"),
          entry("appt-2", 2, "missed"),
          entry("appt-3", 3, "waiting"),
        ],
        null,
      ),
    );

    const { result } = renderHook(() =>
      useNextAppointmentRoute({
        currentAppointmentId: "appt-off-queue",
        token: "t",
      }),
    );

    expect(result.current.next?.appointmentId).toBe("appt-3");
    expect(result.current.isLastInQueue).toBe(false);
  });
});

describe("useNextAppointmentRoute § schedule (slot) mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("advances to the literal next row even when both visits are completed", () => {
    // Slot-mode doctors re-running the day: current and next are both
    // completed. Finish must still move to the next row.
    mockPipeline.mockReturnValue(
      pipelineResult(
        [
          entry("appt-47", 47, "completed"),
          entry("appt-48", 48, "completed", true),
          entry("appt-49", 49, "completed"),
        ],
        1,
        "schedule",
      ),
    );

    const { result } = renderHook(() =>
      useNextAppointmentRoute({ currentAppointmentId: "appt-48", token: "t" }),
    );

    expect(result.current.next?.appointmentId).toBe("appt-49");
    expect(result.current.isLastInQueue).toBe(false);
  });

  it("returns null with isLastInQueue when the current row is last", () => {
    mockPipeline.mockReturnValue(
      pipelineResult(
        [
          entry("appt-1", 1, "completed"),
          entry("appt-2", 2, "completed", true),
        ],
        1,
        "schedule",
      ),
    );

    const { result } = renderHook(() =>
      useNextAppointmentRoute({ currentAppointmentId: "appt-2", token: "t" }),
    );

    expect(result.current.next).toBeNull();
    expect(result.current.isLastInQueue).toBe(true);
  });

  it("falls back to pending/confirmed rows when the current visit is off-pipeline", () => {
    mockPipeline.mockReturnValue(
      pipelineResult(
        [
          entry("appt-1", 1, "completed"),
          {
            ...entry("appt-2", 2, "confirmed"),
            // Fresh slot time — the fallback path skips slots older than 1 h.
            appointmentDate: new Date().toISOString(),
          },
        ],
        null,
        "schedule",
      ),
    );

    const { result } = renderHook(() =>
      useNextAppointmentRoute({
        currentAppointmentId: "appt-off",
        token: "t",
      }),
    );

    expect(result.current.next?.appointmentId).toBe("appt-2");
  });
});
