import { describe, expect, it } from '@jest/globals';
import {
  applyEmergencyNumberFloor,
  assistantMessageIsEmergencyEscalationCopy,
  assistantMessageNeedsEmergencyNumberFloor,
  EMERGENCY_REAFFIRM_RESPONSE_EN,
  KNOWN_BOOKING_SAFETY_NET_LINES,
  MEDICAL_QUERY_RESPONSE_EN,
  isEmergencyUserMessage,
  messageHasHypertensiveCrisisBloodPressureReading,
  messageSignalsSelfHarm,
  parsePlausibleBloodPressurePairs,
  recentThreadHasAssistantEmergencyEscalation,
  resolveSafetyMessage,
  stripBookingSafetyNetLines,
  userMessageSignalsPostEmergencyStability,
} from '../../../src/utils/safety-messages';
import {
  buildAppointmentReminder24hDm,
  buildPaymentConfirmationMessage,
} from '../../../src/utils/dm-copy';

describe('safety-messages (RBH-15)', () => {
  describe('resolveSafetyMessage', () => {
    it('returns receptionist copy for pa language', () => {
      const msg = resolveSafetyMessage('medical_query', 'pa');
      expect(msg.toLowerCase()).toContain('receptionist');
      expect(msg).not.toContain('scheduling assistant');
    });

    it('returns Roman Punjabi medical for pa-Latn', () => {
      const msg = resolveSafetyMessage('medical_query', 'pa-Latn');
      expect(msg.toLowerCase()).toContain('receptionist');
      expect(msg.toLowerCase()).toContain('main');
    });

    it('returns Hindi Devanagari medical when language is hi', () => {
      const msg = resolveSafetyMessage('medical_query', 'hi');
      expect(msg).toMatch(/[\u0900-\u097F]/);
    });

    it('returns emergency in Punjabi script for pa', () => {
      const msg = resolveSafetyMessage('emergency', 'pa');
      expect(msg).toContain('112');
      expect(msg).toMatch(/[\u0A00-\u0A7F]/);
    });

    it('returns Roman Hindi emergency for hi-Latn', () => {
      const msg = resolveSafetyMessage('emergency', 'hi-Latn');
      expect(msg).toContain('112');
      expect(msg.toLowerCase()).toMatch(/bharat|call|hospital/);
    });

    it('returns Roman Hindi medical_query for hi-Latn (not English)', () => {
      const msg = resolveSafetyMessage('medical_query', 'hi-Latn');
      expect(msg.toLowerCase()).toContain('main');
      expect(msg.toLowerCase()).toMatch(/receptionist|booking|hours|availability/);
      expect(msg).not.toContain("I'm the scheduling assistant");
    });

    it('returns English medical_query for en', () => {
      const msg = resolveSafetyMessage('medical_query', 'en');
      expect(msg).toBe(MEDICAL_QUERY_RESPONSE_EN);
      expect(msg).not.toMatch(/medical advice|teleconsult|doctor|scheduling assistant/i);
    });

    it('returns English medical_query for other (LANG-D7)', () => {
      const msg = resolveSafetyMessage('medical_query', 'other');
      expect(msg).toBe(MEDICAL_QUERY_RESPONSE_EN);
    });

    it('returns English reaffirm emergency without nearest-hospital line', () => {
      const msg = resolveSafetyMessage('emergency', 'en', { emergencyVariant: 'reaffirm' });
      expect(msg).toBe(EMERGENCY_REAFFIRM_RESPONSE_EN);
      expect(msg.toLowerCase()).not.toContain('nearest hospital');
      expect(assistantMessageIsEmergencyEscalationCopy(msg)).toBe(true);
    });
  });

  describe('isEmergencyUserMessage', () => {
    it('matches English chest pain', () => {
      expect(isEmergencyUserMessage("Chest pain and can't breathe")).toBe(true);
    });

    it('matches family collapse phrasing from stress pack', () => {
      expect(isEmergencyUserMessage("wife collapsed can't wake her")).toBe(true);
    });

    it('matches Punjabi Latin chest pain phrase from checklist', () => {
      expect(
        isEmergencyUserMessage(
          'Meri chhati vich dard te saas nahi aa rahi'
        )
      ).toBe(true);
    });

    it('matches poison / zehar (Punjabi)', () => {
      expect(isEmergencyUserMessage('Kise ne zahar kha lia')).toBe(true);
    });

    it('matches mild chest discomfort (A7.2 wordlist)', () => {
      expect(isEmergencyUserMessage('mild chest discomfort after gym')).toBe(true);
    });

    it('matches chest tightness / pressure / heaviness / burning', () => {
      expect(isEmergencyUserMessage('chest tightness since morning')).toBe(true);
      expect(isEmergencyUserMessage('chest pressure after stairs')).toBe(true);
      expect(isEmergencyUserMessage('chest heaviness')).toBe(true);
      expect(isEmergencyUserMessage('burning in chest')).toBe(false); // not "chest burning" order
      expect(isEmergencyUserMessage('chest burning')).toBe(true);
    });

    it('matches shortness of breath / breathless', () => {
      expect(isEmergencyUserMessage('shortness of breath after walking')).toBe(true);
      expect(isEmergencyUserMessage('feeling breathless')).toBe(true);
    });

    it('does not match blood pressure as chest pressure', () => {
      expect(isEmergencyUserMessage('my blood pressure is high')).toBe(false);
    });

    it('SAFE-D1: bare emergency matches', () => {
      expect(isEmergencyUserMessage('emergency')).toBe(true);
      expect(isEmergencyUserMessage('this is an emergency')).toBe(true);
    });

    it('matches self-harm / suicidal ideation deterministically (A6.4–A6.6)', () => {
      for (const phrase of [
        'suicide karne ka soch raha',
        'jaan de dunga koi sun nahi raha',
        // live repro: patient dropped the leading j
        'aan de dunga koi sun nahi raha',
        'I want to kill myself',
        'thinking of ending my life',
        'I dont want to live anymore',
        'overdose sleeping pills',
        'marna chahta hu',
        'khudkhushi kar lunga',
        'मरना चाहता हूँ',
      ]) {
        expect(messageSignalsSelfHarm(phrase)).toBe(true);
        expect(isEmergencyUserMessage(phrase)).toBe(true);
      }
    });

    it('self-harm outranks booking-compound guards', () => {
      expect(
        isEmergencyUserMessage('emergency appointment, I want to kill myself')
      ).toBe(true);
    });

    it('does not flag ordinary booking text as self-harm', () => {
      expect(messageSignalsSelfHarm('I need an appointment tomorrow')).toBe(false);
      expect(messageSignalsSelfHarm('mujhe kal appointment chahiye')).toBe(false);
    });

    it('does not match emergency appointment booking phrase', () => {
      expect(isEmergencyUserMessage('I need an emergency appointment tomorrow')).toBe(
        false
      );
    });

    it('does not match emergency slot / booking / visit / consult (B-row)', () => {
      expect(isEmergencyUserMessage('can I get an emergency slot today?')).toBe(false);
      expect(isEmergencyUserMessage('emergency booking for my father')).toBe(false);
      expect(isEmergencyUserMessage('need emergency visit this evening')).toBe(false);
      expect(isEmergencyUserMessage('emergency consultation please')).toBe(false);
    });

    it('does not match urgent appointment', () => {
      expect(isEmergencyUserMessage('Need urgent appointment slot')).toBe(false);
      expect(isEmergencyUserMessage('urgent booking please')).toBe(false);
    });

    it('matches getting worse as escalation cue', () => {
      expect(isEmergencyUserMessage('It is getting worse')).toBe(true);
    });

    it('does not use deterministic BP for isEmergencyUserMessage (LLM + context routes vitals)', () => {
      expect(
        isEmergencyUserMessage(
          'hello how are you ? my BP came out to be 200/100 earlier today'
        )
      ).toBe(false);
    });

    it('exposes crisis BP for repeat-escalation policy only', () => {
      expect(messageHasHypertensiveCrisisBloodPressureReading('bp 200/100')).toBe(true);
    });

    it('uses last BP pair when user reports improvement (crisis then better)', () => {
      expect(
        messageHasHypertensiveCrisisBloodPressureReading(
          'earlier 200/100 now 135/85'
        )
      ).toBe(false);
      expect(parsePlausibleBloodPressurePairs('earlier 200/100 now 135/85')).toEqual([
        { systolic: 200, diastolic: 100 },
        { systolic: 135, diastolic: 85 },
      ]);
    });

    it('does not treat normotensive readings as BP emergency', () => {
      expect(isEmergencyUserMessage('my bp is 128/82')).toBe(false);
      expect(messageHasHypertensiveCrisisBloodPressureReading('130/85')).toBe(false);
    });
  });

  describe('userMessageSignalsPostEmergencyStability', () => {
    it('returns false when last plausible BP is still crisis-range', () => {
      expect(userMessageSignalsPostEmergencyStability('bp 200/100')).toBe(false);
      expect(userMessageSignalsPostEmergencyStability('now 185/95')).toBe(false);
    });

    it('returns true for stability keywords without crisis vitals', () => {
      expect(userMessageSignalsPostEmergencyStability('I am stable now')).toBe(true);
      expect(userMessageSignalsPostEmergencyStability('feeling better, no chest pain')).toBe(
        true
      );
    });

    it('returns true when only non-crisis BP is present', () => {
      expect(userMessageSignalsPostEmergencyStability('my bp is 140/90 now')).toBe(true);
      expect(userMessageSignalsPostEmergencyStability('128/82')).toBe(true);
    });

    it('returns false when last pair is crisis after earlier stable pair', () => {
      expect(
        userMessageSignalsPostEmergencyStability('was 130/85 but now spiked to 200/100')
      ).toBe(false);
    });

    it('returns true when last pair is non-crisis after earlier crisis pair', () => {
      expect(
        userMessageSignalsPostEmergencyStability('earlier 200/100 now 135/85')
      ).toBe(true);
    });

    it('returns false for empty or too-short text', () => {
      expect(userMessageSignalsPostEmergencyStability('')).toBe(false);
      expect(userMessageSignalsPostEmergencyStability('ok')).toBe(false);
    });

    it('returns false when there is no BP and no stability keywords', () => {
      expect(userMessageSignalsPostEmergencyStability('what should I eat')).toBe(false);
    });
  });

  describe('recentThreadHasAssistantEmergencyEscalation', () => {
    it('finds escalation when it is not the last assistant line', () => {
      const emergency =
        'Please call emergency services (in India: **112** or **108**) or go to the nearest hospital immediately.';
      expect(
        recentThreadHasAssistantEmergencyEscalation([
          { sender_type: 'patient', content: 'bp high' },
          { sender_type: 'system', content: emergency },
          { sender_type: 'patient', content: 'stable now' },
          { sender_type: 'system', content: 'How can I help further?' },
        ])
      ).toBe(true);
    });
  });

  describe('assistantMessageIsEmergencyEscalationCopy', () => {
    it('matches canonical EN emergency line', () => {
      expect(
        assistantMessageIsEmergencyEscalationCopy(
          'Please call emergency services (in India: **112** or **108**) or go to the nearest hospital immediately.'
        )
      ).toBe(true);
    });

    it('rejects generic assistant text', () => {
      expect(
        assistantMessageIsEmergencyEscalationCopy(
          "I'm the scheduling assistant. Book a teleconsult through this chat."
        )
      ).toBe(false);
    });
  });

  describe('booking safety-net line vs escalation-copy detector', () => {
    it('no safety-net variant reads as escalation copy on its own', () => {
      for (const line of KNOWN_BOOKING_SAFETY_NET_LINES) {
        expect(assistantMessageIsEmergencyEscalationCopy(line)).toBe(false);
      }
    });

    it('rendered payment confirmation (all locales) does not read as escalation copy', () => {
      for (const language of ['en', 'hi', 'pa', 'hi-Latn', 'pa-Latn', 'other'] as const) {
        const dm = buildPaymentConfirmationMessage({
          language,
          appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
          patientMrn: 'CLR-00123',
        });
        expect(dm).toContain('112');
        expect(assistantMessageIsEmergencyEscalationCopy(dm)).toBe(false);
      }
    });

    it('rendered 24h reminder (all locales) does not read as escalation copy', () => {
      for (const language of ['en', 'hi', 'pa', 'hi-Latn', 'pa-Latn', 'other'] as const) {
        const dm = buildAppointmentReminder24hDm({
          language,
          practiceName: 'Test Clinic',
          whenLabel: 'Wed, 13 Aug, 3:30 pm',
          patientName: 'Neha Kapoor',
        });
        expect(dm).toContain('112');
        expect(assistantMessageIsEmergencyEscalationCopy(dm)).toBe(false);
      }
    });

    it('canonical escalation copy is still detected in every locale and variant', () => {
      for (const language of ['en', 'hi', 'pa', 'hi-Latn', 'pa-Latn'] as const) {
        for (const emergencyVariant of ['first', 'reaffirm'] as const) {
          const msg = resolveSafetyMessage('emergency', language, { emergencyVariant });
          expect(assistantMessageIsEmergencyEscalationCopy(msg)).toBe(true);
        }
      }
    });

    it('a message carrying both escalation copy and the safety-net line is still detected', () => {
      const combined = `${resolveSafetyMessage('emergency', 'en')}\n\n${KNOWN_BOOKING_SAFETY_NET_LINES[0]}`;
      expect(assistantMessageIsEmergencyEscalationCopy(combined)).toBe(true);
    });

    it('a thread whose assistant lines are only confirmation + reminder shows no prior escalation', () => {
      const confirmation = buildPaymentConfirmationMessage({
        language: 'en',
        appointmentDateDisplay: 'Tue, Apr 29, 2026, 4:30 PM',
        patientMrn: 'CLR-00123',
      });
      const reminder = buildAppointmentReminder24hDm({
        language: 'en',
        practiceName: 'Test Clinic',
        whenLabel: 'Wed, 13 Aug, 3:30 pm',
      });
      expect(
        recentThreadHasAssistantEmergencyEscalation([
          { sender_type: 'patient', content: 'booked yesterday' },
          { sender_type: 'system', content: confirmation },
          { sender_type: 'system', content: reminder },
        ])
      ).toBe(false);
    });

    it('stripBookingSafetyNetLines removes every known variant and nothing else', () => {
      for (const line of KNOWN_BOOKING_SAFETY_NET_LINES) {
        expect(stripBookingSafetyNetLines(`before\n\n${line}\n\nafter`)).toBe(
          'before\n\n\n\nafter'
        );
      }
      const untouched = 'Please call **112** now.';
      expect(stripBookingSafetyNetLines(untouched)).toBe(untouched);
    });
  });

  describe('assistantMessageNeedsEmergencyNumberFloor / applyEmergencyNumberFloor', () => {
    const improvisedCrisisNoNumbers =
      "I'm really sorry you're dealing with an emergency. I can't help manage emergencies over chat. " +
      'If this is **life-threatening or severe** (trouble breathing, chest pain, fainting, severe bleeding, ' +
      'stroke signs like face droop/arm weakness/slurred speech), please **call your local emergency number ' +
      'right now** or go to the **nearest emergency department**.';

    it('detects improvised crisis guidance without 112/108', () => {
      expect(assistantMessageNeedsEmergencyNumberFloor(improvisedCrisisNoNumbers)).toBe(true);
    });

    it('does not floor canonical escalation (already has numbers)', () => {
      const canonical = resolveSafetyMessage('emergency', 'en');
      expect(assistantMessageNeedsEmergencyNumberFloor(canonical)).toBe(false);
      expect(applyEmergencyNumberFloor(canonical, 'en').applied).toBe(false);
    });

    it('does not floor medical deflection or fee-style copy', () => {
      expect(assistantMessageNeedsEmergencyNumberFloor(MEDICAL_QUERY_RESPONSE_EN)).toBe(false);
      expect(
        assistantMessageNeedsEmergencyNumberFloor(
          'Video consult is ₹500. Reply book to continue.'
        )
      ).toBe(false);
      expect(
        assistantMessageNeedsEmergencyNumberFloor(
          'The clinic is near City Hospital on MG Road. Book a teleconsult if you like.'
        )
      ).toBe(false);
    });

    it('does not floor emergency-appointment booking phrasing', () => {
      expect(
        assistantMessageNeedsEmergencyNumberFloor(
          'Got it — I can help with an emergency appointment slot tomorrow. Share your full name and phone.'
        )
      ).toBe(false);
    });

    it('appends localized 112/108 for all static locales', () => {
      for (const lang of ['en', 'hi', 'pa', 'hi-Latn', 'pa-Latn'] as const) {
        const out = applyEmergencyNumberFloor(improvisedCrisisNoNumbers, lang);
        expect(out.applied).toBe(true);
        expect(out.reply).toContain('112');
        expect(out.reply).toContain('108');
        expect(assistantMessageIsEmergencyEscalationCopy(out.reply)).toBe(true);
        expect(out.reply.startsWith(improvisedCrisisNoNumbers.trim())).toBe(true);
      }
    });
  });
});
