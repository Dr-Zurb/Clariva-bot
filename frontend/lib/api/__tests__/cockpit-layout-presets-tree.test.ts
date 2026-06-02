/**
 * cockpit-layout-presets-tree — renamePreset (cpfc-03)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renamePreset } from "@/lib/api/cockpit-layout-presets-tree";
import type { LayoutNode } from "@/lib/patient-profile/types";

vi.mock("@/lib/api-base", () => ({
  requireApiBaseUrl: vi.fn(() => "https://api.example.com"),
}));

const LAYOUT_TREE: LayoutNode = {
  kind: "split",
  direction: "horizontal",
  children: [
    { kind: "pane", paneId: "chart" },
    { kind: "pane", paneId: "body" },
  ],
  sizes: [50, 50],
};

const EXISTING_ROW = {
  id: "preset-1",
  name: "Old Name",
  created_at: "2026-05-01T00:00:00.000Z",
  sourceTemplateId: "telemed-video",
  layout_tree: LAYOUT_TREE,
};

describe("renamePreset (cpfc-03)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("changes only name and preserves layout_tree and sourceTemplateId", async () => {
    let putBody: unknown;
    global.fetch = vi.fn().mockImplementation((_url, init) => {
      if (init?.method === "PUT") {
        putBody = JSON.parse(String(init.body));
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              presets: [
                {
                  ...EXISTING_ROW,
                  name: "New Name",
                },
              ],
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ presets: [EXISTING_ROW] }),
      });
    });

    const result = await renamePreset("token", "preset-1", "  New Name  ");

    expect(result.name).toBe("New Name");
    expect(result.layoutTree).toEqual(LAYOUT_TREE);
    expect(result.sourceTemplateId).toBe("telemed-video");
    expect(result.createdAt).toBe("2026-05-01T00:00:00.000Z");

    const rows = (putBody as { presets: typeof EXISTING_ROW[] }).presets;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("New Name");
    expect(rows[0].layout_tree).toEqual(LAYOUT_TREE);
    expect(rows[0].sourceTemplateId).toBe("telemed-video");
    expect(rows[0].created_at).toBe("2026-05-01T00:00:00.000Z");
  });

  it("rejects an empty name with status 400", async () => {
    global.fetch = vi.fn();
    await expect(renamePreset("token", "preset-1", "   ")).rejects.toMatchObject({
      message: "Preset name cannot be empty",
      status: 400,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("throws 404 when the preset id is missing", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ presets: [EXISTING_ROW] }),
    });

    await expect(renamePreset("token", "missing-id", "Renamed")).rejects.toMatchObject({
      message: "Preset not found",
      status: 404,
    });
  });
});
