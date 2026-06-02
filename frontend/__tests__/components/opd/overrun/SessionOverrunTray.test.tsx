/**
 * SessionOverrunTray tests (pdm-10).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";

import { SessionOverrunTray } from "@/components/opd/overrun/SessionOverrunTray";
import type { OverrunRow } from "@/lib/api";

vi.mock("@/components/opd/overrun/SessionOverrunBulkResolveDialog", () => ({
  SessionOverrunBulkResolveDialog: ({
    open,
    onResolved,
  }: {
    open: boolean;
    onResolved: () => void;
  }) =>
    open ? (
      <div data-testid="bulk-resolve-dialog">
        <button type="button" onClick={onResolved}>
          Mock resolve
        </button>
      </div>
    ) : null,
}));

function makeRow(id: string, first: string, last: string): OverrunRow {
  return {
    id,
    status: "confirmed",
    appointment_date: "2026-05-16T10:00:00.000Z",
    opd_event_type: null,
    modality: "in_person",
    patients: {
      id: `p-${id}`,
      first_name: first,
      last_name: last,
      phone: "",
    },
    services: { id: "svc", name: "Follow-up", duration_min: 15 },
  };
}

describe("SessionOverrunTray", () => {
  const onResolved = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    onResolved.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when there are no rows", () => {
    const { container } = render(
      <SessionOverrunTray
        token="tok"
        date="2026-05-16"
        rows={[]}
        onResolved={onResolved}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders tray copy and Resolve all for multiple rows", () => {
    render(
      <SessionOverrunTray
        token="tok"
        date="2026-05-16"
        rows={[
          makeRow("1", "A", "One"),
          makeRow("2", "B", "Two"),
          makeRow("3", "C", "Three"),
        ]}
        onResolved={onResolved}
      />
    );
    expect(
      screen.getByText("3 patients weren't seen")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Resolve all" })
    ).toBeInTheDocument();
  });

  it("opens the bulk-resolve dialog when Resolve all is clicked", () => {
    render(
      <SessionOverrunTray
        token="tok"
        date="2026-05-16"
        rows={[makeRow("1", "A", "One")]}
        onResolved={onResolved}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Resolve all" }));
    expect(screen.getByTestId("bulk-resolve-dialog")).toBeInTheDocument();
  });

  it("calls onResolved when the dialog completes", () => {
    render(
      <SessionOverrunTray
        token="tok"
        date="2026-05-16"
        rows={[makeRow("1", "A", "One")]}
        onResolved={onResolved}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Resolve all" }));
    fireEvent.click(screen.getByRole("button", { name: "Mock resolve" }));
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('shows "All caught up" briefly after resolve then hides', async () => {
    const { rerender, container } = render(
      <SessionOverrunTray
        token="tok"
        date="2026-05-16"
        rows={[makeRow("1", "A", "One")]}
        onResolved={onResolved}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Resolve all" }));
    fireEvent.click(screen.getByRole("button", { name: "Mock resolve" }));

    rerender(
      <SessionOverrunTray
        token="tok"
        date="2026-05-16"
        rows={[]}
        onResolved={onResolved}
      />
    );

    expect(
      screen.getByText(/All caught up — no patients past session end/)
    ).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(container).toBeEmptyDOMElement();
  });
});
