/**
 * `<PaneTabStrip>` — unit tests (Vitest + RTL).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import { FileText, Stethoscope } from "lucide-react";

// ---------------------------------------------------------------------------
// Mocks — must be set up BEFORE importing the component under test.
// ---------------------------------------------------------------------------

type DraggableConfig = {
  id: string;
  data?: { paneId: string };
  disabled?: boolean;
};

const draggableConfigs: DraggableConfig[] = [];

vi.mock("@dnd-kit/core", () => {
  const DndContext = ({ children }: { children: React.ReactNode }) => (
    <div data-dnd-context>{children}</div>
  );

  const useDraggable = (config: DraggableConfig) => {
    draggableConfigs.push(config);
    return {
      attributes: { "data-draggable-id": config.id },
      listeners: config.disabled ? {} : { "data-draggable-listener": "true" },
      setNodeRef: () => {},
      isDragging: false,
    };
  };

  return {
    __esModule: true,
    DndContext,
    useDraggable,
  };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { DndContext } from "@dnd-kit/core";
import PaneTabStrip, { VISIBLE_TAB_LIMIT } from "../PaneTabStrip";
import { CustomizeModeContext } from "../customize-mode-context";
import type { PaneDefinition } from "@/lib/patient-profile/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePane(
  id: string,
  title: string,
  icon?: PaneDefinition["icon"],
): PaneDefinition {
  return {
    id,
    title,
    render: () => <div>{id}</div>,
    ...(icon ? { icon } : {}),
  };
}

function makePaneById(
  ids: string[],
  withIcons = true,
): Record<string, PaneDefinition> {
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
      makePane(
        id,
        titles[id] ?? id,
        withIcons ? icons[id] : undefined,
      ),
    ]),
  );
}

function renderStrip(
  paneIds: string[],
  options: {
    activeTabId?: string;
    onActivateTab?: (paneId: string) => void;
    onContextMenuTab?: (paneId: string, event: React.MouseEvent) => void;
    withIcons?: boolean;
    isTabDraggable?: (paneId: string) => boolean;
    wrapTab?: (paneId: string, tab: React.ReactNode) => React.ReactNode;
    customizeMode?: boolean;
  } = {},
) {
  const activeTabId = options.activeTabId ?? paneIds[0] ?? "";
  const onActivateTab = options.onActivateTab ?? vi.fn();
  const paneById = makePaneById(paneIds, options.withIcons ?? true);
  const customizeMode = options.customizeMode ?? true;

  const result = render(
    <DndContext>
      <CustomizeModeContext.Provider value={customizeMode}>
        <PaneTabStrip
          groupId="leaf-group-1"
          paneIds={paneIds}
          activeTabId={activeTabId}
          paneById={paneById}
          onActivateTab={onActivateTab}
          onContextMenuTab={options.onContextMenuTab}
          isTabDraggable={options.isTabDraggable}
          wrapTab={options.wrapTab}
        />
      </CustomizeModeContext.Provider>
    </DndContext>,
  );

  return { ...result, onActivateTab, paneById };
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("<PaneTabStrip>", () => {
  beforeEach(() => {
    cleanup();
    draggableConfigs.length = 0;
  });

  it("renders one tab button per paneId", () => {
    renderStrip(["chart", "body", "rx"]);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(screen.getByRole("tab", { name: /patient chart/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /consultation/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /prescription/i })).toBeInTheDocument();
  });

  it("marks the activeTabId button as aria-selected=true and others as false", () => {
    renderStrip(["chart", "body", "rx"], { activeTabId: "body" });

    expect(screen.getByRole("tab", { name: /patient chart/i })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByRole("tab", { name: /consultation/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /prescription/i })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("calls onActivateTab with the paneId when a tab is clicked", () => {
    const onActivateTab = vi.fn();
    renderStrip(["chart", "body"], { onActivateTab });

    fireEvent.click(screen.getByRole("tab", { name: /consultation/i }));

    expect(onActivateTab).toHaveBeenCalledOnce();
    expect(onActivateTab).toHaveBeenCalledWith("body");
  });

  it(`renders only VISIBLE_TAB_LIMIT (=${VISIBLE_TAB_LIMIT}) tabs visibly; rest into overflow menu`, () => {
    const paneIds = ["chart", "body", "rx", "plan", "snapshot", "history"];
    renderStrip(paneIds);

    const visibleTabs = screen.getAllByRole("tab");
    expect(visibleTabs).toHaveLength(VISIBLE_TAB_LIMIT);

    const overflowTrigger = screen.getByRole("button", {
      name: /2 more tabs/i,
    });
    expect(overflowTrigger).toBeInTheDocument();

    openDropdown(overflowTrigger);
    expect(screen.getByRole("menuitem", { name: /snapshot/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /history/i })).toBeInTheDocument();
  });

  it("overflow menu's chevron shows '+N' where N is overflow count", () => {
    const paneIds = ["chart", "body", "rx", "plan", "snapshot"];
    renderStrip(paneIds);

    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("overflow menu items invoke onActivateTab on select", () => {
    const onActivateTab = vi.fn();
    const paneIds = ["chart", "body", "rx", "plan", "snapshot"];
    renderStrip(paneIds, { onActivateTab });

    openDropdown(screen.getByRole("button", { name: /1 more tabs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /snapshot/i }));

    expect(onActivateTab).toHaveBeenCalledWith("snapshot");
  });

  it("does not render when paneIds is empty (component invariant)", () => {
    const { container } = render(
      <DndContext>
        <PaneTabStrip
          groupId="leaf-group-1"
          paneIds={[]}
          activeTabId=""
          paneById={{}}
          onActivateTab={vi.fn()}
        />
      </DndContext>,
    );

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(container.querySelector("[data-dnd-context]")).toBeInTheDocument();
    expect(container.querySelector("[data-pane-tabs-group-id]")).toBeNull();
  });

  it("fires onContextMenuTab(paneId, event) on right-click of a tab button", () => {
    const onContextMenuTab = vi.fn();
    renderStrip(["chart", "body"], { onContextMenuTab });

    const tab = screen.getByRole("tab", { name: /consultation/i });
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "preventDefault", {
      value: vi.fn(),
      writable: true,
    });

    fireEvent(tab, event);

    expect(onContextMenuTab).toHaveBeenCalledOnce();
    expect(onContextMenuTab).toHaveBeenCalledWith("body", expect.any(Object));
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("renders pane icon when paneById[id].icon is present", () => {
    renderStrip(["chart", "body"]);

    const chartTab = screen.getByRole("tab", { name: /patient chart/i });
    expect(chartTab.querySelector("svg")).toBeInTheDocument();
  });

  it("does not render an icon when paneById[id].icon is undefined", () => {
    renderStrip(["rx", "plan"], { withIcons: false });

    const rxTab = screen.getByRole("tab", { name: /prescription/i });
    expect(rxTab.querySelector("svg")).not.toBeInTheDocument();
  });

  it("truncates long titles with max-w-[140px]", () => {
    const longTitle =
      "This is an extremely long pane title that should truncate in the tab strip";
    const paneById: Record<string, PaneDefinition> = {
      chart: makePane("chart", longTitle, Stethoscope),
    };

    render(
      <DndContext>
        <PaneTabStrip
          groupId="leaf-group-1"
          paneIds={["chart"]}
          activeTabId="chart"
          paneById={paneById}
          onActivateTab={vi.fn()}
        />
      </DndContext>,
    );

    const titleSpan = screen.getByText(longTitle);
    expect(titleSpan).toHaveClass("truncate", "max-w-[140px]");
  });
});

describe("<PaneTabStrip> draggable tabs (cpfd-04)", () => {
  beforeEach(() => {
    cleanup();
    draggableConfigs.length = 0;
  });

  it("each visible tab is wrapped in a draggable with id `tab-drag-<paneId>` and data { paneId }", () => {
    renderStrip(["chart", "body", "rx"]);

    expect(draggableConfigs).toHaveLength(3);
    for (const paneId of ["chart", "body", "rx"]) {
      const config = draggableConfigs.find((c) => c.id === `tab-drag-${paneId}`);
      expect(config).toBeDefined();
      expect(config?.data).toEqual({ paneId });
      expect(config?.disabled).toBe(false);
    }
  });

  it("a plain click still calls onActivateTab (does not start a drag)", () => {
    const onActivateTab = vi.fn();
    renderStrip(["chart", "body"], { onActivateTab });

    fireEvent.click(screen.getByRole("tab", { name: /consultation/i }));

    expect(onActivateTab).toHaveBeenCalledOnce();
    expect(onActivateTab).toHaveBeenCalledWith("body");
  });

  it("right-click still fires onContextMenuTab", () => {
    const onContextMenuTab = vi.fn();
    renderStrip(["chart", "body"], { onContextMenuTab });

    const tab = screen.getByRole("tab", { name: /consultation/i });
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "preventDefault", {
      value: vi.fn(),
      writable: true,
    });

    fireEvent(tab, event);

    expect(onContextMenuTab).toHaveBeenCalledOnce();
    expect(onContextMenuTab).toHaveBeenCalledWith("body", expect.any(Object));
  });

  it("isTabDraggable(paneId) === false disables that tab's draggable", () => {
    renderStrip(["chart", "body"], {
      isTabDraggable: (paneId) => paneId !== "body",
    });

    const bodyConfig = draggableConfigs.find((c) => c.id === "tab-drag-body");
    const chartConfig = draggableConfigs.find((c) => c.id === "tab-drag-chart");
    expect(bodyConfig?.disabled).toBe(true);
    expect(chartConfig?.disabled).toBe(false);
    expect(
      document.querySelector('[data-draggable-id="tab-drag-chart"]'),
    ).toHaveAttribute("data-draggable-listener", "true");
  });

  it("defaults every tab to draggable when isTabDraggable is not provided", () => {
    renderStrip(["chart", "body"]);

    expect(draggableConfigs.every((c) => c.disabled === false)).toBe(true);
  });
});
