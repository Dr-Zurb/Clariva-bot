/**
 * Extract patient fields from free-form message (e-task-2)
 *
 * Regex-based extraction for common formats. Handles:
 * - "Name: X", "Age: 25", "Phone: 8264602737", "Reason: fever"
 * - Comma/semicolon/newline separated: "Abhishek Sahil\n26M\n8264602737\ni have pain..."
 * - Loose: phone (10+ digits), email (pattern), age (1-120), "26M" (age+gender)
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
/** Age with "Y" or "years" suffix (e.g. "60 Y", "60 years") */
const AGE_YEARS_REGEX = /\b(\d{1,3})\s*(?:y|yrs?|years?)\b/i;
/** Standalone age (1-120) - be careful not to match phone digits */
const AGE_STANDALONE = /\b(1\d{0,2}|2[0-9]|3[0-9]|4[0-9]|5[0-9]|6[0-9]|7[0-9]|8[0-9]|9[0-9]|1[01][0-9]|120)\b/;
/** Name: "name:" or "Name:" prefix */
const NAME_LABEL_REGEX = /(?:name|full\s*name)[:\s]+([^,\n]+?)(?=\s*(?:,|age|phone|reason|email|$))/i;
/** Reason: "reason:" or "reason for visit:" etc */
const REASON_LABEL_REGEX = /(?:reason|reason\s*for\s*visit|symptom|complaint)[:\s]+([^,\n]+?)(?=\s*(?:,|email|$)|$)/i;
/** Gender: male, female, etc */
const GENDER_REGEX = /\b(male|female|m|f|other|non-binary)\b/i;
/** Age+gender combined: "26M", "25F" */
const AGE_GENDER_COMBO = /^(\d{1,3})\s*[mf]$/i;

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

export interface ExtractFieldsOptions {
  /** AI Receptionist: When true, only extract labeled + phone + email + gender + age. Skip name/reason heuristics so AI can handle natural language. */
  fastPathOnly?: boolean;
}

/**
 * Extract patient fields from a free-form message.
 * Returns partial object with whatever could be extracted.
 * fastPathOnly: only phone, email, gender, age, labeled name/reason — no heuristics for natural language.
 */
export function extractFieldsFromMessage(
  text: string,
  options?: ExtractFieldsOptions
): ExtractedFields {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const fastPathOnly = options?.fastPathOnly ?? false;

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

  // Age: labeled first, then "60 Y" / "60 years", then standalone number
  const ageLabelMatch = trimmed.match(AGE_REGEX);
  if (ageLabelMatch) {
    const age = parseAge(ageLabelMatch[1]);
    if (age) result.age = age;
  } else {
    const ageYearsMatch = trimmed.match(AGE_YEARS_REGEX);
    if (ageYearsMatch) {
      const age = parseAge(ageYearsMatch[1]);
      if (age) result.age = age;
    } else {
      const ageStandMatch = trimmed.match(AGE_STANDALONE);
      if (ageStandMatch) {
        const age = parseAge(ageStandMatch[1]);
        if (age && age <= 120) result.age = age;
      }
    }
  }

  // Name: labeled only when fastPathOnly; otherwise include heuristics
  const nameLabelMatch = trimmed.match(NAME_LABEL_REGEX);
  if (nameLabelMatch) {
    const name = nameLabelMatch[1].trim();
    if (name.length >= 2) result.name = name;
  } else if (!fastPathOnly) {
    const parts = trimmed.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean);
    const firstPart = parts[0];
    const isSymptomLike = (s: string) =>
      /^\s*(i\s+have|i've\s+got|i\s+got|having|suffering\s+from|pain|ache|fever|cough|headache)\b/i.test(s.trim()) ||
      /\b(pain|ache|fever|cough|stomach|head|chest)\b/i.test(s);
    const isRelationshipOrGenderLike = (s: string) =>
      /^(?:he|she|him|her)\s+is\s+(?:my\s+)?(?:father|mother|dad|mom|brother|sister|son|daughter)\b/i.test(s.trim()) ||
      /^(?:he|she|him|her)\s+is\s+(?:male|female|m|f)\b/i.test(s.trim()) ||
      /^(?:my\s+)?(?:father|mother|dad|mom)\s+(?:he|she)\s+is\s+(?:male|female)/i.test(s.trim()) ||
      /\b(?:male|female)\s+obviously\s*$/i.test(s.trim());
    const isNameLike = (s: string) =>
      s.length >= 2 &&
      s.length <= 80 &&
      !/^\d+$/.test(s) &&
      !/^\d{10,}$/.test(s.replace(/\D/g, '')) &&
      !EMAIL_REGEX.test(s) &&
      !s.match(/^(age|phone|reason|email)/i) &&
      !AGE_GENDER_COMBO.test(s) &&
      !/^(male|female|m|f)$/i.test(s.trim()) &&
      !isSymptomLike(s) &&
      !isRelationshipOrGenderLike(s);
    if (firstPart && isNameLike(firstPart)) {
      const cleaned = firstPart
        .replace(/^my\s+name\s+is\s+/i, '')
        .replace(/^name\s*:\s*/i, '')
        .trim();
      if (cleaned.length >= 2 && !isSymptomLike(cleaned) && !isRelationshipOrGenderLike(cleaned)) result.name = cleaned;
    } else {
      const beforeNumber = trimmed.split(/\d{5,}/)[0]?.trim();
      if (beforeNumber && beforeNumber.length >= 2 && !beforeNumber.match(/^(age|phone|reason|email)/i) && !isSymptomLike(beforeNumber) && !isRelationshipOrGenderLike(beforeNumber)) {
        const cleaned = beforeNumber
          .replace(/^my\s+name\s+is\s+/i, '')
          .replace(/^name\s*:\s*/i, '')
          .trim();
        if (cleaned.length >= 2 && !AGE_GENDER_COMBO.test(cleaned) && !isSymptomLike(cleaned) && !isRelationshipOrGenderLike(cleaned)) result.name = cleaned;
      }
    }
  }

  // Age+gender combo (e.g. "26M", "25F")
  for (const part of trimmed.split(/[\n,;]+/).map((p) => p.trim())) {
    const combo = part.match(AGE_GENDER_COMBO);
    if (combo) {
      const age = parseAge(combo[1]);
      if (age) result.age = age;
      result.gender = combo[0].toLowerCase().endsWith('m') ? 'male' : 'female';
      break;
    }
  }

  // Reason: labeled only when fastPathOnly; otherwise include heuristics
  const reasonLabelMatch = trimmed.match(REASON_LABEL_REGEX);
  if (reasonLabelMatch) {
    const reason = reasonLabelMatch[1].trim();
    if (reason.length >= 2) result.reason_for_visit = reason;
  } else if (!fastPathOnly) {
    const iHaveMatch = trimmed.match(/\bi\s+have\s+([^.@,\n]+?)(?=\s*(?:,|@|\n|$))/i);
    if (iHaveMatch && iHaveMatch[1].trim().length >= 3) {
      result.reason_for_visit = iHaveMatch[1].trim();
    } else {
      const heIsMatch = trimmed.match(/\b(?:he|she|him|her)\s+is\s+([^.@,\n]+?)(?=\s*(?:,|@|\n|$|so\s))/i);
      if (heIsMatch && heIsMatch[1].trim().length >= 2) {
        const captured = heIsMatch[1].trim();
        const isRelOrGender = /\b(?:my\s+)?(?:father|mother|dad|mom|brother|sister)\b/i.test(captured) ||
          /\b(?:male|female)\b/i.test(captured) || /\bobviously\s*$/i.test(captured);
        if (!isRelOrGender) result.reason_for_visit = captured;
      } else {
        const getCheckedMatch = trimmed.match(/\b(?:get|want\s+to\s+get)\s+(?:him|her)\s+checked\s+(?:for\s+)?([^.@,\n]+?)(?=\s*(?:,|@|\n|$))/i);
        if (getCheckedMatch && getCheckedMatch[1].trim().length >= 2) {
          result.reason_for_visit = getCheckedMatch[1].trim();
        } else {
          const parts = trimmed.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean);
          for (const p of parts) {
            const digits = p.replace(/\D/g, '');
            const isPhone = digits.length >= 10 && /^[6-9]/.test(digits);
            if (
              p.length >= 3 &&
              !/^\d+$/.test(p) &&
              !EMAIL_REGEX.test(p) &&
              !isPhone &&
              !AGE_GENDER_COMBO.test(p) &&
              (p.toLowerCase().startsWith('i have') || p.length > 10)
            ) {
              result.reason_for_visit = p;
              break;
            }
          }
        }
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
