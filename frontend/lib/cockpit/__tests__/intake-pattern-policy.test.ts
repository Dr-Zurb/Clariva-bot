import { describe, expect, it } from "vitest";
import { resolveIntakePatternPolicy } from "@/lib/cockpit/intake-pattern-policy";

describe("resolveIntakePatternPolicy", () => {
  const line =
    "amlodipine 5 years was taken regularly but missed occasionally";

  it("regular dominates when taken regularly but missed occasionally", () => {
    expect(resolveIntakePatternPolicy(line, "irregular")).toBe("regular");
    expect(resolveIntakePatternPolicy(line, "regular")).toBe("regular");
  });

  it("keeps hard irregular when no regular phrasing", () => {
    expect(resolveIntakePatternPolicy("metformin taken irregularly", "irregular")).toBe(
      "irregular",
    );
    expect(resolveIntakePatternPolicy("aspirin off and on", null)).toBe("irregular");
  });

  it("respects not regularly", () => {
    expect(resolveIntakePatternPolicy("amlodipine not regularly", "regular")).toBe("irregular");
  });

  it("never overrides prn", () => {
    expect(resolveIntakePatternPolicy("paracetamol sos", "prn")).toBe("prn");
  });

  it("does not treat regular insulin as adherence regular", () => {
    expect(resolveIntakePatternPolicy("regular insulin 10 unit bd", null)).toBeNull();
  });
});
