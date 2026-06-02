/**
 * Extract patient fields from free-form message (e-task-2)
 *
 * **Fallback only:** Used when `extractFieldsWithAI` returns nothing (no API key, empty JSON).
 * Prefer extending the LLM prompt in `ai-service` / `extractFieldsWithAI` for new behaviors—do not
 * grow regex here unless the product owner explicitly asks for a deterministic path.
 *
 * Regex-based extraction for common formats. Handles:
 * - "Name: X", "Age: 25", "Phone: 8264602737", "Reason: fever"
 * - Comma/semicolon/newline separated: "Abhishek Sahil\n26M\n8264602737\ni have pain..."
 * - Loose: phone (10+ digits), email (pattern), age (1-120), "26M" (age+gender)
 *
 * No PHI sent to external services. Used when step is collecting_all.
 */

import { isMetaBookingOrFeeReasonText } from './consultation-fees';

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
/**
 * Name with explicit label. Anchored so that mid-sentence occurrences (e.g.
 * "you got my name wrong" — `name ` appears followed by `wrong`) cannot
 * accidentally capture the next word as a name.
 *
 * Match shape:
 *   - "name: Abhishek Sahil"
 *   - "Name - Abhishek Sahil"
 *   - "my name is Abhishek Sahil"
 *   - "full name: Abhishek Sahil"
 *
 * The label must be at the start of the string (or after a separator like a
 * comma / newline) AND followed by an explicit `is | : | -` connector. Naked
 * "name X" mid-sentence is rejected because that's how complaints like
 * "you got my name wrong" used to leak through and capture "wrong".
 */
const NAME_LABEL_REGEX =
  /(?:^|[,\n])\s*(?:my\s+)?(?:full\s+)?name\s*(?:is|=|:|-)\s+([^,\n]+?)(?=\s*(?:,|age|phone|reason|email|$))/i;
/** Reason: "reason:" or "reason for visit:" etc */
const REASON_LABEL_REGEX = /(?:reason|reason\s*for\s*visit|symptom|complaint)[:\s]+([^,\n]+?)(?=\s*(?:,|email|$)|$)/i;
/** Gender: male, female, etc */
const GENDER_REGEX = /\b(male|female|m|f|other|non-binary)\b/i;
/** Age+gender combined: "26M", "25F" */
const AGE_GENDER_COMBO = /^(\d{1,3})\s*[mf]$/i;
/** Age + years + gender: "60 Y M", "60 years F" */
const AGE_YEARS_GENDER = /\b(\d{1,3})\s*(?:y|yrs?|years?)\s*[mf]\b/i;
/** Trailing age+gender to strip from name: "60 Y M", "26M" */
const TRAILING_AGE_GENDER = /\s+\d{1,3}\s*(?:(?:y|yrs?|years?)\s*)?[mf]\s*$/i;

function normalizePhone(s: string): string {
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10 && digits[0] >= '6') return digits;
  if (digits.length >= 10) return digits.slice(-10);
  return s.replace(/\D/g, '');
}

// ---------------------------------------------------------------------------
// "Correction-context complaint" detection
// ---------------------------------------------------------------------------
//
// Patient is at `confirm_details` and the bot read back their captured fields.
// If the patient replies "you got my name wrong" / "name is wrong" / "wrong
// number", they are NOT supplying a new value — they are flagging which field
// is incorrect. The pre-fix regex extractor used to capture the literal word
// "wrong" as the new name AND the entire complaint as the new reason. Both
// behaviors are bugs.
//
// We expose two helpers:
//   - `looksLikeFieldComplaint(s)`: predicate, used by the heuristic guards
//     below to refuse extracting from a complaint at all.
//   - `detectFieldComplaint(s)`: returns the field the patient is complaining
//     about so the handler can ask "What's the correct {field}?" instead of
//     re-rendering the same wrong summary.

const FIELD_COMPLAINT_TOKEN_TO_FIELD: Readonly<Record<string, FieldComplaintField>> = {
  name: 'name',
  'full name': 'name',
  age: 'age',
  gender: 'gender',
  sex: 'gender',
  phone: 'phone',
  mobile: 'phone',
  number: 'phone',
  email: 'email',
  reason: 'reason_for_visit',
  symptom: 'reason_for_visit',
  complaint: 'reason_for_visit',
};

export type FieldComplaintField =
  | 'name'
  | 'age'
  | 'gender'
  | 'phone'
  | 'email'
  | 'reason_for_visit';

/**
 * Detect "the field-X you have on file is wrong / you got it wrong" without
 * the patient supplying a new value yet. Returns the field they're flagging,
 * or `null` when no complaint pattern matches.
 *
 * Patterns covered (case-insensitive):
 *   - "you got my {field} wrong"
 *   - "got my {field} wrong"
 *   - "my {field} is wrong" / "my {field}'s wrong"
 *   - "{field} is wrong"
 *   - "wrong {field}"
 *   - "incorrect {field}"
 *   - "{field} is incorrect"
 *
 * `{field}` is one of the `FIELD_COMPLAINT_TOKEN_TO_FIELD` tokens. A
 * `phone | mobile | number` token all map to `phone`.
 */
export function detectFieldComplaint(text: string): FieldComplaintField | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  const tokens = Object.keys(FIELD_COMPLAINT_TOKEN_TO_FIELD)
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/\s+/g, '\\s+'))
    .join('|');
  const patterns: RegExp[] = [
    new RegExp(`\\b(?:you\\s+)?got\\s+(?:my|the)\\s+(${tokens})\\s+wrong\\b`, 'i'),
    new RegExp(`\\bmy\\s+(${tokens})\\s*(?:is|'s)\\s+(?:wrong|incorrect|not\\s+right)\\b`, 'i'),
    new RegExp(`\\b(${tokens})\\s+(?:is|'s)\\s+(?:wrong|incorrect|not\\s+right)\\b`, 'i'),
    new RegExp(`\\b(?:wrong|incorrect)\\s+(${tokens})\\b`, 'i'),
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m && m[1]) {
      const key = m[1].replace(/\s+/g, ' ');
      const field = FIELD_COMPLAINT_TOKEN_TO_FIELD[key];
      if (field) return field;
    }
  }
  return null;
}

/** Predicate form of `detectFieldComplaint` for use in heuristic guards. */
function looksLikeFieldComplaint(text: string): boolean {
  return detectFieldComplaint(text) !== null;
}

/**
 * "my {other-field}" prefix that should never be captured as `name`. The
 * heuristic name fallback used to take "my email - X@Y.com" or "my phone is
 * 9...." as a name because the long string isn't itself an email or phone
 * number. Block by prefix instead.
 */
const MY_OTHER_FIELD_PREFIX_REGEX =
  /^\s*my\s+(?:e[\s-]*mail|email\s*id|email|phone|mobile|number|contact|age|gender|sex|reason|symptom|complaint|address|dob|birthday)\b/i;

function parseAge(val: string): number | undefined {
  const n = parseInt(val, 10);
  if (Number.isNaN(n) || n < 1 || n > 120) return undefined;
  return n;
}

export interface ExtractFieldsOptions {
  /** AI Receptionist: When true, only extract labeled + phone + email + gender + age. Skip name/reason heuristics so AI can handle natural language. */
  fastPathOnly?: boolean;
}

/** Extract only phone and email from raw text. Used before redaction; LLM handles name/age/gender/reason. */
export function extractPhoneAndEmail(text: string): Pick<ExtractedFields, 'phone' | 'email'> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const result: Pick<ExtractedFields, 'phone' | 'email'> = {};
  const phoneMatch = trimmed.match(PHONE_REGEX);
  if (phoneMatch?.[0]) {
    const normalized = normalizePhone(phoneMatch[0]);
    if (normalized.length >= 10) result.phone = normalized;
  }
  const emailMatch = trimmed.match(EMAIL_REGEX);
  if (emailMatch?.[0]) result.email = emailMatch[0].trim().toLowerCase();
  return result;
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

  // Name: labeled only when fastPathOnly; otherwise include heuristics.
  // Correction-context complaints ("you got my name wrong", "name is wrong")
  // never carry a new name value — refuse to extract anything for `name`
  // before the heuristics get a chance. Same for `reason_for_visit` below.
  const isComplaintMessage = looksLikeFieldComplaint(trimmed);
  const nameLabelMatch = trimmed.match(NAME_LABEL_REGEX);
  if (nameLabelMatch && !isComplaintMessage) {
    const name = nameLabelMatch[1].trim();
    // Reject sentinel "wrong"/"incorrect"/"not right" captures — these come
    // from complaint phrasings the anchored regex doesn't catch (e.g. an
    // odd punctuation arrangement).
    if (name.length >= 2 && !/^(?:wrong|incorrect|not\s+right|nothing|none)\b/i.test(name)) {
      result.name = name;
    }
  } else if (!fastPathOnly && !isComplaintMessage) {
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
      !MY_OTHER_FIELD_PREFIX_REGEX.test(s) &&
      !AGE_GENDER_COMBO.test(s) &&
      !/^(male|female|m|f)$/i.test(s.trim()) &&
      !isSymptomLike(s) &&
      !isRelationshipOrGenderLike(s) &&
      // Booking/fee-intent phrases ("i'd like to book an appointment", "please schedule a visit",
      // "how much is the consultation fee") must never land in `name`.
      !isMetaBookingOrFeeReasonText(s);
    if (firstPart && isNameLike(firstPart)) {
      let cleaned = firstPart
        .replace(/^my\s+name\s+is\s+/i, '')
        .replace(/^name\s*:\s*/i, '')
        .replace(TRAILING_AGE_GENDER, '')
        .trim();
      if (
        cleaned.length >= 2 &&
        !isSymptomLike(cleaned) &&
        !isRelationshipOrGenderLike(cleaned) &&
        !isMetaBookingOrFeeReasonText(cleaned)
      ) {
        result.name = cleaned;
      }
    } else {
      const beforeNumber = trimmed.split(/\d{5,}/)[0]?.trim().replace(/,\s*$/, '');
      if (
        beforeNumber &&
        beforeNumber.length >= 2 &&
        !beforeNumber.match(/^(age|phone|reason|email)/i) &&
        // "my email - X@Y.com" / "my phone is 9..." / "my number ..." used to
        // slip through here because the long string itself isn't an email
        // or phone number. Block by the leading "my <other-field>" tell.
        !MY_OTHER_FIELD_PREFIX_REGEX.test(beforeNumber) &&
        // Reject substrings that contain an email — same intent as the
        // `isNameLike` guard above; "my email - X@Y.com" had the email
        // chopped by the digit split, leaving "my email - as.sahilabhi" with
        // no `@`, so the email-substring check alone wasn't enough.
        !EMAIL_REGEX.test(beforeNumber) &&
        !isSymptomLike(beforeNumber) &&
        !isRelationshipOrGenderLike(beforeNumber) &&
        !isMetaBookingOrFeeReasonText(beforeNumber)
      ) {
        const cleaned = beforeNumber
          .replace(/^my\s+name\s+is\s+/i, '')
          .replace(/^name\s*:\s*/i, '')
          .replace(TRAILING_AGE_GENDER, '')
          .trim();
        if (
          cleaned.length >= 2 &&
          !AGE_GENDER_COMBO.test(cleaned) &&
          !MY_OTHER_FIELD_PREFIX_REGEX.test(cleaned) &&
          !isSymptomLike(cleaned) &&
          !isRelationshipOrGenderLike(cleaned) &&
          !isMetaBookingOrFeeReasonText(cleaned)
        ) {
          result.name = cleaned;
        }
      }
    }
  }

  // Age+gender combo: "26M", "25F", or "60 Y M", "60 years F"
  for (const part of trimmed.split(/[\n,;]+/).map((p) => p.trim())) {
    const yearsGender = part.match(AGE_YEARS_GENDER);
    if (yearsGender) {
      const age = parseAge(yearsGender[1]);
      if (age) result.age = age;
      result.gender = part.toLowerCase().endsWith('m') ? 'male' : 'female';
      break;
    }
    const combo = part.match(AGE_GENDER_COMBO);
    if (combo) {
      const age = parseAge(combo[1]);
      if (age) result.age = age;
      result.gender = combo[0].toLowerCase().endsWith('m') ? 'male' : 'female';
      break;
    }
  }

  // Reason: labeled only when fastPathOnly; otherwise include heuristics.
  // Same correction-context guard as `name` above — complaints like
  // "you got my reason wrong" (or any other field complaint) must never
  // become the new `reason_for_visit`.
  const reasonLabelMatch = trimmed.match(REASON_LABEL_REGEX);
  if (reasonLabelMatch && !isComplaintMessage) {
    const reason = reasonLabelMatch[1].trim();
    if (reason.length >= 2 && !isMetaBookingOrFeeReasonText(reason)) result.reason_for_visit = reason;
  } else if (!fastPathOnly && !isComplaintMessage) {
    const iHaveMatch = trimmed.match(/\bi\s+have\s+([^.@,\n]+?)(?=\s*(?:,|@|\n|$))/i);
    const iTookMatch = trimmed.match(/\bi\s+took\s+([^.@,\n]+?)(?=\s*(?:,|@|\n|$))/i);
    if (
      iHaveMatch &&
      iHaveMatch[1].trim().length >= 3 &&
      !isMetaBookingOrFeeReasonText(iHaveMatch[1].trim())
    ) {
      result.reason_for_visit = iHaveMatch[1].trim();
    } else if (
      iTookMatch &&
      iTookMatch[1].trim().length >= 3 &&
      !isMetaBookingOrFeeReasonText(iTookMatch[1].trim())
    ) {
      result.reason_for_visit = `Taking ${iTookMatch[1].trim()}`;
    } else {
      const heIsMatch = trimmed.match(/\b(?:he|she|him|her)\s+is\s+([^.@,\n]+?)(?=\s*(?:,|@|\n|$|so\s))/i);
      if (heIsMatch && heIsMatch[1].trim().length >= 2) {
        const captured = heIsMatch[1].trim();
        const isRelOrGender = /\b(?:my\s+)?(?:father|mother|dad|mom|brother|sister)\b/i.test(captured) ||
          /\b(?:male|female)\b/i.test(captured) || /\bobviously\s*$/i.test(captured);
        if (!isRelOrGender && !isMetaBookingOrFeeReasonText(captured)) result.reason_for_visit = captured;
      } else {
        const getCheckedMatch = trimmed.match(/\b(?:get|want\s+to\s+get)\s+(?:him|her)\s+checked\s+(?:for\s+)?([^.@,\n]+?)(?=\s*(?:,|@|\n|$))/i);
        if (
          getCheckedMatch &&
          getCheckedMatch[1].trim().length >= 2 &&
          !isMetaBookingOrFeeReasonText(getCheckedMatch[1].trim())
        ) {
          result.reason_for_visit = getCheckedMatch[1].trim();
        } else {
          const parts = trimmed.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean);
          /** Skip parts that look like name-only; composite one-line intakes are NOT name-only (see AI_BOT_BUILDING_PHILOSOPHY). */
          const isNameLikePart = (s: string) => {
            if (/\b(i\s+took|i\s+have|started\s+taking)\b/i.test(s)) return false;
            if (/\b(mg|tablet|tablets|capsule|medicine|meds|prescription)\b/i.test(s)) return false;
            const digits = s.replace(/\D/g, '');
            if (digits.length >= 10 && /^[6-9]/.test(digits)) return true;
            if (EMAIL_REGEX.test(s)) return true;
            if (AGE_GENDER_COMBO.test(s) || AGE_YEARS_GENDER.test(s)) return true;
            if (/\d{1,3}\s*(?:y|yrs?|years?)\s*[mf]?/i.test(s)) return true;
            if (
              /^[A-Z][a-z]+\s+[A-Z][a-z]/.test(s) &&
              !/\b(diabetic|diabetes|checkup|pain|fever|cough|stomach|consultation)\b/i.test(s)
            ) {
              const afterTwo = s.replace(/^[A-Z][a-z]+\s+[A-Z][a-z]+/, '').trim();
              if (afterTwo.length > 0) return false;
              return true;
            }
            return false;
          };
          const isReasonLike = (s: string) =>
            /\b(diabetic|diabetes|checkup|check\s*up|pain|fever|cough|stomach|headache|consultation|follow\s*up|general|amlodipine|telmisartan|metformin|tablet|medicine)\b/i.test(
              s
            );
          for (const p of parts) {
            const digits = p.replace(/\D/g, '');
            const isPhone = digits.length >= 10 && /^[6-9]/.test(digits);
            if (
              p.length >= 3 &&
              !/^\d+$/.test(p) &&
              !EMAIL_REGEX.test(p) &&
              !isPhone &&
              !AGE_GENDER_COMBO.test(p) &&
              !isNameLikePart(p) &&
              (p.toLowerCase().startsWith('i have') ||
                p.toLowerCase().startsWith('i took') ||
                isReasonLike(p) ||
                p.length >= 5)
            ) {
              if (!isMetaBookingOrFeeReasonText(p)) {
                result.reason_for_visit = p;
                break;
              }
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
