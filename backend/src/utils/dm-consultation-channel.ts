/**
 * Detect when the last assistant message asked the user to pick teleconsult channel /
 * in-clinic vs video, so short replies like "video" stay in the booking flow (RBH-20).
 */

export function lastBotAskedForConsultationChannel(
  recentMessages: { sender_type: string; content?: string | null }[]
): boolean {
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (recentMessages[i]!.sender_type === 'patient') continue;
    const c = (recentMessages[i]!.content ?? '').toLowerCase();
    if (!c.trim()) return false;
    const hasVideo = /\bvideo(\s+consult)?\b/i.test(c);
    const hasVoice = /\bvoice\b/i.test(c);
    const hasText = /\btext(\s+consult)?\b/i.test(c) || /\bchat\b/i.test(c);
    const teleCount = [hasVideo, hasVoice, hasText].filter(Boolean).length;
    const hasTelCombo = teleCount >= 2;
    const hasInClinic = /\bin-?clinic\b/i.test(c) || /\bin\s+person\b/i.test(c);
    /** Offered at least two ways to visit (e.g. in-clinic vs video, or video vs voice vs text). */
    const asksChoice =
      (hasInClinic && (hasVideo || hasVoice || hasText)) ||
      hasTelCombo ||
      (hasVideo && /\bor\b/i.test(c) && (hasVoice || hasText));
    return asksChoice;
  }
  return false;
}

/**
 * Parse a short user reply choosing consultation channel. Returns null if message looks like data / too long.
 */
export function parseConsultationChannelUserReply(text: string): 'video' | 'voice' | 'text' | 'in_clinic' | null {
  const raw = text.trim();
  if (!raw) return null;
  if (raw.length > 120) return null;
  if (/\d{10}/.test(raw) && raw.length > 12) return null;
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(raw) && raw.length > 20) return null;

  const t = raw.toLowerCase();

  if (/^in-?clinic\b|^clinic\b|^physical\b|^opd\b|^in\s+person\b/i.test(t)) {
    return 'in_clinic';
  }
  if (
    /^(video|vid)(\s|$)/i.test(raw) ||
    /\bvideo\s+(call|consult|please|thanks|yes)\b/i.test(t) ||
    t === 'vc'
  ) {
    return 'video';
  }
  if (/^(voice|audio|phone)(\s|$)/i.test(raw) || /\bphone\s+call\b/i.test(t)) {
    return 'voice';
  }
  if (/^(text|chat)(\s|$)/i.test(raw) || t === 'message' || t === 'dm') {
    return 'text';
  }
  return null;
}
