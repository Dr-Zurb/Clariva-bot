import { describe, expect, it } from "vitest";

import {
  segmentVisitText,
  VISIT_SEGMENT_CUES,
  type VisitSlice,
} from "@/lib/cockpit/visit-segmenter";

function kinds(slices: VisitSlice[]): string[] {
  return slices.map((slice) => slice.kind);
}

describe("segmentVisitText (rfed-01 / vnb-02)", () => {
  it("empty and whitespace yield no slices", () => {
    expect(segmentVisitText("")).toEqual([]);
    expect(segmentVisitText("   \n\t")).toEqual([]);
  });

  it("no cues → a single leftover with the original text", () => {
    const raw = "fever 3 days start azithro later if needed";
    expect(segmentVisitText(raw)).toEqual([
      { kind: "leftover", text: raw, cue: null },
    ]);
  });

  it("complaint-only keeps one complaint slice", () => {
    expect(segmentVisitText("C/O fever for 3 days")).toEqual([
      { kind: "complaint", text: "fever for 3 days", cue: "c/o" },
    ]);
  });

  it("medicine-only keeps one medicine slice", () => {
    expect(segmentVisitText("Plan: azithromycin 500 od x 3 days")).toEqual([
      {
        kind: "medicine",
        text: "azithromycin 500 od x 3 days",
        cue: "plan",
      },
    ]);
  });

  it("exam-only is routed prose, not leftover or ignored", () => {
    const slices = segmentVisitText("Exam: chest clear, no wheeze");
    expect(slices).toEqual([
      {
        kind: "prose",
        text: "chest clear, no wheeze",
        cue: "exam",
        proseTarget: "exam",
      },
    ]);
    expect(kinds(slices)).not.toContain("leftover");
    expect(kinds(slices)).not.toContain("ignored");
  });

  it("impression-only is a diagnosis slice", () => {
    expect(segmentVisitText("Impression: viral URTI")).toEqual([
      { kind: "diagnosis", text: "viral URTI", cue: "impression" },
    ]);
  });

  it("vital-only labels a vital slice without validating the value", () => {
    expect(segmentVisitText("spo2 985")).toEqual([
      { kind: "vital", text: "985", cue: "spo2" },
    ]);
    expect(segmentVisitText("bp 120/80")).toEqual([
      { kind: "vital", text: "120/80", cue: "bp" },
    ]);
  });

  it("order / send-for / test are investigation slices", () => {
    expect(segmentVisitText("Order: CBC and platelet count")).toEqual([
      { kind: "investigation", text: "CBC and platelet count", cue: "order" },
    ]);
    expect(segmentVisitText("send for LFT")).toEqual([
      { kind: "investigation", text: "LFT", cue: "send for" },
    ]);
    expect(segmentVisitText("test: chest x-ray")).toEqual([
      { kind: "investigation", text: "chest x-ray", cue: "test" },
    ]);
  });

  it("advice is routed prose", () => {
    expect(segmentVisitText("Advice: rest and fluids")).toEqual([
      {
        kind: "prose",
        text: "rest and fluids",
        cue: "advice",
        proseTarget: "advice",
      },
    ]);
  });

  it("allergy / follow-up / referral cues route to prose(note)", () => {
    expect(segmentVisitText("Allergies: none known")).toEqual([
      {
        kind: "prose",
        text: "none known",
        cue: "allergies",
        proseTarget: "note",
      },
    ]);
    expect(segmentVisitText("Follow up: 5 days")).toEqual([
      {
        kind: "prose",
        text: "5 days",
        cue: "follow up",
        proseTarget: "note",
      },
    ]);
  });

  it("mixed paragraph labels every Phase-1 kind in document order", () => {
    const slices = segmentVisitText(
      "Complaint: fever for 3 days. Exam: chest clear. Impression: viral. Plan: azithromycin 500 od."
    );
    expect(slices).toEqual([
      { kind: "complaint", text: "fever for 3 days.", cue: "complaint" },
      {
        kind: "prose",
        text: "chest clear.",
        cue: "exam",
        proseTarget: "exam",
      },
      { kind: "diagnosis", text: "viral.", cue: "impression" },
      { kind: "medicine", text: "azithromycin 500 od.", cue: "plan" },
    ]);
  });

  it("whole-visit paragraph hits all six Phase-1 kinds", () => {
    const slices = segmentVisitText(
      "Complaint: fever 3 days. spo2 98. Impression: viral fever. Order: CBC. Plan: azithro 500. Advice: rest."
    );
    expect(kinds(slices)).toEqual([
      "complaint",
      "vital",
      "diagnosis",
      "investigation",
      "medicine",
      "prose",
    ]);
    expect(slices[1]).toMatchObject({ kind: "vital", cue: "spo2", text: "98." });
    expect(slices[5]).toMatchObject({
      kind: "prose",
      cue: "advice",
      proseTarget: "advice",
    });
  });

  it("start-on and review are medicine cues", () => {
    expect(segmentVisitText("start on azithromycin 500")).toEqual([
      { kind: "medicine", text: "azithromycin 500", cue: "start on" },
    ]);
    expect(segmentVisitText("Review: 5 days")).toEqual([
      { kind: "medicine", text: "5 days", cue: "review" },
    ]);
  });

  it("uncued prefix is leftover; following cues stay labelled", () => {
    expect(
      segmentVisitText("looks unwell. Plan: tab azithromycin 500")
    ).toEqual([
      { kind: "leftover", text: "looks unwell.", cue: null },
      { kind: "medicine", text: "azithromycin 500", cue: "tab" },
    ]);
  });

  it("longest cue wins at the same start (chief complaint vs complaint)", () => {
    expect(segmentVisitText("Chief complaint: cough 2 days")).toEqual([
      { kind: "complaint", text: "cough 2 days", cue: "chief complaint" },
    ]);
  });

  it("longest cue wins at the same start (on examination vs exam)", () => {
    expect(segmentVisitText("On examination: chest clear")).toEqual([
      {
        kind: "prose",
        text: "chest clear",
        cue: "on examination",
        proseTarget: "exam",
      },
    ]);
  });

  it("word-boundary: latest does not match the test cue", () => {
    expect(segmentVisitText("latest fever since yesterday")).toEqual([
      {
        kind: "leftover",
        text: "latest fever since yesterday",
        cue: null,
      },
    ]);
  });

  it("exports one cue table (no second list)", () => {
    const phrases = VISIT_SEGMENT_CUES.map((cue) => cue.phrase);
    expect(new Set(phrases).size).toBe(phrases.length);
    expect(phrases).toEqual(
      expect.arrayContaining([
        "complaint",
        "exam",
        "impression",
        "plan",
        "review",
        "start on",
        "medicine",
        "spo2",
        "order",
        "advice",
      ])
    );
    expect(VISIT_SEGMENT_CUES.some((cue) => cue.kind === "vital")).toBe(true);
    expect(VISIT_SEGMENT_CUES.some((cue) => cue.kind === "diagnosis")).toBe(
      true
    );
    expect(
      VISIT_SEGMENT_CUES.some((cue) => cue.kind === "investigation")
    ).toBe(true);
    expect(
      VISIT_SEGMENT_CUES.some(
        (cue) => cue.kind === "prose" && cue.proseTarget === "exam"
      )
    ).toBe(true);
  });
});
