/**
 * cv3l-04 — Phase 6 end-to-end integration smoke.
 *
 * Exercises the whole layouts feature against the production registry:
 * seed → switch (menu + hotkey) → undo → reshape/toggle → reset → empty →
 * reload-restores-persisted. Verify-only gate coverage; builds nothing.
 */

import React from "react";
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  cleanup,
} from "@testing-library/react";
import "@testing-library/jest-dom";

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

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: vi.fn(() => true),
}));

vi.mock("@/hooks/use-chart-rail-empty-signals", () => ({
  useChartRailEmptySignals: () => ({
    signals: {
      allergiesEmpty: true,
      chronicEmpty: true,
      problemListEmpty: true,
      snapshotEmpty: true,
      historyEmpty: true,
    },
    isLoading: false,
  }),
}));

vi.mock("@/components/patient-profile/panes/ChartRailWithEmptyState", () => ({
  ChartRailWithEmptyState: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/components/patient-profile/panes/SnapshotPane", () => ({
  default: () => <div data-testid="pane-snapshot-body">snapshot</div>,
}));
vi.mock("@/components/patient-profile/panes/HistoryPane", () => ({
  default: () => <div data-testid="pane-history-body">history</div>,
}));
vi.mock("@/components/patient-profile/panes/ConsultationBodyPane", () => ({
  default: () => <div data-testid="pane-body-body">body</div>,
}));
vi.mock("@/components/patient-profile/panes/InvestigationsPane", () => ({
  default: () => <div data-testid="pane-investigations-body">investigations</div>,
}));
vi.mock("@/components/patient-profile/panes/SubjectivePane", () => ({
  default: () => <div data-testid="pane-subjective-body">subjective</div>,
}));
vi.mock("@/components/patient-profile/panes/ObjectivePane", () => ({
  default: () => <div data-testid="pane-objective-body">objective</div>,
}));
vi.mock("@/components/cockpit/middle/AssessmentStrip", () => ({
  AssessmentStrip: () => <div data-testid="pane-assessment-body">assessment</div>,
}));
vi.mock("@/components/cockpit/middle/BodyZone", () => ({
  BodyZone: () => <div data-testid="pane-body-body">body</div>,
}));
vi.mock("@/components/cockpit/middle/EndedConsultBody", () => ({
  EndedConsultBody: () => <div data-testid="pane-ended-body">ended</div>,
}));
vi.mock("@/components/patient-profile/panes/RxPane", () => ({
  default: () => <div data-testid="pane-plan-body">plan</div>,
}));

import CockpitV3Shell from "../CockpitV3Shell";
import {
  buildCockpitTabs,
  COCKPIT_TAB_ORDER,
} from "@/lib/patient-profile/v3/cockpit-tabs";
import type { TelemedVideoContext } from "@/lib/patient-profile/templates";
import type { PaneDefinition } from "@/lib/patient-profile/v3/foundation";

function fixtureCtx(): TelemedVideoContext {
  return {
    appointment: {
      id: "appt-1",
      doctor_id: "doc-1",
      patient_id: "pat-1",
      patient_name: "Test Patient",
      patient_phone: null,
      patient_age: null,
      patient_sex: null,
      appointment_date: "2026-05-31T10:00:00Z",
      status: "confirmed",
      created_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
      consultation_session: null,
    },
    token: "test-token",
    state: "live",
  };
}

function productionRegistry(): PaneDefinition[] {
  return buildCockpitTabs(fixtureCtx(), "telemed-video");
}

/**
 * Apply a default layout via its registered hotkey (mod+shift+1..4). The menu
 * dropdown + select path is unit-covered in CockpitPalette.test.tsx; Radix's
 * portal menu does not open under synthetic pointer events inside the full
 * shell render in jsdom, so the integration flow drives the same `applyLayout`
 * path through the hotkeys instead.
 */
function applyLayoutHotkey(digit: "1" | "2" | "3" | "4") {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: digit,
        shiftKey: true,
        ctrlKey: true,
        bubbles: true,
      }),
    );
  });
}

async function flushLayoutWrite(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
}

describe("cv3l-04: Phase 6 layouts integration", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
  });

  it("seeds Consult (all eight panes visible) on first open", async () => {
    render(
      <CockpitV3Shell panes={productionRegistry()} storageKey="cv3l-04:seed" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("cockpit-v3-canvas")).toBeInTheDocument();
    });
    for (const id of COCKPIT_TAB_ORDER) {
      expect(
        screen.getByRole("button", { name: `Remove ${labelFor(id)}` }),
      ).toHaveAttribute("data-palette-on-canvas", "true");
    }
    expect(screen.queryByTestId("cockpit-v3-empty-state")).not.toBeInTheDocument();
  });

  it("switches to Read via mod+shift+2 and hides body/investigations/plan", async () => {
    render(
      <CockpitV3Shell panes={productionRegistry()} storageKey="cv3l-04:read" />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("cockpit-v3-canvas")).toBeInTheDocument();
    });

    applyLayoutHotkey("2");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Add Consult" }),
      ).toHaveAttribute("data-palette-on-canvas", "false");
    });
    // Read hides body, investigations-orders, plan.
    expect(
      screen.getByRole("button", { name: "Add Investigations" }),
    ).toHaveAttribute("data-palette-on-canvas", "false");
    expect(
      screen.getByRole("button", { name: "Add Plan" }),
    ).toHaveAttribute("data-palette-on-canvas", "false");
    // Read keeps snapshot/history/assessment/subjective/objective visible.
    expect(
      screen.getByRole("button", { name: "Remove History" }),
    ).toHaveAttribute("data-palette-on-canvas", "true");
  });

  it("switches via mod+shift+3 (Document) hotkey", async () => {
    render(
      <CockpitV3Shell panes={productionRegistry()} storageKey="cv3l-04:hotkey" />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("cockpit-v3-canvas")).toBeInTheDocument();
    });

    applyLayoutHotkey("3");

    // Document hides body + history.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Add History" }),
      ).toHaveAttribute("data-palette-on-canvas", "false");
    });
    expect(
      screen.getByRole("button", { name: "Add Consult" }),
    ).toHaveAttribute("data-palette-on-canvas", "false");
    expect(
      screen.getByRole("button", { name: "Remove Plan" }),
    ).toHaveAttribute("data-palette-on-canvas", "true");
  });

  it("undo restores the prior arrangement after a switch", async () => {
    render(
      <CockpitV3Shell panes={productionRegistry()} storageKey="cv3l-04:undo" />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("cockpit-v3-canvas")).toBeInTheDocument();
    });

    applyLayoutHotkey("2"); // Read
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Add Plan" }),
      ).toHaveAttribute("data-palette-on-canvas", "false");
    });

    fireEvent.click(screen.getByTestId("cockpit-v3-undo"));

    // Back to Consult — all eight visible again.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Remove Plan" }),
      ).toHaveAttribute("data-palette-on-canvas", "true");
    });
    expect(
      screen.getByRole("button", { name: "Remove Consult" }),
    ).toHaveAttribute("data-palette-on-canvas", "true");
  });

  it("Layouts menu can return to Consult after switching to Document", async () => {
    render(
      <CockpitV3Shell panes={productionRegistry()} storageKey="cv3l-04:reset" />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("cockpit-v3-canvas")).toBeInTheDocument();
    });

    applyLayoutHotkey("3"); // Document
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Add History" }),
      ).toHaveAttribute("data-palette-on-canvas", "false");
    });

    applyLayoutHotkey("1"); // Consult (same path as Layouts menu)

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Remove History" }),
      ).toHaveAttribute("data-palette-on-canvas", "true");
    });
    expect(screen.queryByTestId("cockpit-v3-empty-state")).not.toBeInTheDocument();
  });

  it("toggling every pane off yields the polished empty state", async () => {
    render(
      <CockpitV3Shell panes={productionRegistry()} storageKey="cv3l-04:empty" />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("cockpit-v3-canvas")).toBeInTheDocument();
    });

    for (const id of COCKPIT_TAB_ORDER) {
      const btn = screen.queryByRole("button", { name: `Remove ${labelFor(id)}` });
      if (btn) fireEvent.click(btn);
    }

    await waitFor(() => {
      expect(screen.getByTestId("cockpit-v3-empty-state")).toBeInTheDocument();
    });
  });

  it("reload restores the persisted (switched) layout, not the seed", async () => {
    const storageKey = "cv3l-04:reload";
    const { unmount } = render(
      <CockpitV3Shell panes={productionRegistry()} storageKey={storageKey} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("cockpit-v3-canvas")).toBeInTheDocument();
    });

    applyLayoutHotkey("2"); // Read
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Add Plan" }),
      ).toHaveAttribute("data-palette-on-canvas", "false");
    });
    await flushLayoutWrite();
    unmount();

    render(
      <CockpitV3Shell panes={productionRegistry()} storageKey={storageKey} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("cockpit-v3-canvas")).toBeInTheDocument();
    });
    // Persisted Read layout restored: Plan still hidden (not reseeded to Consult).
    expect(
      screen.getByRole("button", { name: "Add Plan" }),
    ).toHaveAttribute("data-palette-on-canvas", "false");
  });
});

/** Palette label for a pane id (body tab is "Consult" live). */
function labelFor(id: string): string {
  const map: Record<string, string> = {
    snapshot: "Snapshot",
    history: "History",
    body: "Consult",
    assessment: "Assessment",
    "investigations-orders": "Investigations",
    plan: "Plan",
    subjective: "Subjective",
    objective: "Objective",
  };
  return map[id] ?? id;
}
