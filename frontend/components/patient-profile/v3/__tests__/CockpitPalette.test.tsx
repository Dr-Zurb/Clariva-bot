/**
 * `<CockpitPalette>` — pane palette tests (cv3c-03).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import CockpitPalette from "../CockpitPalette";
import type { PaneDefinition } from "@/lib/patient-profile/v3/foundation";
import type { CockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";
import { COCKPIT_TAB_ORDER } from "@/lib/patient-profile/v3/cockpit-tabs";
import { layoutUxToast } from "@/lib/patient-profile/layout-ux-toast";
import type { CockpitLayoutSwitcher } from "@/lib/patient-profile/v3/useCockpitLayoutSwitcher";

vi.mock("@/lib/patient-profile/layout-ux-toast", () => ({
  layoutUxToast: { error: vi.fn() },
}));

vi.mock("@/lib/patient-profile/v3/useCockpitLayoutPresets", () => ({
  MAX_SAVED_LAYOUTS: 5,
  useCockpitLayoutPresets: () => ({
    presets: [],
    isLoading: false,
    canSaveMore: true,
    savePreset: vi.fn(),
    deletePresetById: vi.fn(),
    renamePresetById: vi.fn(),
    refetch: vi.fn(),
  }),
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

  it("undo layout button is always visible and calls layout.undo when enabled", () => {
    const undo = vi.fn();
    render(
      <CockpitPalette
        panes={[makePane("a")]}
        layout={makeLayout(
          { a: { sizePct: 100, hidden: true } },
          { undo, canUndo: true, canRedo: false },
        )}
      />,
    );

    const btn = screen.getByTestId("cockpit-v3-undo");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-label", "Undo layout");
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(undo).toHaveBeenCalledOnce();
  });

  it("redo layout button calls layout.redo when enabled", () => {
    const redo = vi.fn();
    render(
      <CockpitPalette
        panes={[makePane("a")]}
        layout={makeLayout(
          { a: { sizePct: 100, hidden: true } },
          { redo, canRedo: true, canUndo: false },
        )}
      />,
    );

    const btn = screen.getByTestId("cockpit-v3-redo");
    expect(btn).toHaveAttribute("aria-label", "Redo layout");
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(redo).toHaveBeenCalledOnce();
  });

  it("undo and redo buttons are disabled when stacks are empty", () => {
    render(
      <CockpitPalette
        panes={[makePane("a")]}
        layout={makeLayout(
          { a: { sizePct: 100, hidden: true } },
          { undo: vi.fn(), redo: vi.fn(), canUndo: false, canRedo: false },
        )}
      />,
    );
    expect(screen.getByTestId("cockpit-v3-undo")).toBeDisabled();
    expect(screen.getByTestId("cockpit-v3-redo")).toBeDisabled();
  });
});

function makeEightPanes(): PaneDefinition[] {
  return COCKPIT_TAB_ORDER.map((id) => makePane(id, id));
}

/** Open a Radix UI DropdownMenu trigger in jsdom. */
function openLayoutsMenu() {
  const trigger = screen.getByTestId("cockpit-v3-layouts-trigger");
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
    bubbles: true,
    cancelable: true,
  });
  fireEvent.click(trigger);
}

function makeLayoutSwitcher(
  overrides: Partial<CockpitLayoutSwitcher> = {},
): CockpitLayoutSwitcher {
  return {
    activeLayoutId: "consult",
    activeSavedPresetId: null,
    applyDefaultLayout: vi.fn(),
    applySavedLayout: vi.fn(),
    ...overrides,
  };
}

describe("CockpitPalette — layouts switcher (cv3l-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists four built-in layouts and sign-in hint when no token", async () => {
    render(
      <CockpitPalette
        panes={makeEightPanes()}
        layout={makeLayout({})}
        layoutSwitcher={makeLayoutSwitcher()}
      />,
    );

    openLayoutsMenu();

    const menu = await screen.findByTestId("cockpit-v3-layouts-menu");
    expect(within(menu).getByText("Consult")).toBeInTheDocument();
    expect(within(menu).getByText("Read")).toBeInTheDocument();
    expect(within(menu).getByText("Document")).toBeInTheDocument();
    expect(within(menu).getByText("Review")).toBeInTheDocument();
    expect(
      screen.getByTestId("cockpit-v3-my-layouts-placeholder"),
    ).toHaveTextContent(/sign in to save/i);
  });

  it("selecting a layout calls applyDefaultLayout", async () => {
    const applyDefaultLayout = vi.fn();
    render(
      <CockpitPalette
        panes={makeEightPanes()}
        layout={makeLayout({})}
        layoutSwitcher={makeLayoutSwitcher({ applyDefaultLayout })}
      />,
    );

    openLayoutsMenu();
    fireEvent.click(screen.getByTestId("cockpit-v3-layout-read"));

    expect(applyDefaultLayout).toHaveBeenCalledWith("read");
  });

  it("hides the layouts control for non-eight-pane registries", () => {
    render(
      <CockpitPalette
        panes={[makePane("body"), makePane("plan")]}
        layout={makeLayout({
          body: { sizePct: 50, hidden: false },
          plan: { sizePct: 50, hidden: false },
        })}
        layoutSwitcher={makeLayoutSwitcher()}
      />,
    );

    expect(
      screen.queryByTestId("cockpit-v3-layouts-trigger"),
    ).not.toBeInTheDocument();
  });
});
