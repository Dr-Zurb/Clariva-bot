/**
 * Public social profile URLs for Inbox (doctor-facing deep links).
 * Never use IGSID/PSID as a profile URL — only vanity usernames.
 */

export type SocialProfileChannel = 'instagram' | 'facebook' | 'whatsapp';

/**
 * Build a public profile URL from a vanity username.
 * Returns null when the handle is missing or not linkable (e.g. display name with spaces).
 */
export function buildPublicSocialProfileUrl(
  channel: SocialProfileChannel | string,
  username: string | null | undefined
): string | null {
  const handle = username?.replace(/^@/, '').trim() ?? '';
  if (!handle || /\s/.test(handle)) return null;

  if (channel === 'instagram') {
    return `https://www.instagram.com/${encodeURIComponent(handle)}/`;
  }
  if (channel === 'facebook') {
    // Best-effort vanity URL; Page-scoped IDs are not valid here.
    return `https://www.facebook.com/${encodeURIComponent(handle)}`;
  }
  return null;
}
