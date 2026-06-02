"use client";

/**
 * Sub-batch A · task-video-A7 + voice-A3 — minimal mic level meter.
 *
 * Wraps the Web Audio `AnalyserNode` to expose a 0–1 amplitude
 * signal sampled on `requestAnimationFrame`. The pre-call screen
 * (and voice batch's mic-check via voice A3 / A6) consumes this to
 * draw a 10-bar visualizer that pulses with the user's voice.
 *
 * Why a thin wrapper (not a heavy lib): the visualization needs are
 * trivial — we just want "am I speaking?" feedback. A 12-line RMS
 * over 256 time-domain samples is plenty; pulling in a chart lib
 * for this would be overkill.
 *
 * Lifecycle:
 *   1. Caller obtains a `MediaStream` (audio track) via `getUserMedia`.
 *   2. Caller creates a `MicMeter` via `createMicMeter(stream)`.
 *   3. Caller calls `subscribe(callback)` — the callback fires once per
 *      animation frame with a `number` in `[0, 1]`. (`start` is an alias.)
 *   4. On unmount (or stream swap), caller calls `stop()` — releases
 *      the `AudioContext` AND cancels the rAF loop.
 *
 * SSR: the constructor short-circuits if `AudioContext` is unavailable;
 * `start()` becomes a no-op (the meter just stays at 0). The pre-call
 * screen renders the 10-bar visualizer in its empty state, which is
 * fine — the bars don't pulse.
 *
 * Pulled FORWARD: voice A3 hadn't shipped at execution time. When it
 * lands, voice imports from this same path; this file is the
 * canonical implementation.
 */

const FFT_SIZE = 256;
// Smoothing over time domain samples — Twilio-equivalent. Higher
// values smooth out the visualization (less "twitchy") at the cost
// of latency. 0.7 is the sweet spot for "feels responsive but not
// jumpy".
const SMOOTHING_TIME_CONSTANT = 0.7;

export type MicAmplitudeListener = (amplitude: number) => void;

export interface MicMeter {
  /**
   * Begin sampling the input audio. The listener fires once per
   * animation frame with a 0-1 amplitude. Calling `subscribe` twice
   * replaces the previous listener (no listener fan-out is needed
   * for the v1 surface).
   */
  subscribe(listener: MicAmplitudeListener): void;
  /** Alias for `subscribe` — kept for video pre-call (A7) consumers. */
  start(listener: MicAmplitudeListener): void;
  /**
   * Stop sampling AND release the underlying AudioContext. Idempotent —
   * safe to call from a React effect cleanup that may already have
   * been torn down by the parent (e.g. stream swap).
   */
  stop(): void;
}

interface BrowserAudioContextCtor {
  new (): AudioContext;
}

function getAudioContextCtor(): BrowserAudioContextCtor | null {
  if (typeof window === "undefined") return null;
  // Safari < 14.1 only exposes `webkitAudioContext`; widen the type.
  const w = window as unknown as {
    AudioContext?: BrowserAudioContextCtor;
    webkitAudioContext?: BrowserAudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Create a `MicMeter` bound to the given media stream. The stream
 * must contain at least one audio track; if it doesn't, the meter
 * returns 0 forever (no throw).
 */
export function createMicMeter(stream: MediaStream): MicMeter {
  const Ctor = getAudioContextCtor();
  let context: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let rafHandle: number | null = null;
  let stopped = false;

  // Lazily create the AudioContext on `start()` so we don't burn one
  // before the user has interacted (some browsers block AudioContext
  // creation in the resume() path otherwise — Chrome's autoplay
  // policy).
  const ensureGraph = () => {
    if (context || !Ctor) return;
    try {
      context = new Ctor();
      analyser = context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return;
      source = context.createMediaStreamSource(stream);
      source.connect(analyser);
    } catch {
      // Locked-down browser / extension blocked AudioContext —
      // silently fall back to amplitude=0 forever; the UI still
      // works (10 bars stay grey) but the user gets no feedback.
      // The pre-call screen exposes a "Skip mic check" link that
      // works regardless.
      context = null;
      analyser = null;
      source = null;
    }
  };

  const stop: MicMeter["stop"] = () => {
    if (stopped) return;
    stopped = true;
    if (rafHandle != null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
    try {
      source?.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      analyser?.disconnect();
    } catch {
      /* already disconnected */
    }
    if (context && context.state !== "closed") {
      // `close()` returns a Promise; the caller doesn't care, and
      // letting it resolve in the background is fine — we've already
      // dropped our references.
      void context.close();
    }
    source = null;
    analyser = null;
    context = null;
  };

  const subscribe: MicMeter["subscribe"] = (listener) => {
    if (stopped) return;
    ensureGraph();
    if (!analyser) {
      // No audio graph available — fire a single 0 so the UI seeds
      // the visualizer to its empty state and the listener at least
      // observed one tick (caller doesn't have to special-case
      // never-fired).
      listener(0);
      return;
    }
    const buffer = new Uint8Array(analyser.fftSize);
    const sample = () => {
      if (stopped || !analyser) return;
      analyser.getByteTimeDomainData(buffer);
      // Compute RMS over the time-domain samples. `byteTimeDomainData`
      // is in [0, 255] centered at 128 (silence), so subtract 128 and
      // normalize to [-1, 1] before squaring.
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const v = (buffer[i]! - 128) / 128;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / buffer.length);
      // Boost the perceived range — RMS for normal speech sits around
      // 0.05–0.15. Multiplying by 4 stretches that to ~0.2–0.6 which
      // gives a visually responsive bar (otherwise the visualizer
      // looks dead even when the user is talking).
      const amplitude = Math.min(1, rms * 4);
      listener(amplitude);
      rafHandle = requestAnimationFrame(sample);
    };
    rafHandle = requestAnimationFrame(sample);
  };

  return { subscribe, start: subscribe, stop };
}
