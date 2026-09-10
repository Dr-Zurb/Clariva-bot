"use client";

/**
 * Single participant video tile (self or remote).
 *
 * IMPORTANT: the `<video>` DOM node must stay mounted across layout /
 * fill / floating prop changes — Twilio's `track.attach()` binding lives
 * on that element. Never conditionally wrap or unmount the video.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { actorColor, actorInitials } from "@/lib/call/actor-avatar";
import {
  type SelfViewPosition,
  PIP_DRAG_THRESHOLD_PX,
  SELF_VIEW_POSITIONS as SELF_VIEW_POSITIONS_LIST,
  snapPipCorner,
} from "@/lib/call/self-view-position";
import VideoTileViewControls, {
  type VideoTileInspectPlacement,
} from "./VideoTileViewControls";

export type VideoObjectFit = "contain" | "cover";
export type VideoRotation = 0 | 90 | 180 | 270;

export const VIDEO_ZOOM_MIN = 1;
export const VIDEO_ZOOM_MAX = 8;
export const VIDEO_ZOOM_STEP = 0.5;
/** Trackpad two-finger scroll at 1× (fallback zoom). */
export const VIDEO_TRACKPAD_ZOOM_RATE = 0.006;
/** Discrete mouse notch (~100 px after normalize). */
export const VIDEO_MOUSE_ZOOM_RATE = 0.002;
/** Mac/Chrome expose pinch as ctrl+wheel with tiny pixel ticks. */
export const VIDEO_PINCH_WHEEL_ZOOM_RATE = 0.01;

export function clampVideoZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return VIDEO_ZOOM_MIN;
  return Math.min(VIDEO_ZOOM_MAX, Math.max(VIDEO_ZOOM_MIN, zoom));
}

export function normalizeWheelDelta(delta: number, deltaMode: number): number {
  if (deltaMode === 1) return delta * 16;
  if (deltaMode === 2) return delta * 100;
  return delta;
}

export function isDiscreteMouseWheel(event: {
  ctrlKey: boolean;
  deltaX: number;
  deltaY: number;
  deltaMode: number;
}): boolean {
  if (event.ctrlKey) return false;
  if (event.deltaMode !== 0) return true;
  return (
    event.deltaX === 0 &&
    Math.abs(event.deltaY) >= 40 &&
    Number.isInteger(event.deltaY)
  );
}

export function wheelZoomRate(isPinch: boolean, isMouse: boolean): number {
  if (isPinch) return VIDEO_PINCH_WHEEL_ZOOM_RATE;
  if (isMouse) return VIDEO_MOUSE_ZOOM_RATE;
  return VIDEO_TRACKPAD_ZOOM_RATE;
}

export function applyWheelZoom(
  current: number,
  deltaY: number,
  rate: number
): number {
  if (deltaY === 0 || rate <= 0) return clampVideoZoom(current);
  return clampVideoZoom(current * Math.exp(-deltaY * rate));
}

export function zoomFromPinchDistance(
  startZoom: number,
  startDistance: number,
  currentDistance: number
): number {
  if (startDistance <= 0 || currentDistance <= 0) {
    return clampVideoZoom(startZoom);
  }
  return clampVideoZoom(startZoom * (currentDistance / startDistance));
}

export function pointerAnchorFromCenter(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number }
): { x: number; y: number } {
  return {
    x: clientX - (box.left + box.width / 2),
    y: clientY - (box.top + box.height / 2),
  };
}

/** Keep the point under the cursor fixed while zoom changes. */
export function panTowardAnchor(
  pan: { x: number; y: number },
  fromZoom: number,
  toZoom: number,
  anchor: { x: number; y: number }
): { x: number; y: number } {
  if (fromZoom <= 0 || fromZoom === toZoom) return pan;
  const ratio = toZoom / fromZoom;
  return {
    x: anchor.x - (anchor.x - pan.x) * ratio,
    y: anchor.y - (anchor.y - pan.y) * ratio,
  };
}

function touchDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

export function nextVideoRotation(
  current: VideoRotation,
  delta: 90 | -90
): VideoRotation {
  return ((((current + delta) % 360) + 360) % 360) as VideoRotation;
}

export function nextVideoZoom(current: number, delta: 1 | -1): number {
  return clampVideoZoom(
    Math.round((current + delta * VIDEO_ZOOM_STEP) * 10) / 10
  );
}

export interface VideoTileViewControlsBind {
  onObjectFitChange: (fit: VideoObjectFit) => void;
  onRotate: (delta: 90 | -90) => void;
  onZoom: (delta: 1 | -1) => void;
  /** Continuous gesture zoom (trackpad / pinch). Buttons keep `onZoom`. */
  onZoomTo?: (zoom: number) => void;
  onZoomReset: () => void;
  /** Gallery / Sidebar — swap this tile with the other camera. */
  onSwap?: () => void;
  /** Hide the pill until the tile is tapped (or hovered on desktop). */
  revealOnTap?: boolean;
  /** Patient phone — one rotate button instead of CW/CCW. */
  cycleRotate?: boolean;
  inspectVariant?: "desktop" | "touch";
  inspectPlacement?: VideoTileInspectPlacement;
  inspectClearDock?: boolean;
  inspectHideZoom?: boolean;
}

export interface VideoTileProps {
  /**
   * Parent-owned `<video>` ref. `<VideoRoom>` attaches Twilio tracks
   * here directly. Typed as the broader `Ref<HTMLVideoElement>` to
   * cover both `RefObject` (React 18 typing) and `RefObject<T | null>`
   * (React 19 typing) the parent's `useRef<HTMLVideoElement>(null)`
   * may produce — JSX accepts both shapes.
   */
  videoRef: Ref<HTMLVideoElement>;
  /** Participant chip overlaid on the video ("You" / "Doctor" / "Patient"). */
  label: string;
  /**
   * Hide the video and show the avatar+label placeholder when true.
   *  - For the SELF tile: parent flips this on mic-button click via
   *    `LocalVideoTrack.disable()`.
   *  - For the REMOTE tile: parent flips this in response to
   *    `RemoteVideoTrack.on('disabled' | 'enabled')` events.
   */
  cameraOff: boolean;
  /**
   * Display name used to compute the avatar initials + background
   * color. Distinct from `label` because the label is a fixed UX
   * heading ("You") while the actor name varies ("Doctor" / "Patient" /
   * a real provider name once `doctor_settings.display_name` lands).
   */
  actorName: string;
  /**
   * Mute the local audio output of THIS `<video>` element to prevent
   * self-echo on the SELF tile (Twilio's RTC track handles peer audio
   * separately). Defaults `false` — set `true` only on the self tile.
   */
  muteSelf?: boolean;
  /**
   * A6 prop stub — when `true`, applies `transform: scaleX(-1)` to the
   * `<video>` element (mirror the self-view). Default `false`. A2 just
   * exposes the prop; A6 will wire the toggle button.
   */
  mirror?: boolean;
  /**
   * Optional one-line overlay rendered while the room/track is still
   * spinning up ("Starting camera…" on self, "Waiting for doctor…" on
   * remote). Hidden once the video is live OR the camera is off.
   */
  pendingText?: string | null;
  /**
   * Sub-batch A · task-video-A3 — optional badge anchored top-left of
   * the video area.
   */
  topLeftBadge?: ReactNode;
  /**
   * Sub-batch A · task-video-A8 — symmetric to `topLeftBadge`.
   */
  topRightBadge?: ReactNode;
  /**
   * Front/back camera flip (or similar) — bottom-left so it does not
   * collide with the name chip (bottom-right) or view controls (top-right).
   */
  bottomLeftOverlay?: ReactNode;
  /**
   * Sub-batch A · task-video-A5 — when `true`, hides the name chip overlay.
   */
  hideLabel?: boolean;
  /**
   * Sub-batch A · task-video-A5 — when set, renders the tile as an
   * absolute-positioned PiP overlay.
   */
  floating?: {
    position: SelfViewPosition;
    /** Tap / click the PiP — swap with the main stage tile. */
    onTap?: () => void;
    /** Drag the PiP past the move threshold — snap to a corner. */
    onMove?: (position: SelfViewPosition) => void;
    /**
     * PiP box shape. Defaults to `landscape` (4:3-ish) which suits a
     * laptop webcam. `portrait` is for a phone held upright, where a
     * landscape box crops the top of the head off or letterboxes the
     * sides depending on `objectFit`.
     */
    aspect?: "landscape" | "portrait";
    /**
     * Lift a bottom-corner PiP above an overlay control dock so the
     * self-view isn't covered by Mute / Leave.
     */
    clearDock?: boolean;
    /** Smaller PiP for the short chat-open stage. */
    compact?: boolean;
  };
  /**
   * Tap handler for non-floating tiles (e.g. Sidebar left/right swap).
   * Ignored when `floating.onTap` is set — floating owns the gesture.
   */
  onTap?: () => void;
  /** Accessible label when `onTap` is active (non-floating). */
  tapAriaLabel?: string;
  /**
   * vsf-01 — stretch to the parent stage cell (Gallery / Sidebar / Speaker
   * remote). Drops `aspect-video` so tiles fill height. Ignored when
   * `floating` is set. Default fill video uses `object-contain` so resizing
   * the Consult pane letterboxes instead of cropping faces; pass
   * `objectFit` / `viewControls` to let the doctor switch Fill vs Fit.
   */
  fill?: boolean;
  /**
   * How the video paints inside the tile. Defaults to `contain` on fill
   * stage tiles (letterbox) and `cover` on PiP / legacy aspect-video tiles.
   */
  objectFit?: VideoObjectFit;
  /**
   * Local viewing rotation in 90° steps. Does not change the track sent
   * to the other party — the doctor can upright a sideways phone camera.
   */
  rotation?: VideoRotation;
  /**
   * Local viewing zoom (1–8×). For inspecting lesions without asking
   * the patient to move the camera. Drag to pan when zoomed in.
   */
  zoom?: number;
  /**
   * When set, Fit / Fill / Zoom / Rotate controls overlay this tile.
   */
  viewControls?: VideoTileViewControlsBind;
  /**
   * Plays a short 3D flip on the media box while the self camera
   * switches front ↔ back. Does not remount `<video>`.
   */
  cameraFlipping?: boolean;
}

function clampPan(
  x: number,
  y: number,
  combinedScale: number,
  width: number,
  height: number
): { x: number; y: number } {
  if (combinedScale <= 1 || width < 1 || height < 1) return { x: 0, y: 0 };
  const maxX = (width * (combinedScale - 1)) / 2;
  const maxY = (height * (combinedScale - 1)) / 2;
  return {
    x: Math.max(-maxX, Math.min(maxX, x)),
    y: Math.max(-maxY, Math.min(maxY, y)),
  };
}

function useQuarterTurnScale(
  rotation: VideoRotation,
  objectFit: VideoObjectFit
) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      setScale(1);
      return;
    }
    const update = () => {
      const { width: w, height: h } = el.getBoundingClientRect();
      setBoxSize({ w, h });
      if (rotation % 180 === 0) {
        setScale(1);
        return;
      }
      if (w < 1 || h < 1) {
        setScale(1);
        return;
      }
      const aspect = w / h;
      setScale(
        objectFit === "cover"
          ? Math.max(aspect, 1 / aspect)
          : Math.min(aspect, 1 / aspect)
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [rotation, objectFit]);

  return { boxRef, scale, boxSize };
}

/** Re-export for call sites that import corner types from this module. */
export type { SelfViewPosition };
export const SELF_VIEW_POSITIONS = SELF_VIEW_POSITIONS_LIST;

const FLOATING_POSITION_CLASSES: Record<SelfViewPosition, string> = {
  TL: "top-4 left-4",
  TR: "top-4 right-4",
  BL: "bottom-4 left-4",
  BR: "bottom-4 right-4",
};

const FLOATING_POSITION_CLEAR_DOCK: Record<SelfViewPosition, string> = {
  TL: "top-4 left-4",
  TR: "top-4 right-4",
  BL: "bottom-20 left-4",
  BR: "bottom-20 right-4",
};

/** Dock clearance (`bottom-20`) plus the 4.75rem fullscreen-hint inset. */
const FLOATING_POSITION_CLEAR_HINT: Record<SelfViewPosition, string> = {
  TL: "top-4 left-4",
  TR: "top-4 right-4",
  BL: "bottom-[9.75rem] left-4",
  BR: "bottom-[9.75rem] right-4",
};

export default function VideoTile({
  videoRef,
  label,
  cameraOff,
  actorName,
  muteSelf = false,
  mirror = false,
  pendingText = null,
  topLeftBadge = null,
  topRightBadge = null,
  bottomLeftOverlay = null,
  hideLabel = false,
  floating,
  onTap: onTapProp,
  tapAriaLabel,
  fill = false,
  objectFit: objectFitProp,
  rotation = 0,
  zoom = VIDEO_ZOOM_MIN,
  viewControls,
  cameraFlipping = false,
}: VideoTileProps) {
  const initials = actorInitials(actorName);
  const colorClass = actorColor(actorName);
  const isFloating = Boolean(floating);
  const fillStage = fill && !isFloating;
  const objectFit: VideoObjectFit =
    objectFitProp ?? (fillStage ? "contain" : "cover");
  const { boxRef, scale, boxSize } = useQuarterTurnScale(rotation, objectFit);
  const tileRef = useRef<HTMLDivElement>(null);
  const combinedScale = scale * zoom;
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  const pipDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const pipDragMovedRef = useRef(false);
  const [pipOffset, setPipOffset] = useState<{ x: number; y: number } | null>(
    null
  );
  const [pipDragging, setPipDragging] = useState(false);
  const zoomHandlerRef = useRef(viewControls?.onZoom);
  zoomHandlerRef.current = viewControls?.onZoom;
  const zoomToRef = useRef(viewControls?.onZoomTo);
  zoomToRef.current = viewControls?.onZoomTo;
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  panRef.current = pan;
  const boxSizeRef = useRef(boxSize);
  boxSizeRef.current = boxSize;
  const rotateScaleRef = useRef(scale);
  rotateScaleRef.current = scale;
  const pinchStartRef = useRef<{
    distance: number;
    zoom: number;
    panX: number;
    panY: number;
    anchorX: number;
    anchorY: number;
  } | null>(null);
  const onTap = floating?.onTap ?? onTapProp;
  const inspectOnTap = Boolean(viewControls?.revealOnTap) && !isFloating;
  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectHover, setInspectHover] = useState(false);
  const interactive = Boolean(onTap) || inspectOnTap;
  const nestedControls = Boolean(viewControls) && !inspectOnTap;
  const canPan = zoom > VIDEO_ZOOM_MIN && !isFloating;
  const interactiveClass =
    interactive && !canPan
      ? " cursor-pointer hover:ring-2 hover:ring-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      : canPan
        ? " cursor-grab"
        : "";
  // Floating PiP never shows a name chip; inline mode honors `hideLabel`.
  const showLabel = !isFloating && !hideLabel;

  useLayoutEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (!inspectOpen || inspectHover) return;
    const timer = window.setTimeout(() => setInspectOpen(false), 3000);
    return () => window.clearTimeout(timer);
  }, [inspectOpen, inspectHover]);

  useEffect(() => {
    setPan((current) =>
      clampPan(current.x, current.y, combinedScale, boxSize.w, boxSize.h)
    );
  }, [combinedScale, boxSize.w, boxSize.h]);

  useEffect(() => {
    const tile = tileRef.current;
    const el = boxRef.current;
    if (!tile || !el || isFloating) return;

    const commitPan = (next: { x: number; y: number }, nextZoom: number) => {
      const rect = el.getBoundingClientRect();
      const width = rect.width || boxSizeRef.current.w;
      const height = rect.height || boxSizeRef.current.h;
      const clamped = clampPan(
        next.x,
        next.y,
        rotateScaleRef.current * nextZoom,
        width,
        height
      );
      panRef.current = clamped;
      setPan(clamped);
      return clamped;
    };

    const commitZoom = (nextZoom: number) => {
      const toZoom = clampVideoZoom(nextZoom);
      commitPan(panRef.current, toZoom);
      zoomRef.current = toZoom;
      zoomToRef.current?.(toZoom);
    };

    // Wheel is zoom-only. Panning is drag-only, so a slow scroll can never
    // be mistaken for a two-finger pan and shift the frame mid-exam.
    const onWheel = (event: WheelEvent) => {
      if (!zoomToRef.current && !zoomHandlerRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      if (!zoomToRef.current) return;
      const deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode);
      const rate = wheelZoomRate(event.ctrlKey, isDiscreteMouseWheel(event));
      commitZoom(applyWheelZoom(zoomRef.current, deltaY, rate));
    };
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const a = event.touches[0];
      const b = event.touches[1];
      const rect = el.getBoundingClientRect();
      const mid = pointerAnchorFromCenter(
        (a.clientX + b.clientX) / 2,
        (a.clientY + b.clientY) / 2,
        rect
      );
      pinchStartRef.current = {
        distance: touchDistance(a, b),
        zoom: zoomRef.current,
        panX: panRef.current.x,
        panY: panRef.current.y,
        anchorX: mid.x,
        anchorY: mid.y,
      };
    };
    const onTouchMove = (event: TouchEvent) => {
      const pinch = pinchStartRef.current;
      if (event.touches.length !== 2 || !pinch || !zoomToRef.current) return;
      event.preventDefault();
      const nextZoom = zoomFromPinchDistance(
        pinch.zoom,
        pinch.distance,
        touchDistance(event.touches[0], event.touches[1])
      );
      const nextPan = panTowardAnchor(
        { x: pinch.panX, y: pinch.panY },
        pinch.zoom,
        nextZoom,
        { x: pinch.anchorX, y: pinch.anchorY }
      );
      commitPan(nextPan, nextZoom);
      zoomRef.current = nextZoom;
      zoomToRef.current(nextZoom);
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) {
        pinchStartRef.current = null;
      }
    };
    tile.addEventListener("wheel", onWheel, { passive: false, capture: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      tile.removeEventListener("wheel", onWheel, { capture: true });
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [boxRef, isFloating]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (inspectOnTap) {
      event.preventDefault();
      setInspectOpen((open) => !open);
      return;
    }
    if (!onTap) return;
    if (nestedControls) return;
    event.preventDefault();
    onTap();
  };

  const handleInspectPointerEnter = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if (!inspectOnTap || event.pointerType !== "mouse") return;
    setInspectHover(true);
    setInspectOpen(true);
  };

  const handleInspectPointerLeave = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if (!inspectOnTap || event.pointerType !== "mouse") return;
    setInspectHover(false);
    setInspectOpen(false);
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (canPan && !inspectOnTap) return;
    if (dragRef.current?.moved || pipDragMovedRef.current) {
      pipDragMovedRef.current = false;
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-testid='video-tile-view-controls']")) return;
    if (inspectOnTap) {
      setInspectOpen((open) => !open);
      return;
    }
    if (!onTap) return;
    onTap();
  };

  const ignoreNestedPointer = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    return Boolean(
      target?.closest("[data-testid='video-tile-view-controls']") ||
      target?.closest("[data-testid='self-camera-flip']")
    );
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (ignoreNestedPointer(event)) return;
    if (isFloating && (onTap || floating?.onMove)) {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      pipDragMovedRef.current = false;
      pipDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
      setPipDragging(true);
      setPipOffset({ x: 0, y: 0 });
      return;
    }
    if (!canPan) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const pipDrag = pipDragRef.current;
    if (pipDrag && pipDrag.pointerId === event.pointerId) {
      const dx = event.clientX - pipDrag.startX;
      const dy = event.clientY - pipDrag.startY;
      if (
        Math.abs(dx) > PIP_DRAG_THRESHOLD_PX ||
        Math.abs(dy) > PIP_DRAG_THRESHOLD_PX
      ) {
        pipDragMovedRef.current = true;
      }
      setPipOffset({ x: dx, y: dy });
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
    const next = clampPan(
      drag.panX + dx,
      drag.panY + dy,
      combinedScale,
      boxSize.w,
      boxSize.h
    );
    panRef.current = next;
    setPan(next);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const pipDrag = pipDragRef.current;
    if (pipDrag && pipDrag.pointerId === event.pointerId) {
      pipDragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch {
        // Capture may already have been released.
      }
      if (pipDragMovedRef.current && floating?.onMove) {
        const tile = tileRef.current;
        const stageEl =
          tile?.offsetParent instanceof HTMLElement
            ? tile.offsetParent
            : tile?.parentElement;
        if (tile && stageEl) {
          const tileRect = tile.getBoundingClientRect();
          const stageRect = stageEl.getBoundingClientRect();
          floating.onMove(
            snapPipCorner(
              tileRect.left + tileRect.width / 2,
              tileRect.top + tileRect.height / 2,
              stageRect
            )
          );
        }
      }
      setPipOffset(null);
      setPipDragging(false);
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Capture may already have been released.
    }
  };

  const transformParts = [
    pan.x !== 0 || pan.y !== 0 ? `translate(${pan.x}px, ${pan.y}px)` : "",
    rotation ? `rotate(${rotation}deg)` : "",
    combinedScale !== 1 ? `scale(${combinedScale})` : "",
    mirror ? "scaleX(-1)" : "",
  ].filter(Boolean);
  const videoTransform = transformParts.join(" ");

  // Label is an in-video overlay — it never consumes layout height.
  const containerClass = isFloating
    ? // `pointer-events-auto` — Speaker stage wraps this tile in a
      // `pointer-events-none` sibling so PiP never blocks remote
      // clicks; re-enable here so tap-to-swap / drag-to-corner work.
      "group pointer-events-auto absolute z-20 touch-none " +
      (floating!.compact
        ? floating!.aspect === "portrait"
          ? "h-[5.5rem] w-16 "
          : "h-16 w-20 "
        : floating!.aspect === "portrait"
          ? "w-24 h-32 landscape:w-32 landscape:h-24 "
          : "w-32 h-24 landscape:w-24 landscape:h-16 md:w-44 md:h-32 md:landscape:w-44 md:landscape:h-32 ") +
      "overflow-hidden rounded-lg border border-white/40 bg-gray-900 shadow-lg " +
      (pipDragging
        ? "transition-none "
        : "transition-all duration-200 ease-in-out ") +
      (floating!.clearDock
        ? FLOATING_POSITION_CLEAR_DOCK
        : FLOATING_POSITION_CLASSES)[floating!.position] +
      interactiveClass
    : fillStage
      ? "group relative h-full min-h-0 w-full overscroll-none" +
        interactiveClass
      : "group relative w-full overscroll-none" + interactiveClass;

  // Stable media box — ALWAYS present so `<video>` never remounts when
  // toggling fill / floating / label (layout swaps).
  const mediaBoxClass = isFloating
    ? "relative h-full w-full overflow-hidden"
    : fillStage
      ? "absolute inset-0 overflow-hidden overscroll-none" +
        (canPan || nestedControls ? " touch-none" : "")
      : "relative w-full overflow-hidden overscroll-none" +
        (canPan || nestedControls ? " touch-none" : "");
  const flippingClass = cameraFlipping ? " video-camera-flip" : "";

  const videoClass =
    (isFloating
      ? "absolute inset-0 h-full w-full rounded-lg border border-gray-200 bg-gray-900 "
      : fillStage
        ? "absolute inset-0 h-full w-full rounded-lg border border-gray-200 bg-gray-900 "
        : "w-full rounded-lg border border-gray-200 bg-gray-900 aspect-video ") +
    (objectFit === "contain" ? "object-contain " : "object-cover ") +
    (cameraOff ? "opacity-0 " : "");

  const overlayInsetClass = "inset-0";

  const avatarBoxClass = isFloating ? "h-10 w-10 text-sm" : "h-16 w-16 text-xl";
  const cameraOffLabelClass = isFloating ? "text-[10px]" : "text-sm";

  return (
    <div
      ref={tileRef}
      className={containerClass}
      data-fill={fillStage ? "true" : "false"}
      data-testid="video-tile"
      data-pip={isFloating ? "true" : undefined}
      data-pip-corner={isFloating ? floating!.position : undefined}
      data-zoom={zoom}
      style={
        pipOffset
          ? { transform: `translate(${pipOffset.x}px, ${pipOffset.y}px)` }
          : undefined
      }
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onPointerEnter={handleInspectPointerEnter}
      onPointerLeave={handleInspectPointerLeave}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role={interactive && !nestedControls ? "button" : undefined}
      tabIndex={interactive && !nestedControls ? 0 : undefined}
      aria-label={
        interactive && !nestedControls
          ? inspectOnTap
            ? (tapAriaLabel ?? "Show video controls")
            : floating
              ? (tapAriaLabel ?? "Swap with main video")
              : (tapAriaLabel ?? "Move self-view")
          : undefined
      }
    >
      <div
        ref={boxRef}
        className={mediaBoxClass + flippingClass}
        data-testid="video-tile-media"
        data-camera-flipping={cameraFlipping ? "true" : "false"}
      >
        {/*
         * IMPORTANT: never unmount this `<video>` based on `cameraOff`
         * or layout — Twilio's `track.attach(...)` binding lives here.
         */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muteSelf}
          className={videoClass}
          data-object-fit={objectFit}
          data-rotation={rotation}
          data-zoom={zoom}
          style={
            videoTransform
              ? { transform: videoTransform, transformOrigin: "center center" }
              : undefined
          }
        />
        {cameraOff ? (
          <div
            className={
              "pointer-events-none absolute flex flex-col items-center justify-center gap-2 rounded-lg bg-gray-900 " +
              overlayInsetClass
            }
          >
            <div
              className={
                "flex items-center justify-center rounded-full font-semibold text-white shadow " +
                avatarBoxClass +
                " " +
                colorClass
              }
              aria-hidden
            >
              {initials}
            </div>
            <p className={"font-medium text-white " + cameraOffLabelClass}>
              Camera off
            </p>
          </div>
        ) : pendingText ? (
          <div
            className={
              "pointer-events-none absolute flex items-center justify-center rounded-lg bg-gray-900/80 " +
              overlayInsetClass
            }
          >
            <p
              className={
                "text-white " + (isFloating ? "text-[10px]" : "text-sm")
              }
            >
              {pendingText}
            </p>
          </div>
        ) : null}
        {showLabel ? (
          <p
            data-testid="video-tile-label"
            className={
              "pointer-events-none absolute bottom-2 right-2 z-10 max-w-[calc(100%-1rem)] truncate rounded-md bg-black/45 px-1.5 py-0.5 text-xs font-medium text-white shadow-sm " +
              (fillStage ? "" : "sm:text-sm ")
            }
          >
            {label}
          </p>
        ) : null}
        {!isFloating && topLeftBadge ? (
          <div className="pointer-events-none absolute left-2 top-2 z-10">
            {topLeftBadge}
          </div>
        ) : null}
        {!isFloating && topRightBadge ? (
          <div className="absolute right-2 top-2 z-10">{topRightBadge}</div>
        ) : null}
        {bottomLeftOverlay ? (
          <div
            className={
              "absolute z-20 " +
              (isFloating ? "bottom-1 left-1" : "bottom-2 left-2")
            }
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {bottomLeftOverlay}
          </div>
        ) : null}
        {viewControls &&
        !(isFloating && viewControls.revealOnTap) &&
        (!viewControls.revealOnTap || inspectOpen) ? (
          <VideoTileViewControls
            objectFit={objectFit}
            zoom={zoom}
            onObjectFitChange={viewControls.onObjectFitChange}
            onRotate={viewControls.onRotate}
            onZoom={viewControls.onZoom}
            onZoomReset={viewControls.onZoomReset}
            onSwap={viewControls.onSwap}
            compact={isFloating}
            variant={
              viewControls.inspectVariant ??
              (viewControls.revealOnTap ? "touch" : "desktop")
            }
            cycleRotate={viewControls.cycleRotate}
            placement={viewControls.inspectPlacement}
            clearDock={viewControls.inspectClearDock}
            hideZoom={viewControls.inspectHideZoom}
          />
        ) : null}
      </div>
    </div>
  );
}
