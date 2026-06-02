/**
 * `<CockpitV3Shell>` — shell layout tests (cv3s-01 / cv3c-04).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: vi.fn(() => true),
}));

import { useMediaQuery } from "@/hooks/useMediaQuery";
import CockpitV3Shell from "../CockpitV3Shell";

function makePanes(ids: string[]) {
  return ids.map((id) => ({
    id,
    title: id,
    render: () => <div data-testid={`pane-body-${id}`}>{id}</div>,
  }));
}

describe("CockpitV3Shell", () => {
  beforeEach(() => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    localStorage.clear();
  });

  it("desktop renders docks in order (safety → palette → canvas → action)", () => {
    render(
      <CockpitV3Shell
        panes={makePanes(["a"])}
        storageKey="shell-test"
        safetyDock={<div data-testid="dock-safety" />}
        actionDock={<div data-testid="dock-action" />}
      />,
    );

    expect(screen.getByTestId("p1-cockpit-v3-shell-desktop")).toBeInTheDocument();
    expect(screen.getByTestId("cockpit-v3-palette")).toBeInTheDocument();
    expect(screen.getByTestId("dock-safety")).toBeInTheDocument();
    expect(screen.getByTestId("dock-action")).toBeInTheDocument();

    const desktop = screen.getByTestId("p1-cockpit-v3-shell-desktop");
    const children = Array.from(desktop.children);
    expect(children[0]).toContainElement(screen.getByTestId("dock-safety"));
    expect(children[1]).toContainElement(screen.getByTestId("cockpit-v3-palette"));
    expect(desktop).toContainElement(screen.getByTestId("cockpit-v3-empty-state"));
    expect(desktop).toContainElement(screen.getByTestId("dock-action"));
    const safetyIdx = children.findIndex((el) =>
      el.contains(screen.getByTestId("dock-safety")),
    );
    const paletteIdx = children.findIndex((el) =>
      el.contains(screen.getByTestId("cockpit-v3-palette")),
    );
    const canvasIdx = children.findIndex((el) =>
      el.contains(screen.getByTestId("cockpit-v3-empty-state")),
    );
    const actionIdx = children.findIndex((el) =>
      el.contains(screen.getByTestId("dock-action")),
    );
    expect(safetyIdx).toBeLessThan(paletteIdx);
    expect(paletteIdx).toBeLessThan(canvasIdx);
    expect(canvasIdx).toBeLessThan(actionIdx);
  });

  it("mobile renders flat fallback with reachable docks (v3-DL-8 / P3-DL-6)", () => {
    vi.mocked(useMediaQuery).mockReturnValue(false);

    render(
      <CockpitV3Shell
        panes={makePanes(["a"])}
        storageKey="shell-mobile-test"
        safetyDock={<div data-testid="dock-safety" />}
        actionDock={<div data-testid="dock-action" />}
      />,
    );

    expect(screen.getByTestId("p1-cockpit-v3-shell-mobile")).toBeInTheDocument();
    expect(screen.getByTestId("cockpit-v3-mobile-fallback")).toBeInTheDocument();
    expect(screen.getByTestId("cockpit-v3-empty-state")).toBeInTheDocument();
    expect(screen.getByTestId("dock-safety")).toBeInTheDocument();
    expect(screen.getByTestId("dock-action")).toBeInTheDocument();
    expect(screen.queryByTestId("cockpit-v3-palette")).not.toBeInTheDocument();
    expect(document.querySelector("[data-testid='p2-cockpit-v3-dnd-context']")).toBeNull();
  });
});

describe("CockpitV3Shell forbidden imports (P0-DL-4)", () => {
  const v3Dir = path.resolve(__dirname, "..");

  const forbiddenImportPatterns = [
    /from\s+["']@\/components\/patient-profile\/Shell/,
    /from\s+["'][^"']*customize-mode-context/,
    /from\s+["'][^"']*CustomizeBar/,
    /from\s+["'][^"']*PaneDropOverlay/,
  ];

  for (const file of ["CockpitV3Shell.tsx"]) {
    const filePath = path.join(v3Dir, file);
    it(`${file} does not import forbidden modules`, () => {
      const source = fs.readFileSync(filePath, "utf8");
      for (const pattern of forbiddenImportPatterns) {
        expect(source).not.toMatch(pattern);
      }
    });
  }
});
