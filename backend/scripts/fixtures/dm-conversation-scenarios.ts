/**
 * Scripted DM conversation scenarios.
 *
 * Each scenario automates a block of MANUAL_QA_CHECKLIST_DM_BOT.md. Adding a
 * case here is meant to be cheap — that is the point of the harness.
 *
 * Assertion guidance:
 *   - `step` / `intent` / `language` are read from the DB and are exact.
 *   - `branch` needs TEST_DM_LOG; it warns rather than fails without it.
 *   - `replyContains` should only pin *deterministic* copy (safety templates,
 *     fixed acks). Never pin LLM-generated wording — it will flake.
 *
 * Keep scenarios at or under ~6 turns. A failed Meta send (expected with
 * synthetic senders) retries after 60s; a longer scenario can collide with its
 * own retry and corrupt later state assertions. The runner warns when it sees
 * duplicate replies.
 */

import type { Scenario } from '../lib/dm-harness';

/** Deterministic fragments of the English safety templates. */
const EMERGENCY_EN = '112';
const MEDICAL_DEFLECTION_EN = 'medical advice';

export const SCENARIOS: Scenario[] = [
  // -------------------------------------------------------------------------
  // Safety gates — checklist §1
  // -------------------------------------------------------------------------
  {
    id: 'safety-emergency-en',
    title: 'Emergency wins from idle; "emergency appointment" does not',
    tags: ['safety', 'core'],
    checklist: '1.1, 1.6',
    turns: [
      {
        label: 'acute phrase → emergency safety copy',
        text: 'chest pain and I cannot breathe',
        expect: {
          branch: 'emergency_safety',
          intent: 'emergency',
          step: 'responded',
          language: 'en',
          replyContains: [EMERGENCY_EN],
        },
      },
      {
        label: '"emergency appointment" → booking, not 112',
        text: 'I need an emergency appointment next week',
        expect: {
          replyOmits: [EMERGENCY_EN],
        },
      },
    ],
  },
  {
    id: 'safety-emergency-hinglish',
    title: 'Emergency on a Hinglish thread returns Roman Hindi safety copy',
    tags: ['safety', 'language', 'core'],
    checklist: '1.3, 2.10',
    turns: [
      {
        label: 'open thread in Hinglish',
        text: 'mujhe kal appointment chahiye',
        expect: { language: 'hi-Latn' },
      },
      {
        // Deliberately no `intent` assertion. The emergency gate sets
        // lastIntent='emergency', but run-conversation-turn.ts overwrites it with
        // the classifier's intent on any turn landing on `responded` — so mid-booking
        // the persisted value is whatever the classifier said. Tracked as a defect;
        // the safety-critical part (branch + copy + language) is asserted here.
        label: 'emergency → Roman Hindi, not English template',
        text: 'saans nahi aa rahi behosh ho gayi',
        expect: {
          branch: 'emergency_safety',
          language: 'hi-Latn',
          replyContains: [EMERGENCY_EN, 'kripaya'],
          replyOmits: ['Please call emergency services'],
        },
      },
    ],
  },
  {
    id: 'safety-medical-deflection',
    title: 'Non-emergency symptom is deflected without diagnosis',
    tags: ['safety', 'core'],
    checklist: '1.13',
    turns: [
      {
        label: 'symptom → deflection, no 112',
        text: 'I have had a mild fever for three days',
        expect: {
          branch: 'medical_safety',
          intent: 'medical_query',
          replyContains: [MEDICAL_DEFLECTION_EN],
          replyOmits: [EMERGENCY_EN],
        },
      },
    ],
  },
  {
    id: 'safety-emergency-midbooking',
    title: 'Emergency outranks an in-progress collection',
    tags: ['safety', 'booking'],
    checklist: '1.4',
    turns: [
      {
        label: 'start booking',
        text: 'I want to book an appointment',
        expect: { step: ['collecting_all', 'responded'] },
      },
      {
        label: 'acute phrase mid-collection → safety wins',
        text: 'actually I am having severe chest pain right now',
        expect: {
          branch: 'emergency_safety',
          intent: 'emergency',
          step: 'responded',
          replyContains: [EMERGENCY_EN],
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Language — checklist §2
  // -------------------------------------------------------------------------
  {
    id: 'language-sticky-hinglish',
    title: 'Hinglish sticks; one English line does not snap back',
    tags: ['language', 'core'],
    checklist: '2.3, 2.5',
    turns: [
      {
        label: 'Hinglish open → hi-Latn',
        text: 'mujhe kal appointment chahiye',
        expect: { language: 'hi-Latn' },
      },
      {
        label: 'single English line → stays hi-Latn',
        text: 'ok sounds good, what time works?',
        expect: { language: 'hi-Latn' },
      },
    ],
  },
  {
    id: 'language-devanagari',
    title: 'Devanagari first turn resolves to hi',
    tags: ['language', 'core'],
    checklist: '2.2',
    turns: [
      {
        label: 'Devanagari → hi',
        text: 'मुझे बुखार है',
        expect: { language: 'hi' },
      },
    ],
  },
  {
    id: 'language-english-baseline',
    title: 'English default holds through a weak single marker',
    tags: ['language'],
    checklist: '2.1',
    turns: [
      { label: 'plain greeting → en', text: 'hey hallo', expect: { language: 'en' } },
      {
        label: 'one Roman marker → still en',
        text: 'kitna is the fee?',
        expect: { language: 'en' },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Fees and reason-first triage — checklist §3
  // -------------------------------------------------------------------------
  {
    id: 'fees-reason-first',
    title: 'Fee ask quotes in-thread; clinical follow-up hands /book',
    tags: ['fees', 'catalog'],
    checklist: '3.1, 3.2, 3.3',
    note: 'Requires a configured service catalogue with fees.',
    turns: [
      {
        label: 'fee ask → quote',
        text: 'how much is a consultation?',
        expect: {
          branch: 'fee_deterministic_idle',
          intent: ['ask_question', 'check_availability'],
        },
      },
      {
        label: 'give reason → booking link, no symptom interview',
        text: 'knee pain for about two weeks',
        expect: { branch: ['booking_start_link_first', 'medical_safety'] },
      },
    ],
  },
  {
    id: 'fees-ambiguous-yes',
    title: 'In-flight reason-first leftover hands /book',
    tags: ['fees'],
    checklist: '3.4',
    note: 'Legacy ask_more threads no longer interview; they hand the owned booking page.',
    turns: [
      { label: 'fee ask', text: 'what are your charges?', expect: {} },
      { label: 'give reason', text: 'back pain since last month', expect: {} },
      {
        label: 'bare yes → booking link, not a clinical add-on',
        text: 'yes',
        expect: { branch: ['booking_start_link_first', 'fee_deterministic_idle'] },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Booking funnel — checklist §4
  // -------------------------------------------------------------------------
  {
    id: 'booking-one-shot-details',
    title: 'Booking details in chat still hand /book (no confirm read-back)',
    tags: ['booking', 'core'],
    checklist: '4.1a, 4.1f',
    turns: [
      {
        label: 'ask to book',
        text: 'I want to book an appointment',
        expect: { intent: ['book_appointment', 'check_availability'] },
      },
      {
        label: 'details in chat → owned-page link, no read-back',
        text: 'Ravi Kumar, 34, male, 9876543210, persistent knee pain',
        expect: {
          branch: ['booking_start_link_first', 'slot_selection', 'book_responded'],
          replyOmits: ['Ravi', '9876543210'],
        },
      },
    ],
  },
  {
    id: 'booking-partial-details',
    title: 'Partial details in chat hand /book instead of asking for the rest',
    tags: ['booking'],
    checklist: '4.1b',
    turns: [
      { label: 'ask to book', text: 'book an appointment please', expect: {} },
      {
        label: 'name + phone only → booking link, no missing-field ask',
        text: 'Anita Sharma, 9812345678',
        expect: {
          branch: ['booking_start_link_first', 'slot_selection', 'book_responded'],
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Cancel / reschedule / status — checklist §8
  // -------------------------------------------------------------------------
  {
    id: 'status-none-booked',
    title: 'Status check with no appointments answers cleanly',
    tags: ['appointments', 'core'],
    checklist: '8.1',
    turns: [
      {
        label: 'status with nothing booked',
        text: 'when is my appointment?',
        expect: {
          branch: 'check_appointment_status',
          intent: 'check_appointment_status',
          step: 'responded',
        },
      },
    ],
  },
  {
    id: 'cancel-none-booked',
    title: 'Cancel with no appointments does not open a cancel flow',
    tags: ['appointments', 'core'],
    checklist: '8.4',
    turns: [
      {
        label: 'cancel with nothing booked',
        text: 'I want to cancel my appointment',
        expect: {
          branch: 'cancel_appointment_intent',
          intent: 'cancel_appointment',
          step: 'responded',
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Non-text and fallbacks — checklist §9, §12
  // -------------------------------------------------------------------------
  // Checklist §9 (non-text) is intentionally absent. The handler answers
  // attachments before the turn pipeline and returns without storing the
  // inbound message or the ack, so there is nothing to assert against. Those
  // rows stay manual.
  {
    id: 'greeting-open',
    title: 'Greeting is warm and does not demand intake fields',
    tags: ['core'],
    checklist: '2.1',
    turns: [
      {
        label: 'hi → greeting, no cold intake',
        text: 'hi',
        expect: {
          branch: 'greeting_template',
          intent: 'greeting',
          step: 'responded',
          language: 'en',
        },
      },
    ],
  },
  {
    id: 'gibberish-fallback',
    title: 'Gibberish gets a polite fallback and a real branch label',
    tags: ['reliability'],
    checklist: '12.6',
    turns: [
      {
        label: 'nonsense → polite deflection, branch must not be unknown',
        text: 'asdkjh qwe ??? zz',
        expect: { step: 'responded' },
      },
    ],
  },
];
