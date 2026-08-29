"use client";

import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from "react";
import {
  ArrowLeftRight,
  Expand,
  RotateCcw,
  RotateCw,
  Shrink,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import CallControlTooltip from "./CallControlTooltip";
import { cn } from "@/lib/utils";

export type VideoTileInspectPlacement =
  | "top-end"
  | "top-center"
  | "bottom-center"
  | "start"
  | "end";

export interface VideoTileViewControlsProps {
  objectFit: "contain" | "cover";
  zoom: number;
  onObjectFitChange: (fit: "contain" | "cover") => void;
  onRotate: (delta: 90 | -90) => void;
  onZoom: (delta: 1 | -1) => void;
  onZoomReset: () => void;
  onSwap?: () => void;
  /**
   * PiP / thumbnail — rotate only. Fit/Fill/Zoom is not useful on a
   * 128×96 chip; inspect lesions on the main tile.
   */
  compact?: boolean;
  /** Patient phone — larger hit targets, no hover tooltips required. */
  variant?: "desktop" | "touch";
  /** One rotate button that steps +90° instead of a CW/CCW pair. */
  cycleRotate?: boolean;
  /** Default `top-end` (desktop inspect). Patient phone parks on the seam. */
  placement?: VideoTileInspectPlacement;
  /** Lift a bottom-center pill above the mute / leave dock. */
  clearDock?: boolean;
  /** Side-by-side phone tiles — pinch still zooms. */
  hideZoom?: boolean;
}

export function formatVideoZoomLabel(zoom: number): string {
  const rounded = Math.round(zoom * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}×` : `${rounded.toFixed(1)}×`;
}

function stopTileGestures(
  event: MouseEvent | PointerEvent | KeyboardEvent,
): void {
  event.stopPropagation();
}

function ControlButton({
  label,
  pressed,
  disabled,
  onClick,
  touch = false,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  touch?: boolean;
  children: ReactNode;
}) {
  return (
    <CallControlTooltip label={label} side="bottom">
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "inline-flex items-center justify-center rounded-md text-white",
          touch ? "h-10 w-10" : "h-7 w-7",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
          disabled
            ? "cursor-not-allowed opacity-40"
            : pressed
              ? "bg-white/25"
              : "bg-transparent hover:bg-white/15",
        )}
      >
        {children}
      </button>
    </CallControlTooltip>
  );
}

/**
 * Per-tile Fit / Fill / Zoom / Rotate — local viewing only (does not
 * change the Twilio track the other party receives).
 */
const PLACEMENT_CLASS: Record<VideoTileInspectPlacement, string> = {
  "top-end": "right-1.5 top-1.5 flex-row items-center",
  "top-center": "left-1/2 top-2 -translate-x-1/2 flex-row items-center",
  "bottom-center": "bottom-2 left-1/2 -translate-x-1/2 flex-row items-center",
  start: "left-2 top-1/2 -translate-y-1/2 flex-col items-center",
  end: "right-2 top-1/2 -translate-y-1/2 flex-col items-center",
};

export default function VideoTileViewControls({
  objectFit,
  zoom,
  onObjectFitChange,
  onRotate,
  onZoom,
  onZoomReset,
  onSwap,
  compact = false,
  variant = "desktop",
  cycleRotate = false,
  placement = "top-end",
  clearDock = false,
  hideZoom = false,
}: VideoTileViewControlsProps) {
  const zoomed = zoom > 1;
  const zoomLabel = formatVideoZoomLabel(zoom);
  const touch = variant === "touch";
  const iconClass = touch ? "h-4 w-4" : "h-3.5 w-3.5";
  const resolvedPlacement = compact ? "top-end" : placement;
  const vertical = resolvedPlacement === "start" || resolvedPlacement === "end";

  return (
    <div
      data-testid="video-tile-view-controls"
      data-compact={compact ? "true" : "false"}
      data-variant={variant}
      data-placement={resolvedPlacement}
      data-clear-dock={clearDock ? "true" : "false"}
      className={cn(
        "absolute z-20 flex gap-0.5 rounded-md",
        "bg-black/55 p-0.5 shadow-sm backdrop-blur-[2px]",
        PLACEMENT_CLASS[resolvedPlacement],
        compact && "right-1 top-1 scale-90",
        touch && !compact && "gap-1 p-1",
        clearDock &&
          resolvedPlacement === "bottom-center" &&
          "bottom-20",
      )}
      onClick={stopTileGestures}
      onPointerDown={stopTileGestures}
      onKeyDown={stopTileGestures}
    >
      {compact ? null : (
        <>
          {onSwap ? (
            <ControlButton
              label="Swap video positions"
              touch={touch}
              onClick={onSwap}
            >
              <ArrowLeftRight className={iconClass} aria-hidden />
            </ControlButton>
          ) : null}
          <ControlButton
            label="Fit to frame"
            pressed={objectFit === "contain"}
            touch={touch}
            onClick={() => onObjectFitChange("contain")}
          >
            <Shrink className={iconClass} aria-hidden />
          </ControlButton>
          <ControlButton
            label="Fill frame"
            pressed={objectFit === "cover"}
            touch={touch}
            onClick={() => onObjectFitChange("cover")}
          >
            <Expand className={iconClass} aria-hidden />
          </ControlButton>
          {hideZoom ? null : (
            <>
              <ControlButton
                label="Zoom out"
                disabled={zoom <= 1}
                touch={touch}
                onClick={() => onZoom(-1)}
              >
                <ZoomOut className={iconClass} aria-hidden />
              </ControlButton>
              <CallControlTooltip
                label={zoomed ? "Reset zoom" : "Zoom"}
                side={vertical ? "right" : "bottom"}
              >
                <button
                  type="button"
                  aria-label={zoomed ? "Reset zoom" : "Zoom"}
                  disabled={!zoomed}
                  onClick={onZoomReset}
                  data-testid="video-tile-zoom-level"
                  className={cn(
                    "min-w-[1.75rem] rounded-md px-1 text-[10px] font-semibold tabular-nums text-white",
                    touch && "h-10",
                    zoomed
                      ? "bg-white/25 hover:bg-white/30"
                      : "cursor-default opacity-80",
                  )}
                >
                  {zoomLabel}
                </button>
              </CallControlTooltip>
              <ControlButton
                label="Zoom in"
                disabled={zoom >= 8}
                touch={touch}
                onClick={() => onZoom(1)}
              >
                <ZoomIn className={iconClass} aria-hidden />
              </ControlButton>
            </>
          )}
        </>
      )}
      {cycleRotate ? (
        <ControlButton
          label="Rotate view"
          touch={touch}
          onClick={() => onRotate(90)}
        >
          <RotateCw className={iconClass} aria-hidden />
        </ControlButton>
      ) : (
        <>
          <ControlButton
            label="Rotate counterclockwise"
            touch={touch}
            onClick={() => onRotate(-90)}
          >
            <RotateCcw className={iconClass} aria-hidden />
          </ControlButton>
          <ControlButton
            label="Rotate clockwise"
            touch={touch}
            onClick={() => onRotate(90)}
          >
            <RotateCw className={iconClass} aria-hidden />
          </ControlButton>
        </>
      )}
    </div>
  );
}
