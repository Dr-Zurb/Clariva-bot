"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { COLLAPSE_CLOSE_MS, COLLAPSE_OPEN_MS } from "@/lib/cockpit/collapse-scroll";
import { cn } from "@/lib/utils";

export interface CollapseProps {
  /** When true the content is shown (height animates open); false animates closed. */
  open: boolean;
  /** Stable id for `aria-controls` wiring from the toggle. */
  id?: string;
  /** Class applied to the innermost content wrapper (padding, spacing, …). */
  className?: string;
  /** Override the direction-aware default duration (open/close) for both directions. */
  durationMs?: number;
  children: ReactNode;
}

/**
 * Height-animating show/hide that keeps children mounted (form state survives).
 *
 * Uses the CSS grid `grid-template-rows: 0fr → 1fr` technique — smooth, no
 * height measurement, no JS per frame. The content is clipped (`overflow:hidden`)
 * while collapsing/expanding, then switched to `overflow:visible` once fully open
 * so nested popovers/dropdowns are not clipped. Honors `prefers-reduced-motion`
 * (collapses instantly). Collapsed content is `inert` + `aria-hidden` so it is
 * removed from tab order and the accessibility tree.
 *
 * Both directions are a single decelerating (ease-out) motion whose body fold and
 * accompanying scroll share one duration/curve, so neither reads as two competing
 * moves: open locks the fold to the travel scroll (`COLLAPSE_OPEN_MS`,
 * `scrollCollapsibleToTop`); close locks the fold to the page-settle scroll
 * (`COLLAPSE_CLOSE_MS`, `reAnchorCollapsibleOnClose`). Close runs a touch longer so
 * a near-viewport reveal lands gently.
 */
export function Collapse({
  open,
  id,
  className,
  durationMs,
  children,
}: CollapseProps): JSX.Element {
  const outerRef = useRef<HTMLDivElement>(null);
  // Overflow may only be visible once the open animation has settled; while
  // collapsed/animating it must clip so the row height can reach zero.
  const [overflowVisible, setOverflowVisible] = useState(open);

  const openMs = durationMs ?? COLLAPSE_OPEN_MS;
  const resolvedDuration = durationMs ?? (open ? COLLAPSE_OPEN_MS : COLLAPSE_CLOSE_MS);

  // `inert` is not a typed prop in React 18 — reflect it onto the DOM directly.
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    if (open) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }, [open]);

  useEffect(() => {
    if (!open) {
      setOverflowVisible(false);
      return;
    }
    // Reveal overflow after the open animation finishes (timer also covers the
    // reduced-motion path where `transitionend` never fires).
    const timer = window.setTimeout(() => setOverflowVisible(true), openMs + 30);
    return () => window.clearTimeout(timer);
  }, [open, openMs]);

  return (
    <div
      ref={outerRef}
      id={id}
      aria-hidden={!open}
      className={cn(
        // `grid-cols-[minmax(0,1fr)]` pins the single column to the container width.
        // A default implicit `auto` column expands to the content's max-content and
        // overflows horizontally (grid tracks, unlike flex, are NOT clamped to the
        // container) — so a wide body row would punch the whole section out of the
        // pane. minmax(0,1fr) caps the column so wide content wraps/clips instead.
        "grid grid-cols-[minmax(0,1fr)] transition-[grid-template-rows] ease-out motion-reduce:transition-none",
        // Decelerating ease-out in both directions; the matching open/close scroll
        // shares this curve + duration so the fold and scroll never read as two moves.
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
      style={{ transitionDuration: `${resolvedDuration}ms` }}
      onTransitionEnd={(event) => {
        if (event.propertyName === "grid-template-rows" && open) {
          setOverflowVisible(true);
        }
      }}
    >
      {/* Gate overflow on `open` too (not just the deferred state) so closing clips
          synchronously in the same commit that shrinks the row — otherwise the first
          painted frame stays full-height (overflow visible) and then snaps, which
          reads as a flicker on close.

          `overflow-clip` (not `hidden`) while animating: `hidden` creates a scrollport,
          which steals stickiness from any nested sticky header (it re-anchors to this
          collapsing box instead of the pane) — so re-opening a section made its nested
          sticky header drift then snap. `clip` clips identically without a scrollport,
          keeping nested sticky headers anchored to the pane throughout (matches the
          complaint cards' fix). */}
      <div
        className={cn(
          // `min-w-0` lets this grid item shrink below its content's min-content so
          // wide flex rows inside wrap instead of forcing the column (and section) wide.
          "min-h-0 min-w-0",
          open && overflowVisible ? "overflow-visible" : "overflow-clip",
        )}
      >
        <div className={className}>{children}</div>
      </div>
    </div>
  );
}
