/**
 * Unit tests for `frontend/lib/voice/quality-reporter.ts`
 * (Sub-batch C · task-voice-C2).
 *
 * Covers:
 *   1. Cadence — fast (10s) for the first minute, slow (30s) thereafter.
 *   2. Buffering + flush — samples accumulate; the 60s flush timer
 *      drains the buffer; final flush on dispose.
 *   3. Failed POST recovery — on poster rejection, samples are
 *      restored to the front of the buffer for the next flush.
 *   4. Idempotent dispose — second call is a no-op.
 *   5. Empty buffer flush — `flush()` with no samples is a no-op.
 *   6. Pre-connect samples — `getStats()` returning [] still
 *      increments sampleSeq (gap visibility).
 */

import type { Room } from "twilio-video";

import {
  createVoiceQualityReporter,
  VOICE_FAST_CADENCE_MS,
  VOICE_FLUSH_INTERVAL_MS,
  VOICE_SLOW_CADENCE_MS,
  type VoiceQualitySample,
} from "../quality-reporter";

interface MockReport {
  localAudioTrackStats?: Array<Record<string, unknown>>;
  remoteAudioTrackStats?: Array<Record<string, unknown>>;
}

function buildMockReport(overrides: Partial<MockReport> = {}): MockReport {
  return {
    localAudioTrackStats: [
      {
        roundTripTime: 0.05, // 50ms (newer SDK seconds shape)
        jitter: 0.005, // 5ms
        packetsLost: 1,
        packetsSent: 999,
        audioLevel: 0.25, // → 25.0 scaled
      },
    ],
    remoteAudioTrackStats: [
      {
        audioLevel: 0.5, // → 50.0 scaled
      },
    ],
    ...overrides,
  };
}

function buildMockRoom(initialReport: MockReport | null = buildMockReport()): {
  room: Room;
  setReport: (next: MockReport | null) => void;
  setNetworkQualityLevel: (level: number | null) => void;
  getStatsCalls: () => number;
} {
  let report: MockReport | null = initialReport;
  let nql: number | null = 5;
  let calls = 0;
  const room = {
    sid: "RM_test_room",
    localParticipant: {
      get networkQualityLevel() {
        return nql;
      },
    },
    getStats: vi.fn(async () => {
      calls++;
      return report == null ? [] : [report];
    }),
  } as unknown as Room;
  return {
    room,
    setReport: (next) => {
      report = next;
    },
    setNetworkQualityLevel: (level) => {
      nql = level;
    },
    getStatsCalls: () => calls,
  };
}

describe("createVoiceQualityReporter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("samples on a 10s cadence for the first minute then 30s thereafter", async () => {
    const { room, getStatsCalls } = buildMockRoom();
    const poster = vi.fn().mockResolvedValue({});

    const reporter = createVoiceQualityReporter({
      room,
      sessionId: "session-123",
      role: "doctor",
      poster,
    });

    // First sample fires synchronously in the factory (then schedules
    // the next at +10s).
    await vi.advanceTimersByTimeAsync(0);
    expect(getStatsCalls()).toBe(1);

    // Six fast-phase samples in the first 60s (one at t=0 + five at
    // t=10s..50s; t=60s straddles the boundary and uses slow cadence
    // depending on rounding).
    for (let i = 1; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(VOICE_FAST_CADENCE_MS);
    }
    expect(getStatsCalls()).toBeGreaterThanOrEqual(6);

    // Advance into the slow phase: t≈90s. Sample count should grow
    // by exactly one per 30s tick.
    const beforeSlow = getStatsCalls();
    await vi.advanceTimersByTimeAsync(VOICE_SLOW_CADENCE_MS);
    expect(getStatsCalls()).toBe(beforeSlow + 1);
    await vi.advanceTimersByTimeAsync(VOICE_SLOW_CADENCE_MS);
    expect(getStatsCalls()).toBe(beforeSlow + 2);

    reporter.dispose();
  });

  it("flushes buffered samples every 60s with the right shape", async () => {
    const { room } = buildMockRoom();
    const poster = vi.fn().mockResolvedValue({});

    const reporter = createVoiceQualityReporter({
      room,
      sessionId: "session-123",
      role: "patient",
      poster,
    });

    // First sample at t=0 — let microtasks settle.
    await vi.advanceTimersByTimeAsync(0);

    // Walk to t=60s (fast cadence the whole way) — six samples in the
    // buffer; the 60s flush timer should drain them.
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(VOICE_FAST_CADENCE_MS);
    }
    // Tick the flush timer.
    await vi.advanceTimersByTimeAsync(VOICE_FLUSH_INTERVAL_MS - 5 * VOICE_FAST_CADENCE_MS);

    expect(poster).toHaveBeenCalledTimes(1);
    const batch = poster.mock.calls[0]?.[0] as VoiceQualitySample[];
    expect(Array.isArray(batch)).toBe(true);
    expect(batch.length).toBeGreaterThanOrEqual(6);
    // sampleSeq is monotonic 0-indexed.
    expect(batch[0]?.sampleSeq).toBe(0);
    expect(batch[batch.length - 1]?.sampleSeq).toBe(batch.length - 1);
    // Spot-check one sample's shape.
    const s = batch[0]!;
    expect(s.networkQualityLevel).toBe(5);
    expect(s.rttMs).toBe(50); // 0.05s → 50ms
    expect(s.jitterMs).toBe(5); // 0.005s → 5ms
    expect(s.audioInputLevel).toBeCloseTo(25, 1);
    expect(s.audioOutputLevel).toBeCloseTo(50, 1);
    expect(s.twilioRoomSid).toBe("RM_test_room");

    reporter.dispose();
  });

  it("dispose() flushes the remaining buffer (final flush)", async () => {
    const { room } = buildMockRoom();
    const poster = vi.fn().mockResolvedValue({});

    const reporter = createVoiceQualityReporter({
      room,
      sessionId: "session-123",
      role: "doctor",
      poster,
    });

    // Two samples; both in the buffer; no automatic flush yet.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(VOICE_FAST_CADENCE_MS);
    expect(poster).toHaveBeenCalledTimes(0);

    reporter.dispose();
    // dispose triggers a final flush — let microtasks resolve.
    await vi.advanceTimersByTimeAsync(0);
    expect(poster).toHaveBeenCalledTimes(1);
    const batch = poster.mock.calls[0]?.[0] as VoiceQualitySample[];
    expect(batch.length).toBeGreaterThanOrEqual(2);
  });

  it("restores samples to the buffer on a failed POST", async () => {
    const { room } = buildMockRoom();
    const poster = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({});

    const reporter = createVoiceQualityReporter({
      room,
      sessionId: "session-123",
      role: "doctor",
      poster,
    });

    // Walk far enough to trigger one flush.
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(VOICE_FAST_CADENCE_MS);
    }
    // Make the flush fire.
    await vi.advanceTimersByTimeAsync(VOICE_FLUSH_INTERVAL_MS - 5 * VOICE_FAST_CADENCE_MS);
    expect(poster).toHaveBeenCalledTimes(1);

    // Trigger a manual flush — the previously-failed batch should be
    // re-sent (sampleSeq starts at 0 again on this call).
    await reporter.flush();
    expect(poster).toHaveBeenCalledTimes(2);
    const retryBatch = poster.mock.calls[1]?.[0] as VoiceQualitySample[];
    expect(retryBatch[0]?.sampleSeq).toBe(0);

    reporter.dispose();
  });

  it("is idempotent on multiple dispose() calls", async () => {
    const { room } = buildMockRoom();
    const poster = vi.fn().mockResolvedValue({});

    const reporter = createVoiceQualityReporter({
      room,
      sessionId: "session-123",
      role: "doctor",
      poster,
    });
    await vi.advanceTimersByTimeAsync(0);

    reporter.dispose();
    reporter.dispose();
    reporter.dispose();
    await vi.advanceTimersByTimeAsync(0);

    // Final flush only fires from the FIRST dispose; subsequent calls
    // are no-ops, so poster total stays at 1 (the final flush).
    expect(poster).toHaveBeenCalledTimes(1);
  });

  it("flush() with an empty buffer is a no-op", async () => {
    const { room, setReport } = buildMockRoom(null);
    setReport(null); // getStats returns []
    const poster = vi.fn().mockResolvedValue({});
    const reporter = createVoiceQualityReporter({
      room,
      sessionId: "session-123",
      role: "doctor",
      poster,
    });
    await vi.advanceTimersByTimeAsync(0);
    await reporter.flush();
    expect(poster).not.toHaveBeenCalled();
    reporter.dispose();
  });

  it("increments sampleSeq even when the SDK returns no peer connection", async () => {
    const { room, setReport } = buildMockRoom();
    const poster = vi.fn().mockResolvedValue({});
    const reporter = createVoiceQualityReporter({
      room,
      sessionId: "session-123",
      role: "doctor",
      poster,
    });

    // First sample fires synchronously with a real report.
    await vi.advanceTimersByTimeAsync(0);

    // Drop the report — next sample skips push but still bumps seq.
    setReport(null);
    await vi.advanceTimersByTimeAsync(VOICE_FAST_CADENCE_MS);

    // Restore — next sample should have seq=2 (gap visible).
    setReport(buildMockReport());
    await vi.advanceTimersByTimeAsync(VOICE_FAST_CADENCE_MS);

    // Force a flush.
    await reporter.flush();
    expect(poster).toHaveBeenCalledTimes(1);
    const batch = poster.mock.calls[0]?.[0] as VoiceQualitySample[];
    // First sample has seq=0; the post-gap sample should have seq=2,
    // not seq=1 (the gap is visible in analytics).
    const seqs = batch.map((s) => s.sampleSeq);
    expect(seqs).toContain(0);
    expect(seqs).toContain(2);

    reporter.dispose();
  });

  it("emits null networkQualityLevel when the SDK hasn't populated it", async () => {
    const { room, setNetworkQualityLevel } = buildMockRoom();
    setNetworkQualityLevel(null);
    const poster = vi.fn().mockResolvedValue({});
    const reporter = createVoiceQualityReporter({
      room,
      sessionId: "session-123",
      role: "doctor",
      poster,
    });
    await vi.advanceTimersByTimeAsync(0);
    await reporter.flush();
    expect(poster).toHaveBeenCalledTimes(1);
    const batch = poster.mock.calls[0]?.[0] as VoiceQualitySample[];
    expect(batch[0]?.networkQualityLevel).toBeNull();
    reporter.dispose();
  });
});
