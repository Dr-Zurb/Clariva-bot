/**
 * Unit tests for `frontend/lib/audio/gain-node.ts`.
 */

import { createBoostedAudioRouter } from "../gain-node";

describe("createBoostedAudioRouter", () => {
  let gainValue = 1;
  let elementVolume = 1;

  const disconnect = vi.fn();
  const connect = vi.fn();
  const close = vi.fn().mockResolvedValue(undefined);
  const resume = vi.fn().mockResolvedValue(undefined);

  class MockGainNode {
    gain = {
      get value() {
        return gainValue;
      },
      set value(v: number) {
        gainValue = v;
      },
    };
    connect = connect;
    disconnect = disconnect;
  }

  class MockMediaElementSource {
    connect = connect;
    disconnect = disconnect;
  }

  class MockAudioContext {
    state: AudioContextState = "running";
    destination = {};
    createGain() {
      return new MockGainNode() as unknown as GainNode;
    }
    createMediaElementSource() {
      return new MockMediaElementSource() as unknown as MediaElementAudioSourceNode;
    }
    close = close;
    resume = resume;
  }

  beforeEach(() => {
    gainValue = 1;
    elementVolume = 1;
    disconnect.mockClear();
    connect.mockClear();
    close.mockClear();
    resume.mockClear();
    vi.stubGlobal(
      "AudioContext",
      MockAudioContext as unknown as typeof AudioContext,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockAudioElement(): HTMLAudioElement {
    return {
      get volume() {
        return elementVolume;
      },
      set volume(v: number) {
        elementVolume = v;
      },
    } as HTMLAudioElement;
  }

  it("maps 0–100 to element volume with unity gain", () => {
    const el = mockAudioElement();
    const router = createBoostedAudioRouter(el);

    router.setVolume(50);
    expect(elementVolume).toBe(0.5);
    expect(gainValue).toBe(1);

    router.setVolume(0);
    expect(elementVolume).toBe(0);
    expect(gainValue).toBe(1);

    router.dispose();
  });

  it("maps 100–150 to max element volume and gain boost", () => {
    const el = mockAudioElement();
    const router = createBoostedAudioRouter(el);

    router.setVolume(125);
    expect(elementVolume).toBe(1);
    expect(gainValue).toBe(1.25);

    router.setVolume(150);
    expect(elementVolume).toBe(1);
    expect(gainValue).toBe(1.5);

    router.dispose();
  });

  it("clamps out-of-range values", () => {
    const el = mockAudioElement();
    const router = createBoostedAudioRouter(el);

    router.setVolume(200);
    expect(elementVolume).toBe(1);
    expect(gainValue).toBe(1.5);

    router.setVolume(-10);
    expect(elementVolume).toBe(0);
    expect(gainValue).toBe(1);

    router.dispose();
  });

  it("dispose is idempotent and closes the context", () => {
    const el = mockAudioElement();
    const router = createBoostedAudioRouter(el);

    router.dispose();
    router.dispose();

    expect(disconnect).toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);

    elementVolume = 0.5;
    gainValue = 2;
    router.setVolume(100);
    expect(elementVolume).toBe(0.5);
    expect(gainValue).toBe(2);
  });

  it("falls back to element-only volume when AudioContext is unavailable", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);

    const el = mockAudioElement();
    const router = createBoostedAudioRouter(el);

    router.setVolume(120);
    expect(elementVolume).toBe(1);
    expect(gainValue).toBe(1);

    router.setVolume(80);
    expect(elementVolume).toBe(0.8);

    router.dispose();
    router.setVolume(50);
    expect(elementVolume).toBe(0.8);
  });
});
