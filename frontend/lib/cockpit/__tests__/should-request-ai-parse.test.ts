import { describe, it, expect } from "vitest";
import {
  complaintParseWarning,
  shouldRequestAiParse,
} from "@/lib/cockpit/should-request-ai-parse";
import { parseComplaintText } from "@/lib/cockpit/parse-complaint-text";

/** Run the real deterministic parser so the gate is exercised end-to-end. */
function gate(text: string): boolean {
  return shouldRequestAiParse(text, parseComplaintText(text));
}

function warning(text: string) {
  return complaintParseWarning(text, parseComplaintText(text));
}

describe("shouldRequestAiParse", () => {
  it("does not fire on empty text", () => {
    expect(gate("")).toBe(false);
    expect(gate("   ")).toBe(false);
  });

  it("does not fire on a short custom complaint", () => {
    expect(gate("tingling in toes")).toBe(false);
  });

  it("does not fire when the deterministic parser already extracted detail", () => {
    // severity + duration + timing all parsed → rules did their job.
    expect(gate("severe headache for 3 days at night")).toBe(false);
  });

  it("does not fire on the aggravating/relieving regression phrase", () => {
    expect(gate("chest pain worse on exertion relieved by rest")).toBe(false);
  });

  it("fires on non-Latin (vernacular) script", () => {
    expect(gate("पेट में जलन ३ दिन से")).toBe(true);
  });

  it("fires on explicit negation", () => {
    expect(gate("no fever but cough")).toBe(true);
  });

  it("fires on a long line the rules barely touched (multi-complaint)", () => {
    expect(gate("fever cough loose motions body ache weakness")).toBe(true);
  });

  it("fires on romanised vernacular the rules cannot parse", () => {
    // ASCII but rules extract ~nothing from 6+ words.
    expect(gate("pet me jalan aur ulti ho rahi hai")).toBe(true);
  });
});

describe("complaintParseWarning", () => {
  it("is null on a clean extracted line", () => {
    expect(warning("severe headache for 3 days at night")).toBeNull();
    expect(warning("tingling in toes")).toBeNull();
  });

  it("returns vernacular for non-Latin script", () => {
    expect(warning("पेट में जलन ३ दिन से")).toBe("vernacular");
  });

  it("returns negation when a deny-word is present", () => {
    expect(warning("no fever but cough")).toBe("negation");
  });

  it("returns under_extracted for a long bare list", () => {
    expect(warning("fever cough loose motions body ache weakness")).toBe(
      "under_extracted",
    );
  });
});
