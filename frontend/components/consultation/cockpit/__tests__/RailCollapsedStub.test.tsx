/**
 * RailCollapsedStub — unit tests (Vitest + RTL)
 *
 * cc-12 / polish-round-3 acceptance criteria:
 *   1. ALWAYS renders the expand chevron in a top header band (h-10
 *      with a border-b) regardless of whether a `renderer` is
 *      provided. This is the polish-round-3 refactor: the chevron
 *      is no longer owned by renderers, so all collapsed rails share
 *      the same chevron / header chrome.
 *   2. The body area renders either the default vertical-text label
 *      (when no `renderer` is provided) or the `renderer`'s output.
 *   3. Renderer receives `side`, `label`, `onExpand`, `ariaKeyShortcuts` props.
 *   4. The wrapper `<aside>` keeps its `aria-label` regardless of renderer.
 *
 * Run: `pnpm --filter frontend vitest run frontend/components/consultation/cockpit/__tests__/RailCollapsedStub.test.tsx`
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

import RailCollapsedStub from "../RailCollapsedStub";
import type { RailCollapsedStubRendererProps } from "../RailCollapsedStub";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RailCollapsedStub — top chevron header band (always rendered)", () => {
  it("renders the expand chevron at the top regardless of renderer prop", () => {
    render(
      <RailCollapsedStub side="left" label="Patient chart" onExpand={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: /expand patient chart/i }),
    ).toBeInTheDocument();
  });

  it("STILL renders the top chevron when a custom renderer is provided", () => {
    render(
      <RailCollapsedStub
        side="left"
        label="Patient chart"
        onExpand={vi.fn()}
        renderer={() => <div data-testid="custom-body">body</div>}
      />,
    );
    // Top chevron is owned by `<RailCollapsedStub>` post polish-round-3
    // and is NOT replaced by the renderer.
    expect(
      screen.getByRole("button", { name: /expand patient chart/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("custom-body")).toBeInTheDocument();
  });

  it("calls onExpand when the top chevron is clicked", () => {
    const onExpand = vi.fn();
    render(
      <RailCollapsedStub side="right" label="Prescription" onExpand={onExpand} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /expand prescription/i }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("advertises ariaKeyShortcuts on the top chevron when provided", () => {
    render(
      <RailCollapsedStub
        side="left"
        label="Patient chart"
        onExpand={vi.fn()}
        ariaKeyShortcuts="["
      />,
    );
    const btn = screen.getByRole("button", { name: /expand patient chart/i });
    expect(btn).toHaveAttribute("aria-keyshortcuts", "[");
  });
});

describe("RailCollapsedStub — body area", () => {
  it("renders the default vertical-text label when no renderer is provided", () => {
    render(
      <RailCollapsedStub side="left" label="Patient chart" onExpand={vi.fn()} />,
    );
    expect(screen.getByText("Patient chart")).toBeInTheDocument();
  });

  it("renders the renderer's output in the body when one is provided", () => {
    const customRenderer = () => (
      <div data-testid="custom-renderer">Custom collapsed content</div>
    );

    render(
      <RailCollapsedStub
        side="left"
        label="Patient chart"
        onExpand={vi.fn()}
        renderer={customRenderer}
      />,
    );

    expect(screen.getByTestId("custom-renderer")).toBeInTheDocument();
    expect(screen.getByText("Custom collapsed content")).toBeInTheDocument();
  });

  it("passes side, label, onExpand, and ariaKeyShortcuts to the renderer", () => {
    const receivedProps: Partial<RailCollapsedStubRendererProps> = {};
    const capturingRenderer = (props: RailCollapsedStubRendererProps) => {
      Object.assign(receivedProps, props);
      return <div>captured</div>;
    };

    const onExpand = vi.fn();
    render(
      <RailCollapsedStub
        side="right"
        label="Prescription"
        onExpand={onExpand}
        ariaKeyShortcuts="]"
        renderer={capturingRenderer}
      />,
    );

    expect(receivedProps.side).toBe("right");
    expect(receivedProps.label).toBe("Prescription");
    expect(receivedProps.onExpand).toBe(onExpand);
    expect(receivedProps.ariaKeyShortcuts).toBe("]");
  });

  it("does NOT render the default vertical-text label when a renderer is provided", () => {
    render(
      <RailCollapsedStub
        side="left"
        label="Patient chart"
        onExpand={vi.fn()}
        renderer={() => <div>custom body</div>}
      />,
    );
    // The default vertical label ("Patient chart") must not appear in the
    // body when a renderer is provided.
    expect(screen.queryByText("Patient chart")).not.toBeInTheDocument();
  });
});

describe("RailCollapsedStub — wrapper <aside> aria-label", () => {
  it("keeps the aria-label on the wrapper <aside> when no renderer is provided", () => {
    render(
      <RailCollapsedStub side="left" label="Patient chart" onExpand={vi.fn()} />,
    );
    expect(
      screen.getByRole("complementary", { name: "Patient chart (collapsed)" }),
    ).toBeInTheDocument();
  });

  it("keeps the aria-label on the wrapper <aside> when a custom renderer is provided", () => {
    render(
      <RailCollapsedStub
        side="right"
        label="Prescription"
        onExpand={vi.fn()}
        renderer={() => <div>custom</div>}
      />,
    );
    expect(
      screen.getByRole("complementary", { name: "Prescription (collapsed)" }),
    ).toBeInTheDocument();
  });
});
