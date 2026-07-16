/**
 * `<PaneTabStripV3>` — unit tests (cv3c-02).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import { DndContext } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import fs from "node:fs";
import path from "node:path";
import { FileText, Stethoscope } from "lucide-react";
import PaneTabStripV3, { VISIBLE_TAB_LIMIT } from "../PaneTabStripV3";
import type { PaneDefinition } from "@/lib/patient-profile/v3/foundation";

function makePane(
  id: string,
  title: string,
  icon?: PaneDefinition["icon"],
): PaneDefinition {
  return {
    id,
    title,
    render: () => <div data-testid={`pane-body-${id}`}>{id}</div>,
    ...(icon ? { icon } : {}),
  };
}

function makePaneById(ids: string[]): Record<string, PaneDefinition> {
  const titles: Record<string, string> = {
    chart: "Patient chart",
    body: "Consultation",
    rx: "Prescription",
    plan: "Plan",
    snapshot: "Snapshot",
    history: "History",
    subjective: "Subjective",
    objective: "Objective",
  };
  const icons: Record<string, PaneDefinition["icon"]> = {
    chart: Stethoscope,
    body: FileText,
  };
  return Object.fromEntries(
    ids.map((id) => [
      id,
      makePane(id, titles[id] ?? id, icons[id]),
    ]),
  );
}

/** Open a Radix UI DropdownMenu trigger in jsdom. */
function openDropdown(trigger: Element) {
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
    bubbles: true,
    cancelable: true,
  });
  fireEvent.click(trigger);
}

function renderStrip(
  paneIds: string[],
  options: {
    activeTabId?: string;
    onActivateTab?: (paneId: string) => void;
    onCloseTab?: (paneId: string) => void;
    groupId?: string;
  } = {},
) {
  const activeTabId = options.activeTabId ?? paneIds[0] ?? "";
  const onActivateTab = options.onActivateTab ?? vi.fn();
  const paneById = makePaneById(paneIds);

  const result = render(
    <DndContext>
      <SortableContext items={paneIds} strategy={horizontalListSortingStrategy}>
        <PaneTabStripV3
          groupId={options.groupId ?? "__tabs_0"}
          paneIds={paneIds}
          activeTabId={activeTabId}
          paneById={paneById}
          onActivateTab={onActivateTab}
          onCloseTab={options.onCloseTab}
        />
        <div id={`pane-body-${activeTabId}`} data-testid="active-pane-body">
          active body
        </div>
      </SortableContext>
    </DndContext>,
  );

  return { ...result, onActivateTab, paneById };
}

describe("<PaneTabStripV3>", () => {
  beforeEach(() => {
    cleanup();
  });

  it("single tab renders with aria-selected true and body present", () => {
    renderStrip(["chart"]);

    const tab = screen.getByRole("tab", { name: /Patient chart/i });
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(tab).toHaveAttribute("aria-controls", "pane-body-chart");
    expect(screen.getByTestId("active-pane-body")).toBeInTheDocument();
  });

  it("renders trailing end-zone droppable after tabs", () => {
    renderStrip(["chart", "body"], { groupId: "leaf-1" });
    const end = screen.getByTestId("pane-tab-strip-end-drop");
    expect(end).toHaveAttribute("data-pane-tabs-end", "leaf-1");
  });

  it("activate calls onActivateTab when clicking a non-active tab", () => {
    const onActivateTab = vi.fn();
    renderStrip(["chart", "body", "rx"], {
      activeTabId: "chart",
      onActivateTab,
    });

    fireEvent.click(screen.getByRole("tab", { name: /Consultation/i }));
    expect(onActivateTab).toHaveBeenCalledWith("body");
  });

  it("close calls onCloseTab when clicking ×", () => {
    const onCloseTab = vi.fn();
    renderStrip(["chart", "body"], {
      activeTabId: "chart",
      onCloseTab,
    });

    fireEvent.click(screen.getByLabelText("Close chart tab"));
    expect(onCloseTab).toHaveBeenCalledWith("chart");
  });

  it("overflow popover tabs remain activatable and closable", () => {
    const ids = Array.from(
      { length: VISIBLE_TAB_LIMIT + 2 },
      (_, i) => `pane-${i}`,
    );
    const onActivateTab = vi.fn();
    const onCloseTab = vi.fn();
    renderStrip(ids, {
      activeTabId: ids[0],
      onActivateTab,
      onCloseTab,
    });

    openDropdown(
      screen.getByRole("button", { name: `${ids.length - VISIBLE_TAB_LIMIT} more tabs` }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: new RegExp(`pane-${VISIBLE_TAB_LIMIT}`) }),
    );
    expect(onActivateTab).toHaveBeenCalledWith(`pane-${VISIBLE_TAB_LIMIT}`);

    openDropdown(
      screen.getByRole("button", { name: `${ids.length - VISIBLE_TAB_LIMIT} more tabs` }),
    );
    fireEvent.click(
      screen.getByLabelText(`Close pane-${VISIBLE_TAB_LIMIT + 1} tab`),
    );
    expect(onCloseTab).toHaveBeenCalledWith(`pane-${VISIBLE_TAB_LIMIT + 1}`);
  });

  it("tablist scrolls horizontally when the strip is narrower than its tabs", () => {
    renderStrip(["subjective", "objective", "assessment", "plan"], {
      activeTabId: "subjective",
    });
    const scroll = screen.getByTestId("pane-tab-strip-scroll");
    expect(scroll).toHaveClass("overflow-x-auto");
    expect(scroll).toHaveClass("overflow-y-hidden");
    expect(scroll).toHaveClass("min-w-0");
    expect(scroll).toHaveAttribute("role", "tablist");
  });

  it("maps vertical mouse wheel to horizontal scroll when the strip overflows", () => {
    renderStrip(["subjective", "objective", "assessment", "plan"], {
      activeTabId: "subjective",
    });
    const scroll = screen.getByTestId("pane-tab-strip-scroll");
    Object.defineProperty(scroll, "scrollWidth", { configurable: true, value: 400 });
    Object.defineProperty(scroll, "clientWidth", { configurable: true, value: 200 });
    scroll.scrollLeft = 0;

    fireEvent.wheel(scroll, { deltaY: 40, deltaX: 0 });
    expect(scroll.scrollLeft).toBe(40);
  });

  it("does not remap wheel when the gesture is already horizontal", () => {
    renderStrip(["subjective", "objective", "assessment", "plan"], {
      activeTabId: "subjective",
    });
    const scroll = screen.getByTestId("pane-tab-strip-scroll");
    Object.defineProperty(scroll, "scrollWidth", { configurable: true, value: 400 });
    Object.defineProperty(scroll, "clientWidth", { configurable: true, value: 200 });
    scroll.scrollLeft = 10;

    fireEvent.wheel(scroll, { deltaY: 5, deltaX: 30 });
    // Native horizontal handling owns this — we must not double-apply deltaY.
    expect(scroll.scrollLeft).toBe(10);
  });

  it("shows a right edge fade and marks overflowing when the strip cannot fit its tabs", () => {
    renderStrip(["subjective", "objective", "assessment", "plan"], {
      activeTabId: "subjective",
    });
    const scroll = screen.getByTestId("pane-tab-strip-scroll");
    Object.defineProperty(scroll, "scrollWidth", { configurable: true, value: 400 });
    Object.defineProperty(scroll, "clientWidth", { configurable: true, value: 200 });
    Object.defineProperty(scroll, "scrollLeft", { configurable: true, value: 0, writable: true });
    fireEvent.scroll(scroll);

    expect(scroll).toHaveAttribute("data-overflowing", "true");
    expect(screen.getByTestId("pane-tab-strip-fade-right")).toBeInTheDocument();
    expect(screen.queryByTestId("pane-tab-strip-fade-left")).not.toBeInTheDocument();
    expect(screen.getByTestId("pane-tab-strip-scrollbar")).toBeInTheDocument();
    expect(screen.getByTestId("pane-tab-strip-thumb")).toBeInTheDocument();
  });

  it("shows a left edge fade after scrolling away from the start", () => {
    renderStrip(["subjective", "objective", "assessment", "plan"], {
      activeTabId: "subjective",
    });
    const scroll = screen.getByTestId("pane-tab-strip-scroll");
    Object.defineProperty(scroll, "scrollWidth", { configurable: true, value: 400 });
    Object.defineProperty(scroll, "clientWidth", { configurable: true, value: 200 });
    Object.defineProperty(scroll, "scrollLeft", {
      configurable: true,
      get: () => 80,
    });
    fireEvent.scroll(scroll);

    expect(screen.getByTestId("pane-tab-strip-fade-left")).toBeInTheDocument();
    expect(screen.getByTestId("pane-tab-strip-fade-right")).toBeInTheDocument();
  });

  it("drags the custom thumb to scroll the tab strip", () => {
    renderStrip(["subjective", "objective", "assessment", "plan"], {
      activeTabId: "subjective",
    });
    const scroll = screen.getByTestId("pane-tab-strip-scroll");
    Object.defineProperty(scroll, "scrollWidth", { configurable: true, value: 400 });
    Object.defineProperty(scroll, "clientWidth", { configurable: true, value: 200 });
    let scrollLeft = 0;
    Object.defineProperty(scroll, "scrollLeft", {
      configurable: true,
      get: () => scrollLeft,
      set: (v: number) => {
        scrollLeft = v;
      },
    });
    fireEvent.scroll(scroll);

    const thumb = screen.getByTestId("pane-tab-strip-thumb");
    const track = screen.getByTestId("pane-tab-strip-scrollbar");
    // Track is 200px wide so maxThumbTravel ≈ 100 (50% thumb) → dx 50 ≈ half scroll.
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      width: 200,
      height: 6,
      top: 0,
      left: 0,
      bottom: 6,
      right: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(track, "clientWidth", { configurable: true, value: 200 });

    fireEvent.pointerDown(thumb, { clientX: 20, pointerId: 1, buttons: 1 });
    fireEvent.pointerMove(thumb, { clientX: 70, pointerId: 1, buttons: 1 });
    fireEvent.pointerUp(thumb, { clientX: 70, pointerId: 1 });

    expect(scrollLeft).toBeGreaterThan(0);
  });
});

describe("PaneTabStripV3 forbidden imports (P1-DL-3)", () => {
  it("does not import customize-mode-context", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../PaneTabStripV3.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/customize-mode-context/);
    expect(source).not.toMatch(/useCustomizeMode/);
  });
});
