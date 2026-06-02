/**
 * `<CockpitPalette>` — pane palette tests (cv3c-03).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import CockpitPalette from "../CockpitPalette";
import type { PaneDefinition } from "@/lib/patient-profile/v3/foundation";
import type { CockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";
import { layoutUxToast } from "@/lib/patient-profile/layout-ux-toast";

vi.mock("@/lib/patient-profile/layout-ux-toast", () => ({
  layoutUxToast: { error: vi.fn() },
}));

function makePane(id: string, title?: string): PaneDefinition {
  return {
    id,
    title: title ?? id,
    render: () => <div>{id}</div>,
  };
}

function makeLayout(
  paneState: Record<string, { sizePct: number; hidden: boolean }>,
  overrides: Partial<CockpitV3Layout> = {},
): CockpitV3Layout {
  return {
    paneState,
    addPane: vi.fn(() => ({ ok: true })),
    removePane: vi.fn(() => ({ ok: true })),
    ...overrides,
  } as CockpitV3Layout;
}

describe("CockpitPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks hidden panes as available and visible panes as on-canvas", () => {
    render(
      <CockpitPalette
        panes={[makePane("a"), makePane("b")]}
        layout={makeLayout({
          a: { sizePct: 50, hidden: false },
          b: { sizePct: 50, hidden: true },
        })}
      />,
    );

    expect(screen.getByTestId("cockpit-v3-palette")).toBeInTheDocument();
    expect(screen.getByTestId("cockpit-v3-palette")).toContainElement(
      screen.getByLabelText("Remove a"),
    );
    expect(screen.getByTestId("cockpit-v3-palette")).toContainElement(
      screen.getByLabelText("Add b"),
    );
    expect(
      screen.getByRole("button", { name: "Remove a" }),
    ).toHaveAttribute("data-palette-on-canvas", "true");
    expect(
      screen.getByRole("button", { name: "Add b" }),
    ).toHaveAttribute("data-palette-on-canvas", "false");
  });

  it("click available pane calls addPane", () => {
    const addPane = vi.fn(() => ({ ok: true }));
    render(
      <CockpitPalette
        panes={[makePane("a")]}
        layout={makeLayout({ a: { sizePct: 100, hidden: true } }, { addPane })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add a" }));
    expect(addPane).toHaveBeenCalledWith("a");
  });

  it("click on-canvas pane calls removePane", () => {
    const removePane = vi.fn(() => ({ ok: true }));
    render(
      <CockpitPalette
        panes={[makePane("a")]}
        layout={makeLayout(
          { a: { sizePct: 100, hidden: false } },
          { removePane },
        )}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove a" }));
    expect(removePane).toHaveBeenCalledWith("a");
  });

  it("shows toast when add hits cap-reached", () => {
    const addPane = vi.fn(() => ({ ok: false, reason: "cap-reached" }));
    render(
      <CockpitPalette
        panes={[makePane("a")]}
        layout={makeLayout({ a: { sizePct: 100, hidden: true } }, { addPane })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add a" }));
    expect(layoutUxToast.error).toHaveBeenCalled();
  });

  it("reset button calls resetLayout", () => {
    const resetLayout = vi.fn();
    render(
      <CockpitPalette
        panes={[makePane("a")]}
        layout={makeLayout({ a: { sizePct: 100, hidden: true } }, { resetLayout })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset to blank" }));
    expect(resetLayout).toHaveBeenCalledOnce();
    expect(screen.getByTestId("cockpit-v3-reset")).toBeInTheDocument();
  });
});
