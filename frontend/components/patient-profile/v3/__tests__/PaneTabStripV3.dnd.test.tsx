/**
 * `<PaneTabStripV3>` drag sources + `<CockpitDndContext>` overlay (cv3d-01).
 */

import React, { useEffect } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import fs from "node:fs";
import path from "node:path";
import { FileText, Stethoscope } from "lucide-react";
import type { PaneDefinition } from "@/lib/patient-profile/v3/foundation";

// ---------------------------------------------------------------------------
// Mocks — must be set up BEFORE importing the components under test.
// ---------------------------------------------------------------------------

const draggableCalls: Array<{
  id: string;
  data: unknown;
  disabled?: boolean;
}> = [];

let mockActiveDrag: unknown = null;
const dragStartHandlers: Array<(event: unknown) => void> = [];

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: ({
      children,
      onDragStart,
    }: {
      children: React.ReactNode;
      onDragStart?: (event: unknown) => void;
    }) => {
      useEffect(() => {
        if (onDragStart) {
          dragStartHandlers.push(onDragStart);
          return () => {
            const i = dragStartHandlers.indexOf(onDragStart);
            if (i >= 0) dragStartHandlers.splice(i, 1);
          };
        }
        return undefined;
      }, [onDragStart]);
      return <div data-dnd-context>{children}</div>;
    },
    DragOverlay: ({ children }: { children: React.ReactNode }) => (
      <div data-drag-overlay>{children}</div>
    ),
  };
});

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div data-sortable-context>{children}</div>
  ),
  horizontalListSortingStrategy: {},
  useSortable: ({
    id,
    data,
    disabled,
  }: {
    id: string;
    data?: unknown;
    disabled?: boolean;
  }) => {
    draggableCalls.push({ id, data, disabled });
    return {
      attributes: { "data-draggable-id": id, "data-drag-disabled": disabled },
      listeners: disabled ? {} : { "data-listener": "true" },
      setNodeRef: () => {},
      transform: null,
      transition: undefined,
      isDragging: mockActiveDrag === id,
    };
  },
}));

import PaneTabStripV3 from "../PaneTabStripV3";
import CockpitDndContext from "../CockpitDndContext";

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

function makePaneById(ids: string[]): Record<string, PaneDefinition> {
  const titles: Record<string, string> = {
    chart: "Patient chart",
    body: "Consultation",
    rx: "Prescription",
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

function renderStrip(
  paneIds: string[],
  options: {
    groupId?: string;
    activeTabId?: string;
    onActivateTab?: (paneId: string) => void;
    onCloseTab?: (paneId: string) => void;
    onContextMenuTab?: (paneId: string, event: React.MouseEvent) => void;
    isTabDraggable?: (paneId: string) => boolean;
  } = {},
) {
  const activeTabId = options.activeTabId ?? paneIds[0] ?? "";
  const onActivateTab = options.onActivateTab ?? vi.fn();
  const paneById = makePaneById(paneIds);

  render(
    <PaneTabStripV3
      groupId={options.groupId ?? "leaf-1"}
      paneIds={paneIds}
      activeTabId={activeTabId}
      paneById={paneById}
      onActivateTab={onActivateTab}
      onCloseTab={options.onCloseTab}
      onContextMenuTab={options.onContextMenuTab}
      isTabDraggable={options.isTabDraggable}
    />,
  );

  return { onActivateTab, paneById };
}

function fireDragStart(paneId: string, groupId = "leaf-1") {
  const handler = dragStartHandlers[dragStartHandlers.length - 1];
  if (!handler) throw new Error("No DndContext onDragStart handler captured");
  handler({
    active: {
      id: `cockpit-v3-tab-${groupId}-${paneId}`,
      data: { current: { paneId, groupId } },
    },
  });
}

describe("<PaneTabStripV3> drag sources (cv3d-01)", () => {
  beforeEach(() => {
    draggableCalls.length = 0;
    dragStartHandlers.length = 0;
    mockActiveDrag = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("registers each tab as a draggable with paneId + groupId data", () => {
    renderStrip(["chart", "body"], { groupId: "group-a" });

    expect(draggableCalls).toHaveLength(2);
    expect(draggableCalls[0]).toMatchObject({
      id: "cockpit-v3-tab-group-a-chart",
      data: { paneId: "chart", groupId: "group-a", sortableTabId: "chart" },
      disabled: false,
    });
    expect(draggableCalls[1]).toMatchObject({
      id: "cockpit-v3-tab-group-a-body",
      data: { paneId: "body", groupId: "group-a", sortableTabId: "body" },
      disabled: false,
    });

    const chartWrapper = document.querySelector(
      '[data-draggable-id="cockpit-v3-tab-group-a-chart"]',
    );
    expect(chartWrapper).toHaveAttribute("data-listener", "true");
  });

  it("click still activates tab without starting drag", () => {
    const onActivateTab = vi.fn();
    renderStrip(["chart", "body"], { onActivateTab });

    fireEvent.click(screen.getByRole("tab", { name: /Consultation/i }));
    expect(onActivateTab).toHaveBeenCalledWith("body");
  });

  it("isTabDraggable=false disables the body tab drag source", () => {
    renderStrip(["chart", "body"], {
      groupId: "leaf-x",
      isTabDraggable: (id) => id !== "body",
    });

    const bodyCall = draggableCalls.find((c) => c.id.endsWith("-body"));
    const chartCall = draggableCalls.find((c) => c.id.endsWith("-chart"));
    expect(bodyCall?.disabled).toBe(true);
    expect(chartCall?.disabled).toBe(false);

    const bodyWrapper = document.querySelector(
      '[data-draggable-id="cockpit-v3-tab-leaf-x-body"]',
    );
    expect(bodyWrapper).toHaveAttribute("data-drag-disabled", "true");
    expect(bodyWrapper).not.toHaveAttribute("data-listener");
  });

  it("close and context menu still work alongside drag listeners", () => {
    const onCloseTab = vi.fn();
    const onContextMenuTab = vi.fn();
    renderStrip(["chart", "body"], { onCloseTab, onContextMenuTab });

    fireEvent.click(screen.getByLabelText("Close chart tab"));
    expect(onCloseTab).toHaveBeenCalledWith("chart");

    fireEvent.contextMenu(screen.getByRole("tab", { name: /Patient chart/i }));
    expect(onContextMenuTab).toHaveBeenCalledWith(
      "chart",
      expect.any(Object),
    );
  });
});

describe("<CockpitDndContext> overlay chip (cv3d-01)", () => {
  beforeEach(() => {
    dragStartHandlers.length = 0;
    mockActiveDrag = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("renders dragged pane title in DragOverlay during an active drag", async () => {
    const paneById = makePaneById(["chart"]);

    render(
      <CockpitDndContext paneById={paneById}>
        <div data-testid="canvas">canvas</div>
      </CockpitDndContext>,
    );

    expect(screen.queryByText("Patient chart")).not.toBeInTheDocument();

    await act(async () => {
      fireDragStart("chart", "leaf-1");
    });

    expect(document.querySelector("[data-drag-overlay]")).toBeInTheDocument();
    expect(screen.getByText("Patient chart")).toBeInTheDocument();
  });
});

describe("PaneTabStripV3 dnd forbidden imports (P0-DL-4)", () => {
  it("does not import customize-mode-context", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../PaneTabStripV3.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/customize-mode-context/);
    expect(source).not.toMatch(/useCustomizeMode/);
  });
});
