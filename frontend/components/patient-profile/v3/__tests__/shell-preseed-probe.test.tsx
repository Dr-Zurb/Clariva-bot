import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useShellLayout, v4TreeLayoutStorageKey } from "@/lib/patient-profile/useShellLayout";

describe("shell pre-seed probe", () => {
  beforeEach(() => localStorage.clear());

  it("rehydrates pre-seeded v4 layout", () => {
    const key = "probe-shell";
    localStorage.setItem(
      v4TreeLayoutStorageKey(key),
      JSON.stringify({
        version: 5,
        paneTree: {
          id: "__root__",
          sizePct: 100,
          hidden: false,
          direction: "horizontal",
          children: [
            { id: "a", sizePct: 100, hidden: false, paneIds: ["a"], activeTabId: "a" },
          ],
        },
      }),
    );

    const { result } = renderHook(() =>
      useShellLayout({
        storageKey: key,
        defaultPaneOrder: ["a"],
        defaultPaneState: { a: { sizePct: 100, hidden: true } },
        knownLeafIds: ["a"],
      }),
    );

    expect(result.current.paneState.a.hidden).toBe(false);
  });
});
