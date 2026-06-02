/**
 * PaneContextMenu — unit tests (Vitest + RTL)
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("@/lib/patient-profile/telemetry", () => ({
  trackCockpitV2RLayoutUxContextMenuOpened: vi.fn(),
}));

vi.mock("@/components/ui/context-menu", () => {
  const React = require("react") as typeof import("react");
  const OpenCtx = React.createContext(false);
  const SetOpenCtx = React.createContext<(open: boolean) => void>(() => {});

  function ContextMenu({
    children,
    onOpenChange,
  }: {
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) {
    const [open, setOpen] = React.useState(false);
    const set = React.useCallback(
      (next: boolean) => {
        setOpen(next);
        onOpenChange?.(next);
      },
      [onOpenChange],
    );
    return (
      <OpenCtx.Provider value={open}>
        <SetOpenCtx.Provider value={set}>{children}</SetOpenCtx.Provider>
      </OpenCtx.Provider>
    );
  }

  function ContextMenuTrigger({
    children,
  }: {
    children: React.ReactElement;
    asChild?: boolean;
  }) {
    const setOpen = React.useContext(SetOpenCtx);
    const child = React.Children.only(children) as React.ReactElement;
    return React.cloneElement(child, {
      onContextMenu: (event: React.MouseEvent) => {
        event.preventDefault();
        setOpen(true);
        child.props.onContextMenu?.(event);
      },
    });
  }

  function ContextMenuContent({ children }: { children: React.ReactNode }) {
    const open = React.useContext(OpenCtx);
    if (!open) return null;
    return <div role="menu">{children}</div>;
  }

  function ContextMenuItem({
    children,
    onSelect,
    disabled,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
  }) {
    return (
      <div
        role="menuitem"
        aria-disabled={disabled ? "true" : undefined}
        onClick={() => {
          if (!disabled) onSelect?.();
        }}
      >
        {children}
      </div>
    );
  }

  function ContextMenuSeparator() {
    return <hr role="separator" />;
  }

  function ContextMenuSub({ children }: { children: React.ReactNode }) {
    return <div data-testid="context-menu-sub">{children}</div>;
  }

  function ContextMenuSubTrigger({
    children,
    disabled,
    title,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    title?: string;
  }) {
    return (
      <div
        role="menuitem"
        aria-disabled={disabled ? "true" : undefined}
        title={title}
        data-testid="move-submenu-trigger"
      >
        {children}
      </div>
    );
  }

  function ContextMenuSubContent({ children }: { children: React.ReactNode }) {
    const open = React.useContext(OpenCtx);
    if (!open) return null;
    return <div data-testid="move-submenu-content">{children}</div>;
  }

  return {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubTrigger,
    ContextMenuSubContent,
  };
});

import PaneContextMenu from "../PaneContextMenu";
import { trackCockpitV2RLayoutUxContextMenuOpened } from "@/lib/patient-profile/telemetry";

function renderMenu(
  overrides: Partial<React.ComponentProps<typeof PaneContextMenu>> = {},
) {
  const onSplitHorizontal = vi.fn();
  const onSplitVertical = vi.fn();
  const onMerge = vi.fn();
  const onToggleCollapsed = vi.fn();
  const onHide = vi.fn();

  render(
    <PaneContextMenu
      paneId="body"
      isCollapsed={false}
      canMerge={true}
      onSplitHorizontal={onSplitHorizontal}
      onSplitVertical={onSplitVertical}
      onMerge={onMerge}
      onToggleCollapsed={onToggleCollapsed}
      onHide={onHide}
      {...overrides}
    >
      <div data-testid="pane-header" data-cockpit-pane-id="body">
        Plan
      </div>
    </PaneContextMenu>,
  );

  return {
    onSplitHorizontal,
    onSplitVertical,
    onMerge,
    onToggleCollapsed,
    onHide,
  };
}

function openMenu() {
  fireEvent.contextMenu(screen.getByTestId("pane-header"));
}

describe("PaneContextMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders trigger child", () => {
    renderMenu();
    expect(screen.getByTestId("pane-header")).toBeInTheDocument();
    expect(screen.getByText("Plan")).toBeInTheDocument();
  });

  it("opens menu on right-click trigger", () => {
    renderMenu();
    openMenu();
    expect(
      screen.getByRole("menuitem", { name: "Split horizontally" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Split vertically" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Merge with sibling" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Collapse pane" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Hide pane" }),
    ).toBeInTheDocument();
  });

  it("fires callbacks when menu items are selected", () => {
    const handlers = renderMenu();
    openMenu();

    fireEvent.click(
      screen.getByRole("menuitem", { name: "Split horizontally" }),
    );
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Split vertically" }));
    openMenu();
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Merge with sibling" }),
    );
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Collapse pane" }));
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Hide pane" }));

    expect(handlers.onSplitHorizontal).toHaveBeenCalledTimes(1);
    expect(handlers.onSplitVertical).toHaveBeenCalledTimes(1);
    expect(handlers.onMerge).toHaveBeenCalledTimes(1);
    expect(handlers.onToggleCollapsed).toHaveBeenCalledTimes(1);
    expect(handlers.onHide).toHaveBeenCalledTimes(1);
  });

  it('disables "Merge with sibling" when canMerge is false', () => {
    renderMenu({ canMerge: false });
    openMenu();
    expect(
      screen.getByRole("menuitem", { name: "Merge with sibling" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it('shows "Expand pane" when isCollapsed is true', () => {
    renderMenu({ isCollapsed: true });
    openMenu();
    expect(
      screen.getByRole("menuitem", { name: "Expand pane" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Collapse pane" }),
    ).not.toBeInTheDocument();
  });

  it("fires telemetry when the menu opens", () => {
    renderMenu({ paneId: "rx" });
    openMenu();
    expect(trackCockpitV2RLayoutUxContextMenuOpened).toHaveBeenCalledWith({
      paneId: "rx",
    });
  });
});

describe("<PaneContextMenu> Move submenu (cpf-05)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'Move pane to…' submenu when moveTargets + onMove are provided", () => {
    renderMenu({
      moveTargets: [
        { kind: "tab-into", groupId: "__tabs_1", label: "Plan" },
      ],
      onMove: vi.fn(),
    });
    openMenu();
    expect(screen.getByTestId("move-submenu-trigger")).toHaveTextContent(
      "Move pane to…",
    );
  });

  it("does not render the submenu when moveTargets is undefined", () => {
    renderMenu({ onMove: vi.fn() });
    openMenu();
    expect(screen.queryByTestId("move-submenu-trigger")).not.toBeInTheDocument();
  });

  it("renders one item per tab-into target", () => {
    renderMenu({
      moveTargets: [
        { kind: "tab-into", groupId: "__tabs_0", label: "Chart" },
        { kind: "tab-into", groupId: "__tabs_1", label: "Plan" },
      ],
      onMove: vi.fn(),
    });
    openMenu();
    expect(
      screen.getByRole("menuitem", { name: "Chart" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Plan" }),
    ).toBeInTheDocument();
  });

  it("always renders 'New split — right' + 'New split — below' below the tab targets", () => {
    renderMenu({
      moveTargets: [{ kind: "tab-into", groupId: "__tabs_0", label: "Rx" }],
      onMove: vi.fn(),
    });
    openMenu();
    expect(
      screen.getByRole("menuitem", { name: "New split — right" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "New split — below" }),
    ).toBeInTheDocument();
  });

  it("invokes onMove with the correct target on click", () => {
    const onMove = vi.fn();
    renderMenu({
      moveTargets: [
        { kind: "tab-into", groupId: "__tabs_1", label: "History" },
      ],
      onMove,
    });
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "History" }));
    expect(onMove).toHaveBeenCalledWith({
      kind: "tab-into",
      groupId: "__tabs_1",
      label: "History",
    });

    openMenu();
    fireEvent.click(
      screen.getByRole("menuitem", { name: "New split — right" }),
    );
    expect(onMove).toHaveBeenCalledWith({ kind: "split-horizontal" });

    openMenu();
    fireEvent.click(
      screen.getByRole("menuitem", { name: "New split — below" }),
    );
    expect(onMove).toHaveBeenCalledWith({ kind: "split-vertical" });
  });

  it("disables the submenu (with tooltip) when moveDisabled is set", () => {
    renderMenu({
      moveTargets: [{ kind: "tab-into", groupId: "__tabs_0", label: "Body" }],
      onMove: vi.fn(),
      moveDisabled: { reason: "Pause the consult before rearranging." },
    });
    openMenu();
    const trigger = screen.getByTestId("move-submenu-trigger");
    expect(trigger).toHaveAttribute("aria-disabled", "true");
    expect(trigger).toHaveAttribute(
      "title",
      "Pause the consult before rearranging.",
    );
  });
});
