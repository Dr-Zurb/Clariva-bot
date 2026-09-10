import { describe, expect, it } from "vitest";
import {
  isConnectionStatsStale,
  parseConnectionStatsBeacon,
  CONNECTION_STATS_STALE_MS,
} from "../connection-stats-beacon";
import {
  computeWindowedLossPct,
  readJitter,
  readPacketLossCounters,
  readRtt,
  smoothMetric,
} from "../twilio-stats-parse";

describe("readRtt / readJitter units", () => {
  it("treats roundTripTime as seconds so a 5 ms Mumbai hop stays 5", () => {
    expect(
      readRtt({
        localAudioTrackStats: [{ roundTripTime: 0.005 }],
      }),
    ).toBe(5);
    expect(
      readRtt({
        localAudioTrackStats: [{ roundTripTime: 0.05 }],
      }),
    ).toBe(50);
  });

  it("prefers roundTripTimeMS when both fields exist", () => {
    expect(
      readRtt({
        localAudioTrackStats: [{ roundTripTime: 0.05, roundTripTimeMS: 48 }],
      }),
    ).toBe(48);
  });

  it("treats jitter as seconds", () => {
    expect(
      readJitter({
        localAudioTrackStats: [{ jitter: 0.005 }],
      }),
    ).toBe(5);
  });
});

describe("computeWindowedLossPct", () => {
  it("returns null until a previous sample exists", () => {
    expect(
      computeWindowedLossPct({ lost: 2, sent: 100 }, null),
    ).toBeNull();
  });

  it("uses the window, not the lifetime total", () => {
    const prev = { lost: 50, sent: 950 };
    const current = { lost: 51, sent: 1049 };
    expect(computeWindowedLossPct(current, prev)).toBe(1);
  });

  it("treats a counter reset as 0, not a huge spike", () => {
    expect(
      computeWindowedLossPct({ lost: 0, sent: 10 }, { lost: 80, sent: 900 }),
    ).toBe(0);
  });
});

describe("readPacketLossCounters", () => {
  it("reads audio send/lost", () => {
    expect(
      readPacketLossCounters({
        localAudioTrackStats: [{ packetsLost: 3, packetsSent: 97 }],
      }),
    ).toEqual({ lost: 3, sent: 97 });
  });
});

describe("smoothMetric", () => {
  it("returns the first sample, then eases toward the next", () => {
    expect(smoothMetric(null, 100)).toBe(100);
    expect(smoothMetric(100, 0, 0.5)).toBe(50);
    expect(smoothMetric(40, null)).toBe(40);
  });
});

describe("parseConnectionStatsBeacon", () => {
  it("accepts a v1 payload and rejects junk", () => {
    const ok = parseConnectionStatsBeacon(
      JSON.stringify({
        v: 1,
        t: 1_700_000_000_000,
        level: 4,
        rttMs: 42,
        jitterMs: 6,
        lossPct: 0.2,
        res: { w: 1280, h: 720 },
        fps: 30,
        kbps: 1800,
        limit: "none",
      }),
    );
    expect(ok?.rttMs).toBe(42);
    expect(parseConnectionStatsBeacon("hello")).toBeNull();
    expect(parseConnectionStatsBeacon("{}")).toBeNull();
  });
});

describe("isConnectionStatsStale", () => {
  it("is stale after the timeout, and when missing", () => {
    const now = 1_000_000;
    expect(
      isConnectionStatsStale(
        {
          v: 1,
          t: now - CONNECTION_STATS_STALE_MS - 1,
          level: 5,
          rttMs: 20,
          jitterMs: 2,
          lossPct: 0,
          res: null,
          fps: null,
          kbps: null,
          limit: null,
        },
        now,
      ),
    ).toBe(true);
    expect(isConnectionStatsStale(null, now)).toBe(true);
    expect(
      isConnectionStatsStale(
        {
          v: 1,
          t: now - 1000,
          level: 5,
          rttMs: 20,
          jitterMs: 2,
          lossPct: 0,
          res: null,
          fps: null,
          kbps: null,
          limit: null,
        },
        now,
      ),
    ).toBe(false);
  });
});
