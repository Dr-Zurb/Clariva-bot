"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { networkLevelToBars } from "@/hooks/useNetworkQuality";

/**
 * Sub-batch A · task-video-A8 — 4-bar network-quality icon with an
 * optional click-to-toggle stats popover.
 *
 * The bars render as a horizontal row of 4 increasing-height pills:
 *   ▁ ▃ ▅ █  (active = colored, inactive = grey)
 * Coloring follows the cell-signal convention (1-2 = red / 3 = yellow
 * / 4 = green). A `tooltip` slot — accepts any `ReactNode` — opens in
 * a small popover anchored below the bars when the user clicks (or
 * keyboard-activates) the icon. Click-outside closes; Escape closes.
 *
 * Why a custom popover (not radix / shadcn): neither is in the
 * frontend deps yet (see `package.json`). For a single tooltip use
 * case it's not worth pulling in a primitive; this in-file popover
 * is ~30 LOC and keeps the dep surface flat. When a primitive
 * eventually lands (likely via a B-batch component refactor), this
 * popover swaps for it and `<NetworkBars>` keeps its public API.
 */
export interface NetworkBarsProps {
  /**
   * Twilio's network quality level (0–5, or `null` until first
   * measurement). The component handles the level → bars mapping
   * via `networkLevelToBars`.
   */
  level: number | null;
  /**
   * Optional accessible label prefix for screen readers. The component
   * appends "1 of 4 bars" etc. so the screen reader hears e.g.
   * "Your network: 3 of 4 bars". Defaults to `"Network"`.
   */
  label?: string;
  /**
   * Optional content rendered inside a popover anchored below the
   * bars. When omitted, the bars are static (no click target). When
   * present, the bars become a click target that toggles the popover.
   */
  tooltip?: ReactNode;
  /**
   * Optional class name to layer onto the outer wrapper for
   * positioning (e.g. when used as a topRightBadge inside a tile).
   * The component itself renders inline-flex; positioning is the
   * caller's job.
   */
  className?: string;
  /**
   * Fired when the stats popover opens or closes. Voice A4 uses this
   * to start/stop `room.getStats()` polling only while the tooltip
   * is visible.
   */
  onOpenChange?: (open: boolean) => void;
}

/**
 * 4 bar heights — Tailwind default scale only (no `extend` in
 * `tailwind.config.ts`), so picking 1.5 / 2.5 / 3.5 / 5 keeps the
 * 1-step gradient. `h-4.5` doesn't exist on the default scale and
 * arbitrary values like `h-[1.125rem]` would skip the JIT cache.
 */
const BAR_HEIGHTS = ["h-1.5", "h-2.5", "h-3.5", "h-5"] as const;

function colorForActiveBars(activeBars: 0 | 1 | 2 | 3 | 4): string {
  if (activeBars === 0) return "bg-gray-400";
  if (activeBars <= 1) return "bg-red-500";
  if (activeBars === 2) return "bg-yellow-500";
  return "bg-emerald-500";
}

export default function NetworkBars({
  level,
  label = "Network",
  tooltip,
  className,
  onOpenChange,
}: NetworkBarsProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const interactive = Boolean(tooltip);

  const activeBars = networkLevelToBars(level);
  const activeColor = colorForActiveBars(activeBars);
  // "Measuring…" placeholder when level is null (pre-first-sample).
  // Renders the same 4-bar shape but all grey + a faint pulse so the
  // user sees the slot is reserved (no layout shift when the first
  // sample arrives).
  const measuring = level == null;

  const setOpenWithNotify = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const close = useCallback(() => setOpenWithNotify(false), [setOpenWithNotify]);

  // Click-outside + Escape — only wired when popover is open to avoid
  // unnecessary global listeners on every render.
  useEffect(() => {
    if (!open) return;
    const handleDocClick = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (event.target instanceof Node && wrapperRef.current.contains(event.target)) {
        return;
      }
      close();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", handleDocClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDocClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, close]);

  const handleToggle = () => {
    if (!interactive) return;
    setOpen((prev) => {
      const next = !prev;
      onOpenChange?.(next);
      return next;
    });
  };

  const ariaLabel = measuring
    ? `${label}: measuring`
    : `${label}: ${activeBars} of 4 bars`;

  return (
    <div
      ref={wrapperRef}
      className={"relative inline-flex flex-col items-start " + (className ?? "")}
    >
      <button
        type="button"
        onClick={handleToggle}
        aria-label={ariaLabel}
        aria-haspopup={interactive ? "dialog" : undefined}
        aria-expanded={interactive ? open : undefined}
        disabled={!interactive}
        // Bars sit in a tight row: each bar is 0.5rem wide with a 0.5
        // gap; the whole control fits in ~2rem horizontally and
        // matches the height of the tallest bar (~1.125rem) plus
        // padding for the focus ring.
        className={
          "flex items-end gap-0.5 rounded px-1 py-0.5 " +
          (interactive
            ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-emerald-400"
            : "cursor-default")
        }
      >
        {[0, 1, 2, 3].map((i) => {
          const isActive = !measuring && i < activeBars;
          const heightClass = BAR_HEIGHTS[i];
          const colorClass = isActive
            ? activeColor
            : "bg-gray-300/70";
          return (
            <span
              key={i}
              className={
                "w-1 rounded-sm " +
                heightClass +
                " " +
                colorClass +
                (measuring ? " animate-pulse" : "")
              }
              aria-hidden
            />
          );
        })}
      </button>
      {interactive && open ? (
        // Popover — anchored below the bars with a small offset; not a
        // portal, just a positioned sibling. Tailwind's `z-30` sits
        // above the floating self-tile (z-20) AND the recording
        // indicator (z-20) so the popover always wins the stacking
        // context inside `videoPane`.
        <div
          role="dialog"
          aria-label={`${label} stats`}
          className="absolute left-0 top-full z-30 mt-1 min-w-[14rem] rounded-md border border-gray-200 bg-white p-3 text-xs text-gray-800 shadow-lg"
        >
          {tooltip}
        </div>
      ) : null}
    </div>
  );
}
