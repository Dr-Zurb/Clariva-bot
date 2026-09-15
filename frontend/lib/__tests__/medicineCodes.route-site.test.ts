import { describe, expect, it } from "vitest";
import {
  composeRouteWithSite,
  extractRouteSite,
  formatMedicineSigLine,
  resolveRouteSiteInput,
  routeCodeSupportsSite,
  toRxFrequencyCode,
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

  it("appends a 1-0-1 schedule after the frequency code", () => {
    expect(
      formatMedicineSigLine({
        doseQty: 1,
        doseUnit: "tab",
        frequencyCode: "BID",
        doseSchedule: "1-0-1",
      })
    ).toBe("1 tab · BID · 1-0-1");
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

describe("toRxFrequencyCode", () => {
  it("keeps Rx codes and maps labels / interval codes", () => {
    expect(toRxFrequencyCode("OD")).toBe("OD");
    expect(toRxFrequencyCode("Once daily")).toBe("OD");
    expect(toRxFrequencyCode("At bedtime")).toBe("QHS");
    expect(toRxFrequencyCode("Q6H")).toBe("CUSTOM");
    expect(toRxFrequencyCode(null)).toBeNull();
  });
});
