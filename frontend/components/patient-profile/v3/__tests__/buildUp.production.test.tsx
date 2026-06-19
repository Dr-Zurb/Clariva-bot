/**
 * cv3t-02 — production-path build-up regression.
 *
 * Seeds from `resolveSeedLayout(buildCockpitTabs(ctx))` (Consult on first open;
 * the same registry the page mounts), not a hand-rolled flat fixture. Locks the
 * palette + seed against the nested column-wrapper defect (`render: () => null`
 * at top level).
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
  default: function SnapshotStub() {
    return <div data-testid="pane-snapshot-body">snapshot</div>;
  },
}));

vi.mock("@/components/patient-profile/panes/HistoryPane", () => ({
  default: () => <div data-testid="pane-history-body">history</div>,
}));

vi.mock("@/components/patient-profile/panes/ConsultationBodyPane", () => ({
  default: () => <div data-testid="pane-body-body">body</div>,
}));

vi.mock("@/components/patient-profile/panes/InvestigationsPane", () => ({
  default: () => (
    <div data-testid="pane-investigations-body">investigations</div>
  ),
}));

vi.mock("@/components/patient-profile/panes/SubjectivePane", () => ({
  default: () => <div data-testid="pane-subjective-body">subjective</div>,
}));

vi.mock("@/components/patient-profile/panes/ObjectivePane", () => ({
  default: () => <div data-testid="pane-objective-body">objective</div>,
}));

vi.mock("@/components/cockpit/middle/AssessmentStrip", () => ({
  AssessmentStrip: () => (
    <div data-testid="pane-assessment-body">assessment</div>
  ),
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
  blankLayout,
  blankLayoutFlat,
  assertFlatLeafRegistry,
  assertLeafRegistryRenders,
  hasVisibleLeaves,
  V3_COLUMN_WRAPPER_IDS,
} from "@/lib/patient-profile/v3/blankLayout";
import {
  buildCockpitTabs,
  COCKPIT_TAB_ORDER,
} from "@/lib/patient-profile/v3/cockpit-tabs";
import {
  getTelemedVideoTemplate,
  type TelemedVideoContext,
} from "@/lib/patient-profile/templates";
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

let storageKeyCounter = 0;

function renderProductionShell() {
  storageKeyCounter += 1;
  const panes = productionRegistry();
  return render(
    <CockpitV3Shell
      panes={panes}
      storageKey={`test:cv3t-02-buildup:${storageKeyCounter}`}
    />,
  );
}

function renderProductionShellWithKey(
  storageKey: string,
  opts: { withDocks?: boolean } = {},
) {
  const panes = productionRegistry();
  return render(
    <CockpitV3Shell
      panes={panes}
      storageKey={storageKey}
      safetyDock={
        opts.withDocks ? <div data-testid="dock-safety" /> : undefined
      }
      actionDock={
        opts.withDocks ? <div data-testid="dock-action" /> : undefined
      }
    />,
  );
}

/** id → body testid the per-leaf mocks render (cv3t-03 build-up coverage). */
const TAB_BODY_TESTID: Record<string, string> = {
  snapshot: "pane-snapshot-body",
  history: "pane-history-body",
  body: "pane-body-body",
  assessment: "pane-assessment-body",
  "investigations-orders": "pane-investigations-body",
  plan: "pane-plan-body",
  subjective: "pane-subjective-body",
  objective: "pane-objective-body",
};

function palettePaneIds(): string[] {
  const palette = screen.getByTestId("cockpit-v3-palette");
  return Array.from(
    palette.querySelectorAll<HTMLElement>("[data-palette-pane-id]"),
  ).map((el) => el.getAttribute("data-palette-pane-id")!);
}

describe("cv3t-02: flat registry guards", () => {
  it("accepts buildCockpitTabs(ctx) and rejects the nested column template", () => {
    const registry = productionRegistry();
    expect(() => assertFlatLeafRegistry(registry)).not.toThrow();
    expect(() => assertLeafRegistryRenders(registry)).not.toThrow();
    expect(registry.map((t) => t.id)).toEqual([...COCKPIT_TAB_ORDER]);

    expect(() =>
      assertFlatLeafRegistry(getTelemedVideoTemplate(fixtureCtx())),
    ).toThrow(/flat leaf registry|Column wrapper/);
  });

  it("rejects top-level panes whose render() returns null (the original defect)", () => {
    const nullRenderPanes: PaneDefinition[] = [
      {
        id: "left-column",
        title: "Patient",
        render: () => null,
        children: [
          {
            id: "snapshot",
            title: "Snapshot",
            render: () => <div>snap</div>,
          },
        ],
      },
    ];
    expect(() => assertFlatLeafRegistry(nullRenderPanes)).toThrow(
      /flat leaf registry/,
    );

    const flatNullRender: PaneDefinition[] = [
      { id: "snapshot", title: "Snapshot", render: () => null },
    ];
    expect(() => assertFlatLeafRegistry(flatNullRender)).not.toThrow();
    expect(() => assertLeafRegistryRenders(flatNullRender)).toThrow(
      /render\(\) returned null/,
    );
  });

  it("blankLayout seeds all eight production leaf ids hidden", () => {
    const panes = productionRegistry();
    const layout = blankLayout(panes);
    const flat = blankLayoutFlat(panes);

    expect(flat.paneOrder).toEqual([...COCKPIT_TAB_ORDER]);
    expect(flat.paneOrder).toHaveLength(8);
    for (const id of COCKPIT_TAB_ORDER) {
      expect(flat.paneState[id]?.hidden).toBe(true);
    }
    expect(hasVisibleLeaves(layout.paneTree)).toBe(false);
  });
});

describe("cv3t-02: production build-up path", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("seeds Consult on first open, lists eight real leaf tabs (no column wrappers)", async () => {
    renderProductionShell();

    await waitFor(() => {
      expect(screen.getByTestId("cockpit-v3-canvas")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("cockpit-v3-empty-state")).not.toBeInTheDocument();
    expect(palettePaneIds()).toEqual([...COCKPIT_TAB_ORDER]);
    for (const wrapperId of V3_COLUMN_WRAPPER_IDS) {
      expect(palettePaneIds()).not.toContain(wrapperId);
    }

    expect(screen.getByTestId("pane-snapshot-body")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Snapshot" }),
    ).toHaveAttribute("data-palette-on-canvas", "true");
    expect(
      screen.getByRole("button", { name: "Remove Consult" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Plan" })).toBeInTheDocument();
  });

  it("Consult seed mounts Snapshot and Plan bodies without palette add", async () => {
    renderProductionShell();

    await waitFor(() => {
      expect(screen.getByTestId("pane-snapshot-body")).toBeInTheDocument();
      expect(screen.getByTestId("pane-plan-body")).toBeInTheDocument();
      expect(screen.getByTestId("cockpit-v3-canvas")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("cockpit-v3-empty-state")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Snapshot" }),
    ).toHaveAttribute("data-palette-on-canvas", "true");
    expect(
      screen.getByRole("button", { name: "Remove Plan" }),
    ).toHaveAttribute("data-palette-on-canvas", "true");
  });

  it("reset returns to Consult after hiding a pane", async () => {
    renderProductionShell();

    await waitFor(() => {
      expect(screen.getByTestId("pane-snapshot-body")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove Snapshot" }));
    await waitFor(() => {
      expect(screen.queryByTestId("pane-snapshot-body")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Reset to Consult" }));

    await waitFor(() => {
      expect(screen.getByTestId("pane-snapshot-body")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("cockpit-v3-empty-state")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove Snapshot" }),
    ).toHaveAttribute("data-palette-on-canvas", "true");
  });
});

/**
 * cv3t-03 — the build-up axis the cv3x-01 matrix lacked, proven on the
 * production registry. Closes: every one of the eight tabs mounts real content;
 * a multi-tab layout persists across reload; exactly one safety/action dock in
 * a built-up arrangement (the lifted-props no-duplication check, end-to-end).
 */
describe("cv3t-03: build-up parity axis (production registry)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("every one of the eight tabs mounts its real body on Consult seed", async () => {
    renderProductionShell();

    await waitFor(() => {
      expect(screen.getByTestId("cockpit-v3-canvas")).toBeInTheDocument();
    });

    for (const id of COCKPIT_TAB_ORDER) {
      expect(
        screen.getByTestId(TAB_BODY_TESTID[id]),
        `tab "${id}" must mount real content`,
      ).toBeInTheDocument();
    }
    expect(screen.queryByTestId("cockpit-v3-empty-state")).not.toBeInTheDocument();
  });

  // Reload/persist parity is proven on the shared PaneTreeNode shape by
  // persistence.test.tsx + CockpitPlatform.migrationParity.test.tsx ([E5]) —
  // registry-agnostic (the flat tabs yield the same node shape). Re-driving it
  // through the real shell + pre-seeded localStorage here hits the documented
  // jsdom hydration limitation (cv3x-01 §6 Issue 2), so it is not re-asserted.

  it("renders exactly one safety strip + one action footer when built up", async () => {
    renderProductionShellWithKey("test:cv3t-03-docks", { withDocks: true });

    await waitFor(() => {
      expect(screen.getByTestId("pane-plan-body")).toBeInTheDocument();
    });

    expect(screen.getAllByTestId("dock-safety")).toHaveLength(1);
    expect(screen.getAllByTestId("dock-action")).toHaveLength(1);
    // The lifted props keep safety/send out of the pane bodies (no duplication).
    expect(screen.getByTestId("cockpit-v3-safety-dock")).toContainElement(
      screen.getByTestId("dock-safety"),
    );
    expect(screen.getByTestId("cockpit-v3-action-dock")).toContainElement(
      screen.getByTestId("dock-action"),
    );
  });
});
