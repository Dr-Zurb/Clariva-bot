"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import CallControlTooltip from "./CallControlTooltip";
import { networkLevelToBars } from "@/hooks/useNetworkQuality";

/**
 * Sub-batch A · task-video-A8 — 4-bar network-quality icon with an
 * optional click-to-toggle stats popover.
 *
 * The bars render as a horizontal row of 4 increasing-height pills:
 *   ▁ ▃ ▅ █  (active = colored, inactive = grey)
 * Coloring follows the cell-signal convention (1-2 = red / 3 = yellow
 * / 4 = green). A `tooltip` slot — accepts any `ReactNode` — opens in
 * a small popover anchored to the bars when the user clicks (or
 * keyboard-activates) the icon. Click-outside closes; Escape closes.
 *
 * The popover is portaled to `document.body` with fixed positioning so
 * cockpit ancestors (`overflow-hidden` on the video pane / stage) cannot
 * clip the stats panel when the bars sit near a pane edge.
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
   * Optional short visible caption beside the bars (e.g. "You" /
   * "Patient") so two signal icons on the same stage aren't ambiguous.
   */
  caption?: string;
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

const POPOVER_WIDTH_PX = 224; // matches former `min-w-[14rem]`
const POPOVER_GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;

function colorForActiveBars(activeBars: 0 | 1 | 2 | 3 | 4): string {
  if (activeBars === 0) return "bg-gray-400";
  if (activeBars <= 1) return "bg-red-500";
  if (activeBars === 2) return "bg-yellow-500";
  return "bg-emerald-500";
}

/** Exported for unit tests — viewport-aware anchor for the stats panel. */
export function computePopoverPosition(
  trigger: DOMRect,
  popoverHeight: number,
): { top: number; left: number } {
  const preferBelow =
    trigger.bottom + POPOVER_GAP_PX + popoverHeight + VIEWPORT_MARGIN_PX <=
    window.innerHeight;
  const top = preferBelow
    ? trigger.bottom + POPOVER_GAP_PX
    : Math.max(
        VIEWPORT_MARGIN_PX,
        trigger.top - POPOVER_GAP_PX - popoverHeight,
      );

  // Prefer left-aligning to the trigger; flip to right-align when the
  // panel would overflow the viewport (CallStageHeader sits on the
  // right edge of the video column).
  let left = trigger.left;
  if (left + POPOVER_WIDTH_PX + VIEWPORT_MARGIN_PX > window.innerWidth) {
    left = trigger.right - POPOVER_WIDTH_PX;
  }
  left = Math.max(
    VIEWPORT_MARGIN_PX,
    Math.min(left, window.innerWidth - POPOVER_WIDTH_PX - VIEWPORT_MARGIN_PX),
  );

  return { top, left };
}

export default function NetworkBars({
  level,
  label = "Network",
  caption,
  tooltip,
  className,
  onOpenChange,
}: NetworkBarsProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
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

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const trigger = buttonRef.current?.getBoundingClientRect();
    if (!trigger) return;

    const update = () => {
      const nextTrigger = buttonRef.current?.getBoundingClientRect();
      if (!nextTrigger) return;
      const height = popoverRef.current?.offsetHeight ?? 120;
      setPosition(computePopoverPosition(nextTrigger, height));
    };

    update();
    window.addEventListener("resize", update);
    // Capture scroll from any ancestor (video pane / cockpit shell).
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  // Click-outside + Escape — only wired when popover is open to avoid
  // unnecessary global listeners on every render. The popover is
  // portaled, so outside checks cover both the trigger wrapper and
  // the floating panel.
  useEffect(() => {
    if (!open) return;
    const handleDocClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (wrapperRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
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

  const popover =
    interactive && open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={`${label} stats`}
            data-testid="network-bars-popover"
            className="fixed z-[80] w-56 rounded-md border border-gray-200 bg-white p-3 text-xs text-gray-800 shadow-lg"
            style={
              position
                ? { top: position.top, left: position.left }
                : { visibility: "hidden", top: 0, left: 0 }
            }
          >
            {tooltip}
          </div>,
          document.body,
        )
      : null;

  const barsButton = (
    <button
      ref={buttonRef}
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
        const colorClass = isActive ? activeColor : "bg-gray-300/70";
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
  );

  return (
    <div
      ref={wrapperRef}
      className={
        "relative inline-flex items-center gap-1.5 " + (className ?? "")
      }
    >
      {caption ? (
        <span
          className="max-w-[4.5rem] truncate text-[10px] font-medium uppercase tracking-wide text-current opacity-60"
          aria-hidden
        >
          {caption}
        </span>
      ) : null}
      <CallControlTooltip label={label} side="top">
        {barsButton}
      </CallControlTooltip>
      {popover}
    </div>
  );
}
