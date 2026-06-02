/**
 * SessionOverrunBulkResolveDialog tests (pdm-10).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import "@testing-library/jest-dom";

import * as api from "@/lib/api";
import { SessionOverrunBulkResolveDialog } from "@/components/opd/overrun/SessionOverrunBulkResolveDialog";
import type { OverrunRow, PerRowResult } from "@/lib/api";

function makeRow(id: string): OverrunRow {
  return {
    id,
    status: "pending",
    appointment_date: "2026-05-16T10:00:00.000Z",
    opd_event_type: null,
    modality: "in_person",
    patients: {
      id: `p-${id}`,
      first_name: "Ravi",
      last_name: "Sharma",
      phone: "",
    },
    services: { id: "svc", name: "Consult", duration_min: 15 },
  };
}

describe("SessionOverrunBulkResolveDialog", () => {
  const onResolved = vi.fn();
  const onOpenChange = vi.fn();

  beforeEach(() => {
    onResolved.mockClear();
    onOpenChange.mockClear();
    vi.spyOn(api, "bulkResolveOpdSessionOverrun").mockResolvedValue({
      success: true,
      data: {
        resolved: 2,
        results: [
          {
            appointmentId: "a1",
            action: "reschedule_all",
            status: "success",
          },
          {
            appointmentId: "a2",
            action: "reschedule_all",
            status: "success",
          },
        ],
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: "req-1",
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders five bulk radio options and one table row per appointment", () => {
    render(
      <SessionOverrunBulkResolveDialog
        open
        onOpenChange={onOpenChange}
        token="tok"
        date="2026-05-16"
        rows={[makeRow("a1"), makeRow("a2")]}
        onResolved={onResolved}
      />
    );

    expect(
      screen.getByLabelText(/Reschedule all to next available/i)
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Reschedule per patient/i)
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Mark as completed/i)
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Cancel with refund/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Mark as no-show/i)).toBeInTheDocument();
    expect(screen.getAllByText("Ravi Sharma")).toHaveLength(2);
  });

  it("submits reschedule_all without perRowOverrides by default", async () => {
    render(
      <SessionOverrunBulkResolveDialog
        open
        onOpenChange={onOpenChange}
        token="tok"
        date="2026-05-16"
        rows={[makeRow("a1")]}
        onResolved={onResolved}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Resolve 1 row/ }));

    await waitFor(() => {
      expect(api.bulkResolveOpdSessionOverrun).toHaveBeenCalledWith("tok", {
        date: "2026-05-16",
        action: "reschedule_all",
        perRowOverrides: undefined,
      });
    });
    expect(onResolved).toHaveBeenCalled();
  });

  it("submits cancel_refund when bulk action is changed", async () => {
    render(
      <SessionOverrunBulkResolveDialog
        open
        onOpenChange={onOpenChange}
        token="tok"
        date="2026-05-16"
        rows={[makeRow("a1")]}
        onResolved={onResolved}
      />
    );

    fireEvent.click(screen.getByLabelText(/Cancel with refund/i));
    fireEvent.click(screen.getByRole("button", { name: /Resolve 1 row/ }));

    await waitFor(() => {
      expect(api.bulkResolveOpdSessionOverrun).toHaveBeenCalledWith("tok", {
        date: "2026-05-16",
        action: "cancel_refund",
        perRowOverrides: undefined,
      });
    });
  });

  it("sends reschedule_per_patient override even without rescheduleTo", async () => {
    render(
      <SessionOverrunBulkResolveDialog
        open
        onOpenChange={onOpenChange}
        token="tok"
        date="2026-05-16"
        rows={[makeRow("a1")]}
        onResolved={onResolved}
      />
    );

    fireEvent.click(screen.getByLabelText(/Reschedule per patient/i));
    fireEvent.click(screen.getByRole("button", { name: /Resolve 1 row/ }));

    await waitFor(() => {
      expect(api.bulkResolveOpdSessionOverrun).toHaveBeenCalledWith("tok", {
        date: "2026-05-16",
        action: "reschedule_per_patient",
        perRowOverrides: [
          {
            appointmentId: "a1",
            action: "reschedule_per_patient",
            rescheduleTo: undefined,
          },
        ],
      });
    });
  });

  it("keeps the dialog open and highlights failed rows on partial failure", async () => {
    const results: PerRowResult[] = [
      { appointmentId: "a1", action: "reschedule_all", status: "success" },
      {
        appointmentId: "a2",
        action: "reschedule_all",
        status: "error",
        message: "slot unavailable",
      },
    ];
    vi.mocked(api.bulkResolveOpdSessionOverrun).mockResolvedValueOnce({
      success: true,
      data: { resolved: 1, results },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: "req-partial",
      },
    });

    render(
      <SessionOverrunBulkResolveDialog
        open
        onOpenChange={onOpenChange}
        token="tok"
        date="2026-05-16"
        rows={[makeRow("a1"), makeRow("a2")]}
        onResolved={onResolved}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Resolve 2 rows/ }));

    await waitFor(() => {
      expect(screen.getByText(/1 of 2 resolved/i)).toBeInTheDocument();
    });
    expect(screen.getByText("slot unavailable")).toBeInTheDocument();
    expect(onResolved).toHaveBeenCalled();
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /Resolve 2 rows/,
      })
    ).toBeInTheDocument();
  });
});
