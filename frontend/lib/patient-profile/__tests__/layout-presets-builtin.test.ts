import { describe, it, expect } from "vitest";
import {
  BUILT_IN_PRESETS,
  convertTemplateToTree,
} from "../layout-presets-builtin";
import { getTelemedVideoTemplate } from "../templates";
import { flattenPaneDefinitions } from "../types";

const EXPECTED_VIDEO_LEAVES = [
  "snapshot",
  "history",
  "body",
  "assessment",
  "investigations-orders",
  "plan",
  "subjective",
  "objective",
] as const;

function countPaneLeaves(node: { kind: string; children?: unknown[] }): number {
  if (node.kind === "pane") return 1;
  if (node.kind === "split" && Array.isArray(node.children)) {
    return node.children.reduce(
      (sum, c) => sum + countPaneLeaves(c as { kind: string; children?: unknown[] }),
      0,
    );
  }
  return 0;
}

describe("layout-presets-builtin", () => {
  it("exposes four built-in modality presets with layout trees", () => {
    expect(BUILT_IN_PRESETS).toHaveLength(4);
    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.layoutTree.kind).toBe("split");
      expect(countPaneLeaves(preset.layoutTree)).toBeGreaterThan(0);
    }
  });

  it("video built-in tree covers all template leaf ids", () => {
    const ctx = {
      appointment: {
        id: "a",
        doctor_id: "d",
        patient_name: "P",
        patient_phone: null,
        patient_age: null,
        patient_sex: null,
        appointment_date: "2026-05-24T10:00:00Z",
        status: "confirmed" as const,
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
        consultation_session: null,
      },
      token: "",
      state: "live" as const,
    };
    const template = getTelemedVideoTemplate(ctx);
    const tree = convertTemplateToTree(template);
    const { paneOrder } = flattenPaneDefinitions(template);

    expect(paneOrder).toEqual([...EXPECTED_VIDEO_LEAVES]);
    expect(countPaneLeaves(tree)).toBe(8);
  });
});
