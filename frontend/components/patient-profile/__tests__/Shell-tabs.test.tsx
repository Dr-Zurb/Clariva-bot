/**
 * Shell tabs renderer wiring (cpf-04) — unit tests (Vitest + RTL).
 *
 * Verifies the renderer's "wrap-around-the-tab" integration surface — the
 * `wrapTab` slot on `<PaneTabStrip>` that the shell uses to attach a
 * `<PaneContextMenu>` to every visible tab button. The shell's own leaf
 * branch is exercised in the wider Shell tests; this file focuses on the
 * standalone behaviour of the slot.
 *
 * The companion tests live alongside:
 *   - `lib/patient-profile/__tests__/find-pane-tree-leaf-metadata.test.ts`
 *     covers the persisted-leaf lookup the renderer relies on.
 *   - `lib/patient-profile/__tests__/useShellLayout-setActiveTab.test.ts`
 *     covers `setActiveTab` and the no-`layoutVersion`-bump invariant.
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("@dnd-kit/core", () => {
  const DndContext = ({ children }: { children: React.ReactNode }) => (
    <div data-dnd-context>{children}</div>
  );
  const useDraggable = () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    isDragging: false,
  });
  return { __esModule: true, DndContext, useDraggable };
});

import { DndContext } from "@dnd-kit/core";
import PaneTabStrip from "../PaneTabStrip";
import type { PaneDefinition } from "@/lib/patient-profile/types";

function makePaneDef(id: string, title: string): PaneDefinition {
  return {
    id,
    title,
    render: () => <div data-testid={`pane-${id}-body`}>{id}</div>,
  };
}

describe("<PaneTabStrip> wrapTab slot (cpf-04)", () => {
  afterEach(() => {
    cleanup();
  });

  it("calls wrapTab once per visible tab and renders the returned element in place of the bare tab", () => {
    const wrapTab = vi.fn(
      (paneId: string, tab: React.ReactNode) => (
        <span data-testid={`wrap-${paneId}`}>{tab}</span>
      ),
    );
    const paneById = {
      snapshot: makePaneDef("snapshot", "Snapshot"),
      history: makePaneDef("history", "History"),
    };

    render(
      <DndContext>
        <PaneTabStrip
          groupId="g1"
          paneIds={["snapshot", "history"]}
          activeTabId="snapshot"
          paneById={paneById}
          onActivateTab={vi.fn()}
          wrapTab={wrapTab}
        />
      </DndContext>,
    );

    expect(screen.getByTestId("wrap-snapshot")).toBeInTheDocument();
    expect(screen.getByTestId("wrap-history")).toBeInTheDocument();
    // The bare tab button is nested inside the wrapper element.
    expect(
      screen
        .getByTestId("wrap-snapshot")
        .querySelector("button[role='tab']"),
    ).toBeInTheDocument();
    expect(
      screen
        .getByTestId("wrap-history")
        .querySelector("button[role='tab']"),
    ).toBeInTheDocument();
    expect(wrapTab).toHaveBeenCalledTimes(2);
    expect(wrapTab).toHaveBeenCalledWith("snapshot", expect.anything());
    expect(wrapTab).toHaveBeenCalledWith("history", expect.anything());
  });

  it("does not wrap tabs when wrapTab is omitted (zero diff to today's strip)", () => {
    const paneById = {
      snapshot: makePaneDef("snapshot", "Snapshot"),
    };

    render(
      <DndContext>
        <PaneTabStrip
          groupId="g1"
          paneIds={["snapshot"]}
          activeTabId="snapshot"
          paneById={paneById}
          onActivateTab={vi.fn()}
        />
      </DndContext>,
    );

    expect(screen.queryByTestId("wrap-snapshot")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /snapshot/i })).toBeInTheDocument();
  });

  it("forwards click activation through the wrapped tab", () => {
    const onActivateTab = vi.fn();
    const paneById = {
      snapshot: makePaneDef("snapshot", "Snapshot"),
      history: makePaneDef("history", "History"),
    };

    render(
      <DndContext>
        <PaneTabStrip
          groupId="g1"
          paneIds={["snapshot", "history"]}
          activeTabId="snapshot"
          paneById={paneById}
          onActivateTab={onActivateTab}
          wrapTab={(_, tab) => <span>{tab}</span>}
        />
      </DndContext>,
    );

    fireEvent.click(screen.getByRole("tab", { name: /history/i }));
    expect(onActivateTab).toHaveBeenCalledWith("history");
  });

  it("does NOT wrap overflow menu items — the wrapTab slot only applies to visible tabs", () => {
    const wrapTab = vi.fn(
      (paneId: string, tab: React.ReactNode) => (
        <span data-testid={`wrap-${paneId}`}>{tab}</span>
      ),
    );
    const paneIds = ["p1", "p2", "p3", "p4", "p5", "p6"];
    const paneById = Object.fromEntries(
      paneIds.map((id) => [id, makePaneDef(id, id.toUpperCase())]),
    );

    render(
      <DndContext>
        <PaneTabStrip
          groupId="g1"
          paneIds={paneIds}
          activeTabId="p1"
          paneById={paneById}
          onActivateTab={vi.fn()}
          wrapTab={wrapTab}
        />
      </DndContext>,
    );

    // Only 4 visible tabs get wrapped (VISIBLE_TAB_LIMIT).
    expect(wrapTab).toHaveBeenCalledTimes(4);
    expect(screen.getByTestId("wrap-p1")).toBeInTheDocument();
    expect(screen.getByTestId("wrap-p4")).toBeInTheDocument();
    expect(screen.queryByTestId("wrap-p5")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wrap-p6")).not.toBeInTheDocument();
  });
});
