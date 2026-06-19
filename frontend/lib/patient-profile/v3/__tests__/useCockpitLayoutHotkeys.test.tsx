import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCockpitLayoutHotkeys } from "@/lib/patient-profile/v3/useCockpitLayoutHotkeys";

describe("useCockpitLayoutHotkeys (cv3l-02)", () => {
  const applyDefaultLayout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("applies Read on mod+shift+2", () => {
    renderHook(() => useCockpitLayoutHotkeys(true, applyDefaultLayout));

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "2",
        shiftKey: true,
        ctrlKey: true,
        bubbles: true,
      }),
    );

    expect(applyDefaultLayout).toHaveBeenCalledWith("read");
  });

  it("does not fire while typing in a textarea", () => {
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    renderHook(() => useCockpitLayoutHotkeys(true, applyDefaultLayout));

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "1",
        shiftKey: true,
        ctrlKey: true,
        bubbles: true,
      }),
    );

    expect(applyDefaultLayout).not.toHaveBeenCalled();
  });
});
