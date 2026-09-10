import { renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyRxFocusPane,
  findRxFocusHost,
  parseRxFocus,
  revealRxFocusTarget,
  stripRxFocusFromUrl,
  useRxFocusDeepLink,
} from "@/lib/cockpit/rx-focus";
import { SUBJECTIVE_SECTION_LABELS } from "@/lib/cockpit/subjective-section-order";
import { VITALS_REGISTRY } from "@/lib/cockpit/vitals-schema";
import type { PaneTreeNode } from "@/lib/patient-profile/layout-tree";

const { replaceMock, searchRef } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  searchRef: { current: "rxFocus=objective.vitals.vitalsSpo2&from=opd" },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(searchRef.current),
  usePathname: () => "/dashboard/appointments/a1",
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/lib/cockpit/collapse-scroll", () => ({
  scrollCollapsibleToStickyTop: vi.fn(),
}));

function leaf(
  id: string,
  opts: { hidden?: boolean; paneIds?: string[]; activeTabId?: string } = {}
): PaneTreeNode {
  const paneIds = opts.paneIds ?? [id];
  return {
    id,
    sizePct: 50,
    hidden: opts.hidden ?? false,
    paneIds,
    activeTabId: opts.activeTabId ?? paneIds[0],
  };
}

describe("parseRxFocus", () => {
  it("resolves pane.section and pane.section.field", () => {
    expect(parseRxFocus("subjective.family_history")).toEqual({
      pane: "subjective",
      section: "family_history",
    });
    expect(parseRxFocus("objective.vitals.vitalsSpo2")).toEqual({
      pane: "objective",
      section: "vitals",
      field: "vitalsSpo2",
    });
  });

  it("ignores garbage fail-soft", () => {
    expect(parseRxFocus(null)).toBeNull();
    expect(parseRxFocus("")).toBeNull();
    expect(parseRxFocus("subjective")).toBeNull();
    expect(parseRxFocus("nope.family_history")).toBeNull();
    expect(parseRxFocus("objective.vitals.notAVital")).toBeNull();
    expect(parseRxFocus("subjective.family_history.extra")).toBeNull();
    expect(parseRxFocus("custom_block:abc.foo")).toBeNull();
  });
});

describe("findRxFocusHost / applyRxFocusPane", () => {
  const tree: PaneTreeNode = {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal",
    children: [
      leaf("body"),
      leaf("__tabs_soap", {
        paneIds: ["subjective", "objective"],
        activeTabId: "subjective",
      }),
      leaf("plan", { hidden: true }),
    ],
  };

  it("reports a hidden pane and apply unhides it without snap-rail", () => {
    const host = findRxFocusHost(tree, "plan");
    expect(host).toEqual({
      groupId: "plan",
      hidden: true,
      needsActivate: false,
    });
    const next = applyRxFocusPane(tree, "plan");
    expect(next).not.toBeNull();
    const plan = next!.children?.find((c) => c.id === "plan");
    expect(plan?.hidden).toBe(false);
    expect(next!.children?.map((c) => c.id)).toEqual([
      "body",
      "__tabs_soap",
      "plan",
    ]);
  });

  it("activates an inactive tab in a group", () => {
    const host = findRxFocusHost(tree, "objective");
    expect(host).toEqual({
      groupId: "__tabs_soap",
      hidden: false,
      needsActivate: true,
    });
    const next = applyRxFocusPane(tree, "objective");
    const tabs = next!.children?.find((c) => c.id === "__tabs_soap");
    expect(tabs?.activeTabId).toBe("objective");
    expect(tabs?.hidden).toBe(false);
  });

  it("returns null when the pane is not in the tree", () => {
    expect(applyRxFocusPane(tree, "assessment")).toBeNull();
  });
});

describe("stripRxFocusFromUrl", () => {
  it("drops rxFocus and keeps sibling params", () => {
    expect(
      stripRxFocusFromUrl(
        "/dashboard/appointments/a1",
        "?rxFocus=objective.vitals.vitalsSpo2&from=opd"
      )
    ).toBe("/dashboard/appointments/a1?from=opd");
  });

  it("drops the query entirely when rxFocus was the only param", () => {
    expect(
      stripRxFocusFromUrl(
        "/dashboard/appointments/a1",
        "rxFocus=subjective.family_history"
      )
    ).toBe("/dashboard/appointments/a1");
  });
});

describe("revealRxFocusTarget", () => {
  it("returns false when the section is not mounted (hidden section)", () => {
    expect(
      revealRxFocusTarget({ pane: "subjective", section: "family_history" })
    ).toBe(false);
  });

  it("scrolls a mounted section and focuses a matching field input", () => {
    const spo2 = VITALS_REGISTRY.find((v) => v.key === "vitalsSpo2");
    if (!spo2) throw new Error("vitalsSpo2 missing from VITALS_REGISTRY");
    const root = document.createElement("div");
    root.setAttribute("data-objective-section-id", "vitals");
    const input = document.createElement("input");
    input.setAttribute("aria-label", `${spo2.label} in ${spo2.canonicalUnit}`);
    const focus = vi.spyOn(input, "focus").mockImplementation(() => {});
    root.appendChild(input);
    document.body.appendChild(root);

    expect(
      revealRxFocusTarget({
        pane: "objective",
        section: "vitals",
        field: "vitalsSpo2",
      })
    ).toBe(true);
    expect(focus).toHaveBeenCalled();
    document.body.removeChild(root);
  });
});

describe("parseRxFocus uses registry labels", () => {
  it("family_history is the subjective registry key", () => {
    expect(SUBJECTIVE_SECTION_LABELS.family_history).toBeTruthy();
    expect(parseRxFocus("subjective.family_history")?.section).toBe(
      "family_history"
    );
  });
});

describe("useRxFocusDeepLink", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    searchRef.current = "rxFocus=objective.vitals.vitalsSpo2&from=opd";
  });

  const tree: PaneTreeNode = {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal",
    children: [
      {
        id: "objective",
        sizePct: 50,
        hidden: true,
        paneIds: ["objective"],
        activeTabId: "objective",
      },
    ],
  };

  it("applies the tree and strips rxFocus after a valid parse", async () => {
    const applyLayout = vi.fn();
    renderHook(() =>
      useRxFocusDeepLink({
        hydrated: true,
        paneTree: tree,
        applyLayout,
      })
    );
    await waitFor(() => {
      expect(applyLayout).toHaveBeenCalledTimes(1);
    });
    const applied = applyLayout.mock.calls[0]![0] as {
      paneTree: PaneTreeNode;
    };
    expect(applied.paneTree.children?.[0]?.hidden).toBe(false);
    expect(replaceMock).toHaveBeenCalledWith(
      "/dashboard/appointments/a1?from=opd",
      { scroll: false }
    );
  });

  it("waits for hydration", () => {
    const applyLayout = vi.fn();
    renderHook(() =>
      useRxFocusDeepLink({
        hydrated: false,
        paneTree: tree,
        applyLayout,
      })
    );
    expect(applyLayout).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

describe("rx-focus source", () => {
  it("does not import the snap-rail helper", () => {
    const source = readFileSync(resolve(__dirname, "../rx-focus.ts"), "utf8");
    expect(source).not.toMatch(/from\s+["'][^"']*focus-leaf["']/);
  });
});
