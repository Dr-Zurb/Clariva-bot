import { describe, expect, it } from "vitest";
import {
  conditionTimingFromRecord,
  formatConditionAgoSummary,
} from "@/components/ehr/chart/ConditionTimingField";

describe("ConditionTimingField helpers", () => {
  it("maps record fields to relative timing value", () => {
    expect(
      conditionTimingFromRecord({
        diagnosed_ago_value: 5,
        diagnosed_ago_unit: "years",
      }),
    ).toEqual({ agoValue: 5, agoUnit: "years" });

    expect(conditionTimingFromRecord({})).toEqual({
      agoValue: null,
      agoUnit: "years",
    });
  });

  it("formats ago summary for display", () => {
    expect(formatConditionAgoSummary(5, "years")).toBe("~5 yr");
    expect(formatConditionAgoSummary(3, "months")).toBe("~3 mo");
    expect(formatConditionAgoSummary(null, "years")).toBeNull();
  });
});
