/**
 * LayoutRatioIcon — small diagram glyphs for Full / ⅔ / ½ / ⅓ (ctf-17).
 */

import { cn } from "@/lib/utils";
import type { PaneSplitRatio } from "@/lib/patient-profile/v3/focus-leaf";

export interface LayoutRatioIconProps {
  ratio: PaneSplitRatio;
  className?: string;
}

/** SVG viewBox unit; focused pane is filled, neighbour is hatched lighter. */
export default function LayoutRatioIcon({
  ratio,
  className,
}: LayoutRatioIconProps) {
  return (
    <svg
      viewBox="0 0 16 12"
      className={cn("h-3.5 w-4 shrink-0", className)}
      aria-hidden
    >
      <rect
        x="0.5"
        y="0.5"
        width="15"
        height="11"
        rx="1.5"
        className="fill-transparent stroke-current"
        strokeWidth="1"
      />
      {ratio === "full" ? (
        <rect
          x="2"
          y="2"
          width="12"
          height="8"
          rx="0.5"
          className="fill-current opacity-80"
        />
      ) : null}
      {ratio === "wide" ? (
        <>
          <rect
            x="2"
            y="2"
            width="7.5"
            height="8"
            rx="0.5"
            className="fill-current opacity-80"
          />
          <rect
            x="10"
            y="2"
            width="4"
            height="8"
            rx="0.5"
            className="fill-current opacity-25"
          />
        </>
      ) : null}
      {ratio === "even" ? (
        <>
          <rect
            x="2"
            y="2"
            width="5.5"
            height="8"
            rx="0.5"
            className="fill-current opacity-80"
          />
          <rect
            x="8.5"
            y="2"
            width="5.5"
            height="8"
            rx="0.5"
            className="fill-current opacity-25"
          />
        </>
      ) : null}
      {ratio === "narrow" ? (
        <>
          <rect
            x="2"
            y="2"
            width="4"
            height="8"
            rx="0.5"
            className="fill-current opacity-80"
          />
          <rect
            x="6.5"
            y="2"
            width="7.5"
            height="8"
            rx="0.5"
            className="fill-current opacity-25"
          />
        </>
      ) : null}
    </svg>
  );
}
