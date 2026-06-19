/**
 * cv3p-01 — anchored chrome re-parent regression (R-CHROME3).
 *
 * Proves shell-docked SafetyStickyStrip + PlanActionFooter survive v3 drag
 * reshapes and that the footer still fires via page-root provider scope.
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
import fs from "node:fs";
import path from "node:path";
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
import {
  RxFormActionsBridgeProvider,
  useRegisterRxFormActions,
} from "@/components/cockpit/rx/RxFormActionsContext";
import {
  RxFormProvider,
  createEmptyRxFormFields,
} from "@/components/cockpit/rx/RxFormContext";
import { RxSafetyProvider } from "@/components/cockpit/rx/RxSafetyContext";
import { PlanActionFooter } from "@/components/cockpit/middle/PlanActionFooter";
import { SafetyStickyStrip } from "@/components/cockpit/middle/SafetyStickyStrip";
import type { RxSafetySurfaceValue } from "@/lib/ehr/use-rx-safety-surface";

// ---------------------------------------------------------------------------
// Hoisted controllable mocks
// ---------------------------------------------------------------------------

const mockSendAndFinish = vi.hoisted(() => vi.fn());

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

const safetySurface = vi.hoisted((): RxSafetySurfaceValue => ({
  matchableMedicines: [],
  medicineInstanceIds: ["m-1"],
  allergies: [],
  drugMasterIndex: new Map(),
  setDrugMasterIndex: vi.fn(),
  ddiInteractions: [],
  formAllergyMatches: [],
  isAcked: () => false,
  onAcknowledge: vi.fn(),
  onAckDdi: vi.fn(),
  visible: false,
  clashesCount: 0,
  ddiCount: 0,
}));

const layoutControlRef = vi.hoisted(() => ({
  current: null as { applyLayout: (layout: PatientProfileLayout) => void } | null,
}));

let layoutSeed: PatientProfileLayout;

const sortableCalls: Array<{ id: string; disabled?: boolean }> = [];

// ---------------------------------------------------------------------------
// Mocks — before component imports
// ---------------------------------------------------------------------------

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
  useChartRailEmptySignals: () => chartSignals,
}));

vi.mock("@/components/cockpit/rx/SaveStatusPill", () => ({
  SaveStatusPill: () => <span role="status">Saved</span>,
}));

vi.mock("@/components/cockpit/rx/RxSafetyContext", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/components/cockpit/rx/RxSafetyContext")
  >();
  return {
    ...actual,
    useRxSafety: () => safetySurface,
  };
});

vi.mock("@/components/ehr/AllergyClashBanner", () => ({
  default: () => <div data-testid="allergy-clash-banner">Allergy alert</div>,
}));

vi.mock("@/components/ehr/InteractionChips", () => ({
  default: () => <div data-testid="interaction-chips">DDI</div>,
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
  default: function MockRxPane() {
    const register = useRegisterRxFormActions();
    React.useEffect(() => {
      register({
        sendAndFinish: mockSendAndFinish,
        sending: false,
        finishSending: false,
        canSend: true,
      });
      return () => register(null);
    }, [register]);
    return <div data-testid="pane-plan-body">plan</div>;
  },
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

vi.mock("@dnd-kit/sortable", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/sortable")>();
  return {
    ...actual,
    useSortable: (config: { id: string; disabled?: boolean }) => {
      sortableCalls.push({ id: config.id, disabled: config.disabled });
      return {
        attributes: { "data-sortable-id": config.id },
        listeners: config.disabled ? {} : { "data-listener": "true" },
        setNodeRef: () => {},
        transform: null,
        transition: undefined,
        isDragging: false,
      };
    },
  };
});

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

function renderChromeShell(
  paneTree: PaneTreeNode = telemedDefaultPaneTree(),
  options: {
    state?: "live" | "ended" | "terminal" | "ready";
    consultActive?: boolean;
  } = {},
) {
  const { state = "live", consultActive = false } = options;
  layoutSeed = { version: 5, paneTree };
  storageKeyCounter += 1;
  const storageKey = `test:cv3p-01-reparent:${storageKeyCounter}`;
  localStorage.setItem(
    v4TreeLayoutStorageKey(storageKey),
    JSON.stringify(layoutSeed),
  );
  const prescriptionIdRef = { current: null as string | null };

  return render(
    <RxFormProvider
      appointmentId="appt-1"
      patientId="pat-1"
      token="test-token"
      entryMode="structured"
      initialFields={createEmptyRxFormFields()}
      autosaveEnabled={false}
      prescriptionIdRef={prescriptionIdRef}
      onPrescriptionCreated={() => {}}
    >
      <RxSafetyProvider token="test-token" patientId="pat-1">
        <RxFormActionsBridgeProvider>
          <CockpitV3Shell
            panes={buildCockpitTabs(fixtureCtx(), "telemed-video")}
            storageKey={storageKey}
            consultActive={consultActive}
            safetyDock={<SafetyStickyStrip appointmentId="appt-1" />}
            actionDock={
              <PlanActionFooter
                state={state}
                appointmentId="appt-1"
                finishBusy={false}
              />
            }
          />
        </RxFormActionsBridgeProvider>
      </RxSafetyProvider>
    </RxFormProvider>,
  );
}

function applyPaneTree(paneTree: PaneTreeNode) {
  act(() => {
    layoutControlRef.current?.applyLayout({ version: 5, paneTree });
  });
}

function clickDockedSend() {
  const sendBtn = screen.getByRole("button", { name: /send rx & finish/i });
  fireEvent.click(sendBtn);
}

function assertDocksOutsideDndContext() {
  const safetyDock = screen.getByTestId("cockpit-v3-safety-dock");
  const actionDock = screen.getByTestId("cockpit-v3-action-dock");
  const dndEl = screen.getByTestId("p2-cockpit-v3-dnd-context");

  expect(safetyDock).toBeInTheDocument();
  expect(actionDock).toBeInTheDocument();
  expect(dndEl).not.toContainElement(safetyDock);
  expect(dndEl).not.toContainElement(actionDock);
  expect(safetyDock.querySelector("[data-sortable-id]")).toBeNull();
  expect(actionDock.querySelector("[data-sortable-id]")).toBeNull();
  expect(safetyDock.querySelector("button[aria-label*='close' i]")).toBeNull();
  expect(actionDock.querySelector("button[aria-label*='close' i]")).toBeNull();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cv3p-01: CockpitChrome re-parent (R-CHROME3)", () => {
  beforeEach(() => {
    mockSendAndFinish.mockClear();
    sortableCalls.length = 0;
    chartSignals.isLoading = false;
    safetySurface.visible = false;
    safetySurface.clashesCount = 0;
    safetySurface.ddiCount = 0;
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  describe("docks outside DnD context (P3-DL-1)", () => {
    it("renders safety + action dock test hooks outside p2-cockpit-v3-dnd-context", () => {
      safetySurface.visible = true;
      safetySurface.clashesCount = 1;

      renderChromeShell();

      assertDocksOutsideDndContext();
      expect(screen.getByTestId("plan-action-footer")).toBeInTheDocument();
      expect(screen.getByTestId("safety-sticky-strip")).toBeInTheDocument();
    });

    it("renders both docks on a blank canvas before any pane is added", () => {
      render(
        <CockpitV3Shell
          panes={[{ id: "a", title: "A", render: () => <div>a</div> }]}
          storageKey="cv3p-01-blank"
          safetyDock={<div data-testid="dock-safety-inner">Safety</div>}
          actionDock={<div data-testid="dock-action-inner">Action</div>}
        />,
      );

      expect(screen.getByTestId("cockpit-v3-safety-dock")).toBeInTheDocument();
      expect(screen.getByTestId("cockpit-v3-action-dock")).toBeInTheDocument();
      expect(screen.getByTestId("dock-safety-inner")).toBeInTheDocument();
      expect(screen.getByTestId("dock-action-inner")).toBeInTheDocument();
      expect(screen.getByTestId("cockpit-v3-empty-state")).toBeInTheDocument();
      assertDocksOutsideDndContext();
    });
  });

  describe("footer sends after re-parent (V3-R2 crown jewel)", () => {
    it("fires send on default layout", () => {
      renderChromeShell();
      assertDocksOutsideDndContext();
      clickDockedSend();
      expect(mockSendAndFinish).toHaveBeenCalledOnce();
    });

    it("fires send after plan moves to the chart rail", () => {
      renderChromeShell();
      const moved = reshape(telemedDefaultPaneTree(), "plan", "snapshot", "north");
      applyPaneTree(moved);

      expect(screen.getByTestId("cockpit-v3-action-dock")).toContainElement(
        screen.getByTestId("plan-action-footer"),
      );
      clickDockedSend();
      expect(mockSendAndFinish).toHaveBeenCalledOnce();
    });

    it("fires send after plan is tabbed under snapshot", () => {
      renderChromeShell();
      const tabbed = reshape(telemedDefaultPaneTree(), "plan", "snapshot", "center");
      applyPaneTree(tabbed);

      clickDockedSend();
      expect(mockSendAndFinish).toHaveBeenCalledOnce();
    });

    it("fires send after plan moves to the body column", () => {
      renderChromeShell();
      const moved = reshape(telemedDefaultPaneTree(), "plan", "body", "west");
      applyPaneTree(moved);

      clickDockedSend();
      expect(mockSendAndFinish).toHaveBeenCalledOnce();
    });
  });

  describe("safety strip pinned + unhideable", () => {
    it("keeps safety dock at shell top when plan leaves middle-bottom", () => {
      safetySurface.visible = true;
      safetySurface.clashesCount = 2;

      renderChromeShell();
      const moved = reshape(telemedDefaultPaneTree(), "plan", "history", "north");
      applyPaneTree(moved);

      const safetyDock = screen.getByTestId("cockpit-v3-safety-dock");
      expect(safetyDock).toContainElement(
        screen.getByTestId("safety-sticky-strip"),
      );
      expect(screen.getByTestId("allergy-clash-banner")).toBeInTheDocument();

      const desktop = screen.getByTestId("p1-cockpit-v3-shell-desktop");
      const children = Array.from(desktop.children);
      expect(children[0]).toContainElement(safetyDock);
      assertDocksOutsideDndContext();
    });

    it("surfaces safety strip when a clash is visible", () => {
      safetySurface.visible = true;
      safetySurface.clashesCount = 1;

      renderChromeShell();

      expect(screen.getByTestId("safety-sticky-strip")).toBeInTheDocument();
      expect(screen.getByTestId("allergy-clash-banner")).toBeInTheDocument();
    });
  });

  describe("consult state coverage", () => {
    it("shows footer send in live and ended; hides in terminal", () => {
      renderChromeShell(telemedDefaultPaneTree(), { state: "live" });
      expect(
        screen.getByRole("button", { name: /send rx & finish/i }),
      ).toBeInTheDocument();

      cleanup();
      renderChromeShell(telemedDefaultPaneTree(), { state: "ended" });
      expect(
        screen.getByRole("button", { name: /send rx & finish/i }),
      ).toBeInTheDocument();

      cleanup();
      renderChromeShell(telemedDefaultPaneTree(), { state: "terminal" });
      expect(
        screen.queryByRole("button", { name: /send rx & finish/i }),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("cockpit-v3-action-dock")).toBeInTheDocument();
    });
  });

  describe("body/live guard (v3-DL-6)", () => {
    it("disables body tab drag when consultActive", () => {
      renderChromeShell(telemedDefaultPaneTree(), { consultActive: true });

      const bodySortable = sortableCalls.find((c) => c.id.includes("-body"));
      expect(bodySortable?.disabled).toBe(true);

      const chartSortable = sortableCalls.find((c) => c.id.includes("-snapshot"));
      expect(chartSortable?.disabled).toBe(false);
    });
  });

  describe("forbidden imports (P0-DL-4)", () => {
    const v3Dir = path.resolve(__dirname, "..");
    const testsDir = __dirname;
    const forbiddenImportPatterns = [
      /from\s+["']@\/components\/patient-profile\/Shell/,
      /from\s+["'][^"']*customize-mode-context/,
      /from\s+["'][^"']*PaneDropOverlay/,
    ];

    it("CockpitV3Shell.tsx does not import forbidden modules", () => {
      const source = fs.readFileSync(path.join(v3Dir, "CockpitV3Shell.tsx"), "utf8");
      for (const pattern of forbiddenImportPatterns) {
        expect(source).not.toMatch(pattern);
      }
    });

    for (const file of [
      "CockpitChrome.reparent.test.tsx",
      "CockpitChrome.leafAnchor.test.tsx",
    ]) {
      it(`${file} does not import forbidden modules`, () => {
        const source = fs.readFileSync(path.join(testsDir, file), "utf8");
        for (const pattern of forbiddenImportPatterns) {
          expect(source).not.toMatch(pattern);
        }
      });
    }
  });
});
