"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { BackgroundPreference } from "@/lib/video/virtual-background";

/**
 * Sub-batch C · task-video-C2 — virtual background picker.
 *
 *   Background:
 *   [Off] [Blur (light)] [Blur (heavy)] [Image: clinic*] [Image: neutral*]
 *
 * `*` Image options are TYPED in the union (`'image:clinic'` /
 * `'image:neutral'`) but **hidden** in v1 — designer-supplied JPGs
 * are not yet in `frontend/public/video-backgrounds/`. When assets
 * land, set `IMAGE_OPTIONS_ENABLED = true` (or wire it to a feature
 * flag) and the rendering loop will surface them; the consuming
 * `<VideoRoom>` already routes the preference through the lib.
 *
 * Decisions reused from earlier sub-batch B work:
 *   - Button group (NOT dropdown) so the active state is always
 *     visible — same precedent as `<VideoLayoutSwitcher>` (B6) and
 *     `<VideoQualityPicker>` (B8).
 *   - No icon library (Lucide not in deps yet) — inline SVG glyphs
 *     keep the bundle lean. Same precedent as B6 / B7 / B8.
 *   - Disabled state gates the user during the in-flight
 *     `addProcessor` swap (Twilio's `loadModel()` is async + can
 *     take 1-2 seconds on first apply); the parent owns the busy
 *     state and surfaces it via the `disabled` prop. Same pattern
 *     as `<VideoQualityPicker>`'s `qualitySwitchInFlight`.
 *
 * The picker is **controlled** — the parent owns the
 * `BackgroundPreference` state and is responsible for persistence
 * (`localStorage['video-bg-preference']`) and applying the change
 * to the active `LocalVideoTrack`. This component is dumb on
 * purpose so it can be lifted into the future precall lobby (B1)
 * if "preview your background before joining" lands in v1.5.
 */

// Annotated as `boolean` (not `false` literal) so TypeScript
// doesn't narrow the gate to "always false" and dead-code-eliminate
// the image rendering branch — the gate flips to `true` when the
// designer-supplied JPGs land in `frontend/public/video-backgrounds/`.
const IMAGE_OPTIONS_ENABLED: boolean = false;

interface OptionConfig {
  value: BackgroundPreference;
  label: string;
  ariaLabel: string;
  icon: "off" | "blur-light" | "blur-heavy" | "image";
}

const OPTIONS: ReadonlyArray<OptionConfig> = [
  {
    value: "off",
    label: "Off",
    ariaLabel: "Background off (raw camera)",
    icon: "off",
  },
  {
    value: "blur-light",
    label: "Blur",
    ariaLabel: "Light background blur",
    icon: "blur-light",
  },
  {
    value: "blur-heavy",
    label: "Strong blur",
    ariaLabel: "Strong background blur",
    icon: "blur-heavy",
  },
  {
    value: "image:clinic",
    label: "Clinic",
    ariaLabel: "Clinic-branded backdrop",
    icon: "image",
  },
  {
    value: "image:neutral",
    label: "Neutral",
    ariaLabel: "Neutral solid backdrop",
    icon: "image",
  },
];

function OptionGlyph({ icon }: { icon: OptionConfig["icon"] }) {
  // Inline SVG glyphs (16x16) so the picker doesn't pull in an
  // icon library. Stroke-based to inherit `currentColor` from
  // the surrounding button.
  switch (icon) {
    case "off":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <line x1="6" y1="18" x2="18" y2="6" />
        </svg>
      );
    case "blur-light":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="12" r="7" strokeOpacity="0.5" />
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
        </svg>
      );
    case "blur-heavy":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="12" r="7" strokeOpacity="0.6" />
          <circle cx="12" cy="12" r="10" strokeOpacity="0.4" />
        </svg>
      );
    case "image":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    default:
      return null;
  }
}

export interface VirtualBackgroundPickerProps {
  /** The current background preference. Controlled by the parent. */
  value: BackgroundPreference;
  /** Called when the user picks a new option. */
  onChange: (next: BackgroundPreference) => void;
  /**
   * Disable the picker while the parent's `addProcessor` swap is
   * in flight. The first switch from `'off'` to `'blur-*'` includes
   * a 1-2 second TFLite model load; subsequent toggles between the
   * two blur radii are instant (cached). The parent should set
   * `disabled` only during the inflight window.
   */
  disabled?: boolean;
}

export default function VirtualBackgroundPicker({
  value,
  onChange,
  disabled = false,
}: VirtualBackgroundPickerProps) {
  // The "Background:" label associates the group with the buttons
  // for screen-reader semantics. `useId` keeps the relationship
  // stable across renders without colliding when multiple pickers
  // mount on the same page (unlikely, but cheap).
  const groupLabelId = useId();

  // Track whether the user has interacted with the picker since
  // mount so we can skip emitting an immediate `onChange` on first
  // hydration (the parent's `useEffect` is responsible for the
  // initial apply). Defensive — without this, a fast re-render
  // could fire `onChange(value)` redundantly. Same pattern as the
  // existing `<VideoLayoutSwitcher>` (B6).
  const [hasInteracted, setHasInteracted] = useState(false);
  const lastEmittedRef = useRef<BackgroundPreference | null>(null);

  // Reset `lastEmittedRef` whenever the controlled `value` changes
  // from the parent (e.g. persisted hydration), so a subsequent
  // user click always fires `onChange` even if it's "the same"
  // as the controlled value at the moment of click.
  useEffect(() => {
    lastEmittedRef.current = value;
  }, [value]);

  const handleSelect = (next: BackgroundPreference) => {
    setHasInteracted(true);
    if (next === lastEmittedRef.current && hasInteracted) {
      // Re-clicking the active button is a no-op (matches the
      // B6 / B8 pickers' behavior). Avoids redundant
      // `addProcessor` calls if the user double-clicks.
      return;
    }
    lastEmittedRef.current = next;
    onChange(next);
  };

  const visibleOptions = OPTIONS.filter((opt) => {
    if (opt.value === "image:clinic" || opt.value === "image:neutral") {
      return IMAGE_OPTIONS_ENABLED;
    }
    return true;
  });

  return (
    <div
      role="group"
      aria-labelledby={groupLabelId}
      className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white p-0.5"
    >
      <span
        id={groupLabelId}
        className="px-2 py-1 text-xs font-medium text-gray-500"
      >
        Background
      </span>
      {visibleOptions.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleSelect(opt.value)}
            disabled={disabled}
            aria-label={opt.ariaLabel}
            aria-pressed={isActive}
            title={opt.ariaLabel}
            className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
              isActive
                ? "bg-blue-100 text-blue-700"
                : "text-gray-700 hover:bg-gray-100"
            } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <OptionGlyph icon={opt.icon} />
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
