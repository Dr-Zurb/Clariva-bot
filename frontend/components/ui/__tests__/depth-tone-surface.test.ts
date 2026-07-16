import { describe, expect, it } from "vitest";
import {
  DEPTH_TONE_RAIL_BY_FAMILY,
  resolveDepthToneRail,
  resolveSoapNestedStatusDotClass,
  resolveSubjectiveSubsectionStatusDotClass,
} from "@/components/cockpit/rx/sections/section-chrome";
import {
  DEPTH_TONE_RAIL,
  DEPTH_TONE_RECESSED_SURFACE,
  DEPTH_TONE_RAISED_SURFACE,
  resolveDepthToneSurface,
  resolveStickyPinShadowClass,
} from "@/components/ui/sticky-stack";

describe("resolveDepthToneSurface", () => {
  it("returns inactive when depth is null", () => {
    expect(resolveDepthToneSurface(null)).toEqual({
      active: false,
      depth: null,
      recessed: false,
      surface: undefined,
      rail: undefined,
    });
  });

  it("alternates recessed and raised by depth", () => {
    expect(resolveDepthToneSurface(0).surface).toBe(DEPTH_TONE_RECESSED_SURFACE);
    expect(resolveDepthToneSurface(0).recessed).toBe(true);
    expect(resolveDepthToneSurface(1).surface).toBe(DEPTH_TONE_RAISED_SURFACE);
    expect(resolveDepthToneSurface(1).recessed).toBe(false);
    expect(resolveDepthToneSurface(2).surface).toBe(DEPTH_TONE_RECESSED_SURFACE);
  });

  it("omits rail at depth 0 by default", () => {
    expect(resolveDepthToneSurface(0).rail).toBeUndefined();
    expect(resolveDepthToneSurface(1).rail).toBe(DEPTH_TONE_RAIL);
  });

  it("shows rail at depth 0 when railMinDepth is 0", () => {
    expect(resolveDepthToneSurface(0, { railMinDepth: 0 }).rail).toBe(DEPTH_TONE_RAIL);
  });

  it("uses the same primary rail for every SOAP family", () => {
    expect(resolveDepthToneRail("subjective")).toBe(DEPTH_TONE_RAIL_BY_FAMILY.objective);
    expect(resolveDepthToneRail("objective")).toBe(DEPTH_TONE_RAIL_BY_FAMILY.objective);
    expect(resolveDepthToneRail("assessment")).toBe(DEPTH_TONE_RAIL_BY_FAMILY.objective);
    expect(resolveDepthToneRail("plan")).toBe(DEPTH_TONE_RAIL_BY_FAMILY.objective);
    expect(resolveDepthToneRail(null)).toBe(DEPTH_TONE_RAIL_BY_FAMILY.objective);

    expect(resolveDepthToneSurface(1, { tabFamily: "subjective" }).rail).toBe(
      DEPTH_TONE_RAIL_BY_FAMILY.objective,
    );
    expect(resolveDepthToneSurface(1, { tabFamily: "objective" }).rail).toBe(
      DEPTH_TONE_RAIL_BY_FAMILY.objective,
    );
  });
});

describe("resolveSoapNestedStatusDotClass", () => {
  it("uses solid circles for L2 cluster cards", () => {
    expect(resolveSoapNestedStatusDotClass("subjective", false, "cluster")).toContain(
      "rounded-full",
    );
    expect(resolveSoapNestedStatusDotClass("objective", true, "cluster")).toContain("bg-primary");
    expect(resolveSubjectiveSubsectionStatusDotClass(true, "cluster")).toContain("bg-primary");
  });

  it("uses rounded squares for L3+ leaf cards", () => {
    expect(resolveSoapNestedStatusDotClass("objective", false, "leaf")).toContain("rounded-sm");
    expect(resolveSoapNestedStatusDotClass("objective", true, "leaf")).toContain("bg-primary");
    expect(resolveSubjectiveSubsectionStatusDotClass(true, "leaf")).toContain("bg-primary");
  });
});

describe("resolveStickyPinShadowClass", () => {
  it("ramps shadow with stack depth", () => {
    expect(resolveStickyPinShadowClass(1)).toBe("shadow-sm");
    expect(resolveStickyPinShadowClass(2)).toBe("shadow-md");
    expect(resolveStickyPinShadowClass(3)).toBe("shadow-lg");
  });
});
