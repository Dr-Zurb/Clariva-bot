import { describe, it, expect, beforeEach } from "vitest";
import {
  clearConsultSteppedAway,
  isConsultSteppedAway,
  liveConsultStatusLabel,
  markConsultSteppedAway,
} from "@/lib/cockpit/consult-stepped-away";

describe("consult-stepped-away", () => {
  beforeEach(() => {
    clearConsultSteppedAway("appt-a");
  });

  it("defaults to not stepped away", () => {
    expect(isConsultSteppedAway("appt-a")).toBe(false);
    expect(liveConsultStatusLabel("appt-a")).toBe("In consult");
  });

  it("marks and clears per appointment", () => {
    markConsultSteppedAway("appt-a");
    expect(isConsultSteppedAway("appt-a")).toBe(true);
    expect(liveConsultStatusLabel("appt-a")).toBe("Incomplete");
    expect(isConsultSteppedAway("appt-b")).toBe(false);

    clearConsultSteppedAway("appt-a");
    expect(isConsultSteppedAway("appt-a")).toBe(false);
    expect(liveConsultStatusLabel("appt-a")).toBe("In consult");
  });
});
