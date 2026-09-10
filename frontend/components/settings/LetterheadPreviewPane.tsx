"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Download, Minus, Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  LetterheadPagePreview,
  letterheadPagePx,
  PAGE_STACK_GAP_PX,
  type LetterheadPagePreviewModel,
} from "@/components/settings/LetterheadPagePreview";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;
const PINCH_WHEEL_RATE = 0.01;
const TRACKPAD_WHEEL_RATE = 0.004;
const WHEEL_DELTA_CAP = 80;
const FIT_PAD_PX = 32;
const FIT_SCALE_EPSILON = 0.002;
const CANVAS_PAD_PX = 32;

export function clampPreviewZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

export function previewWheelShouldZoom(
  event: Pick<WheelEvent, "ctrlKey" | "metaKey">,
): boolean {
  return event.ctrlKey || event.metaKey;
}

export function applyPreviewWheelZoom(
  current: number,
  deltaY: number,
  ctrlOrMeta: boolean,
): number {
  const rate = ctrlOrMeta ? PINCH_WHEEL_RATE : TRACKPAD_WHEEL_RATE;
  if (deltaY === 0) return clampPreviewZoom(current);
  const capped = Math.max(-WHEEL_DELTA_CAP, Math.min(WHEEL_DELTA_CAP, deltaY));
  return clampPreviewZoom(current * Math.exp(-capped * rate));
}

export function previewWheelDeltaY(event: Pick<WheelEvent, "deltaY" | "deltaMode">): number {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * 400;
  return event.deltaY;
}

export function stepPreviewZoom(zoom: number, direction: 1 | -1): number {
  return clampPreviewZoom(
    Math.round((zoom + direction * ZOOM_STEP) * 100) / 100,
  );
}

/** Fit scale from the frame box, not the scrollbar client box. */
export function nextPreviewFitScale(
  prev: number,
  boxWidth: number,
  boxHeight: number,
  pageWidth: number,
  pageHeight: number,
): number {
  const w = Math.max(120, boxWidth - FIT_PAD_PX);
  const h = Math.max(160, boxHeight - FIT_PAD_PX);
  const next = Math.min(w / pageWidth, h / pageHeight);
  if (!Number.isFinite(next) || next <= 0) return prev;
  return Math.abs(prev - next) < FIT_SCALE_EPSILON ? prev : next;
}

function formatZoomPercent(zoom: number): string {
  return String(Math.round(zoom * 100));
}

export function parsePreviewZoomPercent(raw: string): number | null {
  const cleaned = raw.trim().replace(/%/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return clampPreviewZoom(n / 100);
}

function previewCanvasSize(
  viewportClient: number,
  pagePx: number,
  scale: number,
  canvasPad: number,
): number {
  return Math.max(viewportClient, pagePx * scale + canvasPad);
}

/** Keep the page point under the cursor still after a scale change. */
export function previewZoomAnchorScroll({
  clientWidth,
  clientHeight,
  scrollLeft,
  scrollTop,
  cursorOffsetX,
  cursorOffsetY,
  pageWidth,
  pageHeight,
  oldScale,
  newScale,
  canvasPad,
  pageCount,
  stackGap,
}: {
  clientWidth: number;
  clientHeight: number;
  scrollLeft: number;
  scrollTop: number;
  cursorOffsetX: number;
  cursorOffsetY: number;
  pageWidth: number;
  pageHeight: number;
  oldScale: number;
  newScale: number;
  canvasPad: number;
  pageCount?: number;
  stackGap?: number;
}): { scrollLeft: number; scrollTop: number } {
  if (!(oldScale > 0) || !(newScale > 0) || oldScale === newScale) {
    return { scrollLeft, scrollTop };
  }
  const sheets = Math.max(1, pageCount ?? 1);
  const gap = stackGap ?? 0;
  const oldContentW = pageWidth * oldScale;
  const newContentW = pageWidth * newScale;
  const oldContentH =
    pageHeight * oldScale * sheets + gap * Math.max(0, sheets - 1);
  const newContentH =
    pageHeight * newScale * sheets + gap * Math.max(0, sheets - 1);
  const oldOffsetX =
    (Math.max(clientWidth, oldContentW + canvasPad) - oldContentW) / 2;
  const oldOffsetY =
    (Math.max(clientHeight, oldContentH + canvasPad) - oldContentH) / 2;
  const pageX = (scrollLeft + cursorOffsetX - oldOffsetX) / oldScale;
  const pageY = (scrollTop + cursorOffsetY - oldOffsetY) / oldScale;
  const newOffsetX =
    (Math.max(clientWidth, newContentW + canvasPad) - newContentW) / 2;
  const newOffsetY =
    (Math.max(clientHeight, newContentH + canvasPad) - newContentH) / 2;
  return {
    scrollLeft: pageX * newScale + newOffsetX - cursorOffsetX,
    scrollTop: pageY * newScale + newOffsetY - cursorOffsetY,
  };
}

export function LetterheadPreviewPane({
  model,
  defaultZoom = 1,
  onPrint,
  onDownload,
  printBusy = false,
}: {
  model: LetterheadPagePreviewModel | null;
  defaultZoom?: number;
  onPrint?: () => void;
  onDownload?: () => void;
  printBusy?: boolean;
}) {
  const openingZoom = clampPreviewZoom(defaultZoom);
  const frameRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(openingZoom);
  const [zoomDraft, setZoomDraft] = useState(formatZoomPercent(openingZoom));
  const zoomInputFocusedRef = useRef(false);
  const [fitScale, setFitScale] = useState(0.45);
  const [pageCount, setPageCount] = useState(1);
  const pinchRef = useRef<{ startZoom: number; startDistance: number } | null>(
    null,
  );
  const gestureStartZoomRef = useRef(1);
  const gestureActiveRef = useRef(false);
  const dragRef = useRef<{
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const fitScaleRef = useRef(fitScale);
  fitScaleRef.current = fitScale;
  const pageSize = model?.pageSize ?? "a4";
  const pageSizeRef = useRef(pageSize);
  pageSizeRef.current = pageSize;
  const pageCountRef = useRef(pageCount);
  pageCountRef.current = pageCount;
  const pendingScrollRef = useRef<{ scrollLeft: number; scrollTop: number } | null>(
    null,
  );

  const queueZoomAnchor = useCallback(
    (clientX: number, clientY: number, oldZoom: number, newZoom: number) => {
      const el = viewportRef.current;
      if (!el || oldZoom === newZoom) return;
      const page = letterheadPagePx(pageSizeRef.current);
      const rect = el.getBoundingClientRect();
      pendingScrollRef.current = previewZoomAnchorScroll({
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        cursorOffsetX: clientX - rect.left,
        cursorOffsetY: clientY - rect.top,
        pageWidth: page.width,
        pageHeight: page.height,
        oldScale: fitScaleRef.current * oldZoom,
        newScale: fitScaleRef.current * newZoom,
        canvasPad: CANVAS_PAD_PX,
        pageCount: pageCountRef.current,
        stackGap: PAGE_STACK_GAP_PX,
      });
    },
    [],
  );

  useEffect(() => {
    setZoom(openingZoom);
  }, [pageSize, openingZoom]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !model) return;
    const page = letterheadPagePx(model.pageSize);
    function measure() {
      setFitScale((prev) =>
        nextPreviewFitScale(
          prev,
          frame.clientWidth,
          frame.clientHeight,
          page.width,
          page.height,
        ),
      );
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [model]);

  const applyZoom = useCallback((next: number) => {
    setZoom(clampPreviewZoom(next));
  }, []);

  useEffect(() => {
    if (zoomInputFocusedRef.current) return;
    setZoomDraft(formatZoomPercent(zoom));
  }, [zoom]);

  useLayoutEffect(() => {
    const pending = pendingScrollRef.current;
    const el = viewportRef.current;
    if (!pending || !el) return;
    pendingScrollRef.current = null;
    el.scrollLeft = pending.scrollLeft;
    el.scrollTop = pending.scrollTop;
  }, [zoom]);

  const commitZoomDraft = useCallback(() => {
    const next = parsePreviewZoomPercent(zoomDraft);
    if (next == null) {
      setZoomDraft(formatZoomPercent(zoomRef.current));
      return;
    }
    applyZoom(next);
    setZoomDraft(formatZoomPercent(next));
  }, [applyZoom, zoomDraft]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    function onWheel(event: WheelEvent) {
      if (!previewWheelShouldZoom(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (gestureActiveRef.current) return;
      const current = zoomRef.current;
      const next = applyPreviewWheelZoom(
        current,
        previewWheelDeltaY(event),
        false,
      );
      queueZoomAnchor(event.clientX, event.clientY, current, next);
      setZoom(next);
    }

    function onGestureStart(event: Event) {
      event.preventDefault();
      gestureActiveRef.current = true;
      gestureStartZoomRef.current = zoomRef.current;
    }

    function onGestureChange(event: Event) {
      event.preventDefault();
      const scale = (event as Event & { scale?: number }).scale;
      if (typeof scale !== "number" || scale <= 0) return;
      const next = clampPreviewZoom(gestureStartZoomRef.current * scale);
      const point = event as Event & { clientX?: number; clientY?: number };
      if (typeof point.clientX === "number" && typeof point.clientY === "number") {
        queueZoomAnchor(point.clientX, point.clientY, zoomRef.current, next);
      }
      applyZoom(next);
    }

    function onGestureEnd(event: Event) {
      event.preventDefault();
      gestureActiveRef.current = false;
    }

    function touchDistance(a: Touch, b: Touch): number {
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 2) return;
      pinchRef.current = {
        startZoom: zoomRef.current,
        startDistance: touchDistance(event.touches[0], event.touches[1]),
      };
    }

    function onTouchMove(event: TouchEvent) {
      const pinch = pinchRef.current;
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const distance = touchDistance(event.touches[0], event.touches[1]);
      if (pinch.startDistance <= 0) return;
      const next = clampPreviewZoom(
        pinch.startZoom * (distance / pinch.startDistance),
      );
      queueZoomAnchor(
        (event.touches[0].clientX + event.touches[1].clientX) / 2,
        (event.touches[0].clientY + event.touches[1].clientY) / 2,
        zoomRef.current,
        next,
      );
      applyZoom(next);
    }

    function onTouchEnd() {
      if (!pinchRef.current) return;
      pinchRef.current = null;
    }

    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    el.addEventListener("gesturestart", onGestureStart, { passive: false });
    el.addEventListener("gesturechange", onGestureChange, { passive: false });
    el.addEventListener("gestureend", onGestureEnd, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel, true);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", onGestureEnd);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [applyZoom, queueZoomAnchor]);

  const pageLabel = model?.pageSize === "a5" ? "A5" : "A4";
  const page = model ? letterheadPagePx(model.pageSize) : null;
  const scale = fitScale * zoom;
  const canvasWidth = page ? page.width * scale + CANVAS_PAD_PX : 0;
  const stackHeight = page
    ? page.height * scale * pageCount +
      PAGE_STACK_GAP_PX * Math.max(0, pageCount - 1)
    : 0;
  const canvasHeight = stackHeight + CANVAS_PAD_PX;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-neutral-200">
      <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Preview</p>
          <p className="text-xs text-muted-foreground">
            Live {pageLabel} {pageCount > 1 ? "pages" : "page"}. Scroll to move.
            Ctrl/⌘+scroll or pinch to zoom.
          </p>
        </div>
        <div
          className="flex shrink-0 items-center gap-1"
          data-testid="letterhead-zoom-controls"
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={zoom <= ZOOM_MIN}
            aria-label="Zoom out"
            onClick={() => applyZoom(stepPreviewZoom(zoom, -1))}
          >
            <Minus className="h-4 w-4" aria-hidden />
          </Button>
          <label className="ml-0.5 inline-flex h-8 items-center rounded-md border border-input bg-background px-1.5">
            <input
              type="text"
              inputMode="numeric"
              enterKeyHint="done"
              aria-label="Zoom percent"
              data-testid="letterhead-zoom-percent"
              className="w-9 bg-transparent text-center text-sm tabular-nums text-foreground outline-none"
              value={zoomDraft}
              onFocus={(event) => {
                zoomInputFocusedRef.current = true;
                event.currentTarget.select();
              }}
              onChange={(event) => setZoomDraft(event.target.value)}
              onBlur={() => {
                zoomInputFocusedRef.current = false;
                commitZoomDraft();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setZoomDraft(formatZoomPercent(zoomRef.current));
                  event.currentTarget.blur();
                }
              }}
            />
            <span className="text-sm text-muted-foreground" aria-hidden>
              %
            </span>
          </label>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={zoom >= ZOOM_MAX}
            aria-label="Zoom in"
            onClick={() => applyZoom(stepPreviewZoom(zoom, 1))}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-1 h-8"
            disabled={zoom === 1}
            aria-label="Back to 100%"
            onClick={() => applyZoom(1)}
          >
            100%
          </Button>
          {onPrint ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="ml-1 h-8 w-8"
              disabled={printBusy}
              aria-label="Print only"
              onClick={onPrint}
            >
              <Printer className="h-4 w-4" aria-hidden />
            </Button>
          ) : null}
          {onDownload ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={printBusy}
              aria-label="Download PDF"
              onClick={onDownload}
            >
              <Download className="h-4 w-4" aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>

      <div ref={frameRef} className="min-h-0 flex-1 overflow-hidden">
      <div
        ref={viewportRef}
        tabIndex={0}
        className="h-full cursor-grab overflow-auto [scrollbar-gutter:stable] select-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:cursor-grabbing"
        aria-label="Prescription preview"
        onKeyDown={(event) => {
          if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            applyZoom(stepPreviewZoom(zoomRef.current, 1));
          } else if (event.key === "-" || event.key === "_") {
            event.preventDefault();
            applyZoom(stepPreviewZoom(zoomRef.current, -1));
          } else if (event.key === "0") {
            event.preventDefault();
            applyZoom(1);
          }
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "touch" || event.button !== 0) return;
          const node = viewportRef.current;
          if (!node) return;
          event.preventDefault();
          dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            scrollLeft: node.scrollLeft,
            scrollTop: node.scrollTop,
          };
          node.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          const node = viewportRef.current;
          if (!drag || !node) return;
          node.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
          node.scrollTop = drag.scrollTop - (event.clientY - drag.y);
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      >
        {model ? (
          <div
            className="grid place-items-center"
            style={{
              minWidth: "100%",
              minHeight: "100%",
              width: canvasWidth,
              height: canvasHeight,
            }}
          >
            <LetterheadPagePreview
              model={model}
              variant="dialog"
              scale={scale}
              onPageCountChange={setPageCount}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Preview will appear here.
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
