"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Supported dictation locales for v1 (hard-coded per task text-C3). */
export const SPEECH_RECOGNITION_LOCALES = [
  { value: "en-IN", label: "English (India)" },
  { value: "en-US", label: "English (US)" },
  { value: "hi-IN", label: "Hindi" },
  { value: "mr-IN", label: "Marathi" },
] as const;

export type SpeechRecognitionLocale = (typeof SPEECH_RECOGNITION_LOCALES)[number]["value"];

/** Feature detection — mic button hidden when absent (Firefox, some WebViews). */
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
}

function resolveDefaultLocale(): string {
  if (typeof navigator === "undefined") return "en-IN";
  const lang = navigator.language;
  const supported = SPEECH_RECOGNITION_LOCALES.some((l) => l.value === lang);
  return supported ? lang : "en-IN";
}

/** Append a final dictation chunk to composer text with spacing rules from text-C3. */
export function appendDictationFinal(existing: string, finalText: string): string {
  const trimmedFinal = finalText.trim();
  if (!trimmedFinal) return existing;
  if (!existing) return trimmedFinal;
  if (/\s$/.test(existing)) return existing + trimmedFinal;
  return `${existing} ${trimmedFinal}`;
}

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpeechRecognitionOptions {
  locale?: string;
  /** Interim results — local-only; never persist or broadcast. */
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (err: SpeechRecognitionErrorEvent) => void;
  /** Fired when silence timeout auto-stops recording. */
  onSilenceTimeout?: () => void;
  silenceTimeoutMs?: number;
}

export function useSpeechRecognition({
  locale,
  onPartial,
  onFinal,
  onError,
  onSilenceTimeout,
  silenceTimeoutMs = 30_000,
}: UseSpeechRecognitionOptions): {
  isListening: boolean;
  start: () => void;
  stop: () => void;
} {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isListeningRef = useRef(false);

  const onPartialRef = useRef(onPartial);
  const onFinalRef = useRef(onFinal);
  const onErrorRef = useRef(onError);
  const onSilenceTimeoutRef = useRef(onSilenceTimeout);

  useEffect(() => {
    onPartialRef.current = onPartial;
  }, [onPartial]);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onSilenceTimeoutRef.current = onSilenceTimeout;
  }, [onSilenceTimeout]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stopInternal = useCallback(() => {
    clearSilenceTimer();
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // Already stopped.
      }
      recognitionRef.current = null;
    }
    isListeningRef.current = false;
    setIsListening(false);
  }, [clearSilenceTimer]);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      if (!isListeningRef.current) return;
      stopInternal();
      onSilenceTimeoutRef.current?.();
    }, silenceTimeoutMs);
  }, [clearSilenceTimer, silenceTimeoutMs, stopInternal]);

  const stop = useCallback(() => {
    stopInternal();
  }, [stopInternal]);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    stopInternal();

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = locale ?? resolveDefaultLocale();

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      resetSilenceTimer();
      if (interim) onPartialRef.current(interim);
      if (final) onFinalRef.current(final);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "aborted") return;
      stopInternal();
      onErrorRef.current(event);
    };

    recognition.onend = () => {
      if (isListeningRef.current) {
        isListeningRef.current = false;
        setIsListening(false);
      }
      clearSilenceTimer();
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    isListeningRef.current = true;
    setIsListening(true);

    try {
      recognition.start();
      resetSilenceTimer();
    } catch {
      stopInternal();
    }
  }, [clearSilenceTimer, locale, resetSilenceTimer, stopInternal]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible" && isListeningRef.current) {
        stopInternal();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [stopInternal]);

  useEffect(() => {
    return () => {
      stopInternal();
    };
  }, [stopInternal]);

  return { isListening, start, stop };
}
