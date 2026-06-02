/**
 * Unit tests for `frontend/lib/audio/mic-meter.ts`.
 */

import { createMicMeter } from "../mic-meter";

describe("createMicMeter", () => {
  const rafCallbacks: FrameRequestCallback[] = [];
  let rafId = 0;

  beforeEach(() => {
    rafCallbacks.length = 0;
    rafId = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      rafId += 1;
      return rafId;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function flushOneFrame() {
    const cb = rafCallbacks.shift();
    cb?.(0);
  }

  it("subscribe/stop lifecycle closes AudioContext and cancels rAF", () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const disconnect = vi.fn();
    const getByteTimeDomainData = vi.fn((buf: Uint8Array) => {
      buf.fill(128);
    });

    class MockAnalyser {
      fftSize = 256;
      smoothingTimeConstant = 0;
      disconnect = disconnect;
      getByteTimeDomainData = getByteTimeDomainData;
    }

    class MockAudioContext {
      state = "running";
      createAnalyser() {
        return new MockAnalyser() as unknown as AnalyserNode;
      }
      createMediaStreamSource() {
        return { connect: vi.fn(), disconnect: vi.fn() };
      }
      close = close;
    }

    vi.stubGlobal(
      "AudioContext",
      MockAudioContext as unknown as typeof AudioContext,
    );

    const stream = {
      getAudioTracks: () => [{ kind: "audio" }],
    } as unknown as MediaStream;

    const meter = createMicMeter(stream);
    const listener = vi.fn();
    meter.subscribe(listener);

    expect(listener).not.toHaveBeenCalled();
    flushOneFrame();
    expect(listener).toHaveBeenCalledWith(0);
    expect(getByteTimeDomainData).toHaveBeenCalled();

    meter.stop();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();

    meter.stop();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("fires amplitude 0 when stream has no audio tracks", () => {
    const stream = {
      getAudioTracks: () => [],
    } as unknown as MediaStream;

    const meter = createMicMeter(stream);
    const listener = vi.fn();
    meter.subscribe(listener);

    expect(listener).toHaveBeenCalledWith(0);
    expect(rafCallbacks).toHaveLength(0);

    meter.stop();
  });

  it("start is an alias for subscribe", () => {
    const stream = {
      getAudioTracks: () => [],
    } as unknown as MediaStream;

    const meter = createMicMeter(stream);
    const listener = vi.fn();
    meter.start(listener);

    expect(listener).toHaveBeenCalledWith(0);
    meter.stop();
  });
});
