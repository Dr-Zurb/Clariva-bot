/**
 * Snapshot capture (Sub-batch C · task-video-C3)
 *
 * Pure utilities + a single async entry point that:
 *
 *   1. Draws the current frame of an `HTMLVideoElement` onto an
 *      offscreen `<canvas>` at the source video's native resolution.
 *   2. Encodes the frame as JPEG (quality 0.92) → Blob → ArrayBuffer →
 *      base64 string.
 *   3. POSTs the base64 payload to the backend
 *      `/api/v1/consultation/:sessionId/snapshots` route.
 *   4. Resolves with `{ snapshotId, url, attachmentPath }` or rejects
 *      with a typed `SnapshotError`.
 *
 * Why JSON+base64 instead of the multipart approach the task draft
 * suggested: see `backend/src/controllers/consultation-controller.ts`
 * (`postSnapshotHandler` JSDoc) — short version is "no new dependency,
 * fits the existing 10 MB express body cap, ~33% encoding overhead is
 * fine for the <1 MB typical snapshot."
 *
 * Failure-mode taxonomy (drives the controls UX):
 *   - `'no-video-track'`     — videoEl has no source, isn't ready, or
 *                              produced 0×0 dimensions. Toast "Couldn't
 *                              capture frame — try again."
 *   - `'canvas-unsupported'` — `getContext('2d')` returned null
 *                              (essentially never happens in modern
 *                              browsers; included for defensive completeness).
 *   - `'encode-failed'`      — `canvas.toBlob` produced no blob.
 *   - `'http-403'`           — backend rejected with 403 (patient
 *                              consent missing). Surface the backend's
 *                              copy verbatim.
 *   - `'http-401'`           — bearer rejected. Surface "Reconnect and
 *                              try again."
 *   - `'http-other'`         — anything else with a status code; the
 *                              backend message rides through.
 *   - `'network'`            — fetch threw (offline, DNS, CORS).
 *
 * **No PHI written to disk on the local device** — the JPEG round-trips
 * through a Blob → ArrayBuffer → base64 string in memory only; nothing
 * touches localStorage / IndexedDB / temp files.
 *
 * @see backend/src/services/snapshot-storage-service.ts
 * @see frontend/components/consultation/SnapshotControls.tsx
 */

import { requireApiBaseUrl } from "@/lib/api-base";
import type { Annotation } from "@/lib/video/snapshot-annotations";

// ============================================================================
// Public types
// ============================================================================

export type SnapshotErrorCode =
  | "no-video-track"
  | "canvas-unsupported"
  | "encode-failed"
  | "http-401"
  | "http-403"
  | "http-other"
  | "network";

export class SnapshotError extends Error {
  readonly code: SnapshotErrorCode;
  readonly httpStatus?: number;

  constructor(code: SnapshotErrorCode, message: string, httpStatus?: number) {
    super(message);
    this.name = "SnapshotError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export interface CaptureSnapshotOptions {
  videoEl: HTMLVideoElement;
  sessionId: string;
  /**
   * Bearer JWT for the backend route. Doctor-side: the dashboard
   * Supabase access token. Patient-side: the scoped Supabase JWT
   * minted by `POST /:sessionId/text-token`. Same token the chat
   * channel uses (mirrors `signAttachmentUrls` in lib/api.ts).
   */
  accessToken: string;
  /**
   * Whether the caller is capturing their own tile (`'self'`) or the
   * other party's tile (`'remote'`). Drives the visibility metadata
   * on the persisted row — Migration 084's RLS hides
   * `target='remote' AND capturer_role='doctor'` from patient viewers.
   */
  target: "self" | "remote";
  /** Optional JPEG quality override; defaults to 0.92. Range 0..1. */
  quality?: number;
  /**
   * Sub-batch C · task-video-C4 — when present, BYPASSES the
   * draw-from-videoEl + JPEG-encode steps and uses this blob as the
   * upload payload. The annotation flow uses this to pass a
   * precomposited frozen-frame-with-overlay JPEG that the
   * `<AnnotationCanvas>` component already produced (one canvas
   * encode at Save time, instead of two: one to capture, one to
   * composite).
   *
   * When set, `videoEl` is consulted ONLY to read the source
   * dimensions for the upload metadata (so the persisted row's
   * `metadata.dimensions` matches the blob). The blob's actual
   * pixel size is the load-bearing dimension; the metadata is
   * audit/telemetry.
   */
  prerenderedBlob?: Blob;
  /**
   * Sub-batch C · task-video-C4 — structured annotation overlay
   * record. Forwarded to the backend's `metadata.annotations`
   * field. The persisted JPEG is already composited (the toolbar
   * burned the strokes onto the raster before encoding); this
   * array is the structured companion record for re-rendering /
   * forensics / clinical-record export.
   *
   * When non-empty, the persisted row gets `metadata.annotated =
   * true` and the system banner reads "annotated a snapshot"
   * instead of "captured a snapshot". When omitted or empty, the
   * snapshot is treated as a plain C3 capture.
   */
  annotations?: ReadonlyArray<Annotation>;
}

export interface CapturedSnapshot {
  snapshotId: string;
  url: string;
  attachmentPath: string;
  /** Native pixel dimensions captured (after `videoWidth/Height` read). */
  dimensions: { width: number; height: number };
  /** Decoded byte size of the JPEG (sanity-check for telemetry). */
  byteSize: number;
}

// ============================================================================
// Pure helpers (exported for unit-test reuse)
// ============================================================================

/**
 * Read the source video's native pixel dimensions. Returns null when
 * the element isn't ready (`videoWidth/Height` are 0 until metadata
 * loads OR after the source detaches).
 *
 * Important: `clientWidth/Height` would be the rendered CSS box, NOT
 * the source resolution. Snapshots must capture native pixels for the
 * clinical-record use case — a 1920×1080 patient tile rendered at
 * 480×270 css should still capture at 1920×1080.
 */
export function readVideoDimensions(
  videoEl: HTMLVideoElement,
): { width: number; height: number } | null {
  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;
  if (!w || !h || w <= 0 || h <= 0) return null;
  return { width: w, height: h };
}

/**
 * Convert an `ArrayBuffer` to base64 in the browser, chunked to avoid
 * `String.fromCharCode(...)` argument-count blow-ups on large buffers
 * (Chrome's argument cap is around 65535; Firefox's is lower).
 *
 * Exported for unit-test reuse.
 */
export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000; // 32 KB chunks — well below any browser cap.
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

// ============================================================================
// Main entry point
// ============================================================================

const DEFAULT_JPEG_QUALITY = 0.92;

export async function captureSnapshot(
  options: CaptureSnapshotOptions,
): Promise<CapturedSnapshot> {
  const { videoEl, sessionId, accessToken, target } = options;
  const quality =
    typeof options.quality === "number" && options.quality > 0 && options.quality <= 1
      ? options.quality
      : DEFAULT_JPEG_QUALITY;

  const dims = readVideoDimensions(videoEl);
  if (!dims) {
    throw new SnapshotError(
      "no-video-track",
      "Couldn't capture frame — the video isn't playing yet. Try again.",
    );
  }

  // ----------------------------------------------------------------------
  // 1. Produce the JPEG blob.
  //
  //    - Plain C3 path: draw the live videoEl to an offscreen canvas
  //      and encode via toBlob.
  //    - C4 annotation path: caller supplies a pre-composited blob
  //      (the AnnotationCanvas component already drew the frozen frame
  //      + the annotation overlay onto its own canvas and called
  //      toBlob there). We skip the encode and just upload it.
  // ----------------------------------------------------------------------
  let blob: Blob | null;
  if (options.prerenderedBlob) {
    if (options.prerenderedBlob.size === 0) {
      throw new SnapshotError(
        "encode-failed",
        "Couldn't encode the annotated snapshot. Try again.",
      );
    }
    blob = options.prerenderedBlob;
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new SnapshotError(
        "canvas-unsupported",
        "Your browser can't capture snapshots. Try a different browser.",
      );
    }
    ctx.drawImage(videoEl, 0, 0, dims.width, dims.height);

    blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
    });
    if (!blob || blob.size === 0) {
      throw new SnapshotError(
        "encode-failed",
        "Couldn't encode the snapshot. Try again.",
      );
    }
  }

  // ----------------------------------------------------------------------
  // 2. Encode → ArrayBuffer → base64.
  // ----------------------------------------------------------------------
  const arrayBuf = await blob.arrayBuffer();
  const jpegBase64 = arrayBufferToBase64(arrayBuf);

  // ----------------------------------------------------------------------
  // 3. POST to the backend. `annotations` is forwarded only when
  //    non-empty (omitting the field keeps the backend's "no
  //    annotations" branch hot, avoiding extra JSONB parsing on the
  //    common C3 path).
  // ----------------------------------------------------------------------
  const url = `${requireApiBaseUrl()}/api/v1/consultation/${encodeURIComponent(sessionId)}/snapshots`;
  const body: Record<string, unknown> = {
    jpegBase64,
    target,
    dimensions: { width: dims.width, height: dims.height },
  };
  if (options.annotations && options.annotations.length > 0) {
    body.annotations = options.annotations;
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    throw new SnapshotError(
      "network",
      err instanceof Error
        ? `Network error: ${err.message}`
        : "Couldn't reach the server. Check your connection and retry.",
    );
  }

  // The backend uses the standard `successResponse` / `errorResponse`
  // envelope (see `backend/src/utils/response.ts`); decode JSON
  // optimistically and discriminate on `success`.
  type ResponseShape =
    | {
        success: true;
        data: { snapshotId: string; url: string; attachmentPath: string };
      }
    | {
        success: false;
        error: { code: string; message: string; statusCode?: number };
      };
  let json: ResponseShape | undefined;
  try {
    json = (await res.json()) as ResponseShape;
  } catch {
    // Fall through with undefined — handled below.
  }

  if (!res.ok) {
    const message =
      json && json.success === false
        ? json.error.message
        : `Snapshot upload failed (${res.status}).`;
    if (res.status === 401) {
      throw new SnapshotError("http-401", message, 401);
    }
    if (res.status === 403) {
      throw new SnapshotError("http-403", message, 403);
    }
    throw new SnapshotError("http-other", message, res.status);
  }
  if (!json || json.success !== true) {
    throw new SnapshotError(
      "http-other",
      "Unexpected response shape from snapshot backend.",
      res.status,
    );
  }

  return {
    snapshotId: json.data.snapshotId,
    url: json.data.url,
    attachmentPath: json.data.attachmentPath,
    dimensions: { width: dims.width, height: dims.height },
    byteSize: blob.size,
  };
}

// ============================================================================
// Frame freeze helper (Sub-batch C · task-video-C4)
// ============================================================================

/**
 * Capture the current frame of `videoEl` to a fresh `<canvas>` at
 * native resolution and return both the canvas (for the annotation
 * surface to draw on) and its dimensions. Does NOT pause the video —
 * the caller is responsible for the lifecycle (`videoEl.pause()` /
 * `play()`), so this helper stays composable for callers that just
 * want a frozen frame without taking the video out of play state.
 *
 * Used by `<VideoRoom>` when entering annotation mode. The returned
 * canvas becomes the BACKGROUND of `<AnnotationCanvas>` — the
 * annotation overlay is drawn on top, then on Save the two are
 * composited together (still on the same canvas) and uploaded via
 * `captureSnapshot({ prerenderedBlob, ... })`.
 *
 * Returns `null` when the video element has no source / hasn't
 * loaded metadata yet — caller should toast the same "video not
 * ready" copy `captureSnapshot` uses on the same failure mode.
 */
export function freezeVideoFrame(
  videoEl: HTMLVideoElement,
): { canvas: HTMLCanvasElement; dimensions: { width: number; height: number } } | null {
  const dims = readVideoDimensions(videoEl);
  if (!dims) return null;
  const canvas = document.createElement("canvas");
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(videoEl, 0, 0, dims.width, dims.height);
  return { canvas, dimensions: dims };
}
