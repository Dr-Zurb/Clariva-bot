/**
 * Sanitize patient `reason_for_visit` text for use as doctor-only matcher hint content
 * (e.g. appended to `include_when` / `exclude_when` when staff reassigns a service on the
 * review inbox — Plan 01 / Task 03, "hint learning from corrections").
 *
 * Matcher hints are routing metadata written to `doctor_settings.service_offerings_json`.
 * They are not patient-facing, but they are:
 *   - persisted long-term, and
 *   - shown to the LLM matcher + to practice staff in the catalog UI.
 *
 * Therefore we conservatively scrub obvious PII (emails, long digit runs that look like
 * phone numbers / IDs) before storing — even though the reason text itself is what the
 * LLM already sees at matching time. We also lowercase + collapse whitespace so the
 * stored hint reads as a short, stable routing note.
 */

/** Max length of sanitized hint content. Keeps individual appends small so semicolon-merged
 *  hints stay well below the schema caps (keywords=400, include/exclude=800). */
export const HINT_CONTENT_MAX_LEN = 200;

/** Minimum length below which a sanitized hint is considered noise and dropped. */
const HINT_CONTENT_MIN_LEN = 3;

const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
// 6+ consecutive digits (phone numbers, IDs, MRNs). Allow short counts like "2" days.
const LONG_DIGIT_RUN_RE = /\d{6,}/g;

/**
 * Returns a cleaned, lowercased, truncated version of `raw` safe to store as matcher hint
 * content, or `null` if nothing usable remains.
 *
 * Rules:
 * - null/undefined/empty → null
 * - redact emails and digit runs of length >= 6
 * - lowercase, trim, collapse internal whitespace to single spaces
 * - drop trailing punctuation that adds no signal
 * - if result length < HINT_CONTENT_MIN_LEN → null
 * - truncate to HINT_CONTENT_MAX_LEN
 */
export function sanitizeReasonForHintContent(
  raw: string | null | undefined
): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;

  s = s.replace(EMAIL_RE, '');
  s = s.replace(LONG_DIGIT_RUN_RE, '');
  s = s.toLowerCase();
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/[.,;:!?\-]+$/g, '').trim();

  if (s.length < HINT_CONTENT_MIN_LEN) return null;
  if (s.length > HINT_CONTENT_MAX_LEN) {
    s = s.slice(0, HINT_CONTENT_MAX_LEN).trim();
  }
  return s;
}

/**
 * Apply `sanitizeReasonForHintContent` across a hint-append patch, returning a version
 * with only the non-empty sanitized fields. Returns `null` when every field is empty
 * (caller should then skip the append entirely).
 */
export function sanitizeHintAppendPatch(patch: {
  keywords?: string | null;
  include_when?: string | null;
  exclude_when?: string | null;
}): { keywords?: string; include_when?: string; exclude_when?: string } | null {
  const out: { keywords?: string; include_when?: string; exclude_when?: string } = {};
  const kw = sanitizeReasonForHintContent(patch.keywords);
  if (kw) out.keywords = kw;
  const inc = sanitizeReasonForHintContent(patch.include_when);
  if (inc) out.include_when = inc;
  const exc = sanitizeReasonForHintContent(patch.exclude_when);
  if (exc) out.exclude_when = exc;
  return Object.keys(out).length > 0 ? out : null;
}
