/**
 * Unit tests for `frontend/lib/patient-profile/cascade-resize.ts`.
 *
 * Runner: Vitest (jsdom environment) — globals via `globals: true` in
 * vitest.config.ts. No DOM required; these tests exercise the pure
 * algorithm only.
 *
 * The fixtures use a 3-pane layout (the v1 patient profile) and a 4-pane
 * layout (future-proofing for ppr-30 AI chat pane).
 *
 * Sum invariance is asserted explicitly in every test — the cascade MUST
 * conserve the total or the `react-resizable-panels` `setLayout` call will
 * either reject the layout or silently normalise it (both of which would
 * destabilise drag UX).
 */

import { applyDragWithCascade } from "../cascade-resize";

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

const expectApprox = (actual: number, expected: number, eps = 1e-6) => {
  expect(Math.abs(actual - expected)).toBeLessThan(eps);
};

const expectLayoutApprox = (actual: number[], expected: number[]) => {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expectApprox(actual[i], expected[i]);
  }
};

describe("applyDragWithCascade — basic invariants", () => {
  it("returns a copy with appliedDelta=0 when deltaPct=0", () => {
    const layout = [33, 34, 33];
    const result = applyDragWithCascade({
      layout,
      mins: [12, 12, 12],
      handleIndex: 0,
      deltaPct: 0,
    });
    expect(result.layout).toEqual(layout);
    expect(result.layout).not.toBe(layout); // returned a copy
    expect(result.appliedDelta).toBe(0);
    expect(result.clamped).toBe(false);
  });

  it("handles a 1-pane layout by returning the input unchanged", () => {
    const layout = [100];
    const result = applyDragWithCascade({
      layout,
      mins: [12],
      handleIndex: 0,
      deltaPct: 10,
    });
    expect(result.layout).toEqual(layout);
    expect(result.appliedDelta).toBe(0);
  });

  it("rejects out-of-range handleIndex by returning the input unchanged", () => {
    const layout = [33, 34, 33];
    expect(
      applyDragWithCascade({
        layout,
        mins: [12, 12, 12],
        handleIndex: -1,
        deltaPct: 5,
      }).layout,
    ).toEqual(layout);
    expect(
      applyDragWithCascade({
        layout,
        mins: [12, 12, 12],
        handleIndex: 2,
        deltaPct: 5,
      }).layout,
    ).toEqual(layout);
  });

  it("guards against non-finite deltaPct", () => {
    const layout = [33, 34, 33];
    expect(
      applyDragWithCascade({
        layout,
        mins: [12, 12, 12],
        handleIndex: 0,
        deltaPct: NaN,
      }).layout,
    ).toEqual(layout);
    expect(
      applyDragWithCascade({
        layout,
        mins: [12, 12, 12],
        handleIndex: 0,
        deltaPct: Infinity,
      }).layout,
    ).toEqual(layout);
  });

  it("throws when layout and mins length mismatch", () => {
    expect(() =>
      applyDragWithCascade({
        layout: [50, 50],
        mins: [12, 12, 12],
        handleIndex: 0,
        deltaPct: 5,
      }),
    ).toThrow(/length mismatch/);
  });
});

describe("applyDragWithCascade — right drag (handle moves right, left side grows)", () => {
  it("simple case: drag within first cascade pane's headroom", () => {
    // A=B=C=200, all mins=100. Handle 0, drag right by 80.
    const result = applyDragWithCascade({
      layout: [200, 200, 200],
      mins: [100, 100, 100],
      handleIndex: 0,
      deltaPct: 80,
    });
    expectLayoutApprox(result.layout, [280, 120, 200]);
    expect(result.appliedDelta).toBe(80);
    expect(result.clamped).toBe(false);
    expect(sum(result.layout)).toBe(600);
  });

  it("cascades to second pane when first hits min", () => {
    // A=B=C=200, all mins=100. Handle 0, drag right by 120.
    // B can shrink 100; remaining 20 absorbed by C.
    const result = applyDragWithCascade({
      layout: [200, 200, 200],
      mins: [100, 100, 100],
      handleIndex: 0,
      deltaPct: 120,
    });
    expectLayoutApprox(result.layout, [320, 100, 180]);
    expect(result.appliedDelta).toBe(120);
    expect(result.clamped).toBe(false);
    expect(sum(result.layout)).toBe(600);
  });

  it("clamps when all cascade panes reach min", () => {
    // A=B=C=200, all mins=100. Handle 0, drag right by 250.
    // B + C can give up 200 total; remaining 50 unfulfilled.
    const result = applyDragWithCascade({
      layout: [200, 200, 200],
      mins: [100, 100, 100],
      handleIndex: 0,
      deltaPct: 250,
    });
    expectLayoutApprox(result.layout, [400, 100, 100]);
    expect(result.appliedDelta).toBe(200);
    expect(result.clamped).toBe(true);
    expect(sum(result.layout)).toBe(600);
  });

  it("respects asymmetric mins per pane", () => {
    // A=B=C=200, mins=[50, 150, 50]. Handle 0, drag right by 100.
    // B can only shrink 50 (already near its 150 min); cascade to C
    // for the remaining 50.
    const result = applyDragWithCascade({
      layout: [200, 200, 200],
      mins: [50, 150, 50],
      handleIndex: 0,
      deltaPct: 100,
    });
    expectLayoutApprox(result.layout, [300, 150, 150]);
    expect(result.appliedDelta).toBe(100);
    expect(result.clamped).toBe(false);
    expect(sum(result.layout)).toBe(600);
  });

  it("skips a pane already at its minimum (zero headroom)", () => {
    // A=300, B=100 (at min), C=200, mins=[50, 100, 50]. Handle 0, drag right by 80.
    // B has 0 headroom; cascade jumps straight to C.
    const result = applyDragWithCascade({
      layout: [300, 100, 200],
      mins: [50, 100, 50],
      handleIndex: 0,
      deltaPct: 80,
    });
    expectLayoutApprox(result.layout, [380, 100, 120]);
    expect(result.appliedDelta).toBe(80);
    expect(result.clamped).toBe(false);
    expect(sum(result.layout)).toBe(600);
  });

  it("works on the rightmost handle (i = n-2) — no cascade target", () => {
    // 3 panes; handle 1 between B and C. Drag right by 50.
    // C is the only shrink target.
    const result = applyDragWithCascade({
      layout: [200, 200, 200],
      mins: [100, 100, 100],
      handleIndex: 1,
      deltaPct: 50,
    });
    expectLayoutApprox(result.layout, [200, 250, 150]);
    expect(result.appliedDelta).toBe(50);
    expect(result.clamped).toBe(false);
    expect(sum(result.layout)).toBe(600);
  });

  it("clamps to C's min on rightmost handle right drag", () => {
    // 3 panes; handle 1, drag right by 200. C can only give 100.
    const result = applyDragWithCascade({
      layout: [200, 200, 200],
      mins: [100, 100, 100],
      handleIndex: 1,
      deltaPct: 200,
    });
    expectLayoutApprox(result.layout, [200, 300, 100]);
    expect(result.appliedDelta).toBe(100);
    expect(result.clamped).toBe(true);
    expect(sum(result.layout)).toBe(600);
  });
});

describe("applyDragWithCascade — left drag (handle moves left, right side grows)", () => {
  it("simple case: drag within first cascade pane's headroom", () => {
    // A=B=C=200, all mins=100. Handle 1 (between B and C), drag left by 80.
    // B is the cascade target; shrinks 80 → 120. C grows to 280.
    const result = applyDragWithCascade({
      layout: [200, 200, 200],
      mins: [100, 100, 100],
      handleIndex: 1,
      deltaPct: -80,
    });
    expectLayoutApprox(result.layout, [200, 120, 280]);
    expect(result.appliedDelta).toBe(-80);
    expect(result.clamped).toBe(false);
    expect(sum(result.layout)).toBe(600);
  });

  it("cascades leftward when first pane hits min", () => {
    // A=B=C=200, mins=100. Handle 1, drag left by 150.
    // B can give 100; cascade to A for remaining 50.
    const result = applyDragWithCascade({
      layout: [200, 200, 200],
      mins: [100, 100, 100],
      handleIndex: 1,
      deltaPct: -150,
    });
    expectLayoutApprox(result.layout, [150, 100, 350]);
    expect(result.appliedDelta).toBe(-150);
    expect(result.clamped).toBe(false);
    expect(sum(result.layout)).toBe(600);
  });

  it("clamps when entire left side is at min", () => {
    // A=B=C=200, mins=100. Handle 1, drag left by 300.
    // A + B can give 200; remaining 100 unfulfilled.
    const result = applyDragWithCascade({
      layout: [200, 200, 200],
      mins: [100, 100, 100],
      handleIndex: 1,
      deltaPct: -300,
    });
    expectLayoutApprox(result.layout, [100, 100, 400]);
    expect(result.appliedDelta).toBe(-200);
    expect(result.clamped).toBe(true);
    expect(sum(result.layout)).toBe(600);
  });

  it("works on the leftmost handle (i = 0) — no leftward cascade target", () => {
    // 3 panes; handle 0, drag left by 50. Only A can shrink.
    const result = applyDragWithCascade({
      layout: [200, 200, 200],
      mins: [100, 100, 100],
      handleIndex: 0,
      deltaPct: -50,
    });
    expectLayoutApprox(result.layout, [150, 250, 200]);
    expect(result.appliedDelta).toBe(-50);
    expect(result.clamped).toBe(false);
    expect(sum(result.layout)).toBe(600);
  });

  it("clamps to A's min on leftmost handle left drag", () => {
    // 3 panes; handle 0, drag left by 200. A can only give 100.
    const result = applyDragWithCascade({
      layout: [200, 200, 200],
      mins: [100, 100, 100],
      handleIndex: 0,
      deltaPct: -200,
    });
    expectLayoutApprox(result.layout, [100, 300, 200]);
    expect(result.appliedDelta).toBe(-100);
    expect(result.clamped).toBe(true);
    expect(sum(result.layout)).toBe(600);
  });
});

describe("applyDragWithCascade — 4-pane cascade (future-proofing for ppr-30)", () => {
  it("cascades across three shrink panes on a right drag", () => {
    // A=B=C=D=200 (total 800), mins=100. Handle 0 (A↔B), drag right by 250.
    // B gives 100, C gives 100, D gives 50.
    const result = applyDragWithCascade({
      layout: [200, 200, 200, 200],
      mins: [100, 100, 100, 100],
      handleIndex: 0,
      deltaPct: 250,
    });
    expectLayoutApprox(result.layout, [450, 100, 100, 150]);
    expect(result.appliedDelta).toBe(250);
    expect(result.clamped).toBe(false);
    expect(sum(result.layout)).toBe(800);
  });

  it("clamps on a 4-pane right drag when all shrink panes hit min", () => {
    // Handle 1 (B↔C), drag right by 250. C gives 100, D gives 100; remaining 50.
    const result = applyDragWithCascade({
      layout: [200, 200, 200, 200],
      mins: [100, 100, 100, 100],
      handleIndex: 1,
      deltaPct: 250,
    });
    expectLayoutApprox(result.layout, [200, 400, 100, 100]);
    expect(result.appliedDelta).toBe(200);
    expect(result.clamped).toBe(true);
    expect(sum(result.layout)).toBe(800);
  });

  it("cascades leftward across three panes on a 4-pane left drag", () => {
    // Handle 2 (C↔D), drag left by 250.
    // C gives 100, B gives 100, A gives 50.
    const result = applyDragWithCascade({
      layout: [200, 200, 200, 200],
      mins: [100, 100, 100, 100],
      handleIndex: 2,
      deltaPct: -250,
    });
    expectLayoutApprox(result.layout, [150, 100, 100, 450]);
    expect(result.appliedDelta).toBe(-250);
    expect(result.clamped).toBe(false);
    expect(sum(result.layout)).toBe(800);
  });
});

describe("applyDragWithCascade — floating-point stability", () => {
  it("preserves sum exactly when the input is integer", () => {
    const result = applyDragWithCascade({
      layout: [33, 34, 33],
      mins: [12, 12, 12],
      handleIndex: 0,
      deltaPct: 7,
    });
    // 33+7=40, 34-7=27, 33 unchanged
    expectLayoutApprox(result.layout, [40, 27, 33]);
    expect(sum(result.layout)).toBe(100);
  });

  it("preserves sum within FP tolerance on fractional deltas", () => {
    const result = applyDragWithCascade({
      layout: [33.333333, 33.333333, 33.333334],
      mins: [12, 12, 12],
      handleIndex: 0,
      deltaPct: 0.000001,
    });
    expectApprox(sum(result.layout), 100, 1e-9);
  });

  it("does not produce sub-min values from epsilon drift", () => {
    // Tiny delta near a pane's min should snap cleanly without overshoot.
    const layout = [50, 12.0001, 37.9999];
    const result = applyDragWithCascade({
      layout,
      mins: [12, 12, 12],
      handleIndex: 0,
      deltaPct: 1,
    });
    // B only has 0.0001 headroom; C must absorb the rest.
    expect(result.layout[1]).toBeGreaterThanOrEqual(12);
    expectApprox(sum(result.layout), 100, 1e-9);
  });
});
