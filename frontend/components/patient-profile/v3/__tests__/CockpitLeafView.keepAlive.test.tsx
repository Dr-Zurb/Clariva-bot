/**
 * Stacked tab bodies must survive a tab switch.
 *
 * Swapping the single leaf body remounted the incoming pane on every click,
 * replaying that pane's fetches and losing its scroll position. Mounting stays
 * lazy — a tab the doctor never opened must not mount, or the cockpit pays for
 * panes nobody looked at.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import CockpitLeafView from "../CockpitLeafView";
import type {
  PaneDefinition,
  PaneTreeNode,
} from "@/lib/patient-profile/v3/foundation";
import type { CockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";

vi.mock("../CockpitDropOverlay", () => ({
  default: () => null,
  TabBarDroppable: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("../CockpitLeafMenu", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../PaneTabStripV3", () => ({
  default: () => <div data-testid="tab-strip" />,
}));

vi.mock("../PaneFocusButton", () => ({
  default: () => null,
  isFocusTargetForLeaf: () => false,
}));

vi.mock("../PaneShowHereButton", () => ({
  default: () => null,
}));

vi.mock("@/lib/patient-profile/v3/cockpit-cap-toast", () => ({
  toastOnCapRejection: <T,>(v: T) => v,
}));

vi.mock("@/lib/patient-profile/v3/focus-leaf", () => ({
  listShowHereCandidates: () => [],
}));

const layoutStub = {
  focusedLeafId: null,
  focusPrior: null,
  ratio: null,
  paneTree: { id: "__root__", sizePct: 100, hidden: false, children: [] },
  setActiveTab: vi.fn(),
  closeTab: vi.fn(),
  closeLeaf: vi.fn(),
  showPaneHere: vi.fn(),
  enterSplit: vi.fn(),
  exitFocus: vi.fn(),
} as unknown as CockpitV3Layout;

/** Counts mounts so a remount is provable, not inferred from the DOM. */
const mounts: Record<string, number> = {};

function CountedBody({ id }: { id: string }) {
  React.useEffect(() => {
    mounts[id] = (mounts[id] ?? 0) + 1;
  }, [id]);
  return <div data-testid={`body-${id}`}>{id} body</div>;
}

function paneMap(ids: string[]): Map<string, PaneDefinition> {
  return new Map(
    ids.map((id) => [
      id,
      {
        id,
        title: id.toUpperCase(),
        render: () => <CountedBody id={id} />,
      },
    ])
  );
}

function leaf(paneIds: string[], activeTabId: string): PaneTreeNode {
  return {
    id: "tabs",
    sizePct: 100,
    hidden: false,
    paneIds,
    activeTabId,
  };
}

function renderLeaf(activeTabId: string, paneIds = ["subjective", "objective"]) {
  const paneById = paneMap(paneIds);
  const ui = (activeId: string) => (
    <CockpitLeafView
      node={leaf(paneIds, activeId)}
      paneById={paneById}
      layout={layoutStub}
    />
  );
  const result = render(ui(activeTabId));
  return {
    ...result,
    activate: (id: string) => result.rerender(ui(id)),
  };
}

describe("CockpitLeafView — tab keep-alive", () => {
  beforeEach(() => {
    for (const key of Object.keys(mounts)) delete mounts[key];
  });

  it("does not mount a tab the doctor never opened", () => {
    renderLeaf("subjective");

    expect(screen.getByTestId("body-subjective")).toBeInTheDocument();
    expect(screen.queryByTestId("body-objective")).not.toBeInTheDocument();
    expect(mounts.objective).toBeUndefined();
  });

  it("keeps the previous tab mounted and hidden after a switch", () => {
    const { activate } = renderLeaf("subjective");
    const firstBody = screen.getByTestId("body-subjective");

    activate("objective");

    expect(screen.getByTestId("body-objective")).toBeVisible();
    // Same node, still in the tree — not torn down and rebuilt.
    expect(screen.getByTestId("body-subjective")).toBe(firstBody);
    expect(screen.getByTestId("body-subjective")).not.toBeVisible();
  });

  it("mounts each tab body exactly once across repeated switching", () => {
    const { activate } = renderLeaf("subjective");

    activate("objective");
    activate("subjective");
    activate("objective");

    expect(mounts.subjective).toBe(1);
    expect(mounts.objective).toBe(1);
  });

  it("gives every mounted tab its own scrollport, keyed for aria-controls", () => {
    const { activate, container } = renderLeaf("subjective");
    activate("objective");

    for (const id of ["subjective", "objective"]) {
      const body = container.querySelector(`#pane-body-${id}`);
      expect(body).toBeTruthy();
      expect(body).toHaveClass("overflow-y-auto");
      expect(body).toHaveClass("touch-pan-y");
      expect(body).toHaveClass("overscroll-y-contain");
    }
  });
});
