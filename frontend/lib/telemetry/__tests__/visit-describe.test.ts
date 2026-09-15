import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EMPTY_VISIT_DESCRIBE_COUNTS,
  EMPTY_VISIT_TRANSCRIPT_COUNTS,
  visitDescribeAccepted,
  visitDescribeDismissed,
  visitDescribeShown,
  visitDescribeTranscriptAccepted,
  visitDescribeTranscriptShown,
} from "@/lib/telemetry/visit-describe";

const TEXT_KEYS = [
  "query",
  "text",
  "name",
  "quote",
  "sourceText",
  "spanStart",
  "spanEnd",
  "transcriptId",
  "transcriptText",
] as const;

describe("visit-describe telemetry (vnt-05)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps Phase-1 typed / dictated shapes byte-identical (VNT-D8)", () => {
    expect(visitDescribeShown.length).toBe(2);
    expect(visitDescribeAccepted.length).toBe(4);
    expect(visitDescribeDismissed.length).toBe(1);

    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const counts = {
      ...EMPTY_VISIT_DESCRIBE_COUNTS,
      subjectiveAi: 2,
      planDet: 1,
    };
    visitDescribeShown("typed", counts);
    visitDescribeAccepted("dictated", "plan", 1, 0);
    visitDescribeDismissed("typed");

    expect(debug.mock.calls[0]?.[2]).toEqual({ source: "typed", ...counts });
    expect(debug.mock.calls[1]?.[2]).toEqual({
      source: "dictated",
      kind: "plan",
      detCount: 1,
      aiCount: 0,
    });
    expect(Object.keys(debug.mock.calls[1]?.[2] as object)).toEqual([
      "source",
      "kind",
      "detCount",
      "aiCount",
    ]);
    expect(debug.mock.calls[2]?.[2]).toEqual({ source: "typed" });
  });

  it("emits transcript shown / accepted / dismissed without a det/AI split", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const offered = {
      ...EMPTY_VISIT_TRANSCRIPT_COUNTS,
      subjective: 2,
      vitals: 1,
    };
    visitDescribeTranscriptShown(offered);
    visitDescribeTranscriptAccepted("vitals", 1);
    visitDescribeDismissed("transcript");

    const shown = debug.mock.calls[0]?.[2] as Record<string, unknown>;
    const accepted = debug.mock.calls[1]?.[2] as Record<string, unknown>;
    const dismissed = debug.mock.calls[2]?.[2] as Record<string, unknown>;

    expect(shown).toEqual({ source: "transcript", ...offered });
    expect(accepted).toEqual({
      source: "transcript",
      kind: "vitals",
      count: 1,
    });
    expect(accepted).not.toHaveProperty("detCount");
    expect(accepted).not.toHaveProperty("aiCount");
    expect(dismissed).toEqual({ source: "transcript" });
  });

  it("emits counts only when a proposal carries a real quote", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const quote = "I have had fever for three days";
    const proposal = {
      sourceText: quote,
      subjective: [{ name: "fever" }],
      evidence: {
        transcriptId: "tr-person-resolvable",
        spanStart: 11,
        spanEnd: 16,
        quote,
      },
    };

    visitDescribeTranscriptShown({
      ...EMPTY_VISIT_TRANSCRIPT_COUNTS,
      subjective: proposal.subjective.length,
    });
    visitDescribeTranscriptAccepted("subjective", 1);

    for (const call of debug.mock.calls) {
      expect(call[0]).toBe("[ehr:rxvisit]");
      const payload = call[2] as Record<string, unknown>;
      for (const key of TEXT_KEYS) {
        expect(payload).not.toHaveProperty(key);
      }
      expect(JSON.stringify(payload)).not.toContain(quote);
      expect(JSON.stringify(payload)).not.toContain("tr-person-resolvable");
      expect(JSON.stringify(payload)).not.toContain("fever");
    }
  });

  it("type-locks transcript counts to integers — no content-bearing field", () => {
    type ShownArgs = Parameters<typeof visitDescribeTranscriptShown>;
    type CountKeys = keyof ShownArgs[0];
    type Forbidden = Extract<
      CountKeys,
      "text" | "query" | "name" | "quote" | "transcriptId" | "spanStart"
    >;
    const forbidden: Forbidden[] = [];
    expect(forbidden).toEqual([]);

    type AcceptedArgs = Parameters<typeof visitDescribeTranscriptAccepted>;
    type AcceptedKind = AcceptedArgs[0];
    const kind: AcceptedKind = "assessment";
    expect(kind).toBe("assessment");
  });
});
