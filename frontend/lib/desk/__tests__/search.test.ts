import { describe, expect, it } from "vitest";
import {
  deskFormNameOverridesSearch,
  deskSearchKind,
  deskSearchQuery,
  isSearchableDeskQuery,
} from "@/lib/desk/search";

describe("deskSearchQuery", () => {
  it("normalizes a complete mobile to last 10 digits", () => {
    expect(deskSearchQuery("+91 98148-61579")).toBe("9814861579");
    expect(isSearchableDeskQuery("+91 98148 61579")).toBe(true);
    expect(deskSearchKind("+91 98148 61579")).toBe("phone");
  });

  it("normalizes an MRN to P-digits", () => {
    expect(deskSearchQuery("p-00001")).toBe("P-00001");
    expect(deskSearchQuery("P00012")).toBe("P-00012");
    expect(isSearchableDeskQuery("P-00001")).toBe(true);
    expect(deskSearchKind("P-00001")).toBe("mrn");
  });

  it("accepts a name of three or more characters", () => {
    expect(deskSearchQuery("Ria")).toBe("Ria");
    expect(deskSearchQuery("  Ria Sharma  ")).toBe("Ria Sharma");
    expect(isSearchableDeskQuery("Ria")).toBe(true);
    expect(deskSearchKind("Ria Sharma")).toBe("name");
  });

  it("rejects a name shorter than three characters", () => {
    expect(deskSearchQuery("Ri")).toBe("");
    expect(isSearchableDeskQuery("Ri")).toBe(false);
    expect(deskSearchKind("Ri")).toBe(null);
  });

  it("strips punctuation from a partial mobile", () => {
    expect(deskSearchQuery("98148 615")).toBe("98148615");
  });

  it("rejects empty, one-character, or incomplete MRN input", () => {
    expect(isSearchableDeskQuery("R")).toBe(false);
    expect(isSearchableDeskQuery("   ")).toBe(false);
    expect(isSearchableDeskQuery("P-12")).toBe(false);
    expect(deskSearchQuery("P-12")).toBe("");
  });
});

describe("deskFormNameOverridesSearch", () => {
  it("is true when the form name is a different searchable name", () => {
    expect(deskFormNameOverridesSearch("joban", "jasbir")).toBe(true);
    expect(deskFormNameOverridesSearch("Jasbir", "jasbir")).toBe(false);
    expect(deskFormNameOverridesSearch("jo", "jasbir")).toBe(false);
    expect(deskFormNameOverridesSearch("joban", "9814861579")).toBe(false);
  });
});
