import type { QualityOption } from "@/components/consultation/VideoQualityPicker";

/**
 * True when the local video track is (or should be treated as) torn down:
 * manual quality picker `'audio-only'` OR adaptive/battery auto-fallback.
 *
 * Auto-fallback intentionally leaves the picker on `'auto'`, so UI that only
 * checks `quality === "audio-only"` shows a black self-tile and keeps the
 * Camera button — this helper is the single gate for avatar + control hide.
 */
export function resolveSelfTileAudioOnly(options: {
  quality: QualityOption;
  autoFallbackActive: boolean;
}): boolean {
  return options.quality === "audio-only" || options.autoFallbackActive;
}
