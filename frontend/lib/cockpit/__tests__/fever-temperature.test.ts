import { describe, expect, it } from "vitest";
import {
  convertTemperatureUnit,
  feverGradeToTemperature,
  formatFeverDisplaySummary,
  formatFeverTemperatureSummary,
  isTemperatureInFeverGrade,
  temperatureToFeverGrade,
} from "@/lib/cockpit/fever-temperature";

describe("fever-temperature", () => {
  it("maps readings to fever grades (°F)", () => {
    expect(temperatureToFeverGrade(98.6, "F")).toBeNull();
    expect(temperatureToFeverGrade(100, "F")).toBe("mild");
    expect(temperatureToFeverGrade(101, "F")).toBe("moderate");
    expect(temperatureToFeverGrade(103, "F")).toBe("high");
    expect(temperatureToFeverGrade(105, "F")).toBe("very_high");
  });

  it("maps readings to fever grades (°C)", () => {
    expect(temperatureToFeverGrade(38.5, "C")).toBe("moderate");
    expect(temperatureToFeverGrade(39.5, "C")).toBe("high");
  });

  it("returns representative temps per grade", () => {
    expect(feverGradeToTemperature("moderate", "F")).toBe(101);
    expect(feverGradeToTemperature("moderate", "C")).toBe(38.5);
  });

  it("detects in-band readings", () => {
    expect(isTemperatureInFeverGrade(101.2, "F", "moderate")).toBe(true);
    expect(isTemperatureInFeverGrade(103, "F", "moderate")).toBe(false);
  });

  it("converts between units", () => {
    expect(convertTemperatureUnit(100, "F", "C")).toBe(37.8);
    expect(convertTemperatureUnit(38.5, "C", "F")).toBe(101.3);
  });

  it("formats summary for collapsed card", () => {
    expect(formatFeverTemperatureSummary(101, "F", "moderate")).toBe("101°F (Moderate)");
    expect(formatFeverTemperatureSummary(null, "F", "high")).toBe("High");
  });

  it("shows grade-only summary when measured as felt only", () => {
    expect(formatFeverDisplaySummary(105, "F", "very_high", "Felt only")).toBe("Very high");
    expect(formatFeverDisplaySummary(105, "F", "very_high", "Felt only", "Attendant")).toBe(
      "Very high · Attendant",
    );
    expect(formatFeverDisplaySummary(101, "F", "moderate", "Home")).toBe("101°F (Moderate)");
  });
});
