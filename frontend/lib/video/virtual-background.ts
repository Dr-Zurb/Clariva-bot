/**
 * Sub-batch C · task-video-C2 — Virtual background / blur lifecycle.
 *
 * Wraps Twilio's `@twilio/video-processors` (decision §12 — preferred
 * over a custom MediaPipe pipeline). Exposes a small, stateful API
 * the `<VideoRoom>` and `<VirtualBackgroundPicker>` consume:
 *
 *   - `parseBackgroundPreference(stored?)` — coerce a `localStorage`
 *     string to the `BackgroundPreference` discriminated union.
 *   - `serializeBackgroundPreference(pref)` — round-trip the union
 *     back into a stored string.
 *   - `applyBackgroundToTrack(track, pref)` — async; removes any
 *     existing processor on the track, then mounts the requested
 *     processor (creating + loading the TFLite model on first use,
 *     reusing the cached instance after).
 *   - `removeBackgroundFromTrack(track)` — detaches whatever
 *     processor is currently bound. Used during low-power fallbacks
 *     and during quality / camera swaps before the new
 *     `LocalVideoTrack` lands.
 *
 * Why a stateful module (not "construct + apply per call"):
 *
 *   - Each `BackgroundProcessor` constructor downloads + initializes
 *     the WASM segmentation model (`selfie_segmentation_landscape.tflite`
 *     ~244 KB + a SIMD WASM binary ~2.5 MB). Re-doing that on every
 *     toggle would burn 1-2 seconds of CPU and bandwidth per click.
 *   - The cache is process-local — one entry per preference key.
 *     `'off'` doesn't allocate. `'blur-light'` and `'blur-heavy'`
 *     each get their own GaussianBlurBackgroundProcessor (Twilio's
 *     processors hold their own pipeline + worker, so shared use
 *     across tracks is safe per the README, but we keep one
 *     instance per radius for clarity).
 *   - On a fresh `LocalVideoTrack` from quality / camera swap, the
 *     parent calls `applyBackgroundToTrack(newTrack, pref)`, which
 *     re-uses the cached processor (no model reload) and just
 *     wires it into the new track via Twilio's `addProcessor`.
 *
 * The `image:*` preferences are accepted by the parser but are
 * NOT yet wired in v1 — designer-supplied JPGs are not in the
 * repo (decision §12 follow-up). The picker hides image options
 * for now; when assets land, `applyBackgroundToTrack` will route
 * `'image:clinic'` / `'image:neutral'` through `VirtualBackgroundProcessor`
 * with a preloaded `<img>` element. Stub branch is annotated below.
 *
 * Asset path:
 *
 *   `@twilio/video-processors` loads its WASM/TFLite/worker files
 *   at runtime from `assetsPath`. We copy them into
 *   `frontend/public/twilio-video-processors-assets/` via the
 *   `postinstall` script (`scripts/copy-twilio-video-processors-assets.mjs`).
 *   Same-origin hosting avoids the CORS / CSP gymnastics in
 *   Twilio's "Cross-Origin Configuration" docs — see the script
 *   header for the rationale.
 *
 * Capture-resolution note: Twilio's docs recommend `640x480 @ 24fps`
 * for best processor performance. We do NOT force that here — the
 * `<VideoQualityPicker>` (B8) owns capture-side constraints, and a
 * doctor on a high-end machine can still run blur at 720p / 1080p.
 * The processor degrades gracefully (lower output FPS) when the
 * hardware can't keep up. If a future low-power-mode (F4) wants
 * to force `640x480` while blur is on, that coupling lives in F4,
 * not here.
 */

import type { LocalVideoTrack } from "twilio-video";
// `@twilio/video-processors` references the browser-only `ImageData`
// global at module-evaluation time, so a static `import { … } from
// "@twilio/video-processors"` here breaks Next.js SSR (the appointment
// detail page server-renders this module's parents during dev). We
// keep type-only references and lazy-load the runtime values via
// `loadProcessorsModule()` below — that runs only after a user
// interaction that actually needs blur, which by definition is on
// the client.
import type {
  GaussianBlurBackgroundProcessor,
  VirtualBackgroundProcessor,
} from "@twilio/video-processors";

type VideoProcessorsModule = typeof import("@twilio/video-processors");
let processorsModulePromise: Promise<VideoProcessorsModule> | null = null;
function loadProcessorsModule(): Promise<VideoProcessorsModule> {
  if (!processorsModulePromise) {
    processorsModulePromise = import("@twilio/video-processors");
  }
  return processorsModulePromise;
}

/**
 * The background preference discriminated union. Stored at
 * `localStorage['video-bg-preference']` per the spec.
 *
 *   - `'off'`         — raw camera, no processing.
 *   - `'blur-light'`  — gentle gaussian blur (radius 8).
 *   - `'blur-heavy'`  — strong gaussian blur (radius 25).
 *   - `'image:<id>'`  — replace background with a preloaded image.
 *                       v1 only accepts `'image:clinic'` /
 *                       `'image:neutral'` via the type, but the
 *                       picker hides the option until designer
 *                       JPGs ship. Documented deferral.
 */
export type BackgroundPreference =
  | "off"
  | "blur-light"
  | "blur-heavy"
  | "image:clinic"
  | "image:neutral";

export const BACKGROUND_PREFERENCES: ReadonlyArray<BackgroundPreference> = [
  "off",
  "blur-light",
  "blur-heavy",
  "image:clinic",
  "image:neutral",
];

export const BACKGROUND_STORAGE_KEY = "video-bg-preference";
export const DEFAULT_BACKGROUND_PREFERENCE: BackgroundPreference = "off";

/**
 * Where the postinstall script writes the Twilio processor runtime
 * assets. Anchored at `/` (root of the Next.js public dir) so the
 * URL is stable in dev (`localhost:3000/...`), prod (`https://app.../...`),
 * and any preview deployment.
 */
const ASSETS_PATH = "/twilio-video-processors-assets/";

/**
 * Coerce an unknown string (e.g. from `localStorage`) into the
 * discriminated union. Returns `DEFAULT_BACKGROUND_PREFERENCE`
 * for anything that doesn't match — defensive against schema
 * drift if a future version of this module adds new variants
 * and an old browser tab still has a stale value.
 */
export function parseBackgroundPreference(
  value: string | null | undefined,
): BackgroundPreference {
  if (!value) return DEFAULT_BACKGROUND_PREFERENCE;
  if ((BACKGROUND_PREFERENCES as ReadonlyArray<string>).includes(value)) {
    return value as BackgroundPreference;
  }
  return DEFAULT_BACKGROUND_PREFERENCE;
}

/**
 * Round-trip the union back into a string. Trivial today (the
 * union values ARE strings), but exported as a function so the
 * shape can change without rippling string literals through
 * the codebase.
 */
export function serializeBackgroundPreference(
  pref: BackgroundPreference,
): string {
  return pref;
}

/**
 * Process-local cache of constructed + model-loaded processors.
 * Keyed by `BackgroundPreference` so a re-toggle to the same
 * preference reuses the existing instance.
 *
 * `'off'` is never cached (no processor needed). `'image:*'`
 * variants are intentionally not yet populated — the v1 picker
 * doesn't expose them; the branch in `applyBackgroundToTrack`
 * is a typed stub with a deferral comment.
 */
type CachedProcessor = GaussianBlurBackgroundProcessor | VirtualBackgroundProcessor;
const processorCache = new Map<BackgroundPreference, CachedProcessor>();

/**
 * Track the model-load promise per processor so concurrent calls
 * to `applyBackgroundToTrack` for the same preference don't kick
 * off two parallel TFLite loads. The first call awaits the load;
 * subsequent calls await the same promise.
 */
const loadPromises = new Map<BackgroundPreference, Promise<void>>();

async function getOrCreateBlurProcessor(
  pref: "blur-light" | "blur-heavy",
): Promise<GaussianBlurBackgroundProcessor> {
  const cached = processorCache.get(pref) as
    | GaussianBlurBackgroundProcessor
    | undefined;
  if (cached) {
    // Wait for any in-flight load promise so the caller never
    // hits an "addProcessor before loadModel resolved" race.
    const inflight = loadPromises.get(pref);
    if (inflight) await inflight;
    return cached;
  }

  // Lazy-load the Twilio module on first blur-on. The dynamic import
  // is what keeps SSR working — see the file-header comment.
  const mod = await loadProcessorsModule();

  // Twilio's defaults: blurFilterRadius defaults to 15. We pin
  // explicit values so the "light" / "heavy" labels are
  // self-documenting and stable across Twilio version bumps.
  const processor = new mod.GaussianBlurBackgroundProcessor({
    assetsPath: ASSETS_PATH,
    blurFilterRadius: pref === "blur-light" ? 8 : 25,
  });
  processorCache.set(pref, processor);

  const loadPromise = processor.loadModel();
  loadPromises.set(pref, loadPromise);
  try {
    await loadPromise;
  } finally {
    loadPromises.delete(pref);
  }
  return processor;
}

/**
 * Detach whatever processor is currently bound to the track,
 * if any. Safe to call when nothing is bound (Twilio's
 * `track.processor` is `null` in that case; we no-op).
 */
function detachExistingProcessor(track: LocalVideoTrack): void {
  const existing = track.processor;
  if (existing) {
    track.removeProcessor(existing);
  }
}

/**
 * Apply the requested preference to the local video track.
 *
 *   - `'off'`         → detach any existing processor; no-op
 *                        on a track that has none.
 *   - `'blur-light'`  → mount `GaussianBlurBackgroundProcessor(radius: 8)`.
 *   - `'blur-heavy'`  → mount `GaussianBlurBackgroundProcessor(radius: 25)`.
 *   - `'image:*'`     → DEFERRED — v1 picker hides image options;
 *                        no designer assets in repo yet. When the
 *                        JPGs land in `frontend/public/video-backgrounds/`,
 *                        this branch will preload an `<img>` and
 *                        construct a `VirtualBackgroundProcessor`.
 *                        Calling with `'image:*'` today resolves
 *                        with the track unchanged (better than
 *                        throwing — old tabs with stale prefs
 *                        degrade silently to "off"-equivalent).
 *
 * The `addProcessor` options follow Twilio's recommendation for
 * modern Chromium browsers: `videoframe` input + `bitmaprenderer`
 * output for the Insertable Streams API path. Older browsers fall
 * back to canvas pipelines automatically inside Twilio's processor.
 *
 * Errors propagate to the caller — `<VideoRoom>` will surface them
 * as an inline notice (same precedent as the PiP failure pill in
 * task-video-B7) so a missing/CORS-blocked WASM doesn't leave the
 * doctor wondering why the picker did nothing.
 */
export async function applyBackgroundToTrack(
  track: LocalVideoTrack,
  pref: BackgroundPreference,
): Promise<void> {
  if (pref === "off") {
    detachExistingProcessor(track);
    return;
  }

  if (pref === "blur-light" || pref === "blur-heavy") {
    const processor = await getOrCreateBlurProcessor(pref);
    detachExistingProcessor(track);
    // Twilio's `BackgroundProcessor` structurally satisfies the
    // `VideoProcessor` interface from `twilio-video` (same
    // `processFrame` signature) but the type identities are
    // distinct (each package declares its own VideoFrame /
    // pipeline types). Cast through `unknown` to bridge — the
    // runtime contract is what matters and is verified by
    // Twilio's own README example.
    track.addProcessor(
      processor as unknown as Parameters<typeof track.addProcessor>[0],
      {
        inputFrameBufferType: "videoframe",
        outputFrameBufferContextType: "bitmaprenderer",
      },
    );
    return;
  }

  // `'image:clinic'` / `'image:neutral'` — DEFERRED. Designer
  // JPGs not yet in `frontend/public/video-backgrounds/`. See
  // task-video-C2 task file deferral list. When assets ship,
  // replace this branch with:
  //
  //   const img = await loadImage(`/video-backgrounds/${pref.split(':')[1]}-backdrop.jpg`);
  //   const processor = await getOrCreateImageProcessor(pref, img);
  //   detachExistingProcessor(track);
  //   track.addProcessor(processor, { ... });
  //
  // For now: silently degrade to "off" so a stale stored
  // preference doesn't crash the call.
  detachExistingProcessor(track);
}

/**
 * Detach the processor without changing the stored preference.
 * Used during quality / camera swaps where the OLD track is
 * about to be unpublished + stopped — we don't strictly need to
 * detach (the track is going away anyway), but doing so lets
 * Twilio release its pipeline resources promptly.
 *
 * Also used by F4 (battery-saver downgrade — future task) to
 * temporarily disable the effect without persisting.
 */
export function removeBackgroundFromTrack(track: LocalVideoTrack): void {
  detachExistingProcessor(track);
}

/**
 * Drop all cached processors and their underlying pipelines.
 * Called from `<VideoRoom>` cleanup so a route change doesn't
 * leak a worker thread holding a 2.5 MB WASM module.
 *
 * Note: Twilio doesn't expose a public `dispose()` on the
 * processor classes today (3.2.0); the cache release relies on
 * GC + worker-side cleanup when the references drop. We log if
 * a future Twilio release adds an explicit dispose, the cleanup
 * here should call it.
 */
export function disposeBackgroundCache(): void {
  processorCache.clear();
  loadPromises.clear();
}
