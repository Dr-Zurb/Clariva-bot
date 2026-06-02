"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type TouchList as ReactTouchList,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";

export interface ImageLightboxImage {
  src: string;
  alt: string;
  messageId: string;
}

export interface ImageLightboxProps {
  images: ImageLightboxImage[];
  initialIndex: number;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const DISMISS_THRESHOLD_PX = 100;
const NAV_SWIPE_THRESHOLD_PX = 80;
const SWIPE_AXIS_TOLERANCE_PX = 50;
const FADE_MS = 200;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function touchDistance(touches: ReactTouchList): number {
  if (touches.length < 2) return 0;
  const t0 = touches[0];
  const t1 = touches[1];
  if (!t0 || !t1) return 0;
  const dx = t0.clientX - t1.clientX;
  const dy = t0.clientY - t1.clientY;
  return Math.hypot(dx, dy);
}

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

/**
 * text-C2 — full-screen image viewer for chat attachments.
 * Pinch / wheel zoom, pan when zoomed, swipe nav + dismiss at 1×.
 */
export function ImageLightbox({
  images,
  initialIndex,
  onClose,
}: ImageLightboxProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(MIN_SCALE);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  const [dismissOffset, setDismissOffset] = useState(0);
  const [dismissing, setDismissing] = useState(false);

  const dragRef = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    mode: "none" | "pan" | "swipe";
  }>({ pointerId: null, startX: 0, startY: 0, originX: 0, originY: 0, mode: "none" });

  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);

  const current = images[index];
  const showCounter = images.length > 1;

  const resetView = useCallback(() => {
    setScale(MIN_SCALE);
    setTranslate({ x: 0, y: 0 });
    setDismissOffset(0);
  }, []);

  const goPrev = useCallback(() => {
    setIndex((i) => (i - 1 + images.length) % images.length);
    resetView();
  }, [images.length, resetView]);

  const goNext = useCallback(() => {
    setIndex((i) => (i + 1) % images.length);
    resetView();
  }, [images.length, resetView]);

  const finishDismiss = useCallback(() => {
    setDismissing(true);
    setDismissOffset(window.innerHeight);
    window.setTimeout(onClose, FADE_MS);
  }, [onClose]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const raf = window.requestAnimationFrame(() => setVisible(true));
    closeBtnRef.current?.focus();
    return () => window.cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    return () => {
      returnFocusRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
        return;
      }
      if (e.key === "0" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        resetView();
        return;
      }
      if (e.key !== "Tab") return;

      const focusables = focusableElements(dialog);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev, onClose, resetView]);

  const handleWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      setScale((prev) => {
        const next = clamp(prev - e.deltaY * 0.002, MIN_SCALE, MAX_SCALE);
        if (next <= MIN_SCALE) {
          setTranslate({ x: 0, y: 0 });
        }
        return next;
      });
    },
    [],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: translate.x,
        originY: translate.y,
        mode: scale > MIN_SCALE ? "pan" : "swipe",
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [scale, translate.x, translate.y],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (drag.pointerId !== e.pointerId) return;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      if (drag.mode === "pan" && scale > MIN_SCALE) {
        setTranslate({ x: drag.originX + dx, y: drag.originY + dy });
        return;
      }

      if (drag.mode === "swipe" && scale <= MIN_SCALE) {
        if (Math.abs(dy) > Math.abs(dx) && dy > 0) {
          setDismissOffset(dy);
        }
      }
    },
    [scale],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (drag.pointerId !== e.pointerId) return;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      dragRef.current = {
        pointerId: null,
        startX: 0,
        startY: 0,
        originX: 0,
        originY: 0,
        mode: "none",
      };

      if (scale <= MIN_SCALE) {
        if (
          dy > DISMISS_THRESHOLD_PX &&
          Math.abs(dx) < SWIPE_AXIS_TOLERANCE_PX
        ) {
          finishDismiss();
          return;
        }
        if (
          Math.abs(dx) > NAV_SWIPE_THRESHOLD_PX &&
          Math.abs(dy) < SWIPE_AXIS_TOLERANCE_PX &&
          showCounter
        ) {
          if (dx < 0) goNext();
          else goPrev();
        }
      }

      setDismissOffset(0);
    },
    [finishDismiss, goNext, goPrev, scale, showCounter],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2) {
        pinchRef.current = {
          distance: touchDistance(e.touches),
          scale,
        };
      }
    },
    [scale],
  );

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    e.preventDefault();
    const distance = touchDistance(e.touches);
    if (distance <= 0 || pinchRef.current.distance <= 0) return;
    const ratio = distance / pinchRef.current.distance;
    const next = clamp(pinchRef.current.scale * ratio, MIN_SCALE, MAX_SCALE);
    setScale(next);
    if (next <= MIN_SCALE) {
      setTranslate({ x: 0, y: 0 });
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    pinchRef.current = null;
  }, []);

  if (!current || typeof document === "undefined") return null;

  const content = (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      data-testid="image-lightbox"
      className={
        "fixed inset-0 z-[85] flex flex-col bg-black transition-opacity duration-200 " +
        (visible && !dismissing ? "opacity-100" : "opacity-0")
      }
      style={{ touchAction: "none" }}
    >
      <button
        ref={closeBtnRef}
        type="button"
        onClick={onClose}
        className="absolute left-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-2xl leading-none text-white hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        aria-label="Close image viewer"
        data-testid="image-lightbox-close"
      >
        ×
      </button>

      {showCounter ? (
        <div
          className="absolute right-3 top-3 z-10 rounded-full bg-black/50 px-3 py-1 text-sm text-white"
          aria-live="polite"
          data-testid="image-lightbox-counter"
        >
          {index + 1} / {images.length}
        </div>
      ) : null}

      {showCounter ? (
        <>
          <button
            type="button"
            onClick={goPrev}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 px-3 py-4 text-2xl text-white hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Previous image"
            data-testid="image-lightbox-prev"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goNext}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 px-3 py-4 text-2xl text-white hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label="Next image"
            data-testid="image-lightbox-next"
          >
            ›
          </button>
        </>
      ) : null}

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-12 py-14"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        data-testid="image-lightbox-viewport"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL viewer; no next/image domain config */}
        <img
          key={current.messageId}
          src={current.src}
          alt={current.alt}
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate(${translate.x}px, ${translate.y + dismissOffset}px) scale(${scale})`,
            transition: dismissing
              ? `transform ${FADE_MS}ms ease-out`
              : dismissOffset > 0
                ? "none"
                : undefined,
          }}
        />
      </div>

      {/* Prefetch adjacent signed URLs already in memory */}
      {showCounter ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[(index + 1) % images.length]?.src}
            alt=""
            aria-hidden
            className="hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[(index - 1 + images.length) % images.length]?.src}
            alt=""
            aria-hidden
            className="hidden"
          />
        </>
      ) : null}
    </div>
  );

  return createPortal(content, document.body);
}
