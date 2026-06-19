import { describe, expect, it, vi } from "vitest";
import {
  scrollAllergyCaptureIntoView,
  scrollAllergyCardHeaderIntoView,
} from "@/lib/chart/chart-allergy-scroll";

describe("chart-allergy-scroll", () => {
  it("scrolls the header element into view", () => {
    const el = document.createElement("div");
    el.scrollIntoView = vi.fn();
    scrollAllergyCardHeaderIntoView(el);
    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "auto" });
  });

  it("scrolls the capture section when present", () => {
    const section = document.createElement("div");
    section.id = "allergies-capture";
    section.scrollIntoView = vi.fn();
    document.body.appendChild(section);

    scrollAllergyCaptureIntoView({
      sectionId: "allergies-capture",
      captureInputId: "input-fallback",
    });

    expect(section.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
    section.remove();
  });
});
