/**
 * AnnotationCanvas (Sub-batch C · task-video-C4)
 *
 * Modal-overlay canvas surface for drawing on top of a frozen video
 * frame. The toolbar offers four annotation tools (Point / Circle /
 * Arrow / Text), a 4-color palette, a stroke-width control, undo,
 * save, and cancel.
 *
 * --- Lifecycle ---
 *
 *   1. Parent (`<VideoRoom>`) freezes the remote video and produces a
 *      `frameCanvas` via `freezeVideoFrame(videoEl)` from
 *      `lib/video/snapshot-capture.ts`.
 *   2. Parent renders `<AnnotationCanvas>` with that canvas + native
 *      dimensions; the component blits the frame to its INTERNAL
 *      canvas, then redraws on every annotation change.
 *   3. User draws. Each finished gesture appends an `Annotation` to
 *      the in-memory list. Undo pops the last one. Cancel discards
 *      the whole list and calls `onCancel()`.
 *   4. On Save, the component's canvas — already showing
 *      "frame + annotations" — is encoded as JPEG and handed back via
 *      `onSave({ blob, annotations })`. The parent then passes the
 *      blob to `captureSnapshot({ prerenderedBlob, annotations, ... })`.
 *
 * --- Why not separate "frame layer" and "overlay layer" canvases ---
 *
 * Two-canvas designs (background image + transparent overlay) read as
 * "cleaner" but cost a second compositor pass at Save time. With one
 * canvas we just call `toBlob` directly. The trade-off is that any
 * "Edit Annotations" feature would require remembering the original
 * frame and re-blitting + re-drawing — that's fine because the spec
 * (Out-of-scope §3) says annotations are immutable once saved.
 *
 * --- Coordinate space ---
 *
 * Internal canvas is at NATIVE PIXEL resolution of the source video
 * (matches what `captureSnapshot` would have uploaded for a plain C3
 * snapshot). The CSS box is sized via `style.maxWidth/Height` to fit
 * the modal viewport. Pointer events are translated CSS → native via
 * `cssToNativeCoords` so the persisted annotation coords are stable
 * regardless of the device the doctor was using.
 *
 * --- Z-index / modal posture ---
 *
 * Renders as `fixed inset-0 z-[70]` (one above the snapshot flash at
 * z-60, one below the EndCall confirm modal at z-50… wait, that's
 * inverted — see the z-index inventory in `<VideoRoom>` for the
 * arbiter; the gist is "above flash, below EndCall confirm"). Backdrop
 * is `bg-black/60` to dim everything else and signal modal-ness. ESC
 * closes (cancel). Click-outside-the-canvas closes too — same affordance
 * as `<EndCallConfirmModal>`.
 *
 * @see frontend/lib/video/snapshot-annotations.ts (Annotation type +
 *      `drawAnnotations` compositor + `cssToNativeCoords`)
 * @see frontend/lib/video/snapshot-capture.ts (consumes the blob via
 *      the `prerenderedBlob` input).
 */

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type Annotation,
  type AnnotationKind,
  cssToNativeCoords,
  DEFAULT_ANNOTATION_PALETTE,
  DEFAULT_POINT_SIZE,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_TEXT_FONT_SIZE,
  drawAnnotations,
} from "@/lib/video/snapshot-annotations";

// ============================================================================
// Public types
// ============================================================================

export interface AnnotationCanvasProps {
  /**
   * Frozen frame canvas, sized at native resolution. Produced by
   * `freezeVideoFrame(videoEl)`. The component blits this onto its
   * own canvas as the background; the source canvas is never
   * mutated.
   */
  frameCanvas: HTMLCanvasElement;
  /**
   * Native pixel dimensions of the frozen frame. Same shape
   * `captureSnapshot` returns; mirrored on the persisted row's
   * `metadata.dimensions` for audit.
   */
  dimensions: { width: number; height: number };
  /**
   * Called when the user clicks Save. The blob is JPEG at
   * quality 0.92 (matches `captureSnapshot`'s default) and ALREADY
   * has the annotations composited onto the raster — the parent
   * just passes it straight to `captureSnapshot({ prerenderedBlob,
   * annotations })`.
   */
  onSave(payload: {
    blob: Blob;
    annotations: ReadonlyArray<Annotation>;
  }): void | Promise<void>;
  /** Called when the user clicks Cancel or hits ESC. */
  onCancel(): void;
  /**
   * Optional override for the JPEG quality at Save time. Defaults
   * to 0.92 to match `captureSnapshot`'s default.
   */
  jpegQuality?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_JPEG_QUALITY = 0.92;

const STROKE_WIDTH_OPTIONS: ReadonlyArray<{ label: string; value: number }> = [
  { label: "Thin", value: 2 },
  { label: "Medium", value: 4 },
  { label: "Thick", value: 8 },
];

// ============================================================================
// Internal drag-state machine
// ============================================================================

type DragState =
  | { kind: "none" }
  | { kind: "circle"; cx: number; cy: number }
  | { kind: "arrow"; x1: number; y1: number; x2: number; y2: number };

// ============================================================================
// Component
// ============================================================================

export default function AnnotationCanvas({
  frameCanvas,
  dimensions,
  onSave,
  onCancel,
  jpegQuality,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<AnnotationKind>("circle");
  const [color, setColor] = useState<string>(
    DEFAULT_ANNOTATION_PALETTE[0]?.hex ?? "#ef4444",
  );
  const [strokeWidth, setStrokeWidth] = useState<number>(DEFAULT_STROKE_WIDTH);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [drag, setDrag] = useState<DragState>({ kind: "none" });
  const [saving, setSaving] = useState(false);
  // Text-tool prompt is intentionally implemented with `window.prompt`
  // (see `handlePointerDownText`) — keeps this PR focused on canvas
  // mechanics. A nicer in-modal text input is a follow-up if doctors
  // hit the prompt's UX papercuts (browser style, no rich validation,
  // etc.).

  // ----------------------------------------------------------------------
  // Background blit + redraw on every annotation/drag change.
  // ----------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // 1. Frozen frame background.
    ctx.drawImage(frameCanvas, 0, 0, dimensions.width, dimensions.height);
    // 2. Persisted annotations.
    drawAnnotations(ctx, annotations);
    // 3. Live drag preview (drawn but NOT pushed to state until pointer-up).
    if (drag.kind === "circle") {
      // We can't preview a 0-radius circle yet (cursor hasn't moved).
      // Pointer-move handler below populates a real radius.
    } else if (drag.kind === "arrow") {
      drawAnnotations(ctx, [
        {
          kind: "arrow",
          x1: drag.x1,
          y1: drag.y1,
          x2: drag.x2,
          y2: drag.y2,
          color,
          width: strokeWidth,
        },
      ]);
    }
  }, [frameCanvas, dimensions, annotations, drag, color, strokeWidth]);

  // ----------------------------------------------------------------------
  // Pointer handlers — one per tool.
  // ----------------------------------------------------------------------

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || saving) return;
      e.preventDefault();
      // Capture the pointer so subsequent move/up land here even when the
      // user drags off the canvas (matches Skitch / Mac screenshot UX).
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Some test environments don't implement setPointerCapture; OK.
      }
      const native = cssToNativeCoords(canvas, e.clientX, e.clientY);
      if (!native) return;

      switch (tool) {
        case "point": {
          setAnnotations((arr) => [
            ...arr,
            {
              kind: "point",
              x: native.x,
              y: native.y,
              color,
              size: DEFAULT_POINT_SIZE * Math.max(1, strokeWidth / 4),
            },
          ]);
          break;
        }
        case "circle": {
          setDrag({ kind: "circle", cx: native.x, cy: native.y });
          break;
        }
        case "arrow": {
          setDrag({
            kind: "arrow",
            x1: native.x,
            y1: native.y,
            x2: native.x,
            y2: native.y,
          });
          break;
        }
        case "text": {
          // Browser-native prompt; lightweight, no extra modal management.
          // Empty / cancelled string just no-ops.
          const text = window.prompt("Annotation text", "");
          if (text && text.trim().length > 0) {
            setAnnotations((arr) => [
              ...arr,
              {
                kind: "text",
                x: native.x,
                y: native.y,
                text: text.trim(),
                color,
                fontSize: DEFAULT_TEXT_FONT_SIZE,
              },
            ]);
          }
          break;
        }
      }
    },
    [color, saving, strokeWidth, tool],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || saving) return;
      if (drag.kind === "none") return;
      const native = cssToNativeCoords(canvas, e.clientX, e.clientY);
      if (!native) return;
      if (drag.kind === "circle") {
        // Render preview by stuffing a temporary "drag arrow" through
        // the dependency array. Simpler: compute radius from the
        // current cursor and re-trigger draw via the drag state.
        // Implemented by overwriting the drag state — useEffect re-runs.
        const r = Math.hypot(native.x - drag.cx, native.y - drag.cy);
        setDrag({ kind: "circle", cx: drag.cx, cy: drag.cy });
        // To get the LIVE preview to render, we draw inline here
        // (faster than waiting for state-driven re-render). Falls
        // back to next paint if ctx is null.
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(
            frameCanvas,
            0,
            0,
            dimensions.width,
            dimensions.height,
          );
          drawAnnotations(ctx, annotations);
          drawAnnotations(ctx, [
            {
              kind: "circle",
              cx: drag.cx,
              cy: drag.cy,
              r,
              color,
              width: strokeWidth,
            },
          ]);
        }
      } else if (drag.kind === "arrow") {
        setDrag({
          kind: "arrow",
          x1: drag.x1,
          y1: drag.y1,
          x2: native.x,
          y2: native.y,
        });
      }
    },
    [annotations, color, dimensions, drag, frameCanvas, saving, strokeWidth],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // see setPointerCapture comment.
      }
      if (drag.kind === "none") return;
      const native = cssToNativeCoords(canvas, e.clientX, e.clientY);
      if (!native) {
        setDrag({ kind: "none" });
        return;
      }
      if (drag.kind === "circle") {
        const r = Math.hypot(native.x - drag.cx, native.y - drag.cy);
        if (r > 2) {
          setAnnotations((arr) => [
            ...arr,
            {
              kind: "circle",
              cx: drag.cx,
              cy: drag.cy,
              r,
              color,
              width: strokeWidth,
            },
          ]);
        }
      } else if (drag.kind === "arrow") {
        const distance = Math.hypot(
          native.x - drag.x1,
          native.y - drag.y1,
        );
        if (distance > 4) {
          setAnnotations((arr) => [
            ...arr,
            {
              kind: "arrow",
              x1: drag.x1,
              y1: drag.y1,
              x2: native.x,
              y2: native.y,
              color,
              width: strokeWidth,
            },
          ]);
        }
      }
      setDrag({ kind: "none" });
    },
    [color, drag, strokeWidth],
  );

  // ----------------------------------------------------------------------
  // Toolbar actions.
  // ----------------------------------------------------------------------

  const handleUndo = useCallback(() => {
    setAnnotations((arr) => (arr.length > 0 ? arr.slice(0, -1) : arr));
  }, []);

  const handleSave = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || saving) return;
    setSaving(true);
    try {
      // Re-blit + re-draw to ensure no in-flight drag preview is
      // accidentally baked into the saved blob.
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(frameCanvas, 0, 0, dimensions.width, dimensions.height);
        drawAnnotations(ctx, annotations);
      }
      const quality =
        typeof jpegQuality === "number" && jpegQuality > 0 && jpegQuality <= 1
          ? jpegQuality
          : DEFAULT_JPEG_QUALITY;
      const blob: Blob | null = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
      });
      if (!blob || blob.size === 0) {
        // Surface via a window.alert — annotation save failures are rare
        // (the canvas is already drawn at this point; only an OOM-y
        // browser would fail toBlob), so a bespoke error toast inside the
        // modal would be over-engineering. The parent's snapshot-error
        // toast covers the upload-failure paths.
        window.alert(
          "Couldn't encode the annotated snapshot. Try again.",
        );
        setSaving(false);
        return;
      }
      await onSave({ blob, annotations });
    } finally {
      setSaving(false);
    }
  }, [annotations, dimensions, frameCanvas, jpegQuality, onSave, saving]);

  const handleCancel = useCallback(() => {
    if (saving) return;
    onCancel();
  }, [onCancel, saving]);

  // ESC = cancel (matches `<EndCallConfirmModal>` doctrine).
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleCancel();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleCancel]);

  // ----------------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------------

  const aspectRatio = useMemo(
    () => `${dimensions.width} / ${dimensions.height}`,
    [dimensions.height, dimensions.width],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Annotate snapshot"
      data-testid="annotation-canvas-modal"
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/70 p-4"
      // Click on the backdrop (not the canvas / toolbar) cancels.
      onClick={(e) => {
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <div
        className="flex max-h-full w-full max-w-5xl flex-col gap-3 rounded-md bg-white p-3 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ============================================================ */}
        {/* Toolbar                                                      */}
        {/* ============================================================ */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-2">
          <div
            className="flex flex-wrap items-center gap-1"
            data-testid="annotation-tools"
          >
            {(
              [
                { id: "point", label: "Point" },
                { id: "circle", label: "Circle" },
                { id: "arrow", label: "Arrow" },
                { id: "text", label: "Text" },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTool(id)}
                disabled={saving}
                aria-pressed={tool === id}
                data-testid={`annotation-tool-${id}`}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                  tool === id
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}

            <span className="mx-2 h-5 w-px bg-gray-200" aria-hidden="true" />

            {/* Color palette */}
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Color">
              {DEFAULT_ANNOTATION_PALETTE.map(({ label, hex }) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setColor(hex)}
                  disabled={saving}
                  role="radio"
                  aria-checked={color === hex}
                  aria-label={label}
                  data-testid={`annotation-color-${hex.replace("#", "")}`}
                  className={`h-6 w-6 rounded-full border-2 transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                    color === hex
                      ? "border-gray-900"
                      : "border-gray-300 hover:border-gray-500"
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>

            <span className="mx-2 h-5 w-px bg-gray-200" aria-hidden="true" />

            {/* Stroke width */}
            <label className="sr-only" htmlFor="annotation-stroke-width">
              Stroke width
            </label>
            <select
              id="annotation-stroke-width"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              disabled={saving}
              className="rounded-md border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {STROKE_WIDTH_OPTIONS.map(({ label, value }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleUndo}
              disabled={saving || annotations.length === 0}
              data-testid="annotation-undo"
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              data-testid="annotation-cancel"
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              data-testid="annotation-save"
              className="rounded-md border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* Canvas                                                       */}
        {/* ============================================================ */}
        <div
          className="flex min-h-0 flex-1 items-center justify-center overflow-hidden"
          style={{ touchAction: "none" }}
        >
          <canvas
            ref={canvasRef}
            data-testid="annotation-canvas"
            className="max-h-full max-w-full cursor-crosshair rounded border border-gray-200 bg-black"
            style={{ aspectRatio }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        </div>

        <p className="text-xs text-gray-500">
          {tool === "text"
            ? "Click to place a text label."
            : tool === "point"
              ? "Click to add a point marker."
              : "Click and drag to draw."}{" "}
          ESC or Cancel to discard. Save uploads the annotated frame to the chat.
        </p>
      </div>
    </div>
  );
}
