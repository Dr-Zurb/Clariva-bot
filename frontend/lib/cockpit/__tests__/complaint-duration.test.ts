import { describe, expect, it } from "vitest";
import {
  buildInlineDurationOptions,
  formatDurationOptionLabel,
  parseDuration,
  serializeDuration,
} from "@/lib/cockpit/complaint-duration";

describe("serializeDuration", () => {
  it("pluralises correctly", () => {
    expect(serializeDuration(1, "day")).toBe("1 day");
    expect(serializeDuration(3, "day")).toBe("3 days");
    expect(serializeDuration(2, "week")).toBe("2 weeks");
    expect(serializeDuration(1, "month")).toBe("1 month");
  });

  it("returns empty for non-positive values", () => {
    expect(serializeDuration(0, "day")).toBe("");
    expect(serializeDuration(-2, "day")).toBe("");
  });
});

describe("parseDuration", () => {
  it("parses canonical strings", () => {
    expect(parseDuration("3 days")).toEqual({ value: 3, unit: "day" });
    expect(parseDuration("1 week")).toEqual({ value: 1, unit: "week" });
  });

  it("parses common abbreviations", () => {
    expect(parseDuration("2d")).toEqual({ value: 2, unit: "day" });
    expect(parseDuration("6 hrs")).toEqual({ value: 6, unit: "hour" });
    expect(parseDuration("2wk")).toEqual({ value: 2, unit: "week" });
  });

  it("returns null for unparseable strings", () => {
    expect(parseDuration("Today")).toBeNull();
    expect(parseDuration(">1mo")).toBeNull();
    expect(parseDuration("since childhood")).toBeNull();
    expect(parseDuration("")).toBeNull();
    expect(parseDuration(null)).toBeNull();
  });
});

describe("inline duration combobox helpers", () => {
  it("builds unit options with hours last", () => {
    const options = buildInlineDurationOptions(4);
    expect(options.map((o) => o.label)).toEqual([
      "4 Days",
      "4 Weeks",
      "4 Months",
      "4 Years",
      "4 Hours",
    ]);
  });

  it("capitalises option labels", () => {
    expect(formatDurationOptionLabel(10, "week")).toBe("10 Weeks");
  });
});
