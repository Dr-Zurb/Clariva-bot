import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import PaneShowHereButton, {
  iconRowWidthPx,
  nextSwapDensity,
  orderSwapOptions,
  SWAP_HYSTERESIS_PX,
  SWAP_SAFE_GAP_PX,
} from "@/components/patient-profile/v3/PaneShowHereButton";

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

const clinicalOptions = [
  { id: "plan", title: "Plan" },
  { id: "assessment", title: "Assessment" },
  { id: "body", title: "Consult" },
  { id: "objective", title: "Objective" },
] as const;

describe("orderSwapOptions", () => {
  it("orders Consult → S → O → A → P regardless of input order", () => {
    const ordered = orderSwapOptions([
      { id: "plan", title: "Plan" },
      { id: "assessment", title: "Assessment" },
      { id: "body", title: "Consult" },
      { id: "objective", title: "Objective" },
      { id: "subjective", title: "Subjective" },
    ]);
    expect(ordered.map((o) => o.id)).toEqual([
      "body",
      "subjective",
      "objective",
      "assessment",
      "plan",
    ]);
  });

  it("keeps unknown panes after the clinical set, in input order", () => {
    const ordered = orderSwapOptions([
      { id: "history", title: "History" },
      { id: "plan", title: "Plan" },
      { id: "snapshot", title: "Snapshot" },
      { id: "body", title: "Consult" },
    ]);
    expect(ordered.map((o) => o.id)).toEqual([
      "body",
      "plan",
      "history",
      "snapshot",
    ]);
  });
});

describe("nextSwapDensity (gap / proximity)", () => {
  it("collapses before the safe air gap is consumed", () => {
    expect(
      nextSwapDensity({
        gapPx: SWAP_SAFE_GAP_PX - 1,
        titleTruncated: false,
        current: "expanded",
        iconCount: 4,
      }),
    ).toBe("collapsed");
    expect(
      nextSwapDensity({
        gapPx: SWAP_SAFE_GAP_PX,
        titleTruncated: false,
        current: "expanded",
        iconCount: 4,
      }),
    ).toBe("expanded");
  });

  it("collapses when a tab title is truncated even if gap looks fine", () => {
    expect(
      nextSwapDensity({
        gapPx: 80,
        titleTruncated: true,
        current: "expanded",
        iconCount: 4,
      }),
    ).toBe("collapsed");
  });

  it("expands when collapsed gap still leaves a safe gap after the icon row", () => {
    const iconsPx = iconRowWidthPx(4);
    const justShort = SWAP_SAFE_GAP_PX + SWAP_HYSTERESIS_PX + iconsPx - 1;
    const enough = SWAP_SAFE_GAP_PX + SWAP_HYSTERESIS_PX + iconsPx;
    expect(
      nextSwapDensity({
        gapPx: justShort,
        titleTruncated: false,
        current: "collapsed",
        iconCount: 4,
      }),
    ).toBe("collapsed");
    expect(
      nextSwapDensity({
        gapPx: enough,
        titleTruncated: false,
        current: "collapsed",
        iconCount: 4,
      }),
    ).toBe("expanded");
  });

  it("supports legacy (gapPx, current, iconCount) call shape", () => {
    expect(nextSwapDensity(4, "expanded", 4)).toBe("collapsed");
    expect(nextSwapDensity(40, "expanded", 4)).toBe("expanded");
  });
});

describe("PaneShowHereButton", () => {
  it("expanded: icon row in clinical order; pick calls onSelect", () => {
    const onSelect = vi.fn();
    renderShowHere({
      currentTitle: "Subjective",
      options: [...clinicalOptions],
      onSelect,
      density: "expanded",
    });

    const group = screen.getByTestId("pane-show-here-button");
    expect(group).toHaveAttribute("data-density", "expanded");
    expect(group).toHaveAccessibleName("Swap into this slot: Subjective");
    expect(screen.getByTestId("pane-show-here-swap-glyph")).toHaveAccessibleName(
      "Swap another pane into this slot",
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    const picks = within(group)
      .getAllByTestId(/pane-show-here-pick-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(picks).toEqual([
      "pane-show-here-pick-body",
      "pane-show-here-pick-objective",
      "pane-show-here-pick-assessment",
      "pane-show-here-pick-plan",
    ]);

    fireEvent.click(screen.getByTestId("pane-show-here-pick-body"));
    expect(onSelect).toHaveBeenCalledWith("body");
  });

  it("collapsed: ⇄ opens dropdown with ordered picks", () => {
    const onSelect = vi.fn();
    renderShowHere({
      currentTitle: "Subjective",
      options: [...clinicalOptions],
      onSelect,
      density: "collapsed",
    });

    const group = screen.getByTestId("pane-show-here-button");
    expect(group).toHaveAttribute("data-density", "collapsed");
    expect(screen.getByTestId("pane-show-here-icon-row")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    const glyph = screen.getByTestId("pane-show-here-swap-glyph");
    openDropdown(glyph);
    expect(screen.getByText("Swap into this slot")).toBeInTheDocument();

    const menuPicks = screen
      .getAllByTestId(/pane-show-here-pick-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(menuPicks).toEqual([
      "pane-show-here-pick-body",
      "pane-show-here-pick-objective",
      "pane-show-here-pick-assessment",
      "pane-show-here-pick-plan",
    ]);

    fireEvent.click(screen.getByTestId("pane-show-here-pick-plan"));
    expect(onSelect).toHaveBeenCalledWith("plan");
  });

  it("shows no pick targets when no options", () => {
    renderShowHere({
      currentTitle: "Plan",
      options: [],
      onSelect: vi.fn(),
      density: "expanded",
    });
    const group = screen.getByTestId("pane-show-here-button");
    expect(group).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.queryByTestId(/pane-show-here-pick-/),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("pane-show-here-swap-glyph")).toHaveAccessibleName(
      "Only Plan is available here",
    );
  });
});
