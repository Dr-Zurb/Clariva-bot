/**
 * Public social profile URLs for Inbox (doctor-facing deep links).
 * Mirrors backend `buildPublicSocialProfileUrl`.
 * Never use IGSID/PSID as a profile URL — only vanity usernames.
 */

export function buildPublicSocialProfileUrl(
  channel: "instagram" | "facebook" | "whatsapp" | string,
  username: string | null | undefined
): string | null {
  const handle = username?.replace(/^@/, "").trim() ?? "";
  if (!handle || /\s/.test(handle)) return null;

  if (channel === "instagram") {
    return `https://www.instagram.com/${encodeURIComponent(handle)}/`;
  }
  if (channel === "facebook") {
    return `https://www.facebook.com/${encodeURIComponent(handle)}`;
  }
  return null;
}

/** Display form for a platform username (@handle unless already spaced). */
export function formatPlatformUsername(
  username: string | null | undefined
): string | null {
  const t = username?.trim();
  if (!t) return null;
  if (/\s/.test(t)) return t;
  return t.startsWith("@") ? t : `@${t}`;
}
