/**
 * useReviewKeyboard — brr-12 triage shortcuts.
 *
 * Run: `vitest run frontend/lib/service-reviews/__tests__/useReviewKeyboard.test.ts`
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  isReviewKeyboardTypingTarget,
  useReviewKeyboard,
} from "@/lib/service-reviews/useReviewKeyboard";

describe("isReviewKeyboardTypingTarget", () => {
  it("detects input-like elements", () => {
    const input = document.createElement("input");
    expect(isReviewKeyboardTypingTarget(input)).toBe(true);
  });

  it("returns false for non-input elements", () => {
    const div = document.createElement("div");
    expect(isReviewKeyboardTypingTarget(div)).toBe(false);
  });
});

describe("useReviewKeyboard", () => {
  const onMove = vi.fn();
  const onConfirm = vi.fn();
  const onReassign = vi.fn();
  const onCancel = vi.fn();
  const onOpenDetail = vi.fn();
  const onFocusFilter = vi.fn();
  const onToggleHelp = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mount(enabled = true) {
    renderHook(() =>
      useReviewKeyboard({
        enabled,
        count: 3,
        onMove,
        onConfirm,
        onReassign,
        onCancel,
        onOpenDetail,
        onFocusFilter,
        onToggleHelp,
      })
    );
  }

  it("calls onMove for j/k", () => {
    mount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    expect(onMove).toHaveBeenCalledWith(1);
    expect(onMove).toHaveBeenCalledWith(-1);
  });

  it("calls onConfirm for c", () => {
    mount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("ignores keys when target is an input", () => {
    mount();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
    expect(onConfirm).not.toHaveBeenCalled();
    input.remove();
  });

  it("ignores keys when enabled is false", () => {
    mount(false);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    expect(onMove).not.toHaveBeenCalled();
  });
});
