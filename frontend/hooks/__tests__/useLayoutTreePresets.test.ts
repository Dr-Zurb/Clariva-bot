/**
 * useLayoutTreePresets — deletePreset + renamePreset (cpfc-03)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { LayoutNode } from "@/lib/patient-profile/types";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  })),
}));

const listPresetsTree = vi.fn();
const savePresetTree = vi.fn();
const deletePresetApi = vi.fn();
const renamePresetApi = vi.fn();

vi.mock("@/lib/api/cockpit-layout-presets-tree", () => ({
  listPresetsTree: (...args: unknown[]) => listPresetsTree(...args),
  savePresetTree: (...args: unknown[]) => savePresetTree(...args),
  deletePreset: (...args: unknown[]) => deletePresetApi(...args),
  renamePreset: (...args: unknown[]) => renamePresetApi(...args),
}));

import { useLayoutTreePresets } from "@/hooks/useLayoutTreePresets";

const LAYOUT_TREE: LayoutNode = {
  kind: "pane",
  paneId: "chart",
};

const PRESET = {
  id: "preset-1",
  name: "My layout",
  createdAt: "2026-05-01T00:00:00.000Z",
  sourceTemplateId: "telemed-video",
  layoutTree: LAYOUT_TREE,
};

describe("useLayoutTreePresets — deletePreset + renamePreset (cpfc-03)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPresetsTree.mockResolvedValue([PRESET]);
    deletePresetApi.mockResolvedValue(undefined);
    renamePresetApi.mockResolvedValue({ ...PRESET, name: "Renamed" });
  });

  it("deletePreset calls the API client and refreshes", async () => {
    const { result } = renderHook(() => useLayoutTreePresets());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.deletePreset("preset-1");
    });

    expect(deletePresetApi).toHaveBeenCalledWith("test-token", "preset-1");
    expect(listPresetsTree).toHaveBeenCalledTimes(2);
  });

  it("renamePreset calls the API client and refreshes", async () => {
    const { result } = renderHook(() => useLayoutTreePresets());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      const updated = await result.current.renamePreset("preset-1", "Renamed");
      expect(updated.name).toBe("Renamed");
    });

    expect(renamePresetApi).toHaveBeenCalledWith("test-token", "preset-1", "Renamed");
    expect(listPresetsTree).toHaveBeenCalledTimes(2);
  });
});
