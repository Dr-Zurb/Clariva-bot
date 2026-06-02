/**
 * Shell drag-drop wiring (cpfd-03) — focused unit tests (Vitest + RTL).
 *
 * Avoids full `useShellLayout` hydration (known Vitest hang — cpf-04 follow-up)
 * by mocking the hook with `hydrated: true`. Exercises routing, overlay mount,
 * DragOverlay preview, and live-consult grip disable.
 */

import React, { useEffect } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Stethoscope } from "lucide-react";
import { flatToPaneTree } from "@/lib/patient-profile/layout-tree";
import type { DragEndEvent } from "@dnd-kit/core";

// ---------------------------------------------------------------------------
// Mocks — must be set up BEFORE importing the component under test.
// ---------------------------------------------------------------------------

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: vi.fn(() => true),
}));

const mockReorderPane = vi.fn();
const mockOnDropPaneOnZone = vi.fn();

const defaultFlat = {
  paneOrder: ["chart", "body", "rx"],
  paneState: {
    chart: { sizePct: 33, hidden: false },
    body: { sizePct: 34, hidden: false },
    rx: { sizePct: 33, hidden: false },
  },
};

vi.mock("@/lib/patient-profile/useShellLayout", () => ({
  defaultLayout: () => ({
    version: 5,
    paneTree: flatToPaneTree(defaultFlat),
  }),
  useShellLayout: () => ({
    ...defaultFlat,
    paneTree: flatToPaneTree(defaultFlat),
    reorderPane: mockReorderPane,
    setPaneHidden: vi.fn(),
    setLeafSize: vi.fn(),
    applyLayout: vi.fn(),
    resetLayout: vi.fn(),
    setLeafIdsHidden: vi.fn(),
    layoutVersion: 0,
    hydrated: true,
    setActiveTab: vi.fn(),
  }),
}));

vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({
    children,
    id,
  }: {
    children: React.ReactNode;
    id?: string;
  }) => (
    <div data-panel-group data-group-id={id}>
      {children}
    </div>
  ),
  ResizablePanel: ({
    children,
    id,
    "data-pane-id": dataPaneId,
  }: {
    children?: React.ReactNode;
    id?: string;
    "data-pane-id"?: string;
  }) => (
    <div data-panel data-pane-id={dataPaneId ?? id}>
      {children}
    </div>
  ),
  ResizableHandle: () => <div data-separator role="separator" />,
}));

let mockActiveDrag: unknown = null;
const dragEndHandlers: Array<(event: unknown) => void> = [];
const dragStartHandlers: Array<(event: unknown) => void> = [];

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
      onDragStart,
    }: {
      children: React.ReactNode;
      onDragEnd?: (event: unknown) => void;
      onDragStart?: (event: unknown) => void;
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
    useDndContext: () => ({ active: mockActiveDrag }),
    useDraggable: ({
      id,
      disabled,
    }: {
      id: string;
      disabled?: boolean;
    }) => ({
      attributes: { "data-draggable-id": id, "data-drag-disabled": disabled },
      listeners: disabled ? {} : { "data-listener": "true" },
      setNodeRef: () => {},
      isDragging: mockActiveDrag === id,
    }),
    useDroppable: () => ({
      setNodeRef: () => {},
      isOver: false,
    }),
    DragOverlay: ({ children }: { children: React.ReactNode }) => (
      <div data-drag-overlay>{children}</div>
    ),
  };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import PatientProfileShell, {
  routePaneDropFromDragEnd,
} from "../Shell";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { PaneDefinition } from "@/lib/patient-profile/types";
import {
  RxFormActionsBridgeProvider,
  useRegisterRxFormActions,
} from "@/components/cockpit/rx/RxFormActionsContext";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { PlanActionFooter } from "@/components/cockpit/middle/PlanActionFooter";

vi.mock("@/components/cockpit/rx/SaveStatusPill", () => ({
  SaveStatusPill: () => <span role="status">Saved</span>,
}));

function RxActionsRegistrar() {
  const register = useRegisterRxFormActions();
  useEffect(() => {
    register({
      sendAndFinish: vi.fn(),
      sending: false,
      finishSending: false,
      canSend: true,
    });
    return () => register(null);
  }, [register]);
  return <div data-testid="rx-actions-registrar" />;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePanes(): PaneDefinition[] {
  return [
    {
      id: "chart",
      title: "Patient chart",
      render: () => <div data-testid="pane-chart-body">chart</div>,
      icon: Stethoscope,
      naturalSizePct: 33,
    },
    {
      id: "body",
      title: "Consultation",
      render: () => <div data-testid="pane-body-body">body</div>,
      naturalSizePct: 34,
    },
    {
      id: "rx",
      title: "Prescription",
      render: () => <div data-testid="pane-rx-body">rx</div>,
      naturalSizePct: 33,
    },
  ];
}

function renderShell(
  paneMoveUx?: React.ComponentProps<typeof PatientProfileShell>["paneMoveUx"],
  customizeMode = true,
) {
  return render(
    <PatientProfileShell
      panes={makePanes()}
      storageKey="test:shell-dnd"
      paneMoveUx={paneMoveUx}
      customizeMode={customizeMode}
    />,
  );
}

function fireDragEnd(event: DragEndEvent) {
  const handler = dragEndHandlers[dragEndHandlers.length - 1];
  if (!handler) throw new Error("No DndContext onDragEnd handler captured");
  handler(event);
}

function fireDragStart(paneId: string) {
  const handler = dragStartHandlers[dragStartHandlers.length - 1];
  if (!handler) throw new Error("No DndContext onDragStart handler captured");
  handler({
    active: { id: `pane-drag-${paneId}`, data: { current: { paneId } } },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("routePaneDropFromDragEnd (cpfd-03)", () => {
  it("returns null when over is missing", () => {
    expect(
      routePaneDropFromDragEnd({
        active: {
          id: "pane-drag-body",
          data: { current: { paneId: "body" } },
        },
        over: null,
      } as DragEndEvent),
    ).toBeNull();
  });

  it("a center drop routes zone 'center'; an east drop routes 'east'", () => {
    expect(
      routePaneDropFromDragEnd({
        active: {
          id: "pane-drag-rx",
          data: { current: { paneId: "rx" } },
        },
        over: {
          id: "drop-body-center",
          data: { current: { groupId: "body", zone: "center" } },
        },
      } as DragEndEvent),
    ).toEqual({ sourcePaneId: "rx", groupId: "body", zone: "center" });

    expect(
      routePaneDropFromDragEnd({
        active: {
          id: "pane-drag-rx",
          data: { current: { paneId: "rx" } },
        },
        over: {
          id: "drop-chart-east",
          data: { current: { groupId: "chart", zone: "east" } },
        },
      } as DragEndEvent),
    ).toEqual({ sourcePaneId: "rx", groupId: "chart", zone: "east" });
  });
});

describe("<Shell> drag-drop wiring (cpfd-03)", () => {
  beforeEach(() => {
    mockActiveDrag = null;
    mockReorderPane.mockClear();
    mockOnDropPaneOnZone.mockClear();
    dragEndHandlers.length = 0;
    dragStartHandlers.length = 0;
    vi.mocked(useMediaQuery).mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders <PaneDropOverlay> on each visible leaf only while a drag is active", () => {
    renderShell({
      getMoveTargets: () => [],
      onMovePane: vi.fn(),
      getMoveDisabled: () => undefined,
      onDropPaneOnZone: mockOnDropPaneOnZone,
    });

    expect(document.querySelector("[data-pane-drop-overlay]")).toBeNull();

    cleanup();
    mockActiveDrag = { id: "pane-drag-body" };
    renderShell({
      getMoveTargets: () => [],
      onMovePane: vi.fn(),
      getMoveDisabled: () => undefined,
      onDropPaneOnZone: mockOnDropPaneOnZone,
    });

    expect(document.querySelectorAll("[data-pane-drop-overlay]").length).toBe(3);
  });

  it("handleDragEnd calls onDropPaneOnZone with (sourcePaneId, groupId, zone) from over.data", async () => {
    renderShell({
      getMoveTargets: () => [],
      onMovePane: vi.fn(),
      getMoveDisabled: () => undefined,
      onDropPaneOnZone: mockOnDropPaneOnZone,
    });

    await act(async () => {
      fireDragEnd({
        active: {
          id: "pane-drag-rx",
          data: { current: { paneId: "rx" } },
        },
        over: {
          id: "drop-body-west",
          data: { current: { groupId: "body", zone: "west" } },
        },
      } as DragEndEvent);
    });

    expect(mockOnDropPaneOnZone).toHaveBeenCalledOnce();
    expect(mockOnDropPaneOnZone).toHaveBeenCalledWith("rx", "body", "west");
  });

  it("handleDragEnd no longer calls reorderPane", async () => {
    renderShell({
      getMoveTargets: () => [],
      onMovePane: vi.fn(),
      getMoveDisabled: () => undefined,
      onDropPaneOnZone: mockOnDropPaneOnZone,
    });

    await act(async () => {
      fireDragEnd({
        active: {
          id: "pane-drag-body",
          data: { current: { paneId: "body" } },
        },
        over: {
          id: "pane-drop-rx",
          data: { current: { paneId: "rx" } },
        },
      } as DragEndEvent);
    });

    expect(mockReorderPane).not.toHaveBeenCalled();
    expect(mockOnDropPaneOnZone).not.toHaveBeenCalled();
  });

  it("<DragOverlay> shows the dragged pane's title while dragging", () => {
    renderShell({
      getMoveTargets: () => [],
      onMovePane: vi.fn(),
      getMoveDisabled: () => undefined,
      onDropPaneOnZone: mockOnDropPaneOnZone,
    });

    act(() => {
      fireDragStart("body");
    });

    const overlay = document.querySelector("[data-drag-overlay]");
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveTextContent("Consultation");
  });

  it("the body grip is disabled when canDropSource('body') is false (live guard)", () => {
    renderShell({
      getMoveTargets: () => [],
      onMovePane: vi.fn(),
      getMoveDisabled: () => undefined,
      onDropPaneOnZone: mockOnDropPaneOnZone,
      canDropSource: (sourcePaneId) => sourcePaneId !== "body",
    });

    const bodyGrip = document.querySelector('[data-draggable-id="pane-drag-body"]');
    expect(bodyGrip).toBeNull();
    expect(
      screen.queryByRole("button", { name: /drag to reorder consultation/i }),
    ).toBeNull();
  });

  it("renders no overlay / no drag sources on the mobile branch (DL-7)", () => {
    vi.mocked(useMediaQuery).mockReturnValue(false);

    renderShell({
      getMoveTargets: () => [],
      onMovePane: vi.fn(),
      getMoveDisabled: () => undefined,
      onDropPaneOnZone: mockOnDropPaneOnZone,
    });

    expect(
      screen.getByTestId("patient-profile-shell-mobile"),
    ).toBeInTheDocument();
    expect(document.querySelector("[data-dnd-context]")).toBeNull();
    expect(document.querySelector("[data-pane-drop-overlay]")).toBeNull();
    expect(document.querySelector("[data-draggable-id]")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// cpfg-01 — shell-level action chrome docks
// ---------------------------------------------------------------------------

describe("<Shell> cpfg-01 action chrome docks", () => {
  beforeEach(() => {
    mockActiveDrag = null;
    dragEndHandlers.length = 0;
    dragStartHandlers.length = 0;
    vi.mocked(useMediaQuery).mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders safetyDock and actionDock outside DndContext on desktop", () => {
    render(
      <PatientProfileShell
        panes={makePanes()}
        storageKey="test:shell-dnd-docks"
        safetyDock={<div data-testid="dock-safety" />}
        actionDock={<div data-testid="dock-action" />}
      />,
    );

    const safety = screen.getByTestId("dock-safety");
    const action = screen.getByTestId("dock-action");
    expect(safety).toBeInTheDocument();
    expect(action).toBeInTheDocument();

    const shell = screen.getByTestId("patient-profile-shell-desktop");
    const shellChildren = Array.from(shell.children);
    expect(shellChildren[0]).toContainElement(safety);
    expect(shellChildren[shellChildren.length - 1]).toContainElement(action);

    const dnd = document.querySelector("[data-dnd-context]");
    expect(dnd).not.toBeNull();
    expect(dnd).not.toContainElement(safety);
    expect(dnd).not.toContainElement(action);
  });

  it("does not render shell docks on mobile (DL-7)", () => {
    vi.mocked(useMediaQuery).mockReturnValue(false);

    render(
      <PatientProfileShell
        panes={makePanes()}
        storageKey="test:shell-dnd-docks-mobile"
        safetyDock={<div data-testid="dock-safety" />}
        actionDock={<div data-testid="dock-action" />}
      />,
    );

    expect(
      screen.getByTestId("patient-profile-shell-mobile"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("dock-safety")).toBeNull();
    expect(screen.queryByTestId("dock-action")).toBeNull();
  });

  it("actionDock footer reads send handlers registered elsewhere in the tree", () => {
    const prescriptionIdRef = { current: null as string | null };
    const panes: PaneDefinition[] = [
      {
        id: "rx",
        title: "Prescription",
        render: () => <RxActionsRegistrar />,
        naturalSizePct: 100,
      },
    ];

    render(
      <RxFormProvider
        appointmentId="appt-1"
        patientId="pat-1"
        token="test-token"
        entryMode="structured"
        initialFields={createEmptyRxFormFields()}
        autosaveEnabled={false}
        prescriptionIdRef={prescriptionIdRef}
        onPrescriptionCreated={() => {}}
      >
        <RxFormActionsBridgeProvider>
          <PatientProfileShell
            panes={panes}
            storageKey="test:shell-dnd-provider"
            actionDock={<PlanActionFooter state="live" finishBusy={false} />}
          />
        </RxFormActionsBridgeProvider>
      </RxFormProvider>,
    );

    expect(
      screen.getByRole("button", { name: /send rx & finish/i }),
    ).toBeInTheDocument();
  });
});
