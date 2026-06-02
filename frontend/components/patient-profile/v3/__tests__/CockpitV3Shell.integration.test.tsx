/**
 * `<CockpitV3Shell>` — Phase 1 integration tests (cv3c-04).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import fs from "node:fs";
import path from "node:path";
import CockpitV3Shell from "../CockpitV3Shell";
import type { PaneDefinition } from "@/lib/patient-profile/v3/foundation";

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: vi.fn(() => true),
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

function makePanes(ids: string[]): PaneDefinition[] {
  return ids.map((id) => ({
    id,
    title: id.toUpperCase(),
    render: () => <div data-testid={`pane-body-${id}`}>{id}</div>,
  }));
}

describe("CockpitV3Shell integration (cv3c-04)", () => {
  beforeEach(() => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    localStorage.clear();
  });

  it("desktop renders palette + canvas between anchored docks", () => {
    render(
      <CockpitV3Shell
        panes={makePanes(["a", "b", "c"])}
        storageKey="integration-test"
        safetyDock={<div data-testid="dock-safety" />}
        actionDock={
          <button type="button" data-testid="dock-action">
            Send
          </button>
        }
      />,
    );

    expect(screen.getByTestId("p1-cockpit-v3-shell-desktop")).toBeInTheDocument();
    expect(screen.getByTestId("cockpit-v3-palette")).toBeInTheDocument();
    expect(screen.getByTestId("cockpit-v3-empty-state")).toBeInTheDocument();
    expect(screen.getByTestId("dock-safety")).toBeInTheDocument();
    expect(screen.getByTestId("dock-action")).toBeInTheDocument();

    const desktop = screen.getByTestId("p1-cockpit-v3-shell-desktop");
    const children = Array.from(desktop.children);
    // Anchored chrome invariant (v3-DL-6): safety dock is the first child and
    // the action dock is the last — palette + DnD canvas sit between them.
    // The action dock is asserted as the LAST child (not a hard index) because
    // the Phase-2 `<DndContext>` injects a hidden `DndDescribedBy` a11y sibling
    // between the canvas and the action dock; a fixed index is brittle to it.
    expect(children[0]).toContainElement(screen.getByTestId("dock-safety"));
    expect(children[1]).toContainElement(screen.getByTestId("cockpit-v3-palette"));
    expect(children[children.length - 1]).toContainElement(
      screen.getByTestId("dock-action"),
    );
    // Behavioural invariant: the action dock is anchored OUTSIDE the DnD canvas
    // (so it survives a reshape — proven exhaustively in CockpitChrome.reparent).
    expect(
      screen.getByTestId("p2-cockpit-v3-dnd-context"),
    ).not.toContainElement(screen.getByTestId("dock-action"));

    fireEvent.click(screen.getByTestId("dock-action"));
  });

  it("mobile renders flat visible panes without panel groups or palette", async () => {
    vi.mocked(useMediaQuery).mockReturnValue(false);

    render(
      <CockpitV3Shell
        panes={makePanes(["a", "b"])}
        storageKey="integration-mobile"
      />,
    );

    expect(screen.getByTestId("p1-cockpit-v3-shell-mobile")).toBeInTheDocument();
    expect(screen.queryByTestId("cockpit-v3-palette")).not.toBeInTheDocument();
    expect(document.querySelector("[data-panel-group]")).toBeNull();
    expect(screen.getByTestId("cockpit-v3-empty-state")).toBeInTheDocument();
  });

  it("v3 mounts unconditionally — PatientProfilePage has no flag branch (cv3x-03)", () => {
    const pagePath = path.resolve(
      __dirname,
      "../../PatientProfilePage.tsx",
    );
    const source = fs.readFileSync(pagePath, "utf8");
    expect(source).toContain("CockpitV3Shell");
    expect(source).not.toMatch(/cockpitV3Enabled/);
    expect(source).not.toContain("PatientProfileShell");
    expect(source).not.toContain("trackCockpitV3ShellRendered");
  });

  it("build-up adds panes and shows them in the canvas", () => {
    render(
      <CockpitV3Shell
        panes={makePanes(["a", "b", "c"])}
        storageKey="integration-build-up"
      />,
    );

    expect(screen.getByTestId("cockpit-v3-empty-state")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add A" }));
    fireEvent.click(screen.getByRole("button", { name: "Add B" }));
    fireEvent.click(screen.getByRole("button", { name: "Add C" }));

    expect(screen.queryByTestId("cockpit-v3-empty-state")).not.toBeInTheDocument();
    expect(screen.getByTestId("pane-body-a")).toBeInTheDocument();
    expect(screen.getByTestId("pane-body-b")).toBeInTheDocument();
    expect(screen.getByTestId("pane-body-c")).toBeInTheDocument();
    expect(screen.queryByTestId("dock-safety")).not.toBeInTheDocument();
  });
});
