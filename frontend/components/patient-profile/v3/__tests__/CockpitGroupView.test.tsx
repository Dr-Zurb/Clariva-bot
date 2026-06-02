/**
 * `<CockpitGroupView>` — recursive editor-group renderer tests (cv3c-01).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import CockpitGroupView from "../CockpitGroupView";
import {
  deserialiseTree,
  serialiseTree,
  type PaneDefinition,
  type PaneTreeNode,
} from "@/lib/patient-profile/v3/foundation";
import type { CockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";

const mockSetGroupSizes = vi.fn();
const mockSetActiveTab = vi.fn();
const mockCloseTab = vi.fn();

const layoutStub: CockpitV3Layout = {
  setGroupSizes: mockSetGroupSizes,
  setLeafSize: vi.fn(),
  setActiveTab: mockSetActiveTab,
  closeTab: mockCloseTab,
  addPane: vi.fn(),
  removePane: vi.fn(),
  splitLeafDir: vi.fn(),
  movePane: vi.fn(),
  paneTree: { id: "__root__", sizePct: 100, hidden: false, children: [] },
  paneState: {},
  layoutVersion: 0,
} as CockpitV3Layout;

let lastGroupOnLayoutChanged:
  | ((layout: Record<string, number>) => void)
  | undefined;

vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({
    children,
    id,
    onLayoutChanged,
    "data-cockpit-orientation": orientation,
  }: {
    children: React.ReactNode;
    id?: string;
    onLayoutChanged?: (layout: Record<string, number>) => void;
    "data-cockpit-orientation"?: string;
  }) => {
    lastGroupOnLayoutChanged = onLayoutChanged;
    return (
      <div
        data-panel-group
        data-testid={id}
        data-group-id={id}
        data-orientation={orientation}
      >
        {children}
      </div>
    );
  },
  ResizablePanel: ({
    children,
    id,
  }: {
    children?: React.ReactNode;
    id?: string;
  }) => (
    <div data-panel data-pane-id={id}>
      {children}
    </div>
  ),
  ResizableHandle: () => <div data-separator role="separator" />,
}));

function leaf(
  id: string,
  sizePct = 50,
  activeTabId?: string,
  extraPaneIds?: string[],
): PaneTreeNode {
  const paneIds = extraPaneIds ?? [id];
  return {
    id: extraPaneIds ? `__tabs_${id}` : id,
    sizePct,
    hidden: false,
    paneIds,
    activeTabId: activeTabId ?? paneIds[0]!,
  };
}

function split(
  id: string,
  direction: "horizontal" | "vertical",
  children: PaneTreeNode[],
): PaneTreeNode {
  return {
    id,
    sizePct: 100,
    hidden: false,
    direction,
    children,
  };
}

function makePane(id: string, title?: string): PaneDefinition {
  return {
    id,
    title: title ?? id,
    render: () => <div data-testid={`pane-body-${id}`}>{id} body</div>,
  };
}

function renderTree(tree: PaneTreeNode, panes: PaneDefinition[]) {
  const paneById = new Map(panes.map((pane) => [pane.id, pane]));
  return render(
    <CockpitGroupView node={tree} paneById={paneById} layout={layoutStub} />,
  );
}

describe("CockpitGroupView", () => {
  beforeEach(() => {
    mockSetGroupSizes.mockClear();
    lastGroupOnLayoutChanged = undefined;
  });

  it("single leaf renders only the active pane body", () => {
    renderTree(
      leaf("a", 100, "a", ["a", "b"]),
      [makePane("a"), makePane("b")],
    );

    expect(screen.getByTestId("pane-body-a")).toBeInTheDocument();
    expect(screen.queryByTestId("pane-body-b")).not.toBeInTheDocument();
    expect(screen.getByText("a")).toBeInTheDocument();
  });

  it("row split renders two leaf bodies side by side", () => {
    renderTree(
      split("__root__", "horizontal", [leaf("a", 50), leaf("b", 50)]),
      [makePane("a"), makePane("b")],
    );

    expect(screen.getByTestId("pane-body-a")).toBeInTheDocument();
    expect(screen.getByTestId("pane-body-b")).toBeInTheDocument();
    expect(screen.getAllByTestId(/pane-body-/)).toHaveLength(2);
    expect(screen.getByTestId("__root__")).toHaveAttribute(
      "data-orientation",
      "horizontal",
    );
  });

  it("nested split renders row containing a column", () => {
    renderTree(
      split("__root__", "horizontal", [
        leaf("a", 40),
        split("__inner__", "vertical", [leaf("b", 50), leaf("c", 50)]),
      ]),
      [makePane("a"), makePane("b"), makePane("c")],
    );

    expect(screen.getByTestId("pane-body-a")).toBeInTheDocument();
    expect(screen.getByTestId("pane-body-b")).toBeInTheDocument();
    expect(screen.getByTestId("pane-body-c")).toBeInTheDocument();
    expect(screen.getByTestId("__root__")).toHaveAttribute(
      "data-orientation",
      "horizontal",
    );
    expect(screen.getByTestId("__inner__")).toHaveAttribute(
      "data-orientation",
      "vertical",
    );
  });

  it("resize commits child-id to pct map via setGroupSizes", async () => {
    renderTree(
      split("__root__", "horizontal", [leaf("a", 50), leaf("b", 50)]),
      [makePane("a"), makePane("b")],
    );

    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
          });
        });
      });
    });

    expect(lastGroupOnLayoutChanged).toBeTypeOf("function");
    act(() => {
      lastGroupOnLayoutChanged?.({ a: 62.5, b: 37.5 });
    });

    expect(mockSetGroupSizes).toHaveBeenCalledWith("__root__", {
      a: 62.5,
      b: 37.5,
    });
  });

  it("round-trip serialise → deserialise preserves render structure", () => {
    const tree = split("__root__", "horizontal", [
      leaf("a", 40),
      split("__inner__", "vertical", [leaf("b", 50), leaf("c", 50)]),
    ]);
    const panes = [makePane("a"), makePane("b"), makePane("c")];

    const { unmount } = renderTree(tree, panes);
    expect(screen.getByTestId("pane-body-a")).toBeInTheDocument();
    expect(screen.getByTestId("pane-body-b")).toBeInTheDocument();
    expect(screen.getByTestId("pane-body-c")).toBeInTheDocument();
    unmount();

    const roundTripped = deserialiseTree(serialiseTree(tree));
    renderTree(roundTripped, panes);

    expect(screen.getByTestId("pane-body-a")).toBeInTheDocument();
    expect(screen.getByTestId("pane-body-b")).toBeInTheDocument();
    expect(screen.getByTestId("pane-body-c")).toBeInTheDocument();
    expect(screen.getByTestId("__inner__")).toHaveAttribute(
      "data-orientation",
      "vertical",
    );
  });

  it("active tab renders the second pane body when activeTabId is set", () => {
    renderTree(
      leaf("tabs", 100, "b", ["a", "b"]),
      [makePane("a"), makePane("b", "Pane B")],
    );

    expect(screen.queryByTestId("pane-body-a")).not.toBeInTheDocument();
    expect(screen.getByTestId("pane-body-b")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Pane B/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("activating tab 2 swaps body via setActiveTab without remounting sibling leaves", () => {
    const siblingMarker = "sibling-leaf-marker";
    renderTree(
      split("__root__", "horizontal", [
        leaf("tabs", 100, "a", ["a", "b"]),
        {
          id: "sibling",
          sizePct: 50,
          hidden: false,
          paneIds: ["c"],
          activeTabId: "c",
        },
      ]),
      [
        makePane("a", "Pane A"),
        makePane("b", "Pane B"),
        {
          id: "c",
          title: "Pane C",
          render: () => <div data-testid="pane-body-c">{siblingMarker}</div>,
        },
      ],
    );

    const siblingBody = screen.getByTestId("pane-body-c");
    expect(screen.getByTestId("pane-body-a")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Pane B/i }));
    expect(mockSetActiveTab).toHaveBeenCalledWith("__tabs_tabs", "b");
    expect(screen.getByTestId("pane-body-c")).toBe(siblingBody);
  });
});
