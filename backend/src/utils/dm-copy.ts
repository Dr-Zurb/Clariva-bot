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

export interface IntakeRequestInput {
  /**
   * Which flavor of ask this is.
   *   - `'initial'`              — first ask (self or relation booking). Renders
   *                                the greeting, the bulleted list, and an
   *                                example block so the patient can copy the
   *                                layout.
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
 *   - `'initial'` variant appends an `Example:` block to help the patient
 *     shape their one-message paste. Retries and `'still-need'` skip the
 *     example (they already have conversational context).
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
    } else {
      lines.push(`- **${INTAKE_FIELD_LABELS[f]}**`);
    }
  }

  if (input.variant === 'initial') {
    lines.push('', 'Example:');
    lines.push('> Abhishek Sahil');
    lines.push('> 35, male');
    lines.push('> 8264602737');
    lines.push('> headache + diabetes follow-up');
  } else if (input.variant === 'still-need') {
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
