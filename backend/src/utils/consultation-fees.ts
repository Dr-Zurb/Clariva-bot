/**
 * RBH-13: Structured consultation / fee copy for Instagram DM (no invented amounts).
 * Supports plain text from doctor_settings.consultation_types or optional compact JSON.
 */

/** Optional compact JSON in consultation_types (keep under doctor_settings max length). Example:
 * [{"l":"General (in-person)","r":500},{"l":"Video consult","r":400}]
 */
interface CompactFeeRow {
  l?: string;
  label?: string;
  r?: number;
  fee_inr?: number;
  amount?: number;
  note?: string;
}

const PRICING_KEYWORDS =
  /\b(fee|fees|price|prices|pricing|cost|costs|charge|charges|how\s+much|kitna|कितना|rupee|rupees|rs\.?|inr|₹|consultation\s+fee|doctor\s+fee|appointment\s+fee)\b/i;

/** User message looks like a pricing question (EN + common Roman Hindi). */
export function isPricingInquiryMessage(text: string): boolean {
  const t = text.trim();
  if (t.length < 3) return false;
  return PRICING_KEYWORDS.test(t);
}

/**
 * Strong booking intent - user wants to start scheduling, not only clarify visit type for fees.
 */
/** Short reply that clarifies visit/channel while discussing fees (not explicit book). RBH-14. */
const CONSULTATION_OR_CHANNEL_CLARIFY_RE =
  /\b(general|video|online|offline|in-?person|physical|virtual|tele-?consult|follow\s*-?\s*up|first\s+visit|new\s+patient|consultation\b|opd|check-?up|check\s*up)\b/i;

export function isConsultationTypePricingFollowUp(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || t.length > 160) return false;
  return CONSULTATION_OR_CHANNEL_CLARIFY_RE.test(t);
}

export function userExplicitlyWantsToBookNow(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  return (
    /\b(book|schedule)\s+(?:an\s+)?(?:appointment|visit|consultation)\b/i.test(t) ||
    /\b(want|need|would\s+like)\s+to\s+book\b/i.test(t) ||
    /\bbook\s+(?:me|us|an\s+appointment|a\s+slot)\b/i.test(t) ||
    /\b(start|begin)\ba?\s+booking\b/i.test(t) ||
    /\bplease\s+book\b/i.test(t)
  );
}

/** User says they're only asking fees / not booking (meta-clarification). */
export function userDeclinesBookingIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/\bnot\s+booking\b/.test(t)) return true;
  if (/\bonly\s+asking\s+(about\s+)?(fee|fees|price)\b/.test(t)) return true;
  return /\b(just|only)\s+(want|need)\b/.test(t) && /\b(fee|fees|price|cost|info)\b/.test(t);
}

function parseCompactFeeJson(raw: string): CompactFeeRow[] | null {
  const t = raw.trim();
  if (!t.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(t) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as CompactFeeRow[];
  } catch {
    return null;
  }
}

function normalizeRow(row: CompactFeeRow): { label: string; inr?: number; note?: string } | null {
  const label = (row.label ?? row.l ?? '').trim();
  if (!label) return null;
  const inr =
    typeof row.fee_inr === 'number' && row.fee_inr >= 0
      ? row.fee_inr
      : typeof row.amount === 'number' && row.amount >= 0
        ? row.amount
        : typeof row.r === 'number' && row.r >= 0
          ? row.r
          : undefined;
  const note = typeof row.note === 'string' ? row.note.trim() : undefined;
  return { label, inr, note: note || undefined };
}

/**
 * Human-readable fee block for DM. Never invents rupee amounts - only echoes JSON `r` / `fee_inr` / `amount`.
 */
export function formatConsultationFeesForDm(settings: {
  consultation_types?: string | null;
  practice_name?: string | null;
  business_hours_summary?: string | null;
}): string {
  const practiceName = settings.practice_name?.trim() || 'the practice';
  const raw = settings.consultation_types?.trim();

  const hoursHint = settings.business_hours_summary?.trim()
    ? ` Office hours on file: ${settings.business_hours_summary.trim()}`
    : '';

  if (!raw) {
    return (
      `I don't have detailed **fee amounts** on file for **${practiceName}** yet.${hoursHint}\n\n` +
      `For **pricing**, please ask here and the team can confirm, or check any fee information they've shared on their profile/website.`
    );
  }

  const rows = parseCompactFeeJson(raw);
  if (rows) {
    const lines: string[] = [];
    for (const row of rows) {
      const n = normalizeRow(row);
      if (!n) continue;
      if (n.inr != null) {
        lines.push(`- **${n.label}**: ₹${n.inr}${n.note ? ` (${n.note})` : ''}`);
      } else {
        lines.push(`- **${n.label}**${n.note ? `: ${n.note}` : ''}`);
      }
    }
    if (lines.length === 0) {
      return (
        `**${practiceName}** listed consultation types, but I couldn't read the fee format.${hoursHint}\n\n` +
        `Please ask the clinic directly for exact amounts.`
      );
    }
    return (
      `Here are the **consultation fees** we have on file for **${practiceName}**:\n\n${lines.join('\n')}\n\n` +
      `*If your visit type isn't listed, message the clinic for the exact charge.*${hoursHint ? `\n\n${hoursHint.trim()}` : ''}`
    );
  }

  return (
    `Here's what **${practiceName}** has on file for **consultation types & fees**:\n\n${raw}\n\n` +
    `*Exact charges can vary - if anything is unclear, the clinic can confirm.*${hoursHint ? ` ${hoursHint.trim()}` : ''}`
  );
}

/**
 * RBH-13: Meta phrases about fees/booking - must not become `reason_for_visit` during intake.
 */
export function isMetaBookingOrFeeReasonText(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  if (isPricingInquiryMessage(t)) return true;
  if (userDeclinesBookingIntent(t)) return true;
  const low = t.toLowerCase();
  if (/\b(how\s+do\s+i|how\s+to)\s+(book|schedule)\b/.test(low)) return true;
  if (/^(book|schedule)\s+(an?\s+)?(appointment|visit)\??$/i.test(low)) return true;
  if (/\b(consultation|appointment)\s+fee(s)?\b/i.test(low)) return true;
  return false;
}
