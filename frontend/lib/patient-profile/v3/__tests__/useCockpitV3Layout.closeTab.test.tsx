/**
 * closeTab — tab × must hide the last visible pane (parity with palette toggle).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useCockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";
import {
  blankLayout,
  blankLayoutFlat,
  hasVisibleLeaves,
} from "@/lib/patient-profile/v3/blankLayout";
import type { PaneDefinition } from "@/lib/patient-profile/v3/foundation";

function makePanes(ids: string[]): PaneDefinition[] {
  return ids.map((id) => ({
    id,
    title: id,
    render: () => null,
  }));
}

function hookOptsFor(storageKey: string, panes: PaneDefinition[]) {
  const blankDefault = blankLayout(panes);
  const defaultFlat = blankLayoutFlat(panes);
  return {
    storageKey,
    defaultPaneOrder: defaultFlat.paneOrder,
    defaultPaneState: defaultFlat.paneState,
    knownLeafIds: defaultFlat.paneOrder,
    blankDefaultTree: blankDefault.paneTree,
  };
}

describe("useCockpitV3Layout closeTab", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("hides the last visible pane when the tab × is used (same as palette remove)", () => {
    const storageKey = `test:close-tab-last:${crypto.randomUUID()}`;
    const panes = makePanes(["visit-summary"]);
    const opts = hookOptsFor(storageKey, panes);

    const { result } = renderHook(() => useCockpitV3Layout(opts));

    act(() => {
      result.current.addPane("visit-summary");
    });
    expect(hasVisibleLeaves(result.current.paneTree)).toBe(true);

    let closeResult: { ok: boolean; reason?: string } = { ok: false };
    act(() => {
      closeResult = result.current.closeTab("visit-summary", "visit-summary");
    });

    expect(closeResult).toEqual({ ok: true });
    expect(hasVisibleLeaves(result.current.paneTree)).toBe(false);
    expect(result.current.paneState["visit-summary"]?.hidden).toBe(true);
  });

  it("closeLeaf hides every pane in a multi-tab leaf", () => {
    const storageKey = `test:close-leaf-multi:${crypto.randomUUID()}`;
    const panes = makePanes(["chart", "body", "rx"]);
    const opts = hookOptsFor(storageKey, panes);

    const { result } = renderHook(() => useCockpitV3Layout(opts));

    act(() => {
      result.current.applyLayout({
        version: 5,
        paneTree: {
          id: "__root__",
          sizePct: 100,
          hidden: false,
          direction: "horizontal",
          children: [
            {
              id: "__tabs_0",
              sizePct: 50,
              hidden: false,
              paneIds: ["chart", "body"],
              activeTabId: "chart",
            },
            {
              id: "rx",
              sizePct: 50,
              hidden: false,
              paneIds: ["rx"],
              activeTabId: "rx",
            },
          ],
        },
      });
    });

    let closeResult: { ok: boolean; reason?: string } = { ok: false };
    act(() => {
      closeResult = result.current.closeLeaf("__tabs_0");
    });

    expect(closeResult).toEqual({ ok: true });
    expect(result.current.paneState["chart"]?.hidden).toBe(true);
    expect(result.current.paneState["body"]?.hidden).toBe(true);
    expect(result.current.paneState["rx"]?.hidden).toBe(false);
  });
});
