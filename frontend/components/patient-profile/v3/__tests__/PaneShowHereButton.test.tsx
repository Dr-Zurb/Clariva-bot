import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import PaneShowHereButton from "@/components/patient-profile/v3/PaneShowHereButton";

function renderShowHere(
  props: React.ComponentProps<typeof PaneShowHereButton>,
) {
  return render(
    <TooltipProvider>
      <PaneShowHereButton {...props} />
    </TooltipProvider>,
  );
}

function openDropdown(trigger: Element) {
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
    bubbles: true,
    cancelable: true,
  });
  fireEvent.click(trigger);
}

describe("PaneShowHereButton", () => {
  it("renders a compact swap icon; picks call onSelect", () => {
    const onSelect = vi.fn();
    renderShowHere({
      currentTitle: "Assessment",
      options: [
        { id: "body", title: "Consult" },
        { id: "plan", title: "Plan" },
        { id: "subjective", title: "Subjective" },
      ],
      onSelect,
    });

    const btn = screen.getByTestId("pane-show-here-button");
    expect(btn).toHaveAccessibleName("Swap into this slot: Assessment");
    expect(screen.queryByText("Show here")).not.toBeInTheDocument();

    openDropdown(btn);
    expect(screen.getByText("Swap into this slot")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("pane-show-here-pick-body"));
    expect(onSelect).toHaveBeenCalledWith("body");
  });

  it("disables when no options", () => {
    renderShowHere({
      currentTitle: "Plan",
      options: [],
      onSelect: vi.fn(),
    });
    expect(screen.getByTestId("pane-show-here-button")).toBeDisabled();
  });
});
