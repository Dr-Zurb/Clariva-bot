/**
 * cv3p-02 — blank-seed-no-clobber probe in components test dir.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { v4TreeLayoutStorageKey } from "@/lib/patient-profile/useShellLayout";
import { useCockpitV3Layout } from "@/lib/patient-profile/v3/useCockpitV3Layout";
import { blankLayout, blankLayoutFlat, hasVisibleLeaves } from "@/lib/patient-profile/v3/blankLayout";
import {
  dropPaneIntoZone,
  flatToPaneTree,
  serialiseTree,
  type PaneDefinition,
  type PaneTreeNode,
} from "@/lib/patient-profile/v3/foundation";

function buildSaved(paneOrder: string[]): PaneTreeNode {
  let tree = flatToPaneTree({
    paneOrder,
    paneState: Object.fromEntries(
      paneOrder.map((id) => [id, { sizePct: 33, hidden: false }]),
    ),
  });
  tree = dropPaneIntoZone(tree, "c", "b", "south").tree!;
  return dropPaneIntoZone(tree, "a", "b", "center").tree!;
}

describe("blank-seed probe", () => {
  beforeEach(() => localStorage.clear());

  it("pre-seeded layout wins", () => {
    const panes: PaneDefinition[] = ["a", "b", "c"].map((id) => ({
      id,
      title: id,
      render: () => null,
    }));
    const blankDefault = blankLayout(panes);
    const defaultFlat = blankLayoutFlat(panes);
    const key = "probe-noclobber";
    const saved = buildSaved(["a", "b", "c"]);
    localStorage.setItem(
      v4TreeLayoutStorageKey(key),
      JSON.stringify({ version: 5, paneTree: saved }),
    );

    const { result } = renderHook(() =>
      useCockpitV3Layout({
        storageKey: key,
        defaultPaneOrder: defaultFlat.paneOrder,
        defaultPaneState: defaultFlat.paneState,
        knownLeafIds: defaultFlat.paneOrder,
        blankDefaultTree: blankDefault.paneTree,
      }),
    );

    expect(serialiseTree(result.current.paneTree)).toBe(serialiseTree(saved));
    expect(hasVisibleLeaves(result.current.paneTree)).toBe(true);
  });
});
