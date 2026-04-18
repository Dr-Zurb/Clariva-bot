/**
 * Golden-snapshot harness for `backend/src/utils/dm-copy.ts`.
 *
 * Every patient-facing DM string produced by a `dm-copy` builder gets one or
 * more entries here. Any intentional copy edit is committed alongside the
 * refreshed `.snap` file — unintentional drift surfaces as a failing test in
 * review.
 *
 * Plan: docs/Development/Daily-plans/April 2026/18-04-2026/plan-patient-dm-copy-polish.md
 * Task: docs/Development/Daily-plans/April 2026/18-04-2026/Tasks/task-01-dm-copy-helper-and-golden-snapshots.md
 *
 * To refresh snapshots after an intentional copy change:
 *     npx jest tests/unit/utils/dm-copy.snap.test.ts -u
 */

import { describe, expect, it } from '@jest/globals';

import {
  appointmentConsultationTypeToLabel,
  buildAbandonedBookingReminderMessage,
  buildCancelChoiceListMessage,
  buildConfirmDetailsMessage,
  buildConsentOptionalExtrasMessage,
  buildIntakeRequestMessage,
  buildNonTextAckMessage,
  buildPaymentConfirmationMessage,
  buildStaffReviewResolvedBookingMessage,
  formatDateWithMiddot,
} from '../../../src/utils/dm-copy';
import {
  resolveClarificationNumericReply,
  resolveComplaintClarificationMessage,
} from '../../../src/utils/complaint-clarification';
import { formatClinicalReasonAskMoreAfterDeflection } from '../../../src/utils/reason-first-triage';
import type { CollectedPatientData } from '../../../src/utils/validation';

interface SnapCase {
  readonly name: string;
  readonly render: () => string;
}

/**
 * Placeholder patient values used purely for snapshot fixtures. Per
 * `TESTING.md` these are not real PHI — they are deterministic synthetic data
 * chosen to exercise each layout branch.
 */
const FULL_FIXTURE: CollectedPatientData = {
  name: 'Abhishek Sahil',
  age: 35,
  gender: 'male',
  phone: '8264602737',
  reason_for_visit: 'headache',
  email: 'abhishek@example.com',
};

const LONG_REASON =
  'persistent throbbing headache for the last three days, worse in the mornings, plus intermittent dizziness when standing up quickly — also due for a diabetes follow-up';

const cases: readonly SnapCase[] = [
  {
    name: 'nonTextAck / default',
    render: () => buildNonTextAckMessage(),
  },
  {
    name: 'confirm-details / all fields',
    render: () => buildConfirmDetailsMessage(FULL_FIXTURE),
  },
  {
    name: 'confirm-details / long reason stays on one line',
    render: () => buildConfirmDetailsMessage({ ...FULL_FIXTURE, reason_for_visit: LONG_REASON }),
  },
  {
    name: 'confirm-details / missing email',
    render: () => buildConfirmDetailsMessage({ ...FULL_FIXTURE, email: undefined }),
  },
  {
    name: 'confirm-details / missing reason and email',
    render: () =>
      buildConfirmDetailsMessage({
        ...FULL_FIXTURE,
        reason_for_visit: undefined,
        email: undefined,
      }),
  },
  {
    name: 'confirm-details / gender mixed case normalizes to Title Case',
    render: () => buildConfirmDetailsMessage({ ...FULL_FIXTURE, gender: 'MALE' }),
  },
  {
    name: 'confirm-details / female gender (lowercase input)',
    render: () => buildConfirmDetailsMessage({ ...FULL_FIXTURE, gender: 'female' }),
  },
  {
    name: 'confirm-details / whitespace-only reason becomes Not provided',
    render: () => buildConfirmDetailsMessage({ ...FULL_FIXTURE, reason_for_visit: '   ' }),
  },
  // --- Intake request (Task 03) -------------------------------------------
  {
    name: "intake / initial / no relation / all fields (self-booking, Dr Zurb's Clinic)",
    render: () =>
      buildIntakeRequestMessage({
        variant: 'initial',
        practiceName: "Dr Zurb's Clinic",
        missing: ['name', 'age', 'gender', 'phone', 'reason_for_visit'],
      }),
  },
  {
    name: 'intake / initial / no relation / alreadyHaveReason (reason row suppressed)',
    render: () =>
      buildIntakeRequestMessage({
        variant: 'initial',
        practiceName: "Dr Zurb's Clinic",
        alreadyHaveReason: true,
        missing: ['name', 'age', 'gender', 'phone', 'reason_for_visit'],
      }),
  },
  {
    name: 'intake / initial / relation: mother / all fields (no gender, for-other)',
    render: () =>
      buildIntakeRequestMessage({
        variant: 'initial',
        forRelation: 'mother',
        missing: ['name', 'age', 'phone', 'reason_for_visit'],
      }),
  },
  {
    name: 'intake / initial / relation: son / alreadyHaveReason',
    render: () =>
      buildIntakeRequestMessage({
        variant: 'initial',
        forRelation: 'son',
        alreadyHaveReason: true,
        missing: ['name', 'age', 'phone', 'reason_for_visit'],
      }),
  },
  {
    name: 'intake / initial / custom intro (two-person self+other framing)',
    render: () =>
      buildIntakeRequestMessage({
        variant: 'initial',
        forRelation: 'mother',
        missing: ['name', 'age', 'phone', 'reason_for_visit'],
        intro:
          "I'll help you book for you and your **mother**. Let's take them one at a time — your **mother** first, then you. Please share their details:",
      }),
  },
  {
    name: 'intake / still-need / missing: age, reason_for_visit',
    render: () =>
      buildIntakeRequestMessage({
        variant: 'still-need',
        missing: ['age', 'reason_for_visit'],
        includeEmail: false,
      }),
  },
  {
    name: 'intake / still-need / missing: email only (all required captured)',
    render: () =>
      buildIntakeRequestMessage({
        variant: 'still-need',
        missing: ['email'],
      }),
  },
  {
    name: 'intake / still-need / missing: all five required (includeEmail=false)',
    render: () =>
      buildIntakeRequestMessage({
        variant: 'still-need',
        missing: ['name', 'age', 'gender', 'phone', 'reason_for_visit'],
        includeEmail: false,
      }),
  },
  {
    name: 'intake / retry-not-received / no relation',
    render: () =>
      buildIntakeRequestMessage({
        variant: 'retry-not-received',
        missing: ['name', 'age', 'phone', 'reason_for_visit'],
      }),
  },
  {
    name: 'intake / retry-not-received / relation: father',
    render: () =>
      buildIntakeRequestMessage({
        variant: 'retry-not-received',
        forRelation: 'father',
        missing: ['name', 'age', 'phone', 'reason_for_visit'],
      }),
  },
  {
    name: 'intake / initial / empty practiceName falls back to "the clinic"',
    render: () =>
      buildIntakeRequestMessage({
        variant: 'initial',
        practiceName: '   ',
        missing: ['name', 'age', 'gender', 'phone', 'reason_for_visit'],
      }),
  },
  {
    name: 'intake / initial / missing input order is normalized to canonical order',
    render: () =>
      buildIntakeRequestMessage({
        variant: 'initial',
        practiceName: "Dr Zurb's Clinic",
        missing: ['phone', 'reason_for_visit', 'age', 'name', 'gender'],
      }),
  },
  // --- Consent / optional-extras (Task 04) --------------------------------
  {
    name: 'consent / self / happy path (name + bolded phone)',
    render: () =>
      buildConsentOptionalExtrasMessage({
        patientName: 'Abhishek',
        phoneDisplay: '**8264602737**',
        bookingForSomeoneElse: false,
      }),
  },
  {
    name: 'consent / self / missing patientName (renders plain "Thanks.")',
    render: () =>
      buildConsentOptionalExtrasMessage({
        phoneDisplay: '**8264602737**',
        bookingForSomeoneElse: false,
      }),
  },
  {
    name: 'consent / self / "there" sentinel treated as missing name',
    render: () =>
      buildConsentOptionalExtrasMessage({
        patientName: 'there',
        phoneDisplay: '**8264602737**',
        bookingForSomeoneElse: false,
      }),
  },
  {
    name: 'consent / self / missing phone falls back to "your number"',
    render: () =>
      buildConsentOptionalExtrasMessage({
        patientName: 'Abhishek',
        phoneDisplay: 'your number',
        bookingForSomeoneElse: false,
      }),
  },
  {
    name: 'consent / someone-else / happy path',
    render: () =>
      buildConsentOptionalExtrasMessage({
        phoneDisplay: '**8264602737**',
        bookingForSomeoneElse: true,
        bookingForName: 'Priya',
      }),
  },
  {
    name: 'consent / someone-else / phone fallback + relation-booking name',
    render: () =>
      buildConsentOptionalExtrasMessage({
        phoneDisplay: 'your number',
        bookingForSomeoneElse: true,
        bookingForName: 'Priya Sharma',
      }),
  },
  // --- Payment confirmation (Task 05) -------------------------------------
  {
    name: 'payment / with MRN (happy path, year-stripped middot date)',
    render: () =>
      buildPaymentConfirmationMessage({
        appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
        patientMrn: 'CLR-00123',
      }),
  },
  {
    name: 'payment / without MRN (shorter variant)',
    render: () =>
      buildPaymentConfirmationMessage({
        appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
      }),
  },
  {
    name: 'payment / MRN has surrounding whitespace (trims before rendering)',
    render: () =>
      buildPaymentConfirmationMessage({
        appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
        patientMrn: '   CLR-00123   ',
      }),
  },
  // --- Abandoned-booking reminder (Task 06) -------------------------------
  {
    name: 'abandoned-reminder / default (URL on its own line)',
    render: () =>
      buildAbandonedBookingReminderMessage({
        bookingUrl: 'https://book.clariva.app/pick-slot?token=abc123',
      }),
  },
  // --- Cancel-appointment choice list (Task 07) ---------------------------
  {
    name: 'cancel-list / 1 item / video — confirm-by-Yes shape',
    render: () =>
      buildCancelChoiceListMessage({
        items: [
          { dateDisplay: 'Tue, Apr 29 · 4:30 PM', modalityLabel: 'Video consult' },
        ],
      }),
  },
  {
    name: 'cancel-list / 2 items / mixed modalities — "Reply 1 or 2"',
    render: () =>
      buildCancelChoiceListMessage({
        items: [
          { dateDisplay: 'Tue, Apr 29 · 4:30 PM', modalityLabel: 'Video consult' },
          { dateDisplay: 'Fri, May 2 · 10:00 AM', modalityLabel: 'In-person' },
        ],
      }),
  },
  {
    name: 'cancel-list / 3 items / all video — "Reply a number from 1 to 3"',
    render: () =>
      buildCancelChoiceListMessage({
        items: [
          { dateDisplay: 'Tue, Apr 29 · 4:30 PM', modalityLabel: 'Video consult' },
          { dateDisplay: 'Fri, May 2 · 10:00 AM', modalityLabel: 'Video consult' },
          { dateDisplay: 'Mon, May 5 · 2:00 PM', modalityLabel: 'Video consult' },
        ],
      }),
  },
  {
    name: 'cancel-list / 5 items / mixed + some unknown modality (suffix omitted)',
    render: () =>
      buildCancelChoiceListMessage({
        items: [
          { dateDisplay: 'Tue, Apr 29 · 4:30 PM', modalityLabel: 'Video consult' },
          { dateDisplay: 'Fri, May 2 · 10:00 AM', modalityLabel: 'In-person' },
          { dateDisplay: 'Mon, May 5 · 2:00 PM', modalityLabel: 'Text consult' },
          { dateDisplay: 'Thu, May 8 · 11:15 AM' },
          { dateDisplay: 'Mon, May 12 · 9:00 AM', modalityLabel: '   ' },
        ],
      }),
  },
  // --- Staff-review resolved → continue booking (Task 08) -----------------
  {
    name: 'staff-review-resolved / confirmed / practice + label present',
    render: () =>
      buildStaffReviewResolvedBookingMessage({
        practiceName: "Dr Zurb's Clinic",
        visitLabel: 'General consultation',
        bookingUrl: 'https://book.clariva.app/pick-slot?token=abc123',
        kind: 'confirmed',
      }),
  },
  {
    name: 'staff-review-resolved / reassigned / practice + label present',
    render: () =>
      buildStaffReviewResolvedBookingMessage({
        practiceName: "Dr Zurb's Clinic",
        visitLabel: 'Cardiology consultation',
        bookingUrl: 'https://book.clariva.app/pick-slot?token=abc123',
        kind: 'reassigned',
      }),
  },
  {
    name: 'staff-review-resolved / learning_policy_autobook / practice + label present',
    render: () =>
      buildStaffReviewResolvedBookingMessage({
        practiceName: "Dr Zurb's Clinic",
        visitLabel: 'General consultation',
        bookingUrl: 'https://book.clariva.app/pick-slot?token=abc123',
        kind: 'learning_policy_autobook',
      }),
  },
  {
    name: 'staff-review-resolved / confirmed / practice missing → "the clinic"',
    render: () =>
      buildStaffReviewResolvedBookingMessage({
        visitLabel: 'General consultation',
        bookingUrl: 'https://book.clariva.app/pick-slot?token=abc123',
        kind: 'confirmed',
      }),
  },
  {
    name: 'staff-review-resolved / confirmed / visit label empty → "your visit"',
    render: () =>
      buildStaffReviewResolvedBookingMessage({
        practiceName: "Dr Zurb's Clinic",
        visitLabel: '',
        bookingUrl: 'https://book.clariva.app/pick-slot?token=abc123',
        kind: 'confirmed',
      }),
  },
  // --- Mixed-complaint clarification numbered list (Task 09) ---------------
  {
    name: 'clarification / en / 2 concerns',
    render: () =>
      resolveComplaintClarificationMessage('headache and diabetes follow-up', [
        'Headache',
        'Diabetes follow-up',
      ]),
  },
  {
    name: 'clarification / en / 3 concerns',
    render: () =>
      resolveComplaintClarificationMessage('headache, diabetes follow-up, and knee pain', [
        'Headache',
        'Diabetes follow-up',
        'Knee pain',
      ]),
  },
  {
    name: 'clarification / en / 5 concerns',
    render: () =>
      resolveComplaintClarificationMessage('a lot of things today', [
        'Headache',
        'Diabetes follow-up',
        'Knee pain',
        'Skin rash',
        'Back pain',
      ]),
  },
  {
    name: 'clarification / en / 6 concerns → falls back to open-ended',
    render: () =>
      resolveComplaintClarificationMessage('loads of things today', [
        'Headache',
        'Diabetes follow-up',
        'Knee pain',
        'Skin rash',
        'Back pain',
        'Cough',
      ]),
  },
  {
    name: 'clarification / en / 1 concern → falls back to open-ended',
    render: () => resolveComplaintClarificationMessage('I have a headache', ['Headache']),
  },
  {
    name: 'clarification / hi Devanagari / 3 concerns (English labels under Hindi intro + CTA)',
    render: () =>
      resolveComplaintClarificationMessage('मुझे सिरदर्द, मधुमेह और घुटने का दर्द है', [
        'Headache',
        'Diabetes follow-up',
        'Knee pain',
      ]),
  },
  {
    name: 'clarification / pa Gurmukhi / 3 concerns (English labels under Punjabi intro + CTA)',
    render: () =>
      resolveComplaintClarificationMessage('ਮੈਨੂੰ ਸਿਰ ਦਰਦ, ਸ਼ੂਗਰ ਅਤੇ ਗੋਡੇ ਦਾ ਦਰਦ ਹੈ', [
        'Headache',
        'Diabetes follow-up',
        'Knee pain',
      ]),
  },
  {
    name: 'clarification / latin-hi / 3 concerns (Hinglish intro + CTA)',
    render: () =>
      resolveComplaintClarificationMessage('mujhe sir dard, diabetes aur knee pain hai', [
        'Headache',
        'Diabetes follow-up',
        'Knee pain',
      ]),
  },
  {
    name: 'clarification / latin-pa / 3 concerns (Roman Punjabi intro + CTA)',
    render: () =>
      resolveComplaintClarificationMessage('menu sir dard, sugar te gode da dard hai', [
        'Headache',
        'Diabetes follow-up',
        'Knee pain',
      ]),
  },
  // Task 10 — reason-first triage ask_more (post clinical deflection), 2-paragraph split.
  // detectSafetyMessageLocale collapses Roman-Hi/Pa into hi/pa leaves, so 3 sub-branches × 3 locales.
  {
    name: 'triage / en / blank snippet',
    render: () => formatClinicalReasonAskMoreAfterDeflection('I need some help', ''),
  },
  {
    name: 'triage / en / single-line snippet',
    render: () => formatClinicalReasonAskMoreAfterDeflection('can you help me', 'Headache for 3 days'),
  },
  {
    name: 'triage / en / multi-line numbered snippet',
    render: () =>
      formatClinicalReasonAskMoreAfterDeflection(
        'thanks doc',
        '1) Headache for 3 days\n2) Diabetes follow-up'
      ),
  },
  {
    name: 'triage / hi / blank snippet',
    render: () => formatClinicalReasonAskMoreAfterDeflection('mujhe madad chahiye', ''),
  },
  {
    name: 'triage / hi / single-line snippet',
    render: () =>
      formatClinicalReasonAskMoreAfterDeflection('mujhe madad chahiye', 'Sir mein dard hai'),
  },
  {
    name: 'triage / hi / multi-line numbered snippet',
    render: () =>
      formatClinicalReasonAskMoreAfterDeflection(
        'mujhe madad chahiye',
        '1) Sir mein dard\n2) Sugar follow-up'
      ),
  },
  {
    name: 'triage / pa / blank snippet',
    render: () => formatClinicalReasonAskMoreAfterDeflection('menu madad chahidi', ''),
  },
  {
    name: 'triage / pa / single-line snippet',
    render: () =>
      formatClinicalReasonAskMoreAfterDeflection('menu madad chahidi', 'Sir vich dard'),
  },
  {
    name: 'triage / pa / multi-line numbered snippet',
    render: () =>
      formatClinicalReasonAskMoreAfterDeflection(
        'menu madad chahidi',
        '1) Sir vich dard\n2) Sugar follow-up'
      ),
  },
];

describe('dm-copy snapshots', () => {
  for (const c of cases) {
    it(c.name, () => {
      expect(c.render()).toMatchSnapshot();
    });
  }
});

describe('buildIntakeRequestMessage invariants', () => {
  it('throws when missing[] is explicitly empty (unreachable handler state)', () => {
    expect(() =>
      buildIntakeRequestMessage({
        variant: 'still-need',
        missing: [],
      }),
    ).toThrow(/missing\[\] must be non-empty/);
  });

  it('clamps a 64-char forRelation to 32 chars and lowercases it', () => {
    const long = 'MOTHERINLAWWHOISVISITINGFROMOUTOFTOWNFORNEXTTHREEWEEKSSTARTINGMONDAY';
    const out = buildIntakeRequestMessage({
      variant: 'initial',
      forRelation: long,
      missing: ['name', 'age', 'phone', 'reason_for_visit'],
    });
    const expected = long.slice(0, 32).toLowerCase();
    expect(out).toContain(`**${expected}**`);
    expect(out).not.toContain(long); // full string never leaks through
  });

  it('initial variant has no bottom Example block; reason line carries inline headache/fever hint', () => {
    const out = buildIntakeRequestMessage({
      variant: 'initial',
      practiceName: "Dr Zurb's Clinic",
    });
    expect(out).not.toMatch(/\nExample:\n/);
    expect(out).not.toMatch(/^> /m);
    expect(out).toContain('- **Reason for visit** — e.g. **headache**, **fever**');
  });

  it('still-need variant keeps reason inline hint when reason is missing', () => {
    const out = buildIntakeRequestMessage({
      variant: 'still-need',
      missing: ['age', 'reason_for_visit'],
    });
    expect(out).toContain('- **Reason for visit** — e.g. **headache**, **fever**');
    expect(out).not.toMatch(/\nExample:\n/);
  });
});

describe('buildConsentOptionalExtrasMessage invariants', () => {
  it('throws when bookingForSomeoneElse is true and bookingForName is missing', () => {
    expect(() =>
      buildConsentOptionalExtrasMessage({
        phoneDisplay: '**8264602737**',
        bookingForSomeoneElse: true,
      }),
    ).toThrow(/bookingForName is required/);
  });

  it('throws when bookingForSomeoneElse is true and bookingForName is whitespace', () => {
    expect(() =>
      buildConsentOptionalExtrasMessage({
        phoneDisplay: '**8264602737**',
        bookingForSomeoneElse: true,
        bookingForName: '   ',
      }),
    ).toThrow(/bookingForName is required/);
  });

  it('always ends with a bolded "Reply **Yes**" CTA on its own line', () => {
    const selfOut = buildConsentOptionalExtrasMessage({
      patientName: 'Abhishek',
      phoneDisplay: '**8264602737**',
      bookingForSomeoneElse: false,
    });
    const otherOut = buildConsentOptionalExtrasMessage({
      phoneDisplay: '**8264602737**',
      bookingForSomeoneElse: true,
      bookingForName: 'Priya',
    });
    const selfLines = selfOut.split('\n');
    const otherLines = otherOut.split('\n');
    expect(selfLines[selfLines.length - 1]).toMatch(/^Reply \*\*Yes\*\* /);
    expect(otherLines[otherLines.length - 1]).toMatch(/^Reply \*\*Yes\*\* /);
  });

  it('renders exactly three paragraphs (two blank-line separators)', () => {
    const out = buildConsentOptionalExtrasMessage({
      patientName: 'Abhishek',
      phoneDisplay: '**8264602737**',
      bookingForSomeoneElse: false,
    });
    const paragraphs = out.split('\n\n');
    expect(paragraphs).toHaveLength(3);
  });
});

describe('formatDateWithMiddot', () => {
  it('drops the year and rewrites the date/time comma as a middle dot', () => {
    expect(formatDateWithMiddot('Tue, Apr 29, 2026, 4:30 PM')).toBe('Tue, Apr 29 · 4:30 PM');
  });

  it('handles inputs without a year segment', () => {
    expect(formatDateWithMiddot('Tue, Apr 29, 4:30 PM')).toBe('Tue, Apr 29 · 4:30 PM');
  });

  it('handles single-digit day + hour', () => {
    expect(formatDateWithMiddot('Mon, May 5, 2026, 9:05 AM')).toBe('Mon, May 5 · 9:05 AM');
  });

  it('returns the input unchanged when the shape is unexpected', () => {
    expect(formatDateWithMiddot('2026-04-29T16:30:00Z')).toBe('2026-04-29T16:30:00Z');
    expect(formatDateWithMiddot('Tue, Apr 29, 2026 at 4:30 PM')).toBe(
      'Tue, Apr 29, 2026 at 4:30 PM',
    );
    expect(formatDateWithMiddot('')).toBe('');
  });
});

describe('appointmentConsultationTypeToLabel', () => {
  it('maps known enum values to their patient-facing labels', () => {
    expect(appointmentConsultationTypeToLabel('text')).toBe('Text consult');
    expect(appointmentConsultationTypeToLabel('voice')).toBe('Voice consult');
    expect(appointmentConsultationTypeToLabel('video')).toBe('Video consult');
    expect(appointmentConsultationTypeToLabel('in_clinic')).toBe('In-person');
  });

  it('normalizes case and whitespace', () => {
    expect(appointmentConsultationTypeToLabel('  VIDEO  ')).toBe('Video consult');
    expect(appointmentConsultationTypeToLabel('In_Clinic')).toBe('In-person');
  });

  it('returns undefined for unknown / null / empty so the caller can omit the suffix', () => {
    expect(appointmentConsultationTypeToLabel(null)).toBeUndefined();
    expect(appointmentConsultationTypeToLabel(undefined)).toBeUndefined();
    expect(appointmentConsultationTypeToLabel('')).toBeUndefined();
    expect(appointmentConsultationTypeToLabel('   ')).toBeUndefined();
    expect(appointmentConsultationTypeToLabel('in_person')).toBeUndefined();
    expect(appointmentConsultationTypeToLabel('zoom')).toBeUndefined();
  });
});

describe('buildCancelChoiceListMessage invariants', () => {
  it('throws when items[] is empty (unreachable caller state)', () => {
    expect(() => buildCancelChoiceListMessage({ items: [] })).toThrow(/must be non-empty/);
  });

  it('omits the " — {modality}" suffix when modalityLabel is undefined, empty, or whitespace', () => {
    const undefMod = buildCancelChoiceListMessage({
      items: [{ dateDisplay: 'Tue, Apr 29 · 4:30 PM' }],
    });
    const emptyMod = buildCancelChoiceListMessage({
      items: [{ dateDisplay: 'Tue, Apr 29 · 4:30 PM', modalityLabel: '' }],
    });
    const wsMod = buildCancelChoiceListMessage({
      items: [{ dateDisplay: 'Tue, Apr 29 · 4:30 PM', modalityLabel: '   ' }],
    });
    expect(undefMod).not.toContain(' — ');
    expect(emptyMod).not.toContain(' — ');
    expect(wsMod).not.toContain(' — ');
    expect(undefMod).toBe(emptyMod);
    expect(undefMod).toBe(wsMod);
  });

  it('uses the adaptive trailer: 2 items → "Reply **1** or **2**."', () => {
    const out = buildCancelChoiceListMessage({
      items: [
        { dateDisplay: 'Tue, Apr 29 · 4:30 PM', modalityLabel: 'Video consult' },
        { dateDisplay: 'Fri, May 2 · 10:00 AM', modalityLabel: 'In-person' },
      ],
    });
    expect(out).toMatch(/Reply \*\*1\*\* or \*\*2\*\*\.$/);
  });

  it('uses the adaptive trailer: N ≥ 3 → "Reply a number from **1** to **N**."', () => {
    const items: { dateDisplay: string; modalityLabel?: string }[] = [
      { dateDisplay: 'Tue, Apr 29 · 4:30 PM', modalityLabel: 'Video consult' },
      { dateDisplay: 'Fri, May 2 · 10:00 AM', modalityLabel: 'In-person' },
      { dateDisplay: 'Mon, May 5 · 2:00 PM', modalityLabel: 'Video consult' },
      { dateDisplay: 'Thu, May 8 · 11:15 AM', modalityLabel: 'Text consult' },
    ];
    const out = buildCancelChoiceListMessage({ items });
    expect(out).toMatch(/Reply a number from \*\*1\*\* to \*\*4\*\*\.$/);
  });

  it('single-item branch does not include a numbered list or trailer number', () => {
    const out = buildCancelChoiceListMessage({
      items: [{ dateDisplay: 'Tue, Apr 29 · 4:30 PM', modalityLabel: 'Video consult' }],
    });
    expect(out).toContain('You have one upcoming appointment:');
    expect(out).toContain('Reply **Yes** to cancel it');
    expect(out).not.toContain('**1.**');
    expect(out).not.toMatch(/Reply \*\*1\*\* or/);
    expect(out).not.toMatch(/Reply a number from/);
  });

  it('bolds the choice key on each line (**N.**) and preserves input order', () => {
    const items: { dateDisplay: string; modalityLabel?: string }[] = [
      { dateDisplay: 'Tue, Apr 29 · 4:30 PM' },
      { dateDisplay: 'Fri, May 2 · 10:00 AM' },
      { dateDisplay: 'Mon, May 5 · 2:00 PM' },
    ];
    const out = buildCancelChoiceListMessage({ items });
    const lines = out.split('\n');
    const one = lines.findIndex((l) => l.startsWith('**1.** '));
    const two = lines.findIndex((l) => l.startsWith('**2.** '));
    const three = lines.findIndex((l) => l.startsWith('**3.** '));
    expect(one).toBeGreaterThan(-1);
    expect(two).toBe(one + 1);
    expect(three).toBe(two + 1);
    expect(lines[one]).toContain('Tue, Apr 29 · 4:30 PM');
    expect(lines[two]).toContain('Fri, May 2 · 10:00 AM');
    expect(lines[three]).toContain('Mon, May 5 · 2:00 PM');
  });
});

describe('buildAbandonedBookingReminderMessage invariants', () => {
  it('throws when bookingUrl is empty', () => {
    expect(() => buildAbandonedBookingReminderMessage({ bookingUrl: '' })).toThrow(
      /bookingUrl is required/,
    );
  });

  it('throws when bookingUrl is whitespace-only', () => {
    expect(() => buildAbandonedBookingReminderMessage({ bookingUrl: '   ' })).toThrow(
      /bookingUrl is required/,
    );
  });

  it('renders the URL on its own line with blank lines above and below', () => {
    const url = 'https://book.clariva.app/pick-slot?token=abc123';
    const out = buildAbandonedBookingReminderMessage({ bookingUrl: url });
    const lines = out.split('\n');
    const urlIdx = lines.indexOf(url);
    expect(urlIdx).toBeGreaterThan(0);
    expect(lines[urlIdx - 1]).toBe('Pick a time here:');
    expect(lines[urlIdx + 1]).toBe('');
  });

  it('trims the URL before rendering', () => {
    const out = buildAbandonedBookingReminderMessage({
      bookingUrl: '   https://book.clariva.app/pick-slot?token=abc123   ',
    });
    expect(out).toContain('\nhttps://book.clariva.app/pick-slot?token=abc123\n');
    expect(out).not.toContain('   https://');
  });
});

describe('buildPaymentConfirmationMessage invariants', () => {
  it('omits the MRN paragraph when patientMrn is missing, empty, or whitespace', () => {
    const withMissing = buildPaymentConfirmationMessage({
      appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
    });
    const withEmpty = buildPaymentConfirmationMessage({
      appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
      patientMrn: '',
    });
    const withWhitespace = buildPaymentConfirmationMessage({
      appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
      patientMrn: '   ',
    });
    expect(withMissing).not.toContain('Patient ID');
    expect(withEmpty).not.toContain('Patient ID');
    expect(withWhitespace).not.toContain('Patient ID');
    expect(withMissing).toBe(withEmpty);
    expect(withMissing).toBe(withWhitespace);
  });

  it('ends with the reminder-and-reply closing paragraph', () => {
    const out = buildPaymentConfirmationMessage({
      appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
      patientMrn: 'CLR-00123',
    });
    const paragraphs = out.split('\n\n');
    expect(paragraphs[paragraphs.length - 1]).toBe(
      "We'll send a reminder before your visit. Reply here anytime if you need to reschedule or have questions.",
    );
  });

  it('does not include ✅ or 🆔 outside the designated paragraphs', () => {
    const out = buildPaymentConfirmationMessage({
      appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
      patientMrn: 'CLR-00123',
    });
    expect((out.match(/✅/g) ?? []).length).toBe(1);
    expect((out.match(/🆔/g) ?? []).length).toBe(1);
  });
});

describe('buildStaffReviewResolvedBookingMessage invariants', () => {
  const BASE_URL = 'https://book.clariva.app/pick-slot?token=abc123';

  it('throws when bookingUrl is empty or whitespace', () => {
    expect(() =>
      buildStaffReviewResolvedBookingMessage({
        practiceName: "Dr Zurb's Clinic",
        visitLabel: 'General consultation',
        bookingUrl: '',
        kind: 'confirmed',
      }),
    ).toThrow(/bookingUrl is required/);
    expect(() =>
      buildStaffReviewResolvedBookingMessage({
        practiceName: "Dr Zurb's Clinic",
        visitLabel: 'General consultation',
        bookingUrl: '   ',
        kind: 'confirmed',
      }),
    ).toThrow(/bookingUrl is required/);
  });

  it('renders the URL on its own line, with the labeled CTA immediately above', () => {
    for (const kind of ['confirmed', 'reassigned', 'learning_policy_autobook'] as const) {
      const out = buildStaffReviewResolvedBookingMessage({
        practiceName: "Dr Zurb's Clinic",
        visitLabel: 'General consultation',
        bookingUrl: BASE_URL,
        kind,
      });
      const lines = out.split('\n');
      const urlIdx = lines.indexOf(BASE_URL);
      expect(urlIdx).toBeGreaterThan(0);
      expect(lines[urlIdx - 1]).toBe('Pick a time and complete your booking here:');
      expect(lines[urlIdx + 1]).toBe('');
    }
  });

  it('falls back to "the clinic" when practiceName is missing, empty, or whitespace', () => {
    const missing = buildStaffReviewResolvedBookingMessage({
      visitLabel: 'General consultation',
      bookingUrl: BASE_URL,
      kind: 'confirmed',
    });
    const empty = buildStaffReviewResolvedBookingMessage({
      practiceName: '',
      visitLabel: 'General consultation',
      bookingUrl: BASE_URL,
      kind: 'confirmed',
    });
    const whitespace = buildStaffReviewResolvedBookingMessage({
      practiceName: '   ',
      visitLabel: 'General consultation',
      bookingUrl: BASE_URL,
      kind: 'confirmed',
    });
    expect(missing).toContain('**the clinic**');
    expect(missing).toBe(empty);
    expect(missing).toBe(whitespace);
  });

  it('falls back to "your visit" when visitLabel is missing, empty, or whitespace', () => {
    const missing = buildStaffReviewResolvedBookingMessage({
      practiceName: "Dr Zurb's Clinic",
      visitLabel: '',
      bookingUrl: BASE_URL,
      kind: 'confirmed',
    });
    const whitespace = buildStaffReviewResolvedBookingMessage({
      practiceName: "Dr Zurb's Clinic",
      visitLabel: '   ',
      bookingUrl: BASE_URL,
      kind: 'confirmed',
    });
    expect(missing).toContain('**your visit**');
    expect(missing).toBe(whitespace);
  });

  it('each kind produces a distinct intro phrasing', () => {
    const confirmed = buildStaffReviewResolvedBookingMessage({
      practiceName: "Dr Zurb's Clinic",
      visitLabel: 'General consultation',
      bookingUrl: BASE_URL,
      kind: 'confirmed',
    });
    const reassigned = buildStaffReviewResolvedBookingMessage({
      practiceName: "Dr Zurb's Clinic",
      visitLabel: 'General consultation',
      bookingUrl: BASE_URL,
      kind: 'reassigned',
    });
    const autobook = buildStaffReviewResolvedBookingMessage({
      practiceName: "Dr Zurb's Clinic",
      visitLabel: 'General consultation',
      bookingUrl: BASE_URL,
      kind: 'learning_policy_autobook',
    });
    expect(confirmed).toContain('has confirmed your visit type');
    expect(reassigned).toContain('has updated your visit type');
    expect(autobook).toContain('has applied your saved visit-type preference');
    expect(new Set([confirmed, reassigned, autobook]).size).toBe(3);
  });

  it('closes with the "reply here in this chat" line and does not include the legacy "tap to open" phrasing', () => {
    const out = buildStaffReviewResolvedBookingMessage({
      practiceName: "Dr Zurb's Clinic",
      visitLabel: 'General consultation',
      bookingUrl: BASE_URL,
      kind: 'confirmed',
    });
    const paragraphs = out.split('\n\n');
    expect(paragraphs[paragraphs.length - 1]).toBe(
      'If something looks wrong, just reply here in this chat.',
    );
    expect(out).not.toMatch(/tap to open/i);
    expect(out).not.toMatch(/pick a time and complete booking/i);
  });
});

describe('resolveComplaintClarificationMessage invariants (Task 09)', () => {
  it('renders a blank-line-separated 3-paragraph structure (intro / list / CTA) for 2\u20135 concerns', () => {
    const out = resolveComplaintClarificationMessage('headache and diabetes', [
      'Headache',
      'Diabetes follow-up',
    ]);
    const paragraphs = out.split('\n\n');
    expect(paragraphs).toHaveLength(3);
    const listPara = paragraphs[1]!;
    expect(listPara).toMatch(/^\*\*1\.\*\* /m);
    expect(listPara).toMatch(/^\*\*2\.\*\* /m);
  });

  it('bolds each choice key (**N.**) and preserves input order verbatim', () => {
    const concerns = ['Headache', 'Diabetes follow-up', 'Knee pain'];
    const out = resolveComplaintClarificationMessage('a lot', concerns);
    const lines = out.split('\n');
    concerns.forEach((label, i) => {
      expect(lines).toContain(`**${i + 1}.** ${label}`);
    });
  });

  it('CTA includes bolded numeric choices joined grammatically per N', () => {
    const two = resolveComplaintClarificationMessage('x', ['A', 'B']);
    expect(two).toMatch(/Reply \*\*1\*\* or \*\*2\*\*/);
    const three = resolveComplaintClarificationMessage('x', ['A', 'B', 'C']);
    expect(three).toMatch(/Reply \*\*1\*\*, \*\*2\*\*, or \*\*3\*\*/);
    const five = resolveComplaintClarificationMessage('x', ['A', 'B', 'C', 'D', 'E']);
    expect(five).toMatch(/Reply \*\*1\*\*, \*\*2\*\*, \*\*3\*\*, \*\*4\*\*, or \*\*5\*\*/);
  });

  it('falls back to the legacy single-sentence copy when concerns is undefined / empty / 1 / > 5', () => {
    const legacy = resolveComplaintClarificationMessage('headache');
    expect(resolveComplaintClarificationMessage('headache', [])).toBe(legacy);
    expect(resolveComplaintClarificationMessage('headache', ['Only one'])).toBe(legacy);
    expect(
      resolveComplaintClarificationMessage('loads', ['A', 'B', 'C', 'D', 'E', 'F']),
    ).toBe(legacy);
  });

  it('uses Hindi intro + CTA for Devanagari user text, and Punjabi intro + CTA for Gurmukhi', () => {
    const hi = resolveComplaintClarificationMessage(
      'मुझे सिरदर्द और बुखार है',
      ['Headache', 'Fever'],
    );
    expect(hi).toContain('आपने कई चीज़ें बताई हैं:');
    expect(hi).toMatch(/मुख्य कारण/);
    expect(hi).toContain('या');
    const pa = resolveComplaintClarificationMessage(
      'ਮੈਨੂੰ ਸਿਰ ਦਰਦ ਅਤੇ ਬੁਖਾਰ ਹੈ',
      ['Headache', 'Fever'],
    );
    expect(pa).toContain('ਤੁਸੀਂ ਕਈ ਗੱਲਾਂ ਦੱਸੀਆਂ ਹਨ:');
    expect(pa).toContain('ਜਾਂ');
  });

  it('uses Roman Hindi / Roman Punjabi intro + CTA when no Devanagari / Gurmukhi in user text', () => {
    const latinHi = resolveComplaintClarificationMessage(
      'mujhe sir dard aur bukhar hai',
      ['Headache', 'Fever'],
    );
    expect(latinHi).toContain('Aapne kai concerns bataaye hain:');
    expect(latinHi).toMatch(/main reason/i);
    const latinPa = resolveComplaintClarificationMessage(
      'menu sir dard te bukhar hai',
      ['Headache', 'Fever'],
    );
    expect(latinPa).toContain('Tussi kai concerns dasse ne:');
  });

  it('concern labels render verbatim (builder does not localize them)', () => {
    const concerns = ['Headache', 'Diabetes follow-up', 'Knee pain'];
    for (const userText of [
      'english text',
      'मुझे सब कुछ है',
      'ਮੈਨੂੰ ਸਭ ਕੁਝ ਹੈ',
      'mujhe sab kuch hai',
      'menu sab kuch hai',
    ]) {
      const out = resolveComplaintClarificationMessage(userText, concerns);
      for (const label of concerns) {
        expect(out).toContain(label);
      }
    }
  });
});

describe('resolveClarificationNumericReply (Task 09)', () => {
  const CONCERNS = ['Headache', 'Diabetes follow-up', 'Knee pain'] as const;

  it('maps a valid 1-based reply to the corresponding concern', () => {
    expect(resolveClarificationNumericReply('1', CONCERNS)).toBe('Headache');
    expect(resolveClarificationNumericReply('2', CONCERNS)).toBe('Diabetes follow-up');
    expect(resolveClarificationNumericReply('3', CONCERNS)).toBe('Knee pain');
  });

  it('tolerates leading/trailing whitespace', () => {
    expect(resolveClarificationNumericReply('  2  ', CONCERNS)).toBe('Diabetes follow-up');
  });

  it('returns null for out-of-range numeric replies', () => {
    expect(resolveClarificationNumericReply('0', CONCERNS)).toBeNull();
    expect(resolveClarificationNumericReply('4', CONCERNS)).toBeNull();
    expect(resolveClarificationNumericReply('99', CONCERNS)).toBeNull();
  });

  it('returns null for non-digit / mixed / free-text replies', () => {
    expect(resolveClarificationNumericReply('1st', CONCERNS)).toBeNull();
    expect(resolveClarificationNumericReply('one', CONCERNS)).toBeNull();
    expect(resolveClarificationNumericReply('1, 2', CONCERNS)).toBeNull();
    expect(resolveClarificationNumericReply('1 please', CONCERNS)).toBeNull();
    expect(resolveClarificationNumericReply('the first one', CONCERNS)).toBeNull();
    expect(resolveClarificationNumericReply('', CONCERNS)).toBeNull();
    expect(resolveClarificationNumericReply('   ', CONCERNS)).toBeNull();
  });

  it('returns null when concerns is undefined or empty', () => {
    expect(resolveClarificationNumericReply('1', undefined)).toBeNull();
    expect(resolveClarificationNumericReply('1', [])).toBeNull();
  });

  it('rejects numbers longer than 2 digits (defensive upper bound)', () => {
    expect(resolveClarificationNumericReply('100', CONCERNS)).toBeNull();
  });

  it('rejects negative / decimal / hex inputs', () => {
    expect(resolveClarificationNumericReply('-1', CONCERNS)).toBeNull();
    expect(resolveClarificationNumericReply('1.5', CONCERNS)).toBeNull();
    expect(resolveClarificationNumericReply('0x1', CONCERNS)).toBeNull();
  });
});

describe('buildNonTextAckMessage invariants (Task 11)', () => {
  // The design constraint is "single line, no markdown, no emoji, names images + voice notes".
  // Snapshot catches drift of the exact wording; these invariants guard the shape itself so a
  // future well-intentioned edit that adds bold / an emoji / splits into paragraphs fails loudly
  // instead of silently regressing the error-adjacent ack.
  it('returns a single-line, markdown-free string that names both images and voice notes', () => {
    const out = buildNonTextAckMessage();
    expect(out.split('\n').length).toBe(1);
    expect(out).not.toMatch(/\*\*/);
    expect(out).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(out.toLowerCase()).toContain('images');
    expect(out.toLowerCase()).toContain('voice notes');
    expect(out.toLowerCase()).toContain('type');
  });

  it('drops the legacy bot-framed "I can only process text" wording', () => {
    expect(buildNonTextAckMessage()).not.toMatch(/process\s+text\s+messages/i);
  });
});

describe('formatClinicalReasonAskMoreAfterDeflection invariants (Task 10)', () => {
  const SNIPPET_SINGLE = 'Headache for 3 days';
  const SNIPPET_MULTI = '1) Headache for 3 days\n2) Diabetes follow-up';

  // The paragraph split is the whole point of Task 10: a question line, then a separate
  // escape-hatch + next-step line. Assert the break is present in every locale × branch
  // so accidental regressions (e.g. collapsing to one line during refactor) fail loudly.
  it('en / blank snippet produces a 2-paragraph ask (question + escape-hatch CTA)', () => {
    const out = formatClinicalReasonAskMoreAfterDeflection('I need help', '');
    expect(out).toContain('**Is there anything else**');
    expect(out).toContain('?\n\n');
    expect(out).toContain("If that's the full picture, reply **nothing else**");
    expect(out).toContain('**booking**');
    expect(out).toContain('**fees**');
    expect(out.split('\n\n').length).toBe(2);
  });

  it('en / single-line snippet renders "So far we\'ve noted" header + split tail', () => {
    const out = formatClinicalReasonAskMoreAfterDeflection('thanks', SNIPPET_SINGLE);
    expect(out.startsWith(`**So far we've noted:** **${SNIPPET_SINGLE}**.`)).toBe(true);
    expect(out).toContain('**Is there anything else** you\'d like the doctor to address?\n\n');
    expect(out).toContain('If that covers it, reply **nothing else**');
  });

  it('en / multi-line snippet renders block noted header + split tail', () => {
    const out = formatClinicalReasonAskMoreAfterDeflection('thanks', SNIPPET_MULTI);
    expect(out.startsWith("**So far we've noted:**\n\n")).toBe(true);
    expect(out).toContain(SNIPPET_MULTI);
    expect(out).toContain('**Is there anything else** you\'d like the doctor to address?\n\n');
    expect(out).toContain('If that covers it, reply **nothing else**');
  });

  it('hi / every sub-branch preserves split question + Hinglish CTA', () => {
    const blank = formatClinicalReasonAskMoreAfterDeflection('mujhe madad chahiye', '');
    expect(blank).toContain('**Kya aur kuch**');
    expect(blank).toContain('?\n\nAgar bas wahi hai');
    expect(blank).toContain('**nothing else**');
    expect(blank).toContain('**booking**');
    expect(blank).toContain('**fees**');

    const single = formatClinicalReasonAskMoreAfterDeflection('mujhe madad chahiye', SNIPPET_SINGLE);
    expect(single.startsWith('**Ab tak note kiya:** **')).toBe(true);
    expect(single).toContain('**Kya aur kuch** add karna hai?\n\nBas yahi hai to **nothing else**');

    const multi = formatClinicalReasonAskMoreAfterDeflection('mujhe madad chahiye', SNIPPET_MULTI);
    expect(multi.startsWith('**Ab tak note kiya:**\n\n')).toBe(true);
    expect(multi).toContain('**Kya aur kuch** add karna hai?\n\nBas yahi hai to **nothing else**');
  });

  it('pa / every sub-branch preserves split question + Roman Punjabi CTA', () => {
    const blank = formatClinicalReasonAskMoreAfterDeflection('menu madad chahidi', '');
    expect(blank).toContain('**Hor kuj**');
    expect(blank).toContain('?\n\nJe bas ohi hai');
    expect(blank).toContain('**nothing else**');
    expect(blank).toContain('**booking**');
    expect(blank).toContain('**fees**');

    const single = formatClinicalReasonAskMoreAfterDeflection('menu madad chahidi', SNIPPET_SINGLE);
    expect(single.startsWith('**Haje tak note kita:** **')).toBe(true);
    expect(single).toContain('**Hor kuj** add karna hai?\n\nBas ohi hai ta **nothing else**');

    const multi = formatClinicalReasonAskMoreAfterDeflection('menu madad chahidi', SNIPPET_MULTI);
    expect(multi.startsWith('**Haje tak note kita:**\n\n')).toBe(true);
    expect(multi).toContain('**Hor kuj** add karna hai?\n\nBas ohi hai ta **nothing else**');
  });

  it('never produces a single-line tail (regression guard against collapsing the split)', () => {
    // The old (pre-Task-10) copy smashed question + escape + next-step into one line via
    // "Reply nothing else if … — then we can (help with|move to) booking or fees".
    // The em-dash bridge is the telltale — forbid it in every variant.
    const variants: string[] = [];
    for (const user of ['hello', 'mujhe madad chahiye', 'menu madad chahidi']) {
      for (const snip of ['', SNIPPET_SINGLE, SNIPPET_MULTI]) {
        variants.push(formatClinicalReasonAskMoreAfterDeflection(user, snip));
      }
    }
    for (const v of variants) {
      expect(v).not.toMatch(/Reply \*\*nothing else\*\* if [^\n]+?—[^\n]+?(booking|fees)/i);
    }
  });
});
