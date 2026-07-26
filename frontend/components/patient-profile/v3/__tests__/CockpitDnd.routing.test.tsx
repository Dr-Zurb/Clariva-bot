/**
 * Cockpit v3 drag-end routing — move, guard, caps, reorder, telemetry (cv3d-03).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { DragEndEvent, DragMoveEvent } from "@dnd-kit/core";

const dragEndHandlers: Array<(event: DragEndEvent) => void> = [];
const dragMoveHandlers: Array<(event: DragMoveEvent) => void> = [];

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
      onDragMove,
    }: {
      children: React.ReactNode;
      onDragEnd?: (event: DragEndEvent) => void;
      onDragMove?: (event: DragMoveEvent) => void;
    }) => {
      React.useEffect(() => {
        if (onDragEnd) {
          dragEndHandlers.push(onDragEnd);
          return () => {
            const i = dragEndHandlers.indexOf(onDragEnd);
            if (i >= 0) dragEndHandlers.splice(i, 1);
          };
        }
        return undefined;
      }, [onDragEnd]);
      React.useEffect(() => {
        if (onDragMove) {
          dragMoveHandlers.push(onDragMove);
          return () => {
            const i = dragMoveHandlers.indexOf(onDragMove);
            if (i >= 0) dragMoveHandlers.splice(i, 1);
          };
        }
        return undefined;
      }, [onDragMove]);
      return <div data-dnd-context>{children}</div>;
    },
    DragOverlay: ({ children }: { children: React.ReactNode }) => (
      <div data-drag-overlay>{children}</div>
    ),
  };
});

const mockMovePane = vi.fn();
const mockToastOnCapRejection = vi.fn();
const mockLayoutUxToastError = vi.fn();
const mockTrackCockpitV3DragDrop = vi.fn();

vi.mock("@/lib/patient-profile/v3/cockpit-cap-toast", () => ({
  toastOnCapRejection: (...args: unknown[]) => mockToastOnCapRejection(...args),
}));

vi.mock("@/lib/patient-profile/layout-ux-toast", () => ({
  layoutUxToast: {
    error: (...args: unknown[]) => mockLayoutUxToastError(...args),
  },
}));

vi.mock("@/lib/patient-profile/telemetry", () => ({
  trackCockpitV3DragDrop: (...args: unknown[]) =>
    mockTrackCockpitV3DragDrop(...args),
}));

import CockpitDndContext from "../CockpitDndContext";

function renderContext(
  props: Partial<React.ComponentProps<typeof CockpitDndContext>> = {},
) {
  const onDrop = props.onDrop ?? vi.fn();
  const onReorder = props.onReorder ?? vi.fn();
  const onSwap = props.onSwap ?? vi.fn();
  render(
    <CockpitDndContext
      paneById={{
        rx: { id: "rx", title: "Rx", render: () => null },
        body: { id: "body", title: "Body", render: () => null },
      }}
      onDrop={onDrop}
      onReorder={onReorder}
      onSwap={onSwap}
      {...props}
    >
      <div data-testid="canvas" />
    </CockpitDndContext>,
  );
  return { onDrop, onReorder, onSwap };
}

function fireDragMove(event: DragMoveEvent) {
  const handler = dragMoveHandlers[dragMoveHandlers.length - 1];
  if (!handler) throw new Error("No onDragMove handler");
  act(() => {
    handler(event);
  });
}

function fireDragEnd(event: DragEndEvent) {
  const handler = dragEndHandlers[dragEndHandlers.length - 1];
  if (!handler) throw new Error("No onDragEnd handler");
  act(() => {
    handler(event);
  });
}

const bodyOver = {
  id: "drop-g2",
  data: { current: { groupId: "g2" } },
  rect: { top: 0, left: 0, width: 200, height: 200, bottom: 200, right: 200 },
};

describe("CockpitDndContext routing (cv3d-03)", () => {
  beforeEach(() => {
    dragEndHandlers.length = 0;
    dragMoveHandlers.length = 0;
    mockMovePane.mockReset();
    mockToastOnCapRejection.mockReset();
    mockLayoutUxToastError.mockReset();
    mockTrackCockpitV3DragDrop.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("move commits via onDrop with geometry-resolved zone", () => {
    const onDrop = vi.fn();
    renderContext({ onDrop });

    const moveEvent = {
      active: {
        id: "cockpit-v3-tab-g1-rx",
        data: { current: { paneId: "rx", groupId: "g1" } },
      },
      over: bodyOver,
      delta: { x: 160, y: 90 },
      activatorEvent: new MouseEvent("pointerdown", { clientX: 10, clientY: 10 }),
      collisions: null,
    } as DragMoveEvent;

    fireDragMove(moveEvent);
    fireDragEnd(moveEvent as unknown as DragEndEvent);

    expect(onDrop).toHaveBeenCalledOnce();
    expect(onDrop).toHaveBeenCalledWith({
      kind: "move",
      sourcePaneId: "rx",
      targetGroupId: "g2",
      zone: "east",
    });
  });

  it("body-centre drop routes swap via onSwap", () => {
    const onSwap = vi.fn();
    renderContext({ onSwap });

    const swapEvent = {
      active: {
        id: "cockpit-v3-tab-g1-rx",
        data: { current: { paneId: "rx", groupId: "g1" } },
      },
      over: bodyOver,
      // Pointer lands dead-centre of the 200×200 body (100,100).
      delta: { x: 90, y: 90 },
      activatorEvent: new MouseEvent("pointerdown", { clientX: 10, clientY: 10 }),
      collisions: null,
    } as DragMoveEvent;

    fireDragMove(swapEvent);
    fireDragEnd(swapEvent as unknown as DragEndEvent);

    expect(onSwap).toHaveBeenCalledOnce();
    expect(onSwap).toHaveBeenCalledWith({
      kind: "swap",
      sourceGroupId: "g1",
      targetGroupId: "g2",
      sourcePaneId: "rx",
    });
  });

  it("tab-bar drop routes center move", () => {
    const onDrop = vi.fn();
    renderContext({ onDrop });

    fireDragEnd({
      active: {
        id: "cockpit-v3-tab-g1-rx",
        data: { current: { paneId: "rx", groupId: "g1" } },
      },
      over: {
        id: "drop-tabbar-g2",
        data: { current: { groupId: "g2", overTabBar: true } },
        rect: { top: 0, left: 0, width: 200, height: 36 },
      },
      delta: { x: 0, y: 0 },
      activatorEvent: new MouseEvent("pointerdown"),
      collisions: null,
    } as DragEndEvent);

    expect(onDrop).toHaveBeenCalledWith(
      expect.objectContaining({ zone: "center", targetGroupId: "g2" }),
    );
  });

  it("same-group sibling tab routes reorder", () => {
    const onReorder = vi.fn();
    renderContext({ onReorder });

    fireDragEnd({
      active: {
        id: "cockpit-v3-tab-g1-rx",
        data: { current: { paneId: "rx", groupId: "g1" } },
      },
      over: {
        id: "cockpit-v3-tab-g1-chart",
        data: { current: { groupId: "g1", sortableTabId: "chart" } },
        rect: { top: 0, left: 0, width: 80, height: 28 },
      },
      delta: { x: 0, y: 0 },
      activatorEvent: new MouseEvent("pointerdown"),
      collisions: null,
    } as DragEndEvent);

    expect(onReorder).toHaveBeenCalledOnce();
    expect(onReorder).toHaveBeenCalledWith({
      kind: "reorder",
      groupId: "g1",
      sourcePaneId: "rx",
      overPaneId: "chart",
      place: "before",
    });
  });

  it("same-group sibling tab right-half drop routes reorder after", () => {
    const onReorder = vi.fn();
    renderContext({ onReorder });

    fireDragEnd({
      active: {
        id: "cockpit-v3-tab-g1-rx",
        data: { current: { paneId: "rx", groupId: "g1" } },
      },
      over: {
        id: "cockpit-v3-tab-g1-chart",
        data: {
          current: { groupId: "g1", sortableTabId: "chart", paneId: "chart" },
        },
        rect: { top: 0, left: 0, width: 80, height: 28 },
      },
      // Pointer starts at (0,0); delta lands in the right half of the 80px tab.
      delta: { x: 60, y: 0 },
      activatorEvent: new MouseEvent("pointerdown", { clientX: 0, clientY: 0 }),
      collisions: null,
    } as DragEndEvent);

    expect(onReorder).toHaveBeenCalledOnce();
    expect(onReorder).toHaveBeenCalledWith({
      kind: "reorder",
      groupId: "g1",
      sourcePaneId: "rx",
      overPaneId: "chart",
      place: "after",
    });
  });

  it("same-group trailing strip end routes reorder after last pane", () => {
    const onReorder = vi.fn();
    renderContext({ onReorder });

    fireDragEnd({
      active: {
        id: "cockpit-v3-tab-g1-rx",
        data: { current: { paneId: "rx", groupId: "g1" } },
      },
      over: {
        id: "cockpit-v3-tab-end-g1",
        data: {
          current: {
            groupId: "g1",
            tabStripEnd: true,
            lastPaneId: "chart",
          },
        },
        rect: { top: 0, left: 200, width: 120, height: 28 },
      },
      delta: { x: 220, y: 0 },
      activatorEvent: new MouseEvent("pointerdown", { clientX: 0, clientY: 0 }),
      collisions: null,
    } as DragEndEvent);

    expect(onReorder).toHaveBeenCalledOnce();
    expect(onReorder).toHaveBeenCalledWith({
      kind: "reorder",
      groupId: "g1",
      sourcePaneId: "rx",
      overPaneId: "chart",
      place: "after",
    });
  });

  it("allows body drop during live consult (no rearrange lock)", () => {
    mockMovePane.mockReturnValue({ ok: true });
    const handleDrop = (route: {
      sourcePaneId: string;
      targetGroupId: string;
      zone: string;
    }) => {
      const res = mockMovePane(route.sourcePaneId, route.targetGroupId, route.zone);
      mockToastOnCapRejection(res);
      if (res.ok) mockTrackCockpitV3DragDrop(route);
    };

    renderContext({ onDrop: handleDrop });

    fireDragEnd({
      active: {
        id: "cockpit-v3-tab-g1-body",
        data: { current: { paneId: "body", groupId: "g1" } },
      },
      over: bodyOver,
      delta: { x: 0, y: 0 },
      activatorEvent: new MouseEvent("pointerdown"),
      collisions: null,
    } as DragEndEvent);

    expect(mockLayoutUxToastError).not.toHaveBeenCalled();
    expect(mockMovePane).toHaveBeenCalled();
    expect(mockTrackCockpitV3DragDrop).toHaveBeenCalled();
  });

  it("cap rejection toasts and skips telemetry", () => {
    const handleDrop = (route: {
      sourcePaneId: string;
      targetGroupId: string;
      zone: string;
    }) => {
      const res = mockMovePane(
        route.sourcePaneId,
        route.targetGroupId,
        route.zone,
      );
      mockToastOnCapRejection(res);
      if (res.ok) mockTrackCockpitV3DragDrop(route);
    };

    mockMovePane.mockReturnValue({ ok: false, reason: "cap-reached" });
    renderContext({ onDrop: handleDrop });

    fireDragEnd({
      active: {
        id: "cockpit-v3-tab-g1-rx",
        data: { current: { paneId: "rx", groupId: "g1" } },
      },
      over: bodyOver,
      delta: { x: 0, y: 0 },
      activatorEvent: new MouseEvent("pointerdown"),
      collisions: null,
    } as DragEndEvent);

    expect(mockToastOnCapRejection).toHaveBeenCalledWith({
      ok: false,
      reason: "cap-reached",
    });
    expect(mockTrackCockpitV3DragDrop).not.toHaveBeenCalled();
  });

  it("successful move fires telemetry once", () => {
    const handleDrop = (route: {
      sourcePaneId: string;
      targetGroupId: string;
      zone: string;
    }) => {
      const res = mockMovePane(
        route.sourcePaneId,
        route.targetGroupId,
        route.zone,
      );
      mockToastOnCapRejection(res);
      if (res.ok) {
        mockTrackCockpitV3DragDrop({
          sourcePaneId: route.sourcePaneId,
          targetGroupId: route.targetGroupId,
          zone: route.zone,
        });
      }
    };

    mockMovePane.mockReturnValue({ ok: true });
    renderContext({ onDrop: handleDrop });

    fireDragEnd({
      active: {
        id: "cockpit-v3-tab-g1-rx",
        data: { current: { paneId: "rx", groupId: "g1" } },
      },
      over: {
        id: "drop-tabbar-g2",
        data: { current: { groupId: "g2", overTabBar: true } },
        rect: { top: 0, left: 0, width: 200, height: 36 },
      },
      delta: { x: 0, y: 0 },
      activatorEvent: new MouseEvent("pointerdown"),
      collisions: null,
    } as DragEndEvent);

    expect(mockTrackCockpitV3DragDrop).toHaveBeenCalledOnce();
    expect(mockTrackCockpitV3DragDrop).toHaveBeenCalledWith({
      sourcePaneId: "rx",
      targetGroupId: "g2",
      zone: "center",
    });
  });
});
