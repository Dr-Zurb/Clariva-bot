import { describe, expect, it } from "vitest";
import { ARRIVAL_LINES, arrivalLine } from "./arrival-line";

describe("arrivalLine", () => {
  it("returns one sentence for video, voice, and in clinic", () => {
    expect(arrivalLine("video")).toBe(ARRIVAL_LINES.video);
    expect(arrivalLine("voice")).toBe(ARRIVAL_LINES.voice);
    expect(arrivalLine("in_clinic")).toBe(ARRIVAL_LINES.in_clinic);
  });

  it("returns nothing for text, null, and an unknown type", () => {
    expect(arrivalLine("text")).toBeNull();
    expect(arrivalLine(null)).toBeNull();
    expect(arrivalLine("telehealth")).toBeNull();
  });
});
