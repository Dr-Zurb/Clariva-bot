import { describe, expect, it } from "vitest";
import {
  unappliedAddLabels,
} from "@/lib/patients-v2/patient-tags";

describe("unappliedAddLabels", () => {
  it("returns labels dropped by the max-8 cap", () => {
    const full = ["1", "2", "3", "4", "5", "6", "7", "8"];
    expect(unappliedAddLabels(full, ["VIP"])).toEqual(["VIP"]);
  });

  it("ignores case-equivalent existing tags", () => {
    expect(unappliedAddLabels(["VIP"], ["vip"])).toEqual([]);
  });

  it("reports only the overflow labels", () => {
    expect(
      unappliedAddLabels(["1", "2", "3", "4", "5", "6", "7"], ["A", "B"]),
    ).toEqual(["B"]);
  });
});
