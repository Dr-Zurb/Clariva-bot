import { describe, expect, it, vi } from "vitest";
import {
  CONNECTION_PROBE_URL,
  classifyProbeMbps,
  runConnectionProbe,
  shouldAutoRunConnectionProbe,
} from "@/lib/consultation/connection-probe";

describe("classifyProbeMbps (crc-11)", () => {
  it("maps the same three bands the in-call A8 bars use", () => {
    expect(classifyProbeMbps(0)).toBe("poor");
    expect(classifyProbeMbps(0.49)).toBe("poor");
    expect(classifyProbeMbps(0.5)).toBe("marginal");
    expect(classifyProbeMbps(1.49)).toBe("marginal");
    expect(classifyProbeMbps(1.5)).toBe("good");
    expect(classifyProbeMbps(8)).toBe("good");
  });

  it("treats non-finite throughput as poor", () => {
    expect(classifyProbeMbps(Number.NaN)).toBe("poor");
    expect(classifyProbeMbps(Number.POSITIVE_INFINITY)).toBe("poor");
  });
});

describe("shouldAutoRunConnectionProbe (crc-11)", () => {
  it("skips auto-run on cellular and on save-data", () => {
    expect(
      shouldAutoRunConnectionProbe({ detection: "cellular", saveData: false })
    ).toBe(false);
    expect(
      shouldAutoRunConnectionProbe({
        detection: "non-cellular",
        saveData: true,
      })
    ).toBe(false);
  });

  it("auto-runs on Wi-Fi and on unknown (Safari has no Network Information API)", () => {
    expect(
      shouldAutoRunConnectionProbe({
        detection: "non-cellular",
        saveData: false,
      })
    ).toBe(true);
    expect(
      shouldAutoRunConnectionProbe({ detection: "unknown", saveData: false })
    ).toBe(true);
  });
});

describe("runConnectionProbe (crc-11)", () => {
  const bufferOf = (bytes: number) => new ArrayBuffer(bytes);

  it("classifies measured throughput from a cache-busted GET", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => bufferOf(250_000),
    }));
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(1_000);

    await expect(
      runConnectionProbe({
        signal: new AbortController().signal,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        now,
      })
    ).resolves.toBe("good");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url.startsWith(`${CONNECTION_PROBE_URL}?crc11=`)).toBe(true);
    expect(init.cache).toBe("no-store");
  });

  it("rejects on HTTP failure, empty body, or zero elapsed time", async () => {
    const signal = new AbortController().signal;

    await expect(
      runConnectionProbe({
        signal,
        fetchImpl: (async () => ({
          ok: false,
          arrayBuffer: async () => bufferOf(1),
        })) as unknown as typeof fetch,
        now: () => 1,
      })
    ).rejects.toThrow("probe_http");

    await expect(
      runConnectionProbe({
        signal,
        fetchImpl: (async () => ({
          ok: true,
          arrayBuffer: async () => bufferOf(0),
        })) as unknown as typeof fetch,
        now: () => 1,
      })
    ).rejects.toThrow("probe_empty");

    await expect(
      runConnectionProbe({
        signal,
        fetchImpl: (async () => ({
          ok: true,
          arrayBuffer: async () => bufferOf(250_000),
        })) as unknown as typeof fetch,
        now: () => 0,
      })
    ).rejects.toThrow("probe_elapsed");
  });
});
