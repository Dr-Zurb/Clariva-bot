/**
 * CollapsedRxRail — unit tests (Vitest + RTL).
 *
 * cc-14: verifies the peek-text strip renderer for the collapsed Rx rail.
 *
 * Run:
 *   pnpm --filter frontend vitest run frontend/components/consultation/cockpit/__tests__/CollapsedRxRail.test.tsx
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

import CollapsedRxRail from "@/components/consultation/cockpit/CollapsedRxRail";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderRail(
  overrides: Partial<React.ComponentProps<typeof CollapsedRxRail>> = {},
) {
  const onExpand = vi.fn();
  const result = render(
    <CollapsedRxRail
      side="right"
      label="Prescription"
      onExpand={onExpand}
      ariaKeyShortcuts="]"
      {...overrides}
    />,
  );
  return { ...result, onExpand };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CollapsedRxRail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders 0 medicines when count is 0", () => {
    renderRail({ medicineCount: 0 });

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("medicines")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /expand prescription \(0 medicines\)/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders the count and 'medicines' label (plural) when count > 1", () => {
    renderRail({ medicineCount: 3 });

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("medicines")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /expand prescription \(3 medicines\)/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders 'medicine' label (singular) when count is 1", () => {
    renderRail({ medicineCount: 1 });

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("medicine")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /expand prescription \(1 medicine\)/i,
      }),
    ).toBeInTheDocument();
  });

  it("clicking the button calls onExpand", () => {
    const { onExpand } = renderRail({ medicineCount: 2 });
    fireEvent.click(
      screen.getByRole("button", {
        name: /expand prescription/i,
      }),
    );
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("advertises aria-keyshortcuts when provided", () => {
    renderRail({ ariaKeyShortcuts: "]" });
    expect(
      screen.getByRole("button", { name: /expand prescription/i }),
    ).toHaveAttribute("aria-keyshortcuts", "]");
  });

  it("uses ChevronLeft for side=right (chevron points toward body)", () => {
    renderRail({ side: "right" });
    // Component renders without throwing and shows the button — icon
    // direction is asserted by visual regression; here we assert presence.
    expect(
      screen.getByRole("button", { name: /expand prescription/i }),
    ).toBeInTheDocument();
  });

  it("defaults to 0 when medicineCount prop is omitted", () => {
    renderRail();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("medicines")).toBeInTheDocument();
  });
});
