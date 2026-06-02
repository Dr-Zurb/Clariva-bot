/**
 * `<PaneDropOverlay>` — unit tests (Vitest + RTL).
 *
 * @dnd-kit/core is partially mocked: `useDndContext` exposes a controllable
 * `active` drag, and `useDroppable` records each zone registration.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { DropZone } from "@/lib/patient-profile/layout-tree-mutations";

// ---------------------------------------------------------------------------
// Mocks — must be set up BEFORE importing the component under test.
// ---------------------------------------------------------------------------

let mockActive: unknown = null;
let mockOverZoneId: string | null = null;

type DroppableConfig = {
  id: string;
  data?: { groupId: string; zone: DropZone };
  disabled?: boolean;
};

const droppableConfigs: DroppableConfig[] = [];

vi.mock("@dnd-kit/core", () => {
  const DndContext = ({ children }: { children: React.ReactNode }) => (
    <div data-dnd-context>{children}</div>
  );

  const useDndContext = () => ({
    active: mockActive,
  });

  const useDroppable = (config: DroppableConfig) => {
    droppableConfigs.push(config);
    return {
      setNodeRef: () => {},
      isOver: mockOverZoneId === config.id,
    };
  };

  return {
    __esModule: true,
    DndContext,
    useDndContext,
    useDroppable,
  };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { DndContext } from "@dnd-kit/core";
import PaneDropOverlay from "../PaneDropOverlay";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GROUP_ID = "leaf-group-1";

const ZONE_LABEL: Record<DropZone, string> = {
  center: "Add as tab",
  north: "Split up",
  south: "Split down",
  east: "Split right",
  west: "Split left",
};

function renderOverlay(
  props: Partial<React.ComponentProps<typeof PaneDropOverlay>> = {},
) {
  return render(
    <DndContext>
      <PaneDropOverlay groupId={GROUP_ID} {...props} />
    </DndContext>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("<PaneDropOverlay>", () => {
  beforeEach(() => {
    cleanup();
    mockActive = null;
    mockOverZoneId = null;
    droppableConfigs.length = 0;
  });

  it("renders nothing when no drag is active", () => {
    mockActive = null;

    renderOverlay();

    expect(
      document.querySelector(`[data-pane-drop-overlay="${GROUP_ID}"]`),
    ).not.toBeInTheDocument();
    expect(droppableConfigs).toHaveLength(0);
  });

  it("renders five zone targets when a drag is active", () => {
    mockActive = { id: "tab-drag-body" };

    renderOverlay();

    const overlay = document.querySelector(
      `[data-pane-drop-overlay="${GROUP_ID}"]`,
    );
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveClass("pointer-events-none");

    const zones = document.querySelectorAll("[data-drop-zone]");
    expect(zones).toHaveLength(5);

    const inner = overlay?.querySelector(".pointer-events-auto");
    expect(inner).toBeInTheDocument();
  });

  it("renders four zones (no center) when allowCenter is false", () => {
    mockActive = { id: "tab-drag-body" };

    renderOverlay({ allowCenter: false });

    const zones = document.querySelectorAll("[data-drop-zone]");
    expect(zones).toHaveLength(4);
    expect(
      document.querySelector('[data-drop-zone="center"]'),
    ).not.toBeInTheDocument();
    expect(droppableConfigs.map((c) => c.id)).not.toContain(
      `drop-${GROUP_ID}-center`,
    );
  });

  it("each zone droppable id is `drop-<groupId>-<zone>` with data { groupId, zone }", () => {
    mockActive = { id: "tab-drag-body" };

    renderOverlay();

    const expectedZones: DropZone[] = [
      "center",
      "north",
      "south",
      "east",
      "west",
    ];
    expect(droppableConfigs).toHaveLength(5);

    for (const zone of expectedZones) {
      const config = droppableConfigs.find((c) => c.id === `drop-${GROUP_ID}-${zone}`);
      expect(config).toBeDefined();
      expect(config?.data).toEqual({ groupId: GROUP_ID, zone });
      expect(config?.disabled).toBe(false);
    }
  });

  it("zone label text matches ZONE_LABEL (Add as tab / Split up / down / left / right)", () => {
    mockActive = { id: "tab-drag-body" };

    renderOverlay();

    for (const [zone, label] of Object.entries(ZONE_LABEL)) {
      const target = document.querySelector(
        `[data-drop-zone="${zone}"]`,
      );
      expect(target).toBeInTheDocument();
      expect(target).toHaveTextContent(label);
    }
  });

  it("disables every zone droppable when enabled=false", () => {
    mockActive = { id: "tab-drag-body" };

    renderOverlay({ enabled: false });

    expect(droppableConfigs).toHaveLength(5);
    for (const config of droppableConfigs) {
      expect(config.disabled).toBe(true);
    }

    const zones = document.querySelectorAll("[data-drop-zone]");
    for (const zone of zones) {
      expect(zone).toHaveClass("border-muted");
      expect(zone).toHaveClass("bg-muted/10");
    }
  });

  it("the over zone gets the active highlight class", () => {
    mockActive = { id: "tab-drag-body" };
    mockOverZoneId = `drop-${GROUP_ID}-north`;

    renderOverlay();

    const north = document.querySelector('[data-drop-zone="north"]');
    expect(north).toHaveClass("border-primary");
    expect(north).toHaveClass("bg-primary/20");
    expect(north).toHaveClass("text-primary");

    const south = document.querySelector('[data-drop-zone="south"]');
    expect(south).toHaveClass("border-primary/40");
    expect(south).toHaveClass("bg-primary/5");
  });
});
