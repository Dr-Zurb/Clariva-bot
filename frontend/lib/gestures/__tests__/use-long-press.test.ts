/**
 * @vitest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLongPress } from "../use-long-press";

function pointerEvent(
  type: string,
  target: HTMLElement,
  opts: { clientX?: number; clientY?: number; button?: number } = {},
): React.PointerEvent {
  return {
    type,
    button: opts.button ?? 0,
    clientX: opts.clientX ?? 0,
    clientY: opts.clientY ?? 0,
    currentTarget: target,
    preventDefault: vi.fn(),
  } as unknown as React.PointerEvent;
}

describe("useLongPress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fires onLongPress after the default 300 ms hold", () => {
    const onLongPress = vi.fn();
    const anchor = document.createElement("div");
    const { result } = renderHook(() => useLongPress({ onLongPress }));

    act(() => {
      result.current.onPointerDown(pointerEvent("pointerdown", anchor));
    });
    expect(onLongPress).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(onLongPress).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onLongPress).toHaveBeenCalledWith(anchor);
  });

  it("cancels when pointer is released before duration elapses", () => {
    const onLongPress = vi.fn();
    const anchor = document.createElement("div");
    const { result } = renderHook(() => useLongPress({ onLongPress }));

    act(() => {
      result.current.onPointerDown(pointerEvent("pointerdown", anchor));
      result.current.onPointerUp(pointerEvent("pointerup", anchor));
      vi.advanceTimersByTime(300);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("cancels when movement exceeds tolerance", () => {
    const onLongPress = vi.fn();
    const anchor = document.createElement("div");
    const { result } = renderHook(() =>
      useLongPress({ onLongPress, moveTolerancePx: 10 }),
    );

    act(() => {
      result.current.onPointerDown(
        pointerEvent("pointerdown", anchor, { clientX: 0, clientY: 0 }),
      );
      result.current.onPointerMove(
        pointerEvent("pointermove", anchor, { clientX: 15, clientY: 0 }),
      );
      vi.advanceTimersByTime(300);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("calls navigator.vibrate(15) when haptic is enabled", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });

    const onLongPress = vi.fn();
    const anchor = document.createElement("div");
    const { result } = renderHook(() => useLongPress({ onLongPress }));

    act(() => {
      result.current.onPointerDown(pointerEvent("pointerdown", anchor));
      vi.advanceTimersByTime(300);
    });

    expect(vibrate).toHaveBeenCalledWith(15);
  });

  it("skips vibrate when haptic is false", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });

    const onLongPress = vi.fn();
    const anchor = document.createElement("div");
    const { result } = renderHook(() =>
      useLongPress({ onLongPress, haptic: false }),
    );

    act(() => {
      result.current.onPointerDown(pointerEvent("pointerdown", anchor));
      vi.advanceTimersByTime(300);
    });

    expect(vibrate).not.toHaveBeenCalled();
  });

  it("preventDefault on pointerdown to suppress text selection", () => {
    const onLongPress = vi.fn();
    const anchor = document.createElement("div");
    const { result } = renderHook(() => useLongPress({ onLongPress }));
    const event = pointerEvent("pointerdown", anchor);

    act(() => {
      result.current.onPointerDown(event);
    });

    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("ignores non-primary button presses", () => {
    const onLongPress = vi.fn();
    const anchor = document.createElement("div");
    const { result } = renderHook(() => useLongPress({ onLongPress }));

    act(() => {
      result.current.onPointerDown(
        pointerEvent("pointerdown", anchor, { button: 2 }),
      );
      vi.advanceTimersByTime(300);
    });

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
