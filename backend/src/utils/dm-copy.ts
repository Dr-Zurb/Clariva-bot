/**
 * dm-copy
 * -------
 * Single source of truth for patient-facing DM strings.
 *
 * Design contract (Plan "Patient DM copy polish", 2026-04-18):
 *   - Pure functions only. No I/O, no loggers, no `await`. Input → string.
 *   - Typed inputs. Each builder takes a small typed object, not positional
 *     arguments.
 *   - One helper per rendered message family. Variant branching happens inside
 *     the helper via typed discriminators, not by creating sibling helpers with
 *     copy drift between them.
 *   - Every public builder is covered by a golden snapshot in
 *     `backend/tests/unit/utils/dm-copy.snap.test.ts`.
 *
 * This file starts tiny on purpose. Tasks 02–11 in the 2026-04-18 plan each
 * migrate one message family (confirm-details, intake ask, consent, payment
 * confirmation, abandoned-booking reminder, cancel picker, staff-review
 * resolved, mixed-complaint clarification, reason-first triage, non-text ack)
 * into this module as they ship.
 *
 * Plan: docs/Development/Daily-plans/April 2026/18-04-2026/plan-patient-dm-copy-polish.md
 */

import type { CollectedPatientData, PatientCollectionField } from './validation';
import {
  RECORDING_CONSENT_BODY_V1,
  RECORDING_CONSENT_VERSION,
} from '../constants/recording-consent';

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
 * If localized variants are needed, add them in a follow-up task — English
 * only for now, matching the rest of the plan's non-goals.
 */
export function buildNonTextAckMessage(): string {
  return "I can't read images or voice notes yet — could you type your message instead? I'll take it from there.";
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
export function buildConfirmDetailsMessage(collected: CollectedPatientData): string {
  const lines: string[] = ["Here's what I have so far:", ''];

  if (collected.name) lines.push(`**Name:** ${collected.name}`);
  if (collected.age !== undefined) lines.push(`**Age:** ${collected.age}`);
  if (collected.gender) lines.push(`**Gender:** ${titleCaseWord(collected.gender)}`);
  if (collected.phone) lines.push(`**Mobile:** ${collected.phone}`);

  const reason = collected.reason_for_visit?.trim();
  lines.push(`**Reason:** ${reason && reason.length > 0 ? reason : 'Not provided'}`);

  const email = collected.email?.trim();
  lines.push(`**Email:** ${email && email.length > 0 ? email : 'Not provided'}`);

  lines.push('', 'Is everything correct? Reply **Yes** to see available slots, or tell me what to change.');

  return lines.join('\n');
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

/**
 * Canonical human-readable labels for each intake field. Kept next to the
 * builder so every rendered intake message uses the exact same wording — the
 * audit found six inconsistent spellings of "Mobile" / "Phone" / "Mobile
 * number" in the nine pre-refactor sites.
 */
export const INTAKE_FIELD_LABELS: Readonly<Record<IntakeField, string>> = {
  name: 'Full name',
  age: 'Age',
  gender: 'Gender',
  phone: 'Mobile number',
  reason_for_visit: 'Reason for visit',
  email: 'Email',
};

/**
 * Shorthand hint on the **Reason for visit** bullet only. We deliberately avoid
 * a separate "Example:" block with a full fake patient — other fields do not
 * need inline samples; one short, plain-language cue on this line is enough.
 */
const INTAKE_REASON_VISIT_INLINE_EXAMPLES = 'e.g. **headache**, **fever**';

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

  /**
   * Doctor's practice name for the `'initial'` self-booking greeting. Empty or
   * missing falls back to `"the clinic"` (mirrors the existing
   * `doctorContext?.practice_name?.trim() || 'the clinic'` pattern upstream).
   * Ignored when `forRelation` is set or for non-initial variants.
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

function defaultIntakeIntro(params: {
  variant: IntakeRequestInput['variant'];
  practice: string;
  relation: string | undefined;
  alreadyHaveReason: boolean;
}): string[] {
  const { variant, practice, relation, alreadyHaveReason } = params;

  if (variant === 'still-need') {
    return ['Got it. Still need these details:'];
  }

  if (variant === 'retry-not-received') {
    if (relation) {
      return [`I didn't catch the details for your **${relation}** — could you resend them?`];
    }
    return ["I didn't catch your details — could you resend them?"];
  }

  // variant === 'initial'
  if (alreadyHaveReason) {
    return [
      `Sure — happy to help you book at **${practice}**.`,
      '',
      'We already have your **reason for visit** from earlier. Just need a few more:',
    ];
  }
  if (relation) {
    return [`I'll help you book for your **${relation}**. Please share their details:`];
  }
  return [
    `Sure — happy to help you book at **${practice}**.`,
    '',
    'Please share these details (you can paste them all in one message):',
  ];
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
      'buildIntakeRequestMessage: missing[] must be non-empty (all fields already captured is an unreachable caller state — handler should transition to confirm_details instead of asking for details).',
    );
  }

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
      }),
    );
  }

  for (const f of fields) {
    if (f === 'email') {
      lines.push(`- **${INTAKE_FIELD_LABELS.email}** *(optional, for receipts)*`);
    } else if (f === 'reason_for_visit') {
      lines.push(
        `- **${INTAKE_FIELD_LABELS.reason_for_visit}** — ${INTAKE_REASON_VISIT_INLINE_EXAMPLES}`,
      );
    } else {
      lines.push(`- **${INTAKE_FIELD_LABELS[f]}**`);
    }
  }

  if (input.variant === 'still-need') {
    lines.push('', 'You can paste them in one message.');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Consent / optional-extras (Task 04 — consent step, 2 call sites collapsed)
// ---------------------------------------------------------------------------

export interface ConsentMessageInput {
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
  const phoneDisplay = input.phoneDisplay.trim().length > 0 ? input.phoneDisplay : 'your number';

  if (input.bookingForSomeoneElse) {
    const forName = input.bookingForName?.trim();
    if (!forName) {
      throw new Error(
        'buildConsentOptionalExtrasMessage: bookingForName is required when bookingForSomeoneElse is true (consent step should not be reached before the intake step captures the patient name).',
      );
    }
    return [
      'Thanks.',
      `We'll use ${phoneDisplay} to confirm the appointment for **${forName}**.`,
      '',
      'Do I have your consent to use these details to schedule?',
      '',
      'Reply **Yes** to continue.',
    ].join('\n');
  }

  const greetingLine = isMissingPatientName(input.patientName)
    ? 'Thanks.'
    : `Thanks, **${input.patientName!.trim()}**.`;

  return [
    greetingLine,
    `We'll use ${phoneDisplay} to confirm your appointment by call or text.`,
    '',
    'Any notes for the doctor? _(allergies, current medicines, anything else — optional)_',
    '',
    "Reply **Yes** when you're ready to pick a time.",
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
    /^([A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2})(?:,\s+\d{4})?,\s+(\d{1,2}:\d{2}\s*[AP]M)$/,
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
 *     arrives hours after the booking flow ends.
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
  const parts: string[] = [
    '✅ **Payment received.**',
    '',
    `Your appointment is confirmed for **${formatDateWithMiddot(input.appointmentDateDisplay)}**.`,
  ];

  const mrn = input.patientMrn?.trim();
  if (mrn) {
    parts.push('', `🆔 **Patient ID:** ${mrn}`, '_Save this for future bookings._');
  }

  if (input.modality === 'voice') {
    parts.push(
      '',
      "Note: voice consults happen via a web link from your browser — audio only, no phone call. We'll text + IG-DM the join link 5 min before.",
    );
  }

  parts.push(
    '',
    "We'll send a reminder before your visit. Reply here anytime if you need to reschedule or have questions.",
  );

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Abandoned-booking reminder (Task 06 — re-include booking URL)
// ---------------------------------------------------------------------------

export interface AbandonedBookingReminderInput {
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
export function buildAbandonedBookingReminderMessage(
  input: AbandonedBookingReminderInput,
): string {
  const url = input.bookingUrl?.trim();
  if (!url) {
    throw new Error(
      'buildAbandonedBookingReminderMessage: bookingUrl is required (abandoned-booking reminder cron should never send a reminder without a resolvable booking URL — check PUBLIC_BOOKING_BASE_URL / conversation id / doctor id upstream).',
    );
  }
  return [
    'Just checking in — your booking link is still active.',
    '',
    'Pick a time here:',
    url,
    '',
    'Reply here anytime if you need help.',
  ].join('\n');
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
  const url = input.joinUrl?.trim();
  if (!url) {
    throw new Error(
      'buildConsultationReadyDm: joinUrl is required (the fan-out helper computes the patient join URL via consultation-session-service before calling — empty here means an upstream config / token-mint bug).',
    );
  }
  const practice = input.practiceName?.trim() || 'your doctor';

  switch (input.modality) {
    case 'video':
      return [
        `Your video consult with **${practice}** is starting.`,
        '',
        'Join here:',
        url,
        '',
        'Reply in this thread if anything looks wrong.',
      ].join('\n');

    // Plan 04 · Task 21 — text branch lit up. Mirrors the video branch's
    // shape (paragraph 1: trust signal + modality label, paragraph 2: bare
    // URL on its own line for IG/SMS auto-linkification, paragraph 3:
    // fallback closing). Wording differs only at:
    //   · "video consult" → "text consult"
    //   · "Join here:"    → "Open the chat:"  (text consult IS the chat;
    //                                          "join" implies leaving
    //                                          somewhere, which it isn't.)
    //   · The closing stays "Reply in this thread …" because the urgent
    //     fan-out hits SMS where they can't reply to the bot — pointing
    //     them back to the IG / app thread is still the right escape valve
    //     if the link itself is broken.
    case 'text':
      return [
        `Your text consult with **${practice}** is starting.`,
        '',
        'Open the chat:',
        url,
        '',
        'Reply in this thread if anything looks wrong.',
      ].join('\n');

    // Plan 05 · Task 26 — voice branch lit up. Principle 8 LOCKED: voice
    // consult DMs MUST explicitly disambiguate "audio only, no phone call".
    // Without this, patients in markets where "voice consult" defaults to
    // "phone call" (especially India) sit waiting for a ring that never
    // comes → "but the doctor never called me" support tickets.
    //
    // Structure mirrors the video + text branches (trust signal → bare URL
    // → fallback closing) but **adds** a dedicated disambiguation paragraph
    // between the opener and the URL. The "audio only" + "NOT a phone call"
    // substrings are load-bearing — dropped assertions in the snapshot test
    // catch any copy-tweak that removes either keyword.
    case 'voice':
      return [
        `Your voice consult with **${practice}** is starting.`,
        '',
        '👉 This is an internet voice call (audio only) — NOT a phone call. Tap the link below to join from this device.',
        '',
        url,
        '',
        'Reply in this thread if anything looks wrong.',
      ].join('\n');

    default: {
      // Compile-time exhaustiveness check — TS will error if a new modality
      // is added without a branch here.
      const _exhaustive: never = input.modality;
      throw new Error(`buildConsultationReadyDm: unhandled modality ${String(_exhaustive)}`);
    }
  }
}

export interface PrescriptionReadyPingDmInput {
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

/**
 * Render the urgent-moment "your prescription is ready" ping. This is the
 * companion to `sendPrescriptionToPatient` (which delivers the actual
 * content) — fires ~30s later from the post-prescription worker so the
 * patient notices, even if they missed the first message in a busy IG inbox.
 *
 * Deliberately short — three lines max. The patient already received the
 * content; this is a notification, not a re-delivery.
 */
export function buildPrescriptionReadyPingDm(
  input: PrescriptionReadyPingDmInput,
): string {
  const practice = input.practiceName?.trim() || 'your doctor';
  const url = input.viewUrl?.trim();

  if (url) {
    return [
      `Your prescription from **${practice}** is ready.`,
      '',
      'View it here:',
      url,
    ].join('\n');
  }

  return `Your prescription from **${practice}** is ready — check your messages above.`;
}

// ---------------------------------------------------------------------------
// Inline-in-chat prescription delivery (Plan 04 · Task 21)
// ---------------------------------------------------------------------------

export interface PrescriptionReadyDmInput {
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
export function buildPrescriptionReadyDm(
  input: PrescriptionReadyDmInput,
): string {
  const pdf = input.pdfUrl?.trim();
  if (!pdf) {
    throw new Error(
      'buildPrescriptionReadyDm: pdfUrl is required (upstream prescription-attachment-service must mint the signed URL before this helper is called — empty here means an upstream wiring bug).',
    );
  }
  const id = input.prescriptionId?.trim();
  if (!id) {
    throw new Error(
      'buildPrescriptionReadyDm: prescriptionId is required (the prescription row supplies it — empty here means an upstream wiring bug).',
    );
  }
  const doctor = input.doctorName?.trim() || 'your doctor';

  return [
    `Prescription from **${doctor}**`,
    '',
    'Your prescription is ready. View or download the PDF here:',
    pdf,
    '',
    `Reference ID: ${id}`,
    '',
    'Next steps:',
    '• Save the PDF for your pharmacy.',
    '• Reply here in the chat if you have any questions about your prescription.',
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
export function appointmentConsultationTypeToLabel(
  type: string | null | undefined,
): string | undefined {
  const normalized = type?.trim().toLowerCase();
  switch (normalized) {
    case 'text':
      return 'Text consult';
    case 'voice':
      return 'Voice consult';
    case 'video':
      return 'Video consult';
    case 'in_clinic':
      return 'In-person';
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
  /**
   * Items to render, in the order the handler already resolved them (the
   * cancel / reschedule path sorts by `appointment_date` ascending before
   * calling into the handler; the builder preserves that order so the
   * patient's reply number maps 1:1 to
   * `state.pendingCancelAppointmentIds[n-1]`).
   *
   * Must be non-empty — an empty array is an unreachable caller state (the
   * handler already branches to the `"no upcoming"` copy when
   * `upcoming.length === 0`).
   */
  readonly items: readonly CancelChoiceItem[];
}

function renderChoiceItemLine(item: CancelChoiceItem, idx: number): string {
  const suffix = item.modalityLabel?.trim()
    ? ` — ${item.modalityLabel.trim()}`
    : '';
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
  if (input.items.length === 0) {
    throw new Error(
      'buildCancelChoiceListMessage: items[] must be non-empty (handler should emit the "no upcoming appointments" copy instead of calling this builder).',
    );
  }

  if (input.items.length === 1) {
    const only = input.items[0]!;
    const suffix = only.modalityLabel?.trim() ? ` — ${only.modalityLabel.trim()}` : '';
    return [
      `You have one upcoming appointment: **${only.dateDisplay}${suffix}**.`,
      '',
      'Reply **Yes** to cancel it, or tell me what else to do.',
    ].join('\n');
  }

  const lines = input.items.map((item, idx) => renderChoiceItemLine(item, idx));
  const trailer =
    input.items.length === 2
      ? 'Reply **1** or **2**.'
      : `Reply a number from **1** to **${input.items.length}**.`;

  return [
    'Which appointment would you like to cancel?',
    '',
    ...lines,
    '',
    trailer,
  ].join('\n');
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
export type StaffReviewResolvedKind =
  | 'confirmed'
  | 'reassigned'
  | 'learning_policy_autobook';

export interface StaffReviewResolvedBookingInput {
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

function resolveStaffReviewIntro(
  practice: string,
  label: string,
  kind: StaffReviewResolvedKind,
): string {
  switch (kind) {
    case 'confirmed':
      return `**${practice}** has confirmed your visit type: **${label}**.`;
    case 'learning_policy_autobook':
      return `**${practice}** has applied your saved visit-type preference: **${label}**.`;
    case 'reassigned':
    default:
      return `**${practice}** has updated your visit type to **${label}**.`;
  }
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
  input: StaffReviewResolvedBookingInput,
): string {
  const url = input.bookingUrl?.trim();
  if (!url) {
    throw new Error(
      'buildStaffReviewResolvedBookingMessage: bookingUrl is required (staff-review resolved / learning-policy autobook paths always call buildBookingPageUrl upstream — an empty value signals an upstream config bug).',
    );
  }
  const practice = input.practiceName?.trim() || 'the clinic';
  const label = input.visitLabel?.trim() || 'your visit';
  const intro = resolveStaffReviewIntro(practice, label, input.kind);
  return [
    intro,
    '',
    'Pick a time and complete your booking here:',
    url,
    '',
    'If something looks wrong, just reply here in this chat.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Recording-consent ask + soft re-pitch (Plan 02 · Task 27 · Decision 4 LOCKED)
// ---------------------------------------------------------------------------

/**
 * Shape shared by the two recording-consent builders. `practiceName` is
 * the only optional field because it is the only one that could drive a
 * second variant later (per-clinic copy tweaks); keeping the typed-input
 * discipline consistent with the rest of `dm-copy.ts` makes adding
 * variants a type change instead of a new exported symbol.
 */
export interface BuildRecordingConsentAskInput {
  /**
   * Doctor's practice name. Empty / whitespace falls back to `"this
   * clinic"` rather than `"the clinic"` to stay grammatical in
   * `"being recorded for <clinic>'s medical records"` — legacy builders
   * in this file use `"the clinic"` / `"your doctor"` depending on
   * sentence shape.
   */
  readonly practiceName?: string;
}

/**
 * Initial ask the IG bot sends when entering the `recording_consent`
 * step — between `consent` (schedule-this-appointment) and
 * `awaiting_date_time` / `awaiting_slot_selection`.
 *
 * Kept deliberately short: the full explainer only surfaces on the
 * first decline (`buildRecordingConsentExplainer`). The ask itself has
 * to fit the "one question per turn" DM norm and present an obvious
 * Yes / No reply shape.
 *
 * Copy rationale (Task 27 seed):
 *   - Lead with the practice context so the patient anchors recording
 *     to this specific clinic, not the bot platform.
 *   - Name the action ("recording this consult") with no euphemism —
 *     the re-pitch adds the "for medical records and quality" framing
 *     only if the patient declines.
 *   - Bold the reply tokens (`**Yes**` / `**No**`) to match the
 *     existing consent builder shape (e-task-3 consent ask uses the
 *     same convention).
 */
export function buildRecordingConsentAskMessage(
  input: BuildRecordingConsentAskInput = {},
): string {
  const practice = input.practiceName?.trim() || 'this clinic';
  return [
    `Before we book, one quick thing from ${practice}:`,
    '',
    'Are you OK with this consult being recorded? Reply **Yes** or **No**.',
  ].join('\n');
}

export interface BuildRecordingConsentExplainerInput {
  /**
   * Version token for the consent body. Callers pass
   * `RECORDING_CONSENT_VERSION` from
   * `backend/src/constants/recording-consent.ts`. Surfaced in the
   * explainer tail so the patient's audit trail lines up with the
   * exact copy they read — if the legal body bumps to `v1.1`, older
   * conversations still show `v1.0` in the DM history, which is the
   * legal-defensibility property Decision 4 locked.
   */
  readonly version: string;
  readonly practiceName?: string;
}

/**
 * Soft re-pitch sent after the patient's first "no". Embeds
 * `RECORDING_CONSENT_BODY_V1` verbatim (single source of truth lives in
 * `constants/recording-consent.ts`) so the booking page modal and the
 * IG DM never drift.
 *
 * Decision 4 caps the re-pitch at one — this builder renders that one
 * message. The IG handler is responsible for tracking that the re-pitch
 * has already been shown and not re-invoking this helper on a second
 * decline. If the patient declines again after seeing this explainer
 * we record `decision = false`, show the doctor-side banner, and let
 * the consult proceed (recording is gated off).
 *
 * Copy contract:
 *   - Opens with an implicit "no pressure" framing so the patient
 *     doesn't feel the bot is trying to override their first answer.
 *   - Body is the verbatim legal copy from `constants/` — this is the
 *     surface the audit log points at.
 *   - Ends with a binary choice that matches the booking page modal's
 *     two buttons: `[Keep recording on]` / `[Continue without
 *     recording]`. DM shape uses words (the channel doesn't support
 *     quick-reply buttons uniformly across Instagram clients).
 *   - Trailer line names the `version` token so the patient's DM
 *     history serves as a self-contained audit artifact.
 */
export function buildRecordingConsentExplainer(
  input: BuildRecordingConsentExplainerInput,
): string {
  const version = input.version?.trim();
  if (!version) {
    throw new Error(
      'buildRecordingConsentExplainer: version is required (pass RECORDING_CONSENT_VERSION from constants/recording-consent — empty means an upstream wiring bug).',
    );
  }
  const practice = input.practiceName?.trim() || 'the clinic';
  return [
    `No problem — before you decide, here's what recording means at ${practice}:`,
    '',
    RECORDING_CONSENT_BODY_V1,
    '',
    'Reply **Yes** to keep recording on, or **No** to continue without recording.',
    '',
    `(Consent version: ${version})`,
  ].join('\n');
}

/**
 * Re-exported for call sites that want to build the explainer with the
 * current default version without pulling the constants import in
 * themselves. The IG handler uses this to keep the version stamp and
 * the copy atomic at the DM boundary.
 */
export const RECORDING_CONSENT_COPY_VERSION = RECORDING_CONSENT_VERSION;

// ---------------------------------------------------------------------------
// Account deletion — Plan 02 · Task 33
// ---------------------------------------------------------------------------

export interface BuildAccountDeletionExplainerDmInput {
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
}

/**
 * One-shot explainer sent to the patient after their account-deletion
 * request has been finalized (grace expired + revocation rows written +
 * PII scrub complete). Non-urgent informational DM — NOT routed through
 * the urgent-moment fan-out. Sent via the existing best-channel cascade
 * (see `notification-service.ts`) so the patient gets it on whatever
 * channel they were reachable on at deletion time.
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
  input: BuildAccountDeletionExplainerDmInput,
): string {
  const citation = input.citation?.trim();
  if (!citation) {
    throw new Error(
      'buildAccountDeletionExplainerDm: citation is required (pass the DPDP / GDPR citation string — empty means an upstream wiring bug).',
    );
  }
  if (!(input.finalizedAt instanceof Date) || Number.isNaN(input.finalizedAt.getTime())) {
    throw new Error(
      'buildAccountDeletionExplainerDm: finalizedAt must be a valid Date (caller passed an invalid value).',
    );
  }
  const finalizedDate = input.finalizedAt.toISOString().slice(0, 10);
  return [
    'Your account is closed.',
    '',
    `We've removed your access to your recordings and chats as of ${finalizedDate}.`,
    `Your medical records are retained per ${citation} and are not deleted — this is a legal requirement for clinical records.`,
    '',
    'Your doctor still has access to those records for clinical follow-up if needed. ' +
      "You will not receive further messages from us unless your doctor's clinic reaches out about your prior care.",
  ].join('\n');
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
  input: BuildRecordingReplayedNotificationDmInput,
): string {
  const dateLabel = input.consultDateLabel?.trim();
  if (!dateLabel) {
    throw new Error(
      'buildRecordingReplayedNotificationDm: consultDateLabel is required ' +
        '(notifyPatientOfDoctorReplay computes this from session.actual_ended_at — ' +
        'empty here means an upstream wiring bug or a session row missing actual_ended_at).',
    );
  }
  const practice = input.practiceName?.trim() || "your doctor's clinic";
  const artifactWord: RecordingReplayedArtifactType = input.artifactType;

  // Plan 08 Task 44: video carries a 🎥 prefix so it's scannable in
  // the patient's DM feed. Audio + transcript stay plain text (no
  // emoji) to match the v1 baseline pinned in the snapshot tests.
  const leadPrefix = artifactWord === 'video' ? '🎥 ' : '';

  return [
    `${leadPrefix}Your doctor at ${practice} reviewed the ${artifactWord} of your consult on ${dateLabel}.`,
    '',
    'This is a normal part of care (doctors often revisit consults to refine their plan).',
    'Every access is audited, and you can ask support for the access log anytime.',
  ].join('\n');
}

// ============================================================================
// Plan 07 · Task 31 — post-consult chat-history DM
// ============================================================================

export interface BuildPostConsultChatLinkDmInput {
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
export function buildPostConsultChatLinkDm(
  input: BuildPostConsultChatLinkDmInput,
): string {
  const joinUrl = input.joinUrl?.trim();
  if (!joinUrl) {
    throw new Error(
      'buildPostConsultChatLinkDm: joinUrl is required ' +
        '(sendPostConsultChatHistoryDm composes this from APP_BASE_URL + sessionId + HMAC token — ' +
        'empty here means an upstream wiring bug).',
    );
  }
  const dateLabel = input.consultDateLabel?.trim();
  if (!dateLabel) {
    throw new Error(
      'buildPostConsultChatLinkDm: consultDateLabel is required ' +
        '(sendPostConsultChatHistoryDm derives this from session.actual_ended_at — ' +
        'empty here means the session row is missing actual_ended_at).',
    );
  }
  const practice = input.practiceName?.trim() || "your doctor's practice";

  return [
    `Your consultation with ${practice} on ${dateLabel} is complete.`,
    '',
    'View the full conversation (chat, attachments, and system notes) any time:',
    joinUrl,
    '',
    'Available for 90 days. After that, contact support to re-open the link.',
  ].join('\n');
}

// ============================================================================
// Plan 07 · Task 32 — transcript-downloaded DM
// ============================================================================

export interface BuildTranscriptDownloadedNotificationDmInput {
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
  input: BuildTranscriptDownloadedNotificationDmInput,
): string {
  const dateLabel = input.consultDateLabel?.trim();
  if (!dateLabel) {
    throw new Error(
      'buildTranscriptDownloadedNotificationDm: consultDateLabel is required ' +
        '(notifyPatientOfDoctorReplay derives this from session.actual_ended_at — ' +
        'empty here signals an upstream wiring bug or a session row missing actual_ended_at).',
    );
  }
  const practice = input.practiceName?.trim() || "your doctor's clinic";

  return [
    `Your doctor at ${practice} downloaded the written transcript of your consult on ${dateLabel}.`,
    '',
    'This is a normal part of care (doctors often review transcripts to confirm the plan).',
    'Every access is audited, and you can ask support for the access log anytime.',
  ].join('\n');
}


// ============================================================================
// Plan 09 · Task 49 — mid-consult refund status copy
// ============================================================================

export interface BuildRefundProcessingDmInput {
  /** Refund amount in rupees (paise ÷ 100). Displayed as `₹{amountInr}`. */
  amountInr: number;
  /** Expected settlement window in business days. Razorpay's `speed: 'normal'` ≈ 3. */
  expectedDays?: number;
}

/**
 * Decision 11 resilience copy. Written by the refund retry worker
 * on first attempt (regardless of outcome) so the patient sees
 * confirmation even if Razorpay's first try failed.
 */
export function buildRefundProcessingDm(input: BuildRefundProcessingDmInput): string {
  const amount = Math.max(0, Math.round(input.amountInr));
  const days = input.expectedDays && input.expectedDays > 0 ? input.expectedDays : 3;
  return `Your refund of ₹${amount} is processing and should reach you within ${days} business days.`;
}

export interface BuildRefundFailedDmInput {
  amountInr: number;
  /** Optional support URL / handle surface. Defaults to a generic "Contact support" line. */
  supportUrl?: string;
}

/**
 * Emitted by the refund retry worker once it sentinels a row as
 * permanently stuck (after 7 failed attempts / ≥ 24h). Ops
 * simultaneously gets an `admin_payment_alerts` row; the patient
 * gets this visible message.
 */
export function buildRefundFailedDm(input: BuildRefundFailedDmInput): string {
  const amount = Math.max(0, Math.round(input.amountInr));
  const supportBit = input.supportUrl?.trim()
    ? `Contact support at ${input.supportUrl.trim()} if you don't see a refund within 3 business days.`
    : `Contact support if you don't see a refund within 3 business days.`;
  return (
    `We couldn't automatically refund ₹${amount} yet. Our team is reviewing the transaction. ` +
    supportBit
  );
}

