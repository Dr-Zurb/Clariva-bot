/**
 * usePatientProfilePresets — unit tests (Vitest + renderHook).
 *
 * Covers the ppr-09 acceptance criteria:
 *   - Fetch on mount returns mixed v1 + v2 rows; hook surfaces all as v2.
 *   - `savePreset` POSTs a v2-tagged body.
 *   - Soft-cap eviction confirm fires (nextEvictionTarget) on 6th save.
 *   - `deletePreset` calls DELETE and updates state.
 *   - `renamePreset` calls PUT with updated name.
 *   - `applyPreset` calls `applyLayout` for valid built-in and custom ids.
 *   - `applyPreset` returns false for unknown ids.
 *
 * Run: `pnpm --filter frontend vitest run hooks/__tests__/usePatientProfilePresets`
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { PatientProfileLayout } from "@/lib/patient-profile/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  })),
}));

vi.mock("@/lib/api-base", () => ({
  requireApiBaseUrl: vi.fn(() => "https://api.example.com"),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A v2-tagged layout row (backend stores version: 2 after a v2 save). */
const V2_ROW = {
  id: "custom-v2",
  name: "My V2 Preset",
  created_at: "2026-05-10T10:00:00.000Z",
  layout: {
    version: 2,
    paneOrder: ["chart", "body", "rx"],
    paneState: {
      chart: { sizePct: 30, collapsed: false },
      body: { sizePct: 40, collapsed: false },
      rx: { sizePct: 30, collapsed: false },
    },
  },
};

/** A v1-tagged layout row (legacy shape — no version field). */
const V1_ROW = {
  id: "custom-v1",
  name: "My V1 Preset",
  created_at: "2026-05-01T08:00:00.000Z",
  layout: {
    slots: ["chart", "body", "rx"],
    widths: [26, 48, 26],
    collapsed: { chart: false, body: false, rx: false },
  },
};

/** A malformed row that translateLegacyPreset returns null for. */
const MALFORMED_ROW = {
  id: "corrupt",
  name: "Corrupt Preset",
  created_at: "2026-04-01T00:00:00.000Z",
  layout: { bad: "data" },
};

const V2_LAYOUT: PatientProfileLayout = {
  version: 2,
  paneOrder: ["chart", "body", "rx"],
  paneState: {
    chart: { sizePct: 26, collapsed: false },
    body: { sizePct: 48, collapsed: false },
    rx: { sizePct: 26, collapsed: false },
  },
};

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

function setupFetchSequence(...responses: unknown[]) {
  let callIndex = 0;
  global.fetch = vi.fn().mockImplementation(() => {
    const data = responses[callIndex] ?? responses.at(-1);
    callIndex++;
    return Promise.resolve({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ success: true, data })),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("usePatientProfilePresets", () => {
  const mockApplyLayout = vi.fn();

  beforeEach(() => {
    mockApplyLayout.mockClear();
    setupFetchSequence({ presets: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Fetch & translation ────────────────────────────────────────────────────

  it("fetches on mount; v2-tagged rows surface unchanged", async () => {
    const { usePatientProfilePresets } = await import("@/hooks/usePatientProfilePresets");
    setupFetchSequence({ presets: [V2_ROW] });

    const { result } = renderHook(() =>
      usePatientProfilePresets({ applyLayout: mockApplyLayout }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.customs).toHaveLength(1);
    expect(result.current.customs[0].id).toBe("custom-v2");
    expect(result.current.customs[0].layout.version).toBe(2);
    expect(result.current.customs[0].layout.paneOrder).toEqual(["chart", "body", "rx"]);
  });

  it("fetches mixed v1 + v2 rows and surfaces both as v2 CustomPresets", async () => {
    const { usePatientProfilePresets } = await import("@/hooks/usePatientProfilePresets");
    setupFetchSequence({ presets: [V1_ROW, V2_ROW] });

    const { result } = renderHook(() =>
      usePatientProfilePresets({ applyLayout: mockApplyLayout }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.customs).toHaveLength(2);
    // Both are translated/validated as v2
    for (const preset of result.current.customs) {
      expect(preset.layout.version).toBe(2);
      expect(typeof preset.layout.paneOrder).toBe("object");
    }
  });

  it("silently discards malformed rows; does not crash", async () => {
    const { usePatientProfilePresets } = await import("@/hooks/usePatientProfilePresets");
    setupFetchSequence({ presets: [V1_ROW, MALFORMED_ROW, V2_ROW] });

    const { result } = renderHook(() =>
      usePatientProfilePresets({ applyLayout: mockApplyLayout }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // MALFORMED_ROW is discarded; V1_ROW and V2_ROW survive
    expect(result.current.customs).toHaveLength(2);
    expect(result.current.customs.find((p) => p.id === "corrupt")).toBeUndefined();
  });

  // ── applyPreset ───────────────────────────────────────────────────────────

  it("applyPreset with a built-in id calls applyLayout", async () => {
    const { usePatientProfilePresets } = await import("@/hooks/usePatientProfilePresets");
    setupFetchSequence({ presets: [] });

    const { result } = renderHook(() =>
      usePatientProfilePresets({ applyLayout: mockApplyLayout }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    const success = result.current.applyPreset("built-in:triage");
    expect(success).toBe(true);
    expect(mockApplyLayout).toHaveBeenCalledOnce();
    const applied = mockApplyLayout.mock.calls[0][0] as PatientProfileLayout;
    expect(applied.version).toBe(2);
    expect(applied.paneState.rx.collapsed).toBe(true);
  });

  it("applyPreset with a custom preset id calls applyLayout", async () => {
    const { usePatientProfilePresets } = await import("@/hooks/usePatientProfilePresets");
    setupFetchSequence({ presets: [V2_ROW] });

    const { result } = renderHook(() =>
      usePatientProfilePresets({ applyLayout: mockApplyLayout }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    const success = result.current.applyPreset("custom-v2");
    expect(success).toBe(true);
    expect(mockApplyLayout).toHaveBeenCalledOnce();
  });

  it("applyPreset with unknown id returns false and does not call applyLayout", async () => {
    const { usePatientProfilePresets } = await import("@/hooks/usePatientProfilePresets");
    setupFetchSequence({ presets: [] });

    const { result } = renderHook(() =>
      usePatientProfilePresets({ applyLayout: mockApplyLayout }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    const success = result.current.applyPreset("built-in:nonexistent");
    expect(success).toBe(false);
    expect(mockApplyLayout).not.toHaveBeenCalled();
  });

  // ── savePreset ────────────────────────────────────────────────────────────

  it("savePreset POSTs a v2-tagged layout body", async () => {
    const { usePatientProfilePresets } = await import("@/hooks/usePatientProfilePresets");
    const savedRow = {
      id: "new-id",
      name: "Morning OPD",
      created_at: new Date().toISOString(),
      layout: V2_LAYOUT,
    };
    setupFetchSequence({ presets: [] }, { presets: [savedRow] });

    const { result } = renderHook(() =>
      usePatientProfilePresets({ applyLayout: mockApplyLayout }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.savePreset("Morning OPD", V2_LAYOUT);
    });

    const calls = vi.mocked(global.fetch).mock.calls;
    const putCall = calls[1];
    const body = JSON.parse(putCall[1]?.body as string) as {
      presets: Array<{ layout: { version?: number } }>;
    };
    // The new preset must have version: 2
    const newPreset = body.presets.at(-1)!;
    expect(newPreset.layout.version).toBe(2);
  });

  it("savePreset with 5 customs evicts oldest before appending", async () => {
    const { usePatientProfilePresets } = await import("@/hooks/usePatientProfilePresets");

    const makeV2Row = (id: string, name: string, created_at: string) => ({
      id,
      name,
      created_at,
      layout: V2_LAYOUT,
    });

    const existing = [
      makeV2Row("oldest", "Oldest", "2026-01-01T00:00:00.000Z"),
      makeV2Row("p2", "Second", "2026-02-01T00:00:00.000Z"),
      makeV2Row("p3", "Third", "2026-03-01T00:00:00.000Z"),
      makeV2Row("p4", "Fourth", "2026-04-01T00:00:00.000Z"),
      makeV2Row("p5", "Fifth", "2026-05-01T00:00:00.000Z"),
    ];
    const afterEviction = [
      ...existing.slice(1),
      makeV2Row("new", "New", "2026-06-01T00:00:00.000Z"),
    ];

    setupFetchSequence({ presets: existing }, { presets: afterEviction });

    const { result } = renderHook(() =>
      usePatientProfilePresets({ applyLayout: mockApplyLayout }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.savePreset("New", V2_LAYOUT);
    });

    const calls = vi.mocked(global.fetch).mock.calls;
    const putCall = calls[1];
    const body = JSON.parse(putCall[1]?.body as string) as {
      presets: Array<{ id: string }>;
    };
    // oldest must be evicted
    expect(body.presets.find((p) => p.id === "oldest")).toBeUndefined();
    expect(body.presets).toHaveLength(5);
  });

  // ── nextEvictionTarget ─────────────────────────────────────────────────────

  it("nextEvictionTarget returns null when below cap", async () => {
    const { usePatientProfilePresets } = await import("@/hooks/usePatientProfilePresets");
    const rows = Array.from({ length: 4 }, (_, i) => ({
      id: `p${i}`,
      name: `Preset ${i}`,
      created_at: `2026-05-0${i + 1}T00:00:00.000Z`,
      layout: V2_LAYOUT,
    }));
    setupFetchSequence({ presets: rows });

    const { result } = renderHook(() =>
      usePatientProfilePresets({ applyLayout: mockApplyLayout }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.nextEvictionTarget()).toBeNull();
  });

  it("nextEvictionTarget returns oldest when at cap (5)", async () => {
    const { usePatientProfilePresets } = await import("@/hooks/usePatientProfilePresets");
    const rows = [
      { id: "oldest", name: "Oldest", created_at: "2026-01-01T00:00:00.000Z", layout: V2_LAYOUT },
      { id: "p2", name: "Second", created_at: "2026-02-01T00:00:00.000Z", layout: V2_LAYOUT },
      { id: "p3", name: "Third", created_at: "2026-03-01T00:00:00.000Z", layout: V2_LAYOUT },
      { id: "p4", name: "Fourth", created_at: "2026-04-01T00:00:00.000Z", layout: V2_LAYOUT },
      { id: "p5", name: "Fifth", created_at: "2026-05-01T00:00:00.000Z", layout: V2_LAYOUT },
    ];
    setupFetchSequence({ presets: rows });

    const { result } = renderHook(() =>
      usePatientProfilePresets({ applyLayout: mockApplyLayout }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    const target = result.current.nextEvictionTarget();
    expect(target).not.toBeNull();
    expect(target!.id).toBe("oldest");
  });

  // ── deletePreset ──────────────────────────────────────────────────────────

  it("deletePreset calls DELETE on the correct endpoint and updates state", async () => {
    const { usePatientProfilePresets } = await import("@/hooks/usePatientProfilePresets");
    const rows = [
      { id: "keep", name: "Keep", created_at: "2026-05-01T00:00:00.000Z", layout: V2_LAYOUT },
      { id: "del", name: "Delete Me", created_at: "2026-05-02T00:00:00.000Z", layout: V2_LAYOUT },
    ];
    setupFetchSequence({ presets: rows }, { presets: [rows[0]] });

    const { result } = renderHook(() =>
      usePatientProfilePresets({ applyLayout: mockApplyLayout }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deletePreset("del");
    });

    const calls = vi.mocked(global.fetch).mock.calls;
    const deleteCall = calls[1];
    expect((deleteCall[0] as string).endsWith("/del")).toBe(true);
    expect((deleteCall[1] as RequestInit).method).toBe("DELETE");
    expect(result.current.customs).toHaveLength(1);
    expect(result.current.customs[0].id).toBe("keep");
  });

  // ── renamePreset ──────────────────────────────────────────────────────────

  it("renamePreset calls PUT with the updated name", async () => {
    const { usePatientProfilePresets } = await import("@/hooks/usePatientProfilePresets");
    const rows = [
      { id: "p1", name: "Old Name", created_at: "2026-05-01T00:00:00.000Z", layout: V2_LAYOUT },
    ];
    const renamed = [{ ...rows[0], name: "New Name" }];
    setupFetchSequence({ presets: rows }, { presets: renamed });

    const { result } = renderHook(() =>
      usePatientProfilePresets({ applyLayout: mockApplyLayout }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.renamePreset("p1", "New Name");
    });

    const calls = vi.mocked(global.fetch).mock.calls;
    const putCall = calls[1];
    const body = JSON.parse(putCall[1]?.body as string) as {
      presets: Array<{ id: string; name: string }>;
    };
    expect(body.presets.find((p) => p.id === "p1")?.name).toBe("New Name");
    expect(result.current.customs[0].name).toBe("New Name");
  });

  // ── builtIns surface ──────────────────────────────────────────────────────

  it("always exposes 3 built-in presets regardless of backend state", async () => {
    const { usePatientProfilePresets } = await import("@/hooks/usePatientProfilePresets");
    setupFetchSequence({ presets: [] });

    const { result } = renderHook(() =>
      usePatientProfilePresets({ applyLayout: mockApplyLayout }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.builtIns).toHaveLength(3);
    const ids = result.current.builtIns.map((b) => b.id);
    expect(ids).toContain("built-in:triage");
    expect(ids).toContain("built-in:consult");
    expect(ids).toContain("built-in:document");
  });
});
