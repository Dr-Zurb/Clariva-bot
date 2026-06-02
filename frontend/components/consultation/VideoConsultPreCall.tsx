"use client";

/**
 * Sub-batch A · task-video-A7 — pre-call camera + mic check.
 *
 * Shipped in front of `<VideoRoom>` on the patient join path. Lets the
 * user verify their camera + mic before going live with the doctor;
 * the first 30 seconds of every consult today is "I can't see you" /
 * "Is your mic on?" — this screen catches that.
 *
 * v1 scope (A7):
 *   - Live selfie preview (own camera feed; mirrored, matching the
 *     in-call A6 default).
 *   - Mic level visualizer (10 bars; pulses with input audio).
 *   - Camera + mic dropdowns (`enumerateDevices` filtered).
 *   - "Continue" CTA (passes chosen device IDs to `<VideoRoom>`).
 *   - "Skip mic check" link (proceeds with `chosenMicId = null`,
 *     useful when the user denied mic permission).
 *   - Per-device persistence of last chosen camera + mic in
 *     localStorage; restored on mount.
 *
 * B1 update (2026-05-01): the temporary `sessionMeta` chip placeholder
 * was removed — the join page now composes the proper
 * `<VideoConsultLobbyHeader>` + `<VideoConsultLobbyCountdown>` ABOVE
 * this component. This file no longer touches branding / scheduling.
 *
 * Out of scope (B1 lobby chrome owns):
 *   - Practice / clinic branding.
 *   - Appointment countdown.
 *   - Network-quality test (E1 / E6 territory; A8 surfaces in-call).
 *
 * Permission decision (Decision §4 from the plan):
 *   - Both granted → live preview + bars + dropdowns + Continue.
 *   - Mic-only granted (camera denied) → preview shows "Camera
 *     blocked" placeholder; Continue still works (user joins
 *     audio-only by SOP).
 *   - Camera-only granted (mic denied) → preview works; bars stay
 *     dead; Continue passes `chosenMicId = null` (Twilio defaults to
 *     no mic) AND shows the inline "Mic blocked" hint.
 *   - Both denied → "Allow camera and mic to start the consult" + a
 *     retry button.
 *
 * SSR / Next.js notes:
 *   - All MediaDevices / AudioContext / `localStorage` access is
 *     guarded by `typeof window !== "undefined"`.
 *   - `navigator.mediaDevices` access is wrapped in try/catch (some
 *     locked-down browsers throw rather than return undefined).
 *
 * @see task-video-A7-precall-camera-mic-check.md for the full spec.
 * @see task-video-B1-precall-lobby.md (consumer — wraps this in branding).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useCameraDevices,
  type MediaDeviceInfoLite,
} from "@/hooks/useCameraDevices";
import { createMicMeter, type MicMeter } from "@/lib/audio/mic-meter";

const CAMERA_STORAGE_KEY = "video-precall-camera-id";
const MIC_STORAGE_KEY = "video-precall-mic-id";
const MIC_BAR_COUNT = 10;

type Permission = "pending" | "granted" | "denied";

export interface VideoConsultPreCallProps {
  /**
   * Fired when the user clicks Continue. The page transitions to
   * `<VideoRoom>` with these device IDs threaded into Twilio's
   * `createLocalTracks({ audio: { deviceId }, video: { deviceId } })`.
   * `null` for either ID means "let Twilio pick the default".
   */
  onContinue: (chosen: {
    cameraId: string | null;
    micId: string | null;
  }) => void;
  /**
   * Fired when the user clicks "Skip mic check" — same as Continue
   * but with `micId = null` regardless of any mic dropdown selection.
   * Used when the user can't / won't grant mic permission.
   */
  onSkipMic: (chosen: { cameraId: string | null }) => void;
}

export default function VideoConsultPreCall({
  onContinue,
  onSkipMic,
}: VideoConsultPreCallProps) {
  // ------------------------------------------------------------------
  // Permission + stream state
  //
  // We hold a SINGLE `MediaStream` for the live preview — re-acquired
  // when the user changes camera. The audio track is also reused
  // by the mic meter (no separate getUserMedia call for the bars).
  // ------------------------------------------------------------------
  const [cameraPermission, setCameraPermission] =
    useState<Permission>("pending");
  const [micPermission, setMicPermission] = useState<Permission>("pending");
  const [stream, setStream] = useState<MediaStream | null>(null);
  // Permission acquisition is in flight — drives the "Requesting
  // camera and mic access…" copy + disables the buttons.
  const [acquiring, setAcquiring] = useState(true);

  // ------------------------------------------------------------------
  // Device selection state
  // ------------------------------------------------------------------
  const { cameras, mics, enumerated, refresh: refreshDevices } =
    useCameraDevices();
  const [chosenCameraId, setChosenCameraId] = useState<string | null>(null);
  const [chosenMicId, setChosenMicId] = useState<string | null>(null);

  // Restore chosen IDs from localStorage on first mount. The mount
  // effect fires once; later effects only update from dropdown
  // changes. SSR-safe via `typeof window` guard.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const c = window.localStorage.getItem(CAMERA_STORAGE_KEY);
      const m = window.localStorage.getItem(MIC_STORAGE_KEY);
      if (c) setChosenCameraId(c);
      if (m) setChosenMicId(m);
    } catch {
      /* localStorage may be locked down — fall through to defaults */
    }
  }, []);

  // ------------------------------------------------------------------
  // Live preview — the `<video>` ref. Attached imperatively whenever
  // the stream changes.
  // ------------------------------------------------------------------
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // ------------------------------------------------------------------
  // Mic meter — `MicMeter` instance + visualized amplitude state.
  // Recreated whenever the audio track changes (camera swap implies
  // a fresh stream → fresh audio track → fresh meter).
  // ------------------------------------------------------------------
  const meterRef = useRef<MicMeter | null>(null);
  const [amplitude, setAmplitude] = useState(0);

  // ------------------------------------------------------------------
  // Acquire (or re-acquire) the camera + mic stream. Called on:
  //   - First mount (with no constraints; lets the browser pick).
  //   - Camera dropdown change (constraint = chosen camera ID).
  //   - Mic dropdown change (constraint = chosen mic ID).
  //   - Retry button after a denial (re-prompts the browser).
  //
  // The previous stream is stopped before the new one is acquired so
  // the camera light goes off briefly during a swap (cheap visual
  // confirmation that the swap actually happened).
  // ------------------------------------------------------------------
  const acquireStream = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setCameraPermission("denied");
      setMicPermission("denied");
      setAcquiring(false);
      return;
    }
    setAcquiring(true);

    // Build constraints from current selections; `undefined` for an
    // unset deviceId lets the browser pick the default. `exact`
    // would throw OverconstrainedError if the device is gone (USB
    // unplug between renders); we use the looser `ideal` form.
    const videoConstraint: MediaTrackConstraints | boolean = chosenCameraId
      ? { deviceId: { ideal: chosenCameraId } }
      : true;
    const audioConstraint: MediaTrackConstraints | boolean = chosenMicId
      ? { deviceId: { ideal: chosenMicId } }
      : true;

    // Stop the previous stream BEFORE acquiring the new one — leaving
    // the old camera "active" while a new one is acquired confuses
    // some browsers and shows the "camera in use" red indicator
    // doubled.
    setStream((prev) => {
      prev?.getTracks().forEach((t) => t.stop());
      return null;
    });
    if (meterRef.current) {
      meterRef.current.stop();
      meterRef.current = null;
    }

    let nextStream: MediaStream | null = null;
    let cameraGranted = false;
    let micGranted = false;

    // First attempt: both camera + mic. Most common path; both
    // permissions resolved in one prompt.
    try {
      nextStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: audioConstraint,
      });
      cameraGranted = nextStream.getVideoTracks().length > 0;
      micGranted = nextStream.getAudioTracks().length > 0;
    } catch {
      // Combined request failed — try each independently so we can
      // distinguish camera-only / mic-only / total-denial.
      try {
        const videoOnly = await navigator.mediaDevices.getUserMedia({
          video: videoConstraint,
          audio: false,
        });
        nextStream = videoOnly;
        cameraGranted = true;
      } catch {
        cameraGranted = false;
      }
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: audioConstraint,
        });
        if (nextStream) {
          audioOnly.getAudioTracks().forEach((t) => nextStream!.addTrack(t));
        } else {
          nextStream = audioOnly;
        }
        micGranted = true;
      } catch {
        micGranted = false;
      }
    }

    setCameraPermission(cameraGranted ? "granted" : "denied");
    setMicPermission(micGranted ? "granted" : "denied");
    setStream(nextStream);
    setAcquiring(false);

    // iOS Safari label-refresh quirk: enumerateDevices returns empty
    // labels until at least one getUserMedia grant resolves. Refresh
    // after each acquire so the dropdowns show real names.
    void refreshDevices();
  }, [chosenCameraId, chosenMicId, refreshDevices]);

  // First-mount acquisition — runs exactly once. The dependency on
  // `acquireStream` is intentionally suppressed because subsequent
  // re-acquires are triggered by the explicit dropdown effects below.
  useEffect(() => {
    void acquireStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-acquire whenever the chosen camera OR mic changes (after the
  // first mount). Mounting `acquireStream` directly would rerun on
  // every render due to its identity changes; the explicit deps make
  // the intent clear.
  const previouslyChosenCameraRef = useRef<string | null>(null);
  const previouslyChosenMicRef = useRef<string | null>(null);
  useEffect(() => {
    // Skip the first run — handled by the mount effect above.
    if (
      previouslyChosenCameraRef.current === null &&
      previouslyChosenMicRef.current === null &&
      chosenCameraId === null &&
      chosenMicId === null
    ) {
      return;
    }
    if (
      previouslyChosenCameraRef.current === chosenCameraId &&
      previouslyChosenMicRef.current === chosenMicId
    ) {
      return;
    }
    previouslyChosenCameraRef.current = chosenCameraId;
    previouslyChosenMicRef.current = chosenMicId;
    void acquireStream();
  }, [chosenCameraId, chosenMicId, acquireStream]);

  // Attach the live preview whenever the stream changes.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!stream) {
      video.srcObject = null;
      return;
    }
    video.srcObject = stream;
    video.play().catch(() => {
      // iOS Safari may reject autoplay until user gesture; the
      // dropdown click counts as a gesture, so subsequent renders
      // resolve cleanly.
    });
  }, [stream]);

  // Wire up the mic meter to the (re-acquired) audio track.
  useEffect(() => {
    if (!stream) {
      setAmplitude(0);
      return;
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setAmplitude(0);
      return;
    }
    const meter = createMicMeter(stream);
    meterRef.current = meter;
    meter.start((value) => setAmplitude(value));
    return () => {
      meter.stop();
      if (meterRef.current === meter) meterRef.current = null;
    };
  }, [stream]);

  // Cleanup — full teardown of stream + meter on unmount. Critical
  // for the camera light to go off when the user clicks Continue
  // and the page transitions to `<VideoRoom>` (otherwise both this
  // component AND the room hold camera handles for ~1s).
  useEffect(() => {
    return () => {
      if (meterRef.current) {
        meterRef.current.stop();
        meterRef.current = null;
      }
      // Snapshot the stream at unmount; reading state in the cleanup
      // closure would race with the latest setStream call.
      setStream((current) => {
        current?.getTracks().forEach((t) => t.stop());
        return null;
      });
    };
  }, []);

  // ------------------------------------------------------------------
  // Selection handlers — write through to localStorage on each change
  // so the choice survives a refresh / rejoin even if the user never
  // hits Continue (E.g. they close the tab mid-check; next visit
  // restores their last camera).
  // ------------------------------------------------------------------
  const persistAndChooseCamera = useCallback((id: string) => {
    setChosenCameraId(id);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(CAMERA_STORAGE_KEY, id);
      } catch {
        /* best-effort */
      }
    }
  }, []);

  const persistAndChooseMic = useCallback((id: string) => {
    setChosenMicId(id);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(MIC_STORAGE_KEY, id);
      } catch {
        /* best-effort */
      }
    }
  }, []);

  // ------------------------------------------------------------------
  // Continue / Skip — both stop the local stream BEFORE handing
  // control to the parent so the camera light goes off cleanly. The
  // parent re-creates a fresh stream inside `<VideoRoom>` via
  // Twilio's `createLocalTracks` (with the chosen device IDs).
  // ------------------------------------------------------------------
  const tearDownAndProceed = useCallback(
    (cb: () => void) => {
      if (meterRef.current) {
        meterRef.current.stop();
        meterRef.current = null;
      }
      stream?.getTracks().forEach((t) => t.stop());
      setStream(null);
      cb();
    },
    [stream],
  );

  const handleContinue = useCallback(() => {
    tearDownAndProceed(() =>
      onContinue({ cameraId: chosenCameraId, micId: chosenMicId }),
    );
  }, [tearDownAndProceed, onContinue, chosenCameraId, chosenMicId]);

  const handleSkipMic = useCallback(() => {
    tearDownAndProceed(() => onSkipMic({ cameraId: chosenCameraId }));
  }, [tearDownAndProceed, onSkipMic, chosenCameraId]);

  // ------------------------------------------------------------------
  // Render — see component header for the layout spec.
  // ------------------------------------------------------------------
  const totalDenial =
    cameraPermission === "denied" && micPermission === "denied";
  // Continue is enabled when at least the camera OR the user has
  // explicitly chosen "Skip mic check". Patient can join camera-only
  // (mic denied + camera granted) — Decision §4.
  const continueEnabled = !acquiring && cameraPermission === "granted";

  // 10-bar visualizer — each bar's "lit" threshold is i/10 of the
  // amplitude; bars below the threshold render grey; bars at-or-below
  // render the active color.
  const litBars = Math.round(amplitude * MIC_BAR_COUNT);

  const dropdownOption = (d: MediaDeviceInfoLite, idx: number) => {
    // iOS quirk: labels can be empty until first grant. Show the
    // index as a fallback so the dropdown isn't a sea of blanks.
    const label = d.label || `${d.kind === "videoinput" ? "Camera" : "Microphone"} ${idx + 1}`;
    return (
      <option key={d.deviceId} value={d.deviceId}>
        {label}
      </option>
    );
  };

  // Memoize lists so the <select>s don't re-render every amplitude tick.
  const cameraOptions = useMemo(
    () => cameras.map((d, i) => dropdownOption(d, i)),
    [cameras],
  );
  const micOptions = useMemo(
    () => mics.map((d, i) => dropdownOption(d, i)),
    [mics],
  );

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-stretch gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-center text-base font-semibold text-gray-900">
        Get ready for your call
      </h2>
      <p className="text-center text-sm text-gray-600">
        Make sure your camera and microphone work, then continue.
      </p>

      {/* Live preview — black canvas with camera-off / denied placeholders. */}
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-gray-900">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          // Mirror by default, matching the in-call A6 default. Skip
          // the mirror if the camera is unavailable — the placeholder
          // shouldn't visually flip.
          className={
            "h-full w-full object-cover " +
            (cameraPermission === "granted" ? "scale-x-[-1]" : "opacity-0")
          }
        />
        {acquiring && cameraPermission === "pending" ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-300">
            Requesting camera and microphone access…
          </div>
        ) : null}
        {!acquiring && cameraPermission === "denied" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-sm text-gray-200">
            <p>
              Camera blocked. Allow camera access in your browser to show your
              video.
            </p>
            {!totalDenial ? (
              <p className="text-xs text-gray-400">
                You can still continue with audio only.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Mic meter — 10 bars, grey when no signal / mic denied. */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
          <span>Microphone</span>
          {micPermission === "denied" ? (
            <span className="text-amber-700">Mic blocked</span>
          ) : null}
        </div>
        <div
          className="flex items-end gap-1"
          aria-label={`Microphone level: ${litBars} of ${MIC_BAR_COUNT}`}
        >
          {Array.from({ length: MIC_BAR_COUNT }).map((_, i) => {
            const isLit = i < litBars;
            // Color ramp: bars 1-4 green, 5-7 yellow, 8-10 red.
            // Anything > 7 means the user is shouting / very close to
            // the mic — the visual cue prompts them to back off.
            const color = isLit
              ? i < 4
                ? "bg-emerald-500"
                : i < 7
                  ? "bg-yellow-500"
                  : "bg-red-500"
              : "bg-gray-200";
            const height = `${0.5 + i * 0.15}rem`;
            return (
              <span
                key={i}
                className={"w-2 rounded-sm transition-colors duration-75 " + color}
                style={{ height }}
                aria-hidden
              />
            );
          })}
        </div>
      </div>

      {/* Dropdowns. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          <span className="font-medium">Camera</span>
          <select
            value={chosenCameraId ?? ""}
            onChange={(e) => persistAndChooseCamera(e.target.value)}
            disabled={!enumerated || cameraPermission !== "granted"}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50"
          >
            {chosenCameraId === null ? (
              <option value="">
                {cameras.length === 0 && enumerated
                  ? "No camera detected"
                  : "Default camera"}
              </option>
            ) : null}
            {cameraOptions}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-700">
          <span className="font-medium">Microphone</span>
          <select
            value={chosenMicId ?? ""}
            onChange={(e) => persistAndChooseMic(e.target.value)}
            disabled={!enumerated || micPermission !== "granted"}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50"
          >
            {chosenMicId === null ? (
              <option value="">
                {mics.length === 0 && enumerated
                  ? "No microphone detected"
                  : "Default microphone"}
              </option>
            ) : null}
            {micOptions}
          </select>
        </label>
      </div>

      {/* Total-denial recovery — re-prompt path. */}
      {totalDenial ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-center">
          <p className="text-sm text-red-800">
            Allow camera and microphone access in your browser to start the
            consult.
          </p>
          <button
            type="button"
            onClick={() => void acquireStream()}
            className="mt-2 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            I&apos;ve granted access — retry
          </button>
        </div>
      ) : null}

      {/* CTAs. */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleSkipMic}
          disabled={acquiring}
          className="text-sm text-gray-600 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          Skip mic check
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!continueEnabled}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {acquiring ? "Preparing…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
