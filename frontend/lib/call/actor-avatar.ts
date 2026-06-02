/**
 * Sub-batch B · task-video-B2 — shared initials + color hash for the
 * counterparty avatar.
 *
 * Both `<VideoTile>` (camera-off placeholder) and `<CallerCardOverlay>`
 * render an initials avatar for the same actor. Without a shared
 * primitive they'd drift over time (different palettes, different
 * normalization), AND a doctor would see a green avatar in the camera
 * tile but a blue one in the caller card. Centralizing here.
 *
 * Modality-agnostic by design — voice's caller card (voice A8) will
 * import these too when it lands; same actor → same color → consistent
 * recognition across modalities.
 */

const AVATAR_PALETTE = [
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-teal-500",
  "bg-fuchsia-500",
] as const;

/**
 * Up to two letters (first + last initial) from the trimmed name.
 *   "Dr. Sharma"   → "DS"
 *   "Patient"      → "P"
 *   ""             → "?"
 */
export function actorInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return (parts[0]?.[0] ?? "?").toUpperCase();
  }
  const first = parts[0]?.[0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? "";
  const initials = `${first}${last}`.toUpperCase();
  return initials || "?";
}

/**
 * Deterministic color picker: the same name always gets the same color.
 * Uses a tiny rolling hash (no crypto needed; visual identity only).
 *
 * Returns a Tailwind background-color class so consumers can compose:
 *   `<div className={`rounded-full text-white ${actorColor(name)}`} />`
 */
export function actorColor(name: string): string {
  const trimmed = name.trim() || "?";
  let hash = 0;
  for (let i = 0; i < trimmed.length; i += 1) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx] ?? AVATAR_PALETTE[0]!;
}
