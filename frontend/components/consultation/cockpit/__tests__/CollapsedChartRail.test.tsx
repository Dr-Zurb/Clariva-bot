/**
 * CollapsedChartRail — unit tests (Vitest + RTL).
 *
 * cc-13 / polish-round-3: verifies the section-icon renderer for the
 * collapsed chart rail. Post polish-round-3, this renderer no longer
 * owns the expand chevron — that's centralised in
 * `<RailCollapsedStub>`'s top header band. So the assertions here
 * focus on the section-icon stack only.
 *
 * Run:
 *   pnpm --filter frontend vitest run frontend/components/consultation/cockpit/__tests__/CollapsedChartRail.test.tsx
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

import CollapsedChartRail from "@/components/consultation/cockpit/CollapsedChartRail";

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------

// shadcn Tooltip — render TooltipContent children inline so aria-labels and
// tooltip text are queryable without async hover mechanics.
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="tooltip-content">{children}</span>
  ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECTION_LABELS = ["Allergies", "Conditions", "Problems", "Vitals", "Previous Rx"];

function renderRail(
  overrides: Partial<React.ComponentProps<typeof CollapsedChartRail>> = {},
) {
  const onExpand = vi.fn();
  const result = render(
    <CollapsedChartRail
      side="left"
      label="Patient chart"
      onExpand={onExpand}
      ariaKeyShortcuts="["
      {...overrides}
    />,
  );
  return { ...result, onExpand };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CollapsedChartRail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders one button per chart section (chevron is owned by RailCollapsedStub)", () => {
    renderRail();

    // One section button per section
    for (const label of SECTION_LABELS) {
      expect(screen.getByRole("button", { name: new RegExp(`jump to ${label}`, "i") })).toBeInTheDocument();
    }

    // Total: 5 section buttons (chevron is rendered by RailCollapsedStub
    // post polish-round-3 and is NOT this component's responsibility).
    expect(screen.getAllByRole("button")).toHaveLength(SECTION_LABELS.length);
  });

  it("does NOT render its own expand chevron (owned by RailCollapsedStub)", () => {
    renderRail();
    expect(
      screen.queryByRole("button", { name: /expand patient chart/i }),
    ).not.toBeInTheDocument();
  });

  it("clicking a section button calls onExpand AND requests a scroll", () => {
    // Stub requestAnimationFrame to run the callback synchronously.
    const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
      (cb) => { cb(0); return 0; },
    );

    // Provide a DOM element for getElementById to return.
    const mockEl = { scrollIntoView: vi.fn() };
    vi.spyOn(document, "getElementById").mockReturnValue(mockEl as unknown as HTMLElement);

    const { onExpand } = renderRail();

    fireEvent.click(screen.getByRole("button", { name: /jump to allergies/i }));

    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(rafSpy).toHaveBeenCalledTimes(1);
    expect(document.getElementById).toHaveBeenCalledWith("chart-section-allergies");
    expect(mockEl.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("gracefully skips scroll when the section element is not in the DOM yet", () => {
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
      (cb) => { cb(0); return 0; },
    );
    vi.spyOn(document, "getElementById").mockReturnValue(null);

    const { onExpand } = renderRail();

    // Should not throw.
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: /jump to vitals/i })),
    ).not.toThrow();
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("tooltip text matches the section label for each section", () => {
    renderRail();

    const tooltips = screen.getAllByTestId("tooltip-content");
    const tooltipTexts = tooltips.map((el) => el.textContent);

    // Must include all 5 section labels (the "Expand chart" tooltip moved
    // to `<RailCollapsedStub>` along with the chevron).
    for (const label of SECTION_LABELS) {
      expect(tooltipTexts).toContain(label);
    }
  });

  it("renders the same section list regardless of side prop", () => {
    // The chevron direction used to vary by `side`, but post polish-round-3
    // the chevron is owned by `<RailCollapsedStub>`. This renderer is now
    // side-agnostic except for tooltip placement, which is asserted
    // indirectly via the absence of layout-shift bugs in the snapshot tests.
    renderRail({ side: "right", label: "Prescription" });
    for (const label of SECTION_LABELS) {
      expect(screen.getByRole("button", { name: new RegExp(`jump to ${label}`, "i") })).toBeInTheDocument();
    }
  });
});
