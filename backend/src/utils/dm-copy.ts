/**
 * dm-copy
 * -------
 * Single source of truth for patient-facing DM strings.
 *
 * Design contract (Plan "Patient DM copy polish", 2026-04-18 + bot-language-policy p3):
 *   - Pure functions only. No I/O, no loggers, no `await`. Input → string.
 *   - Typed inputs. Each builder takes a small typed object, not positional
 *     arguments.
 *   - One helper per rendered message family. Variant branching happens inside
 *     the helper via typed discriminators, not by creating sibling helpers with
 *     copy drift between them.
 *   - Locale dispatch (lang-09): builders take `language` on the typed input,
 *     call `toStaticLocale` once, and index a colocated
 *     `Record<StaticMessageLocale, …>` copy table. Untranslated arms ship
 *     English (LANG3-D4). Do not localize ₹ amounts, dates, URLs, MRNs, or
 *     practice/doctor names (LANG3-D6).
 *   - Legal / recording-disclosure / account-deletion builders are **English-only
 *     in v1** (LANG3-D7) — counsel review + versioned legal-copy contract.
 *   - Every public builder is covered by a golden snapshot in
 *     `backend/tests/unit/utils/dm-copy.snap.test.ts` (per locale once migrated).
 *
 * This file starts tiny on purpose. Tasks 02–11 in the 2026-04-18 plan each
 * migrate one message family (confirm-details, intake ask, consent, payment
 * confirmation, abandoned-booking reminder, cancel picker, staff-review
 * resolved, mixed-complaint clarification, reason-first triage, non-text ack)
 * into this module as they ship.
 *
 * Plan: docs/Work/Daily-plans/April 2026/18-04-2026/plan-patient-dm-copy-polish.md
 * Locale: docs/Work/Daily-plans/August 2026/02-08-2026/bot-language-policy/p3-dm-copy-localization/
 */

import type { CollectedPatientData, PatientCollectionField } from './validation';
import {
  toStaticLocale,
  type ConversationLanguage,
  type StaticMessageLocale,
} from './conversation-language';

/**
 * LANG6-D8: deliberate English in every static locale, with a reason.
 * Use when a family must stay English after review (legal, public surface, etc.).
 * LANG3-D4's transitional "English for all locales" helper was removed in lang-28.
 */
export function enByPolicy<T>(en: T, _reason: string): Readonly<Record<StaticMessageLocale, T>> {
  void _reason;
  return { en, hi: en, pa: en };
}

/**
 * Acknowledgement sent when the patient's inbound message is not text
 * (attachment, sticker, reaction). Callers suppress duplicate acks elsewhere;
 * this helper only owns the rendered string.
 *
 * Copy rationale (Task 11, 2026-04-18 — superseded the verbatim seed from
 * Task 01): "I can only process text messages right now" was technically
 * accurate but framed the problem from the bot's side. Patients care that
 * their message didn't land and what to do next, not what the bot can
 * "process". The new copy names the two inputs patients most plausibly
 * expect a response to (images, voice notes) — stickers and reactions are
 * deliberately unnamed since they rarely carry an actual ask. Single line,
 * no markdown, no emoji: this is an error-adjacent ack, not a pleasantry.
 *
 * Locale (lang-25 proof / LANG6-D2-B): reviewed Roman Hindi / Roman Punjabi
 * arms — `toStaticLocale` maps hi-Latn→hi and pa-Latn→pa, so Roman matches
 * how patients type on IG (LANG6-D6). Native-script split is a follow-up.
 */
export interface NonTextAckMessageInput {
  readonly language: ConversationLanguage;
}

/** English arm — byte-identical to pre-lang-25 (LANG5-D1 / do not reword). */
export const NON_TEXT_ACK_EN =
  "I can't read images or voice notes yet — could you type your message instead? I'll take it from there.";

const NON_TEXT_ACK_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: NON_TEXT_ACK_EN,
  // Reviewed 2026-08-03 — lang-25 proof family (warm receptionist register).
  hi: 'Main abhi images ya voice notes nahi padh sakta — apna message type karke bhejein? Main aage dekh lunga.',
  pa: 'Main hun images ya voice notes nahi padh sakda — apna message type karke bhejo? Main aage dekh lavanga.',
};

export function buildNonTextAckMessage(input: NonTextAckMessageInput): string {
  const locale = toStaticLocale(input.language);
  return NON_TEXT_ACK_COPY[locale];
}

/**
 * Title-case a single-word value such as a gender token. We keep this local to
 * `dm-copy.ts` because every other caller of "capitalize this word" in the
 * backend already has its own semantics (service names, headings, etc.) and we
 * don't want a shared util whose behavior drifts when somebody fixes a bug in
 * a caller-specific edge case.
 */
function titleCaseWord(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

/**
 * Read-back summary shown at the `confirm_details` step of the booking flow.
 *
 * Layout contract (Plan "Patient DM copy polish", Task 02):
 *   - One labeled line per captured field (`**Label:** value`).
 *   - Bold the **label**, not the value — the patient scans for "Mobile" /
 *     "Age", not for their own digits.
 *   - `Reason` and `Email` always render, using `Not provided` when unset, so
 *     the patient always has a chance to fill them in on correction.
 *   - `Name` / `Age` / `Gender` / `Mobile` are omitted when absent (confirm
 *     details only fires once those are present, so the absent branch is
 *     unreachable in the real flow; the conditional is defensive).
 *   - CTA isolated on its own paragraph after a blank line; bold `**Yes**`.
 */
export interface ConfirmDetailsMessageInput {
  readonly collected: CollectedPatientData;
  readonly language: ConversationLanguage;
}

type ConfirmDetailsCopy = {
  readonly header: string;
  readonly labels: Readonly<{
    name: string;
    age: string;
    gender: string;
    mobile: string;
    reason: string;
    email: string;
  }>;
  readonly notProvided: string;
  readonly cta: string;
};

const CONFIRM_DETAILS_COPY: Readonly<Record<StaticMessageLocale, ConfirmDetailsCopy>> = {
  en: {
    header: "Here's what I have so far:",
    labels: {
      name: 'Name',
      age: 'Age',
      gender: 'Gender',
      mobile: 'Mobile',
      reason: 'Reason',
      email: 'Email',
    },
    notProvided: 'Not provided',
    cta: 'Is everything correct? Reply **Yes** to see available slots, or tell me what to change.',
  },
  hi: {
    header: 'Ab tak yeh details hain:',
    labels: {
      name: 'Name',
      age: 'Age',
      gender: 'Gender',
      mobile: 'Mobile',
      reason: 'Reason',
      email: 'Email',
    },
    notProvided: 'Not provided',
    cta: 'Sab sahi hai? Available slots dekhne ke liye **Yes** reply karein, ya jo change karna ho batayein.',
  },
  pa: {
    header: 'Hun tak eh details ne:',
    labels: {
      name: 'Name',
      age: 'Age',
      gender: 'Gender',
      mobile: 'Mobile',
      reason: 'Reason',
      email: 'Email',
    },
    notProvided: 'Not provided',
    cta: 'Sab theek hai? Available slots dekh layi **Yes** reply karo, ya jo change karna hai dasso.',
  },
};

export function buildConfirmDetailsMessage(input: ConfirmDetailsMessageInput): string {
  const locale = toStaticLocale(input.language);
  const copy = CONFIRM_DETAILS_COPY[locale];
  const collected = input.collected;
  const lines: string[] = [copy.header, ''];

  if (collected.name) lines.push(`**${copy.labels.name}:** ${collected.name}`);
  if (collected.age !== undefined) lines.push(`**${copy.labels.age}:** ${collected.age}`);
  if (collected.gender) lines.push(`**${copy.labels.gender}:** ${titleCaseWord(collected.gender)}`);
  if (collected.phone) lines.push(`**${copy.labels.mobile}:** ${collected.phone}`);

  const reason = collected.reason_for_visit?.trim();
  lines.push(
    `**${copy.labels.reason}:** ${reason && reason.length > 0 ? reason : copy.notProvided}`
  );

  const email = collected.email?.trim();
  lines.push(`**${copy.labels.email}:** ${email && email.length > 0 ? email : copy.notProvided}`);

  lines.push('', copy.cta);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Confirm-details correction clarifier (Plan "bot copy bugs 2026-04-27")
// ---------------------------------------------------------------------------

/**
 * Field token used by `buildCorrectionFieldClarifierReply`. Mirrors
 * `FieldComplaintField` from `extract-patient-fields.ts` (kept in lock-step
 * with that union — adding a field there means adding it here).
 */
export type CorrectionClarifierField =
  | 'name'
  | 'age'
  | 'gender'
  | 'phone'
  | 'email'
  | 'reason_for_visit';

const CORRECTION_FIELD_PROMPT: Readonly<
  Record<StaticMessageLocale, Readonly<Record<CorrectionClarifierField, string>>>
> = {
  en: {
    name: "Got it — what's the correct **full name**?",
    age: "Got it — what's the correct **age**?",
    gender: "Got it — what's the correct **gender**? (male / female / other)",
    phone: "Got it — what's the correct **mobile number**?",
    email: "Got it — what's the correct **email**?",
    reason_for_visit: "Got it — what's the correct **reason for visit**?",
  },
  hi: {
    name: 'Samajh gaya — sahi **full name** kya hai?',
    age: 'Samajh gaya — sahi **age** kya hai?',
    gender: 'Samajh gaya — sahi **gender** kya hai? (male / female / other)',
    phone: 'Samajh gaya — sahi **mobile number** kya hai?',
    email: 'Samajh gaya — sahi **email** kya hai?',
    reason_for_visit: 'Samajh gaya — sahi **reason for visit** kya hai?',
  },
  pa: {
    name: 'Samajh gaya — sahi **full name** ki hai?',
    age: 'Samajh gaya — sahi **age** ki hai?',
    gender: 'Samajh gaya — sahi **gender** ki hai? (male / female / other)',
    phone: 'Samajh gaya — sahi **mobile number** ki hai?',
    email: 'Samajh gaya — sahi **email** ki hai?',
    reason_for_visit: 'Samajh gaya — sahi **reason for visit** ki hai?',
  },
};

export interface CorrectionFieldClarifierInput {
  readonly field: CorrectionClarifierField;
  readonly language: ConversationLanguage;
}

/**
 * Patient flagged a specific field as wrong at `confirm_details` ("you got
 * my name wrong" / "name is wrong" / "wrong number") without supplying a new
 * value yet. Bot asks once for the corrected value rather than re-rendering
 * the same wrong read-back summary (the pre-fix behavior, which made the
 * patient repeat themselves and looked broken).
 *
 * No "I'll update it" promise — we DON'T have a value yet. The clarifier is
 * intentionally one short line so the next patient turn can be parsed
 * cleanly as the new value (the very next message stays in `confirm_details`
 * and re-runs `validateAndApplyExtracted` with `isCorrection: true`).
 */
export function buildCorrectionFieldClarifierReply(input: CorrectionFieldClarifierInput): string {
  const locale = toStaticLocale(input.language);
  return CORRECTION_FIELD_PROMPT[locale][input.field];
}

// ---------------------------------------------------------------------------
// Intake request (Task 03 — patient intake ask, 9 call sites collapsed)
// ---------------------------------------------------------------------------

/**
 * Field identifier for the patient-intake ask. Aliases `PatientCollectionField`
 * so dynamic inputs like `extractResult.missingFields` (typed as
 * `PatientCollectionField[]`) flow through the helper without a cast.
 */
export type IntakeField = PatientCollectionField;

type IntakeRequestCopy = {
  readonly labels: Readonly<Record<IntakeField, string>>;
  /** Shorthand on the Reason bullet only — no separate Example block. */
  readonly reasonInlineExamples: string;
  /** Italic suffix after the Email label (includes surrounding `*(…)*`). */
  readonly emailOptionalSuffix: string;
  readonly stillNeedHeader: string;
  readonly stillNeedFooter: string;
  readonly retrySelf: string;
  /** Must contain `{{relation}}` (already bolded by the template). */
  readonly retryRelation: string;
  /** Must contain `{{practice}}` (already bolded by the template). */
  readonly initialSelfOpen: string;
  readonly initialSelfAsk: string;
  readonly initialAlreadyHaveReason: string;
  /** Must contain `{{relation}}`. */
  readonly initialRelationAsk: string;
};

/**
 * Intake ask copy by static locale (lang-09). hi/pa ship English until
 * human-reviewed translations land (LANG3-D4 / capture inbox).
 */
const INTAKE_REQUEST_COPY: Readonly<Record<StaticMessageLocale, IntakeRequestCopy>> = {
  en: {
    labels: {
      name: 'Full name',
      age: 'Age',
      gender: 'Gender',
      phone: 'Mobile number',
      reason_for_visit: 'Reason for visit',
      email: 'Email',
    },
    reasonInlineExamples: 'e.g. **headache**, **fever**',
    emailOptionalSuffix: '*(optional, for receipts)*',
    stillNeedHeader: 'Got it. Still need these details:',
    stillNeedFooter: 'You can paste them in one message.',
    retrySelf: "I didn't catch your details — could you resend them?",
    retryRelation: "I didn't catch the details for your **{{relation}}** — could you resend them?",
    initialSelfOpen: 'Sure — happy to help you book at **{{practice}}**.',
    initialSelfAsk: 'Please share these details (you can paste them all in one message):',
    initialAlreadyHaveReason:
      'We already have your **reason for visit** from earlier. Just need a few more:',
    initialRelationAsk: "I'll help you book for your **{{relation}}**. Please share their details:",
  },
  hi: {
    labels: {
      name: 'Full name',
      age: 'Age',
      gender: 'Gender',
      phone: 'Mobile number',
      reason_for_visit: 'Reason for visit',
      email: 'Email',
    },
    reasonInlineExamples: 'e.g. **headache**, **fever**',
    emailOptionalSuffix: '*(optional, for receipts)*',
    stillNeedHeader: 'Samajh gaya. Ab yeh details chahiye:',
    stillNeedFooter: 'Aap ek hi message mein paste kar sakte hain.',
    retrySelf: 'Aapki details samajh nahi aayi — kya dobara bhej sakte hain?',
    retryRelation:
      'Aapke **{{relation}}** ki details samajh nahi aayi — kya dobara bhej sakte hain?',
    initialSelfOpen: 'Zaroor — **{{practice}}** par appointment book karne mein khushi hogi.',
    initialSelfAsk: 'Yeh details share karein (ek hi message mein paste kar sakte hain):',
    initialAlreadyHaveReason: 'Pehle se aapka **reason for visit** hai. Bas kuch aur chahiye:',
    initialRelationAsk:
      'Main aapke **{{relation}}** ke liye book karne mein madad karunga. Unki details share karein:',
  },
  pa: {
    labels: {
      name: 'Full name',
      age: 'Age',
      gender: 'Gender',
      phone: 'Mobile number',
      reason_for_visit: 'Reason for visit',
      email: 'Email',
    },
    reasonInlineExamples: 'e.g. **headache**, **fever**',
    emailOptionalSuffix: '*(optional, for receipts)*',
    stillNeedHeader: 'Samajh gaya. Hun eh details chahidiyan ne:',
    stillNeedFooter: 'Tusi ik hi message vich paste kar sakde ho.',
    retrySelf: 'Tuhadi details samajh nahi aayi — ki dobara bhej sakde ho?',
    retryRelation: 'Tuhade **{{relation}}** di details samajh nahi aayi — ki dobara bhej sakde ho?',
    initialSelfOpen: 'Zaroor — **{{practice}}** te appointment book karn layi khushi hogi.',
    initialSelfAsk: 'Eh details share karo (ik hi message vich paste kar sakde ho):',
    initialAlreadyHaveReason: 'Pehlan ton tuhada **reason for visit** hai. Bas kuch hor chahida:',
    initialRelationAsk:
      'Main tuhade **{{relation}}** layi book karn vich madad karunga. Ohna di details share karo:',
  },
};

/**
 * Canonical English labels (backward-compatible export). Prefer the locale
 * table via `buildIntakeRequestMessage({ language })` for new work.
 */
export const INTAKE_FIELD_LABELS: Readonly<Record<IntakeField, string>> =
  INTAKE_REQUEST_COPY.en.labels;

export interface IntakeRequestInput {
  /**
   * Which flavor of ask this is.
   *   - `'initial'`              — first ask (self or relation booking). Renders
   *                                the greeting and the bulleted list. The
   *                                **Reason for visit** line includes a short
   *                                inline hint (e.g. headache, fever); there is no
   *                                separate example block for the whole form.
   *   - `'still-need'`           — partial follow-up after the extractor parsed
   *                                some fields. Tight header + list + "paste
   *                                in one message" footer, no example block.
   *   - `'retry-not-received'`   — patient's last message looked like an intake
   *                                attempt but yielded nothing. Softer header,
   *                                no example block.
   */
  readonly variant: 'initial' | 'still-need' | 'retry-not-received';

  /** Turn / conversation language (lang-09 / lang-10). Required — no silent `'en'` default. */
  readonly language: ConversationLanguage;

  /**
   * Doctor's practice name for the `'initial'` self-booking greeting. Empty or
   * missing falls back to `"the clinic"` (mirrors the existing
   * `doctorContext?.practice_name?.trim() || 'the clinic'` pattern upstream).
   * Ignored when `forRelation` is set or for non-initial variants.
   * Not translated (LANG3-D6).
   */
  readonly practiceName?: string;

  /**
   * Concrete relation word ("mother", "father", "sister", "son", ...) when the
   * ask is for somebody else. Lowercased and clamped to 32 chars. Pass
   * `undefined` for the generic "them" fallback; callers that need the
   * explicit "them" phrasing should provide a custom `intro` instead.
   */
  readonly forRelation?: string;

  /**
   * Which fields to ask for, in any order. Duplicates are de-duped; output
   * order is always canonical (`name → age → gender → phone → reason → email`)
   * regardless of input order. Omitting this defaults to all five required
   * fields (no email — email is appended by the `includeEmail` flag).
   */
  readonly missing?: readonly IntakeField[];

  /**
   * When `true` **and** the variant is `'initial'`, the greeting says
   *   "We already have your **reason for visit** from earlier. Just need a few more:"
   * and the `reason_for_visit` row is stripped from the list even if it was in
   * `missing`. No-op for other variants.
   */
  readonly alreadyHaveReason?: boolean;

  /**
   * Appends the `**Email** *(optional, for receipts)*` row. Default: `true`.
   * Pass `false` for `'still-need'` replies where the extractor's
   * `missingFields` never includes email (email is optional upstream) — stops
   * the helper from synthesizing an email row the handler didn't ask for.
   */
  readonly includeEmail?: boolean;

  /**
   * Escape hatch: when set, overrides the auto-generated greeting paragraph(s).
   * Used by call sites with unique conversational framing (e.g. the two-person
   * "I'll help you book for you and your mother. Let's take them one at a
   * time — your mother first, then you." header). The value is rendered as-is
   * above the bulleted list; separate paragraphs should be joined with `\n\n`
   * in the caller.
   */
  readonly intro?: string;
}

const DEFAULT_INTAKE_FIELDS: readonly IntakeField[] = [
  'name',
  'age',
  'gender',
  'phone',
  'reason_for_visit',
];

const INTAKE_FIELD_ORDER: readonly IntakeField[] = [
  'name',
  'age',
  'gender',
  'phone',
  'reason_for_visit',
  'email',
];

const MAX_RELATION_LENGTH = 32;

function normalizeRelation(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const lowered = trimmed.toLowerCase();
  if (lowered === 'them') return undefined;
  return lowered.slice(0, MAX_RELATION_LENGTH);
}

function fillIntakeTemplate(
  template: string,
  vars: { practice?: string; relation?: string }
): string {
  let out = template;
  if (vars.practice !== undefined) {
    out = out.replace(/\{\{practice\}\}/g, vars.practice);
  }
  if (vars.relation !== undefined) {
    out = out.replace(/\{\{relation\}\}/g, vars.relation);
  }
  return out;
}

function defaultIntakeIntro(params: {
  variant: IntakeRequestInput['variant'];
  practice: string;
  relation: string | undefined;
  alreadyHaveReason: boolean;
  copy: IntakeRequestCopy;
}): string[] {
  const { variant, practice, relation, alreadyHaveReason, copy } = params;

  if (variant === 'still-need') {
    return [copy.stillNeedHeader];
  }

  if (variant === 'retry-not-received') {
    if (relation) {
      return [fillIntakeTemplate(copy.retryRelation, { relation })];
    }
    return [copy.retrySelf];
  }

  // variant === 'initial'
  if (alreadyHaveReason) {
    return [
      fillIntakeTemplate(copy.initialSelfOpen, { practice }),
      '',
      copy.initialAlreadyHaveReason,
    ];
  }
  if (relation) {
    return [fillIntakeTemplate(copy.initialRelationAsk, { relation })];
  }
  return [fillIntakeTemplate(copy.initialSelfOpen, { practice }), '', copy.initialSelfAsk];
}

/**
 * Render the patient intake request (self or for-someone-else, initial /
 * still-need / retry).
 *
 * Contract (Plan "Patient DM copy polish", Task 03):
 *   - Bulleted list of fields with bolded labels (`- **Full name**`). No
 *     comma-joined shorthand anywhere — every field gets its own line.
 *   - `Email` row always renders with the ``*(optional, for receipts)*``
 *     italic suffix when included.
 *   - When **Reason for visit** is in the list, that bullet includes a short
 *     inline hint (`e.g. **headache**, **fever**`). No separate `Example:` block with
 *     sample patient lines — other fields do not get inline examples.
 *   - `'still-need'` appends a `You can paste them in one message.` footer.
 *   - Deterministic output order regardless of input order — safe to feed
 *     `extractResult.missingFields` (whose order is driven by the extractor).
 *
 * @throws when `missing` is provided as an empty array. That state means all
 *   required fields have already been captured, which is unreachable from any
 *   legitimate call site — throwing catches logic bugs loudly rather than
 *   shipping an empty bulleted list to the patient.
 */
export function buildIntakeRequestMessage(input: IntakeRequestInput): string {
  if (input.missing !== undefined && input.missing.length === 0) {
    throw new Error(
      'buildIntakeRequestMessage: missing[] must be non-empty (all fields already captured is an unreachable caller state — handler should transition to confirm_details instead of asking for details).'
    );
  }

  const locale = toStaticLocale(input.language);
  const copy = INTAKE_REQUEST_COPY[locale];
  const practice = (input.practiceName ?? '').trim() || 'the clinic';
  const relation = normalizeRelation(input.forRelation);
  const includeEmail = input.includeEmail !== false;

  const requested = new Set<IntakeField>(input.missing ?? DEFAULT_INTAKE_FIELDS);
  if (input.alreadyHaveReason) requested.delete('reason_for_visit');
  if (!includeEmail) requested.delete('email');

  let fields = INTAKE_FIELD_ORDER.filter((f) => requested.has(f));
  if (includeEmail && !fields.includes('email')) fields = [...fields, 'email'];

  const lines: string[] = [];
  const introOverride = input.intro?.trim();
  if (introOverride && introOverride.length > 0) {
    lines.push(introOverride);
  } else {
    lines.push(
      ...defaultIntakeIntro({
        variant: input.variant,
        practice,
        relation,
        alreadyHaveReason: Boolean(input.alreadyHaveReason),
        copy,
      })
    );
  }

  for (const f of fields) {
    if (f === 'email') {
      lines.push(`- **${copy.labels.email}** ${copy.emailOptionalSuffix}`);
    } else if (f === 'reason_for_visit') {
      lines.push(`- **${copy.labels.reason_for_visit}** — ${copy.reasonInlineExamples}`);
    } else {
      lines.push(`- **${copy.labels[f]}**`);
    }
  }

  if (input.variant === 'still-need') {
    lines.push('', copy.stillNeedFooter);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Consent / optional-extras (Task 04 — consent step, 2 call sites collapsed)
// ---------------------------------------------------------------------------

export interface ConsentMessageInput {
  readonly language: ConversationLanguage;

  /**
   * Captured patient name for the self-booking branch. Pass `undefined` when
   * the name hasn't been resolved (the helper renders a plain "Thanks." in
   * place of "Thanks, **{name}**."). Leave-blank sentinel strings (`'there'`
   * case-insensitively, or an empty/whitespace value) are also treated as
   * "missing" for the self branch — producing a cleaner greeting than the
   * old `Thanks, there.` fallback.
   *
   * Ignored for the someone-else branch.
   */
  readonly patientName?: string;

  /**
   * Pre-rendered phone display — either `**{digits}**` when a phone was
   * captured, or a human fallback like `"your number"`. The helper does NOT
   * re-wrap this value (caller owns bolding) so both upstream call sites keep
   * their existing conditional formatting.
   */
  readonly phoneDisplay: string;

  /** `true` → render the someone-else variant (consent + who-we'll-call-for). */
  readonly bookingForSomeoneElse: boolean;

  /**
   * Name of the person being booked for. Required when
   * `bookingForSomeoneElse` is `true`; the helper throws otherwise because
   * that state is unreachable from legitimate handler paths (the field is
   * captured during `collecting_all` before the consent step is entered).
   */
  readonly bookingForName?: string;
}

type ConsentOptionalExtrasCopy = {
  readonly thanksPlain: string;
  readonly thanksNamed: (name: string) => string;
  readonly selfPhoneLine: (phoneDisplay: string) => string;
  readonly notesQuestion: string;
  readonly selfCta: string;
  readonly otherPhoneLine: (phoneDisplay: string, forName: string) => string;
  readonly consentQuestion: string;
  readonly otherCta: string;
};

const CONSENT_OPTIONAL_EXTRAS_COPY: Readonly<
  Record<StaticMessageLocale, ConsentOptionalExtrasCopy>
> = {
  en: {
    thanksPlain: 'Thanks.',
    thanksNamed: (name) => `Thanks, **${name}**.`,
    selfPhoneLine: (phoneDisplay) =>
      `We'll use ${phoneDisplay} to confirm your appointment by call or text.`,
    notesQuestion:
      'Any notes for the doctor? _(allergies, current medicines, anything else — optional)_',
    selfCta: "Reply **Yes** when you're ready to pick a time.",
    otherPhoneLine: (phoneDisplay, forName) =>
      `We'll use ${phoneDisplay} to confirm the appointment for **${forName}**.`,
    consentQuestion: 'Do I have your consent to use these details to schedule?',
    otherCta: 'Reply **Yes** to continue.',
  },
  hi: {
    thanksPlain: 'Dhanyavaad.',
    thanksNamed: (name) => `Dhanyavaad, **${name}**.`,
    selfPhoneLine: (phoneDisplay) =>
      `Hum ${phoneDisplay} par call ya text se aapki appointment confirm karenge.`,
    notesQuestion:
      'Doctor ke liye koi notes? _(allergies, current medicines, kuch aur — optional)_',
    selfCta: 'Jab aap time pick karna chahein tab **Yes** reply karein.',
    otherPhoneLine: (phoneDisplay, forName) =>
      `Hum ${phoneDisplay} par **${forName}** ki appointment confirm karenge.`,
    consentQuestion: 'Kya aap in details se schedule karne ki consent dete hain?',
    otherCta: 'Aage badhne ke liye **Yes** reply karein.',
  },
  pa: {
    thanksPlain: 'Dhanyavaad.',
    thanksNamed: (name) => `Dhanyavaad, **${name}**.`,
    selfPhoneLine: (phoneDisplay) =>
      `Asi ${phoneDisplay} te call ya text naal tuhadi appointment confirm karange.`,
    notesQuestion: 'Doctor layi koi notes? _(allergies, current medicines, kuch hor — optional)_',
    selfCta: 'Jadon tusi time pick karna chaho tab **Yes** reply karo.',
    otherPhoneLine: (phoneDisplay, forName) =>
      `Asi ${phoneDisplay} te **${forName}** di appointment confirm karange.`,
    consentQuestion: 'Ki tusi eh details naal schedule karn di consent dinde ho?',
    otherCta: 'Aage vadh layi **Yes** reply karo.',
  },
};

/**
 * Regex-free "name is missing" check for the self-branch greeting. We treat
 * the handler's historical `'there'` sentinel as missing so patients with no
 * captured name get a clean `"Thanks."` instead of `"Thanks, **there**."`.
 */
function isMissingPatientName(raw: string | undefined): boolean {
  const trimmed = raw?.trim();
  if (!trimmed) return true;
  return trimmed.toLowerCase() === 'there';
}

/**
 * Render the consent / optional-extras DM sent right after `confirm_details`
 * → Yes. Two branches:
 *
 *   1. **Self booking** — three paragraphs: (a) Thanks + phone line,
 *      (b) open-ended "any notes?" question, (c) "Reply **Yes**" CTA. The
 *      "notes" question stays open-ended; downstream logic attaches free
 *      text as `preConsultationNotes`.
 *   2. **Someone-else booking** — three paragraphs: (a) Thanks + phone line
 *      naming the patient, (b) explicit consent question, (c) "Reply **Yes**"
 *      CTA. No "notes" ask — the clinic today only collects notes for
 *      self-bookings and Task 04 deliberately does NOT change that.
 *
 * Each paragraph is separated by a single blank line (`\n\n`). The final line
 * is always `Reply **Yes** …` so the upstream consent-response matchers (in
 * `booking-consent-context.ts` and the handler's `lastBotMessageAskedForConsent`
 * heuristic) continue to tag outbound messages correctly.
 *
 * @throws when `bookingForSomeoneElse` is `true` but `bookingForName` resolves
 *   empty. That state means the handler reached consent without capturing the
 *   patient's name during intake, which is an upstream bug worth surfacing.
 */
export function buildConsentOptionalExtrasMessage(input: ConsentMessageInput): string {
  const locale = toStaticLocale(input.language);
  const copy = CONSENT_OPTIONAL_EXTRAS_COPY[locale];
  const phoneDisplay = input.phoneDisplay.trim().length > 0 ? input.phoneDisplay : 'your number';

  if (input.bookingForSomeoneElse) {
    const forName = input.bookingForName?.trim();
    if (!forName) {
      throw new Error(
        'buildConsentOptionalExtrasMessage: bookingForName is required when bookingForSomeoneElse is true (consent step should not be reached before the intake step captures the patient name).'
      );
    }
    return [
      copy.thanksPlain,
      copy.otherPhoneLine(phoneDisplay, forName),
      '',
      copy.consentQuestion,
      '',
      copy.otherCta,
    ].join('\n');
  }

  const greetingLine = isMissingPatientName(input.patientName)
    ? copy.thanksPlain
    : copy.thanksNamed(input.patientName!.trim());

  return [
    greetingLine,
    copy.selfPhoneLine(phoneDisplay),
    '',
    copy.notesQuestion,
    '',
    copy.selfCta,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Payment confirmation (Task 05 — happy-path payment DM sectioning)
// ---------------------------------------------------------------------------

/**
 * Modality union accepted by `PaymentConfirmationInput.modality`. Deliberately
 * a **superset** of `ConsultationModality` (declared below) because the
 * booking-confirmation DM fires for in-clinic appointments too — whereas
 * `buildConsultationReadyDm` is teleconsult-only (no `in_clinic` branch
 * there, by design). Keeping the two unions distinct avoids accidentally
 * widening `ConsultationModality` and breaking the exhaustive switch in
 * `buildConsultationReadyDm`.
 */
export type PaymentConfirmationModality = ConsultationModality | 'in_clinic';

export interface PaymentConfirmationInput {
  readonly language: ConversationLanguage;

  /**
   * Pre-formatted appointment date/time string produced by the caller (usually
   * `formatAppointmentDate(iso, timezone)` in `notification-service.ts`). The
   * helper does not touch timezone math — it only normalizes the cosmetic
   * separator between the calendar portion and the clock portion.
   */
  readonly appointmentDateDisplay: string;

  /**
   * Minted patient MRN (e.g. `CLR-00123`). Omit or pass empty/whitespace to
   * render the shorter variant (no `🆔 Patient ID` block). The helper trims
   * the value before rendering so callers can pass raw DB values.
   */
  readonly patientMrn?: string;

  /**
   * Booked consultation modality — drives Principle 8 disambiguation copy
   * (plan-multi-modality-consultations.md). Only `'voice'` triggers a copy
   * variant today (audio-only disambiguation paragraph before the closing
   * line); the other values render the existing all-purpose copy unchanged.
   *
   * Optional + backward-compatible: existing callers that don't pass
   * `modality` get byte-identical output to the pre-Plan-05 helper (pinned
   * by the `dm-copy.snap.test.ts` regression fixtures).
   */
  readonly modality?: PaymentConfirmationModality;
}

type PaymentConfirmationCopy = {
  readonly received: string;
  readonly appointmentConfirmed: (dateDisplay: string) => string;
  readonly patientIdLine: (mrn: string) => string;
  readonly saveMrnHelper: string;
  readonly voiceDisambiguation: string;
  readonly closing: string;
};

const PAYMENT_CONFIRMATION_COPY: Readonly<Record<StaticMessageLocale, PaymentConfirmationCopy>> = {
  en: {
    received: '✅ **Payment received.**',
    appointmentConfirmed: (dateDisplay) =>
      `Your appointment is confirmed for **${formatDateWithMiddot(dateDisplay)}**.`,
    patientIdLine: (mrn) => `🆔 **Patient ID:** ${mrn}`,
    saveMrnHelper: '_Save this for future bookings._',
    voiceDisambiguation:
      "Note: voice consults happen via a web link from your browser — audio only, no phone call. We'll text + IG-DM the join link 5 min before.",
    closing:
      "We'll send a reminder before your visit. Reply here anytime if you need to reschedule or have questions.",
  },
  hi: {
    received: '✅ **Payment mil gayi.**',
    appointmentConfirmed: (dateDisplay) =>
      `Aapki appointment **${formatDateWithMiddot(dateDisplay)}** ke liye confirm ho gayi hai.`,
    patientIdLine: (mrn) => `🆔 **Patient ID:** ${mrn}`,
    saveMrnHelper: '_Future bookings ke liye save kar lein._',
    voiceDisambiguation:
      'Note: voice consult aapke browser se web link par hote hain — sirf audio, phone call nahi. 5 min pehle hum join link text + IG-DM karenge.',
    closing:
      'Visit se pehle hum reminder bhejenge. Reschedule ya koi sawaal ho to yahan reply karein.',
  },
  pa: {
    received: '✅ **Payment mil gayi.**',
    appointmentConfirmed: (dateDisplay) =>
      `Tuhadi appointment **${formatDateWithMiddot(dateDisplay)}** layi confirm ho gayi hai.`,
    patientIdLine: (mrn) => `🆔 **Patient ID:** ${mrn}`,
    saveMrnHelper: '_Future bookings layi save kar lo._',
    voiceDisambiguation:
      'Note: voice consult tuhade browser ton web link te hunde ne — sirf audio, phone call nahi. 5 min pehlan asi join link text + IG-DM karange.',
    closing:
      'Visit ton pehlan asi reminder bhejange. Reschedule ya koi sawaal hove ta ithe reply karo.',
  },
};

/**
 * Cosmetic rewrite of the `formatAppointmentDate` output.
 *
 * `Intl.DateTimeFormat('en-US', {weekday, month, day, year, hour, minute})`
 * emits `"Tue, Apr 29, 2026, 4:30 PM"`. We drop the year segment and swap the
 * remaining date/time comma for a middle dot so the confirmation line reads
 * `"Tue, Apr 29 · 4:30 PM"` — which is the single richest-feeling segment of
 * the payment DM and the one place in the patient flow where we invest a
 * glyph purely for scannability.
 *
 * Intentionally forgiving: if the input doesn't match the expected shape
 * (locale change, tz that emits `at` separator, caller passing a different
 * pre-formatted string), we return the input unchanged rather than throw —
 * the payment DM is too emotionally important to fail-closed on a cosmetic
 * glitch.
 */
export function formatDateWithMiddot(input: string): string {
  const match = input.match(
    /^([A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2})(?:,\s+\d{4})?,\s+(\d{1,2}:\d{2}\s*[AP]M)$/
  );
  if (!match) return input;
  return `${match[1]} · ${match[2]}`;
}

/**
 * Render the payment confirmation DM sent to the patient after a successful
 * Razorpay / provider capture.
 *
 * Layout contract (Plan "Patient DM copy polish", Task 05):
 *   - Paragraph 1: `✅ **Payment received.**` — the trust signal. The ✅ is
 *     deliberate and scoped to this one message family.
 *   - Paragraph 2: the confirmed appointment date with middle-dot separator.
 *   - Paragraph 3 (optional): `🆔 **Patient ID:** {mrn}` + italic "save this"
 *     helper. Omitted when no MRN is available (patient creation race, legacy
 *     flow).
 *   - Closing paragraph: reminder-before-visit promise + invitation to reply
 *     in the thread. This is the only place in the flow where we proactively
 *     tell the patient they can keep talking to us; the payment DM frequently
 *     arrives hours after the booking flow ends. Emergency wording stays off
 *     this Meta message; the booking page carries the 112/108 line.
 *
 * No emojis outside of `✅` and `🆔`. No booking / cancel links in the body.
 * No amount/currency (avoid source-of-truth drift with the provider UI).
 *
 * Principle 8 LOCKED disambiguation (Plan 05 · Task 26): when `input.modality
 * === 'voice'`, a short paragraph is inserted **before** the closing line
 * telling the patient the consult is an audio-only web link — *not* a phone
 * call. This prevents the "but the doctor never called me" support ticket
 * in markets (notably India) where "voice consult" defaults to "phone call".
 * See `plan-multi-modality-consultations.md` Principle 8 for the rationale.
 * All non-voice modalities (including `undefined`) render byte-identically
 * to the pre-Plan-05 output — pinned by regression snapshots.
 */
export function buildPaymentConfirmationMessage(input: PaymentConfirmationInput): string {
  const locale = toStaticLocale(input.language);
  const copy = PAYMENT_CONFIRMATION_COPY[locale];
  const parts: string[] = [
    copy.received,
    '',
    copy.appointmentConfirmed(input.appointmentDateDisplay),
  ];

  const mrn = input.patientMrn?.trim();
  if (mrn) {
    parts.push('', copy.patientIdLine(mrn), copy.saveMrnHelper);
  }

  if (input.modality === 'voice') {
    parts.push('', copy.voiceDisambiguation);
  }

  parts.push('', copy.closing);

  return parts.join('\n');
}

/**
 * Desk phone pre-booking confirmation (RQ7). Same confirmed-time / MRN /
 * closing as the payment DM, without "Payment received" —
 * the front desk booked them at no charge.
 */
export function buildDeskBookingConfirmationMessage(input: {
  readonly language: ConversationLanguage;
  readonly appointmentDateDisplay: string;
  readonly patientMrn?: string;
}): string {
  const locale = toStaticLocale(input.language);
  const copy = PAYMENT_CONFIRMATION_COPY[locale];
  const parts: string[] = [copy.appointmentConfirmed(input.appointmentDateDisplay)];

  const mrn = input.patientMrn?.trim();
  if (mrn) {
    parts.push('', copy.patientIdLine(mrn), copy.saveMrnHelper);
  }

  parts.push('', copy.closing);
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Abandoned-booking reminder (Task 06 — re-include booking URL)
// ---------------------------------------------------------------------------

export interface AbandonedBookingReminderInput {
  readonly language: ConversationLanguage;

  /**
   * Fully-qualified booking page URL, identical to the one originally sent
   * to the patient (callers should reuse `buildBookingPageUrl` from
   * `slot-selection-service.ts` so the cron-driven reminder points at the
   * same conversation-scoped page). Must be non-empty after trim — the cron
   * is already gated on `bookingLinkSentAt`, so an empty URL here means a
   * configuration bug (e.g. `PUBLIC_BOOKING_BASE_URL` missing) and we'd
   * rather surface that loudly than silently ship a reminder with no CTA.
   */
  readonly bookingUrl: string;
}

type AbandonedBookingReminderCopy = {
  readonly opener: string;
  readonly linkLabel: string;
  readonly closing: string;
};

const ABANDONED_BOOKING_REMINDER_COPY: Readonly<
  Record<StaticMessageLocale, AbandonedBookingReminderCopy>
> = {
  en: {
    opener: 'Just checking in — your booking link is still active.',
    linkLabel: 'Pick a time here:',
    closing: 'Reply here anytime if you need help.',
  },
  hi: {
    opener: 'Bas check kar rahe hain — aapka booking link abhi bhi active hai.',
    linkLabel: 'Yahan time pick karein:',
    closing: 'Help chahiye ho to yahan reply karein.',
  },
  pa: {
    opener: 'Bas check kar rahe haan — tuhada booking link hun vi active hai.',
    linkLabel: 'Ithe time pick karo:',
    closing: 'Help chahidi hove ta ithe reply karo.',
  },
};

/**
 * Render the one-shot abandoned-booking reminder DM sent ~1 hour after the
 * booking link was delivered, when the patient hasn't completed payment.
 *
 * Layout contract (Plan "Patient DM copy polish", Task 06):
 *   - Paragraph 1: "still active" status line (no CTA yet — just a nudge).
 *   - Paragraph 2: `"Pick a time here:"` label + the **URL on its own line**.
 *     Instagram DMs auto-linkify raw URLs far more reliably than markdown
 *     links, so we render the URL bare. The blank line above keeps the URL
 *     visually isolated as a tappable target.
 *   - Paragraph 3: short "reply here if you need help" closing.
 *
 * No emoji — this is a nudge, not a celebration.
 *
 * @throws when `bookingUrl` resolves empty / whitespace. The cron should
 *   never call into this helper without a URL; an empty value signals a
 *   configuration bug the reminder would otherwise mask.
 */
export function buildAbandonedBookingReminderMessage(input: AbandonedBookingReminderInput): string {
  const locale = toStaticLocale(input.language);
  const copy = ABANDONED_BOOKING_REMINDER_COPY[locale];
  const url = input.bookingUrl?.trim();
  if (!url) {
    throw new Error(
      'buildAbandonedBookingReminderMessage: bookingUrl is required (abandoned-booking reminder cron should never send a reminder without a resolvable booking URL — check PUBLIC_BOOKING_BASE_URL / conversation id / doctor id upstream).'
    );
  }
  return [copy.opener, '', copy.linkLabel, url, '', copy.closing].join('\n');
}

// ---------------------------------------------------------------------------
// Consultation-ready urgent ping (Plan 01 · Task 16)
// ---------------------------------------------------------------------------

/**
 * Modality token shared between booking, consultation_sessions, and the
 * fan-out builders below. Mirrors the union in
 * `backend/src/types/consultation-session.ts#Modality`. Re-declared locally
 * (not imported) so `dm-copy.ts` stays import-free of services / configs —
 * the file's contract is "pure functions, no side imports".
 */
export type ConsultationModality = 'text' | 'voice' | 'video';

export interface ConsultationReadyDmInput {
  readonly language: ConversationLanguage;

  /**
   * Which delivery rail this consult uses. The video branch ships in this
   * task. The text branch ships in Plan 04 (`text-consult` adapter); the
   * voice branch ships in Plan 05 (Principle 8 disambiguation copy). Until
   * those plans wire their copy in, this builder throws on the un-implemented
   * branches — quieter would let the caller silently ship a video-shaped
   * message for a voice consult, which is exactly what Decision 11 (mid-
   * consult mode switching) is designed to avoid.
   */
  readonly modality: ConsultationModality;

  /**
   * Doctor's practice name. Empty / whitespace falls back to
   * `"your doctor"` — same convention as the legacy
   * `sendConsultationLinkToPatient` so the rendered string stays stable
   * when migrating call sites.
   */
  readonly practiceName?: string;

  /**
   * Fully-qualified join URL — for video, the patient signed-token URL
   * minted by `getJoinTokenForAppointment`. The helper throws on empty so
   * a config bug (missing `CONSULTATION_JOIN_BASE_URL`) surfaces here
   * rather than shipping a CTA-less DM.
   */
  readonly joinUrl: string;
}

type ConsultationReadyModalityCopy = {
  readonly opener: (practice: string) => string;
  readonly linkLabel?: string;
  readonly voiceDisambiguation?: string;
  readonly closing: string;
};

type ConsultationReadyCopy = Readonly<Record<ConsultationModality, ConsultationReadyModalityCopy>>;

const CONSULTATION_READY_COPY: Readonly<Record<StaticMessageLocale, ConsultationReadyCopy>> = {
  en: {
    video: {
      opener: (practice) => `Your video consult with **${practice}** is starting.`,
      linkLabel: 'Join here:',
      closing: 'Reply in this thread if anything looks wrong.',
    },
    text: {
      opener: (practice) => `Your text consult with **${practice}** is starting.`,
      linkLabel: 'Open the chat:',
      closing: 'Reply in this thread if anything looks wrong.',
    },
    voice: {
      opener: (practice) => `Your voice consult with **${practice}** is starting.`,
      voiceDisambiguation:
        '👉 This is an internet voice call (audio only) — NOT a phone call. Tap the link below to join from this device.',
      closing: 'Reply in this thread if anything looks wrong.',
    },
  },
  hi: {
    video: {
      opener: (practice) => `Aapka video consult **${practice}** ke saath shuru ho raha hai.`,
      linkLabel: 'Yahan join karein:',
      closing: 'Kuch galat lage to is thread mein reply karein.',
    },
    text: {
      opener: (practice) => `Aapka text consult **${practice}** ke saath shuru ho raha hai.`,
      linkLabel: 'Chat kholen:',
      closing: 'Kuch galat lage to is thread mein reply karein.',
    },
    voice: {
      opener: (practice) => `Aapka voice consult **${practice}** ke saath shuru ho raha hai.`,
      voiceDisambiguation:
        '👉 Yeh internet voice call hai (sirf audio) — phone call NAHI. Neeche diye link se is device se join karein.',
      closing: 'Kuch galat lage to is thread mein reply karein.',
    },
  },
  pa: {
    video: {
      opener: (practice) => `Tuhada video consult **${practice}** naal shuru ho reha hai.`,
      linkLabel: 'Ithe join karo:',
      closing: 'Kuj galat lage ta is thread vich reply karo.',
    },
    text: {
      opener: (practice) => `Tuhada text consult **${practice}** naal shuru ho reha hai.`,
      linkLabel: 'Chat kholo:',
      closing: 'Kuj galat lage ta is thread vich reply karo.',
    },
    voice: {
      opener: (practice) => `Tuhada voice consult **${practice}** naal shuru ho reha hai.`,
      voiceDisambiguation:
        '👉 Eh internet voice call hai (sirf audio) — phone call NAHI. Thalle ditta link ton is device ton join karo.',
      closing: 'Kuj galat lage ta is thread vich reply karo.',
    },
  },
};

const CONSULTATION_READY_DEFAULT_PRACTICE = enByPolicy(
  'your doctor',
  'LANG3-D6: doctor/practice name tokens stay English'
);

/**
 * Render the urgent-moment "your consult is ready, here's the link" DM.
 *
 * This is intentionally distinct from `sendConsultationLinkToPatient`'s
 * inline string — that one fires at booking-confirmation time with
 * "you've booked, save this link". This one fires at consult-start time
 * with "join NOW".
 *
 * Layout (video branch):
 *   - Paragraph 1: trust signal + modality label (`Video consult`).
 *   - Paragraph 2: bare URL on its own line — Instagram + SMS clients
 *     auto-linkify raw URLs more reliably than markdown. Blank line
 *     above keeps the URL isolated as a tappable target (same convention
 *     as `buildAbandonedBookingReminderMessage` and
 *     `buildStaffReviewResolvedBookingMessage`).
 *   - Paragraph 3: "reply here if anything's wrong" closing — important
 *     because urgent fan-outs hit SMS where the patient can't reply to the
 *     bot. The line points them back to the IG / app thread.
 *
 * @throws when `joinUrl` is empty (always a caller bug — the fan-out
 *   helper computes the URL via the consultation-session-service before
 *   calling).
 */
export function buildConsultationReadyDm(input: ConsultationReadyDmInput): string {
  const locale = toStaticLocale(input.language);
  const copy = CONSULTATION_READY_COPY[locale];
  const url = input.joinUrl?.trim();
  if (!url) {
    throw new Error(
      'buildConsultationReadyDm: joinUrl is required (the fan-out helper computes the patient join URL via consultation-session-service before calling — empty here means an upstream config / token-mint bug).'
    );
  }
  const practice = input.practiceName?.trim() || CONSULTATION_READY_DEFAULT_PRACTICE[locale];

  switch (input.modality) {
    case 'video': {
      const branch = copy.video;
      return [branch.opener(practice), '', branch.linkLabel, url, '', branch.closing].join('\n');
    }

    case 'text': {
      const branch = copy.text;
      return [branch.opener(practice), '', branch.linkLabel, url, '', branch.closing].join('\n');
    }

    case 'voice': {
      const branch = copy.voice;
      return [
        branch.opener(practice),
        '',
        branch.voiceDisambiguation,
        '',
        url,
        '',
        branch.closing,
      ].join('\n');
    }

    default: {
      const _exhaustive: never = input.modality;
      throw new Error(`buildConsultationReadyDm: unhandled modality ${String(_exhaustive)}`);
    }
  }
}

/**
 * Pre-visit lobby check-in invite (crc-03). Distinct from consult-ready
 * (which fires when the doctor starts / text pre-ping creates a session).
 */
export interface ConsultationCheckinDmInput {
  readonly language: ConversationLanguage;
  readonly practiceName?: string;
  readonly joinUrl: string;
  /** Full patient name; greeting uses first token only. */
  readonly patientName?: string;
  /** Human-readable local time, e.g. "Wed, 12 Aug, 8:19 pm". */
  readonly whenLabel?: string;
  /** Whole minutes remaining until appointment_date (computed at send). */
  readonly minutesLeft?: number;
}

function previsitGreeting(locale: StaticMessageLocale, patientName: string | undefined): string {
  const first = patientName?.trim().split(/\s+/)[0];
  if (!first || isMissingPatientName(first)) {
    const plain: Record<StaticMessageLocale, string> = {
      en: 'Hi,',
      hi: 'नमस्ते,',
      pa: 'Sat sri akaal,',
    };
    return plain[locale] ?? plain.en;
  }
  const named: Record<StaticMessageLocale, (n: string) => string> = {
    en: (n) => `Hi ${n},`,
    hi: (n) => `नमस्ते ${n},`,
    pa: (n) => `Sat sri akaal ${n},`,
  };
  return (named[locale] ?? named.en)(first);
}

/** Patient-facing "about N minutes / hours" for previsit ladder copy. */
export function formatPrevisitTimeLeftPhrase(
  locale: StaticMessageLocale,
  minutesLeft: number
): string {
  const m = Math.max(0, Math.round(minutesLeft));
  if (m < 60) {
    const phrases: Record<StaticMessageLocale, string> = {
      en: m === 1 ? 'about 1 minute' : `about ${m} minutes`,
      hi: m === 1 ? 'लगभग 1 मिनट' : `लगभग ${m} मिनट`,
      pa: m === 1 ? 'lagbhag 1 minute' : `lagbhag ${m} minute`,
    };
    return phrases[locale] ?? phrases.en;
  }
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  if (rest === 0) {
    const phrases: Record<StaticMessageLocale, string> = {
      en: hours === 1 ? 'about 1 hour' : `about ${hours} hours`,
      hi: hours === 1 ? 'लगभग 1 घंटा' : `लगभग ${hours} घंटे`,
      pa: hours === 1 ? 'lagbhag 1 ghanta' : `lagbhag ${hours} ghante`,
    };
    return phrases[locale] ?? phrases.en;
  }
  const phrases: Record<StaticMessageLocale, string> = {
    en: hours === 1 ? `about 1 hour ${rest} minutes` : `about ${hours} hours ${rest} minutes`,
    hi: `लगभग ${hours} घंटे ${rest} मिनट`,
    pa: `lagbhag ${hours} ghante ${rest} minute`,
  };
  return phrases[locale] ?? phrases.en;
}

export function buildConsultationCheckinDm(input: ConsultationCheckinDmInput): string {
  const locale = toStaticLocale(input.language);
  const url = input.joinUrl?.trim();
  if (!url) {
    throw new Error('buildConsultationCheckinDm: joinUrl is required');
  }
  const practice = input.practiceName?.trim() || CONSULTATION_READY_DEFAULT_PRACTICE[locale];
  const hi = previsitGreeting(locale, input.patientName);
  const when = input.whenLabel?.trim();
  const timeLeft =
    typeof input.minutesLeft === 'number' && Number.isFinite(input.minutesLeft)
      ? formatPrevisitTimeLeftPhrase(locale, input.minutesLeft)
      : null;

  const openerByLocale: Record<StaticMessageLocale, string> = {
    en:
      when && timeLeft
        ? `Your visit with **${practice}** is at ${when} — ${timeLeft} left.`
        : timeLeft
          ? `Your visit with **${practice}** is coming up soon — ${timeLeft} left.`
          : when
            ? `Your visit with **${practice}** is at ${when}.`
            : `Your visit with **${practice}** is coming up soon.`,
    hi:
      when && timeLeft
        ? `**${practice}** के साथ आपकी विज़िट ${when} पर है — ${timeLeft} बचे हैं।`
        : timeLeft
          ? `**${practice}** के साथ आपकी विज़िट जल्द शुरू होने वाली है — ${timeLeft} बचे हैं।`
          : when
            ? `**${practice}** के साथ आपकी विज़िट ${when} पर है।`
            : `**${practice}** के साथ आपकी विज़िट जल्द शुरू होने वाली है।`,
    pa:
      when && timeLeft
        ? `**${practice}** naal tuhadi visit ${when} te hai — ${timeLeft} bache han.`
        : timeLeft
          ? `**${practice}** naal tuhadi visit jald shuru hon wali hai — ${timeLeft} bache han.`
          : when
            ? `**${practice}** naal tuhadi visit ${when} te hai.`
            : `**${practice}** naal tuhadi visit jald shuru hon wali hai.`,
  };

  const bodyByLocale: Record<StaticMessageLocale, { body: string; closing: string }> = {
    en: {
      body: 'Open the waiting room so you are ready when the doctor starts:',
      closing: 'Stay on that page — we will connect you automatically.',
    },
    hi: {
      body: 'वेटिंग रूम खोलें ताकि डॉक्टर शुरू करें तो आप तैयार हों:',
      closing: 'उस पेज पर बने रहें — हम आपको अपने आप जोड़ देंगे।',
    },
    pa: {
      body: 'Waiting room kholo taaki doctor start kare te tusi ready hovo:',
      closing: 'Us page te raho — asi tuhanu automatically connect kar denge.',
    },
  };

  const branch = bodyByLocale[locale] ?? bodyByLocale.en;
  const opener = openerByLocale[locale] ?? openerByLocale.en;
  return [hi, '', opener, '', branch.body, url, '', branch.closing].join('\n');
}

/**
 * T−24h soft reminder — no join link (link comes at T−30 / T−15 / T−5).
 * No 112/108 line: that sentence lives on the booking page, not in Meta chat.
 */
export interface AppointmentReminder24hDmInput {
  readonly language: ConversationLanguage;
  readonly practiceName?: string;
  /** Human-readable local time line, e.g. "3:30 pm". */
  readonly whenLabel: string;
  readonly patientName?: string;
  /** Whole minutes remaining until appointment_date (computed at send). */
  readonly minutesLeft?: number;
}

export function buildAppointmentReminder24hDm(input: AppointmentReminder24hDmInput): string {
  const locale = toStaticLocale(input.language);
  const practice = input.practiceName?.trim() || CONSULTATION_READY_DEFAULT_PRACTICE[locale];
  const when = input.whenLabel?.trim() || 'your scheduled time';
  const hi = previsitGreeting(locale, input.patientName);
  const timeLeft =
    typeof input.minutesLeft === 'number' && Number.isFinite(input.minutesLeft)
      ? formatPrevisitTimeLeftPhrase(locale, input.minutesLeft)
      : null;

  const copy: Record<StaticMessageLocale, string[]> = {
    en: [
      timeLeft
        ? `Just a reminder — your visit with **${practice}** is tomorrow (${when}) — ${timeLeft} left.`
        : `Just a reminder — your visit with **${practice}** is tomorrow (${when}).`,
      '',
      "We'll send a waiting-room link closer to your appointment.",
      'Reply in this thread if you need to reschedule.',
    ],
    hi: [
      timeLeft
        ? `रिमाइंडर: **${practice}** के साथ आपकी विज़िट कल है (${when}) — ${timeLeft} बचे हैं।`
        : `रिमाइंडर: **${practice}** के साथ आपकी विज़िट कल है (${when})।`,
      '',
      'अपॉइंटमेंट के करीब हम वेटिंग-रूम लिंक भेजेंगे।',
      'रिशेड्यूल के लिए इस थ्रेड में जवाब दें।',
    ],
    pa: [
      timeLeft
        ? `Reminder: **${practice}** naal tuhadi visit kal hai (${when}) — ${timeLeft} bache han.`
        : `Reminder: **${practice}** naal tuhadi visit kal hai (${when}).`,
      '',
      'Appointment de kareeb asi waiting-room link bhejange.',
      'Reschedule laee is thread vich reply karo.',
    ],
  };

  return [hi, '', ...(copy[locale] ?? copy.en)].join('\n');
}

/**
 * T−15 / T−5 check-in nudge — includes join link; only when not already waiting.
 */
export interface ConsultationCheckinNudgeDmInput {
  readonly language: ConversationLanguage;
  readonly practiceName?: string;
  readonly joinUrl: string;
  /**
   * Stage window (15 or 5). Prefer `minutesLeftActual` in the opener when set.
   */
  readonly minutesLeft: 15 | 5;
  /** Computed minutes remaining at send — used when present for accurate copy. */
  readonly minutesLeftActual?: number;
  readonly whenLabel?: string;
  readonly patientName?: string;
}

export function buildConsultationCheckinNudgeDm(input: ConsultationCheckinNudgeDmInput): string {
  const locale = toStaticLocale(input.language);
  const url = input.joinUrl?.trim();
  if (!url) {
    throw new Error('buildConsultationCheckinNudgeDm: joinUrl is required');
  }
  const practice = input.practiceName?.trim() || CONSULTATION_READY_DEFAULT_PRACTICE[locale];
  const stageMins = input.minutesLeft;
  const actualMins =
    typeof input.minutesLeftActual === 'number' && Number.isFinite(input.minutesLeftActual)
      ? input.minutesLeftActual
      : stageMins;
  const timeLeft = formatPrevisitTimeLeftPhrase(locale, actualMins);
  const when = input.whenLabel?.trim();
  const hi = previsitGreeting(locale, input.patientName);

  const openerByLocale: Record<StaticMessageLocale, string> = {
    en: when
      ? `Your visit with **${practice}** is at ${when} — ${timeLeft} left.`
      : stageMins === 5
        ? `Your visit with **${practice}** starts in ${timeLeft}.`
        : `${timeLeft.charAt(0).toUpperCase()}${timeLeft.slice(1)} until your visit with **${practice}**.`,
    hi: when
      ? `**${practice}** के साथ आपकी विज़िट ${when} पर है — ${timeLeft} बचे हैं।`
      : `**${practice}** के साथ आपकी विज़िट ${timeLeft} में शुरू होगी।`,
    pa: when
      ? `**${practice}** naal tuhadi visit ${when} te hai — ${timeLeft} bache han.`
      : `**${practice}** naal tuhadi visit ${timeLeft} vich shuru hovegi.`,
  };

  const bodyByLocale: Record<StaticMessageLocale, { body: string; closing: string }> = {
    en: {
      body: 'Open the waiting room now so you are ready:',
      closing: 'Stay on that page — we connect you when the doctor starts.',
    },
    hi: {
      body: 'अभी वेटिंग रूम खोलें:',
      closing: 'उस पेज पर बने रहें — डॉक्टर शुरू करें तो हम जोड़ देंगे।',
    },
    pa: {
      body: 'Hune waiting room kholo:',
      closing: 'Us page te raho — doctor start kare te asi connect kar denge.',
    },
  };

  const branch = bodyByLocale[locale] ?? bodyByLocale.en;
  const opener = openerByLocale[locale] ?? openerByLocale.en;
  return [hi, '', opener, '', branch.body, url, '', branch.closing].join('\n');
}

/**
 * T=0 — consult scheduled time has arrived (join link).
 */
export interface ConsultationStartingNowDmInput {
  readonly language: ConversationLanguage;
  readonly practiceName?: string;
  readonly joinUrl: string;
  readonly whenLabel?: string;
  readonly patientName?: string;
}

export function buildConsultationStartingNowDm(input: ConsultationStartingNowDmInput): string {
  const locale = toStaticLocale(input.language);
  const url = input.joinUrl?.trim();
  if (!url) {
    throw new Error('buildConsultationStartingNowDm: joinUrl is required');
  }
  const practice = input.practiceName?.trim() || CONSULTATION_READY_DEFAULT_PRACTICE[locale];
  const when = input.whenLabel?.trim();
  const hi = previsitGreeting(locale, input.patientName);

  const openerByLocale: Record<StaticMessageLocale, string> = {
    en: when
      ? `Your visit with **${practice}** is starting now (${when}).`
      : `Your visit with **${practice}** is starting now.`,
    hi: when
      ? `**${practice}** के साथ आपकी विज़िट अभी शुरू हो रही है (${when})।`
      : `**${practice}** के साथ आपकी विज़िट अभी शुरू हो रही है।`,
    pa: when
      ? `**${practice}** naal tuhadi visit hune shuru ho rahi hai (${when}).`
      : `**${practice}** naal tuhadi visit hune shuru ho rahi hai.`,
  };

  const bodyByLocale: Record<StaticMessageLocale, { body: string; closing: string }> = {
    en: {
      body: 'Open the waiting room now:',
      closing: 'Stay on that page — we connect you when the doctor starts.',
    },
    hi: {
      body: 'अभी वेटिंग रूम खोलें:',
      closing: 'उस पेज पर बने रहें — डॉक्टर शुरू करें तो हम जोड़ देंगे।',
    },
    pa: {
      body: 'Hune waiting room kholo:',
      closing: 'Us page te raho — doctor start kare te asi connect kar denge.',
    },
  };

  const branch = bodyByLocale[locale] ?? bodyByLocale.en;
  const opener = openerByLocale[locale] ?? openerByLocale.en;
  return [hi, '', opener, '', branch.body, url, '', branch.closing].join('\n');
}

export interface PrescriptionReadyPingDmInput {
  readonly language: ConversationLanguage;

  /**
   * Doctor's practice name. Empty / whitespace falls back to `"your doctor"`.
   */
  readonly practiceName?: string;

  /**
   * Optional patient-facing prescription view URL. When present, the ping
   * includes a deep link on its own line. When `undefined` (no
   * `PRESCRIPTION_VIEW_BASE_URL` configured), the ping is URL-less — the
   * existing `sendPrescriptionToPatient` already delivered the prescription
   * content body, so the patient still has the prescription either way.
   */
  readonly viewUrl?: string;
}

type PrescriptionReadyPingCopy = {
  readonly withUrlOpener: (practice: string) => string;
  readonly linkLabel: string;
  readonly withoutUrl: (practice: string) => string;
};

const PRESCRIPTION_READY_PING_COPY: Readonly<
  Record<StaticMessageLocale, PrescriptionReadyPingCopy>
> = {
  en: {
    withUrlOpener: (practice) => `Your prescription from **${practice}** is ready.`,
    linkLabel: 'View it here:',
    withoutUrl: (practice) =>
      `Your prescription from **${practice}** is ready — check your messages above.`,
  },
  hi: {
    withUrlOpener: (practice) => `**${practice}** se aapki prescription ready hai.`,
    linkLabel: 'Yahan dekhein:',
    withoutUrl: (practice) =>
      `**${practice}** se aapki prescription ready hai — upar messages check karein.`,
  },
  pa: {
    withUrlOpener: (practice) => `**${practice}** ton tuhadi prescription ready hai.`,
    linkLabel: 'Ithe dekho:',
    withoutUrl: (practice) =>
      `**${practice}** ton tuhadi prescription ready hai — upar messages check karo.`,
  },
};

const PRESCRIPTION_READY_DEFAULT_PRACTICE = enByPolicy(
  'your doctor',
  'LANG3-D6: doctor/practice name tokens stay English'
);

/**
 * Render the urgent-moment "your prescription is ready" ping. This is the
 * companion to `sendPrescriptionToPatient` (which delivers the actual
 * content) — fires ~30s later from the post-prescription worker so the
 * patient notices, even if they missed the first message in a busy IG inbox.
 *
 * Deliberately short — three lines max. The patient already received the
 * content; this is a notification, not a re-delivery.
 */
export function buildPrescriptionReadyPingDm(input: PrescriptionReadyPingDmInput): string {
  const locale = toStaticLocale(input.language);
  const copy = PRESCRIPTION_READY_PING_COPY[locale];
  const practice = input.practiceName?.trim() || PRESCRIPTION_READY_DEFAULT_PRACTICE[locale];
  const url = input.viewUrl?.trim();

  if (url) {
    return [copy.withUrlOpener(practice), '', copy.linkLabel, url].join('\n');
  }

  return copy.withoutUrl(practice);
}

// ---------------------------------------------------------------------------
// Inline-in-chat prescription delivery (Plan 04 · Task 21)
// ---------------------------------------------------------------------------

export interface PrescriptionReadyDmInput {
  readonly language: ConversationLanguage;

  /**
   * Doctor's display name (e.g. `'Dr. Sharma'`). Empty / whitespace falls
   * back to `'your doctor'` — same convention as the rest of the dm-copy
   * builders.
   */
  readonly doctorName?: string;

  /**
   * Stable prescription identifier — quoted in the body so the patient can
   * cite it in any later support query. Required; empty throws.
   */
  readonly prescriptionId: string;

  /**
   * Signed URL to the prescription PDF. Required; empty throws. The
   * upstream `prescription-attachment-service` mints the signed URL before
   * this builder is invoked.
   */
  readonly pdfUrl: string;
}

type PrescriptionReadyDmCopy = {
  readonly header: (doctor: string) => string;
  readonly bodyIntro: string;
  readonly referenceLabel: (id: string) => string;
  readonly nextStepsHeader: string;
  readonly nextSteps: readonly string[];
  readonly closing: string;
};

const PRESCRIPTION_READY_DM_COPY: Readonly<Record<StaticMessageLocale, PrescriptionReadyDmCopy>> = {
  en: {
    header: (doctor) => `Prescription from **${doctor}**`,
    bodyIntro: 'Your prescription is ready. View or download the PDF here:',
    referenceLabel: (id) => `Reference ID: ${id}`,
    nextStepsHeader: 'Next steps:',
    nextSteps: ['• Save the PDF for your pharmacy.'],
    closing: '• Reply here in the chat if you have any questions about your prescription.',
  },
  hi: {
    header: (doctor) => `**${doctor}** se prescription`,
    bodyIntro: 'Aapki prescription ready hai. PDF yahan dekhein ya download karein:',
    referenceLabel: (id) => `Reference ID: ${id}`,
    nextStepsHeader: 'Agle steps:',
    nextSteps: ['• Pharmacy ke liye PDF save karein.'],
    closing: '• Prescription ke baare mein koi sawaal ho to yahan chat mein reply karein.',
  },
  pa: {
    header: (doctor) => `**${doctor}** ton prescription`,
    bodyIntro: 'Tuhadi prescription ready hai. PDF ithe dekho ya download karo:',
    referenceLabel: (id) => `Reference ID: ${id}`,
    nextStepsHeader: 'Agle steps:',
    nextSteps: ['• Pharmacy layi PDF save karo.'],
    closing: '• Prescription baare koi sawaal hove ta ithe chat vich reply karo.',
  },
};

const PRESCRIPTION_READY_DM_DEFAULT_DOCTOR = enByPolicy(
  'your doctor',
  'LANG3-D6: doctor/practice name tokens stay English'
);

/**
 * Render the **inline-in-chat** prescription-ready message. This is the
 * companion to `buildPrescriptionReadyPingDm`:
 *
 *   · `buildPrescriptionReadyPingDm` is the urgent fan-out **ping** sent
 *     across SMS / IG-DM / email — it must fit an SMS, so it's three
 *     lines max and treats the link as glanceable.
 *
 *   · `buildPrescriptionReadyDm` (this one) is the **inline message body**
 *     posted into the active `<TextConsultRoom>` chat at consult-end (Plan
 *     04 lifecycle wiring). The patient is already in a real conversation,
 *     so the message can afford to include the reference ID and a
 *     two-bullet next-steps list.
 *
 * Both can fire on the same prescription event — they're complementary
 * surfaces, not redundant.
 *
 * The "Reply here in the chat …" closing intentionally points back to the
 * same chat thread the message lands in. Decision 5 LOCKED makes text
 * consults live-only, so this only works **before** `endSession` fires.
 * Plan 04's chat-end flow posts this message **just before** the session
 * status flips to `'ended'`. If the patient races their reply past
 * `endSession`, the RLS INSERT policy rejects it and the chat client must
 * surface the "this consult has ended" state — documented as a known v1
 * trade-off in Plan 04 Task 19's notes.
 *
 * @throws when `pdfUrl` or `prescriptionId` is empty (always a caller bug
 *   — `prescription-attachment-service` mints the signed URL and the
 *   prescription row supplies the ID; either being absent here means an
 *   upstream wiring problem).
 */
export function buildPrescriptionReadyDm(input: PrescriptionReadyDmInput): string {
  const locale = toStaticLocale(input.language);
  const copy = PRESCRIPTION_READY_DM_COPY[locale];
  const pdf = input.pdfUrl?.trim();
  if (!pdf) {
    throw new Error(
      'buildPrescriptionReadyDm: pdfUrl is required (upstream prescription-attachment-service must mint the signed URL before this helper is called — empty here means an upstream wiring bug).'
    );
  }
  const id = input.prescriptionId?.trim();
  if (!id) {
    throw new Error(
      'buildPrescriptionReadyDm: prescriptionId is required (the prescription row supplies it — empty here means an upstream wiring bug).'
    );
  }
  const doctor = input.doctorName?.trim() || PRESCRIPTION_READY_DM_DEFAULT_DOCTOR[locale];

  return [
    copy.header(doctor),
    '',
    copy.bodyIntro,
    pdf,
    '',
    copy.referenceLabel(id),
    '',
    copy.nextStepsHeader,
    ...copy.nextSteps,
    copy.closing,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Cancel-appointment choice list (Task 07 — pick-list polish)
// ---------------------------------------------------------------------------

/**
 * Maps an `appointments.consultation_type` DB value (see
 * `backend/src/types/database.ts` — `'text' | 'voice' | 'video' | 'in_clinic'`)
 * to a patient-facing label suitable for the cancel-list suffix. Returns
 * `undefined` for unknown / null inputs so the caller can omit the ` — X`
 * suffix rather than leak a raw enum token (e.g. `"Tue, Apr 29 · 4:30 PM — voice"`)
 * into the DM.
 *
 * Centralized here so future DM copy that needs the same labeling (reschedule
 * list, appointment-status line, reminder SMS) can import one source of
 * truth — the Plan 04 Task 07 audit already flagged that the handler has
 * three near-duplicate inline labels today.
 */
const APPOINTMENT_CONSULTATION_TYPE_LABELS = enByPolicy<
  Readonly<Record<'text' | 'voice' | 'video' | 'in_clinic', string>>
>(
  {
    text: 'Text consult',
    voice: 'Voice consult',
    video: 'Video consult',
    in_clinic: 'In-person',
  },
  'LANG6-D6: patients say "video consult" in English inside Hindi'
);

export function appointmentConsultationTypeToLabel(
  type: string | null | undefined,
  language: ConversationLanguage
): string | undefined {
  const locale = toStaticLocale(language);
  const labels = APPOINTMENT_CONSULTATION_TYPE_LABELS[locale];
  const normalized = type?.trim().toLowerCase();
  switch (normalized) {
    case 'text':
      return labels.text;
    case 'voice':
      return labels.voice;
    case 'video':
      return labels.video;
    case 'in_clinic':
      return labels.in_clinic;
    default:
      return undefined;
  }
}

/**
 * Format an appointment's ISO date in the patient's doctor timezone into the
 * "Tue, Apr 29 · 4:30 PM" shape used by the cancel / choice-list DMs.
 *
 * Kept next to `buildCancelChoiceListMessage` because every call site that
 * needs this exact format also needs the cancel-list layout — and the
 * "caller formats, builder lays out" rule only prevents the *list builder*
 * from pulling in `Intl.DateTimeFormat`, not every helper in the file. The
 * handler stays at "caller formats" — it calls this helper then passes the
 * resulting string into the list builder.
 *
 * Produces en-US output (month before day, uppercase AM/PM) to match the
 * payment-confirmation DM — we'd rather pay the small format inconsistency
 * with the handler's own legacy `formatAppointmentStatusLine` (en-GB, day
 * before month) than ship two different date shapes inside the same DM
 * family. Falls back to the raw `Intl` output if the middot rewrite doesn't
 * match — never throws.
 */
export function formatAppointmentChoiceDate(isoDate: string, timezone: string): string {
  const d = new Date(isoDate);
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
  return formatDateWithMiddot(formatted);
}

export interface CancelChoiceItem {
  /**
   * Pre-formatted date/time, usually from `formatAppointmentChoiceDate(iso, tz)`.
   * The builder renders the string verbatim — callers own timezone math.
   */
  readonly dateDisplay: string;

  /**
   * Patient-facing modality label (`"Video consult"`, `"In-person"`, …).
   * Usually produced by `appointmentConsultationTypeToLabel(a.consultation_type)`.
   * `undefined` / empty omits the ` — X` suffix rather than printing
   * `" — undefined"` or a raw enum token.
   */
  readonly modalityLabel?: string;
}

export interface CancelChoiceListInput {
  readonly language: ConversationLanguage;

  /**
   * Items to render, in the order the handler already resolved them (the
   * cancel / reschedule path sorts by `appointment_date` ascending before
   * calling into the handler; the builder preserves that order so the
   * patient's reply number maps 1:1 to
   * `state.cancel.pendingAppointmentIds[n-1]`).
   *
   * Must be non-empty — an empty array is an unreachable caller state (the
   * handler already branches to the `"no upcoming"` copy when
   * `upcoming.length === 0`).
   */
  readonly items: readonly CancelChoiceItem[];
}

type CancelChoiceListCopy = {
  readonly singleItemOpener: (dateWithSuffix: string) => string;
  readonly singleItemCta: string;
  readonly multiHeader: string;
  readonly twoItemTrailer: string;
  readonly multiItemTrailer: (count: number) => string;
};

const CANCEL_CHOICE_LIST_COPY: Readonly<Record<StaticMessageLocale, CancelChoiceListCopy>> = {
  en: {
    singleItemOpener: (dateWithSuffix) =>
      `You have one upcoming appointment: **${dateWithSuffix}**.`,
    singleItemCta: 'Reply **Yes** to cancel it, or tell me what else to do.',
    multiHeader: 'Which appointment would you like to cancel?',
    twoItemTrailer: 'Reply **1** or **2**.',
    multiItemTrailer: (count) => `Reply a number from **1** to **${count}**.`,
  },
  hi: {
    singleItemOpener: (dateWithSuffix) =>
      `Aapki ek upcoming appointment hai: **${dateWithSuffix}**.`,
    singleItemCta: 'Cancel karne ke liye **Yes** reply karein, ya aur kuch batayein.',
    multiHeader: 'Kaunsi appointment cancel karni hai?',
    twoItemTrailer: '**1** ya **2** reply karein.',
    multiItemTrailer: (count) => `**1** se **${count}** tak koi number reply karein.`,
  },
  pa: {
    singleItemOpener: (dateWithSuffix) =>
      `Tuhadi ik upcoming appointment hai: **${dateWithSuffix}**.`,
    singleItemCta: 'Cancel karn layi **Yes** reply karo, ya hor kuj dasso.',
    multiHeader: 'Kaun appointment cancel karni hai?',
    twoItemTrailer: '**1** ya **2** reply karo.',
    multiItemTrailer: (count) => `**1** ton **${count}** tak koi number reply karo.`,
  },
};

function renderChoiceItemLine(item: CancelChoiceItem, idx: number): string {
  const suffix = item.modalityLabel?.trim() ? ` — ${item.modalityLabel.trim()}` : '';
  return `**${idx + 1}.** ${item.dateDisplay}${suffix}`;
}

/**
 * Render the "which appointment?" pick-list shown on cancel-intent when the
 * patient has one or more upcoming appointments.
 *
 * Adaptive layout (Plan "Patient DM copy polish", Task 07):
 *   - 1 item   → single-line confirm-by-Yes: `"You have one upcoming
 *                appointment: **{date} — {modality}**."` + `"Reply **Yes**
 *                to cancel it, or tell me what else to do."`
 *   - 2 items  → header + bolded numbered list + `"Reply **1** or **2**."`
 *   - ≥ 3 items → header + bolded numbered list + `"Reply a number from
 *                **1** to **N**."`
 *
 * Item rendering is always `**{n}.** {date}{ — {modality}}?`. The choice
 * key gets its own bold token so patients can scan to the next paragraph
 * without re-reading each row. The date/modality separator is an em-dash
 * (` — `); the date/time separator inside `dateDisplay` is a middle dot
 * (` · `) — kept distinct so neither line reads as two dashes in a row.
 *
 * @throws when `items` is empty. The handler already short-circuits on
 *   `upcoming.length === 0` with a different message, so empty here means
 *   a caller bug.
 */
export function buildCancelChoiceListMessage(input: CancelChoiceListInput): string {
  const locale = toStaticLocale(input.language);
  const copy = CANCEL_CHOICE_LIST_COPY[locale];

  if (input.items.length === 0) {
    throw new Error(
      'buildCancelChoiceListMessage: items[] must be non-empty (handler should emit the "no upcoming appointments" copy instead of calling this builder).'
    );
  }

  if (input.items.length === 1) {
    const only = input.items[0]!;
    const suffix = only.modalityLabel?.trim() ? ` — ${only.modalityLabel.trim()}` : '';
    return [copy.singleItemOpener(`${only.dateDisplay}${suffix}`), '', copy.singleItemCta].join(
      '\n'
    );
  }

  const lines = input.items.map((item, idx) => renderChoiceItemLine(item, idx));
  const trailer =
    input.items.length === 2 ? copy.twoItemTrailer : copy.multiItemTrailer(input.items.length);

  return [copy.multiHeader, '', ...lines, '', trailer].join('\n');
}

// ---------------------------------------------------------------------------
// Staff-review resolved → continue booking (Task 08 — URL on its own line)
// ---------------------------------------------------------------------------

/**
 * Which flavor of "staff has resolved your visit type" message to render.
 *   - `'confirmed'`                 — staff accepted the patient's proposed
 *                                     visit type as-is.
 *   - `'reassigned'`                — staff changed it to a different
 *                                     catalog service.
 *   - `'learning_policy_autobook'`  — the service-match-learning policy
 *                                     auto-applied the patient's saved
 *                                     preference without staff involvement.
 */
export type StaffReviewResolvedKind = 'confirmed' | 'reassigned' | 'learning_policy_autobook';

export interface StaffReviewResolvedBookingInput {
  readonly language: ConversationLanguage;

  /**
   * Doctor's practice name. Empty / whitespace falls back to `"the clinic"`,
   * mirroring the sibling ARM-05 helper
   * `formatAwaitingStaffServiceConfirmationDm`.
   */
  readonly practiceName?: string;

  /**
   * Patient-facing visit-type label (e.g. `"Dermatology consult"`). Empty /
   * whitespace falls back to `"your visit"` — same convention as the ARM-05
   * path so a missing label never leaks an empty bold pair (`"**   **"`)
   * into the DM.
   */
  readonly visitLabel?: string;

  /**
   * Fully-qualified booking page URL. The helper throws on empty/whitespace
   * because every call site (staff-review resolution in
   * `service-staff-review-service.ts` + learning-policy autobook in
   * `service-match-learning-autobook.ts`) already builds the URL via
   * `buildBookingPageUrl` before entering this rendering path, so an empty
   * value signals a caller bug we'd rather surface than mask.
   */
  readonly bookingUrl: string;

  readonly kind: StaffReviewResolvedKind;
}

type StaffReviewIntroCopy = Readonly<
  Record<StaffReviewResolvedKind, (practice: string, label: string) => string>
>;

type StaffReviewResolvedBookingCopy = {
  readonly intro: StaffReviewIntroCopy;
  readonly linkLabel: string;
  readonly closing: string;
};

const STAFF_REVIEW_RESOLVED_BOOKING_COPY: Readonly<
  Record<StaticMessageLocale, StaffReviewResolvedBookingCopy>
> = {
  en: {
    intro: {
      confirmed: (practice, label) =>
        `**${practice}** has confirmed your visit type: **${label}**.`,
      learning_policy_autobook: (practice, label) =>
        `**${practice}** has applied your saved visit-type preference: **${label}**.`,
      reassigned: (practice, label) =>
        `**${practice}** has updated your visit type to **${label}**.`,
    },
    linkLabel: 'Pick a time and complete your booking here:',
    closing: 'If something looks wrong, just reply here in this chat.',
  },
  hi: {
    intro: {
      confirmed: (practice, label) =>
        `**${practice}** ne aapke visit type ko confirm kar diya hai: **${label}**.`,
      learning_policy_autobook: (practice, label) =>
        `**${practice}** ne aapki saved visit-type preference apply kar di hai: **${label}**.`,
      reassigned: (practice, label) =>
        `**${practice}** ne aapka visit type update kar diya hai **${label}** par.`,
    },
    linkLabel: 'Yahan time pick karein aur booking complete karein:',
    closing: 'Kuch galat lage to bas yahan is chat mein reply karein.',
  },
  pa: {
    intro: {
      confirmed: (practice, label) =>
        `**${practice}** ne tuhade visit type nu confirm kar ditta hai: **${label}**.`,
      learning_policy_autobook: (practice, label) =>
        `**${practice}** ne tuhadi saved visit-type preference apply kar ditti hai: **${label}**.`,
      reassigned: (practice, label) =>
        `**${practice}** ne tuhada visit type update kar ditta hai **${label}** te.`,
    },
    linkLabel: 'Ithe time pick karo te booking complete karo:',
    closing: 'Kuj galat lage ta bas ithe is chat vich reply karo.',
  },
};

const STAFF_REVIEW_DEFAULT_PRACTICE = enByPolicy(
  'the clinic',
  'LANG3-D6: doctor/practice name tokens stay English'
);
const STAFF_REVIEW_DEFAULT_LABEL = enByPolicy(
  'your visit',
  'LANG3-D6: doctor/practice name tokens stay English'
);

function resolveStaffReviewIntro(
  practice: string,
  label: string,
  kind: StaffReviewResolvedKind,
  copy: StaffReviewResolvedBookingCopy
): string {
  return copy.intro[kind](practice, label);
}

/**
 * Render the "staff has resolved your visit type — pick a time" DM sent
 * after staff confirmation, staff reassignment, or learning-policy
 * autobook.
 *
 * Layout contract (Plan "Patient DM copy polish", Task 08):
 *   - Paragraph 1: kind-specific intro sentence (wording per
 *     `resolveStaffReviewIntro`). Bolded practice + visit label only.
 *   - Paragraph 2: `"Pick a time and complete your booking here:"` label
 *     with the booking URL on the next line. Blank line above keeps the
 *     URL isolated as a tappable target — Instagram iOS renderers
 *     unreliably tap-target URLs that hug the end of a sentence.
 *   - Paragraph 3: `"If something looks wrong, just reply here in this
 *     chat."` — kept verbatim from the pre-refactor copy.
 *
 * No markdown link syntax (Instagram DMs don't render `[text](url)`); no
 * trailing punctuation on the URL line.
 *
 * @throws when `bookingUrl` resolves empty / whitespace. Both call sites
 *   already compute the URL via `buildBookingPageUrl`, so empty means the
 *   upstream conversation-id / doctor-id / `BOOKING_PAGE_URL` env is
 *   missing — a config bug we want surfaced, not a silent no-CTA DM.
 */
export function buildStaffReviewResolvedBookingMessage(
  input: StaffReviewResolvedBookingInput
): string {
  const locale = toStaticLocale(input.language);
  const copy = STAFF_REVIEW_RESOLVED_BOOKING_COPY[locale];
  const url = input.bookingUrl?.trim();
  if (!url) {
    throw new Error(
      'buildStaffReviewResolvedBookingMessage: bookingUrl is required (staff-review resolved / learning-policy autobook paths always call buildBookingPageUrl upstream — an empty value signals an upstream config bug).'
    );
  }
  const practice = input.practiceName?.trim() || STAFF_REVIEW_DEFAULT_PRACTICE[locale];
  const label = input.visitLabel?.trim() || STAFF_REVIEW_DEFAULT_LABEL[locale];
  const intro = resolveStaffReviewIntro(practice, label, input.kind, copy);
  return [intro, '', copy.linkLabel, url, '', copy.closing].join('\n');
}

// ---------------------------------------------------------------------------
// Recording-consent ask + soft re-pitch (Plan 02 · Task 27 · Decision 4 LOCKED)
// ---------------------------------------------------------------------------

/**
 * Patient-facing audio-recording disclosure appended to the DM booking
 * confirmation. REC-D1: this is a disclosure, not a consent. No ask, no
 * opt-out, no "reply YES".
 *
 * REC-D2 / rec-12: wording is owner-supplied and pending counsel
 * sign-off. Do not treat this draft as shipped copy. Seeded from the
 * charter's REC-D1 framing and §Attestation clauses 3 and 4.
 *
 * REC2-D7 / LANG6-D4: English-only. No locale arms.
 * Video is not mentioned (REC2-D9). No download promise (clause 5).
 */
export const BOOKING_AUDIO_RECORDING_DISCLOSURE =
  'Every consult is audio-recorded as part of the medical record. You have the same access as the clinic, self-serve for 90 days. When the clinic replays a recording, that access is logged and you are notified.';

/**
 * enByPolicy family `recording-audio-disclosure`. English on every
 * thread. Shown on the owned /book page, not in the Instagram DM.
 */
export function buildRecordingAudioDisclosureMessage(): string {
  return BOOKING_AUDIO_RECORDING_DISCLOSURE;
}

// ---------------------------------------------------------------------------
// Account deletion — Plan 02 · Task 33
// ---------------------------------------------------------------------------

export type AccountDeletionRecordingOutcome =
  | 'none'
  | 'deleted'
  | 'deferred'
  | 'mixed'
  | 'severed_only';

export interface BuildAccountDeletionExplainerDmInput {
  readonly language: ConversationLanguage;

  /**
   * Legal citation string shown verbatim to the patient so they know which
   * retention doctrine keeps their clinical records alive after account
   * deletion. Caller owns the wording; this builder only lays it out. For
   * DPDP Act 2023 + GDPR Article 9 deployments, pass something like
   * `"DPDP Act 2023 §9 / GDPR Article 9(3)"`.
   *
   * We do NOT default this — passing a citation is the caller's proof
   * that the DM is being sent in the intended legal context. An empty /
   * whitespace string throws so misconfigured call sites surface loudly.
   */
  readonly citation: string;
  /**
   * When the deletion finalized (cron writes `finalized_at`). Used to tell
   * the patient the removal has already happened ("your access was
   * removed on {date}"); also the timestamp the audit row points at.
   * Rendered as a short ISO date (`YYYY-MM-DD`) because that's the only
   * disambiguation a patient needs for a one-shot DM — timezone semantics
   * do not matter here.
   */
  readonly finalizedAt: Date;
  /**
   * What actually happened to consult recordings (rec-32). Omitted /
   * `severed_only` keeps the access-revoked + retention sentence so a
   * caller that has not classified artifacts cannot imply full deletion.
   */
  readonly recordingOutcome?: AccountDeletionRecordingOutcome;
  /** Latest retention cutoff among held-back artifacts, if any. */
  readonly recordingsHeldUntil?: Date | null;
}

/**
 * One-shot explainer sent to the patient after their account-deletion
 * request has been finalized (grace expired + revocation rows written +
 * PII scrub complete). Non-urgent informational DM — NOT routed through
 * the urgent-moment fan-out. Sent via the existing best-channel cascade
 * (see `notification-service.ts`) so the patient gets it on whatever
 * channel they were reachable on at deletion time.
 *
 * **LANG6-D4 / enByPolicy — English-only in v1.** Account-deletion / retention copy is
 * legal-adjacent (DPDP / GDPR citation). Do not localize until counsel
 * reviews each language.
 *
 * Copy rationale:
 *   - Lead with the confirmation ("Your account is closed") so the patient
 *     knows the state change is terminal, not pending.
 *   - Spell out the two separable consequences — patient access revoked,
 *     clinical records retained — because conflating them is the #1
 *     DPDP / GDPR complaint vector ("you said you deleted my data but
 *     the doctor still sees it"). The legal-basis citation is the
 *     anchor that makes the second point defensible.
 *   - Close with the doctor-side note so the patient understands that
 *     clinical follow-up can still happen; we do not promise "nothing
 *     will ever reach you again", we promise "your *access* is gone
 *     and your clinical records are preserved per law".
 *   - No call-to-action. The patient made a terminal decision and we
 *     respect it. Recovery is out of scope for the explainer (they can
 *     request a new account through the normal booking flow; that's a
 *     separate surface).
 */
export function buildAccountDeletionExplainerDm(
  input: BuildAccountDeletionExplainerDmInput
): string {
  void input.language; // LANG6-D4 / enByPolicy English-only legal copy
  const citation = input.citation?.trim();
  if (!citation) {
    throw new Error(
      'buildAccountDeletionExplainerDm: citation is required (pass the DPDP / GDPR citation string — empty means an upstream wiring bug).'
    );
  }
  if (!(input.finalizedAt instanceof Date) || Number.isNaN(input.finalizedAt.getTime())) {
    throw new Error(
      'buildAccountDeletionExplainerDm: finalizedAt must be a valid Date (caller passed an invalid value).'
    );
  }
  const finalizedDate = input.finalizedAt.toISOString().slice(0, 10);
  const heldUntil =
    input.recordingsHeldUntil instanceof Date && !Number.isNaN(input.recordingsHeldUntil.getTime())
      ? input.recordingsHeldUntil.toISOString().slice(0, 10)
      : null;
  const outcome = input.recordingOutcome ?? 'severed_only';

  const recordingLines = buildAccountDeletionRecordingLines({
    citation,
    outcome,
    heldUntil,
  });

  return [
    'Your account is closed.',
    '',
    `We've removed your access to your recordings and chats as of ${finalizedDate}.`,
    ...recordingLines,
    '',
    'Your doctor still has access to clinical notes from your visits for follow-up if needed. ' +
      "You will not receive further messages from us unless your doctor's clinic reaches out about your prior care.",
  ].join('\n');
}

function buildAccountDeletionRecordingLines(input: {
  citation: string;
  outcome: AccountDeletionRecordingOutcome;
  heldUntil: string | null;
}): string[] {
  const until = input.heldUntil ?? 'the legal retention date';
  switch (input.outcome) {
    case 'deleted':
      return ['The consult recordings we held have been deleted.'];
    case 'deferred':
      return [
        `Your consult recordings are retained until ${until} per ${input.citation} and have not been deleted — this is a legal requirement for clinical records.`,
        'They will be deleted after that date. Access is already removed.',
      ];
    case 'mixed':
      return [
        `Some consult recordings were deleted. Others are retained until ${until} per ${input.citation} and have not been deleted — this is a legal requirement for clinical records.`,
        'The retained recordings will be deleted after that date. Access is already removed.',
      ];
    case 'none':
      return ['We did not find consult recordings on file for this account.'];
    case 'severed_only':
    default:
      return [
        `Your medical records are retained per ${input.citation} and are not deleted — this is a legal requirement for clinical records.`,
      ];
  }
}

// ---------------------------------------------------------------------------
// Mutual replay notification — Plan 07 · Task 30 · Decision 4 LOCKED
// ---------------------------------------------------------------------------

/**
 * Artifact-type discriminator for the recording-replayed-by-doctor DM.
 *
 * v1 ships `'audio'` (Plan 07's audio baseline) and `'transcript'` (Task
 * 32's read-only transcript surface — the doctor "reading the transcript"
 * still triggers the same accountability DM because the transcript is
 * derived from the recording). Plan 08 Task 44 additively widens with
 * `'video'`; the body prepends a 🎥 indicator so patients can visually
 * distinguish the higher-sensitivity video replay from routine audio
 * access in their DM feed. All three share a single builder so the
 * "non-alarming framing" + "every access is audited" lines stay in lock-step.
 */
export type RecordingReplayedArtifactType = 'audio' | 'transcript' | 'video';

export interface BuildRecordingReplayedNotificationDmInput {
  readonly language: ConversationLanguage;

  /**
   * Doctor's practice / clinic name (e.g. `"Dr. Sharma's Clinic"`). Empty
   * / whitespace falls back to `"your doctor's clinic"`. Patient-facing —
   * we anchor the framing on the clinic the patient knows about, not on
   * the support-staff person who may have triggered the replay (Decision
   * 4 principle 8: support-staff replays still attribute the action to
   * the clinic from the patient's POV; the doctor's dashboard event is
   * where the support-staff identity surfaces).
   */
  readonly practiceName?: string;

  /**
   * Pre-formatted consult date label (e.g. `"19 Apr 2026"`). Caller owns
   * the timezone math — the helper renders the string verbatim. Required
   * because the DM is meaningless without a date anchor ("doctor reviewed
   * the audio of your consult" → which consult?). Empty / whitespace
   * throws; the call site (`notifyPatientOfDoctorReplay`) always derives
   * this from `session.actual_ended_at` so an empty value signals a
   * caller bug we want surfaced.
   */
  readonly consultDateLabel: string;

  readonly artifactType: RecordingReplayedArtifactType;
}

type RecordingReplayedNotificationCopy = {
  readonly lead: (
    prefix: string,
    practice: string,
    artifactWord: string,
    dateLabel: string
  ) => string;
  readonly reassurance: string;
  readonly auditLine: string;
};

const RECORDING_REPLAYED_NOTIFICATION_COPY: Readonly<
  Record<StaticMessageLocale, RecordingReplayedNotificationCopy>
> = {
  en: {
    lead: (prefix, practice, artifactWord, dateLabel) =>
      `${prefix}Your doctor at ${practice} reviewed the ${artifactWord} of your consult on ${dateLabel}.`,
    reassurance:
      'This is a normal part of care (doctors often revisit consults to refine their plan).',
    auditLine: 'Every access is audited, and you can ask support for the access log anytime.',
  },
  hi: {
    lead: (prefix, practice, artifactWord, dateLabel) =>
      `${prefix}**${practice}** par aapke doctor ne ${dateLabel} ko aapke consult ka ${artifactWord} review kiya.`,
    reassurance:
      'Yeh care ka normal hissa hai (doctors aksar plan refine karne ke liye consults dobara dekhte hain).',
    auditLine:
      'Har access audit hota hai, aur aap kabhi bhi support se access log maang sakte hain.',
  },
  pa: {
    lead: (prefix, practice, artifactWord, dateLabel) =>
      `${prefix}**${practice}** te tuhade doctor ne ${dateLabel} wale consult da ${artifactWord} review kita.`,
    reassurance:
      'Eh care da normal hissa hai (doctors aksar plan refine karan layi consults dubara vekhte ne).',
    auditLine: 'Har access audit hunda hai, te tusi kade vi support ton access log mang sakde ho.',
  },
};

const RECORDING_REPLAYED_DEFAULT_PRACTICE = enByPolicy(
  "your doctor's clinic",
  'LANG3-D6: doctor/practice name tokens stay English'
);

/**
 * Render the DM the patient receives when the doctor (or support-staff
 * acting on the doctor's behalf) replays the recording of their consult.
 *
 * Decision 4 LOCKED principle 8 mandates the **non-alarming framing**:
 * doctors revisit consults to refine the clinical plan; that is what
 * good care looks like, not "something went wrong". The "this is a
 * normal part of care" sentence is intentional and load-bearing — the
 * snapshot test pins it so a future copy-tweak can't accidentally drop
 * it and re-introduce the "patient panic" failure mode.
 *
 * Two-paragraph layout (audio variant):
 *
 *   ```
 *   Your doctor at {practiceName} reviewed the audio of your consult on {consultDateLabel}.
 *
 *   This is a normal part of care (doctors often revisit consults to refine their plan).
 *   Every access is audited, and you can ask support for the access log anytime.
 *   ```
 *
 * The transcript variant is byte-identical except `audio` → `transcript`
 * — the variant logic lives **inside this builder**, not at call sites,
 * so the audit-log copy and Plan 08's eventual video copy stay
 * synchronized as a single edit point.
 *
 * No emoji in v1 (Plan 08 adds 🎥 to the video variant when it ships).
 * No CTA — there's nothing for the patient to do; this is a transparency
 * pulse, not a request. The "ask support for the access log anytime"
 * line is the implicit recourse path.
 *
 * @throws when `consultDateLabel` resolves empty / whitespace — caller
 *   bug; the fan-out helper computes this from `session.actual_ended_at`
 *   before invoking the builder.
 */
export function buildRecordingReplayedNotificationDm(
  input: BuildRecordingReplayedNotificationDmInput
): string {
  const locale = toStaticLocale(input.language);
  const copy = RECORDING_REPLAYED_NOTIFICATION_COPY[locale];
  const dateLabel = input.consultDateLabel?.trim();
  if (!dateLabel) {
    throw new Error(
      'buildRecordingReplayedNotificationDm: consultDateLabel is required ' +
        '(notifyPatientOfDoctorReplay computes this from session.actual_ended_at — ' +
        'empty here means an upstream wiring bug or a session row missing actual_ended_at).'
    );
  }
  const practice = input.practiceName?.trim() || RECORDING_REPLAYED_DEFAULT_PRACTICE[locale];
  const artifactWord: RecordingReplayedArtifactType = input.artifactType;

  const leadPrefix = artifactWord === 'video' ? '🎥 ' : '';

  return [
    copy.lead(leadPrefix, practice, artifactWord, dateLabel),
    '',
    copy.reassurance,
    copy.auditLine,
  ].join('\n');
}

export interface BuildSupportStaffRecordingAccessedNotificationDmInput {
  readonly language: ConversationLanguage;
  readonly practiceName?: string;
  readonly consultDateLabel: string;
  readonly artifactType: RecordingReplayedArtifactType;
  /** Transcript PDF download vs in-product access. Defaults to accessed. */
  readonly actionKind?: 'reviewed' | 'downloaded';
}

type SupportStaffAccessedCopy = {
  readonly lead: (practice: string, artifactWord: string, dateLabel: string) => string;
  readonly downloadedLead: (practice: string, dateLabel: string) => string;
  readonly distinction: string;
  readonly auditLine: string;
};

const SUPPORT_STAFF_RECORDING_ACCESSED_COPY: Readonly<
  Record<StaticMessageLocale, SupportStaffAccessedCopy>
> = {
  en: {
    lead: (practice, artifactWord, dateLabel) =>
      `A support agent at ${practice} accessed the ${artifactWord} of your consult on ${dateLabel}.`,
    downloadedLead: (practice, dateLabel) =>
      `A support agent at ${practice} downloaded the transcript of your consult on ${dateLabel}.`,
    distinction: 'This was a support-team access, not your doctor reviewing the consult.',
    auditLine: 'Every access is audited, and you can ask support for the access log anytime.',
  },
  hi: {
    lead: (practice, artifactWord, dateLabel) =>
      `${practice} ke support agent ne ${dateLabel} ko aapke consult ka ${artifactWord} access kiya.`,
    downloadedLead: (practice, dateLabel) =>
      `${practice} ke support agent ne ${dateLabel} ko aapke consult ka transcript download kiya.`,
    distinction: 'Yeh support-team ka access tha, doctor ka consult review nahi.',
    auditLine:
      'Har access audit hota hai, aur aap kabhi bhi support se access log maang sakte hain.',
  },
  pa: {
    lead: (practice, artifactWord, dateLabel) =>
      `${practice} de support agent ne ${dateLabel} wale consult da ${artifactWord} access kita.`,
    downloadedLead: (practice, dateLabel) =>
      `${practice} de support agent ne ${dateLabel} wale consult da transcript download kita.`,
    distinction: 'Eh support-team da access si, doctor da consult review nahi.',
    auditLine: 'Har access audit hunda hai, te tusi kade vi support ton access log mang sakde ho.',
  },
};

/**
 * rec-30 — patient DM when support staff (not the doctor) accessed the
 * recording or transcript. Distinct from
 * `buildRecordingReplayedNotificationDm` so we never tell the patient
 * "your doctor reviewed" when a third party did. Does not accept
 * escalationReason — staff free text stays off this surface.
 */
export function buildSupportStaffRecordingAccessedNotificationDm(
  input: BuildSupportStaffRecordingAccessedNotificationDmInput
): string {
  const locale = toStaticLocale(input.language);
  const copy = SUPPORT_STAFF_RECORDING_ACCESSED_COPY[locale];
  const dateLabel = input.consultDateLabel?.trim();
  if (!dateLabel) {
    throw new Error(
      'buildSupportStaffRecordingAccessedNotificationDm: consultDateLabel is required'
    );
  }
  const practice = input.practiceName?.trim() || RECORDING_REPLAYED_DEFAULT_PRACTICE[locale];
  const lead =
    input.actionKind === 'downloaded' && input.artifactType === 'transcript'
      ? copy.downloadedLead(practice, dateLabel)
      : copy.lead(practice, input.artifactType, dateLabel);

  return [lead, '', copy.distinction, copy.auditLine].join('\n');
}

// ============================================================================
// Plan 07 · Task 31 — post-consult chat-history DM
// ============================================================================

export interface BuildPostConsultChatLinkDmInput {
  readonly language: ConversationLanguage;

  /**
   * Doctor's practice / clinic label (e.g. `"Dr. Sharma's practice"`).
   * Empty / whitespace falls back to `"your doctor's practice"` so the
   * patient sees a coherent sentence even when the upstream
   * `doctor_settings.practice_name` lookup misses.
   */
  readonly practiceName?: string;

  /**
   * Absolute URL to `/c/history/{sessionId}?t={hmacToken}` — the patient
   * tap-target. Required; the DM is meaningless without the link. Empty
   * / whitespace throws so a wiring bug in `sendPostConsultChatHistoryDm`
   * surfaces immediately rather than silently shipping a dead-end DM.
   */
  readonly joinUrl: string;

  /**
   * Pre-formatted consult date label (e.g. `"19 Apr 2026"`). Caller owns
   * the timezone math — the helper renders the string verbatim. Required;
   * an empty value indicates an upstream bug (the call site derives this
   * from `consultation_sessions.actual_ended_at`).
   */
  readonly consultDateLabel: string;
}

type PostConsultChatLinkCopy = {
  readonly opener: (practice: string, dateLabel: string) => string;
  readonly linkIntro: string;
  readonly ttlNote: string;
};

const POST_CONSULT_CHAT_LINK_COPY: Readonly<Record<StaticMessageLocale, PostConsultChatLinkCopy>> =
  {
    en: {
      opener: (practice, dateLabel) =>
        `Your consultation with ${practice} on ${dateLabel} is complete.`,
      linkIntro: 'View the full conversation (chat, attachments, and system notes) any time:',
      ttlNote: 'Available for 90 days. After that, contact support to re-open the link.',
    },
    hi: {
      opener: (practice, dateLabel) =>
        `${dateLabel} ko **${practice}** ke saath aapki consultation complete ho gayi hai.`,
      linkIntro: 'Poori conversation (chat, attachments, aur system notes) kabhi bhi dekhein:',
      ttlNote:
        '90 days ke liye available hai. Uske baad link dobara kholne ke liye support se contact karein.',
    },
    pa: {
      opener: (practice, dateLabel) =>
        `${dateLabel} nu **${practice}** naal tuhadi consultation complete ho gayi hai.`,
      linkIntro: 'Poori conversation (chat, attachments, te system notes) kade vi dekho:',
      ttlNote:
        '90 days layi available hai. Us ton baad link dubara kholan layi support naal contact karo.',
    },
  };

const POST_CONSULT_CHAT_DEFAULT_PRACTICE = enByPolicy(
  "your doctor's practice",
  'LANG3-D6: doctor/practice name tokens stay English'
);

/**
 * Render the post-consult chat-history DM the patient receives at
 * `endSession`.
 *
 * Decision 1 sub-decision LOCKED: indefinite read access to the chat
 * thread for both parties after a consult ends. The DM hands the patient
 * a stable, re-tappable link to `<TextConsultRoom mode='readonly'>` with
 * the full conversation, attachments, and system banners.
 *
 * Copy doctrine:
 *
 *   - **Closure first.** The opening line states the consult is complete
 *     so the patient has a clear "this is over" anchor before the link
 *     itself.
 *   - **What's behind the link, not just "open the link".** The middle
 *     line spells out chat + attachments + system notes so the patient
 *     knows there is something substantive on the other side and they
 *     don't dismiss the DM as a duplicate booking confirmation.
 *   - **Bounded TTL with a graceful re-mint path.** The closing line is
 *     honest about the 90-day patient-self-serve window and surfaces
 *     support as the recourse (matches the recording-replay 90-day TTL
 *     from Decision 4 — same mental model). The *underlying access
 *     right* is indefinite per Decision 1; only the URL TTL is bounded.
 *
 * No CTA other than the link itself — there's nothing for the patient
 * to do beyond reading. No emoji in v1.
 *
 * **Pin in a snapshot test** so drift is deliberate.
 *
 * @throws when `joinUrl` or `consultDateLabel` resolves empty / whitespace
 *   — caller bug; `sendPostConsultChatHistoryDm` always supplies both.
 */
export function buildPostConsultChatLinkDm(input: BuildPostConsultChatLinkDmInput): string {
  const locale = toStaticLocale(input.language);
  const copy = POST_CONSULT_CHAT_LINK_COPY[locale];
  const joinUrl = input.joinUrl?.trim();
  if (!joinUrl) {
    throw new Error(
      'buildPostConsultChatLinkDm: joinUrl is required ' +
        '(sendPostConsultChatHistoryDm composes this from APP_BASE_URL + sessionId + HMAC token — ' +
        'empty here means an upstream wiring bug).'
    );
  }
  const dateLabel = input.consultDateLabel?.trim();
  if (!dateLabel) {
    throw new Error(
      'buildPostConsultChatLinkDm: consultDateLabel is required ' +
        '(sendPostConsultChatHistoryDm derives this from session.actual_ended_at — ' +
        'empty here means the session row is missing actual_ended_at).'
    );
  }
  const practice = input.practiceName?.trim() || POST_CONSULT_CHAT_DEFAULT_PRACTICE[locale];

  return [copy.opener(practice, dateLabel), '', copy.linkIntro, joinUrl, '', copy.ttlNote].join(
    '\n'
  );
}

// ============================================================================
// Plan 07 · Task 32 — transcript-downloaded DM
// ============================================================================

export interface BuildTranscriptDownloadedNotificationDmInput {
  readonly language: ConversationLanguage;

  /**
   * Doctor's practice / clinic name (e.g. `"Dr. Sharma's Clinic"`). Empty
   * / whitespace falls back to `"your doctor's clinic"`. Mirrors the
   * fallback in `buildRecordingReplayedNotificationDm` so the patient sees
   * one consistent voice across the replay / transcript channels.
   */
  readonly practiceName?: string;

  /**
   * Pre-formatted consult date label (e.g. `"19 Apr 2026"`). Caller owns
   * the timezone math. Empty / whitespace throws — the DM is meaningless
   * without a date anchor.
   */
  readonly consultDateLabel: string;
}

type TranscriptDownloadedNotificationCopy = {
  readonly lead: (practice: string, dateLabel: string) => string;
  readonly reassurance: string;
  readonly auditLine: string;
};

const TRANSCRIPT_DOWNLOADED_NOTIFICATION_COPY: Readonly<
  Record<StaticMessageLocale, TranscriptDownloadedNotificationCopy>
> = {
  en: {
    lead: (practice, dateLabel) =>
      `Your doctor at ${practice} downloaded the written transcript of your consult on ${dateLabel}.`,
    reassurance:
      'This is a normal part of care (doctors often review transcripts to confirm the plan).',
    auditLine: 'Every access is audited, and you can ask support for the access log anytime.',
  },
  hi: {
    lead: (practice, dateLabel) =>
      `**${practice}** par aapke doctor ne ${dateLabel} wale consult ki written transcript download ki.`,
    reassurance:
      'Yeh care ka normal hissa hai (doctors aksar plan confirm karne ke liye transcripts review karte hain).',
    auditLine:
      'Har access audit hota hai, aur aap kabhi bhi support se access log maang sakte hain.',
  },
  pa: {
    lead: (practice, dateLabel) =>
      `**${practice}** te tuhade doctor ne ${dateLabel} wale consult di written transcript download kiti.`,
    reassurance:
      'Eh care da normal hissa hai (doctors aksar plan confirm karan layi transcripts review karde ne).',
    auditLine: 'Har access audit hunda hai, te tusi kade vi support ton access log mang sakde ho.',
  },
};

const TRANSCRIPT_DOWNLOADED_DEFAULT_PRACTICE = enByPolicy(
  "your doctor's clinic",
  'LANG3-D6: doctor/practice name tokens stay English'
);

/**
 * Render the DM the patient receives when the doctor (or support-staff
 * acting on the doctor's behalf) *downloads* the written PDF transcript of
 * the consult.
 *
 * Decision 4 LOCKED principle 8 + Task 32 copy-pin: this is a distinct DM
 * body from `buildRecordingReplayedNotificationDm({ artifactType: 'transcript' })`
 * because "reviewed" ≠ "downloaded". The replay DM fires when a doctor
 * listens to the audio with the transcript on-screen; the *download* DM
 * fires when the PDF leaves the platform (higher-sensitivity signal — the
 * artifact is now offline-legible, so the transparency pulse matters
 * more). Two builders, one audit-log story, and the patient gets a clear
 * description of what actually happened each time.
 *
 * Body (pinned in a snapshot test):
 *
 *   Your doctor at {practiceName} downloaded the written transcript of your consult on {consultDateLabel}.
 *
 *   This is a normal part of care (doctors often review transcripts to confirm the plan).
 *   Every access is audited, and you can ask support for the access log anytime.
 *
 * No CTA — the recourse path ("ask support for the access log") is the
 * implicit CTA. The language uses "doctor" even for support-staff
 * downloads (support-staff identity surfaces on the doctor's dashboard
 * event, not in the patient's DM) — mirrors `buildRecordingReplayedNotificationDm`.
 *
 * @throws when `consultDateLabel` resolves empty / whitespace — caller
 *   bug (the fan-out helper computes this from `session.actual_ended_at`
 *   before invoking the builder).
 */
export function buildTranscriptDownloadedNotificationDm(
  input: BuildTranscriptDownloadedNotificationDmInput
): string {
  const locale = toStaticLocale(input.language);
  const copy = TRANSCRIPT_DOWNLOADED_NOTIFICATION_COPY[locale];
  const dateLabel = input.consultDateLabel?.trim();
  if (!dateLabel) {
    throw new Error(
      'buildTranscriptDownloadedNotificationDm: consultDateLabel is required ' +
        '(notifyPatientOfDoctorReplay derives this from session.actual_ended_at — ' +
        'empty here signals an upstream wiring bug or a session row missing actual_ended_at).'
    );
  }
  const practice = input.practiceName?.trim() || TRANSCRIPT_DOWNLOADED_DEFAULT_PRACTICE[locale];

  return [copy.lead(practice, dateLabel), '', copy.reassurance, copy.auditLine].join('\n');
}

// ============================================================================
// Plan 09 · Task 49 — mid-consult refund status copy
// ============================================================================

export interface BuildRefundProcessingDmInput {
  readonly language: ConversationLanguage;

  /** Refund amount in rupees (paise ÷ 100). Displayed as `₹{amountInr}`. */
  amountInr: number;
  /** Expected settlement window in business days. Razorpay's `speed: 'normal'` ≈ 3. */
  expectedDays?: number;
}

type RefundProcessingCopy = {
  readonly body: (amount: number, days: number) => string;
};

const REFUND_PROCESSING_COPY: Readonly<Record<StaticMessageLocale, RefundProcessingCopy>> = {
  en: {
    body: (amount, days) =>
      `Your refund of ₹${amount} is processing and should reach you within ${days} business days.`,
  },
  hi: {
    body: (amount, days) =>
      `Aapka ₹${amount} ka refund process ho raha hai aur ${days} business days ke andar aapko mil jana chahiye.`,
  },
  pa: {
    body: (amount, days) =>
      `Tuhada ₹${amount} da refund process ho reha hai te ${days} business days de andar tuhannu mil jana chahida.`,
  },
};

/**
 * Decision 11 resilience copy. Written by the refund retry worker
 * on first attempt (regardless of outcome) so the patient sees
 * confirmation even if Razorpay's first try failed.
 */
export function buildRefundProcessingDm(input: BuildRefundProcessingDmInput): string {
  const locale = toStaticLocale(input.language);
  const copy = REFUND_PROCESSING_COPY[locale];
  const amount = Math.max(0, Math.round(input.amountInr));
  const days = input.expectedDays && input.expectedDays > 0 ? input.expectedDays : 3;
  return copy.body(amount, days);
}

export interface BuildRefundFailedDmInput {
  readonly language: ConversationLanguage;

  amountInr: number;
  /** Optional support URL / handle surface. Defaults to a generic "Contact support" line. */
  supportUrl?: string;
}

type RefundFailedCopy = {
  readonly lead: (amount: number) => string;
  readonly supportWithUrl: (url: string) => string;
  readonly supportGeneric: string;
};

const REFUND_FAILED_COPY: Readonly<Record<StaticMessageLocale, RefundFailedCopy>> = {
  en: {
    lead: (amount) =>
      `We couldn't automatically refund ₹${amount} yet. Our team is reviewing the transaction. `,
    supportWithUrl: (url) =>
      `Contact support at ${url} if you don't see a refund within 3 business days.`,
    supportGeneric: `Contact support if you don't see a refund within 3 business days.`,
  },
  hi: {
    lead: (amount) =>
      `Hum abhi tak ₹${amount} ka automatic refund nahi kar paaye. Hamari team transaction review kar rahi hai. `,
    supportWithUrl: (url) =>
      `Agar 3 business days ke andar refund na dikhe to ${url} par support se contact karein.`,
    supportGeneric: `Agar 3 business days ke andar refund na dikhe to support se contact karein.`,
  },
  pa: {
    lead: (amount) =>
      `Asi hun tak ₹${amount} da automatic refund nahi kar paye. Sadi team transaction review kar rahi hai. `,
    supportWithUrl: (url) =>
      `Je 3 business days de andar refund na dikhe ta ${url} te support naal contact karo.`,
    supportGeneric: `Je 3 business days de andar refund na dikhe ta support naal contact karo.`,
  },
};

/**
 * Emitted by the refund retry worker once it sentinels a row as
 * permanently stuck (after 7 failed attempts / ≥ 24h). Ops
 * simultaneously gets an `admin_payment_alerts` row; the patient
 * gets this visible message.
 */
export function buildRefundFailedDm(input: BuildRefundFailedDmInput): string {
  const locale = toStaticLocale(input.language);
  const copy = REFUND_FAILED_COPY[locale];
  const amount = Math.max(0, Math.round(input.amountInr));
  const supportBit = input.supportUrl?.trim()
    ? copy.supportWithUrl(input.supportUrl.trim())
    : copy.supportGeneric;
  return copy.lead(amount) + supportBit;
}

// ---------------------------------------------------------------------------
// Cancel / reschedule / status (lang-20 · p5) — English arms until p6
// ---------------------------------------------------------------------------

/**
 * LANG5-D3: builders that interpolate patient name (or other PHI).
 * p6 must not send these through a runtime translation pass.
 */
export const DM_COPY_PHI_BUILDERS = {
  buildStatusAppointmentLineForPatient: true,
  buildStatusSelfOnlyOtherPatientMessage: true,
  buildStatusSingleNextAppointmentMessage: true,
  buildStatusUpcomingListMessage: true,
} as const;

export type AppointmentPickFlow = 'cancel' | 'reschedule';

export interface AppointmentPickNotFoundMessageInput {
  readonly language: ConversationLanguage;
  readonly flow: AppointmentPickFlow;
}

const APPOINTMENT_PICK_NOT_FOUND_COPY: Readonly<
  Record<
    StaticMessageLocale,
    {
      cancel: string;
      reschedule: string;
    }
  >
> = {
  en: {
    cancel:
      "That appointment wasn't found. Please try again or say 'cancel appointment' to start over.",
    reschedule:
      "That appointment wasn't found. Please try again or say 'reschedule appointment' to start over.",
  },
  hi: {
    cancel:
      "Woh appointment nahi mili. Dubara try karein ya 'cancel appointment' likh kar start karein.",
    reschedule:
      "Woh appointment nahi mili. Dubara try karein ya 'reschedule appointment' likh kar start karein.",
  },
  pa: {
    cancel: "Oh appointment nahi mili. Dubara try karo ya 'cancel appointment' likh ke start karo.",
    reschedule:
      "Oh appointment nahi mili. Dubara try karo ya 'reschedule appointment' likh ke start karo.",
  },
};

export function buildAppointmentPickNotFoundMessage(
  input: AppointmentPickNotFoundMessageInput
): string {
  const locale = toStaticLocale(input.language);
  return APPOINTMENT_PICK_NOT_FOUND_COPY[locale][input.flow];
}

export interface CancelConfirmPromptMessageInput {
  readonly language: ConversationLanguage;
  /** Pre-formatted date/time (caller owns timezone). */
  readonly dateDisplay: string;
}

const CANCEL_CONFIRM_PROMPT_COPY: Readonly<
  Record<StaticMessageLocale, { body: (dateDisplay: string) => string }>
> = {
  en: {
    body: (dateDisplay) => `Cancel appointment on ${dateDisplay}? Reply **Yes** or **No**.`,
  },
  hi: {
    body: (dateDisplay) =>
      `${dateDisplay} par appointment cancel karein? **Yes** ya **No** reply karein.`,
  },
  pa: {
    body: (dateDisplay) =>
      `${dateDisplay} te appointment cancel karo? **Yes** ya **No** reply karo.`,
  },
};

export function buildCancelConfirmPromptMessage(input: CancelConfirmPromptMessageInput): string {
  const locale = toStaticLocale(input.language);
  return CANCEL_CONFIRM_PROMPT_COPY[locale].body(input.dateDisplay);
}

export interface NumericPickInvalidMessageInput {
  readonly language: ConversationLanguage;
  /** Number of choices the patient may reply with (1..count). */
  readonly count: number;
}

const NUMERIC_PICK_INVALID_COPY: Readonly<
  Record<StaticMessageLocale, { body: (count: number) => string }>
> = {
  en: {
    body: (count) => `Please reply 1, 2, or ${count}.`,
  },
  hi: {
    body: (count) => `Kripya 1, 2, ya ${count} reply karein.`,
  },
  pa: {
    body: (count) => `Kripya 1, 2, ya ${count} reply karo.`,
  },
};

export function buildNumericPickInvalidMessage(input: NumericPickInvalidMessageInput): string {
  const locale = toStaticLocale(input.language);
  return NUMERIC_PICK_INVALID_COPY[locale].body(input.count);
}

export interface CancelConfirmFallbackMessageInput {
  readonly language: ConversationLanguage;
}

const CANCEL_CONFIRM_FALLBACK_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: 'Please reply **Yes** to cancel or **No** to keep your appointment.',
  hi: 'Cancel ke liye **Yes** reply karein ya appointment rakhne ke liye **No**.',
  pa: 'Cancel karn layi **Yes** reply karo ya appointment rakh layi **No**.',
};

export function buildCancelConfirmFallbackMessage(
  input: CancelConfirmFallbackMessageInput
): string {
  return CANCEL_CONFIRM_FALLBACK_COPY[toStaticLocale(input.language)];
}

export interface AppointmentNotFoundShortMessageInput {
  readonly language: ConversationLanguage;
}

const APPOINTMENT_NOT_FOUND_SHORT_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: "That appointment wasn't found.",
  hi: 'Woh appointment nahi mili.',
  pa: 'Oh appointment nahi mili.',
};

export function buildAppointmentNotFoundShortMessage(
  input: AppointmentNotFoundShortMessageInput
): string {
  return APPOINTMENT_NOT_FOUND_SHORT_COPY[toStaticLocale(input.language)];
}

export interface AppointmentCancelledMessageInput {
  readonly language: ConversationLanguage;
  readonly dateDisplay: string;
}

const APPOINTMENT_CANCELLED_COPY: Readonly<
  Record<StaticMessageLocale, { body: (dateDisplay: string) => string }>
> = {
  en: {
    body: (dateDisplay) => `Your appointment on ${dateDisplay} has been cancelled.`,
  },
  hi: {
    body: (dateDisplay) => `${dateDisplay} par aapki appointment cancel ho gayi hai.`,
  },
  pa: {
    body: (dateDisplay) => `${dateDisplay} te tuhadi appointment cancel ho gayi hai.`,
  },
};

export function buildAppointmentCancelledMessage(input: AppointmentCancelledMessageInput): string {
  const locale = toStaticLocale(input.language);
  return APPOINTMENT_CANCELLED_COPY[locale].body(input.dateDisplay);
}

export interface CancelDeclinedMessageInput {
  readonly language: ConversationLanguage;
}

const CANCEL_DECLINED_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: 'No problem. Your appointment is still scheduled.',
  hi: 'Koi baat nahi. Aapki appointment ab bhi scheduled hai.',
  pa: 'Koi gal nahi. Tuhadi appointment hun vi scheduled hai.',
};

export function buildCancelDeclinedMessage(input: CancelDeclinedMessageInput): string {
  return CANCEL_DECLINED_COPY[toStaticLocale(input.language)];
}

export interface StatusAppointmentLineForPatientInput {
  readonly language: ConversationLanguage;
  readonly statusLine: string;
  readonly isForSelf: boolean;
  /** Used when `isForSelf` is false; empty → "them". */
  readonly patientName?: string | null;
}

const STATUS_LINE_FOR_OTHER_COPY: Readonly<
  Record<StaticMessageLocale, { body: (name: string, statusLine: string) => string }>
> = {
  en: {
    body: (name, statusLine) => `For **${name}**: ${statusLine}`,
  },
  hi: {
    body: (name, statusLine) => `**${name}** ke liye: ${statusLine}`,
  },
  pa: {
    body: (name, statusLine) => `**${name}** layi: ${statusLine}`,
  },
};

/** @phi true — may interpolate another patient's name. */
export function buildStatusAppointmentLineForPatient(
  input: StatusAppointmentLineForPatientInput
): string {
  if (input.isForSelf) return input.statusLine;
  const locale = toStaticLocale(input.language);
  const name = input.patientName?.trim() || 'them';
  return STATUS_LINE_FOR_OTHER_COPY[locale].body(name, input.statusLine);
}

export interface StatusSelfOnlyOtherPatientMessageInput {
  readonly language: ConversationLanguage;
  /** Pre-formatted status line for the other patient's appointment. */
  readonly appointmentLine: string;
  readonly otherPatientName?: string | null;
}

const STATUS_SELF_ONLY_OTHER_COPY: Readonly<
  Record<StaticMessageLocale, { body: (appointmentLine: string, name: string) => string }>
> = {
  en: {
    body: (appointmentLine, name) =>
      `You don't have an appointment for yourself yet. The appointment on ${appointmentLine} is for **${name}**. Would you like to book one for yourself?`,
  },
  hi: {
    body: (appointmentLine, name) =>
      `Aapke liye abhi koi appointment nahi hai. ${appointmentLine} par jo appointment hai woh **${name}** ke liye hai. Kya aap apne liye book karna chahenge?`,
  },
  pa: {
    body: (appointmentLine, name) =>
      `Tuhade layi hun koi appointment nahi. ${appointmentLine} te jo appointment hai oh **${name}** layi hai. Ki tu apne layi book karna chahunda?`,
  },
};

/** @phi true — interpolates another patient's name. */
export function buildStatusSelfOnlyOtherPatientMessage(
  input: StatusSelfOnlyOtherPatientMessageInput
): string {
  const locale = toStaticLocale(input.language);
  const name = input.otherPatientName?.trim() || 'someone else';
  return STATUS_SELF_ONLY_OTHER_COPY[locale].body(input.appointmentLine, name);
}

export interface StatusSingleNextAppointmentMessageInput {
  readonly language: ConversationLanguage;
  /** Output of {@link buildStatusAppointmentLineForPatient} (or a plain status line). */
  readonly appointmentDetail: string;
}

const STATUS_SINGLE_NEXT_COPY: Readonly<
  Record<StaticMessageLocale, { body: (detail: string) => string }>
> = {
  en: {
    body: (detail) => `Your next appointment is on ${detail}.`,
  },
  hi: {
    body: (detail) => `Aapki next appointment ${detail} par hai.`,
  },
  pa: {
    body: (detail) => `Tuhadi next appointment ${detail} te hai.`,
  },
};

/** @phi true when `appointmentDetail` includes another patient's name. */
export function buildStatusSingleNextAppointmentMessage(
  input: StatusSingleNextAppointmentMessageInput
): string {
  const locale = toStaticLocale(input.language);
  return STATUS_SINGLE_NEXT_COPY[locale].body(input.appointmentDetail);
}

export interface StatusUpcomingListMessageInput {
  readonly language: ConversationLanguage;
  readonly totalCount: number;
  /** Already numbered lines (e.g. `1. Tue…`). */
  readonly statusLines: readonly string[];
  readonly showingFirst10: boolean;
}

const STATUS_UPCOMING_LIST_COPY: Readonly<
  Record<
    StaticMessageLocale,
    {
      header: (count: number) => string;
      capNote: string;
    }
  >
> = {
  en: {
    header: (count) => `You have ${count} upcoming appointment${count > 1 ? 's' : ''}:`,
    capNote: '(showing first 10)',
  },
  hi: {
    header: (count) => `Aapke ${count} upcoming appointment${count > 1 ? 's' : ''} hain:`,
    capNote: '(pehle 10 dikha rahe hain)',
  },
  pa: {
    header: (count) => `Tuhade ${count} upcoming appointment${count > 1 ? 's' : ''} ne:`,
    capNote: '(pehle 10 dikha rahe haan)',
  },
};

/** @phi true when lines include other-patient prefixes. */
export function buildStatusUpcomingListMessage(input: StatusUpcomingListMessageInput): string {
  const locale = toStaticLocale(input.language);
  const copy = STATUS_UPCOMING_LIST_COPY[locale];
  let out = `${copy.header(input.totalCount)}\n\n${input.statusLines.join('\n')}`;
  if (input.showingFirst10) {
    out += `\n\n${copy.capNote}`;
  }
  return out;
}

export interface RescheduleChoiceListMessageInput {
  readonly language: ConversationLanguage;
  /** Pre-formatted choice lines without numbering prefix handled by caller. */
  readonly lines: readonly string[];
  readonly count: number;
}

const RESCHEDULE_CHOICE_LIST_COPY: Readonly<
  Record<StaticMessageLocale, { body: (linesBlock: string, count: number) => string }>
> = {
  en: {
    body: (linesBlock, count) =>
      `Which appointment would you like to reschedule?\n\n${linesBlock}\n\nReply 1, 2, or ${count}.`,
  },
  hi: {
    body: (linesBlock, count) =>
      `Kaunsi appointment reschedule karni hai?\n\n${linesBlock}\n\n1, 2, ya ${count} reply karein.`,
  },
  pa: {
    body: (linesBlock, count) =>
      `Kaun appointment reschedule karni hai?\n\n${linesBlock}\n\n1, 2, ya ${count} reply karo.`,
  },
};

export function buildRescheduleChoiceListMessage(input: RescheduleChoiceListMessageInput): string {
  const locale = toStaticLocale(input.language);
  return RESCHEDULE_CHOICE_LIST_COPY[locale].body(input.lines.join('\n'), input.count);
}

export interface PostBookingAckMessageInput {
  readonly language: ConversationLanguage;
}

const POST_BOOKING_ACK_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: "Great - you're all set. Let us know if you need anything else.",
  hi: 'Bahut achha — sab set hai. Aur kuch chahiye ho to batayein.',
  pa: 'Bahut vadiya — sab set hai. Hor kuch chahida hove ta dasso.',
};

export function buildPostBookingAckMessage(input: PostBookingAckMessageInput): string {
  return POST_BOOKING_ACK_COPY[toStaticLocale(input.language)];
}

// ---------------------------------------------------------------------------
// Consent / revocation / pause default (lang-21 · p5) — English arms until p6
// ---------------------------------------------------------------------------

/**
 * LANG5-D3 verified-negative: these builders do **not** interpolate patient
 * name, age, phone, or MRN. Recorded explicitly so p6 does not re-audit.
 */
export const DM_COPY_LANG21_PHI = {
  buildConsentPersistMissingInfoMessage: false,
  buildConsentPersistMissingPhoneMessage: false,
  buildConsentPersistSuccessMessage: false,
  buildConsentDeniedMessage: false,
  buildConsentRevokeRecordNotFoundMessage: false,
  buildConsentRevokeAlreadyRemovedMessage: false,
  buildConsentRevokeNoStoredDataMessage: false,
  buildConsentRevokeSuccessMessage: false,
  buildReceptionistPauseDefaultMessage: false,
} as const;

export interface ConsentLanguageOnlyInput {
  readonly language: ConversationLanguage;
}

const CONSENT_PERSIST_MISSING_INFO_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: "I didn't receive your information. Please start over with 'book appointment' if you'd like to schedule.",
  hi: "Maine aapki information nahi mili. Schedule karna ho to 'book appointment' se dobara shuru karein.",
  pa: "Mainu tuhadi information nahi mili. Schedule karna hove ta 'book appointment' ton dubara shuru karo.",
};

export function buildConsentPersistMissingInfoMessage(input: ConsentLanguageOnlyInput): string {
  return CONSENT_PERSIST_MISSING_INFO_COPY[toStaticLocale(input.language)];
}

const CONSENT_PERSIST_MISSING_PHONE_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: "We need your phone number to complete registration. Please start over with 'book appointment'.",
  hi: "Registration complete karne ke liye aapka phone number chahiye. 'book appointment' se dobara shuru karein.",
  pa: "Registration complete karan layi tuhada phone number chahida. 'book appointment' ton dubara shuru karo.",
};

export function buildConsentPersistMissingPhoneMessage(input: ConsentLanguageOnlyInput): string {
  return CONSENT_PERSIST_MISSING_PHONE_COPY[toStaticLocale(input.language)];
}

const CONSENT_PERSIST_SUCCESS_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: "Thanks! I've saved your details. How can I help you next - would you like to book an appointment or check availability?",
  hi: 'Dhanyavaad! Maine aapki details save kar li hain. Aage kaise madad kar sakta hoon — appointment book karna chahenge ya availability check karni hai?',
  pa: 'Dhanyavaad! Main tuhadi details save kar chukya haan. Agge kive madad kar sakda haan — appointment book karna chaoge ya availability check karni hai?',
};

export function buildConsentPersistSuccessMessage(input: ConsentLanguageOnlyInput): string {
  return CONSENT_PERSIST_SUCCESS_COPY[toStaticLocale(input.language)];
}

const CONSENT_DENIED_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: "No problem. I haven't saved any of your information. Say 'book appointment' anytime if you'd like to try again.",
  hi: "Koi baat nahi. Maine aapki koi bhi information save nahi ki. Dobara try karna ho to kabhi bhi 'book appointment' likhein.",
  pa: "Koi gal nahi. Main tuhadi koi vi information save nahi kiti. Dubara try karna hove ta kade vi 'book appointment' likho.",
};

export function buildConsentDeniedMessage(input: ConsentLanguageOnlyInput): string {
  return CONSENT_DENIED_COPY[toStaticLocale(input.language)];
}

const CONSENT_REVOKE_RECORD_NOT_FOUND_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: "I couldn't find your record. If you had shared information before, it may already have been removed.",
  hi: 'Maine aapka record nahi dhunda. Agar pehle information share ki thi to shayad pehle hi remove ho chuki hai.',
  pa: 'Main tuhada record nahi labhya. Je pehlan information share kiti si ta shayad pehlan hi remove ho chuki hai.',
};

export function buildConsentRevokeRecordNotFoundMessage(input: ConsentLanguageOnlyInput): string {
  return CONSENT_REVOKE_RECORD_NOT_FOUND_COPY[toStaticLocale(input.language)];
}

const CONSENT_REVOKE_ALREADY_REMOVED_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: 'Your data has already been removed. Is there anything else I can help with?',
  hi: 'Aapka data pehle hi remove ho chuka hai. Aur kuch madad chahiye?',
  pa: 'Tuhada data pehlan hi remove ho chuka hai. Hor kuj madad chahidi?',
};

export function buildConsentRevokeAlreadyRemovedMessage(input: ConsentLanguageOnlyInput): string {
  return CONSENT_REVOKE_ALREADY_REMOVED_COPY[toStaticLocale(input.language)];
}

const CONSENT_REVOKE_NO_STORED_DATA_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: "We don't have any stored personal information to remove. Say 'book appointment' if you'd like to schedule.",
  hi: "Hamare paas remove karne ke liye koi stored personal information nahi hai. Schedule karna ho to 'book appointment' likhein.",
  pa: "Sadde kol remove karan layi koi stored personal information nahi. Schedule karna hove ta 'book appointment' likho.",
};

export function buildConsentRevokeNoStoredDataMessage(input: ConsentLanguageOnlyInput): string {
  return CONSENT_REVOKE_NO_STORED_DATA_COPY[toStaticLocale(input.language)];
}

const CONSENT_REVOKE_SUCCESS_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: "Done. I've removed your personal information from our records. Is there anything else I can help with?",
  hi: 'Ho gaya. Maine aapki personal information hamare records se remove kar di hai. Aur kuch madad chahiye?',
  pa: 'Ho gaya. Main tuhadi personal information sade records ton remove kar ditti hai. Hor kuj madad chahidi?',
};

export function buildConsentRevokeSuccessMessage(input: ConsentLanguageOnlyInput): string {
  return CONSENT_REVOKE_SUCCESS_COPY[toStaticLocale(input.language)];
}

const RECEPTIONIST_PAUSE_DEFAULT_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: 'Thanks for your message. Our team will reply from this inbox personally when they can. Automated scheduling is paused right now - we appreciate your patience.',
  hi: 'Aapke message ke liye dhanyavaad. Hamari team jab ho sake is inbox se personally reply karegi. Automated scheduling abhi pause hai — aapke sabr ke liye dhanyavaad.',
  pa: 'Tuhade message layi dhanyavaad. Sadi team jadon ho sake is inbox ton personally reply karegi. Automated scheduling hun pause hai — tuhade sabr layi dhanyavaad.',
};

export function buildReceptionistPauseDefaultMessage(input: ConsentLanguageOnlyInput): string {
  return RECEPTIONIST_PAUSE_DEFAULT_COPY[toStaticLocale(input.language)];
}

// ---------------------------------------------------------------------------
// Automated messaging opt-out (mca-07) — distinct from consent revoke
// ---------------------------------------------------------------------------

export const AUTOMATED_MESSAGING_STOP_ACK_EN =
  "I'll stop sending automated messages here. Send START if you want them again.";

const AUTOMATED_MESSAGING_STOP_ACK_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: AUTOMATED_MESSAGING_STOP_ACK_EN,
  hi: 'Main yahan automated messages bhejna band karunga. Dobara chahiye to START bhejein.',
  pa: 'Main ithe automated messages bhejna band karunga. Dobara chahide hon ta START bhejo.',
};

export const AUTOMATED_MESSAGING_START_ACK_EN = 'Automated messages are on again. How can I help?';

const AUTOMATED_MESSAGING_START_ACK_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: AUTOMATED_MESSAGING_START_ACK_EN,
  hi: 'Automated messages phir se on hain. Main kaise madad karun?',
  pa: 'Automated messages phir ton on han. Main kive madad karan?',
};

export function buildAutomatedMessagingStopAckMessage(input: ConsentLanguageOnlyInput): string {
  return AUTOMATED_MESSAGING_STOP_ACK_COPY[toStaticLocale(input.language)];
}

export function buildAutomatedMessagingStartAckMessage(input: ConsentLanguageOnlyInput): string {
  return AUTOMATED_MESSAGING_START_ACK_COPY[toStaticLocale(input.language)];
}

// ---------------------------------------------------------------------------
// Booking funnel clarifiers (lang-22 · p5) — English arms until p6
// ---------------------------------------------------------------------------

export const DM_COPY_LANG22_PHI = {
  buildPatientMatchConfirmMessage: true,
  buildBookForOtherSelfNudgeMessage: false,
  buildBookForRelationNudgeMessage: false,
  buildConsentBookForOtherRetryIntroMessage: false,
  buildConsentPersistFailureRetryMessage: false,
  buildBookForOtherJustRelationIntroMessage: false,
  buildStillNeedDetailsIntroMessage: false,
  buildBookForOtherNextIntroMessage: false,
  buildFollowUpServiceConfirmUnclearMessage: false,
  buildPatientMatchConfirmUnclearMessage: false,
  buildTeleconsultChannelPickMessage: false,
  buildBookForOtherDualIntroMessage: false,
  buildBookForThemIntroMessage: false,
  buildReturningFollowUpConfirmMessage: false,
  buildPhoneDisplayFallbackLabel: false,
} as const;

const BOOK_FOR_OTHER_SELF_NUDGE_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: 'Would you like to book one for yourself now?',
  hi: 'Kya aap apne liye bhi abhi book karna chahenge?',
  pa: 'Ki tusi apne layi vi hun book karna chaoge?',
};

/** Appended after a slot link — self booking nudge (LANG5-D7 single builder). */
export function buildBookForOtherSelfNudgeMessage(input: ConsentLanguageOnlyInput): string {
  return BOOK_FOR_OTHER_SELF_NUDGE_COPY[toStaticLocale(input.language)];
}

export interface BookForRelationNudgeMessageInput {
  readonly language: ConversationLanguage;
  readonly relation: string;
}

const BOOK_FOR_RELATION_NUDGE_COPY: Readonly<
  Record<StaticMessageLocale, { body: (relation: string) => string }>
> = {
  en: { body: (relation) => `Would you like to book for your ${relation} now?` },
  hi: { body: (relation) => `Kya aap apne ${relation} ke liye abhi book karna chahenge?` },
  pa: { body: (relation) => `Ki tusi apne ${relation} layi hun book karna chaoge?` },
};

export function buildBookForRelationNudgeMessage(input: BookForRelationNudgeMessageInput): string {
  return BOOK_FOR_RELATION_NUDGE_COPY[toStaticLocale(input.language)].body(input.relation);
}

const CONSENT_BOOK_FOR_OTHER_RETRY_INTRO_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: "I didn't catch the details for the person you're booking for — could you resend them?",
  hi: 'Jis person ke liye aap book kar rahe hain unki details samajh nahi aayi — kya dobara bhej sakte hain?',
  pa: 'Jis person layi tusi book kar rahe ho ohna di details samajh nahi aayi — ki dubara bhej sakde ho?',
};

export function buildConsentBookForOtherRetryIntroMessage(input: ConsentLanguageOnlyInput): string {
  return CONSENT_BOOK_FOR_OTHER_RETRY_INTRO_COPY[toStaticLocale(input.language)];
}

const CONSENT_PERSIST_FAILURE_RETRY_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: "I had trouble saving your details — please reply **Yes** again to retry, or say 'book appointment' to re-share them.",
  hi: "Aapki details save karne mein problem hui — retry ke liye dubara **Yes** reply karein, ya 'book appointment' keh kar details dobara share karein.",
  pa: "Tuhadi details save karan vich problem aayi — retry layi dubara **Yes** reply karo, ya 'book appointment' keh ke details dubara share karo.",
};

export function buildConsentPersistFailureRetryMessage(input: ConsentLanguageOnlyInput): string {
  return CONSENT_PERSIST_FAILURE_RETRY_COPY[toStaticLocale(input.language)];
}

export interface BookForOtherJustRelationIntroMessageInput {
  readonly language: ConversationLanguage;
  readonly relation: string;
}

const BOOK_FOR_OTHER_JUST_RELATION_INTRO_COPY: Readonly<
  Record<StaticMessageLocale, { body: (relation: string) => string }>
> = {
  en: {
    body: (relation) => `Got it, just your **${relation}** then. Please share their details:`,
  },
  hi: {
    body: (relation) => `Theek hai, sirf aapke **${relation}** ke liye. Unki details share karein:`,
  },
  pa: {
    body: (relation) => `Theek aa, sirf tuhade **${relation}** layi. Ohna di details share karo:`,
  },
};

export function buildBookForOtherJustRelationIntroMessage(
  input: BookForOtherJustRelationIntroMessageInput
): string {
  return BOOK_FOR_OTHER_JUST_RELATION_INTRO_COPY[toStaticLocale(input.language)].body(
    input.relation
  );
}

const STILL_NEED_DETAILS_INTRO_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: 'Still need these details:',
  hi: 'Abhi bhi yeh details chahiye:',
  pa: 'Hun vi eh details chahidiyan ne:',
};

export function buildStillNeedDetailsIntroMessage(input: ConsentLanguageOnlyInput): string {
  return STILL_NEED_DETAILS_INTRO_COPY[toStaticLocale(input.language)];
}

export interface BookForOtherNextIntroMessageInput {
  readonly language: ConversationLanguage;
  readonly relation: string;
}

const BOOK_FOR_OTHER_NEXT_INTRO_COPY: Readonly<
  Record<StaticMessageLocale, { body: (relation: string) => string }>
> = {
  en: {
    body: (relation) =>
      `Got it. I'll help you book for your **${relation}** next. Please share their details:`,
  },
  hi: {
    body: (relation) =>
      `Theek hai. Main aapke **${relation}** ke liye book karne mein madad karunga. Unki details share karein:`,
  },
  pa: {
    body: (relation) =>
      `Theek aa. Main tuhade **${relation}** layi book karn vich madad karunga. Ohna di details share karo:`,
  },
};

export function buildBookForOtherNextIntroMessage(
  input: BookForOtherNextIntroMessageInput
): string {
  return BOOK_FOR_OTHER_NEXT_INTRO_COPY[toStaticLocale(input.language)].body(input.relation);
}

const PATIENT_MATCH_CONFIRM_OTHER_NUMBER_COPY: Readonly<
  Record<StaticMessageLocale, { body: (n: string) => string }>
> = {
  en: {
    body: (n) => `We found a record for **${n}** with this number. Same person? Reply Yes or No.`,
  },
  hi: {
    body: (n) => `Is number par **${n}** ka record mila. Wahi person? Yes ya No reply karein.`,
  },
  pa: {
    body: (n) => `Is number te **${n}** da record mila. Ohi person? Yes ya No reply karo.`,
  },
};

const PATIENT_MATCH_CONFIRM_SELF_DETAILS_COPY: Readonly<
  Record<StaticMessageLocale, { body: (n: string) => string }>
> = {
  en: {
    body: (n) =>
      `We found an existing record matching your details (**${n}**). Is this you? Reply Yes or No.`,
  },
  hi: {
    body: (n) =>
      `Aapki details se match karta existing record mila (**${n}**). Kya yeh aap hain? Yes ya No reply karein.`,
  },
  pa: {
    body: (n) =>
      `Tuhadi details naal match karda existing record mila (**${n}**). Ki eh tusi ho? Yes ya No reply karo.`,
  },
};

const PATIENT_MATCH_CONFIRM_MULTI_COPY: Readonly<
  Record<StaticMessageLocale, { body: (count: number, block: string) => string }>
> = {
  en: {
    body: (count, block) =>
      `We found ${count} records: ${block}. Which one? Reply 1 or 2, or No for new patient.`,
  },
  hi: {
    body: (count, block) =>
      `Humne ${count} records dhunde: ${block}. Kaunsa? 1 ya 2 reply karein, ya naye patient ke liye No.`,
  },
  pa: {
    body: (count, block) =>
      `Asi ${count} records labhe: ${block}. Kehra? 1 ya 2 reply karo, ya naye patient layi No.`,
  },
};

export type PatientMatchConfirmKind = 'other_number' | 'self_details' | 'multi';

export interface PatientMatchConfirmMessageInput {
  readonly language: ConversationLanguage;
  readonly kind: PatientMatchConfirmKind;
  /** Display name for single-match kinds. */
  readonly patientName?: string;
  /** Pre-rendered numbered lines for multi (e.g. `1. **Name**`). */
  readonly multiLines?: readonly string[];
  readonly multiCount?: number;
}

/** @phi true — interpolates patient name(s). */
export function buildPatientMatchConfirmMessage(input: PatientMatchConfirmMessageInput): string {
  const locale = toStaticLocale(input.language);
  if (input.kind === 'other_number') {
    const name = input.patientName?.trim() || 'them';
    return PATIENT_MATCH_CONFIRM_OTHER_NUMBER_COPY[locale].body(name);
  }
  if (input.kind === 'self_details') {
    const name = input.patientName?.trim() || 'them';
    return PATIENT_MATCH_CONFIRM_SELF_DETAILS_COPY[locale].body(name);
  }
  // Pre-migration: `We found N records: 1. Name, 2. Name. Which one?…`
  const list = (input.multiLines ?? []).join(', ');
  const n = input.multiCount ?? input.multiLines?.length ?? 0;
  return PATIENT_MATCH_CONFIRM_MULTI_COPY[locale].body(n, list);
}

const FOLLOW_UP_SERVICE_CONFIRM_UNCLEAR_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: 'Please reply **Yes** or **No** — is this visit a follow-up for the same service?',
  hi: 'Please **Yes** ya **No** reply karein — kya yeh visit same service ke liye follow-up hai?',
  pa: 'Please **Yes** ya **No** reply karo — ki eh visit same service layi follow-up hai?',
};

export function buildFollowUpServiceConfirmUnclearMessage(input: ConsentLanguageOnlyInput): string {
  return FOLLOW_UP_SERVICE_CONFIRM_UNCLEAR_COPY[toStaticLocale(input.language)];
}

const PATIENT_MATCH_CONFIRM_UNCLEAR_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: 'Please reply Yes to use the existing record, or No to create a new patient. Reply 1 or 2 if we found multiple matches.',
  hi: 'Existing record use karne ke liye Yes reply karein, ya naya patient banane ke liye No. Agar multiple matches mile hon to 1 ya 2 reply karein.',
  pa: 'Existing record use karn layi Yes reply karo, ya naya patient banan layi No. Je multiple matches mile hon ta 1 ya 2 reply karo.',
};

export function buildPatientMatchConfirmUnclearMessage(input: ConsentLanguageOnlyInput): string {
  return PATIENT_MATCH_CONFIRM_UNCLEAR_COPY[toStaticLocale(input.language)];
}

const TELECONSULT_CHANNEL_PICK_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: 'Right now we offer **teleconsult** only (text, voice, or video) — which works best for you?',
  hi: 'Abhi hum sirf **teleconsult** offer karte hain (text, voice, ya video) — aapke liye kaunsa best hai?',
  pa: 'Hun asi sirf **teleconsult** offer karde haan (text, voice, ya video) — tuhade layi kehra best hai?',
};

export function buildTeleconsultChannelPickMessage(input: ConsentLanguageOnlyInput): string {
  return TELECONSULT_CHANNEL_PICK_COPY[toStaticLocale(input.language)];
}

export interface BookForOtherDualIntroMessageInput {
  readonly language: ConversationLanguage;
  readonly relation: string;
}

const BOOK_FOR_OTHER_DUAL_INTRO_COPY: Readonly<
  Record<StaticMessageLocale, { body: (relation: string) => string }>
> = {
  en: {
    body: (relation) =>
      `I'll help you book for you and your **${relation}**. Let's take them one at a time — your **${relation}** first, then you. Please share their details:`,
  },
  hi: {
    body: (relation) =>
      `Main aapke aur aapke **${relation}** dono ke liye book karne mein madad karunga. Ek ek karke — pehle aapke **${relation}**, phir aap. Unki details share karein:`,
  },
  pa: {
    body: (relation) =>
      `Main tuhade te tuhade **${relation}** dono layi book karn vich madad karunga. Ik-ik karke — pehlan tuhade **${relation}**, phir tusi. Ohna di details share karo:`,
  },
};

export function buildBookForOtherDualIntroMessage(
  input: BookForOtherDualIntroMessageInput
): string {
  return BOOK_FOR_OTHER_DUAL_INTRO_COPY[toStaticLocale(input.language)].body(input.relation);
}

const BOOK_FOR_THEM_INTRO_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: "I'll help you book for **them**. Please share their details:",
  hi: 'Main **unke** liye book karne mein madad karunga. Unki details share karein:',
  pa: 'Main **ohna** layi book karn vich madad karunga. Ohna di details share karo:',
};

export function buildBookForThemIntroMessage(input: ConsentLanguageOnlyInput): string {
  return BOOK_FOR_THEM_INTRO_COPY[toStaticLocale(input.language)];
}

export interface ReturningFollowUpConfirmMessageInput {
  readonly language: ConversationLanguage;
  readonly serviceLabel: string;
}

const RETURNING_FOLLOW_UP_CONFIRM_COPY: Readonly<
  Record<StaticMessageLocale, { body: (label: string) => string }>
> = {
  en: {
    body: (_label) => `Say book if you want the booking page.`,
  },
  hi: {
    body: (_label) => `Booking page chahiye ho to book likhein.`,
  },
  pa: {
    body: (_label) => `Booking page chahidi hove ta book likho.`,
  },
};

export function buildReturningFollowUpConfirmMessage(
  input: ReturningFollowUpConfirmMessageInput
): string {
  return RETURNING_FOLLOW_UP_CONFIRM_COPY[toStaticLocale(input.language)].body(input.serviceLabel);
}

const PHONE_DISPLAY_FALLBACK_LABEL_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: 'your number',
  hi: 'aapka number',
  pa: 'tuhada number',
};

/** Fallback phone display token (not PHI — opaque label). */
export function buildPhoneDisplayFallbackLabel(input: ConsentLanguageOnlyInput): string {
  return PHONE_DISPLAY_FALLBACK_LABEL_COPY[toStaticLocale(input.language)];
}

// ---------------------------------------------------------------------------
// lang-23: system / OOB / comment outreach
// ---------------------------------------------------------------------------

/**
 * Strings that stay English forever (lang-23 / lang-24 gate contract).
 * An unlisted patient-facing literal fails the close gate.
 */
export const DM_COPY_ENGLISH_ONLY_EXCEPTIONS = {
  FALLBACK_REPLY_NO_DOCTOR: {
    text: "Thanks for your message. We'll get back to you soon.",
    reason: 'Unknown page / no doctor linked — no conversation exists',
  },
  COMMENT_PUBLIC_REPLY: {
    text: 'Check your DM for more information.',
    variants: [
      'Check your DM for more information.',
      'I sent you a private message with the details.',
      'Please open your DMs — I replied there.',
    ],
    reason: 'Public comment reply visible to everyone, not a DM',
  },
  RECORDING_CONSENT_AND_ACCOUNT_DELETION: {
    text: '(LANG6-D4 / enByPolicy builders — see recording-audio-disclosure / account-deletion families)',
    reason: 'Legal review + versioned disclosure / deletion body contract',
  },
} as const;

/** Instagram username charset (letters, digits, period, underscore; max 30). */
const COMMENT_PUBLIC_REPLY_USERNAME = /^[A-Za-z0-9._]{1,30}$/;

function commentPublicReplyVariantIndex(commentId: string): number {
  const variants = DM_COPY_ENGLISH_ONLY_EXCEPTIONS.COMMENT_PUBLIC_REPLY.variants;
  let n = 0;
  for (let i = 0; i < commentId.length; i += 1) {
    n = (n + commentId.charCodeAt(i)) % variants.length;
  }
  return n;
}

/**
 * Public comment reply — English forever (lang-23). Prefixes `@username`
 * when a safe handle is present. Same comment id always picks the same
 * variant so Meta retries stay identical.
 */
export function buildCommentPublicReplyText(input: {
  commentId: string;
  username?: string | null;
}): string {
  const variants = DM_COPY_ENGLISH_ONLY_EXCEPTIONS.COMMENT_PUBLIC_REPLY.variants;
  const variant = variants[commentPublicReplyVariantIndex(input.commentId)] ?? variants[0];
  const raw = (input.username ?? '').trim().replace(/^@/, '');
  if (raw && COMMENT_PUBLIC_REPLY_USERNAME.test(raw)) {
    return `@${raw} ${variant}`;
  }
  return variant;
}

/** English constant for the no-doctor exception path (same bytes as builder `en`). */
export const FALLBACK_REPLY_EN = DM_COPY_ENGLISH_ONLY_EXCEPTIONS.FALLBACK_REPLY_NO_DOCTOR.text;

const FALLBACK_REPLY_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: FALLBACK_REPLY_EN,
  hi: 'Aapke message ke liye dhanyavaad. Hum jald jawab denge.',
  pa: 'Tuhade message layi dhanyavaad. Asi jald jawab denge.',
};

export function buildFallbackReplyMessage(input: ConsentLanguageOnlyInput): string {
  return FALLBACK_REPLY_COPY[toStaticLocale(input.language)];
}

const THROTTLE_ACK_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: 'I see your messages — give me a moment to respond.',
  hi: 'Aapke messages aa gaye — jawab dene ke liye thoda samay dijiye.',
  pa: 'Tuhade messages aa gaye — jawab denn layi thoda samay devo.',
};

export function buildThrottleAckMessage(input: ConsentLanguageOnlyInput): string {
  return THROTTLE_ACK_COPY[toStaticLocale(input.language)];
}

export type CommentProactiveDmIntent =
  | 'book_appointment'
  | 'check_availability'
  | 'pricing_inquiry'
  | 'general_inquiry'
  | 'medical_query';

export interface CommentProactiveDmMessageInput {
  readonly language: ConversationLanguage;
  readonly intent: CommentProactiveDmIntent | string;
  readonly practiceName?: string;
  readonly specialty?: string;
  readonly addressSummary?: string;
}

type CommentProactiveArm = { readonly ack: string; readonly cta: string };

const COMMENT_PROACTIVE_DM_TEMPLATES: Readonly<
  Record<StaticMessageLocale, Record<string, CommentProactiveArm>>
> = {
  en: {
    book_appointment: {
      ack: 'You expressed interest in booking.',
      cta: "Reply here if you'd like to schedule.",
    },
    check_availability: {
      ack: 'You asked about availability.',
      cta: "Reply here if you'd like to schedule a consultation.",
    },
    pricing_inquiry: {
      ack: 'You asked about pricing.',
      cta: "Reply here if you'd like more details.",
    },
    general_inquiry: {
      ack: 'You had a question.',
      cta: "Reply here if you'd like to connect.",
    },
    medical_query: {
      ack: 'Our doctor may be able to help with your query.',
      cta: "If you'd like to schedule a consultation, reply here.",
    },
  },
  hi: {
    book_appointment: {
      ack: 'Aapne booking mein interest dikhaya.',
      cta: 'Schedule karna ho to yahan reply karein.',
    },
    check_availability: {
      ack: 'Aapne availability ke baare mein pucha.',
      cta: 'Consultation schedule karna ho to yahan reply karein.',
    },
    pricing_inquiry: {
      ack: 'Aapne pricing ke baare mein pucha.',
      cta: 'Aur details chahiye hon to yahan reply karein.',
    },
    general_inquiry: {
      ack: 'Aapka ek sawaal tha.',
      cta: 'Connect karna ho to yahan reply karein.',
    },
    medical_query: {
      ack: 'Hamare doctor aapke query mein madad kar sakte hain.',
      cta: 'Consultation schedule karna ho to yahan reply karein.',
    },
  },
  pa: {
    book_appointment: {
      ack: 'Tusi booking vich interest dikhaya.',
      cta: 'Schedule karna hove ta ithe reply karo.',
    },
    check_availability: {
      ack: 'Tusi availability baare puchya.',
      cta: 'Consultation schedule karna hove ta ithe reply karo.',
    },
    pricing_inquiry: {
      ack: 'Tusi pricing baare puchya.',
      cta: 'Hor details chahidiyan hon ta ithe reply karo.',
    },
    general_inquiry: {
      ack: 'Tuhada ik sawaal si.',
      cta: 'Connect karna hove ta ithe reply karo.',
    },
    medical_query: {
      ack: 'Sade doctor tuhade query vich madad kar sakde ne.',
      cta: 'Consultation schedule karna hove ta ithe reply karo.',
    },
  },
};

/**
 * Proactive DM after a high-intent public comment (Instagram + Facebook).
 * Language from the linked conversation only (LANG5-D6) — never from comment text.
 */
export function buildCommentProactiveDmMessage(input: CommentProactiveDmMessageInput): string {
  const locale = toStaticLocale(input.language);
  const practiceName = input.practiceName?.trim() || 'Our practice';
  const specialty = input.specialty?.trim() || '';
  const address = input.addressSummary?.trim() || '';
  const detailsBlock = `\n\n${practiceName}${specialty ? ` - ${specialty}` : ''}${address ? `. ${address}` : ''}`;

  const table = COMMENT_PROACTIVE_DM_TEMPLATES[locale];
  const t = table[input.intent] ?? table.general_inquiry!;
  return `${t.ack}${detailsBlock}\n\n${t.cta}`;
}

export interface SlotSelectedFollowUpDmInput {
  readonly language: ConversationLanguage;
  readonly dateDisplay: string;
  readonly bookingLink: string;
}

const SLOT_SELECTED_FOLLOW_UP_COPY: Readonly<
  Record<StaticMessageLocale, { body: (dateDisplay: string, bookingLink: string) => string }>
> = {
  en: {
    body: (dateDisplay, bookingLink) =>
      `You selected **${dateDisplay}**. Continue in chat if you need help, or pick another time here: [Change slot](${bookingLink})`,
  },
  hi: {
    body: (dateDisplay, bookingLink) =>
      `Aapne **${dateDisplay}** select kiya. Help chahiye ho to chat mein continue karein, ya yahan aur time pick karein: [Change slot](${bookingLink})`,
  },
  pa: {
    body: (dateDisplay, bookingLink) =>
      `Tusi **${dateDisplay}** select kita. Help chahidi hove ta chat vich continue karo, ya ithe hor time pick karo: [Change slot](${bookingLink})`,
  },
};

export function buildSlotSelectedFollowUpDm(input: SlotSelectedFollowUpDmInput): string {
  return SLOT_SELECTED_FOLLOW_UP_COPY[toStaticLocale(input.language)].body(
    input.dateDisplay,
    input.bookingLink
  );
}

export interface DuplicateBookingOnDateMessageInput {
  readonly language: ConversationLanguage;
  readonly dateDisplay: string;
}

const DUPLICATE_BOOKING_ON_DATE_COPY: Readonly<
  Record<StaticMessageLocale, { body: (dateDisplay: string) => string }>
> = {
  en: {
    body: (dateDisplay) =>
      `You already have an appointment on ${dateDisplay}. Please choose another date or contact us if you need multiple visits.`,
  },
  hi: {
    body: (dateDisplay) =>
      `Aapka ${dateDisplay} ko pehle se appointment hai. Koi aur date choose karein ya multiple visits chahiye hon to humse contact karein.`,
  },
  pa: {
    body: (dateDisplay) =>
      `Tuhada ${dateDisplay} nu pehlan ton appointment hai. Koi hor date choose karo ya multiple visits chahidiyan hon ta sade naal contact karo.`,
  },
};

export function buildDuplicateBookingOnDateMessage(
  input: DuplicateBookingOnDateMessageInput
): string {
  return DUPLICATE_BOOKING_ON_DATE_COPY[toStaticLocale(input.language)].body(input.dateDisplay);
}

export interface AppointmentRescheduledConfirmDmInput {
  readonly language: ConversationLanguage;
  readonly dateDisplay: string;
}

const APPOINTMENT_RESCHEDULED_CONFIRM_COPY: Readonly<
  Record<StaticMessageLocale, { body: (dateDisplay: string) => string }>
> = {
  en: {
    body: (dateDisplay) => `Your appointment has been rescheduled to **${dateDisplay}**.`,
  },
  hi: {
    body: (dateDisplay) => `Aapka appointment **${dateDisplay}** par reschedule ho gaya hai.`,
  },
  pa: {
    body: (dateDisplay) => `Tuhada appointment **${dateDisplay}** te reschedule ho gaya hai.`,
  },
};

export function buildAppointmentRescheduledConfirmDm(
  input: AppointmentRescheduledConfirmDmInput
): string {
  return APPOINTMENT_RESCHEDULED_CONFIRM_COPY[toStaticLocale(input.language)].body(
    input.dateDisplay
  );
}

export interface WelcomeBackSegmentMessageInput {
  readonly language: ConversationLanguage;
  readonly firstName?: string;
  readonly recencyBucket?: 'within_1_month' | 'within_3_months' | 'within_1_year' | 'over_1_year';
}

const WELCOME_BACK_GREETING_NAMED_COPY: Readonly<
  Record<StaticMessageLocale, { body: (n: string) => string }>
> = {
  en: { body: (n) => `Welcome back, **${n}**!` },
  hi: { body: (n) => `Wapas aane par swagat hai, **${n}**!` },
  pa: { body: (n) => `Wapas aun te swagat hai, **${n}**!` },
};

const WELCOME_BACK_GREETING_PLAIN_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: 'Welcome back!',
  hi: 'Wapas aane par swagat hai!',
  pa: 'Wapas aun te swagat hai!',
};

const WELCOME_BACK_SUFFIX_COPY: Readonly<
  Record<
    StaticMessageLocale,
    Partial<Record<NonNullable<WelcomeBackSegmentMessageInput['recencyBucket']>, string>>
  >
> = {
  en: {
    within_1_month: 'Great to hear from you again.',
    within_3_months: "It's good to hear from you again.",
    within_1_year: "It's been a while — good to hear from you.",
    over_1_year: "It's been quite a while — glad you're in touch.",
  },
  hi: {
    within_1_month: 'Aapka message phir se sun kar achha laga.',
    within_3_months: 'Aapka message sun kar achha laga.',
    within_1_year: 'Kaafi time ho gaya — aapka message sun kar achha laga.',
    over_1_year: 'Bahut time ho gaya — contact karne ke liye dhanyavaad.',
  },
  pa: {
    within_1_month: 'Tuhada message phir sun ke changa laga.',
    within_3_months: 'Tuhada message sun ke changa laga.',
    within_1_year: 'Kaafi time ho gaya — tuhada message sun ke changa laga.',
    over_1_year: 'Bahut time ho gaya — contact karn layi dhanyavaad.',
  },
};

export function buildWelcomeBackSegmentMessage(input: WelcomeBackSegmentMessageInput): string {
  const locale = toStaticLocale(input.language);
  const firstName = input.firstName?.trim();
  const greeting = firstName
    ? WELCOME_BACK_GREETING_NAMED_COPY[locale].body(firstName)
    : WELCOME_BACK_GREETING_PLAIN_COPY[locale];

  const suffixByBucket = WELCOME_BACK_SUFFIX_COPY[locale];
  const suffix = input.recencyBucket ? suffixByBucket[input.recencyBucket] : undefined;
  return suffix ? `${greeting} ${suffix}` : greeting;
}

export const DM_COPY_LANG23_PHI = {
  buildFallbackReplyMessage: false,
  buildThrottleAckMessage: false,
  buildCommentProactiveDmMessage: false,
  buildSlotSelectedFollowUpDm: false,
  buildDuplicateBookingOnDateMessage: false,
  buildAppointmentRescheduledConfirmDm: false,
  buildWelcomeBackSegmentMessage: true,
} as const;

/**
 * Machine-readable PHI registry for all p5 (+ lang-20 status) builders.
 * lang-25 / p6 consume this — do not leave builders unmarked.
 */
export const DM_COPY_PHI_REGISTRY = {
  ...DM_COPY_PHI_BUILDERS,
  ...DM_COPY_LANG21_PHI,
  ...DM_COPY_LANG22_PHI,
  ...DM_COPY_LANG23_PHI,
  buildLlmEmptyFallbackMessage: false,
} as const;

export type DmCopyPhiBuilderName = keyof typeof DM_COPY_PHI_REGISTRY;

const LLM_EMPTY_FALLBACK_COPY: Readonly<Record<StaticMessageLocale, string>> = {
  en: "I didn't quite get that. Could you rephrase? Or say 'book appointment', 'check availability', 'cancel appointment', or 'reschedule appointment' if that's what you need.",
  hi: "Main theek se samajh nahi paaya. Kya dobara likh sakte hain? Ya agar yeh chahiye ho to 'book appointment', 'check availability', 'cancel appointment', ya 'reschedule appointment' likhein.",
  pa: "Main theek tarah samajh nahi paya. Ki dubara likh sakde ho? Ya je eh chahida hove ta 'book appointment', 'check availability', 'cancel appointment', ya 'reschedule appointment' likho.",
};

/** LLM empty/fail fallback (was ai-service FALLBACK_RESPONSE) — lang-24 sweep. */
export function buildLlmEmptyFallbackMessage(input: ConsentLanguageOnlyInput): string {
  return LLM_EMPTY_FALLBACK_COPY[toStaticLocale(input.language)];
}
