/**
 * cpfg-03 — chrome re-parent regression suite.
 *
 * Asserts shell-docked action chrome (footer, safety) survives pane moves and
 * leaf-anchored visual chrome (chart-rail empty-state) travels with snapshot.
 */

import React, { createRef, useCallback, useMemo, useState } from "react";
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
import { paneTreeToFlat, type PaneTreeNode } from "@/lib/patient-profile/layout-tree";
import {
  dropPaneIntoZone,
  setActiveTab,
} from "@/lib/patient-profile/layout-tree-mutations";
import {
  convertTemplateToTree,
} from "@/lib/patient-profile/layout-presets-builtin";
import {
  layoutNodeToPaneTree,
} from "@/lib/patient-profile/layout-node-bridge";
import {
  getTelemedVideoTemplate,
  type TelemedVideoContext,
} from "@/lib/patient-profile/templates";
import type { PatientProfileLayout } from "@/lib/patient-profile/types";
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

let layoutSeed: PatientProfileLayout;

// ---------------------------------------------------------------------------
// Mocks — before component imports
// ---------------------------------------------------------------------------

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

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: ({ children }: { children: React.ReactNode }) => (
      <div data-dnd-context>{children}</div>
    ),
    useDraggable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: () => {},
      isDragging: false,
    }),
    useDroppable: () => ({
      setNodeRef: () => {},
      isOver: false,
    }),
    DragOverlay: ({ children }: { children: React.ReactNode }) => (
      <div data-drag-overlay>{children}</div>
    ),
  };
});

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import PatientProfileShell, {
  type PatientProfileShellHandle,
} from "../Shell";

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

const shellRef = createRef<PatientProfileShellHandle>();
let storageKeyCounter = 0;

function renderChromeShell(paneTree: PaneTreeNode = telemedDefaultPaneTree()) {
  layoutSeed = { version: 5, paneTree };
  storageKeyCounter += 1;
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
          <PatientProfileShell
            ref={shellRef}
            panes={getTelemedVideoTemplate(fixtureCtx())}
            storageKey={`test:chrome-reparent:${storageKeyCounter}`}
            safetyDock={<SafetyStickyStrip appointmentId="appt-1" />}
            actionDock={
              <PlanActionFooter
                state="live"
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
    shellRef.current?.applyLayout({ version: 5, paneTree });
  });
}

function snapshotPaneContainer(): HTMLElement {
  const body = screen.getByTestId("pane-snapshot-body");
  const panel = body.closest("[data-pane-id]");
  expect(panel).not.toBeNull();
  return panel as HTMLElement;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cpfg-03: chrome re-parent regression", () => {
  beforeEach(() => {
    mockSendAndFinish.mockClear();
    chartSignals.isLoading = false;
    safetySurface.visible = false;
    safetySurface.clashesCount = 0;
    safetySurface.ddiCount = 0;
  });

  afterEach(() => {
    cleanup();
  });

  describe("default layout parity (P4-DL-6)", () => {
    it("renders shell-docked footer, safety (when visible), and leaf empty-state", () => {
      safetySurface.visible = true;
      safetySurface.clashesCount = 1;

      renderChromeShell();

      expect(screen.getByTestId("plan-action-footer")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /send rx & finish/i }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("safety-sticky-strip")).toBeInTheDocument();
      expect(screen.getByText("No patient context yet")).toBeInTheDocument();
      expect(snapshotPaneContainer()).toContainElement(
        screen.getByText("No patient context yet"),
      );

      const shell = screen.getByTestId("patient-profile-shell-desktop");
      const dnd = document.querySelector("[data-dnd-context]");
      expect(shell).toContainElement(screen.getByTestId("plan-action-footer"));
      expect(dnd).not.toContainElement(screen.getByTestId("plan-action-footer"));
    });
  });

  describe("plan re-parented — shell footer persists (cpfg-01)", () => {
    it("keeps plan-action-footer in the shell dock after plan moves to the chart rail", () => {
      renderChromeShell();
      const moved = reshape(telemedDefaultPaneTree(), "plan", "snapshot", "north");
      applyPaneTree(moved);

      expect(screen.getByTestId("plan-action-footer")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /send rx & finish/i }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("pane-plan-body")).toBeInTheDocument();
    });
  });

  describe("plan tabbed under snapshot — provider scope (P4-DL-2)", () => {
    it("docked footer calls registered sendAndFinish after plan is tabbed into snapshot", () => {
      renderChromeShell();
      const tabbed = reshape(telemedDefaultPaneTree(), "plan", "snapshot", "center");
      applyPaneTree(tabbed);

      const sendBtn = screen.getByRole("button", { name: /send rx & finish/i });
      fireEvent.click(sendBtn);
      expect(mockSendAndFinish).toHaveBeenCalledOnce();
    });
  });

  describe("safety clash + plan moved — shell safety dock (cpfg-01)", () => {
    it("keeps safety-sticky-strip in the shell dock when plan leaves middle-bottom", () => {
      safetySurface.visible = true;
      safetySurface.clashesCount = 2;

      renderChromeShell();
      const moved = reshape(telemedDefaultPaneTree(), "plan", "history", "north");
      applyPaneTree(moved);

      expect(screen.getByTestId("safety-sticky-strip")).toBeInTheDocument();
      expect(screen.getByTestId("allergy-clash-banner")).toBeInTheDocument();
    });
  });

  describe("snapshot moved — empty-state travels (cpfg-02)", () => {
    it("renders the unified empty card inside snapshot's pane after snapshot leaves the chart rail", () => {
      renderChromeShell();
      const moved = reshape(telemedDefaultPaneTree(), "snapshot", "body", "west");
      applyPaneTree(moved);

      const emptyCard = screen.getByText("No patient context yet");
      expect(snapshotPaneContainer()).toContainElement(emptyCard);
      expect(screen.queryByTestId("pane-history-body")?.parentElement).not.toContainElement(
        emptyCard,
      );
    });
  });

  describe("DL-9 light — pane identity survives re-parent", () => {
    it("snapshot body testid remains mounted after snapshot is moved", () => {
      renderChromeShell();
      expect(screen.getByTestId("pane-snapshot-body")).toBeInTheDocument();

      const moved = reshape(telemedDefaultPaneTree(), "snapshot", "body", "west");
      applyPaneTree(moved);

      expect(screen.getByTestId("pane-snapshot-body")).toBeInTheDocument();
      expect(screen.getByTestId("pane-snapshot-body").closest("[data-pane-id='snapshot']")).not.toBeNull();
    });
  });
});
