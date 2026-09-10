/**
 * OpdSlotStatusFilter — counts + chip click + telemetry (Vitest + RTL).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

import * as telemetry from "@/components/opd/opdQueueTelemetry";
import { OpdSlotStatusFilter } from "@/components/opd/OpdSlotStatusFilter";
import type { SlotSessionCounts } from "@/types/opd-doctor";

const baseCounts: SlotSessionCounts = {
  all: 10,
  upcoming: 4,
  running_late: 1,
  in_consultation: 1,
  incomplete: 0,
  completed: 3,
  missed: 1,
  cancelled: 2,
  overflow: 1,
};

describe("OpdSlotStatusFilter", () => {
  beforeEach(() => {
    vi.spyOn(telemetry, "trackOpdSlotEvent").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders chip labels with count badges from counts prop", () => {
    render(
      <OpdSlotStatusFilter
        value="all"
        onChange={vi.fn()}
        counts={baseCounts}
      />
    );
    expect(screen.getByRole("tab", { name: "All10" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Upcoming4" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overdue1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Incomplete1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Done3" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "No show1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overflow1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Cancelled2" })).toBeInTheDocument();
  });

  it("calls onChange and trackOpdSlotEvent when a chip is clicked", () => {
    const onChange = vi.fn();
    render(
      <OpdSlotStatusFilter
        value="all"
        onChange={onChange}
        counts={baseCounts}
      />
    );
    fireEvent.click(screen.getByRole("tab", { name: "Overdue1" }));
    expect(onChange).toHaveBeenCalledWith("running_late");
    expect(telemetry.trackOpdSlotEvent).toHaveBeenCalledWith({
      event: "opd_slot.filter_changed",
      kind: "status",
      statusValue: "running_late",
      queryLength: null,
    });
  });

  it("selects Cancelled tab when URL value is cancelled", () => {
    render(
      <OpdSlotStatusFilter
        value="cancelled"
        onChange={vi.fn()}
        counts={baseCounts}
      />
    );
    expect(screen.getByRole("tab", { name: "Cancelled2" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("maps unknown URL value to All tab selected", () => {
    render(
      <OpdSlotStatusFilter
        value="waiting"
        onChange={vi.fn()}
        counts={baseCounts}
      />
    );
    expect(screen.getByRole("tab", { name: "All10" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("exposes Overflow hint for doctors", () => {
    render(
      <OpdSlotStatusFilter
        value="all"
        onChange={vi.fn()}
        counts={baseCounts}
      />
    );
    expect(
      screen.getByRole("tab", { name: "Overflow1" }).getAttribute(
        "aria-description"
      )
    ).toMatch(/outside the normal slot grid/i);
  });
});
