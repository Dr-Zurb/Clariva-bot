import { describe, expect, it } from "vitest";
import {
  composeRouteWithSite,
  extractRouteSite,
  formatMedicineSigLine,
  resolveRouteSiteInput,
  routeCodeSupportsSite,
} from "@/lib/medicineCodes";

describe("route site helpers", () => {
  it("supports site on IM / SC / topical / IV / nasal only", () => {
    expect(routeCodeSupportsSite("IM")).toBe(true);
    expect(routeCodeSupportsSite("SC")).toBe(true);
    expect(routeCodeSupportsSite("topical")).toBe(true);
    expect(routeCodeSupportsSite("IV")).toBe(true);
    expect(routeCodeSupportsSite("nasal")).toBe(true);
    expect(routeCodeSupportsSite("oral")).toBe(false);
    expect(routeCodeSupportsSite("sublingual")).toBe(false);
    expect(routeCodeSupportsSite(null)).toBe(false);
  });

  it("composes and extracts site from legacy route text", () => {
    expect(composeRouteWithSite("IM", null)).toBe("IM");
    expect(composeRouteWithSite("IM", "Deltoid")).toBe("IM · Deltoid");
    expect(extractRouteSite("IM", "IM · Deltoid")).toBe("Deltoid");
    expect(extractRouteSite("IM", "IM")).toBeNull();
    expect(extractRouteSite("oral", "Oral · Face")).toBeNull();
  });

  it("resolves catalog site labels and keeps free text", () => {
    expect(resolveRouteSiteInput("IM", "deltoid")).toBe("Deltoid");
    expect(resolveRouteSiteInput("SC", "upper arm")).toBe("Upper arm");
    expect(resolveRouteSiteInput("IM", "left flank")).toBe("left flank");
  });

  it("includes site-encoded route on the sig line", () => {
    const sig = formatMedicineSigLine({
      doseQty: 1,
      doseUnit: "tab",
      frequencyCode: "OD",
      route: "IM · Deltoid",
    });
    expect(sig).toContain("IM · Deltoid");
  });
});
