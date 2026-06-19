import { describe, expect, it } from "vitest";
import {
  complaintNamesEquivalent,
  complaintPhraseTokenKey,
} from "@/lib/cockpit/complaint-search-normalize";

describe("complaint-search-normalize", () => {
  it("builds order-independent token keys", () => {
    expect(complaintPhraseTokenKey("pain in shoulder")).toBe(
      complaintPhraseTokenKey("shoulder pain"),
    );
  });

  it("treats reordered phrasing as equivalent", () => {
    expect(complaintNamesEquivalent("pain in shoulder", "Shoulder pain")).toBe(true);
    expect(complaintNamesEquivalent("pain in chest", "Chest pain")).toBe(true);
  });

  it("does not equate different body sites", () => {
    expect(complaintNamesEquivalent("pain in shoulder", "Back pain")).toBe(false);
  });

  it("still matches exact strings case-insensitively", () => {
    expect(complaintNamesEquivalent("Headache", "headache")).toBe(true);
  });
});
