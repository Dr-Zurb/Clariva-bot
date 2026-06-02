/**
 * Unit tests for `useShellLayout` and its co-located pure helpers.
 *
 * Runner: Vitest (jsdom environment) — `describe`, `it`, `expect`,
 * `beforeEach`, `vi` are global via `globals: true` in vitest.config.ts.
 *
 * The hook tests use `renderHook` + `act` from `@testing-library/react`.
 * Pure-function tests (`validateLayout`, `layoutsEqual`, `defaultLayout`)
 * have no DOM dependency.
 */

import { renderHook, act } from "@testing-library/react";
import { flatToPaneTree } from "../layout-tree";
import {
  validateLayout,
  layoutsEqual,
  defaultLayout,
  useShellLayout,
  v4TreeLayoutStorageKey,
  isLayoutAlignedWith,
} from "../useShellLayout";
import type { PatientProfileLayout, PaneRuntimeState } from "../types";
import { layoutFlat } from "./layout-flat";

function v5FromFlat(flat: {
  paneOrder: string[];
  paneState: Record<string, PaneRuntimeState>;
}): PatientProfileLayout {
  return { version: 5, paneTree: flatToPaneTree(flat) };
}

// ---------------------------------------------------------------------------
// Helpers / fixtures
// ---------------------------------------------------------------------------

const STATE_A: PaneRuntimeState = { sizePct: 40, hidden: false };
const STATE_B: PaneRuntimeState = { sizePct: 30, hidden: false };
const STATE_C: PaneRuntimeState = { sizePct: 30, hidden: false };

const VALID_LAYOUT_V3 = {
  version: 3 as const,
  paneOrder: ["chart", "body", "rx"],
  paneState: {
    chart: STATE_A,
    body: STATE_B,
    rx: STATE_C,
  },
};

const VALID_LAYOUT: PatientProfileLayout = v5FromFlat(VALID_LAYOUT_V3);

const DEFAULT_ORDER = ["chart", "body", "rx"];
const DEFAULT_STATE: Record<string, PaneRuntimeState> = {
  chart: { sizePct: 26, hidden: false },
  body: { sizePct: 48, hidden: false },
  rx: { sizePct: 26, hidden: false },
};

// ---------------------------------------------------------------------------
// validateLayout — pure function
// ---------------------------------------------------------------------------

describe("validateLayout", () => {
  it("accepts a well-formed v3 payload and migrates to v5", () => {
    const result = validateLayout(VALID_LAYOUT_V3);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(5);
    expect(layoutFlat(result!)).toEqual(layoutFlat(VALID_LAYOUT));
  });

  it("accepts a well-formed v5 payload", () => {
    expect(validateLayout(VALID_LAYOUT)).toStrictEqual(VALID_LAYOUT);
  });

  it("accepts a v4 payload and upgrades leaves to v5", () => {
    const v4Payload = {
      version: 4 as const,
      paneTree: {
        id: "__root__",
        sizePct: 100,
        hidden: false,
        direction: "horizontal" as const,
        children: VALID_LAYOUT_V3.paneOrder.map((id) => ({
          id,
          sizePct: VALID_LAYOUT_V3.paneState[id as keyof typeof VALID_LAYOUT_V3.paneState].sizePct,
          hidden: VALID_LAYOUT_V3.paneState[id as keyof typeof VALID_LAYOUT_V3.paneState].hidden,
        })),
      },
    };
    const result = validateLayout(v4Payload);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(5);
    expect(layoutFlat(result!)).toEqual(layoutFlat(VALID_LAYOUT));
    for (const id of VALID_LAYOUT_V3.paneOrder) {
      const leaf = result!.paneTree.children!.find((c) => c.id === id)!;
      expect(leaf.paneIds).toEqual([id]);
      expect(leaf.activeTabId).toBe(id);
    }
  });

  it("rejects a v5 payload with structurally invalid leaves", () => {
    expect(
      validateLayout({
        version: 5,
        paneTree: {
          id: "chart",
          sizePct: 50,
          hidden: false,
          paneIds: ["chart", "body"],
          activeTabId: "rx",
        },
      }),
    ).toBeNull();
  });

  it("rejects null", () => {
    expect(validateLayout(null)).toBeNull();
  });

  it("rejects a non-object (string)", () => {
    expect(validateLayout("not-an-object")).toBeNull();
  });

  it("rejects missing version field", () => {
    const { version: _v, ...noVersion } = VALID_LAYOUT_V3;
    expect(validateLayout(noVersion)).toBeNull();
  });

  it("rejects wrong version (1)", () => {
    expect(validateLayout({ ...VALID_LAYOUT_V3, version: 1 })).toBeNull();
  });

  it("rejects wrong version ('2' as string)", () => {
    expect(validateLayout({ ...VALID_LAYOUT_V3, version: "2" })).toBeNull();
  });

  it("rejects duplicate ids in paneOrder", () => {
    expect(
      validateLayout({
        ...VALID_LAYOUT_V3,
        paneOrder: ["chart", "chart", "rx"],
      }),
    ).toBeNull();
  });

  it("rejects paneOrder that is not an array", () => {
    expect(validateLayout({ ...VALID_LAYOUT_V3, paneOrder: "chart,body" })).toBeNull();
  });

  it("rejects paneOrder containing a non-string entry", () => {
    expect(
      validateLayout({ ...VALID_LAYOUT_V3, paneOrder: ["chart", 2, "rx"] }),
    ).toBeNull();
  });

  it("rejects missing paneState entry for a listed pane", () => {
    const { rx: _rx, ...missingRx } = VALID_LAYOUT_V3.paneState;
    expect(
      validateLayout({ ...VALID_LAYOUT_V3, paneState: missingRx }),
    ).toBeNull();
  });

  it("rejects non-finite sizePct (NaN)", () => {
    expect(
      validateLayout({
        ...VALID_LAYOUT_V3,
        paneState: {
          ...VALID_LAYOUT_V3.paneState,
          chart: { sizePct: NaN, hidden: false },
        },
      }),
    ).toBeNull();
  });

  it("rejects sizePct < 0", () => {
    expect(
      validateLayout({
        ...VALID_LAYOUT_V3,
        paneState: {
          ...VALID_LAYOUT_V3.paneState,
          chart: { sizePct: -1, hidden: false },
        },
      }),
    ).toBeNull();
  });

  it("rejects sizePct > 100", () => {
    expect(
      validateLayout({
        ...VALID_LAYOUT_V3,
        paneState: {
          ...VALID_LAYOUT_V3.paneState,
          body: { sizePct: 101, hidden: false },
        },
      }),
    ).toBeNull();
  });

  it("rejects non-boolean hidden", () => {
    expect(
      validateLayout({
        ...VALID_LAYOUT_V3,
        paneState: {
          ...VALID_LAYOUT_V3.paneState,
          rx: { sizePct: 30, hidden: "false" },
        },
      }),
    ).toBeNull();
  });

  it("accepts sizePct values that don't sum to 100 (normalisation is the shell's job)", () => {
    expect(
      validateLayout({
        ...VALID_LAYOUT_V3,
        paneState: {
          chart: { sizePct: 33.3, hidden: false },
          body: { sizePct: 33.3, hidden: false },
          rx: { sizePct: 33.3, hidden: false },
        },
      }),
    ).not.toBeNull();
  });

  it("migrates a v2 payload (collapsed) to v3 (hidden)", () => {
    const v2Payload = {
      version: 2,
      paneOrder: ["chart", "body", "rx"],
      paneState: {
        chart: { sizePct: 26, collapsed: true },
        body: { sizePct: 48, collapsed: false },
        rx: { sizePct: 26, collapsed: false },
      },
    };
    const result = validateLayout(v2Payload);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(5);
    expect(layoutFlat(result!).paneState.chart.hidden).toBe(true);
    expect(layoutFlat(result!).paneState.body.hidden).toBe(false);
  });

  it("rejects a v1 payload (version: 1 or no version)", () => {
    expect(validateLayout({ version: 1, paneOrder: ["chart"], paneState: { chart: { sizePct: 100, hidden: false } } })).toBeNull();
    expect(validateLayout({ paneOrder: ["chart"], paneState: { chart: { sizePct: 100, hidden: false } } })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// layoutsEqual — pure function
// ---------------------------------------------------------------------------

describe("layoutsEqual", () => {
  it("returns true for identical layouts", () => {
    expect(layoutsEqual(VALID_LAYOUT, { ...VALID_LAYOUT })).toBe(true);
  });

  it("returns false when paneOrder differs", () => {
    const b = v5FromFlat({
      paneOrder: ["body", "chart", "rx"],
      paneState: VALID_LAYOUT_V3.paneState,
    });
    expect(layoutsEqual(VALID_LAYOUT, b)).toBe(false);
  });

  it("returns false when a sizePct differs", () => {
    const b = v5FromFlat({
      paneOrder: VALID_LAYOUT_V3.paneOrder,
      paneState: {
        ...VALID_LAYOUT_V3.paneState,
        chart: { sizePct: 50, hidden: false },
      },
    });
    expect(layoutsEqual(VALID_LAYOUT, b)).toBe(false);
  });

  it("returns false when a hidden flag differs", () => {
    const b = v5FromFlat({
      paneOrder: VALID_LAYOUT_V3.paneOrder,
      paneState: {
        ...VALID_LAYOUT_V3.paneState,
        rx: { sizePct: STATE_C.sizePct, hidden: true },
      },
    });
    expect(layoutsEqual(VALID_LAYOUT, b)).toBe(false);
  });

  it("returns false when paneOrder lengths differ", () => {
    const b = v5FromFlat({
      paneOrder: ["chart", "body"],
      paneState: { chart: STATE_A, body: STATE_B },
    });
    expect(layoutsEqual(VALID_LAYOUT, b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// defaultLayout — pure function
// ---------------------------------------------------------------------------

describe("defaultLayout", () => {
  it("derives paneOrder from the panes array order", () => {
    const panes = [
      { id: "chart", title: "Chart", render: () => null, naturalSizePct: 26 },
      { id: "body", title: "Body", render: () => null, naturalSizePct: 48 },
      { id: "rx", title: "Rx", render: () => null, naturalSizePct: 26 },
    ];
    const result = defaultLayout(panes, "test-key");
    expect(layoutFlat(result).paneOrder).toEqual(["chart", "body", "rx"]);
  });

  it("uses naturalSizePct when provided", () => {
    const panes = [
      { id: "chart", title: "Chart", render: () => null, naturalSizePct: 40 },
    ];
    const result = defaultLayout(panes, "test-key");
    expect(layoutFlat(result).paneState["chart"].sizePct).toBe(40);
  });

  it("falls back to 33 when naturalSizePct is omitted", () => {
    const panes = [{ id: "chart", title: "Chart", render: () => null }];
    const result = defaultLayout(panes, "test-key");
    expect(layoutFlat(result).paneState["chart"].sizePct).toBe(33);
  });

  it("sets hidden: false for all panes", () => {
    const panes = [
      { id: "a", title: "A", render: () => null },
      { id: "b", title: "B", render: () => null },
    ];
    const result = defaultLayout(panes, "test-key");
    for (const id of layoutFlat(result).paneOrder) {
      expect(layoutFlat(result).paneState[id].hidden).toBe(false);
    }
  });

  it("sets version: 5", () => {
    const result = defaultLayout([], "test-key");
    expect(result.version).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// useShellLayout hook
// ---------------------------------------------------------------------------

function makeHook(storageKey = "test:layout") {
  return renderHook(() =>
    useShellLayout({
      storageKey,
      defaultPaneOrder: DEFAULT_ORDER,
      defaultPaneState: DEFAULT_STATE,
    }),
  );
}

describe("useShellLayout — reorderPane", () => {
  it("swaps two pane ids", () => {
    const { result } = makeHook();
    act(() => {
      result.current.reorderPane("chart", "rx");
    });
    expect(result.current.paneOrder).toEqual(["rx", "body", "chart"]);
  });

  it("is idempotent when fromId === toId", () => {
    const { result } = makeHook();
    const before = [...result.current.paneOrder];
    act(() => {
      result.current.reorderPane("body", "body");
    });
    expect(result.current.paneOrder).toEqual(before);
  });

  it("is a no-op when fromId is unknown", () => {
    const { result } = makeHook();
    const before = [...result.current.paneOrder];
    act(() => {
      result.current.reorderPane("unknown", "chart");
    });
    expect(result.current.paneOrder).toEqual(before);
  });

  it("is a no-op when toId is unknown", () => {
    const { result } = makeHook();
    const before = [...result.current.paneOrder];
    act(() => {
      result.current.reorderPane("chart", "unknown");
    });
    expect(result.current.paneOrder).toEqual(before);
  });
});

describe("useShellLayout — setPaneSize", () => {
  it("updates sizePct for the given pane", () => {
    const { result } = makeHook();
    act(() => {
      result.current.setPaneSize("body", 60);
    });
    expect(result.current.paneState["body"].sizePct).toBe(60);
  });

  it("clamps values below 0 to 0", () => {
    const { result } = makeHook();
    act(() => {
      result.current.setPaneSize("chart", -5);
    });
    expect(result.current.paneState["chart"].sizePct).toBe(0);
  });

  it("clamps values above 100 to 100", () => {
    const { result } = makeHook();
    act(() => {
      result.current.setPaneSize("rx", 150);
    });
    expect(result.current.paneState["rx"].sizePct).toBe(100);
  });

  it("ignores NaN", () => {
    const { result } = makeHook();
    const before = result.current.paneState["body"].sizePct;
    act(() => {
      result.current.setPaneSize("body", NaN);
    });
    expect(result.current.paneState["body"].sizePct).toBe(before);
  });
});

describe("useShellLayout — setPaneHidden", () => {
  it("sets hidden to true", () => {
    const { result } = makeHook();
    act(() => {
      result.current.setPaneHidden("chart", true);
    });
    expect(result.current.paneState["chart"].hidden).toBe(true);
  });

  it("sets hidden back to false", () => {
    const { result } = makeHook();
    act(() => {
      result.current.setPaneHidden("chart", true);
    });
    act(() => {
      result.current.setPaneHidden("chart", false);
    });
    expect(result.current.paneState["chart"].hidden).toBe(false);
  });

  it("does not touch sizePct when flipping hidden", () => {
    const { result } = makeHook();
    const before = result.current.paneState["body"].sizePct;
    act(() => {
      result.current.setPaneHidden("body", true);
    });
    expect(result.current.paneState["body"].sizePct).toBe(before);
  });
});

describe("useShellLayout — setLeafIdsHidden", () => {
  it("batch-hides multiple leaves", () => {
    const { result } = makeHook();
    act(() => {
      result.current.setLeafIdsHidden(["chart", "body", "rx"], true);
    });
    expect(result.current.paneState["chart"].hidden).toBe(true);
    expect(result.current.paneState["body"].hidden).toBe(true);
    expect(result.current.paneState["rx"].hidden).toBe(true);
  });

  it("batch-shows multiple leaves", () => {
    const { result } = makeHook();
    act(() => {
      result.current.setLeafIdsHidden(["chart", "body"], true);
    });
    act(() => {
      result.current.setLeafIdsHidden(["chart", "body"], false);
    });
    expect(result.current.paneState["chart"].hidden).toBe(false);
    expect(result.current.paneState["body"].hidden).toBe(false);
  });
});

describe("useShellLayout — applyLayout", () => {
  it("replaces paneOrder and paneState on a valid layout", () => {
    const { result } = makeHook();
    const next = v5FromFlat({
      paneOrder: ["rx", "body", "chart"],
      paneState: {
        rx: { sizePct: 50, hidden: false },
        body: { sizePct: 30, hidden: false },
        chart: { sizePct: 20, hidden: true },
      },
    });
    act(() => {
      result.current.applyLayout(next);
    });
    expect(result.current.paneOrder).toEqual(["rx", "body", "chart"]);
    expect(result.current.paneState["chart"].hidden).toBe(true);
    expect(result.current.paneState["rx"].sizePct).toBe(50);
  });

  it("is a no-op on an invalid layout (wrong version)", () => {
    const { result } = makeHook();
    const before = [...result.current.paneOrder];
    act(() => {
      result.current.applyLayout({ version: 1, paneOrder: [], paneState: {} } as unknown as PatientProfileLayout);
    });
    expect(result.current.paneOrder).toEqual(before);
  });

  it("is a no-op on an invalid v5 layout", () => {
    const { result } = makeHook();
    const before = [...result.current.paneOrder];
    act(() => {
      result.current.applyLayout({
        version: 5,
        paneTree: { id: "chart", sizePct: 150, hidden: false },
      });
    });
    expect(result.current.paneOrder).toEqual(before);
  });
});

describe("useShellLayout — resetLayout", () => {
  it("restores the default paneOrder and paneState", () => {
    const { result } = makeHook();
    act(() => {
      result.current.reorderPane("chart", "rx");
      result.current.setPaneHidden("body", true);
    });
    act(() => {
      result.current.resetLayout();
    });
    expect(result.current.paneOrder).toEqual(DEFAULT_ORDER);
    expect(result.current.paneState["body"].hidden).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Persistence — write → read round-trip
// ---------------------------------------------------------------------------

describe("useShellLayout — localStorage persistence", () => {
  const STORAGE_KEY = "test:persist-layout";

  beforeEach(() => {
    localStorage.clear();
  });

  it("does not re-hydrate on every re-render when legacyStorageKeys is omitted (cpf-04)", () => {
    const { result, rerender } = renderHook(() =>
      useShellLayout({
        storageKey: STORAGE_KEY,
        defaultPaneOrder: DEFAULT_ORDER,
        defaultPaneState: DEFAULT_STATE,
      }),
    );

    act(() => {});
    const versionAfterHydration = result.current.layoutVersion;

    rerender();
    rerender();
    rerender();

    expect(result.current.layoutVersion).toBe(versionAfterHydration);
    expect(result.current.hydrated).toBe(true);
  });

  it("writes the layout to localStorage after a state change", async () => {
    const { result } = renderHook(() =>
      useShellLayout({
        storageKey: STORAGE_KEY,
        defaultPaneOrder: DEFAULT_ORDER,
        defaultPaneState: DEFAULT_STATE,
      }),
    );

    act(() => {
      result.current.setPaneHidden("chart", true);
    });

    // Wait for the 200 ms debounce to flush
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    const stored = localStorage.getItem(v4TreeLayoutStorageKey(STORAGE_KEY));
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    const validated = validateLayout(parsed);
    expect(validated).not.toBeNull();
    expect(layoutFlat(validated!).paneState["chart"].hidden).toBe(true);
  });

  it("rehydrates state from v4 localStorage on mount", async () => {
    const seed = v5FromFlat({
      paneOrder: ["rx", "chart", "body"],
      paneState: {
        rx: { sizePct: 50, hidden: false },
        chart: { sizePct: 30, hidden: true },
        body: { sizePct: 20, hidden: false },
      },
    });
    localStorage.setItem(v4TreeLayoutStorageKey(STORAGE_KEY), JSON.stringify(seed));

    const { result } = renderHook(() =>
      useShellLayout({
        storageKey: STORAGE_KEY,
        defaultPaneOrder: DEFAULT_ORDER,
        defaultPaneState: DEFAULT_STATE,
      }),
    );

    expect(result.current.paneOrder).toEqual(["rx", "chart", "body"]);
    expect(result.current.paneState["chart"].hidden).toBe(true);
  });

  it("migrates v3 localStorage to v5 on mount", async () => {
    const seedV3 = {
      version: 3,
      paneOrder: ["rx", "chart", "body"],
      paneState: {
        rx: { sizePct: 50, hidden: false },
        chart: { sizePct: 30, hidden: true },
        body: { sizePct: 20, hidden: false },
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedV3));

    const { result } = renderHook(() =>
      useShellLayout({
        storageKey: STORAGE_KEY,
        defaultPaneOrder: DEFAULT_ORDER,
        defaultPaneState: DEFAULT_STATE,
      }),
    );

    expect(result.current.paneOrder).toEqual(["rx", "chart", "body"]);
    expect(result.current.paneState["chart"].hidden).toBe(true);
    expect(localStorage.getItem(v4TreeLayoutStorageKey(STORAGE_KEY))).not.toBeNull();
  });

  it("rehydrates a v4 localStorage payload as v5 paneState", () => {
    const v4Payload = {
      version: 4,
      paneTree: {
        id: "__root__",
        sizePct: 100,
        hidden: false,
        direction: "horizontal",
        children: [
          { id: "rx", sizePct: 50, hidden: false },
          { id: "chart", sizePct: 30, hidden: true },
          { id: "body", sizePct: 20, hidden: false },
        ],
      },
    };
    localStorage.setItem(
      v4TreeLayoutStorageKey(STORAGE_KEY),
      JSON.stringify(v4Payload),
    );

    const { result } = renderHook(() =>
      useShellLayout({
        storageKey: STORAGE_KEY,
        defaultPaneOrder: DEFAULT_ORDER,
        defaultPaneState: DEFAULT_STATE,
      }),
    );

    expect(result.current.paneOrder).toEqual(["rx", "chart", "body"]);
    expect(result.current.paneState["chart"].hidden).toBe(true);
    const stored = JSON.parse(
      localStorage.getItem(v4TreeLayoutStorageKey(STORAGE_KEY))!,
    );
    expect(stored.version).toBe(5);
    for (const id of ["rx", "chart", "body"]) {
      const leaf = stored.paneTree.children.find((c: { id: string }) => c.id === id);
      expect(leaf.paneIds).toEqual([id]);
      expect(leaf.activeTabId).toBe(id);
    }
  });

  it("subsequent writes to localStorage use v5 shape", async () => {
    const v4Payload = {
      version: 4,
      paneTree: {
        id: "__root__",
        sizePct: 100,
        hidden: false,
        direction: "horizontal",
        children: [{ id: "chart", sizePct: 100, hidden: false }],
      },
    };
    localStorage.setItem(
      v4TreeLayoutStorageKey(STORAGE_KEY),
      JSON.stringify(v4Payload),
    );

    const { result } = renderHook(() =>
      useShellLayout({
        storageKey: STORAGE_KEY,
        defaultPaneOrder: ["chart"],
        defaultPaneState: { chart: { sizePct: 100, hidden: false } },
      }),
    );

    act(() => {
      result.current.setPaneHidden("chart", true);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });

    const stored = JSON.parse(
      localStorage.getItem(v4TreeLayoutStorageKey(STORAGE_KEY))!,
    );
    expect(stored.version).toBe(5);
    expect(stored.paneTree.children[0].paneIds).toEqual(["chart"]);
    expect(stored.paneTree.children[0].activeTabId).toBe("chart");
    expect(stored.paneTree.children[0].hidden).toBe(true);
  });

  it("falls back to defaults when the stored value is not valid JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not-valid-json{{");

    const { result } = renderHook(() =>
      useShellLayout({
        storageKey: STORAGE_KEY,
        defaultPaneOrder: DEFAULT_ORDER,
        defaultPaneState: DEFAULT_STATE,
      }),
    );

    expect(result.current.paneOrder).toEqual(DEFAULT_ORDER);
  });

  it("falls back to defaults when the stored value fails validateLayout", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, slots: ["chart", "body", "rx"] }),
    );

    const { result } = renderHook(() =>
      useShellLayout({
        storageKey: STORAGE_KEY,
        defaultPaneOrder: DEFAULT_ORDER,
        defaultPaneState: DEFAULT_STATE,
      }),
    );

    expect(result.current.paneOrder).toEqual(DEFAULT_ORDER);
  });
});

// ---------------------------------------------------------------------------
// isLayoutAlignedWith + knownLeafIds hydration guard (csl-03)
// ---------------------------------------------------------------------------

describe("isLayoutAlignedWith", () => {
  it("returns true when every known leaf id is present in the persisted layout", () => {
    const layout = v5FromFlat({
      paneOrder: ["snapshot", "history", "body", "stale"],
      paneState: {
        snapshot: { sizePct: 25, hidden: false },
        history: { sizePct: 25, hidden: false },
        body: { sizePct: 25, hidden: false },
        stale: { sizePct: 25, hidden: false },
      },
    });
    expect(isLayoutAlignedWith(layout, ["snapshot", "body"])).toBe(true);
  });

  it("returns false when any known leaf id is missing from the persisted layout", () => {
    const layout = v5FromFlat({
      paneOrder: ["snapshot", "history", "stale"],
      paneState: {
        snapshot: { sizePct: 33, hidden: false },
        history: { sizePct: 33, hidden: false },
        stale: { sizePct: 34, hidden: false },
      },
    });
    expect(isLayoutAlignedWith(layout, ["snapshot", "body"])).toBe(false);
  });

  it("returns false when no leaf id intersects the known set", () => {
    const layout = v5FromFlat({
      paneOrder: ["chart", "body", "rx"],
      paneState: {
        chart: { sizePct: 33, hidden: false },
        body: { sizePct: 33, hidden: false },
        rx: { sizePct: 34, hidden: false },
      },
    });
    expect(
      isLayoutAlignedWith(layout, [
        "snapshot",
        "history",
        "assessment",
        "investigations-orders",
        "plan",
        "subjective",
        "objective",
      ]),
    ).toBe(false);
  });

  it("accepts both ReadonlySet and readonly array inputs", () => {
    const layout = v5FromFlat({
      paneOrder: ["snapshot"],
      paneState: { snapshot: { sizePct: 100, hidden: false } },
    });
    expect(isLayoutAlignedWith(layout, new Set(["snapshot"]))).toBe(true);
    expect(isLayoutAlignedWith(layout, ["snapshot"])).toBe(true);
  });

  it("treats an empty known set as 'no template advertised' and returns true", () => {
    const layout = v5FromFlat({
      paneOrder: ["chart", "body", "rx"],
      paneState: {
        chart: { sizePct: 33, hidden: false },
        body: { sizePct: 33, hidden: false },
        rx: { sizePct: 34, hidden: false },
      },
    });
    expect(isLayoutAlignedWith(layout, [])).toBe(true);
    expect(isLayoutAlignedWith(layout, new Set<string>())).toBe(true);
  });
});

describe("useShellLayout — knownLeafIds hydration guard (csl-03)", () => {
  const STORAGE_KEY = "test:stale-layout";

  const V2_LEAVES = [
    "snapshot",
    "history",
    "body",
    "assessment",
    "investigations-orders",
    "plan",
    "subjective",
    "objective",
  ];
  const V2_DEFAULT_STATE: Record<string, PaneRuntimeState> = Object.fromEntries(
    V2_LEAVES.map((id) => [id, { sizePct: 14, hidden: false }]),
  );

  beforeEach(() => {
    localStorage.clear();
  });

  it("discards a persisted layout whose leaf ids do NOT intersect the current template", () => {
    // Seed a fully-valid v4 layout with stale v1 ids.
    const stale = v5FromFlat({
      paneOrder: ["chart", "body", "rx"],
      paneState: {
        chart: { sizePct: 26, hidden: false },
        body: { sizePct: 48, hidden: false },
        rx: { sizePct: 26, hidden: false },
      },
    });
    localStorage.setItem(
      v4TreeLayoutStorageKey(STORAGE_KEY),
      JSON.stringify(stale),
    );

    const { result } = renderHook(() =>
      useShellLayout({
        storageKey: STORAGE_KEY,
        defaultPaneOrder: V2_LEAVES,
        defaultPaneState: V2_DEFAULT_STATE,
        knownLeafIds: V2_LEAVES,
      }),
    );

    // Hydration discarded the stale tree and the hook fell back to defaults.
    expect(result.current.paneOrder).toEqual(V2_LEAVES);
    // localStorage was cleared so the next write seeds a clean v4 entry.
    expect(
      localStorage.getItem(v4TreeLayoutStorageKey(STORAGE_KEY)),
    ).toBeNull();
  });

  it("discards a partially-overlapping persisted layout (missing template leaves)", () => {
    // Partial overlap — `snapshot` matches but the rest of the v2 template is
    // absent; column toggles would update ids that do not exist in storage.
    const partial = v5FromFlat({
      paneOrder: ["snapshot", "chart", "body"],
      paneState: {
        snapshot: { sizePct: 30, hidden: false },
        chart: { sizePct: 30, hidden: false },
        body: { sizePct: 40, hidden: false },
      },
    });
    localStorage.setItem(
      v4TreeLayoutStorageKey(STORAGE_KEY),
      JSON.stringify(partial),
    );

    const { result } = renderHook(() =>
      useShellLayout({
        storageKey: STORAGE_KEY,
        defaultPaneOrder: V2_LEAVES,
        defaultPaneState: V2_DEFAULT_STATE,
        knownLeafIds: V2_LEAVES,
      }),
    );

    expect(result.current.paneOrder).toEqual(V2_LEAVES);
    expect(
      localStorage.getItem(v4TreeLayoutStorageKey(STORAGE_KEY)),
    ).toBeNull();
  });

  it("preserves legacy behavior when knownLeafIds is omitted", () => {
    const stale = v5FromFlat({
      paneOrder: ["chart", "body", "rx"],
      paneState: {
        chart: { sizePct: 26, hidden: false },
        body: { sizePct: 48, hidden: false },
        rx: { sizePct: 26, hidden: false },
      },
    });
    localStorage.setItem(
      v4TreeLayoutStorageKey(STORAGE_KEY),
      JSON.stringify(stale),
    );

    const { result } = renderHook(() =>
      useShellLayout({
        storageKey: STORAGE_KEY,
        defaultPaneOrder: ["chart", "body", "rx"],
        defaultPaneState: {
          chart: { sizePct: 26, hidden: false },
          body: { sizePct: 48, hidden: false },
          rx: { sizePct: 26, hidden: false },
        },
        // knownLeafIds intentionally omitted
      }),
    );

    expect(result.current.paneOrder).toEqual(["chart", "body", "rx"]);
  });

  it("treats an empty knownLeafIds as 'no template advertised' (no discard)", () => {
    const stale = v5FromFlat({
      paneOrder: ["chart", "body", "rx"],
      paneState: {
        chart: { sizePct: 26, hidden: false },
        body: { sizePct: 48, hidden: false },
        rx: { sizePct: 26, hidden: false },
      },
    });
    localStorage.setItem(
      v4TreeLayoutStorageKey(STORAGE_KEY),
      JSON.stringify(stale),
    );

    const { result } = renderHook(() =>
      useShellLayout({
        storageKey: STORAGE_KEY,
        defaultPaneOrder: ["chart", "body", "rx"],
        defaultPaneState: {
          chart: { sizePct: 26, hidden: false },
          body: { sizePct: 48, hidden: false },
          rx: { sizePct: 26, hidden: false },
        },
        knownLeafIds: [],
      }),
    );

    expect(result.current.paneOrder).toEqual(["chart", "body", "rx"]);
  });

  it("also clears legacy v3 keys so re-hydration cannot resurrect stale ids", () => {
    const staleV3 = {
      version: 3 as const,
      paneOrder: ["chart", "body", "rx"],
      paneState: {
        chart: { sizePct: 26, hidden: false },
        body: { sizePct: 48, hidden: false },
        rx: { sizePct: 26, hidden: false },
      },
    };
    const LEGACY_KEY = "test:legacy:v3";
    localStorage.setItem(LEGACY_KEY, JSON.stringify(staleV3));

    renderHook(() =>
      useShellLayout({
        storageKey: STORAGE_KEY,
        legacyStorageKeys: [LEGACY_KEY],
        defaultPaneOrder: V2_LEAVES,
        defaultPaneState: V2_DEFAULT_STATE,
        knownLeafIds: V2_LEAVES,
      }),
    );

    // Both the primary v4 key AND the legacy v3 key are gone.
    expect(
      localStorage.getItem(v4TreeLayoutStorageKey(STORAGE_KEY)),
    ).toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });
});
