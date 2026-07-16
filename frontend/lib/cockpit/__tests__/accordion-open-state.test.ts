import { describe, expect, it } from "vitest";
import { pickAccordionOpenId } from "@/lib/cockpit/accordion-open-state";

describe("pickAccordionOpenId", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("returns empty when no candidates", () => {
    expect(pickAccordionOpenId(items, new Set())).toEqual(new Set());
  });

  it("keeps the first registry match when multiple candidates", () => {
    expect(pickAccordionOpenId(items, new Set(["c", "a", "b"]))).toEqual(new Set(["a"]));
  });

  it("returns the sole candidate", () => {
    expect(pickAccordionOpenId(items, new Set(["b"]))).toEqual(new Set(["b"]));
  });
});
