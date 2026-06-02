"use client";

/**
 * Pre-call mic + speaker check for voice consults (task-voice-A6).
 * Client-only until Join/Skip; token exchange stays on the parent page.
 *
 * @see task-voice-B2-precall-lobby.md — adds branding + countdown above this.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import MicMeterBar from "@/components/consultation/MicMeterBar";
import AudioOutputPicker from "@/components/consultation/AudioOutputPicker";
import SpeakerEarpieceToggle from "@/components/consultation/SpeakerEarpieceToggle";
import { useAudioOutputDevice } from "@/hooks/useAudioOutputDevice";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useNoiseSuppressionPreference } from "@/hooks/useNoiseSuppressionPreference";
import { isNoiseSuppressionAvailable } from "@/lib/audio/noise-suppression";
import { trackVoicePrecallEvent } from "@/lib/consultation/voice-precall-telemetry";

/** Soft ~1s chime (WAV; MP3 tooling not required on dev machines). */
export const PRECALL_TEST_CHIME_SRC = "/audio/precall-test-chime.wav";

const MIC_SETTINGS_URL =
  "https://support.google.com/chrome/answer/2693767?hl=en#zippy=%2Cchange-a-sites-camera-microphone-permissions";

type MicPermission = "idle" | "requesting" | "granted" | "denied";

export interface VoiceConsultPreCallProps {
  onJoin: () => void;
  onSkip: () => void;
  className?: string;
}

export default function VoiceConsultPreCall({
  onJoin,
  onSkip,
  className = "",
}: VoiceConsultPreCallProps) {
  const isMobile = !useMediaQuery("(min-width: 768px)", true);
  const audioOutput = useAudioOutputDevice();
  const noiseSuppression = useNoiseSuppressionPreference();
  const noiseSuppressionAvailable = isNoiseSuppressionAvailable();
  const [micPermission, setMicPermission] = useState<MicPermission>("idle");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const testAudioRef = useRef<HTMLAudioElement | null>(null);
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    trackVoicePrecallEvent({ event: "precall_mic_check_shown" });
  }, []);

  const stopMicStream = useCallback((stream: MediaStream | null) => {
    stream?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        /* noop */
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      stopMicStream(micStream);
    };
  }, [micStream, stopMicStream]);

  const requestMic = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicPermission("denied");
      setMicError("Microphone access is not available in this browser.");
      trackVoicePrecallEvent({ event: "precall_mic_permission_denied" });
      return;
    }
    setMicPermission("requesting");
    setMicError(null);
    stopMicStream(micStream);
    setMicStream(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStream(stream);
      setMicPermission("granted");
      trackVoicePrecallEvent({ event: "precall_mic_permission_granted" });
      void audioOutput.refresh();
    } catch (err) {
      setMicPermission("denied");
      setMicError(
        err instanceof Error
          ? err.message
          : "Microphone permission was denied.",
      );
      trackVoicePrecallEvent({ event: "precall_mic_permission_denied" });
    }
  }, [audioOutput, micStream, stopMicStream]);

  // Refresh output device labels after mic grant (browser policy).
  useEffect(() => {
    if (micPermission !== "granted") return;
    void audioOutput.applyToElement(testAudioRef.current);
  }, [micPermission, audioOutput]);

  const playTestSound = useCallback(async () => {
    const el = testAudioRef.current;
    if (!el) return;
    try {
      await audioOutput.applyToElement(el);
      el.currentTime = 0;
      await el.play();
      trackVoicePrecallEvent({ event: "precall_test_sound_played" });
    } catch {
      /* autoplay or sink errors — user can retry */
    }
  }, [audioOutput]);

  const handleJoin = useCallback(() => {
    trackVoicePrecallEvent({ event: "precall_join_clicked" });
    stopMicStream(micStream);
    onJoin();
  }, [micStream, onJoin, stopMicStream]);

  const handleSkip = useCallback(() => {
    trackVoicePrecallEvent({ event: "precall_skip_clicked" });
    stopMicStream(micStream);
    onSkip();
  }, [micStream, onSkip, stopMicStream]);

  return (
    <div
      className={
        "mx-auto w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm " +
        className
      }
    >
      <header className="text-center">
        <h1 className="text-lg font-semibold text-gray-900">Quick mic check</h1>
        <p className="mt-1 text-sm text-gray-600">
          Make sure you can hear and be heard before joining.
        </p>
      </header>

      <section className="mt-6 space-y-2" aria-labelledby="precall-mic-heading">
        <h2 id="precall-mic-heading" className="text-sm font-medium text-gray-900">
          Microphone
        </h2>
        {micPermission === "granted" && micStream ? (
          <>
            <MicMeterBar mode="horizontal" stream={micStream} className="!h-2 !w-full max-w-none" />
            <p className="text-xs text-gray-500">
              Speak normally — you should see the bar move.
            </p>
          </>
        ) : micPermission === "denied" ? (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            <p>
              {micError ??
                "Microphone access was blocked. Allow the mic in your browser settings, then try again."}
            </p>
            <p className="mt-2">
              <a
                href={MIC_SETTINGS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-red-900 underline"
              >
                How to change mic permissions
              </a>
              {" · "}
              <button
                type="button"
                onClick={() => void requestMic()}
                className="font-medium text-red-900 underline"
              >
                Try again
              </button>
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void requestMic()}
            disabled={micPermission === "requesting"}
            className="inline-flex rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {micPermission === "requesting" ? "Requesting…" : "Allow microphone"}
          </button>
        )}
      </section>

      <section
        className="mt-6 space-y-3"
        aria-labelledby="precall-output-heading"
      >
        <h2 id="precall-output-heading" className="text-sm font-medium text-gray-900">
          Speaker
        </h2>
        {isMobile ? (
          <SpeakerEarpieceToggle audioOutput={audioOutput} />
        ) : (
          <AudioOutputPicker audioOutput={audioOutput} />
        )}
        <button
          type="button"
          onClick={() => void playTestSound()}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
        >
          Test sound
        </button>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio ref={testAudioRef} src={PRECALL_TEST_CHIME_SRC} preload="auto" />
      </section>

      {noiseSuppressionAvailable ? (
        <section
          className="mt-6 space-y-2"
          aria-labelledby="precall-noise-suppression-heading"
        >
          <h2
            id="precall-noise-suppression-heading"
            className="text-sm font-medium text-gray-900"
          >
            Background noise
          </h2>
          <label className="flex items-start gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
            <input
              type="checkbox"
              checked={noiseSuppression.enabled}
              onChange={(event) =>
                noiseSuppression.setEnabled(event.target.checked)
              }
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              aria-describedby="precall-noise-suppression-help"
              data-testid="precall-noise-suppression-toggle"
            />
            <span className="flex-1">
              <span className="block font-medium text-gray-900">
                Reduce background noise
              </span>
              <span
                id="precall-noise-suppression-help"
                className="block text-xs text-gray-500"
              >
                Filters out typing, fan, and traffic noise from your mic.
                Turn off in very quiet rooms if you notice extra latency.
              </span>
            </span>
          </label>
        </section>
      ) : null}

      <footer className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={handleJoin}
          className="inline-flex justify-center rounded-md bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700"
        >
          Join call
        </button>
        <button
          type="button"
          onClick={handleSkip}
          className="inline-flex justify-center rounded-md px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Skip mic check
        </button>
      </footer>
    </div>
  );
}
