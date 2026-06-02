/**
 * cv3p-04 — migration parity in the mounted v3 shell (v3-DL-10).
 *
 * validateLayout runs for real; useShellLayout is mocked (cpf-04 hang on
 * pre-seeded localStorage + full shell mount). layoutSeed carries the
 * migrated tree the live shell would hydrate.
 */

import React, { useCallback, useMemo, useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  validateLayout,
  v4TreeLayoutStorageKey,
} from "@/lib/patient-profile/useShellLayout";
import {
  listTabsContainers,
  setActiveTab,
  type PaneDefinition,
} from "@/lib/patient-profile/v3/foundation";
import type { PatientProfileLayout } from "@/lib/patient-profile/types";
import { paneTreeToFlat } from "@/lib/patient-profile/layout-tree";

let layoutSeed: PatientProfileLayout;

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: vi.fn(() => true),
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
      }, []);
      const setActiveTabOnTree = useCallback(
        (groupId: string, paneId: string) => {
          setLayout((prev) => {
            const result = setActiveTab(prev.paneTree, groupId, paneId);
            if (!result.ok) return prev;
            const next = { ...prev, paneTree: result.tree };
            layoutSeed = next;
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

import CockpitV3Shell from "../CockpitV3Shell";

const v4TreePayload = {
  version: 4 as const,
  paneTree: {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal" as const,
    children: [
      { id: "snapshot", sizePct: 25, hidden: false },
      { id: "body", sizePct: 50, hidden: false },
      {
        id: "middle-bottom",
        sizePct: 25,
        hidden: false,
        direction: "vertical" as const,
        children: [
          { id: "investigations", sizePct: 40, hidden: false },
          { id: "plan", sizePct: 60, hidden: false },
        ],
      },
    ],
  },
};

const v5NestedMultiTabHidden = {
  version: 5 as const,
  paneTree: {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal" as const,
    children: [
      {
        id: "left-tabs",
        sizePct: 30,
        hidden: false,
        paneIds: ["snapshot", "history"],
        activeTabId: "snapshot",
      },
      {
        id: "middle-split",
        sizePct: 45,
        hidden: false,
        direction: "vertical" as const,
        children: [
          {
            id: "body",
            sizePct: 55,
            hidden: false,
            paneIds: ["body"],
            activeTabId: "body",
          },
          {
            id: "bottom-tabs",
            sizePct: 45,
            hidden: false,
            paneIds: ["investigations", "plan"],
            activeTabId: "plan",
          },
        ],
      },
      {
        id: "notes",
        sizePct: 25,
        hidden: true,
        paneIds: ["notes"],
        activeTabId: "notes",
      },
    ],
  },
};

function makePanes(ids: string[]): PaneDefinition[] {
  return ids.map((id) => ({
    id,
    title: id.toUpperCase(),
    render: () => <div data-testid={`pane-body-${id}`}>{id}</div>,
  }));
}

function mountMigratedShell(
  rawPayload: unknown,
  panes: PaneDefinition[],
  storageKey: string,
) {
  const migrated = validateLayout(rawPayload);
  expect(migrated).not.toBeNull();
  layoutSeed = migrated!;
  localStorage.setItem(
    v4TreeLayoutStorageKey(storageKey),
    JSON.stringify(migrated),
  );
  return render(
    <CockpitV3Shell panes={panes} storageKey={storageKey} />,
  );
}

describe("CockpitPlatform migration parity (cv3p-04)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a migrated v4 nested split tree in the mounted shell", () => {
    const storageKey = `platform-migrate-v4-${crypto.randomUUID()}`;
    const panes = makePanes(["snapshot", "body", "investigations", "plan"]);

    mountMigratedShell(v4TreePayload, panes, storageKey);

    expect(screen.getByTestId("pane-body-snapshot")).toBeInTheDocument();
    expect(screen.getByTestId("pane-body-body")).toBeInTheDocument();
    expect(screen.getByTestId("pane-body-investigations")).toBeInTheDocument();
    expect(screen.getByTestId("pane-body-plan")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-panel-group]").length).toBeGreaterThan(
      0,
    );
  });

  it("renders a migrated v5 multi-tab + hidden tree in the mounted shell", () => {
    const storageKey = `platform-migrate-v5-${crypto.randomUUID()}`;
    const panes = makePanes([
      "snapshot",
      "history",
      "body",
      "investigations",
      "plan",
      "notes",
    ]);

    mountMigratedShell(v5NestedMultiTabHidden, panes, storageKey);

    expect(screen.getByTestId("pane-body-snapshot")).toBeInTheDocument();
    expect(screen.getByTestId("pane-body-body")).toBeInTheDocument();
    expect(screen.getByTestId("pane-body-plan")).toBeInTheDocument();
    expect(screen.queryByTestId("pane-body-notes")).not.toBeInTheDocument();

    const tabGroups = listTabsContainers(layoutSeed.paneTree).filter(
      (g) => g.paneIds.length > 1,
    );
    expect(tabGroups.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("tab", { name: /PLAN/i })).toBeInTheDocument();
  });
});
