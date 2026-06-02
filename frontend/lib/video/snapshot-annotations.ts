/**
 * Snapshot annotation types + render helpers (Sub-batch C ·
 * task-video-C4).
 *
 * Pure module — no React, no DOM-event assumptions, no fetch. Lives
 * here (not in `<AnnotationCanvas>`) so that:
 *
 *   - The same `Annotation` type can describe both DRAFT annotations
 *     (the editable canvas array the toolbar mutates) and PERSISTED
 *     annotations (the JSONB column the snapshot service stores).
 *   - The compositor that burns annotations onto a frozen frame is
 *     reusable — `captureSnapshot` calls it server-blind, but a
 *     future task-video-D3 review pane could call it too with the
 *     persisted overlay to redraw without re-uploading.
 *   - The shape stays in lock-step with the backend's
 *     `SnapshotAnnotation` union in `snapshot-storage-service.ts`.
 *     Hand-synced — there is no shared types package across
 *     frontend/backend yet (audited at task-video-C4 implementation
 *     time; Plan 06 + 07 + 08 likewise hand-sync, so this is the
 *     repo convention).
 *
 * Coordinate space: NATIVE PIXEL coordinates of the source video,
 * NOT CSS-pixel coordinates of the rendered canvas. The toolbar UI
 * is responsible for mapping pointer events from CSS → native via
 * the canvas's intrinsic vs displayed dimensions ratio. Same
 * convention `captureSnapshot`'s `dimensions` field uses.
 */

// ============================================================================
// Public types — MIRROR backend `SnapshotAnnotation` exactly.
// ============================================================================

export type AnnotationKind = "point" | "circle" | "arrow" | "text";

export type Annotation =
  | {
      kind: "point";
      x: number;
      y: number;
      color: string;
      size: number;
    }
  | {
      kind: "circle";
      cx: number;
      cy: number;
      r: number;
      color: string;
      width: number;
    }
  | {
      kind: "arrow";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
      width: number;
    }
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
      color: string;
      fontSize: number;
    };

// ============================================================================
// Toolbar palette + defaults (used by `<AnnotationCanvas>`)
// ============================================================================

/**
 * Default color palette for the annotation toolbar. Hex values only —
 * the backend validator rejects named colors. Reds and yellows highlight
 * well against most skin tones / clothing; blue + green reserved for
 * "non-clinical pointer" cases (e.g. circling a watch the patient is
 * wearing instead of a lesion).
 */
export const DEFAULT_ANNOTATION_PALETTE: ReadonlyArray<{
  label: string;
  hex: string;
}> = [
  { label: "Red", hex: "#ef4444" },
  { label: "Yellow", hex: "#eab308" },
  { label: "Blue", hex: "#3b82f6" },
  { label: "Green", hex: "#22c55e" },
];

/** Default stroke width (in image pixels) for new annotations. */
export const DEFAULT_STROKE_WIDTH = 4;

/** Default font size (in image pixels) for text annotations. */
export const DEFAULT_TEXT_FONT_SIZE = 24;

/** Default radius (in image pixels) for new point annotations. */
export const DEFAULT_POINT_SIZE = 6;

// ============================================================================
// Compositor — burns annotations onto the frozen frame canvas.
// ============================================================================

/**
 * Draw the supplied annotations onto a 2D context, in order. The
 * canvas is assumed to ALREADY hold the frozen frame at native
 * resolution; this function paints on top.
 *
 * Stroke / fill styling decisions:
 *
 *   - Points are filled solid circles (most readable at small sizes).
 *   - Circles are stroked outlines (drawing OVER the area of interest,
 *     not obscuring it).
 *   - Arrows are a stroke from `(x1,y1)` to `(x2,y2)` plus a 30-degree
 *     arrowhead at the tip, sized proportionally to `width`.
 *   - Text is filled with a 2px dark outline for legibility against
 *     mixed-tone backgrounds — same trick chyron generators use.
 *
 * Pure / synchronous — no async ImageBitmap dance. The compositor is
 * called once per Save, and Save is a deliberate user action, so the
 * sub-millisecond cost on a 1080p canvas is invisible.
 */
export function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: ReadonlyArray<Annotation>,
): void {
  for (const a of annotations) {
    ctx.save();
    switch (a.kind) {
      case "point": {
        ctx.fillStyle = a.color;
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.size, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "circle": {
        ctx.strokeStyle = a.color;
        ctx.lineWidth = a.width;
        ctx.beginPath();
        ctx.arc(a.cx, a.cy, a.r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "arrow": {
        drawArrow(ctx, a.x1, a.y1, a.x2, a.y2, a.color, a.width);
        break;
      }
      case "text": {
        // Outline first, then fill — gives white-on-anything legibility
        // without an opaque background plate that would obscure the
        // underlying anatomy.
        ctx.font = `bold ${a.fontSize}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
        ctx.textBaseline = "top";
        ctx.lineWidth = Math.max(2, a.fontSize * 0.12);
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.strokeText(a.text, a.x, a.y);
        ctx.fillStyle = a.color;
        ctx.fillText(a.text, a.x, a.y);
        break;
      }
      default: {
        // Defensive — keeps TypeScript exhaustiveness check honest if
        // a new kind is added without updating the renderer.
        const _exhaustive: never = a;
        return _exhaustive;
      }
    }
    ctx.restore();
  }
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
): void {
  // Base stroke.
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Arrowhead — 30-degree angle each side of the line.
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = Math.max(width * 4, 12);
  const headAngle = Math.PI / 6;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - headAngle),
    y2 - headLen * Math.sin(angle - headAngle),
  );
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + headAngle),
    y2 - headLen * Math.sin(angle + headAngle),
  );
  ctx.closePath();
  ctx.fill();
}

// ============================================================================
// Coordinate helpers
// ============================================================================

/**
 * Map a CSS-pixel pointer event coord to the canvas's native (image)
 * pixel coord, accounting for the canvas's intrinsic vs displayed
 * size. Used by the toolbar UI to translate `clientX`/`clientY` into
 * the storage-friendly native coords the validator expects.
 *
 * Returns `null` if the canvas hasn't been laid out yet
 * (`getBoundingClientRect` width/height of 0); the caller treats that
 * as "ignore this pointer event."
 */
export function cssToNativeCoords(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: Math.round((clientX - rect.left) * scaleX),
    y: Math.round((clientY - rect.top) * scaleY),
  };
}
