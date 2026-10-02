import { describe, expect, it } from "vitest";
import {
  bookingPagePurpose,
  bookingPageTitle,
  newVisitPath,
} from "../booking-page-purpose";

describe("booking page purpose", () => {
  it("reads the chat flag and titles the first screen", () => {
    expect(bookingPagePurpose(null)).toBe("visit");
    expect(bookingPagePurpose("times")).toBe("times");
    expect(bookingPagePurpose("change")).toBe("change");
    expect(bookingPagePurpose("other")).toBe("visit");
    expect(bookingPageTitle("visit", false)).toBe("New visit");
    expect(bookingPageTitle("times", false)).toBe("Availability");
    expect(bookingPageTitle("change", false)).toBe("Change or cancel a visit");
    expect(bookingPageTitle("visit", true)).toBe("Reschedule Appointment");
  });

  it("drops for= and keeps the chat token", () => {
    expect(newVisitPath("/d/city-clinic", "c=abc&for=change")).toBe("/d/city-clinic?c=abc");
    expect(newVisitPath("/d/city-clinic", "for=times")).toBe("/d/city-clinic");
  });
});
