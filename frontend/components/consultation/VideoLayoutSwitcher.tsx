"use client";

/**
 * Sub-batch B · task-video-B6 — three-way layout switcher for the
 * video controls bar. Speaker (default) / Gallery / Sidebar.
 *
 * Pure controlled component — `value` + `onChange` props; the
 * parent (`<VideoRoom>`) owns the state AND the localStorage
 * persistence (key: `video-layout`, decision §7 default
 * `'speaker'`). Same separation pattern as `<VideoQualityPicker>`
 * (B8) and `<VolumeSlider>` (B9) so the controls bar feels
 * uniform.
 *
 * Why a button-group instead of a dropdown:
 *   - Three options total — a 3-button row is more discoverable
 *     than a popover and matches the existing controls-bar
 *     density (Mute / Camera / Hold / Mirror are all individual
 *     buttons too).
 *   - No external icon library (Lucide / Radix / shadcn aren't
 *     in deps yet — same constraint flagged in B8 + B3 + B4
 *     comments). We ship inline SVG glyphs so the picker is
 *     icon-first (compact in the controls bar) with text-only
 *     accessible names.
 *   - The Sidebar option is hidden on small screens via a
 *     responsive `hidden md:inline-flex` wrapper — Sidebar isn't
 *     useful below `md` (decision §5; the spec calls it out as
 *     "rarely useful on mobile"). Parent ALSO degrades the
 *     rendering when `layout === 'sidebar'` && mobile so a
 *     persisted-from-desktop choice doesn't break the mobile
 *     layout.
 *
 * Active state idiom matches Mute / Camera / Mirror:
 *   - Active layout      → blue tint (the "this is the chosen
 *                          one" signal — distinct from
 *                          amber-for-toggled-off-from-default
 *                          because Layout is multi-state, not
 *                          binary).
 *   - Inactive layouts   → neutral white/gray with hover.
 *
 * Accessibility:
 *   - Each button has an explicit `aria-pressed` so SR users
 *     hear which layout is active.
 *   - `aria-label` provides the full "Switch to {N} layout"
 *     description; visible text is the short label (Gallery /
 *     Speaker / Sidebar) which doubles as the title attr for
 *     hover.
 *   - Icons are `aria-hidden`; the visible label IS the
 *     accessible name.
 *
 * Future work flagged in the task notes:
 *   - Lucide icons (`LayoutGrid`, `Square`, `Columns`) when the
 *     icon library lands — swap the inline SVGs without changing
 *     props.
 *   - Per-clinic admin override (decision §4 of T2 plan) — out
 *     of scope; component stays controlled, parent reads the
 *     override.
 */

export type VideoLayout = "gallery" | "speaker" | "sidebar";

export interface VideoLayoutSwitcherProps {
  value: VideoLayout;
  onChange: (next: VideoLayout) => void;
  /**
   * When true, the entire switcher is hidden. Used by `<VideoRoom>`
   * to suppress the control while on hold (matches Mute / Camera
   * / Mirror / Volume / Quality — when the call is paused, the
   * action cluster collapses to Resume + Leave).
   */
  hidden?: boolean;
}

export function isVideoLayout(value: unknown): value is VideoLayout {
  return value === "gallery" || value === "speaker" || value === "sidebar";
}

interface LayoutOption {
  value: VideoLayout;
  label: string;
  description: string;
  /**
   * Per-option visibility class. Sidebar gets `hidden md:inline-flex`
   * so it disappears on mobile portrait (where it'd degrade anyway —
   * see hook in `<VideoRoom>` that maps Sidebar → Speaker on small
   * screens).
   */
  visibilityClass: string;
}

const OPTIONS: ReadonlyArray<LayoutOption> = [
  {
    value: "gallery",
    label: "Gallery",
    description: "Equal tiles side-by-side",
    visibilityClass: "inline-flex",
  },
  {
    value: "speaker",
    label: "Speaker",
    description: "Counterparty full-canvas with self-view as a corner overlay",
    visibilityClass: "inline-flex",
  },
  {
    value: "sidebar",
    label: "Sidebar",
    // F2 widens availability — mobile landscape now reads as
    // "wide canvas" too (the 70/30 horizontal split makes sense
    // there). `landscape:inline-flex` reveals the option whenever
    // the viewport is in landscape orientation, regardless of
    // breakpoint; desktop continues to surface it via `md:`.
    description:
      "Counterparty main + self-view in a side column (desktop or landscape)",
    visibilityClass: "hidden md:inline-flex landscape:inline-flex",
  },
];

export default function VideoLayoutSwitcher({
  value,
  onChange,
  hidden = false,
}: VideoLayoutSwitcherProps) {
  if (hidden) return null;

  return (
    <div
      role="group"
      aria-label="Video layout"
      className="inline-flex h-9 items-center overflow-hidden rounded-md border border-gray-300 bg-white text-sm"
    >
      {OPTIONS.map((option, index) => {
        const isActive = option.value === value;
        const isFirst = index === 0;
        const isLast = index === OPTIONS.length - 1;
        const borderClass = isFirst ? "" : "border-l border-gray-300";
        const radiusClass = [
          isFirst ? "rounded-l-md" : "",
          isLast ? "rounded-r-md" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const stateClass = isActive
          ? "bg-blue-50 text-blue-900"
          : "bg-white text-gray-700 hover:bg-gray-50";
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={isActive}
            aria-label={`Switch to ${option.label} layout — ${option.description}`}
            title={option.description}
            className={
              option.visibilityClass +
              " " +
              borderClass +
              " " +
              radiusClass +
              " items-center gap-1.5 px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 " +
              stateClass
            }
          >
            <LayoutGlyph layout={option.value} />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Inline SVG glyphs — small (12×12) so the button stays compact
 * next to text. Replace with Lucide (`LayoutGrid`, `Square`,
 * `Columns`) when the library lands; component contract stays
 * the same.
 */
function LayoutGlyph({ layout }: { layout: VideoLayout }) {
  if (layout === "gallery") {
    return (
      <svg
        viewBox="0 0 12 12"
        width={12}
        height={12}
        aria-hidden
        focusable="false"
      >
        <rect x={0.5} y={0.5} width={5} height={11} rx={1} fill="none" stroke="currentColor" strokeWidth={1} />
        <rect x={6.5} y={0.5} width={5} height={11} rx={1} fill="none" stroke="currentColor" strokeWidth={1} />
      </svg>
    );
  }
  if (layout === "sidebar") {
    return (
      <svg
        viewBox="0 0 12 12"
        width={12}
        height={12}
        aria-hidden
        focusable="false"
      >
        <rect x={0.5} y={0.5} width={7.5} height={11} rx={1} fill="none" stroke="currentColor" strokeWidth={1} />
        <rect x={9} y={0.5} width={2.5} height={11} rx={1} fill="none" stroke="currentColor" strokeWidth={1} />
      </svg>
    );
  }
  // speaker
  return (
    <svg
      viewBox="0 0 12 12"
      width={12}
      height={12}
      aria-hidden
      focusable="false"
    >
      <rect x={0.5} y={0.5} width={11} height={11} rx={1} fill="none" stroke="currentColor" strokeWidth={1} />
      <rect x={7.5} y={7.5} width={3.5} height={3.5} rx={0.5} fill="currentColor" />
    </svg>
  );
}
