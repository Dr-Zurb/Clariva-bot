/**
 * Unit tests for opdQueueTelemetry (Vitest).
 *
 * Verifies:
 *   - console.debug is called with the correct structured shape for every event type.
 *   - Errors thrown inside console.debug do NOT propagate to the caller.
 *
 * Run: `vitest run frontend/__tests__/components/opd/opdQueueTelemetry.test.ts`
 *
 * @see docs/Work/Daily-plans/May 2026/08-05-2026/Tasks/task-oq-14-telemetry.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { trackOpdQueueEvent, trackOpdSlotEvent } from "../../../components/opd/opdQueueTelemetry";

describe("trackOpdQueueEvent", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let debugSpy: ReturnType<typeof vi.spyOn<any, any>>;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
  });

  afterEach(() => {
    debugSpy.mockRestore();
  });

  // ── opd_queue.viewed ─────────────────────────────────────────────────────

  it("fires console.debug with correct shape for viewed event", () => {
    trackOpdQueueEvent({
      event: "opd_queue.viewed",
      totalActive: 5,
      totalDone: 2,
      totalMissed: 1,
    });

    expect(debugSpy).toHaveBeenCalledOnce();
    expect(debugSpy).toHaveBeenCalledWith("[opd_queue]", {
      event: "opd_queue.viewed",
      totalActive: 5,
      totalDone: 2,
      totalMissed: 1,
    });
  });

  it("fires console.debug for viewed event with zero counts", () => {
    trackOpdQueueEvent({
      event: "opd_queue.viewed",
      totalActive: 0,
      totalDone: 0,
      totalMissed: 0,
    });

    expect(debugSpy).toHaveBeenCalledWith("[opd_queue]", {
      event: "opd_queue.viewed",
      totalActive: 0,
      totalDone: 0,
      totalMissed: 0,
    });
  });

  // ── opd_queue.row_clicked ─────────────────────────────────────────────────

  it("fires console.debug with correct shape for row_clicked event (mouse, no search)", () => {
    trackOpdQueueEvent({
      event: "opd_queue.row_clicked",
      statusOfClickedRow: "waiting",
      viaKeyboard: false,
      viaSearch: false,
    });

    expect(debugSpy).toHaveBeenCalledWith("[opd_queue]", {
      event: "opd_queue.row_clicked",
      statusOfClickedRow: "waiting",
      viaKeyboard: false,
      viaSearch: false,
    });
  });

  it("fires console.debug for row_clicked via keyboard with active search", () => {
    trackOpdQueueEvent({
      event: "opd_queue.row_clicked",
      statusOfClickedRow: "called",
      viaKeyboard: true,
      viaSearch: true,
    });

    expect(debugSpy).toHaveBeenCalledWith("[opd_queue]", {
      event: "opd_queue.row_clicked",
      statusOfClickedRow: "called",
      viaKeyboard: true,
      viaSearch: true,
    });
  });

  // ── opd_queue.filter_changed ──────────────────────────────────────────────

  it("fires console.debug for filter_changed kind=status", () => {
    trackOpdQueueEvent({
      event: "opd_queue.filter_changed",
      kind: "status",
      statusValue: "waiting",
      queryLength: null,
    });

    expect(debugSpy).toHaveBeenCalledWith("[opd_queue]", {
      event: "opd_queue.filter_changed",
      kind: "status",
      statusValue: "waiting",
      queryLength: null,
    });
  });

  it("fires console.debug for filter_changed kind=search (length only, no query string)", () => {
    trackOpdQueueEvent({
      event: "opd_queue.filter_changed",
      kind: "search",
      statusValue: null,
      queryLength: 4,
    });

    expect(debugSpy).toHaveBeenCalledWith("[opd_queue]", {
      event: "opd_queue.filter_changed",
      kind: "search",
      statusValue: null,
      queryLength: 4,
    });
  });

  // ── opd_queue.action ──────────────────────────────────────────────────────

  it("fires console.debug for action=mark_called_silently outcome=success", () => {
    trackOpdQueueEvent({
      event: "opd_queue.action",
      action: "mark_called_silently",
      statusOfTargetRow: "waiting",
      outcome: "success",
    });

    expect(debugSpy).toHaveBeenCalledWith("[opd_queue]", {
      event: "opd_queue.action",
      action: "mark_called_silently",
      statusOfTargetRow: "waiting",
      outcome: "success",
    });
  });

  it("fires console.debug for action=mark_no_show outcome=error", () => {
    trackOpdQueueEvent({
      event: "opd_queue.action",
      action: "mark_no_show",
      statusOfTargetRow: "called",
      outcome: "error",
    });

    expect(debugSpy).toHaveBeenCalledWith("[opd_queue]", {
      event: "opd_queue.action",
      action: "mark_no_show",
      statusOfTargetRow: "called",
      outcome: "error",
    });
  });

  it("fires console.debug for broadcast_delay_set", () => {
    trackOpdQueueEvent({
      event: "opd_queue.action",
      action: "broadcast_delay_set",
      statusOfTargetRow: "in_consultation",
      outcome: "success",
    });

    expect(debugSpy).toHaveBeenCalledWith("[opd_queue]", {
      event: "opd_queue.action",
      action: "broadcast_delay_set",
      statusOfTargetRow: "in_consultation",
      outcome: "success",
    });
  });

  // ── Error resilience ──────────────────────────────────────────────────────

  it("does not propagate exceptions thrown by console.debug", () => {
    debugSpy.mockImplementation(() => {
      throw new Error("console.debug exploded");
    });

    expect(() =>
      trackOpdQueueEvent({
        event: "opd_queue.viewed",
        totalActive: 0,
        totalDone: 0,
        totalMissed: 0,
      })
    ).not.toThrow();
  });
});

describe("trackOpdSlotEvent", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let debugSpy: ReturnType<typeof vi.spyOn<any, any>>;

  beforeEach(() => {
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
  });

  afterEach(() => {
    debugSpy.mockRestore();
  });

  it("fires console.debug for opd_slot.viewed with counts", () => {
    trackOpdSlotEvent({
      event: "opd_slot.viewed",
      counts: { all: 3, upcoming: 2 },
    });
    expect(debugSpy).toHaveBeenCalledWith("[opd_slot]", {
      event: "opd_slot.viewed",
      counts: { all: 3, upcoming: 2 },
    });
  });

  it("fires console.debug for opd_slot.row_clicked", () => {
    trackOpdSlotEvent({
      event: "opd_slot.row_clicked",
      kind: "hotkey_enter",
      entryId: "appt-1",
      slotStatus: "upcoming",
    });
    expect(debugSpy).toHaveBeenCalledWith("[opd_slot]", {
      event: "opd_slot.row_clicked",
      kind: "hotkey_enter",
      entryId: "appt-1",
      slotStatus: "upcoming",
    });
  });

  it("does not propagate exceptions from console.debug", () => {
    debugSpy.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() =>
      trackOpdSlotEvent({
        event: "opd_slot.action",
        kind: "mark_no_show",
        entryId: "x",
        slotStatus: "running_late",
        outcome: "error",
      })
    ).not.toThrow();
  });
});
