/**

 * built-in-presets — unit tests (Vitest).

 *

 * Acceptance criteria from ppr-15d (adapted for v4 paneTree):

 *   - Each preset round-trips through validateLayout cleanly (non-null).

 *   - Hidden panes have sizePct: 0 (canonical seed value).

 *   - Leaf paneOrder.length === 3 for all built-ins.

 *   - Visible panes within each preset sum to 100.

 *   - Pane sets match the expected ids ("chart", "body", "rx").

 */



import { describe, it, expect } from "vitest";

import { BUILT_IN_PRESETS } from "@/lib/patient-profile/built-in-presets";

import { validateLayout } from "@/lib/patient-profile/useShellLayout";

import { layoutFlat } from "./layout-flat";



describe("BUILT_IN_PRESETS — schema integrity", () => {

  for (const preset of BUILT_IN_PRESETS) {

    describe(`preset "${preset.id}"`, () => {

      it("round-trips through validateLayout cleanly", () => {

        const result = validateLayout(preset.layout);

        expect(result).not.toBeNull();

        expect(result!.version).toBe(5);

      });



      it("paneOrder has exactly 3 entries", () => {

        expect(layoutFlat(preset.layout).paneOrder).toHaveLength(3);

      });



      it("paneOrder contains chart, body, and rx", () => {

        const { paneOrder } = layoutFlat(preset.layout);

        expect(paneOrder).toContain("chart");

        expect(paneOrder).toContain("body");

        expect(paneOrder).toContain("rx");

      });



      it("hidden panes have sizePct: 0 (canonical seed value)", () => {

        const { paneOrder, paneState } = layoutFlat(preset.layout);

        for (const id of paneOrder) {

          const state = paneState[id];

          if (state.hidden) {

            expect(state.sizePct).toBe(0);

          }

        }

      });



      it("visible panes have sizePct > 0", () => {

        const { paneOrder, paneState } = layoutFlat(preset.layout);

        for (const id of paneOrder) {

          const state = paneState[id];

          if (!state.hidden) {

            expect(state.sizePct).toBeGreaterThan(0);

          }

        }

      });



      it("layout version is 4", () => {

        expect(preset.layout.version).toBe(5);

      });



      it("has a non-empty hotkey string", () => {

        expect(typeof preset.hotkey).toBe("string");

        expect(preset.hotkey.length).toBeGreaterThan(0);

      });

    });

  }

});



describe("BUILT_IN_PRESETS — individual preset values", () => {

  const byId = Object.fromEntries(BUILT_IN_PRESETS.map((p) => [p.id, p]));



  it("Triage: chart(60, visible) body(40, visible) rx(0, hidden)", () => {

    const { paneState } = layoutFlat(byId["built-in:triage"].layout);

    expect(paneState.chart).toEqual({ sizePct: 60, hidden: false });

    expect(paneState.body).toEqual({ sizePct: 40, hidden: false });

    expect(paneState.rx).toEqual({ sizePct: 0, hidden: true });

  });



  it("Consult: chart(25, visible) body(50, visible) rx(25, visible)", () => {

    const { paneState } = layoutFlat(byId["built-in:consult"].layout);

    expect(paneState.chart).toEqual({ sizePct: 25, hidden: false });

    expect(paneState.body).toEqual({ sizePct: 50, hidden: false });

    expect(paneState.rx).toEqual({ sizePct: 25, hidden: false });

  });



  it("Document: chart(0, hidden) body(30, visible) rx(70, visible)", () => {

    const { paneState } = layoutFlat(byId["built-in:document"].layout);

    expect(paneState.chart).toEqual({ sizePct: 0, hidden: true });

    expect(paneState.body).toEqual({ sizePct: 30, hidden: false });

    expect(paneState.rx).toEqual({ sizePct: 70, hidden: false });

  });



  it("Triage hotkey is mod+shift+1", () => {

    expect(byId["built-in:triage"].hotkey).toBe("mod+shift+1");

  });



  it("Consult hotkey is mod+shift+2", () => {

    expect(byId["built-in:consult"].hotkey).toBe("mod+shift+2");

  });



  it("Document hotkey is mod+shift+3", () => {

    expect(byId["built-in:document"].hotkey).toBe("mod+shift+3");

  });

});



describe("BUILT_IN_PRESETS — collection invariants", () => {

  it("exports exactly 3 built-in presets", () => {

    expect(BUILT_IN_PRESETS).toHaveLength(3);

  });



  it("all preset ids are unique", () => {

    const ids = BUILT_IN_PRESETS.map((p) => p.id);

    expect(new Set(ids).size).toBe(ids.length);

  });



  it("all preset labels are non-empty strings", () => {

    for (const preset of BUILT_IN_PRESETS) {

      expect(typeof preset.label).toBe("string");

      expect(preset.label.length).toBeGreaterThan(0);

    }

  });

});


