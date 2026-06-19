import { describe, it, expect } from "vitest";
import { shouldRequestAiMedParse } from "@/lib/cockpit/should-request-ai-med-parse";
import { lineHasSigDetails, parseMedicineLine } from "@/lib/cockpit/medicine-line-parse";

/** Run the real deterministic parser so the gate is exercised end-to-end. */
function gate(text: string): boolean {
  const parsed = lineHasSigDetails(text) ? parseMedicineLine(text) : null;
  return shouldRequestAiMedParse(text, parsed);
}

describe("shouldRequestAiMedParse", () => {
  it("does not fire on empty text", () => {
    expect(gate("")).toBe(false);
    expect(gate("   ")).toBe(false);
  });

  it("does not fire on a clean single-drug line the parser handles", () => {
    expect(gate("amlodipine 5 mg od")).toBe(false);
    expect(gate("metformin 500 mg bd")).toBe(false);
  });

  it("does not fire on a bare drug name (autocomplete path)", () => {
    expect(gate("amlodipine")).toBe(false);
  });

  it("fires on non-Latin (vernacular) script", () => {
    expect(gate("शुगर की गोली रोज़ सुबह")).toBe(true);
  });

  it("fires on a multi-drug line joined by 'and'", () => {
    expect(gate("metformin 500 bd and amlodipine 5 od")).toBe(true);
  });

  it("fires on a multi-drug line joined by '&' or '+'", () => {
    expect(gate("paracetamol 500 + cetirizine 10")).toBe(true);
  });

  it("fires on a long line the parser barely structured", () => {
    expect(gate("some herbal mix she takes from the local shop sometimes")).toBe(true);
  });

  it("does not fire on a single combo strength with a slash", () => {
    expect(gate("amlodipine 5/80 mg od")).toBe(false);
  });

  // ── Structural complexity (language-agnostic) ──────────────────────────────

  it("fires on romanized vernacular with no recognised sig (inflated name)", () => {
    // "telmisartan daily kha raha hai" — no token recognised, so the whole
    // phrase becomes a 5-word "name" → structurally complex → AI.
    expect(gate("telmisartan daily kha raha hai")).toBe(true);
  });

  it("fires on a vernacular name even when a stray number is recognised", () => {
    // "BP ki dawai 1 od" — "1 od" recognised, but the 3-word name is loose.
    expect(gate("BP ki dawai 1 od")).toBe(true);
  });

  it("fires on a short vernacular phrase the parser cannot structure", () => {
    expect(gate("sugar ki goli roz")).toBe(true);
  });

  it("fires when the clean line carries unclassified free-text residue", () => {
    expect(gate("amlodipine 5 mg od avoid grapefruit")).toBe(true);
    expect(gate("amlodipine 5 mg od subah le raha hai")).toBe(true);
  });

  it("does not fire on a clean brand + salt name (two words)", () => {
    expect(gate("telma h 40 od")).toBe(false);
  });

  it("does not fire on a bare two-word brand name (autocomplete path)", () => {
    expect(gate("human mixtard")).toBe(false);
  });

  it("does not fire on clean lines with form prefix or schedule", () => {
    expect(gate("tab dolo 650 1-0-1")).toBe(false);
    expect(gate("syp dextromethorphan 2 spoon bd")).toBe(false);
    expect(gate("pan 40 od before food")).toBe(false);
  });
});
