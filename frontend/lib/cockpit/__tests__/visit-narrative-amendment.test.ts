import { describe, expect, it } from "vitest";

import { AMEND_TRANSCRIPT_PARAM } from "@/lib/cockpit/back-target";
import {
  parseAmendTranscriptSessionId,
  readAmendTranscriptSessionId,
  stripAmendTranscriptParam,
} from "@/lib/cockpit/visit-narrative-amendment";

describe("visit-narrative-amendment helpers", () => {
  it("accepts a session UUID and rejects junk", () => {
    expect(
      parseAmendTranscriptSessionId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    ).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(parseAmendTranscriptSessionId("not-a-uuid")).toBeNull();
    expect(parseAmendTranscriptSessionId("")).toBeNull();
  });

  it("reads and strips the amendTranscript param without touching origin params", () => {
    const params = new URLSearchParams(
      "from=patients-v2&pid=pat-1&amendTranscript=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(readAmendTranscriptSessionId(params)).toBe(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(stripAmendTranscriptParam(params.toString())).toBe(
      "?from=patients-v2&pid=pat-1",
    );
    expect(AMEND_TRANSCRIPT_PARAM).toBe("amendTranscript");
  });
});
