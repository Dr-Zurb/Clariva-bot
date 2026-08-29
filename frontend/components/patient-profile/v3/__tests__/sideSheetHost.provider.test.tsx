/**
 * P5 — SideSheetHost provider-gap regression.
 *
 * Real-body smoke test for the crash doctors hit when adding the Plan tab
 * from the palette: that pane (PlanSection, Rx
 * favorites / previous-Rx) call `useSideSheet()`, which throws when no
 * `<SideSheetHost>` is mounted above them. The prior build-up parity tests
 * mocked those panes to inert stubs, so the gap slipped through.
 *
 * Here we mount a pane that calls the REAL `useSideSheet()` hook inside the
 * REAL `CockpitV3Shell`, add it from the palette, and assert it renders. We
 * also lock the hook's guard (it must throw without a host) — that guard is
 * exactly why `PatientProfilePage` now wraps both shells in `<SideSheetHost>`.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: vi.fn(() => true),
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

import CockpitV3Shell from "../CockpitV3Shell";
import SideSheetHost, { useSideSheet } from "@/components/patient-profile/SideSheetHost";
import type { PaneDefinition } from "@/lib/patient-profile/v3/foundation";

/** A pane body that exercises the REAL side-sheet context (like PlanSection). */
function SideSheetConsumerBody() {
  const sheet = useSideSheet();
  return (
    <div data-testid="side-sheet-consumer">
      {typeof sheet.open === "function" ? "ok" : "missing"}
    </div>
  );
}

function consumerRegistry(): PaneDefinition[] {
  return [
    {
      id: "plan",
      title: "Plan",
      render: () => <SideSheetConsumerBody />,
    },
  ];
}

let storageKeyCounter = 0;

describe("P5: side-sheet panes mount under a host in the v3 shell", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("adding a useSideSheet pane from the palette renders without crashing (host present)", async () => {
    storageKeyCounter += 1;
    render(
      <SideSheetHost>
        <CockpitV3Shell
          panes={consumerRegistry()}
          storageKey={`test:p5-sidesheet:${storageKeyCounter}`}
        />
      </SideSheetHost>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("cockpit-v3-empty-state")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Add Plan" }));

    await waitFor(() => {
      expect(screen.getByTestId("side-sheet-consumer")).toBeInTheDocument();
    });
    // The pane resolved the real context (open() is a function), proving the
    // host is wired — not a no-op fallback. Before the page-root SideSheetHost
    // fix, mounting this pane threw "useSideSheet() must be used within
    // <SideSheetHost>" — the exact crash on Add Plan. (The hook's
    // no-host guard itself is covered by SideSheetHost.test.tsx.)
    expect(screen.getByTestId("side-sheet-consumer")).toHaveTextContent("ok");
  });
});
