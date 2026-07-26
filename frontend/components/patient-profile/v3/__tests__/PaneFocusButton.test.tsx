import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import PaneFocusButton, {
  isFocusTargetForLeaf,
} from "@/components/patient-profile/v3/PaneFocusButton";

function renderFocusButton(
  props: React.ComponentProps<typeof PaneFocusButton>,
) {
  return render(
    <TooltipProvider>
      <PaneFocusButton {...props} />
    </TooltipProvider>,
  );
}

/** Open a Radix UI DropdownMenu trigger in jsdom. */
function openDropdown(trigger: Element) {
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
    bubbles: true,
    cancelable: true,
  });
  fireEvent.click(trigger);
}

const idleHandlers = () => ({
  onSelectRatio: vi.fn(),
  onRestore: vi.fn(),
});

describe("PaneFocusButton", () => {
  it("idle: offers Full · ⅔ · ½ · ⅓; no Restore; no Beside section", () => {
    const handlers = idleHandlers();
    renderFocusButton({
      paneTitle: "Plan",
      pressed: false,
      ...handlers,
    });

    const btn = screen.getByRole("button", { name: "Plan layout options" });
    expect(btn).toHaveAttribute("aria-pressed", "false");

    openDropdown(btn);
    expect(screen.getByTestId("pane-focus-ratio-full")).toBeInTheDocument();
    expect(screen.getByTestId("pane-focus-ratio-wide")).toBeInTheDocument();
    expect(screen.getByTestId("pane-focus-ratio-even")).toBeInTheDocument();
    expect(screen.getByTestId("pane-focus-ratio-narrow")).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Restore Plan" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Beside")).not.toBeInTheDocument();
    expect(screen.queryByText(/Primary/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("pane-focus-ratio-full"));
    expect(handlers.onSelectRatio).toHaveBeenCalledWith("full");
  });

  it("pressed: Restore + ratios; no Beside list", () => {
    const handlers = idleHandlers();
    renderFocusButton({
      paneTitle: "Plan",
      pressed: true,
      ratio: "wide",
      ...handlers,
    });

    openDropdown(screen.getByRole("button", { name: "Plan layout session" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Restore Plan" }));
    expect(handlers.onRestore).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Beside")).not.toBeInTheDocument();
  });

  it("idle: Narrow menu item calls onSelectRatio('narrow')", () => {
    const handlers = idleHandlers();
    renderFocusButton({
      paneTitle: "Plan",
      pressed: false,
      ...handlers,
    });

    openDropdown(screen.getByRole("button", { name: "Plan layout options" }));
    fireEvent.click(screen.getByTestId("pane-focus-ratio-narrow"));
    expect(handlers.onSelectRatio).toHaveBeenCalledWith("narrow");
  });
});

describe("isFocusTargetForLeaf", () => {
  it("matches host id or a pane id in the leaf", () => {
    expect(isFocusTargetForLeaf("plan", "plan", ["plan"])).toBe(true);
    expect(
      isFocusTargetForLeaf("objective", "__tabs_so", ["subjective", "objective"]),
    ).toBe(true);
    expect(
      isFocusTargetForLeaf("__tabs_so", "__tabs_so", ["subjective", "objective"]),
    ).toBe(true);
    expect(
      isFocusTargetForLeaf("plan", "__tabs_so", ["subjective", "objective"]),
    ).toBe(false);
    expect(isFocusTargetForLeaf(null, "plan", ["plan"])).toBe(false);
  });
});
