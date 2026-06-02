/**
 * Unit tests for `frontend/lib/patient-profile/layout.ts`.
 *
 * Runner: Vitest (jsdom environment) — `describe`, `it`, `expect`,
 * `beforeEach`, `vi` are global via `globals: true` in vitest.config.ts.
 *
 * localStorage is provided by jsdom; we clear it in `beforeEach` and use
 * `vi.spyOn` where we need to assert on warning output.
 */

import {
  buildDefaultLayout,
  layoutsEqual,
  readLegacyLayoutOnce,
  shouldRunSeed,
  markSeedDone,
  LAYOUT_STORAGE_KEY,
  LEGACY_SEEDED_KEY,
  LEGACY_COCKPIT_LAYOUT_KEY,
  LEGACY_COCKPIT_LAYOUT_WALKIN_KEY,
  LEGACY_RRP_KEY,
  LEGACY_RRP_WALKIN_KEY,
} from "../layout";
import { flatToPaneTree } from "../layout-tree";
import type { PaneDefinition, PatientProfileLayout } from "../types";
import { layoutFlat } from "./layout-flat";

function v5FromFlat(flat: {
  paneOrder: string[];
  paneState: Record<string, { sizePct: number; hidden: boolean }>;
}): PatientProfileLayout {
  return { version: 5, paneTree: flatToPaneTree(flat) };
}

// ---------------------------------------------------------------------------
// Fixtures — PaneDefinition[]
// ---------------------------------------------------------------------------

const PANE_CHART: PaneDefinition = {
  id: "chart",
  title: "Patient chart",
  render: () => null,
  naturalSizePct: 26,
  minSizePct: 12,
};
const PANE_BODY: PaneDefinition = {
  id: "body",
  title: "Consultation",
  render: () => null,
  naturalSizePct: 48,
  minSizePct: 18,
};
const PANE_RX: PaneDefinition = {
  id: "rx",
  title: "Prescription",
  render: () => null,
  naturalSizePct: 26,
  minSizePct: 14,
};

const PANES_3 = [PANE_CHART, PANE_BODY, PANE_RX];
const PANES_WALKIN = [PANE_BODY, PANE_RX]; // walk-in: no chart

// ---------------------------------------------------------------------------
// Fixtures — legacy v1 CockpitLayout payloads
// ---------------------------------------------------------------------------

/** Standard permutation: chart-body-rx, 26/48/26, nothing collapsed. */
const LEGACY_V1_STANDARD = {
  slots: ["chart", "body", "rx"],
  widths: [26, 48, 26],
  collapsed: { chart: false, body: false, rx: false },
  middleCollapseSide: null,
};

/** Reordered permutation: rx-chart-body, 30/40/30, chart collapsed. */
const LEGACY_V1_REORDERED = {
  slots: ["rx", "chart", "body"],
  widths: [30, 40, 30],
  collapsed: { chart: true, body: false, rx: false },
  middleCollapseSide: null,
};

/**
 * Walk-in payload: chart at width 0, body+rx split 60/40.
 * middleCollapseSide is non-null to verify it is dropped.
 */
const LEGACY_V1_WALKIN = {
  slots: ["chart", "body", "rx"],
  widths: [0, 60, 40],
  collapsed: { chart: false, body: false, rx: false },
  middleCollapseSide: "right", // must be dropped
};

/** Widths-only RRP payload for the standard 3-pane cockpit. */
const LEGACY_RRP_STANDARD = {
  "cockpit-col-chart": 26,
  "cockpit-col-body": 48,
  "cockpit-col-rx": 26,
  // Spacer panel id — must be ignored
  "patient-profile:spacer": 0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setLegacyItem(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// buildDefaultLayout
// ---------------------------------------------------------------------------

describe("buildDefaultLayout", () => {
  it("builds a valid v4 layout for 3 panes", () => {
    const layout = buildDefaultLayout(PANES_3);
    expect(layout.version).toBe(5);
    const flat = layoutFlat(layout);
    expect(flat.paneOrder).toEqual(["chart", "body", "rx"]);
    expect(flat.paneState.chart).toEqual({ sizePct: 26, hidden: false });
    expect(flat.paneState.body).toEqual({ sizePct: 48, hidden: false });
    expect(flat.paneState.rx).toEqual({ sizePct: 26, hidden: false });
  });

  it("builds a valid v4 layout for 2-pane (walk-in)", () => {
    const layout = buildDefaultLayout(PANES_WALKIN);
    expect(layout.version).toBe(5);
    const flat = layoutFlat(layout);
    expect(flat.paneOrder).toEqual(["body", "rx"]);
    expect(flat.paneState).not.toHaveProperty("chart");
    expect(flat.paneState.body).toEqual({ sizePct: 48, hidden: false });
    expect(flat.paneState.rx).toEqual({ sizePct: 26, hidden: false });
  });

  it("falls back to 33 for panes without naturalSizePct", () => {
    const pane: PaneDefinition = { id: "test", title: "Test", render: () => null };
    const layout = buildDefaultLayout([pane]);
    expect(layoutFlat(layout).paneState.test.sizePct).toBe(33);
  });

  it("all panes start un-hidden", () => {
    const layout = buildDefaultLayout(PANES_3);
    for (const id of layoutFlat(layout).paneOrder) {
      expect(layoutFlat(layout).paneState[id]?.hidden).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// layoutsEqual
// ---------------------------------------------------------------------------

describe("layoutsEqual", () => {
  const A: PatientProfileLayout = v5FromFlat({
    paneOrder: ["chart", "body", "rx"],
    paneState: {
      chart: { sizePct: 26, hidden: false },
      body: { sizePct: 48, hidden: false },
      rx: { sizePct: 26, hidden: false },
    },
  });

  it("is reflexive", () => {
    expect(layoutsEqual(A, A)).toBe(true);
  });

  it("is symmetric for identical objects", () => {
    const B: PatientProfileLayout = JSON.parse(JSON.stringify(A)) as PatientProfileLayout;
    expect(layoutsEqual(A, B)).toBe(true);
    expect(layoutsEqual(B, A)).toBe(true);
  });

  it("returns false for different pane order", () => {
    const B = v5FromFlat({
      paneOrder: ["body", "chart", "rx"],
      paneState: layoutFlat(A).paneState,
    });
    expect(layoutsEqual(A, B)).toBe(false);
  });

  it("returns false for different sizePct", () => {
    const flat = layoutFlat(A);
    const B = v5FromFlat({
      paneOrder: flat.paneOrder,
      paneState: { ...flat.paneState, chart: { sizePct: 30, hidden: false } },
    });
    expect(layoutsEqual(A, B)).toBe(false);
  });

  it("returns false for different hidden state", () => {
    const flat = layoutFlat(A);
    const B = v5FromFlat({
      paneOrder: flat.paneOrder,
      paneState: { ...flat.paneState, rx: { sizePct: 26, hidden: true } },
    });
    expect(layoutsEqual(A, B)).toBe(false);
  });

  it("returns false for different pane counts", () => {
    const B = v5FromFlat({
      paneOrder: ["body", "rx"],
      paneState: {
        body: { sizePct: 60, hidden: false },
        rx: { sizePct: 40, hidden: false },
      },
    });
    expect(layoutsEqual(A, B)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldRunSeed / markSeedDone
// ---------------------------------------------------------------------------

describe("shouldRunSeed / markSeedDone", () => {
  it("returns true when LEGACY_SEEDED_KEY is absent", () => {
    expect(shouldRunSeed()).toBe(true);
  });

  it("returns false after markSeedDone() is called", () => {
    markSeedDone();
    expect(shouldRunSeed()).toBe(false);
  });

  it("markSeedDone is idempotent — subsequent shouldRunSeed calls stay false", () => {
    markSeedDone();
    markSeedDone();
    expect(shouldRunSeed()).toBe(false);
    expect(localStorage.getItem(LEGACY_SEEDED_KEY)).toBe("1");
  });

  it("returns true again after the key is manually cleared", () => {
    markSeedDone();
    localStorage.removeItem(LEGACY_SEEDED_KEY);
    expect(shouldRunSeed()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// readLegacyLayoutOnce — full v1 cockpit-layout key
// ---------------------------------------------------------------------------

describe("readLegacyLayoutOnce — full v1 (cockpit-layout:v1:*)", () => {
  it("translates the standard chart-body-rx permutation", () => {
    setLegacyItem(LEGACY_COCKPIT_LAYOUT_KEY, LEGACY_V1_STANDARD);
    const result = readLegacyLayoutOnce({ panes: PANES_3 });

    expect(result).not.toBeNull();
    expect(result!.version).toBe(5);
    const flat = layoutFlat(result!);
    expect(flat.paneOrder).toEqual(["chart", "body", "rx"]);
    expect(flat.paneState.chart.sizePct).toBeCloseTo(26);
    expect(flat.paneState.body.sizePct).toBeCloseTo(48);
    expect(flat.paneState.rx.sizePct).toBeCloseTo(26);
    expect(flat.paneState.chart.hidden).toBe(false);
  });

  it("translates the reordered rx-chart-body permutation with chart collapsed", () => {
    setLegacyItem(LEGACY_COCKPIT_LAYOUT_KEY, LEGACY_V1_REORDERED);
    const result = readLegacyLayoutOnce({ panes: PANES_3 });

    expect(result).not.toBeNull();
    const flat = layoutFlat(result!);
    expect(flat.paneOrder).toEqual(["rx", "chart", "body"]);
    expect(flat.paneState.rx.sizePct).toBeCloseTo(30);
    expect(flat.paneState.chart.sizePct).toBeCloseTo(40);
    expect(flat.paneState.body.sizePct).toBeCloseTo(30);
    expect(flat.paneState.chart.hidden).toBe(true);
    expect(flat.paneState.rx.hidden).toBe(false);
  });

  it("drops middleCollapseSide — middle pane is treated as expanded", () => {
    // LEGACY_V1_WALKIN has middleCollapseSide: "right" and body is in the
    // middle slot. After translation, body.collapsed must be false.
    setLegacyItem(LEGACY_COCKPIT_LAYOUT_WALKIN_KEY, LEGACY_V1_WALKIN);
    const result = readLegacyLayoutOnce({ panes: PANES_WALKIN, walkin: true });

    expect(result).not.toBeNull();
    // chart filtered out for walk-in
    const flat = layoutFlat(result!);
    expect(flat.paneOrder).toEqual(["body", "rx"]);
    expect(flat.paneState).not.toHaveProperty("chart");
    expect(flat.paneState.body.hidden).toBe(false);
    expect(flat.paneState.rx.hidden).toBe(false);
  });

  it("translates walk-in: chart excluded, body+rx normalised to 100", () => {
    setLegacyItem(LEGACY_COCKPIT_LAYOUT_WALKIN_KEY, LEGACY_V1_WALKIN);
    const result = readLegacyLayoutOnce({ panes: PANES_WALKIN, walkin: true });

    expect(result).not.toBeNull();
    const flat = layoutFlat(result!);
    const bodyPct = flat.paneState.body.sizePct;
    const rxPct = flat.paneState.rx.sizePct;
    // widths[1]=60, widths[2]=40, chart(0) excluded → sum=100 → no change
    expect(bodyPct).toBeCloseTo(60);
    expect(rxPct).toBeCloseTo(40);
  });

  it("does not delete the legacy key after translation", () => {
    setLegacyItem(LEGACY_COCKPIT_LAYOUT_KEY, LEGACY_V1_STANDARD);
    readLegacyLayoutOnce({ panes: PANES_3 });
    expect(localStorage.getItem(LEGACY_COCKPIT_LAYOUT_KEY)).not.toBeNull();
  });

  it("does not write to LAYOUT_STORAGE_KEY itself", () => {
    setLegacyItem(LEGACY_COCKPIT_LAYOUT_KEY, LEGACY_V1_STANDARD);
    readLegacyLayoutOnce({ panes: PANES_3 });
    // Caller's responsibility to write the result; this function is read-only
    expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readLegacyLayoutOnce — widths-only RRP fallback
// ---------------------------------------------------------------------------

describe("readLegacyLayoutOnce — RRP widths-only fallback", () => {
  it("translates a standard RRP payload when v1 key is absent", () => {
    setLegacyItem(LEGACY_RRP_KEY, LEGACY_RRP_STANDARD);
    const result = readLegacyLayoutOnce({ panes: PANES_3 });

    expect(result).not.toBeNull();
    const flat = layoutFlat(result!);
    expect(flat.paneOrder).toEqual(["chart", "body", "rx"]);
    expect(flat.paneState.chart.sizePct).toBeCloseTo(26);
    expect(flat.paneState.body.sizePct).toBeCloseTo(48);
    expect(flat.paneState.rx.sizePct).toBeCloseTo(26);
  });

  it("all hidden flags are false (RRP key stores no collapse state)", () => {
    setLegacyItem(LEGACY_RRP_KEY, LEGACY_RRP_STANDARD);
    const result = readLegacyLayoutOnce({ panes: PANES_3 });

    expect(result).not.toBeNull();
    for (const id of layoutFlat(result!).paneOrder) {
      expect(layoutFlat(result!).paneState[id]?.hidden).toBe(false);
    }
  });

  it("ignores unrecognised panel ids (spacer, etc.)", () => {
    const rrpWithExtra = {
      ...LEGACY_RRP_STANDARD,
      "cockpit-col-spacer": 0,
      "unknown-panel": 50,
    };
    setLegacyItem(LEGACY_RRP_KEY, rrpWithExtra);
    const result = readLegacyLayoutOnce({ panes: PANES_3 });

    expect(result).not.toBeNull();
    const flat = layoutFlat(result!);
    expect(flat.paneOrder).toEqual(["chart", "body", "rx"]);
    expect(flat.paneState).not.toHaveProperty("spacer");
    expect(flat.paneState).not.toHaveProperty("unknown-panel");
  });

  it("prefers v1 key over RRP when both are present", () => {
    setLegacyItem(LEGACY_COCKPIT_LAYOUT_KEY, LEGACY_V1_REORDERED);
    setLegacyItem(LEGACY_RRP_KEY, LEGACY_RRP_STANDARD);
    const result = readLegacyLayoutOnce({ panes: PANES_3 });

    // Should use the full v1 key (reordered permutation)
    expect(layoutFlat(result!).paneOrder).toEqual(["rx", "chart", "body"]);
  });

  it("falls back to RRP key when v1 key is absent", () => {
    setLegacyItem(LEGACY_RRP_KEY, LEGACY_RRP_STANDARD);
    // No LEGACY_COCKPIT_LAYOUT_KEY set
    const result = readLegacyLayoutOnce({ panes: PANES_3 });

    expect(result).not.toBeNull();
    expect(layoutFlat(result!).paneOrder).toEqual(["chart", "body", "rx"]);
  });

  it("translates walk-in RRP key", () => {
    const walkinRrp = {
      "cockpit-col-body": 60,
      "cockpit-col-rx": 40,
    };
    setLegacyItem(LEGACY_RRP_WALKIN_KEY, walkinRrp);
    const result = readLegacyLayoutOnce({ panes: PANES_WALKIN, walkin: true });

    expect(result).not.toBeNull();
    const flat = layoutFlat(result!);
    expect(flat.paneOrder).toEqual(["body", "rx"]);
    expect(flat.paneState.body.sizePct).toBeCloseTo(60);
    expect(flat.paneState.rx.sizePct).toBeCloseTo(40);
  });
});

// ---------------------------------------------------------------------------
// readLegacyLayoutOnce — failure modes
// ---------------------------------------------------------------------------

describe("readLegacyLayoutOnce — failure modes", () => {
  it("returns null when neither legacy key is present", () => {
    expect(readLegacyLayoutOnce({ panes: PANES_3 })).toBeNull();
  });

  it("returns null and warns on malformed JSON in v1 key", () => {
    localStorage.setItem(LEGACY_COCKPIT_LAYOUT_KEY, "not valid json{{{");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = readLegacyLayoutOnce({ panes: PANES_3 });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("legacy-parse-fail"),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it("returns null and warns on malformed JSON in RRP key", () => {
    localStorage.setItem(LEGACY_RRP_KEY, "{bad json");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = readLegacyLayoutOnce({ panes: PANES_3 });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("legacy-parse-fail"),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it("returns null when v1 key exists but fails structural check (missing slots)", () => {
    setLegacyItem(LEGACY_COCKPIT_LAYOUT_KEY, { widths: [26, 48, 26] });
    const result = readLegacyLayoutOnce({ panes: PANES_3 });
    // Falls through to RRP (also absent) → null
    expect(result).toBeNull();
  });

  it("returns null when RRP payload is an array instead of object", () => {
    setLegacyItem(LEGACY_RRP_KEY, [26, 48, 26]);
    const result = readLegacyLayoutOnce({ panes: PANES_3 });
    expect(result).toBeNull();
  });
});
