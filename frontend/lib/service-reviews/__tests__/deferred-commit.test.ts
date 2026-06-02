import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleCommit } from "@/lib/service-reviews/deferred-commit";

describe("scheduleCommit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires commit after delayMs", () => {
    const commit = vi.fn();
    scheduleCommit(commit, 5000);
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("cancel before elapse prevents fire", () => {
    const commit = vi.fn();
    const handle = scheduleCommit(commit, 5000);
    handle.cancel();
    vi.advanceTimersByTime(5000);
    expect(commit).not.toHaveBeenCalled();
  });

  it("fire before elapse calls commit once and clears timer", () => {
    const commit = vi.fn();
    const handle = scheduleCommit(commit, 5000);
    handle.fire();
    expect(commit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("cancel then fire does not call commit", () => {
    const commit = vi.fn();
    const handle = scheduleCommit(commit, 5000);
    handle.cancel();
    handle.fire();
    expect(commit).not.toHaveBeenCalled();
  });

  it("fire then cancel does not call commit twice", () => {
    const commit = vi.fn();
    const handle = scheduleCommit(commit, 5000);
    handle.fire();
    handle.cancel();
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
