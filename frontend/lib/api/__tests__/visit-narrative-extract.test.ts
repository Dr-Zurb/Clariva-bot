import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EMPTY_TRANSCRIPT_EXTRACT,
  extractVisitNarrative,
} from "@/lib/api/visit-narrative-extract";

vi.mock("@/lib/api-base", () => ({
  requireApiBaseUrl: vi.fn(() => "https://api.example.com"),
}));

describe("extractVisitNarrative (vnt-03)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the locked extract contract on success", async () => {
    const payload = {
      status: "ready",
      transcriptId: "tr-1",
      transcriptChars: 42,
      lines: [{ text: "c/o fever", spanStart: 0, spanEnd: 12 }],
      droppedCount: 0,
      overWindow: false,
      chunksUsed: 1,
      redactionApplied: true,
      transcriptText: "c/o fever for three days",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: payload,
          meta: { timestamp: "t", requestId: "r" },
        }),
      })
    );

    const result = await extractVisitNarrative("tok", {
      consultationSessionId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result).toEqual(payload);
    expect(result).not.toHaveProperty("quote");
    expect(result.lines[0]).not.toHaveProperty("quote");
  });

  it("fail-softs HTTP and transport errors to an empty failed result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          success: false,
          error: { message: "boom", statusCode: 500 },
        }),
      })
    );
    await expect(
      extractVisitNarrative("tok", {
        consultationSessionId: "11111111-1111-4111-8111-111111111111",
      })
    ).resolves.toEqual({ ...EMPTY_TRANSCRIPT_EXTRACT, status: "failed" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(
      extractVisitNarrative("tok", {
        consultationSessionId: "11111111-1111-4111-8111-111111111111",
      })
    ).resolves.toEqual({ ...EMPTY_TRANSCRIPT_EXTRACT, status: "failed" });
  });

  it("rethrows AbortError so the caller can ignore a superseded request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"))
    );
    await expect(
      extractVisitNarrative("tok", {
        consultationSessionId: "11111111-1111-4111-8111-111111111111",
        signal: new AbortController().signal,
      })
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
