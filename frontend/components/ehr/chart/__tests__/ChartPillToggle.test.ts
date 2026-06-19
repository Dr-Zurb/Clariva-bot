import { describe, expect, it } from "vitest";
import {
  countActivePast,
  formatActivePastSummary,
  sortActiveFirst,
} from "@/components/ehr/chart/ChartPillToggle";

describe("ChartPillToggle helpers", () => {
  it("sorts active rows before past/resolved", () => {
    const sorted = sortActiveFirst([
      { id: "1", status: "resolved" as const },
      { id: "2", status: "active" as const },
      { id: "3", status: "past" as const },
    ]);
    expect(sorted.map((row) => row.id)).toEqual(["2", "1", "3"]);
  });

  it("counts active and past rows", () => {
    expect(
      countActivePast([
        { status: "active" },
        { status: "active" },
        { status: "past" },
        { status: "resolved" },
      ]),
    ).toEqual({ active: 2, past: 2 });
  });

  it("formats active/past summary", () => {
    expect(formatActivePastSummary(2, 1, "active", "past", "None")).toBe("2 active · 1 past");
    expect(formatActivePastSummary(0, 0, "active", "past", "None")).toBe("None");
  });
});
