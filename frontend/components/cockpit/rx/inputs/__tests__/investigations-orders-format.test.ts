import { describe, expect, it } from "vitest";
import {
  parseInvestigationsOrders,
  serializeInvestigationsOrders,
} from "@/components/cockpit/rx/inputs/investigations-orders-format";

describe("investigations-orders-format", () => {
  it("parses semicolon- and comma-separated values", () => {
    expect(parseInvestigationsOrders("ECG; Trop-I")).toEqual(["ECG", "Trop-I"]);
    expect(parseInvestigationsOrders("CBC, LFT")).toEqual(["CBC", "LFT"]);
  });

  it("serializes chips with semicolons", () => {
    expect(serializeInvestigationsOrders(["ECG", "Trop-I"])).toBe("ECG; Trop-I");
  });
});
