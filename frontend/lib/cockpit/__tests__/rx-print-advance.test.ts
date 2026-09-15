import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginPrintAdvanceHold,
  endPrintAdvanceHold,
  isPrintAdvanceHeld,
  resetPrintAdvanceHoldForTests,
  subscribePrintAdvanceHold,
} from "@/lib/cockpit/rx-print-advance";

describe("rx-print-advance hold", () => {
  afterEach(() => {
    resetPrintAdvanceHoldForTests();
  });

  it("starts unset", () => {
    expect(isPrintAdvanceHeld()).toBe(false);
  });

  it("notifies subscribers when the hold begins and ends", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePrintAdvanceHold(listener);

    beginPrintAdvanceHold();
    expect(isPrintAdvanceHeld()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    endPrintAdvanceHold();
    expect(isPrintAdvanceHeld()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    beginPrintAdvanceHold();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("ending an unset hold is a no-op", () => {
    const listener = vi.fn();
    subscribePrintAdvanceHold(listener);
    endPrintAdvanceHold();
    expect(listener).not.toHaveBeenCalled();
  });
});
