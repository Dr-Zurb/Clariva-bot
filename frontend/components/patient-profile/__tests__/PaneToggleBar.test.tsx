/**
 * `<PaneToggleBar>` — unit tests (Vitest + RTL).
 *
 * Covers the public contract from ppr-15b:
 *   1. Renders one button per pane in `paneOrder`.
 *   2. `aria-pressed=true` for visible, `false` for hidden panes.
 *   3. Click on a visible pane fires `onToggleHidden(paneId)`.
 *   4. Click on a hidden pane fires `onToggleHidden(paneId)`.
 *   5. `onBeforeHide` returning `false` cancels the toggle.
 *   6. `onBeforeHide` is NOT called when toggling FROM hidden TO visible.
 *   7. Drag end fires `onReorder(fromId, toId)`.
 *   8. Buttons render in `paneOrder` order, not `panes` array order.
 *   9. Icon falls back gracefully when `pane.icon` is undefined.
 *
 * @dnd-kit/core is partially mocked: we capture the `onDragEnd` callback
 * off `<DndContext>` and invoke it directly with a synthetic `DragEndEvent`.
 * Mirrors the same pattern used in Shell.test.tsx.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Stethoscope, FileText, LayoutGrid } from "lucide-react";

// ---------------------------------------------------------------------------
// Mocks — must be set up BEFORE importing the component under test.
// ---------------------------------------------------------------------------

// Capture @dnd-kit's onDragEnd so tests can fire synthetic drag-end events.
const dragEndHandlers: Array<(event: unknown) => void> = [];

vi.mock("@dnd-kit/core", () => {
  const DndContext = ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd?: (event: unknown) => void;
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
    return <div data-dnd-context>{children}</div>;
  };

  const useDraggable = ({
    id,
    data,
  }: {
    id: string;
    data?: { paneId: string };
  }) => ({
    attributes: { "data-draggable-id": id },
    listeners: {},
    setNodeRef: () => {},
    isDragging: false,
    data: { current: data },
  });

  const useDroppable = ({
    id,
    data,
  }: {
    id: string;
    data?: { paneId: string };
  }) => ({
    setNodeRef: () => {},
    isOver: false,
    data: { current: data },
  });

  const PointerSensor = vi.fn();
  const useSensor = (s: unknown) => s;
  const useSensors = (...s: unknown[]) => s;

  return {
    __esModule: true,
    DndContext,
    PointerSensor,
    useSensor,
    useSensors,
    useDraggable,
    useDroppable,
  };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import PaneToggleBar from "../PaneToggleBar";
import type { PaneDefinition, PaneRuntimeState } from "@/lib/patient-profile/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePanes(): PaneDefinition[] {
  return [
    {
      id: "chart",
      title: "Patient chart",
      render: () => <div>chart</div>,
      icon: Stethoscope,
    },
    {
      id: "body",
      title: "Consultation",
      render: () => <div>body</div>,
      icon: FileText,
    },
    {
      id: "rx",
      title: "Prescription",
      render: () => <div>rx</div>,
      icon: LayoutGrid,
    },
  ];
}

function makeState(
  overrides: Partial<Record<string, Partial<PaneRuntimeState>>> = {},
): Record<string, PaneRuntimeState> {
  const base: Record<string, PaneRuntimeState> = {
    chart: { sizePct: 33, hidden: false },
    body: { sizePct: 34, hidden: false },
    rx: { sizePct: 33, hidden: false },
  };
  for (const [id, patch] of Object.entries(overrides)) {
    base[id] = { ...base[id], ...patch };
  }
  return base;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fire a synthetic drag-end event on the most recently registered DndContext. */
function fireDragEnd(fromPaneId: string, toPaneId: string) {
  const handler = dragEndHandlers[dragEndHandlers.length - 1];
  if (!handler) throw new Error("No DndContext onDragEnd handler captured");
  handler({
    active: { id: `toggle-drag-${fromPaneId}`, data: { current: { paneId: fromPaneId } } },
    over: { id: `toggle-drop-${toPaneId}`, data: { current: { paneId: toPaneId } } },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("<PaneToggleBar>", () => {
  beforeEach(() => {
    cleanup();
    dragEndHandlers.length = 0;
  });

  // ── 1 ─────────────────────────────────────────────────────────────────────
  it("renders one button per pane in paneOrder", () => {
    const panes = makePanes();
    const paneOrder = ["chart", "body", "rx"];

    render(
      <PaneToggleBar
        panes={panes}
        paneOrder={paneOrder}
        paneState={makeState()}
        onToggleHidden={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
  });

  // ── 2 ─────────────────────────────────────────────────────────────────────
  it("sets aria-pressed=true for visible panes and false for hidden panes", () => {
    const panes = makePanes();
    const paneOrder = ["chart", "body", "rx"];
    const paneState = makeState({ rx: { sizePct: 33, hidden: true } });

    render(
      <PaneToggleBar
        panes={panes}
        paneOrder={paneOrder}
        paneState={paneState}
        onToggleHidden={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    // chart + body are visible → aria-pressed=true
    const chartBtn = screen.getByRole("button", { name: /hide patient chart/i });
    const bodyBtn = screen.getByRole("button", { name: /hide consultation/i });
    // rx is hidden → aria-pressed=false
    const rxBtn = screen.getByRole("button", { name: /show prescription/i });

    expect(chartBtn).toHaveAttribute("aria-pressed", "true");
    expect(bodyBtn).toHaveAttribute("aria-pressed", "true");
    expect(rxBtn).toHaveAttribute("aria-pressed", "false");
  });

  // ── 3 ─────────────────────────────────────────────────────────────────────
  it("calls onToggleHidden with the correct paneId when clicking a visible pane", () => {
    const panes = makePanes();
    const paneOrder = ["chart", "body", "rx"];
    const onToggleHidden = vi.fn();

    render(
      <PaneToggleBar
        panes={panes}
        paneOrder={paneOrder}
        paneState={makeState()}
        onToggleHidden={onToggleHidden}
        onReorder={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /hide consultation/i }));
    expect(onToggleHidden).toHaveBeenCalledOnce();
    expect(onToggleHidden).toHaveBeenCalledWith("body");
  });

  // ── 4 ─────────────────────────────────────────────────────────────────────
  it("calls onToggleHidden with the correct paneId when clicking a hidden pane", () => {
    const panes = makePanes();
    const paneOrder = ["chart", "body", "rx"];
    const paneState = makeState({ body: { sizePct: 34, hidden: true } });
    const onToggleHidden = vi.fn();

    render(
      <PaneToggleBar
        panes={panes}
        paneOrder={paneOrder}
        paneState={paneState}
        onToggleHidden={onToggleHidden}
        onReorder={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /show consultation/i }));
    expect(onToggleHidden).toHaveBeenCalledOnce();
    expect(onToggleHidden).toHaveBeenCalledWith("body");
  });

  // ── 5 ─────────────────────────────────────────────────────────────────────
  it("cancels the toggle when onBeforeHide returns false (visible → hidden path)", () => {
    const panes = makePanes();
    const paneOrder = ["chart", "body", "rx"];
    const onToggleHidden = vi.fn();
    const onBeforeHide = vi.fn().mockReturnValue(false);

    render(
      <PaneToggleBar
        panes={panes}
        paneOrder={paneOrder}
        paneState={makeState()}
        onToggleHidden={onToggleHidden}
        onReorder={vi.fn()}
        onBeforeHide={onBeforeHide}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /hide consultation/i }));

    expect(onBeforeHide).toHaveBeenCalledOnce();
    expect(onBeforeHide).toHaveBeenCalledWith("body");
    // Toggle must be cancelled.
    expect(onToggleHidden).not.toHaveBeenCalled();
  });

  // ── 6 ─────────────────────────────────────────────────────────────────────
  it("does NOT call onBeforeHide when toggling from hidden to visible", () => {
    const panes = makePanes();
    const paneOrder = ["chart", "body", "rx"];
    const paneState = makeState({ body: { sizePct: 34, hidden: true } });
    const onToggleHidden = vi.fn();
    const onBeforeHide = vi.fn().mockReturnValue(false);

    render(
      <PaneToggleBar
        panes={panes}
        paneOrder={paneOrder}
        paneState={paneState}
        onToggleHidden={onToggleHidden}
        onReorder={vi.fn()}
        onBeforeHide={onBeforeHide}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /show consultation/i }));

    // onBeforeHide must NOT be consulted for the show direction.
    expect(onBeforeHide).not.toHaveBeenCalled();
    // Toggle proceeds.
    expect(onToggleHidden).toHaveBeenCalledOnce();
    expect(onToggleHidden).toHaveBeenCalledWith("body");
  });

  // ── 7 ─────────────────────────────────────────────────────────────────────
  it("fires onReorder(fromId, toId) when a drag-end has mismatched pane ids", () => {
    const panes = makePanes();
    const paneOrder = ["chart", "body", "rx"];
    const onReorder = vi.fn();

    render(
      <PaneToggleBar
        panes={panes}
        paneOrder={paneOrder}
        paneState={makeState()}
        onToggleHidden={vi.fn()}
        onReorder={onReorder}
      />,
    );

    fireDragEnd("chart", "rx");

    expect(onReorder).toHaveBeenCalledOnce();
    expect(onReorder).toHaveBeenCalledWith("chart", "rx");
  });

  it("does NOT fire onReorder when drag-end has the same fromId and toId", () => {
    const panes = makePanes();
    const paneOrder = ["chart", "body", "rx"];
    const onReorder = vi.fn();

    render(
      <PaneToggleBar
        panes={panes}
        paneOrder={paneOrder}
        paneState={makeState()}
        onToggleHidden={vi.fn()}
        onReorder={onReorder}
      />,
    );

    fireDragEnd("chart", "chart");

    expect(onReorder).not.toHaveBeenCalled();
  });

  // ── 8 ─────────────────────────────────────────────────────────────────────
  it("renders buttons in paneOrder order, NOT in panes array order", () => {
    // panes array order: chart → body → rx
    const panes = makePanes();
    // paneOrder: rx → body → chart
    const paneOrder = ["rx", "body", "chart"];

    render(
      <PaneToggleBar
        panes={panes}
        paneOrder={paneOrder}
        paneState={makeState()}
        onToggleHidden={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole("button");
    // Extract aria-labels to determine rendered order.
    const labels = buttons.map((b) => b.getAttribute("aria-label"));
    expect(labels[0]).toMatch(/prescription/i);
    expect(labels[1]).toMatch(/consultation/i);
    expect(labels[2]).toMatch(/patient chart/i);
  });

  // ── 9 ─────────────────────────────────────────────────────────────────────
  it("renders a fallback icon (no crash) when pane.icon is undefined", () => {
    const panes: PaneDefinition[] = [
      {
        id: "chart",
        title: "Patient chart",
        render: () => <div>chart</div>,
        // icon intentionally omitted
      },
    ];
    const paneOrder = ["chart"];

    expect(() =>
      render(
        <PaneToggleBar
          panes={panes}
          paneOrder={paneOrder}
          paneState={{ chart: { sizePct: 33, hidden: false } }}
          onToggleHidden={vi.fn()}
          onReorder={vi.fn()}
        />,
      ),
    ).not.toThrow();

    // Button should still render with the fallback icon (LayoutGrid) present.
    const button = screen.getByRole("button", { name: /hide patient chart/i });
    expect(button).toBeInTheDocument();
    // The fallback icon renders as an SVG inside the button.
    expect(button.querySelector("svg")).toBeInTheDocument();
  });

  // ── 10 — column grouping (layout-ux-01) ───────────────────────────────────
  it("renders column toggle buttons when columnPanes is supplied", () => {
    const columnPanes: PaneDefinition[] = [
      {
        id: "left-column",
        title: "Patient",
        render: () => null,
        children: [
          { id: "chart", title: "Patient chart", render: () => null, icon: Stethoscope },
        ],
      },
    ];
    const panes = makePanes();
    const paneOrder = ["chart", "body", "rx"];

    render(
      <PaneToggleBar
        panes={panes}
        columnPanes={columnPanes}
        paneOrder={paneOrder}
        paneState={makeState()}
        onToggleHidden={vi.fn()}
        onToggleColumn={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /hide patient column/i }),
    ).toBeInTheDocument();
  });

  it("fires onToggleColumn with the column id", () => {
    const columnPanes: PaneDefinition[] = [
      {
        id: "left-column",
        title: "Patient",
        render: () => null,
        children: [
          { id: "chart", title: "Patient chart", render: () => null, icon: Stethoscope },
        ],
      },
    ];
    const onToggleColumn = vi.fn();

    render(
      <PaneToggleBar
        panes={makePanes()}
        columnPanes={columnPanes}
        paneOrder={["chart", "body", "rx"]}
        paneState={makeState()}
        onToggleHidden={vi.fn()}
        onToggleColumn={onToggleColumn}
        onReorder={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /hide patient column/i }),
    );
    expect(onToggleColumn).toHaveBeenCalledWith("left-column");
  });
});
