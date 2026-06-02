import { translateLegacyPreset } from "../preset-translation";
import { layoutFlat } from "./layout-flat";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Standard v1 layout saved by the v1 cockpit shell (chart-body-rx order). */
const V1_STANDARD = {
  slots: ["chart", "body", "rx"],
  widths: [26, 48, 26],
  collapsed: { chart: false, body: false, rx: false },
  middleCollapseSide: null,
};

/** v1 preset with body-chart-rx slot order. */
const V1_REORDERED = {
  slots: ["body", "chart", "rx"],
  widths: [50, 30, 20],
  collapsed: { body: false, chart: false, rx: false },
};

/** v1 walk-in preset (chart slot at 0 width, collapsed). */
const V1_WALKIN = {
  slots: ["chart", "body", "rx"],
  widths: [0, 60, 40],
  collapsed: { chart: true, body: false, rx: false },
};

/** v1 preset with rx pane collapsed. */
const V1_TRIAGE = {
  slots: ["chart", "body", "rx"],
  widths: [40, 50, 10],
  collapsed: { chart: false, body: false, rx: true },
};

/** Valid v3-tagged layout (migrated to v4 on read). */
const V3_TAGGED = {
  version: 3,
  paneOrder: ["chart", "body", "rx"],
  paneState: {
    chart: { sizePct: 26, hidden: false },
    body: { sizePct: 48, hidden: false },
    rx: { sizePct: 26, hidden: false },
  },
};

// ---------------------------------------------------------------------------
// Translation of legitimate v1 inputs
// ---------------------------------------------------------------------------

describe("translateLegacyPreset — v1 → v4", () => {
  it("translates a standard chart-body-rx v1 preset", () => {
    const result = translateLegacyPreset(V1_STANDARD);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(5);
    const flat = layoutFlat(result!);
    expect(flat.paneOrder).toEqual(["chart", "body", "rx"]);
    expect(flat.paneState.chart.sizePct).toBe(26);
    expect(flat.paneState.body.sizePct).toBe(48);
    expect(flat.paneState.rx.sizePct).toBe(26);
    expect(flat.paneState.chart.hidden).toBe(false);
    expect(flat.paneState.rx.hidden).toBe(false);
  });

  it("translates a reordered body-chart-rx v1 preset", () => {
    const result = translateLegacyPreset(V1_REORDERED);
    expect(result).not.toBeNull();
    const flat = layoutFlat(result!);
    expect(flat.paneOrder).toEqual(["body", "chart", "rx"]);
    expect(flat.paneState.body.sizePct).toBe(50);
    expect(flat.paneState.chart.sizePct).toBe(30);
    expect(flat.paneState.rx.sizePct).toBe(20);
  });

  it("translates a walk-in v1 preset (chart at width 0, collapsed)", () => {
    const result = translateLegacyPreset(V1_WALKIN);
    expect(result).not.toBeNull();
    const flat = layoutFlat(result!);
    expect(flat.paneState.chart.sizePct).toBe(0);
    expect(flat.paneState.chart.hidden).toBe(true);
    expect(flat.paneState.body.sizePct).toBe(60);
    expect(flat.paneState.rx.sizePct).toBe(40);
  });

  it("translates a triage-like v1 preset with rx collapsed", () => {
    const result = translateLegacyPreset(V1_TRIAGE);
    expect(result).not.toBeNull();
    const flat = layoutFlat(result!);
    expect(flat.paneState.rx.hidden).toBe(true);
    expect(flat.paneState.chart.hidden).toBe(false);
  });

  it("drops middleCollapseSide (not present in paneState)", () => {
    const result = translateLegacyPreset(V1_STANDARD);
    expect(result).not.toBeNull();
    const keys = Object.keys(layoutFlat(result!).paneState.body);
    expect(keys).toEqual(expect.arrayContaining(["sizePct", "hidden"]));
    expect(keys).not.toContain("middleCollapseSide");
  });
});

// ---------------------------------------------------------------------------
// v3-tagged rows pass through unchanged
// ---------------------------------------------------------------------------

describe("translateLegacyPreset — v3 → v4 migration", () => {
  it("migrates a v3-tagged row to v4", () => {
    const result = translateLegacyPreset(V3_TAGGED);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(5);
    expect(layoutFlat(result!).paneOrder).toEqual(["chart", "body", "rx"]);
  });

  it("re-validates a v3-tagged row (rejects a malformed v3 payload)", () => {
    const bad = {
      version: 3,
      paneOrder: ["chart", "chart"], // duplicate ids
      paneState: { chart: { sizePct: 50, hidden: false } },
    };
    expect(translateLegacyPreset(bad)).toBeNull();
  });

  it("migrates a v2-tagged row to v4 on pass-through", () => {
    const v2Row = {
      version: 2,
      paneOrder: ["chart", "body", "rx"],
      paneState: {
        chart: { sizePct: 26, collapsed: false },
        body: { sizePct: 48, collapsed: false },
        rx: { sizePct: 26, collapsed: true },
      },
    };
    const result = translateLegacyPreset(v2Row);
    expect(result).not.toBeNull();
    expect(result!.version).toBe(5);
    expect(layoutFlat(result!).paneState.rx.hidden).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Malformed / unrecognised inputs → null
// ---------------------------------------------------------------------------

describe("translateLegacyPreset — malformed inputs", () => {
  it("returns null for null", () => {
    expect(translateLegacyPreset(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(translateLegacyPreset(undefined)).toBeNull();
  });

  it("returns null for an empty object", () => {
    expect(translateLegacyPreset({})).toBeNull();
  });

  it("returns null when slots is not an array", () => {
    expect(translateLegacyPreset({ slots: "chart,body", widths: [30, 40, 30], collapsed: {} })).toBeNull();
  });

  it("returns null when widths length does not match slots length", () => {
    expect(
      translateLegacyPreset({ slots: ["chart", "body", "rx"], widths: [50, 50], collapsed: {} }),
    ).toBeNull();
  });

  it("returns null when collapsed is absent", () => {
    expect(
      translateLegacyPreset({ slots: ["chart", "body", "rx"], widths: [30, 40, 30] }),
    ).toBeNull();
  });

  it("returns null for a plain string", () => {
    expect(translateLegacyPreset("chart-body-rx")).toBeNull();
  });

  it("returns null for a number", () => {
    expect(translateLegacyPreset(42)).toBeNull();
  });

  it("returns null when slots contains duplicates (invalid paneOrder)", () => {
    expect(
      translateLegacyPreset({
        slots: ["chart", "chart", "rx"],
        widths: [30, 40, 30],
        collapsed: { chart: false, rx: false },
      }),
    ).toBeNull();
  });
});
