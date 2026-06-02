"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Sub-batch B · task-video-B8 — manual quality picker for video calls.
 *
 * UI matches the spec in the task draft (T2.16):
 *
 *   Quality: [Auto ▾]
 *     ✓ Auto (recommended)
 *       1080p
 *       720p
 *       480p
 *       ─────────
 *       Audio-only · saves data
 *
 * Defaults to `'auto'`. Couples with E1 (adaptive bitrate) when E1 lands —
 * E1 dynamically clamps; B8 is the user-override surface. For B8 v1
 * (before E1 ships), Auto means "use the connect-time bandwidth profile
 * defaults"; the explicit resolutions force a re-publish at the chosen
 * dimensions.
 *
 * The component is purely **controlled** (`value` + `onChange` props).
 * Persistence to `localStorage["video-quality"]` is the parent's job
 * because (a) the parent already owns the connect-time read for the
 * bandwidth profile and (b) future modalities (voice doesn't need a
 * resolution picker, so this is video-only today) won't share the same
 * key. Same separation pattern as B9's `<VolumeSlider>`.
 *
 * No external dropdown library — Lucide / Radix / shadcn aren't in deps
 * yet, so this ships a custom popover (mirroring B9's slider, A8's
 * `<NetworkBars>` popover, and B5's `<CallDisconnectSplash>`'s
 * dropdown-free button-group). Keyboard accessible: button toggles via
 * Space / Enter, Escape closes, click-outside closes, items are
 * focusable buttons inside `role="listbox"`.
 */

export type QualityOption = "auto" | "1080p" | "720p" | "480p" | "audio-only";

interface PickerOption {
  value: QualityOption;
  label: string;
  /** Sub-label shown beneath the main label (e.g. "saves data"). */
  subLabel?: string;
  /** Suffix shown next to the label (e.g. "(recommended)"). */
  suffix?: string;
  /** When true, render a divider ABOVE this option in the dropdown. */
  dividerAbove?: boolean;
}

const OPTIONS: ReadonlyArray<PickerOption> = [
  { value: "auto", label: "Auto", suffix: "(recommended)" },
  { value: "1080p", label: "1080p" },
  { value: "720p", label: "720p" },
  { value: "480p", label: "480p" },
  {
    value: "audio-only",
    label: "Audio-only",
    subLabel: "saves data",
    dividerAbove: true,
  },
];

/**
 * Type guard for parsed `localStorage` values + URL params + IPC.
 * Exported so the parent can validate before passing in.
 */
export function isQualityOption(value: unknown): value is QualityOption {
  return (
    typeof value === "string" &&
    (value === "auto" ||
      value === "1080p" ||
      value === "720p" ||
      value === "480p" ||
      value === "audio-only")
  );
}

export interface VideoQualityPickerProps {
  /** Current quality. Out-of-range values fall back to `'auto'` on render. */
  value: QualityOption;
  /** Called with the chosen option when the user selects from the dropdown. */
  onChange: (next: QualityOption) => void;
  /**
   * Disable interaction (e.g. while a quality switch is in flight, so
   * the user can't queue a second switch before Twilio finishes
   * republishing). Visually greys out + ignores clicks; layout slot
   * preserved so the controls bar doesn't jump.
   */
  disabled?: boolean;
  /**
   * Optional class layered onto the outer wrapper. Caller's layout
   * concern; the picker renders inline-block by default (matches the
   * controls-bar siblings).
   */
  className?: string;
}

export default function VideoQualityPicker({
  value,
  onChange,
  disabled = false,
  className,
}: VideoQualityPickerProps) {
  const safeValue: QualityOption = isQualityOption(value) ? value : "auto";
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  // Click-outside to close. Only attached while open so the dropdown is
  // a zero-cost mount when collapsed (matches A8's `<NetworkBars>`).
  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  // Escape closes (return focus to the trigger so the user can tab out
  // cleanly).
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const currentOption =
    OPTIONS.find((opt) => opt.value === safeValue) ?? OPTIONS[0];

  return (
    <div
      className={"relative inline-block " + (className ?? "")}
      data-testid="video-quality-picker"
      data-quality={safeValue}
      data-open={open ? "true" : "false"}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        title="Choose video quality"
        className={
          "inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-300 " +
          "bg-white px-3 text-sm font-medium text-gray-700 " +
          "hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 " +
          "focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        <span className="text-xs font-normal text-gray-500">Quality:</span>
        <span>{currentOption.label}</span>
        <svg
          viewBox="0 0 12 12"
          width="10"
          height="10"
          fill="currentColor"
          aria-hidden
          className={
            "transition-transform duration-150 " +
            (open ? "rotate-180" : "rotate-0")
          }
        >
          <path d="M2 4 L6 8 L10 4 Z" />
        </svg>
      </button>
      {open ? (
        <div
          ref={popoverRef}
          id={listboxId}
          role="listbox"
          aria-label="Video quality"
          className={
            "absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden " +
            "rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          }
        >
          {OPTIONS.map((opt) => {
            const isSelected = opt.value === safeValue;
            return (
              <div key={opt.value}>
                {opt.dividerAbove ? (
                  <div
                    className="my-1 border-t border-gray-200"
                    role="separator"
                    aria-hidden
                  />
                ) : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    // Return focus to the trigger so keyboard users
                    // don't lose their place.
                    buttonRef.current?.focus();
                  }}
                  className={
                    "flex w-full items-center justify-between gap-2 px-3 py-1.5 " +
                    "text-left text-sm focus:outline-none " +
                    "focus-visible:bg-gray-50 hover:bg-gray-50 " +
                    (isSelected
                      ? "bg-blue-50 text-blue-900 "
                      : "text-gray-700 ")
                  }
                >
                  <span className="flex flex-col">
                    <span>
                      {opt.label}
                      {opt.suffix ? (
                        <span className="ml-1 text-xs font-normal text-gray-500">
                          {opt.suffix}
                        </span>
                      ) : null}
                    </span>
                    {opt.subLabel ? (
                      <span className="text-xs text-gray-500">
                        {opt.subLabel}
                      </span>
                    ) : null}
                  </span>
                  {isSelected ? (
                    <span
                      aria-hidden
                      className="text-blue-600"
                      style={{ fontSize: 14 }}
                    >
                      ✓
                    </span>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers exported for the parent (`<VideoRoom>`) and any future consumer.
// Centralising the resolution + bitrate maps here keeps the contract in one
// place — voice batch will NOT pick this up (no resolution picker for voice),
// but the maps are the closest thing B8 has to the "voice B4 import-once"
// pattern from B9.
// ---------------------------------------------------------------------------

export interface QualityVideoConstraints {
  width: { ideal: number };
  height: { ideal: number };
  frameRate?: { ideal: number };
}

/**
 * Map an explicit-resolution `QualityOption` to `MediaTrackConstraints`-shaped
 * fields suitable for `createLocalVideoTrack`. Returns `null` for `'auto'`
 * (let Twilio + the camera negotiate; matches today's `width: 640, height:
 * 480` default — see `<VideoRoom>` for the actual default constraints) and
 * for `'audio-only'` (no video track to create).
 *
 * Frame-rate clamp at 24fps for 480p — note #4 in the B8 task draft. High
 * fps × low res produces motion smear that hurts intelligibility more than
 * it helps; 24fps is the cinematic floor.
 */
export function videoConstraintsForQuality(
  quality: QualityOption,
): QualityVideoConstraints | null {
  switch (quality) {
    case "1080p":
      return {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      };
    case "720p":
      return {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      };
    case "480p":
      return {
        width: { ideal: 854 },
        height: { ideal: 480 },
        frameRate: { ideal: 24 },
      };
    case "auto":
    case "audio-only":
    default:
      return null;
  }
}

/**
 * Map a `QualityOption` to the `bandwidthProfile.video.maxSubscriptionBitrate`
 * value (bps) per the B8 task draft §"Apply to remote subscription". Set
 * once at `connect()` time — Twilio Video JS SDK 2.x does NOT support
 * mid-call mutation of the bandwidth profile, so the persisted value at
 * connect time wins for the call's lifetime. Mid-call switches still
 * affect the LOCAL publish (which controls upload bandwidth + indirectly
 * remote rendering decisions).
 */
export function maxSubscriptionBitrateForQuality(quality: QualityOption): number {
  switch (quality) {
    case "1080p":
      return 2_400_000;
    case "720p":
      return 1_200_000;
    case "480p":
      return 600_000;
    case "audio-only":
      return 0;
    case "auto":
    default:
      return 2_400_000;
  }
}
