import { describe, expect, it } from "vitest";
import {
  letterheadHeading,
  letterheadImageFitClass,
  LETTERHEAD_PT_TO_PREVIEW_PX,
  letterheadTypePx,
  letterheadTypeScreenPx,
  logoSizePx,
  parseLetterheadImageFit,
  parseLetterheadTextSize,
} from "@/lib/letterhead-heading";

describe("letterheadHeading", () => {
  it("uses practice name so Classic is not two doctor names", () => {
    expect(letterheadHeading("Dr. Zurb", "Dr Abhishek Sahil")).toBe(
      "Dr Abhishek Sahil",
    );
  });

  it("falls back to the doctor name when practice name is empty", () => {
    expect(letterheadHeading("Dr. Test", "  ")).toBe("Dr. Test");
  });

  it("maps logo size tokens to pixels", () => {
    expect(logoSizePx("small")).toBe(40);
    expect(logoSizePx("medium")).toBe(56);
    expect(logoSizePx("large")).toBe(80);
  });

  it("maps photo-fit tokens to object-fit classes", () => {
    expect(letterheadImageFitClass("fit")).toBe("object-contain");
    expect(letterheadImageFitClass("fill")).toBe("object-cover");
    expect(letterheadImageFitClass("stretch")).toBe("object-fill");
    expect(letterheadImageFitClass(undefined)).toBe("object-cover");
    expect(parseLetterheadImageFit("stretch", "fill")).toBe("stretch");
    expect(parseLetterheadImageFit("nope", "fill")).toBe("fill");
  });

  it("maps text-size tokens to print and screen type", () => {
    expect(parseLetterheadTextSize("large")).toBe("large");
    expect(parseLetterheadTextSize("nope")).toBe("medium");
    expect(letterheadTypePx("headerTitle", "small")).toBe(
      12 * LETTERHEAD_PT_TO_PREVIEW_PX,
    );
    expect(letterheadTypePx("headerTitle", "medium")).toBe(
      14 * LETTERHEAD_PT_TO_PREVIEW_PX,
    );
    expect(letterheadTypePx("headerTitle", "large")).toBe(
      17 * LETTERHEAD_PT_TO_PREVIEW_PX,
    );
    expect(letterheadTypePx("bodyLabel", "large")).toBeGreaterThan(
      letterheadTypePx("bodyLabel", "medium"),
    );
    expect(letterheadTypeScreenPx("headerTitle", "medium")).toBe(18);
    expect(letterheadTypeScreenPx("bodyText", "large")).toBeGreaterThan(
      letterheadTypeScreenPx("bodyText", "medium"),
    );
  });
});
