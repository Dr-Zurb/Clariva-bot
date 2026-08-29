/**
 * Leaf body must remain a vertical scrollport — especially when the parent
 * split is stacked (horizontal gutter / vertical orientation), where
 * react-resizable-panels sets touch-action: pan-x on the panel wrapper.
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import CockpitLeafView from "../CockpitLeafView";
import type { PaneDefinition, PaneTreeNode } from "@/lib/patient-profile/v3/foundation";
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

describe("CockpitLeafView — stacked-leaf scrollport", () => {
  it("enables vertical overflow + touch-pan-y on the pane body", () => {
    const node: PaneTreeNode = {
      id: "consult",
      sizePct: 50,
      hidden: false,
      paneIds: ["consult"],
      activeTabId: "consult",
    };
    const paneById = new Map<string, PaneDefinition>([
      [
        "consult",
        {
          id: "consult",
          title: "Consult",
          render: () => <div>ready card</div>,
        },
      ],
    ]);

    const { container } = render(
      <CockpitLeafView node={node} paneById={paneById} layout={layoutStub} />,
    );

    const body = container.querySelector("#pane-body-consult");
    expect(body).toBeTruthy();
    expect(body).toHaveClass("overflow-y-auto");
    expect(body).toHaveClass("touch-pan-y");
    expect(body).toHaveClass("overscroll-y-contain");
  });
});
