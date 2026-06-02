/**
 * cv3p-01 — leaf-anchored chart-rail empty-state travels with snapshot (P3-DL-2).
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  dropPaneIntoZone,
  setActiveTab,
  type PaneTreeNode,
} from "@/lib/patient-profile/v3/foundation";
import { convertTemplateToTree } from "@/lib/patient-profile/layout-presets-builtin";
import { layoutNodeToPaneTree } from "@/lib/patient-profile/layout-node-bridge";
import { buildCockpitTabs } from "@/lib/patient-profile/v3/cockpit-tabs";
import {
  getTelemedVideoTemplate,
  type TelemedVideoContext,
} from "@/lib/patient-profile/templates";
import type { PatientProfileLayout } from "@/lib/patient-profile/types";
import { paneTreeToFlat } from "@/lib/patient-profile/layout-tree";
import { v4TreeLayoutStorageKey } from "@/lib/patient-profile/useShellLayout";

// ---------------------------------------------------------------------------
// Hoisted controllable mocks
// ---------------------------------------------------------------------------

const chartSignals = vi.hoisted(() => ({
  signals: {
    allergiesEmpty: true,
    chronicEmpty: true,
    problemListEmpty: true,
    snapshotEmpty: true,
    historyEmpty: true,
  },
  isLoading: false,
}));

const layoutControlRef = vi.hoisted(() => ({
  current: null as { applyLayout: (layout: PatientProfileLayout) => void } | null,
}));

let layoutSeed: PatientProfileLayout;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: vi.fn(() => true),
}));

vi.mock("@/hooks/use-chart-rail-empty-signals", () => ({
  useChartRailEmptySignals: () => chartSignals,
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
  BodyZone: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/cockpit/middle/InvestigationsAutoMerge", () => ({
  InvestigationsAutoMerge: () => null,
}));

vi.mock("@/components/patient-profile/panes/RxPane", () => ({
  default: () => <div data-testid="pane-plan-body">plan</div>,
}));

vi.mock("@/lib/patient-profile/useShellLayout", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/patient-profile/useShellLayout")
  >();
  return {
    ...actual,
    useShellLayout: () => {
      const [layout, setLayout] = useState(layoutSeed);
      const flat = useMemo(
        () => paneTreeToFlat(layout.paneTree),
        [layout.paneTree],
      );
      const applyLayout = useCallback((next: PatientProfileLayout) => {
        setLayout(next);
      }, []);
      layoutControlRef.current = { applyLayout };
      const setActiveTabOnTree = useCallback(
        (groupId: string, paneId: string) => {
          setLayout((prev) => {
            const result = setActiveTab(prev.paneTree, groupId, paneId);
            if (!result.ok) return prev;
            return { ...prev, paneTree: result.tree };
          });
        },
        [],
      );
      return {
        paneOrder: flat.paneOrder,
        paneState: flat.paneState,
        paneTree: layout.paneTree,
        reorderPane: vi.fn(),
        setPaneHidden: vi.fn(),
        setLeafSize: vi.fn(),
        applyLayout,
        resetLayout: vi.fn(),
        setLeafIdsHidden: vi.fn(),
        layoutVersion: 0,
        hydrated: true,
        setActiveTab: setActiveTabOnTree,
        setPaneSize: vi.fn(),
        setGroupSizes: vi.fn(),
      };
    },
  };
});

vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({
    children,
    id,
  }: {
    children: React.ReactNode;
    id?: string;
  }) => (
    <div data-panel-group data-group-id={id}>
      {children}
    </div>
  ),
  ResizablePanel: ({
    children,
    "data-pane-id": dataPaneId,
  }: {
    children?: React.ReactNode;
    "data-pane-id"?: string;
  }) => <div data-panel data-pane-id={dataPaneId}>{children}</div>,
  ResizableHandle: () => <div data-separator role="separator" />,
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import CockpitV3Shell from "../CockpitV3Shell";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
      appointment_date: "2026-05-14T10:00:00Z",
      status: "confirmed",
      created_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
      consultation_session: null,
    },
    token: "test-token",
    state: "live",
  };
}

function telemedDefaultPaneTree(): PaneTreeNode {
  const template = getTelemedVideoTemplate(fixtureCtx());
  return layoutNodeToPaneTree(convertTemplateToTree(template));
}

function reshape(
  base: PaneTreeNode,
  sourcePaneId: string,
  targetGroupId: string,
  zone: "north" | "south" | "east" | "west" | "center",
): PaneTreeNode {
  const result = dropPaneIntoZone(base, sourcePaneId, targetGroupId, zone);
  if (!result.ok) {
    throw new Error(
      `dropPaneIntoZone(${sourcePaneId} → ${targetGroupId} ${zone}) failed: ${result.reason}`,
    );
  }
  return result.tree;
}

let storageKeyCounter = 0;

function renderLeafAnchorShell(paneTree: PaneTreeNode = telemedDefaultPaneTree()) {
  layoutSeed = { version: 5, paneTree };
  storageKeyCounter += 1;
  const storageKey = `test:cv3p-01-leaf:${storageKeyCounter}`;
  localStorage.setItem(
    v4TreeLayoutStorageKey(storageKey),
    JSON.stringify(layoutSeed),
  );

  return render(
    <CockpitV3Shell
      panes={buildCockpitTabs(fixtureCtx(), "telemed-video")}
      storageKey={storageKey}
    />,
  );
}

function applyPaneTree(paneTree: PaneTreeNode) {
  act(() => {
    layoutControlRef.current?.applyLayout({ version: 5, paneTree });
  });
}

/** ChartRailWithEmptyState wrapper — leaf-anchored on snapshot's render. */
function snapshotChartRailWrapper(): HTMLElement {
  const body = screen.getByTestId("pane-snapshot-body");
  const wrapper = body.parentElement?.parentElement;
  expect(wrapper).not.toBeNull();
  return wrapper as HTMLElement;
}

function expectEmptyStateWithSnapshot() {
  const emptyCard = screen.getByText("No patient context yet");
  const wrapper = snapshotChartRailWrapper();
  expect(wrapper).toContainElement(emptyCard);
  expect(wrapper).toContainElement(screen.getByTestId("pane-snapshot-body"));
  return emptyCard;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cv3p-01: leaf-anchored empty-state (P3-DL-2)", () => {
  beforeEach(() => {
    chartSignals.isLoading = false;
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders chart-rail empty-state inside snapshot on default layout", () => {
    renderLeafAnchorShell();

    expect(screen.getByTestId("pane-snapshot-body")).toBeInTheDocument();
    expectEmptyStateWithSnapshot();
  });

  it("keeps empty-state with snapshot after snapshot leaves the chart rail", () => {
    renderLeafAnchorShell();
    expectEmptyStateWithSnapshot();

    const moved = reshape(telemedDefaultPaneTree(), "snapshot", "body", "west");
    applyPaneTree(moved);

    const emptyCard = expectEmptyStateWithSnapshot();
    expect(screen.queryByTestId("pane-history-body")?.parentElement).not.toContainElement(
      emptyCard,
    );
  });

  it("keeps empty-state with snapshot after snapshot is tabbed with history", () => {
    renderLeafAnchorShell();
    expectEmptyStateWithSnapshot();

    const tabbed = reshape(telemedDefaultPaneTree(), "history", "snapshot", "center");
    applyPaneTree(tabbed);

    fireEvent.click(screen.getByRole("tab", { name: /SNAPSHOT/i }));
    expectEmptyStateWithSnapshot();
    expect(screen.getByTestId("pane-snapshot-body")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /HISTORY/i })).toBeInTheDocument();
  });

  it("snapshot body testid remains mounted after snapshot is moved", () => {
    renderLeafAnchorShell();
    expect(screen.getByTestId("pane-snapshot-body")).toBeInTheDocument();

    const moved = reshape(telemedDefaultPaneTree(), "snapshot", "body", "west");
    applyPaneTree(moved);

    expect(screen.getByTestId("pane-snapshot-body")).toBeInTheDocument();
    expect(
      screen.getByTestId("pane-snapshot-body").closest("[data-cockpit-leaf]"),
    ).not.toBeNull();
  });
});
