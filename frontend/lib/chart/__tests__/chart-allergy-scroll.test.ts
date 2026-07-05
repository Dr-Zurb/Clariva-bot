import { describe, expect, it, vi } from "vitest";
import {
  reAnchorAllergyCardOnClose,
  scrollAllergyCardHeaderIntoView,
} from "@/lib/chart/chart-allergy-scroll";

describe("chart-allergy-scroll", () => {
  it("glides the card to the top of the scroll pane on expand", () => {
    const el = document.createElement("div");
    el.scrollIntoView = vi.fn();
    scrollAllergyCardHeaderIntoView(el);
    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
  });

  it("re-anchors the closing card as a fold-locked settle (no aggressive re-glide)", () => {
    // With no scroll-pane ancestor the close settle is a no-op — it never fires the
    // native block:start jump the old capture-section scroll did.
    const el = document.createElement("div");
    el.scrollIntoView = vi.fn();
    expect(() => reAnchorAllergyCardOnClose(el)).not.toThrow();
    expect(el.scrollIntoView).not.toHaveBeenCalled();
    expect(() => reAnchorAllergyCardOnClose(null)).not.toThrow();
  });
});
