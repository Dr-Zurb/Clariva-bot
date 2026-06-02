/**
 * `<CockpitDropOverlay>` + `<TabBarDroppable>` — unit tests (cv3d-02).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import fs from "node:fs";
import path from "node:path";
import type { DropZone } from "@/lib/patient-profile/v3/foundation";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockActiveDragPaneId: string | null = null;
let mockPendingDrop: { groupId: string; zone: DropZone } | null = null;

type DroppableConfig = {
  id: string;
  data?: { groupId: string; overTabBar?: boolean };
  disabled?: boolean;
};

const droppableConfigs: DroppableConfig[] = [];

vi.mock("../CockpitDndContext", () => ({
  useCockpitDndState: () => ({
    activeDragPaneId: mockActiveDragPaneId,
    pendingDrop: mockPendingDrop,
  }),
}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div data-dnd-context>{children}</div>
  ),
  useDroppable: (config: DroppableConfig) => {
    droppableConfigs.push(config);
    return {
      setNodeRef: () => {},
      isOver: false,
    };
  },
}));

import CockpitDropOverlay, { TabBarDroppable } from "../CockpitDropOverlay";

const GROUP_ID = "leaf-group-1";

function renderOverlay() {
  return render(
    <div className="relative h-64 w-96">
      <CockpitDropOverlay groupId={GROUP_ID} />
    </div>,
  );
}

function renderTabBar(children: React.ReactNode = <div data-testid="tab-strip" />) {
  return render(<TabBarDroppable groupId={GROUP_ID}>{children}</TabBarDroppable>);
}

describe("<CockpitDropOverlay> (cv3d-02)", () => {
  beforeEach(() => {
    mockActiveDragPaneId = null;
    mockPendingDrop = null;
    droppableConfigs.length = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it("hidden when no active drag", () => {
    renderOverlay();
    expect(document.querySelector("[data-cockpit-drop-overlay]")).toBeNull();
  });

  it("registers one body droppable per group during drag", () => {
    mockActiveDragPaneId = "chart";
    renderOverlay();
    expect(droppableConfigs).toHaveLength(1);
    expect(droppableConfigs[0]).toMatchObject({
      id: `drop-${GROUP_ID}`,
      data: { groupId: GROUP_ID },
      disabled: false,
    });
  });

  it("shows exactly one preview for the resolved body half", () => {
    mockActiveDragPaneId = "chart";
    mockPendingDrop = { groupId: GROUP_ID, zone: "east" };
    renderOverlay();

    const previews = document.querySelectorAll("[data-cockpit-drop-preview]");
    expect(previews).toHaveLength(1);
    expect(previews[0]).toHaveAttribute("data-cockpit-drop-zone", "east");
    expect(previews[0]).toHaveClass("right-0");
  });

  it("swaps preview region when pending zone changes", () => {
    mockActiveDragPaneId = "chart";
    mockPendingDrop = { groupId: GROUP_ID, zone: "west" };
    const { rerender } = renderOverlay();
    expect(document.querySelector("[data-cockpit-drop-zone='west']")).toBeInTheDocument();

    mockPendingDrop = { groupId: GROUP_ID, zone: "north" };
    rerender(
      <div className="relative h-64 w-96">
        <CockpitDropOverlay groupId={GROUP_ID} />
      </div>,
    );
    expect(document.querySelectorAll("[data-cockpit-drop-preview]")).toHaveLength(1);
    expect(document.querySelector("[data-cockpit-drop-zone='north']")).toBeInTheDocument();
  });

  it("no body half-preview when zone is center", () => {
    mockActiveDragPaneId = "chart";
    mockPendingDrop = { groupId: GROUP_ID, zone: "center" };
    renderOverlay();
    expect(document.querySelector("[data-cockpit-drop-preview]")).toBeNull();
  });
});

describe("<TabBarDroppable> (cv3d-02)", () => {
  beforeEach(() => {
    mockActiveDragPaneId = null;
    mockPendingDrop = null;
    droppableConfigs.length = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it("registers tab-bar droppable with overTabBar data", () => {
    mockActiveDragPaneId = "chart";
    renderTabBar();
    expect(droppableConfigs[0]).toMatchObject({
      id: `drop-tabbar-${GROUP_ID}`,
      data: { groupId: GROUP_ID, overTabBar: true },
    });
  });

  it("highlights tab bar when pending zone is center", () => {
    mockActiveDragPaneId = "chart";
    mockPendingDrop = { groupId: GROUP_ID, zone: "center" };
    renderTabBar();
    expect(screen.getByTestId("tab-strip").parentElement).toHaveClass(
      "bg-primary/10",
    );
  });

  it("no tab-bar highlight when body half is targeted", () => {
    mockActiveDragPaneId = "chart";
    mockPendingDrop = { groupId: GROUP_ID, zone: "west" };
    renderTabBar();
    expect(screen.getByTestId("tab-strip").parentElement).not.toHaveClass(
      "bg-primary/10",
    );
  });
});

describe("CockpitDropOverlay forbidden imports (P0-DL-4)", () => {
  it("does not import PaneDropOverlay or customize-mode-context", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../CockpitDropOverlay.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/PaneDropOverlay/);
    expect(source).not.toMatch(/customize-mode-context/);
  });
});
