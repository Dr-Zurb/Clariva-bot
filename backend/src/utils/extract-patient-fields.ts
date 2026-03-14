/**
 * Extract patient fields from free-form message (e-task-2)
 *
 * Regex-based extraction for common formats. Handles:
 * - "Name: X", "Age: 25", "Phone: 8264602737", "Reason: fever"
 * - Comma/semicolon separated: "Abhishek, 25, 8264602737, fever"
 * - Loose: phone (10+ digits), email (pattern), age (1-120)
 *
 * No PHI sent to external services. Used when step is collecting_all.
 */

export interface ExtractedFields {
  name?: string;
  phone?: string;
  age?: number;
  gender?: string;
  reason_for_visit?: string;
  email?: string;
}

/** Indian phone: 10 digits, optional +91 or 0 prefix */
const PHONE_REGEX = /(?:\+91[\s.-]*)?(?:0)?([6-9]\d{9})\b|(\+?[1-9]\d{9,14})\b/g;
/** Email pattern */
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
/** Age: 1-120, possibly with "age:" prefix */
const AGE_REGEX = /(?:age|age:)\s*(\d{1,3})\b/i;
/** Standalone age (1-120) - be careful not to match phone digits */
const AGE_STANDALONE = /\b(1\d{0,2}|2[0-9]|3[0-9]|4[0-9]|5[0-9]|6[0-9]|7[0-9]|8[0-9]|9[0-9]|1[01][0-9]|120)\b/;
/** Name: "name:" or "Name:" prefix */
const NAME_LABEL_REGEX = /(?:name|full\s*name)[:\s]+([^,\n]+?)(?=\s*(?:,|age|phone|reason|email|$))/i;
/** Reason: "reason:" or "reason for visit:" etc */
const REASON_LABEL_REGEX = /(?:reason|reason\s*for\s*visit|symptom|complaint)[:\s]+([^,\n]+?)(?=\s*(?:,|email|$)|$)/i;
/** Gender: male, female, etc */
const GENDER_REGEX = /\b(male|female|m|f|other|non-binary)\b/i;

function normalizePhone(s: string): string {
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10 && digits[0] >= '6') return digits;
  if (digits.length >= 10) return digits.slice(-10);
  return s.replace(/\D/g, '');
}

function parseAge(val: string): number | undefined {
  const n = parseInt(val, 10);
  if (Number.isNaN(n) || n < 1 || n > 120) return undefined;
  return n;
}

/**
 * Extract patient fields from a free-form message.
 * Returns partial object with whatever could be extracted.
 */
export function extractFieldsFromMessage(text: string): ExtractedFields {
  const trimmed = text.trim();
  if (!trimmed) return {};

  const result: ExtractedFields = {};
  const lower = trimmed.toLowerCase();

  // Phone: first 10+ digit sequence (Indian or international)
  const phoneMatch = trimmed.match(PHONE_REGEX);
  if (phoneMatch && phoneMatch[0]) {
    const normalized = normalizePhone(phoneMatch[0]);
    if (normalized.length >= 10) result.phone = normalized;
  }

  // Email
  const emailMatch = trimmed.match(EMAIL_REGEX);
  if (emailMatch && emailMatch[0]) result.email = emailMatch[0].trim().toLowerCase();

  // Age: labeled first, then standalone number (avoid phone digits - 10 digit is phone)
  const ageLabelMatch = trimmed.match(AGE_REGEX);
  if (ageLabelMatch) {
    const age = parseAge(ageLabelMatch[1]);
    if (age) result.age = age;
  } else {
    // Standalone: look for 1-3 digit number that's not part of phone
    const ageStandMatch = trimmed.match(AGE_STANDALONE);
    if (ageStandMatch) {
      const age = parseAge(ageStandMatch[1]);
      if (age && age <= 120) result.age = age;
    }
  }

  // Name: labeled
  const nameLabelMatch = trimmed.match(NAME_LABEL_REGEX);
  if (nameLabelMatch) {
    const name = nameLabelMatch[1].trim();
    if (name.length >= 2) result.name = name;
  } else {
    // Heuristic: comma-separated first part, or text before first long number
    const parts = trimmed.split(/[,;]/).map((p) => p.trim());
    const firstPart = parts[0];
    if (firstPart && firstPart.length >= 2 && !/^\d+$/.test(firstPart) && !firstPart.match(/^(age|phone|reason|email)/i)) {
      const cleaned = firstPart.replace(/^my\s+name\s+is\s+/i, '').replace(/^name\s*:\s*/i, '').trim();
      if (cleaned.length >= 2) result.name = cleaned;
    } else {
      const beforeNumber = trimmed.split(/\d{5,}/)[0]?.trim();
      if (beforeNumber && beforeNumber.length >= 2 && !beforeNumber.match(/^(age|phone|reason|email)/i)) {
        const cleaned = beforeNumber.replace(/^my\s+name\s+is\s+/i, '').replace(/^name\s*:\s*/i, '').trim();
        if (cleaned.length >= 2) result.name = cleaned;
      }
    }
  }

  // Reason: labeled
  const reasonLabelMatch = trimmed.match(REASON_LABEL_REGEX);
  if (reasonLabelMatch) {
    const reason = reasonLabelMatch[1].trim();
    if (reason.length >= 2) result.reason_for_visit = reason;
  } else {
    // Heuristic: after phone/age, or last comma-separated part
    const parts = trimmed.split(/[,;]/).map((p) => p.trim());
    if (parts.length >= 4) {
      const last = parts[parts.length - 1];
      if (last && last.length >= 3 && !last.match(/^\d+$/) && !EMAIL_REGEX.test(last)) {
        result.reason_for_visit = last;
      }
    }
  }

  // Gender
  const genderMatch = lower.match(GENDER_REGEX);
  if (genderMatch) {
    const g = genderMatch[1].toLowerCase();
    if (g === 'm') result.gender = 'male';
    else if (g === 'f') result.gender = 'female';
    else result.gender = genderMatch[1];
  }

  return result;
}
