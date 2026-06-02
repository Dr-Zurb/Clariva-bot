/**
 * SessionModeConversionDialog — preview summary copy (Vitest + RTL).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import * as api from "@/lib/api";
import {
  PreviewSummary,
  SessionModeConversionDialog,
} from "@/components/opd/SessionModeConversionDialog";
import type { ConvertSessionDayModeResult } from "@/types/opd-session";

function makePreview(
  overrides: Partial<ConvertSessionDayModeResult> = {}
): ConvertSessionDayModeResult {
  return {
    fromMode: "slot",
    toMode: "queue",
    affected: 5,
    overflowCount: 0,
    telemedCount: 0,
    notificationCount: 5,
    changeCount: 0,
    snapshotAfter: {
      date: "2026-05-18",
      snapshotAt: new Date().toISOString(),
      modeSource: "fact",
      modeChangeCount: 0,
      mode: "queue",
      entries: [],
      counts: { all: 0, active: 0, done: 0, missed: 0 },
    },
    ...overrides,
  };
}

describe("PreviewSummary", () => {
  it("renders reassignment copy without overflow or telemed alerts", () => {
    render(
      <PreviewSummary
        preview={makePreview({
          affected: 5,
          overflowCount: 0,
          telemedCount: 0,
        })}
        fromMode="slot"
        toMode="queue"
        modeChangeCount={0}
      />
    );
    expect(
      screen.getByText(/5 active bookings will be reassigned/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/overflow slots/)).not.toBeInTheDocument();
    expect(screen.queryByText(/telemed/)).not.toBeInTheDocument();
  });

  it("renders overflow alert when switching to slot with overflow", () => {
    render(
      <PreviewSummary
        preview={makePreview({
          affected: 5,
          overflowCount: 2,
          toMode: "slot",
        })}
        fromMode="queue"
        toMode="slot"
        modeChangeCount={0}
      />
    );
    expect(
      screen.getByText(/2 patients will be assigned overflow slots/)
    ).toBeInTheDocument();
  });

  it("renders telemed alert when switching to queue with telemed bookings", () => {
    render(
      <PreviewSummary
        preview={makePreview({
          affected: 5,
          telemedCount: 3,
          toMode: "queue",
        })}
        fromMode="slot"
        toMode="queue"
        modeChangeCount={0}
      />
    );
    expect(
      screen.getByText(/3 of the affected bookings are telemed/)
    ).toBeInTheDocument();
  });

  it("renders DL-14 nudge when modeChangeCount >= 2", () => {
    render(
      <PreviewSummary
        preview={makePreview()}
        fromMode="slot"
        toMode="queue"
        modeChangeCount={3}
      />
    );
    expect(
      screen.getByText(/changed this day.s mode 3 times already/i)
    ).toBeInTheDocument();
  });

  it("renders zero-booking copy for affected = 0", () => {
    render(
      <PreviewSummary
        preview={makePreview({ affected: 0, notificationCount: 0 })}
        fromMode="slot"
        toMode="queue"
        modeChangeCount={0}
      />
    );
    expect(
      screen.getByText("No active bookings on this date.")
    ).toBeInTheDocument();
  });
});

describe("SessionModeConversionDialog", () => {
  beforeEach(() => {
    vi.spyOn(api, "previewConvertSession").mockResolvedValue({
      data: makePreview(),
    });
    vi.spyOn(api, "convertSession").mockResolvedValue({
      data: makePreview({ changeCount: 1 }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads preview on open and enables confirm", async () => {
    render(
      <SessionModeConversionDialog
        open
        onOpenChange={vi.fn()}
        token="tok"
        date="2026-05-18"
        fromMode="slot"
        toMode="queue"
        modeChangeCount={0}
        onConfirmed={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/5 active bookings will be reassigned/)
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: /Confirm and notify 5 patients/ })
    ).not.toBeDisabled();
  });
});
