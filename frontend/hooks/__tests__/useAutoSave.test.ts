import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAutoSave } from "../useAutoSave";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("useAutoSave", () => {
  it("serializes overlapping flush() so save() never runs in parallel", async () => {
    let active = 0;
    let maxActive = 0;
    const save = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(40);
      active -= 1;
    });

    const { result } = renderHook(() =>
      useAutoSave({ value: "a", save, enabled: true })
    );

    await act(async () => {
      await Promise.all([
        result.current.flush({ force: true }),
        result.current.flush({ force: true }),
      ]);
    });

    expect(maxActive).toBe(1);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("waits for an in-flight autosave before flush writes again", async () => {
    let active = 0;
    let maxActive = 0;
    const save = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await delay(50);
      active -= 1;
    });

    const { result, rerender } = renderHook(
      ({ value }) =>
        useAutoSave({ value, save, debounceMs: 15, enabled: true }),
      { initialProps: { value: "seed" } }
    );

    rerender({ value: "dirty" });
    await act(async () => {
      await delay(20);
    });
    await act(async () => {
      await result.current.flush();
    });

    expect(maxActive).toBe(1);
    expect(save.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
