/**
 * cv3p-04 — Phase 3 platform integration gate (R-CHROME3 + R-PERSIST3 + R-MOBILE3).
 *
 * One end-to-end scenario crossing chrome, persistence, and mobile seams.
 * Reload uses readPersistedLayout (cpf-04 remount hang avoided).
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
  serialiseTree,
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
import {
  readPersistedLayout,
  v4TreeLayoutStorageKey,
} from "@/lib/patient-profile/useShellLayout";
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

const mockSendAndFinish = vi.hoisted(() => vi.fn());
const layoutControlRef = vi.hoisted(() => ({
  current: null as { applyLayout: (layout: PatientProfileLayout) => void } | null,
}));
let layoutSeed: PatientProfileLayout;
let activeStorageKey = "";

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
  visible: true,
  clashesCount: 1,
  ddiCount: 0,
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
        layoutSeed = next;
        setLayout(next);
        if (activeStorageKey) {
          localStorage.setItem(
            v4TreeLayoutStorageKey(activeStorageKey),
            JSON.stringify(next),
          );
        }
      }, []);
      layoutControlRef.current = { applyLayout };
      const setActiveTabOnTree = useCallback(
        (groupId: string, paneId: string) => {
          setLayout((prev) => {
            const result = setActiveTab(prev.paneTree, groupId, paneId);
            if (!result.ok) return prev;
            const next = { ...prev, paneTree: result.tree };
            layoutSeed = next;
            if (activeStorageKey) {
              localStorage.setItem(
                v4TreeLayoutStorageKey(activeStorageKey),
                JSON.stringify(next),
              );
            }
            return next;
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

import { useMediaQuery } from "@/hooks/useMediaQuery";
import CockpitV3Shell from "../CockpitV3Shell";

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

function platformShellUi(
  storageKey: string,
  options?: { preservePersisted?: boolean },
) {
  activeStorageKey = storageKey;
  const persisted = options?.preservePersisted
    ? readPersistedLayout(storageKey)
    : null;
  if (persisted) {
    layoutSeed = persisted;
  } else {
    layoutSeed = { version: 5, paneTree: telemedDefaultPaneTree() };
    localStorage.setItem(
      v4TreeLayoutStorageKey(storageKey),
      JSON.stringify(layoutSeed),
    );
  }
  const prescriptionIdRef = { current: null as string | null };
  const panes = buildCockpitTabs(fixtureCtx(), "telemed-video");

  return (
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
            panes={panes}
            storageKey={storageKey}
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
    </RxFormProvider>
  );
}

function applyPaneTree(paneTree: PaneTreeNode) {
  act(() => {
    layoutControlRef.current?.applyLayout({ version: 5, paneTree });
  });
}

describe("CockpitPlatform integration (cv3p-04 gate)", () => {
  beforeEach(() => {
    mockSendAndFinish.mockClear();
    localStorage.clear();
    vi.mocked(useMediaQuery).mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  it("end-to-end — reshape, chrome sends, reload, mobile flat + docks, desktop restore", () => {
    const storageKey = `platform-it-${crypto.randomUUID()}`;
    const { rerender } = render(platformShellUi(storageKey));

    const base = telemedDefaultPaneTree();
    const movedPlan = reshape(base, "plan", "snapshot", "north");
    applyPaneTree(movedPlan);

    expect(screen.getByTestId("cockpit-v3-safety-dock")).toBeInTheDocument();
    expect(screen.getByTestId("cockpit-v3-action-dock")).toBeInTheDocument();
    expect(screen.getByTestId("safety-sticky-strip")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /send rx & finish/i }));
    expect(mockSendAndFinish).toHaveBeenCalledOnce();

    const tabbed = reshape(base, "plan", "snapshot", "center");
    applyPaneTree(tabbed);

    const splitOut = reshape(base, "plan", "body", "west");
    applyPaneTree(splitOut);

    const expectedSerialized = serialiseTree(layoutSeed.paneTree);
    const reloaded = readPersistedLayout(storageKey);
    expect(reloaded).not.toBeNull();
    expect(serialiseTree(reloaded!.paneTree)).toBe(expectedSerialized);

    vi.mocked(useMediaQuery).mockReturnValue(false);
    rerender(platformShellUi(storageKey, { preservePersisted: true }));

    expect(screen.getByTestId("cockpit-v3-mobile-fallback")).toBeInTheDocument();
    expect(screen.getByTestId("cockpit-v3-mobile-safety-dock")).toContainElement(
      screen.getByTestId("safety-sticky-strip"),
    );
    expect(screen.getByTestId("cockpit-v3-mobile-action-dock")).toContainElement(
      screen.getByTestId("plan-action-footer"),
    );
    expect(document.querySelector("[data-testid='p2-cockpit-v3-dnd-context']")).toBeNull();
    expect(screen.queryByTestId("cockpit-v3-palette")).not.toBeInTheDocument();
    expect(document.querySelector("[data-sortable-id]")).toBeNull();

    vi.mocked(useMediaQuery).mockReturnValue(true);
    rerender(platformShellUi(storageKey, { preservePersisted: true }));

    expect(screen.getByTestId("p1-cockpit-v3-shell-desktop")).toBeInTheDocument();
    expect(screen.queryByTestId("cockpit-v3-mobile-fallback")).not.toBeInTheDocument();
    expect(serialiseTree(readPersistedLayout(storageKey)!.paneTree)).toBe(
      expectedSerialized,
    );
  });

  it("v3 mounts unconditionally — no flag branch / legacy shell (cv3x-03)", () => {
    const pagePath = path.resolve(__dirname, "../../PatientProfilePage.tsx");
    const source = fs.readFileSync(pagePath, "utf8");
    expect(source).toContain("CockpitV3Shell");
    expect(source).not.toMatch(/cockpitV3Enabled/);
    expect(source).not.toContain("PatientProfileShell");
  });

  it("anti-goals — v3 path has no customize / PaneDropOverlay imports", () => {
    const v3Dir = path.resolve(__dirname, "..");
    const forbidden = [
      /from\s+["']@\/components\/patient-profile\/Shell/,
      /from\s+["'][^"']*customize-mode-context/,
      /from\s+["'][^"']*PaneDropOverlay/,
    ];
    const files = fs
      .readdirSync(v3Dir)
      .filter((f) => f.endsWith(".tsx") && !f.includes(".test."));
    for (const file of files) {
      const source = fs.readFileSync(path.join(v3Dir, file), "utf8");
      for (const pattern of forbidden) {
        expect(source).not.toMatch(pattern);
      }
    }
  });
});
