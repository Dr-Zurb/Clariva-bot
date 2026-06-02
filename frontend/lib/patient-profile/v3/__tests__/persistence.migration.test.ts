/**
 * cv3p-02 — validateLayout migration idempotence (v3-DL-10 / R-PERSIST3).
 */

import { describe, it, expect } from "vitest";
import { validateLayout } from "@/lib/patient-profile/useShellLayout";
import type { PatientProfileLayout } from "@/lib/patient-profile/v3/foundation";
import { serialiseTree } from "@/lib/patient-profile/v3/foundation";

const v2FlatPayload = {
  version: 2 as const,
  paneOrder: ["snapshot", "history", "body", "plan"],
  paneState: {
    snapshot: { sizePct: 22, collapsed: false },
    history: { sizePct: 22, collapsed: true },
    body: { sizePct: 40, collapsed: false },
    plan: { sizePct: 16, collapsed: false },
  },
};

const v3FlatPayload = {
  version: 3 as const,
  paneOrder: ["snapshot", "history", "body", "plan", "investigations"],
  paneState: {
    snapshot: { sizePct: 20, hidden: false },
    history: { sizePct: 20, hidden: true },
    body: { sizePct: 35, hidden: false },
    plan: { sizePct: 15, hidden: false },
    investigations: { sizePct: 10, hidden: false },
  },
};

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

const v5NestedMultiTabHidden: PatientProfileLayout = {
  version: 5,
  paneTree: {
    id: "__root__",
    sizePct: 100,
    hidden: false,
    direction: "horizontal",
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
        direction: "vertical",
        children: [
          { id: "body", sizePct: 55, hidden: false, paneIds: ["body"], activeTabId: "body" },
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

describe("persistence migration (cv3p-02)", () => {
  const samples: Array<{ label: string; raw: unknown }> = [
    { label: "v2 flat", raw: v2FlatPayload },
    { label: "v3 flat", raw: v3FlatPayload },
    { label: "v4 tree", raw: v4TreePayload },
    { label: "v5 nested multi-tab + hidden", raw: v5NestedMultiTabHidden },
  ];

  for (const { label, raw } of samples) {
    it(`${label} → valid v5; second validateLayout is a no-op`, () => {
      const once = validateLayout(raw);
      expect(once).not.toBeNull();
      expect(once!.version).toBe(5);

      const twice = validateLayout(once);
      expect(twice).toEqual(once);
    });
  }

  it("v5 input is not mutated by validateLayout", () => {
    const before = serialiseTree(v5NestedMultiTabHidden.paneTree);
    const result = validateLayout(v5NestedMultiTabHidden);
    expect(result).not.toBeNull();
    expect(serialiseTree(v5NestedMultiTabHidden.paneTree)).toBe(before);
  });

  it("v2 collapsed maps to hidden in migrated v5 flat state", () => {
    const migrated = validateLayout(v2FlatPayload);
    expect(migrated).not.toBeNull();
    const historyLeaf = migrated!.paneTree.children?.find(
      (c) => (c.paneIds ?? [c.id]).includes("history"),
    );
    expect(historyLeaf?.hidden).toBe(true);
  });
});
