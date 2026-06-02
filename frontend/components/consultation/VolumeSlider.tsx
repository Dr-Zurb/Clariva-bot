"use client";

import { useCallback, useRef, type ChangeEvent } from "react";

/**
 * Sub-batch B · task-video-B9 (with task-voice-B4) — controlled volume
 * slider with mute toggle and ×1.5 boost band.
 *
 * Range:   0 - 150 (integer).
 * Tick:    100 marks "OS-normal" (the slider's neutral point).
 * Boost:   values > 100 dim the speaker icon to amber + add a faint
 *          glow on the thumb so the boost band reads as "intentionally
 *          loud" rather than "broken volume control".
 *
 * The slider is purely **controlled** — `value` + `onChange` come from
 * the parent. Persistence to `localStorage` is the parent's job
 * because the storage key differs per modality (`video-volume` for
 * video, `voice-volume-percent` for voice). Keeping the slider stateless
 * means voice B4 (when it lands) can mount this component verbatim
 * with its own storage key without any internal-state collision.
 *
 * Mute toggle:
 *   - Speaker icon to the LEFT of the slider.
 *   - Click → set value to 0.
 *   - Click again (when at 0) → restore the LAST non-zero value
 *     (defaults to 100 if the user never moved off 0). The "last
 *     non-zero" memory is internal to the slider — the parent only
 *     sees the final applied value. Stays in a ref so the click
 *     handler can read it without becoming a re-render dependency.
 *
 * Accessibility:
 *   - The slider is a native `<input type="range">` — keyboard arrows
 *     adjust the value (1-step), Page-Up / Page-Down jump by 10
 *     (default browser behavior), Home / End snap to min / max.
 *   - The mute button reports `aria-pressed` so SR users hear
 *     "Mute, button, pressed" when at 0.
 *   - The slider's `aria-valuetext` reads the percent + an explicit
 *     "boost" suffix when in the boost band.
 *
 * Cross-modality consistency (Note #4 in the B9 task draft): the
 * visual is identical to whatever voice B4 will mount. By making
 * voice import this same component, we get free consistency without
 * extra theming code.
 */

export interface VolumeSliderProps {
  /** Current volume, 0-150. Out-of-range values are clamped on render. */
  value: number;
  /** Called with the new value (0-150) on every drag tick + mute toggle. */
  onChange: (value: number) => void;
  /**
   * Optional class layered onto the outer wrapper for positioning.
   * The component itself renders inline-flex; positioning is the
   * caller's job (the controls bar passes nothing; an Options menu
   * mount might pass `w-full`).
   */
  className?: string;
  /**
   * Optional aria-label override for the slider; defaults to
   * `"Remote audio volume"`. The mute button always reads
   * "Mute" / "Unmute" — that's not configurable.
   */
  ariaLabel?: string;
  /**
   * Disable interaction (e.g. before the remote audio track has been
   * subscribed). The slider still renders but greys out and ignores
   * input — preserves the layout slot so the controls bar doesn't
   * jump when the audio track lands ~1s after `connected`.
   */
  disabled?: boolean;
}

const MIN = 0;
const MAX = 150;
const NEUTRAL = 100;
// Default fallback when the user clicks Mute → Unmute without ever
// having moved the slider off zero.
const DEFAULT_RESTORE = 100;

function clamp(value: number): number {
  if (Number.isNaN(value)) return NEUTRAL;
  if (value < MIN) return MIN;
  if (value > MAX) return MAX;
  return Math.round(value);
}

export default function VolumeSlider({
  value,
  onChange,
  className,
  ariaLabel = "Remote audio volume",
  disabled = false,
}: VolumeSliderProps) {
  const safeValue = clamp(value);
  // Track the last non-zero value the user landed on, so a Mute →
  // Unmute round-trip restores the right level. Updated on every
  // change — when the parent reflows with a non-zero value (slider
  // drag, parent restored from localStorage, …), capture it.
  const lastNonZeroRef = useRef<number>(safeValue || DEFAULT_RESTORE);
  if (safeValue > 0 && lastNonZeroRef.current !== safeValue) {
    lastNonZeroRef.current = safeValue;
  }

  const isMuted = safeValue === 0;
  const isBoosted = safeValue > NEUTRAL;
  const percentLabel = `${safeValue}%`;
  const ariaValueText = isBoosted
    ? `${safeValue}% (boost)`
    : isMuted
      ? "Muted"
      : percentLabel;

  const handleSliderChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = clamp(Number(event.target.value));
      onChange(next);
    },
    [onChange],
  );

  const handleMuteClick = useCallback(() => {
    if (disabled) return;
    if (isMuted) {
      // Restore the last non-zero level. If the slider was sitting at
      // 0 from page-load (user never moved it), fall back to 100.
      onChange(lastNonZeroRef.current || DEFAULT_RESTORE);
    } else {
      onChange(0);
    }
  }, [disabled, isMuted, onChange]);

  // Speaker icon — three glyph variants. We render via inline SVG
  // (no Lucide / heroicons in deps yet). 16x16 stroked icons keep
  // the visual weight close to the existing `<NetworkBars>` icon.
  const speakerIcon = (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Speaker body — same in all states. */}
      <path d="M2.5 6 v4 H5 L9 13 V3 L5 6 Z" />
      {isMuted ? (
        // Mute: an "X" through the right side of the speaker.
        <>
          <path d="M11 6 L14 10" />
          <path d="M14 6 L11 10" />
        </>
      ) : isBoosted ? (
        // Boost: three sound-wave arcs (extra "loud" arc).
        <>
          <path d="M11 7 Q11.8 8 11 9" />
          <path d="M12.5 5.5 Q14 8 12.5 10.5" />
          <path d="M14 4 Q16 8 14 12" />
        </>
      ) : (
        // Normal: two sound-wave arcs.
        <>
          <path d="M11 7 Q11.8 8 11 9" />
          <path d="M12.5 5.5 Q14 8 12.5 10.5" />
        </>
      )}
    </svg>
  );

  // Slider thumb glow when in the boost band. Inline style because
  // Tailwind doesn't ship a `[&::-webkit-slider-thumb]:shadow-amber`
  // arbitrary variant out of the box and we don't want to add one
  // for a single use case.
  const sliderClassName =
    "h-1 w-32 cursor-pointer appearance-none rounded-full bg-gray-300 " +
    "[&::-webkit-slider-thumb]:appearance-none " +
    "[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 " +
    "[&::-webkit-slider-thumb]:rounded-full " +
    "[&::-webkit-slider-thumb]:bg-blue-600 " +
    "[&::-webkit-slider-thumb]:cursor-pointer " +
    "[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 " +
    "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-600 " +
    "[&::-moz-range-thumb]:border-0 " +
    (isBoosted
      ? "[&::-webkit-slider-thumb]:bg-amber-500 [&::-moz-range-thumb]:bg-amber-500 "
      : "") +
    (disabled ? "opacity-50 " : "");

  return (
    <div
      className={
        "inline-flex items-center gap-2 rounded-md border border-gray-200 " +
        "bg-white px-2 py-1.5 " +
        (className ?? "")
      }
      data-testid="volume-slider"
      data-volume={safeValue}
      data-muted={isMuted ? "true" : "false"}
      data-boosted={isBoosted ? "true" : "false"}
    >
      <button
        type="button"
        onClick={handleMuteClick}
        disabled={disabled}
        aria-pressed={isMuted}
        aria-label={isMuted ? "Unmute" : "Mute"}
        title={isMuted ? "Unmute" : "Mute"}
        className={
          "flex h-6 w-6 items-center justify-center rounded text-gray-700 " +
          "hover:bg-gray-100 focus:outline-none focus-visible:ring-2 " +
          "focus-visible:ring-blue-400 disabled:cursor-not-allowed " +
          "disabled:opacity-50 " +
          (isBoosted && !isMuted ? "text-amber-600 " : "") +
          (isMuted ? "text-gray-400 " : "")
        }
      >
        {speakerIcon}
      </button>
      <input
        type="range"
        min={MIN}
        max={MAX}
        step={1}
        value={safeValue}
        onChange={handleSliderChange}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={safeValue}
        aria-valuetext={ariaValueText}
        // Inline style for the thumb glow (see comment on
        // `sliderClassName`). The shadow only renders in the boost
        // band; falls back to none below 100.
        style={
          isBoosted
            ? {
                accentColor: "rgb(245 158 11)", // tailwind amber-500
              }
            : undefined
        }
        className={sliderClassName}
      />
      <span
        className={
          "min-w-[2.25rem] text-right text-[11px] font-mono tabular-nums " +
          (isBoosted ? "text-amber-700 " : "text-gray-600 ") +
          (isMuted ? "text-gray-400 " : "")
        }
        aria-hidden
      >
        {percentLabel}
      </span>
    </div>
  );
}
