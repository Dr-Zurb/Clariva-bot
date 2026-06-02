/**
 * cv3p-03 — mobile flat fallback + reachable safety/send (R-MOBILE3).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import CockpitMobileFallback from "../CockpitMobileFallback";
import CockpitV3Shell from "../CockpitV3Shell";
import type { PaneDefinition } from "@/lib/patient-profile/v3/foundation";
import type { CockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: vi.fn(() => false),
}));

vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-panel-group>{children}</div>
  ),
  ResizablePanel: ({ children }: { children?: React.ReactNode }) => (
    <div data-panel>{children}</div>
  ),
  ResizableHandle: () => <div data-separator role="separator" />,
}));

import { useMediaQuery } from "@/hooks/useMediaQuery";

function makePane(id: string, title?: string): PaneDefinition {
  return {
    id,
    title: title ?? id.toUpperCase(),
    render: () => <div data-testid={`pane-body-${id}`}>{id}</div>,
  };
}

function makeLayout(
  overrides: Partial<CockpitV3Layout> & {
    paneState: Record<string, { sizePct: number; hidden: boolean }>;
  },
): CockpitV3Layout {
  const paneOrder = Object.keys(overrides.paneState);
  return {
    paneOrder,
    paneState: overrides.paneState,
    hydrated: true,
    addPane: vi.fn(() => ({ ok: true })),
    removePane: vi.fn(() => ({ ok: true })),
    resetLayout: vi.fn(),
    ...overrides,
  } as CockpitV3Layout;
}

describe("CockpitMobileFallback (cv3p-03)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders flat titled pane sections without panel groups or drag attributes", () => {
    render(
      <CockpitMobileFallback
        panes={[makePane("a"), makePane("b")]}
        layout={makeLayout({
          paneState: {
            a: { sizePct: 50, hidden: false },
            b: { sizePct: 50, hidden: true },
          },
        })}
      />,
    );

    expect(screen.getByTestId("cockpit-v3-mobile-fallback")).toBeInTheDocument();
    expect(screen.getByTestId("pane-body-a")).toBeInTheDocument();
    expect(screen.queryByTestId("pane-body-b")).not.toBeInTheDocument();
    expect(screen.getByLabelText("A")).toHaveAttribute(
      "data-cockpit-mobile-pane",
      "a",
    );
    expect(document.querySelector("[data-panel-group]")).toBeNull();
    expect(document.querySelector("[data-sortable-id]")).toBeNull();
    expect(screen.queryByTestId("cockpit-v3-palette")).not.toBeInTheDocument();
  });

  it("renders safety and action docks around the stack", () => {
    render(
      <CockpitMobileFallback
        panes={[makePane("a")]}
        layout={makeLayout({
          paneState: { a: { sizePct: 100, hidden: false } },
        })}
        safetyDock={<div data-testid="dock-safety">Safety</div>}
        actionDock={
          <button type="button" data-testid="dock-action">
            Send
          </button>
        }
      />,
    );

    const fallback = screen.getByTestId("cockpit-v3-mobile-fallback");
    expect(screen.getByTestId("cockpit-v3-mobile-safety-dock")).toContainElement(
      screen.getByTestId("dock-safety"),
    );
    expect(screen.getByTestId("cockpit-v3-mobile-action-dock")).toContainElement(
      screen.getByTestId("dock-action"),
    );
    expect(fallback).toContainElement(screen.getByTestId("dock-safety"));
    expect(fallback).toContainElement(screen.getByTestId("dock-action"));
    expect(document.querySelector("[data-testid='p2-cockpit-v3-dnd-context']")).toBeNull();
  });

  it("shows empty-state with docks still present on a blank canvas", () => {
    render(
      <CockpitMobileFallback
        panes={[makePane("a")]}
        layout={makeLayout({
          paneState: { a: { sizePct: 100, hidden: true } },
        })}
        safetyDock={<div data-testid="dock-safety">Safety</div>}
        actionDock={<div data-testid="dock-action">Action</div>}
      />,
    );

    expect(screen.getByTestId("cockpit-v3-empty-state")).toBeInTheDocument();
    expect(screen.getByTestId("dock-safety")).toBeInTheDocument();
    expect(screen.getByTestId("dock-action")).toBeInTheDocument();
  });

  it("shows loading skeleton until hydrated", () => {
    render(
      <CockpitMobileFallback
        panes={[makePane("a")]}
        layout={makeLayout({
          paneState: { a: { sizePct: 100, hidden: false } },
          hydrated: false,
        })}
        actionDock={<div data-testid="dock-action">Action</div>}
      />,
    );

    expect(screen.getByTestId("cockpit-v3-mobile-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("pane-body-a")).not.toBeInTheDocument();
    expect(screen.getByTestId("dock-action")).toBeInTheDocument();
  });

  it("lg+ shell renders desktop path, not the mobile fallback", () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);

    render(
      <CockpitV3Shell
        panes={[makePane("a")]}
        storageKey="mobile-fallback-lg-test"
        safetyDock={<div data-testid="dock-safety" />}
        actionDock={<div data-testid="dock-action" />}
      />,
    );

    expect(screen.getByTestId("p1-cockpit-v3-shell-desktop")).toBeInTheDocument();
    expect(screen.queryByTestId("cockpit-v3-mobile-fallback")).not.toBeInTheDocument();
    expect(screen.getByTestId("cockpit-v3-palette")).toBeInTheDocument();
  });
});
