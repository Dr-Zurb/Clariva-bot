/**
 * @vitest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendDictationFinal,
  isSpeechRecognitionSupported,
  useSpeechRecognition,
} from "../use-speech-recognition";

type ResultHandler = (event: SpeechRecognitionEvent) => void;
type ErrorHandler = (event: SpeechRecognitionErrorEvent) => void;
type EndHandler = () => void;

class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ResultHandler | null = null;
  onerror: ErrorHandler | null = null;
  onend: EndHandler | null = null;
  start = vi.fn();
  stop = vi.fn(() => {
    this.onend?.();
  });
  abort = vi.fn();
}

let latestRecognition: MockSpeechRecognition | null = null;

function makeResultEvent(
  items: Array<{ transcript: string; isFinal: boolean }>,
  resultIndex = 0,
): SpeechRecognitionEvent {
  const results = items.map((item) => ({
    isFinal: item.isFinal,
    length: 1,
    0: { transcript: item.transcript, confidence: 1 },
    item: (index: number) =>
      index === 0 ? { transcript: item.transcript, confidence: 1 } : undefined!,
  }));
  return {
    resultIndex,
    results: {
      length: results.length,
      item: (index: number) => results[index],
      ...Object.fromEntries(results.map((r, i) => [i, r])),
    },
  } as unknown as SpeechRecognitionEvent;
}

describe("isSpeechRecognitionSupported", () => {
  it("returns true when SpeechRecognition is present", () => {
    (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition =
      MockSpeechRecognition as unknown as typeof SpeechRecognition;
    expect(isSpeechRecognitionSupported()).toBe(true);
  });

  it("returns false when neither API is present", () => {
    delete (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    expect(isSpeechRecognitionSupported()).toBe(false);
  });
});

describe("appendDictationFinal", () => {
  it("adds a leading space when composer is non-empty and lacks trailing whitespace", () => {
    expect(appendDictationFinal("Hello", "world")).toBe("Hello world");
  });

  it("does not add extra space when composer already ends with whitespace", () => {
    expect(appendDictationFinal("Hello ", "world")).toBe("Hello world");
  });

  it("returns final text alone when composer is empty", () => {
    expect(appendDictationFinal("", "world")).toBe("world");
  });
});

describe("useSpeechRecognition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    latestRecognition = null;
    (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition = class extends MockSpeechRecognition {
      constructor() {
        super();
        latestRecognition = this;
      }
    } as unknown as typeof SpeechRecognition;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition;
    latestRecognition = null;
  });

  it("starts with continuous + interimResults and calls onPartial / onFinal", () => {
    const onPartial = vi.fn();
    const onFinal = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useSpeechRecognition({ locale: "en-IN", onPartial, onFinal, onError }),
    );

    act(() => {
      result.current.start();
    });

    expect(latestRecognition?.continuous).toBe(true);
    expect(latestRecognition?.interimResults).toBe(true);
    expect(latestRecognition?.lang).toBe("en-IN");
    expect(result.current.isListening).toBe(true);

    act(() => {
      latestRecognition?.onresult?.(
        makeResultEvent([{ transcript: "hel", isFinal: false }]),
      );
    });
    expect(onPartial).toHaveBeenCalledWith("hel");

    act(() => {
      latestRecognition?.onresult?.(
        makeResultEvent([{ transcript: "hello", isFinal: true }]),
      );
    });
    expect(onFinal).toHaveBeenCalledWith("hello");
    expect(onError).not.toHaveBeenCalled();
  });

  it("auto-stops after silence timeout and fires onSilenceTimeout", () => {
    const onSilenceTimeout = vi.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({
        onPartial: vi.fn(),
        onFinal: vi.fn(),
        onError: vi.fn(),
        onSilenceTimeout,
        silenceTimeoutMs: 30_000,
      }),
    );

    act(() => {
      result.current.start();
    });
    expect(result.current.isListening).toBe(true);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(onSilenceTimeout).toHaveBeenCalledTimes(1);
    expect(result.current.isListening).toBe(false);
  });

  it("resets the silence timer on each result", () => {
    const onSilenceTimeout = vi.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({
        onPartial: vi.fn(),
        onFinal: vi.fn(),
        onError: vi.fn(),
        onSilenceTimeout,
        silenceTimeoutMs: 30_000,
      }),
    );

    act(() => {
      result.current.start();
    });

    act(() => {
      vi.advanceTimersByTime(20_000);
      latestRecognition?.onresult?.(
        makeResultEvent([{ transcript: "still talking", isFinal: false }]),
      );
    });

    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(onSilenceTimeout).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onSilenceTimeout).toHaveBeenCalledTimes(1);
  });

  it("stop() ends listening", () => {
    const { result } = renderHook(() =>
      useSpeechRecognition({
        onPartial: vi.fn(),
        onFinal: vi.fn(),
        onError: vi.fn(),
      }),
    );

    act(() => {
      result.current.start();
    });
    expect(result.current.isListening).toBe(true);

    act(() => {
      result.current.stop();
    });
    expect(result.current.isListening).toBe(false);
  });

  it("stops when the tab becomes hidden", () => {
    const { result } = renderHook(() =>
      useSpeechRecognition({
        onPartial: vi.fn(),
        onFinal: vi.fn(),
        onError: vi.fn(),
      }),
    );

    act(() => {
      result.current.start();
    });

    act(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.isListening).toBe(false);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });
});

describe("useSpeechRecognition PHI hygiene", () => {
  beforeEach(() => {
    latestRecognition = null;
    (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition = class extends MockSpeechRecognition {
      constructor() {
        super();
        latestRecognition = this;
      }
    } as unknown as typeof SpeechRecognition;
  });

  afterEach(() => {
    delete (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition;
    latestRecognition = null;
  });

  it("never triggers supabase INSERT during partial or final callbacks (local-only until Send)", () => {
    const insertMock = vi.fn();
    const supabaseClient = {
      from: vi.fn(() => ({
        insert: insertMock,
      })),
    };

    let partialTranscript = "";
    let composer = "";

    const onPartial = (text: string) => {
      partialTranscript = text;
    };
    const onFinal = (text: string) => {
      composer = appendDictationFinal(composer, text);
      partialTranscript = "";
    };

    const { result } = renderHook(() =>
      useSpeechRecognition({
        onPartial,
        onFinal,
        onError: vi.fn(),
      }),
    );

    act(() => {
      result.current.start();
    });

    act(() => {
      latestRecognition?.onresult?.(
        makeResultEvent([{ transcript: "patient has", isFinal: false }]),
      );
    });
    expect(partialTranscript).toBe("patient has");
    expect(composer).toBe("");
    expect(supabaseClient.from).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();

    act(() => {
      latestRecognition?.onresult?.(
        makeResultEvent([{ transcript: "patient has fever", isFinal: true }]),
      );
    });
    expect(composer).toBe("patient has fever");
    expect(partialTranscript).toBe("");
    expect(supabaseClient.from).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });
});
