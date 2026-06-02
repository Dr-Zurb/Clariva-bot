/**
 * @vitest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSwipeToReply } from "../use-swipe-to-reply";

function pointerEvent(
  type: string,
  target: HTMLElement,
  opts: {
    clientX?: number;
    clientY?: number;
    button?: number;
    pointerId?: number;
    pointerType?: string;
  } = {},
): React.PointerEvent {
  return {
    type,
    button: opts.button ?? 0,
    clientX: opts.clientX ?? 0,
    clientY: opts.clientY ?? 0,
    pointerId: opts.pointerId ?? 1,
    pointerType: opts.pointerType ?? "touch",
    currentTarget: target,
    preventDefault: vi.fn(),
  } as unknown as React.PointerEvent;
}

describe("useSwipeToReply", () => {
  it("ignores mouse and pen pointers", () => {
    const onTrigger = vi.fn();
    const target = document.createElement("li");
    target.setPointerCapture = vi.fn();
    const { result } = renderHook(() => useSwipeToReply({ onTrigger }));

    act(() => {
      result.current.handlers.onPointerDown(
        pointerEvent("pointerdown", target, { pointerType: "mouse" }),
      );
      result.current.handlers.onPointerMove(
        pointerEvent("pointermove", target, { clientX: 80, pointerType: "mouse" }),
      );
      result.current.handlers.onPointerUp(
        pointerEvent("pointerup", target, { pointerType: "mouse" }),
      );
    });

    expect(onTrigger).not.toHaveBeenCalled();
    expect(result.current.dragOffset).toBe(0);
  });

  it("updates dragOffset clamped to maxDragPx with no left-drag", () => {
    const onTrigger = vi.fn();
    const target = document.createElement("li");
    target.setPointerCapture = vi.fn();
    target.hasPointerCapture = () => true;
    target.releasePointerCapture = vi.fn();
    const { result } = renderHook(() =>
      useSwipeToReply({ onTrigger, maxDragPx: 80 }),
    );

    act(() => {
      result.current.handlers.onPointerDown(
        pointerEvent("pointerdown", target, { clientX: 0, clientY: 0 }),
      );
      result.current.handlers.onPointerMove(
        pointerEvent("pointermove", target, { clientX: 40, clientY: 0 }),
      );
    });
    expect(result.current.dragOffset).toBe(40);
    expect(result.current.dragging).toBe(true);

    act(() => {
      result.current.handlers.onPointerMove(
        pointerEvent("pointermove", target, { clientX: 120, clientY: 0 }),
      );
    });
    expect(result.current.dragOffset).toBe(80);

    act(() => {
      result.current.handlers.onPointerMove(
        pointerEvent("pointermove", target, { clientX: -20, clientY: 0 }),
      );
    });
    expect(result.current.dragOffset).toBe(0);
  });

  it("fires onTrigger when released past threshold and springs back", () => {
    const onTrigger = vi.fn();
    const target = document.createElement("li");
    target.setPointerCapture = vi.fn();
    target.hasPointerCapture = () => true;
    target.releasePointerCapture = vi.fn();
    const { result } = renderHook(() =>
      useSwipeToReply({ onTrigger, thresholdPx: 60 }),
    );

    act(() => {
      result.current.handlers.onPointerDown(
        pointerEvent("pointerdown", target, { clientX: 0, clientY: 0 }),
      );
      result.current.handlers.onPointerMove(
        pointerEvent("pointermove", target, { clientX: 65, clientY: 0 }),
      );
      result.current.handlers.onPointerUp(
        pointerEvent("pointerup", target, { clientX: 65, clientY: 0 }),
      );
    });

    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(result.current.dragOffset).toBe(0);
    expect(result.current.dragging).toBe(false);
  });

  it("does not fire onTrigger when released before threshold", () => {
    const onTrigger = vi.fn();
    const target = document.createElement("li");
    target.setPointerCapture = vi.fn();
    target.hasPointerCapture = () => true;
    target.releasePointerCapture = vi.fn();
    const { result } = renderHook(() =>
      useSwipeToReply({ onTrigger, thresholdPx: 60 }),
    );

    act(() => {
      result.current.handlers.onPointerDown(
        pointerEvent("pointerdown", target, { clientX: 0, clientY: 0 }),
      );
      result.current.handlers.onPointerMove(
        pointerEvent("pointermove", target, { clientX: 40, clientY: 0 }),
      );
      result.current.handlers.onPointerUp(
        pointerEvent("pointerup", target, { clientX: 40, clientY: 0 }),
      );
    });

    expect(onTrigger).not.toHaveBeenCalled();
    expect(result.current.dragOffset).toBe(0);
  });

  it("cancels on vertical movement beyond 20 px", () => {
    const onTrigger = vi.fn();
    const target = document.createElement("li");
    target.setPointerCapture = vi.fn();
    target.hasPointerCapture = () => true;
    target.releasePointerCapture = vi.fn();
    const { result } = renderHook(() => useSwipeToReply({ onTrigger }));

    act(() => {
      result.current.handlers.onPointerDown(
        pointerEvent("pointerdown", target, { clientX: 0, clientY: 0 }),
      );
      result.current.handlers.onPointerMove(
        pointerEvent("pointermove", target, { clientX: 50, clientY: 25 }),
      );
      result.current.handlers.onPointerUp(
        pointerEvent("pointerup", target, { clientX: 50, clientY: 25 }),
      );
    });

    expect(onTrigger).not.toHaveBeenCalled();
    expect(result.current.dragOffset).toBe(0);
    expect(result.current.dragging).toBe(false);
  });

  it("cancels cleanly on pointercancel", () => {
    const onTrigger = vi.fn();
    const target = document.createElement("li");
    target.setPointerCapture = vi.fn();
    target.hasPointerCapture = () => true;
    target.releasePointerCapture = vi.fn();
    const { result } = renderHook(() => useSwipeToReply({ onTrigger }));

    act(() => {
      result.current.handlers.onPointerDown(
        pointerEvent("pointerdown", target, { clientX: 0, clientY: 0 }),
      );
      result.current.handlers.onPointerMove(
        pointerEvent("pointermove", target, { clientX: 50, clientY: 0 }),
      );
      result.current.handlers.onPointerCancel(
        pointerEvent("pointercancel", target, { clientX: 50, clientY: 0 }),
      );
    });

    expect(onTrigger).not.toHaveBeenCalled();
    expect(result.current.dragOffset).toBe(0);
  });

  it("is a no-op when disabled", () => {
    const onTrigger = vi.fn();
    const target = document.createElement("li");
    const { result } = renderHook(() =>
      useSwipeToReply({ onTrigger, enabled: false }),
    );

    act(() => {
      result.current.handlers.onPointerDown(
        pointerEvent("pointerdown", target, { clientX: 0, clientY: 0 }),
      );
      result.current.handlers.onPointerMove(
        pointerEvent("pointermove", target, { clientX: 80, clientY: 0 }),
      );
      result.current.handlers.onPointerUp(
        pointerEvent("pointerup", target, { clientX: 80, clientY: 0 }),
      );
    });

    expect(onTrigger).not.toHaveBeenCalled();
    expect(result.current.dragOffset).toBe(0);
  });
});
