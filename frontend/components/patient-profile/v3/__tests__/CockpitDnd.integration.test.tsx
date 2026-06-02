/**
 * Cockpit v3 Phase 2 integration gate (cv3d-04).
 *
 * Persistence uses readPersistedLayout (cpf-04 remount hang avoided).
 * Targeted suites only — full npm test may hang on Shell.test.tsx.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  act,
  renderHook,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import fs from "node:fs";
import path from "node:path";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import CockpitV3Shell from "../CockpitV3Shell";
import PaneTabStripV3 from "../PaneTabStripV3";
import { cockpitV3Enabled } from "@/lib/patient-profile/v3/flags";
import {
  dropPaneIntoZone,
  paneTreeToFlat,
  serialiseTree,
  listTabsContainers,
  type PaneDefinition,
} from "@/lib/patient-profile/v3/foundation";
import { useCockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";
import { blankLayout, blankLayoutFlat } from "@/lib/patient-profile/v3/blankLayout";
import {
  readPersistedLayout,
  v4TreeLayoutStorageKey,
} from "@/lib/patient-profile/useShellLayout";
import { layoutUxToast } from "@/lib/patient-profile/layout-ux-toast";

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: vi.fn(() => true),
}));

vi.mock("@/lib/patient-profile/layout-ux-toast", () => ({
  layoutUxToast: { error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/patient-profile/telemetry", () => ({
  trackCockpitV3DragDrop: vi.fn(),
}));

vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({
    children,
    id,
  }: {
    children: React.ReactNode;
    id?: string;
  }) => (
    <div data-panel-group data-testid={id}>
      {children}
    </div>
  ),
  ResizablePanel: ({
    children,
    id,
  }: {
    children?: React.ReactNode;
    id?: string;
  }) => <div data-panel data-pane-id={id}>{children}</div>,
  ResizableHandle: () => <div data-separator role="separator" />,
}));

import { useMediaQuery } from "@/hooks/useMediaQuery";

const sortableCalls: Array<{ id: string; disabled?: boolean }> = [];

vi.mock("@dnd-kit/sortable", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/sortable")>();
  return {
    ...actual,
    useSortable: (config: { id: string; disabled?: boolean }) => {
      sortableCalls.push({ id: config.id, disabled: config.disabled });
      return {
        attributes: { "data-sortable-id": config.id },
        listeners: config.disabled ? {} : { "data-listener": "true" },
        setNodeRef: () => {},
        transform: null,
        transition: undefined,
        isDragging: false,
      };
    },
  };
});

function makePanes(ids: string[]): PaneDefinition[] {
  return ids.map((id) => ({
    id,
    title: id.toUpperCase(),
    render: () => <div data-testid={`pane-body-${id}`}>{id}</div>,
  }));
}

function makePaneById(ids: string[]): Record<string, PaneDefinition> {
  return Object.fromEntries(makePanes(ids).map((p) => [p.id, p]));
}

function SensorWrapper({ children }: { children: React.ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  return <DndContext sensors={sensors}>{children}</DndContext>;
}

async function flushLayoutWrite(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
}

describe("CockpitDnd integration (cv3d-04)", () => {
  beforeEach(() => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    localStorage.clear();
    sortableCalls.length = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it("flag on — desktop shell mounts palette + DndContext with sortable tabs", () => {
    render(
      <CockpitV3Shell
        panes={makePanes(["a", "b"])}
        storageKey="dnd-integration-flag-on"
      />,
    );

    expect(screen.getByTestId("p1-cockpit-v3-shell-desktop")).toBeInTheDocument();
    expect(screen.getByTestId("cockpit-v3-palette")).toBeInTheDocument();
    expect(screen.getByTestId("p2-cockpit-v3-dnd-context")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add A" }));
    fireEvent.click(screen.getByRole("button", { name: "Add B" }));

    expect(document.querySelectorAll("[data-sortable-id]").length).toBeGreaterThan(
      0,
    );
  });

  it("default-on — PatientProfilePage keeps both shell paths (cv3x-02)", () => {
    expect(cockpitV3Enabled()).toBe(true);

    const pagePath = path.resolve(__dirname, "../../PatientProfilePage.tsx");
    const source = fs.readFileSync(pagePath, "utf8");
    expect(source).toMatch(/cockpitV3Enabled\(\)\s*\?/);
    expect(source).toContain("PatientProfileShell");
    expect(source).toContain("CockpitV3Shell");
  });

  it("drag build-up persists across reload via useShellLayout (Phase 2 gate)", async () => {
    const STORAGE_KEY = "dnd-integration-persist";
    const panes = makePanes(["a", "b", "c"]);
    const blankDefault = blankLayout(panes);
    const defaultFlat = blankLayoutFlat(panes);
    const hookOpts = {
      storageKey: STORAGE_KEY,
      defaultPaneOrder: defaultFlat.paneOrder,
      defaultPaneState: defaultFlat.paneState,
      knownLeafIds: defaultFlat.paneOrder,
      blankDefaultTree: blankDefault.paneTree,
    };

    const { result } = renderHook(() => useCockpitV3Layout(hookOpts));

    act(() => {
      result.current.addPane("a");
      result.current.addPane("b");
      result.current.addPane("c");
    });

    act(() => {
      result.current.movePane("c", "b", "south");
    });

    const tabTarget = listTabsContainers(result.current.paneTree).find((c) =>
      c.paneIds.includes("b"),
    );
    expect(tabTarget).toBeDefined();

    act(() => {
      result.current.movePane("a", tabTarget!.id, "center");
    });

    const tabGroup = listTabsContainers(result.current.paneTree).find(
      (c) => c.paneIds.length > 1,
    );
    if (
      tabGroup &&
      tabGroup.paneIds.includes("a") &&
      tabGroup.paneIds.includes("b")
    ) {
      act(() => {
        result.current.reorderWithinGroup(tabGroup.id, "a", "b");
      });
    }

    const expectedSerialized = serialiseTree(result.current.paneTree);
    await flushLayoutWrite();

    const reloaded = readPersistedLayout(STORAGE_KEY);
    expect(reloaded).not.toBeNull();
    expect(serialiseTree(reloaded!.paneTree)).toBe(expectedSerialized);
    expect(localStorage.getItem(v4TreeLayoutStorageKey(STORAGE_KEY))).not.toBeNull();
  });

  it("accidental micro-drag — click activates tab; 8px activation in DndContext", () => {
    const onActivateTab = vi.fn();

    render(
      <SensorWrapper>
        <SortableContext
          items={["chart", "body"]}
          strategy={horizontalListSortingStrategy}
        >
          <PaneTabStripV3
            groupId="leaf-1"
            paneIds={["chart", "body"]}
            activeTabId="chart"
            paneById={makePaneById(["chart", "body"])}
            onActivateTab={onActivateTab}
          />
        </SortableContext>
      </SensorWrapper>,
    );

    fireEvent.click(screen.getByRole("tab", { name: /BODY/i }));
    expect(onActivateTab).toHaveBeenCalledWith("body");

    const dndSource = fs.readFileSync(
      path.resolve(__dirname, "../CockpitDndContext.tsx"),
      "utf8",
    );
    expect(dndSource).toMatch(/activationConstraint:\s*\{\s*distance:\s*8\s*\}/);
  });

  it("guard — consultActive disables body tab drag source", () => {
    render(
      <CockpitV3Shell
        panes={makePanes(["chart", "body"])}
        storageKey="dnd-integration-guard"
        consultActive
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add CHART" }));
    fireEvent.click(screen.getByRole("button", { name: "Add BODY" }));

    const bodySortable = sortableCalls.find((c) => c.id.includes("-body"));
    expect(bodySortable?.disabled).toBe(true);

    const chartSortable = sortableCalls.find((c) => c.id.includes("-chart"));
    expect(chartSortable?.disabled).toBe(false);
  });

  it("guard — shell wires live-consult refusal toast string", () => {
    const shellSource = fs.readFileSync(
      path.resolve(__dirname, "../CockpitV3Shell.tsx"),
      "utf8",
    );
    expect(shellSource).toContain("Pause the consult before rearranging.");
    expect(vi.mocked(layoutUxToast.error)).not.toHaveBeenCalled();
  });

  it("dock anchoring — safety and action docks outside DndContext; footer fires", () => {
    const onAction = vi.fn();
    render(
      <CockpitV3Shell
        panes={makePanes(["a", "b", "c"])}
        storageKey="dnd-integration-docks"
        safetyDock={<div data-testid="dock-safety" />}
        actionDock={
          <button type="button" data-testid="dock-action" onClick={onAction}>
            Send
          </button>
        }
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add A" }));
    fireEvent.click(screen.getByRole("button", { name: "Add B" }));
    fireEvent.click(screen.getByRole("button", { name: "Add C" }));

    const desktop = screen.getByTestId("p1-cockpit-v3-shell-desktop");
    expect(desktop).toContainElement(screen.getByTestId("dock-safety"));
    expect(desktop).toContainElement(screen.getByTestId("dock-action"));

    const dndEl = screen.getByTestId("p2-cockpit-v3-dnd-context");
    expect(dndEl).toBeInTheDocument();
    expect(dndEl).not.toContainElement(screen.getByTestId("dock-safety"));
    expect(dndEl).not.toContainElement(screen.getByTestId("dock-action"));

    fireEvent.click(screen.getByTestId("dock-action"));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("mobile — flat fallback without DndContext, overlay, or sortable tabs", () => {
    vi.mocked(useMediaQuery).mockReturnValue(false);

    render(
      <CockpitV3Shell
        panes={makePanes(["a", "b"])}
        storageKey="dnd-integration-mobile"
        safetyDock={<div data-testid="dock-safety" />}
      />,
    );

    expect(screen.getByTestId("p1-cockpit-v3-shell-mobile")).toBeInTheDocument();
    expect(document.querySelector("[data-testid='p2-cockpit-v3-dnd-context']")).toBeNull();
    expect(document.querySelector("[data-cockpit-drop-overlay]")).toBeNull();
    expect(document.querySelector("[data-sortable-id]")).toBeNull();
    expect(screen.queryByTestId("cockpit-v3-palette")).not.toBeInTheDocument();
  });

  it("no PaneDropOverlay import anywhere under v3/", () => {
    const v3Dir = path.resolve(__dirname, "..");
    const files = fs.readdirSync(v3Dir).filter((f) => f.endsWith(".tsx"));
    for (const file of files) {
      const source = fs.readFileSync(path.join(v3Dir, file), "utf8");
      expect(source).not.toMatch(/PaneDropOverlay/);
    }
  });

  it("drop build-up tree matches direct dropPaneIntoZone for split", () => {
    const panes = makePanes(["a", "b", "c"]);
    const blankDefault = blankLayout(panes);
    const defaultFlat = blankLayoutFlat(panes);

    const { result } = renderHook(() =>
      useCockpitV3Layout({
        storageKey: "dnd-truth-table",
        defaultPaneOrder: defaultFlat.paneOrder,
        defaultPaneState: defaultFlat.paneState,
        knownLeafIds: defaultFlat.paneOrder,
        blankDefaultTree: blankDefault.paneTree,
      }),
    );

    act(() => {
      result.current.addPane("a");
      result.current.addPane("b");
      result.current.addPane("c");
    });

    const base = result.current.paneTree;
    const splitEngine = dropPaneIntoZone(base, "c", "b", "south");
    expect(splitEngine.ok).toBe(true);

    act(() => {
      result.current.movePane("c", "b", "south");
    });

    expect(paneTreeToFlat(result.current.paneTree)).toEqual(
      paneTreeToFlat(splitEngine.ok ? splitEngine.tree! : base),
    );
  });
});
