import { describe, expect, it } from "vitest";
import { migrateClubbingAttributes } from "@/lib/cockpit/clubbing-grade";

describe("clubbing-grade", () => {
  it("migrates legacy Grade N labels to G1–G4", () => {
    expect(migrateClubbingAttributes({ grade: "Grade 2" })).toEqual({ grade: "G2" });
    expect(migrateClubbingAttributes({ grade: "Present", distribution: "Fingers" })).toEqual({
      grade: "Present",
      distribution: "Fingers",
    });
  });
});
