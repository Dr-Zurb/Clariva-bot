/**
 * Collection Service Unit Tests (e-task-4)
 *
 * Tests for getNextCollectionField, hasAllRequiredFields, parseMessageForField,
 * validateAndApply (success/failure), and in-memory store (get/set/clear).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  getNextCollectionField,
  hasAllRequiredFields,
  parseMessageForField,
  validateAndApply,
  validateAndApplyExtracted,
  getCollectedData,
  setCollectedData,
  clearCollectedData,
  COLLECTION_ORDER,
  getInitialCollectionStep,
} from '../../../src/services/collection-service';
import type { ConversationState } from '../../../src/types/conversation';
import { REQUIRED_COLLECTION_FIELDS } from '../../../src/utils/validation';
import * as auditLogger from '../../../src/utils/audit-logger';

jest.mock('../../../src/utils/audit-logger');
jest.mock('../../../src/config/queue', () => ({
  isQueueEnabled: () => false,
  getWebhookQueue: () => ({}),
  getQueueConnection: () => null,
}));

const mockedAudit = auditLogger as jest.Mocked<typeof auditLogger>;

describe('Collection Service', () => {
  const conversationId = 'conv-123';
  const correlationId = 'corr-456';

  beforeEach(async () => {
    jest.resetAllMocks();
    await clearCollectedData(conversationId);
    (mockedAudit.logPatientDataCollection as jest.Mock) = jest
      .fn()
      .mockImplementation(() => Promise.resolve());
  });

  describe('COLLECTION_ORDER and REQUIRED_COLLECTION_FIELDS', () => {
    it('has expected order and required fields', () => {
      expect(COLLECTION_ORDER).toEqual([
        'name',
        'phone',
        'age',
        'gender',
        'reason_for_visit',
        'email',
      ]);
      expect(REQUIRED_COLLECTION_FIELDS).toEqual([
        'name',
        'phone',
        'age',
        'gender',
        'reason_for_visit',
      ]);
    });
  });

  describe('getNextCollectionField', () => {
    it('returns first field when none collected', () => {
      expect(getNextCollectionField([])).toBe('name');
      expect(getNextCollectionField(undefined)).toBe('name');
    });

    it('returns next field when some collected', () => {
      expect(getNextCollectionField(['name'])).toBe('phone');
      expect(getNextCollectionField(['name', 'phone'])).toBe('age');
      expect(getNextCollectionField(['name', 'phone', 'age'])).toBe('gender');
      expect(getNextCollectionField(['name', 'phone', 'age', 'gender'])).toBe(
        'reason_for_visit'
      );
      expect(
        getNextCollectionField(['name', 'phone', 'age', 'gender', 'reason_for_visit'])
      ).toBe('email');
    });

    it('returns null when all collected', () => {
      expect(
        getNextCollectionField([
          'name',
          'phone',
          'age',
          'gender',
          'reason_for_visit',
          'email',
        ])
      ).toBeNull();
    });
  });

  describe('hasAllRequiredFields', () => {
    it('returns false when required missing', () => {
      expect(hasAllRequiredFields([])).toBe(false);
      expect(hasAllRequiredFields(['name', 'phone'])).toBe(false);
    });

    it('returns true when all required fields collected', () => {
      expect(
        hasAllRequiredFields([
          'name',
          'phone',
          'age',
          'gender',
          'reason_for_visit',
        ])
      ).toBe(true);
      expect(
        hasAllRequiredFields([
          'name',
          'phone',
          'age',
          'gender',
          'reason_for_visit',
          'email',
        ])
      ).toBe(true);
    });
  });

  describe('parseMessageForField', () => {
    it('returns trimmed value for plain text', () => {
      expect(parseMessageForField('  PATIENT_TEST  ', 'name')).toBe('PATIENT_TEST');
      expect(parseMessageForField('+10000000000', 'phone')).toBe('+10000000000');
    });

    it('strips "My name is" prefix for name', () => {
      expect(parseMessageForField('My name is PATIENT_TEST', 'name')).toBe('PATIENT_TEST');
      expect(parseMessageForField("I'm PATIENT_TEST", 'name')).toBe('PATIENT_TEST');
    });

    it('returns empty for empty message', () => {
      expect(parseMessageForField('', 'name')).toBe('');
      expect(parseMessageForField('   ', 'phone')).toBe('');
    });
  });

  describe('validateAndApply', () => {
    it('on success updates store and returns newState with next step', async () => {
      const state: { collectedFields: string[]; step?: string } = {
        collectedFields: [],
        step: 'collecting_name',
      };
      const result = await validateAndApply(
        conversationId,
        'name',
        'PATIENT_TEST',
        state,
        correlationId
      );
      expect(result.success).toBe(true);
      expect(result.newState.collectedFields).toEqual(['name']);
      expect(result.newState.step).toBe('collecting_phone');
      expect(await getCollectedData(conversationId)).toEqual({ name: 'PATIENT_TEST' });
      expect(mockedAudit.logPatientDataCollection).toHaveBeenCalledWith({
        correlationId,
        conversationId,
        fieldName: 'name',
        status: 'collected',
      });
    });

    it('on validation failure returns replyOverride and does not update store', async () => {
      const state = {
        collectedFields: [] as string[],
        step: 'collecting_phone',
      };
      const result = await validateAndApply(
        conversationId,
        'phone',
        'not-a-phone',
        state,
        correlationId
      );
      expect(result.success).toBe(false);
      expect(result.replyOverride).toContain('valid');
      expect(result.replyOverride).toContain('phone');
      expect(result.newState).toEqual(state);
      expect(await getCollectedData(conversationId)).toBeNull();
      expect(mockedAudit.logPatientDataCollection).toHaveBeenCalledWith({
        correlationId,
        conversationId,
        fieldName: 'phone',
        status: 'validation_failed',
      });
    });

    it('after age success next step is collecting_gender', async () => {
      await setCollectedData(conversationId, { name: 'A', phone: '+10000000000' });
      const state = {
        collectedFields: ['name', 'phone'],
        step: 'collecting_age',
      };
      const result = await validateAndApply(
        conversationId,
        'age',
        '30',
        state,
        correlationId
      );
      expect(result.success).toBe(true);
      expect(result.newState.collectedFields).toEqual(['name', 'phone', 'age']);
      expect(result.newState.step).toBe('collecting_gender');
    });

    it('after reason_for_visit next step is collecting_email', async () => {
      await setCollectedData(conversationId, {
        name: 'A',
        phone: '+10000000000',
        age: 30,
        gender: 'other',
      });
      const state = {
        collectedFields: ['name', 'phone', 'age', 'gender'],
        step: 'collecting_reason_for_visit',
      };
      const result = await validateAndApply(
        conversationId,
        'reason_for_visit',
        'Checkup',
        state,
        correlationId
      );
      expect(result.success).toBe(true);
      expect(result.newState.step).toBe('collecting_email');
    });

    it('after email success with all fields sets step to consent', async () => {
      await setCollectedData(conversationId, {
        name: 'A',
        phone: '+10000000000',
        age: 30,
        gender: 'other',
        reason_for_visit: 'Checkup',
      });
      const state = {
        collectedFields: ['name', 'phone', 'age', 'gender', 'reason_for_visit'],
        step: 'collecting_email',
      };
      const result = await validateAndApply(
        conversationId,
        'email',
        'a@example.com',
        state,
        correlationId
      );
      expect(result.success).toBe(true);
      expect(result.newState.collectedFields).toEqual([
        'name',
        'phone',
        'age',
        'gender',
        'reason_for_visit',
        'email',
      ]);
      expect(result.newState.step).toBe('consent');
    });
  });

  describe('getCollectedData / setCollectedData / clearCollectedData', () => {
    it('returns null when no data', async () => {
      expect(await getCollectedData(conversationId)).toBeNull();
    });

    it('stores and retrieves partial data', async () => {
      await setCollectedData(conversationId, { name: 'PATIENT_TEST', phone: '+10000000000' });
      expect(await getCollectedData(conversationId)).toEqual({
        name: 'PATIENT_TEST',
        phone: '+10000000000',
      });
    });

    it('clearCollectedData removes data', async () => {
      await setCollectedData(conversationId, { name: 'PATIENT_TEST' });
      await clearCollectedData(conversationId);
      expect(await getCollectedData(conversationId)).toBeNull();
    });
  });

  describe('getInitialCollectionStep', () => {
    it('returns collecting_all', () => {
      expect(getInitialCollectionStep()).toBe('collecting_all');
    });
  });

  describe('validateAndApplyExtracted (e-task-phil-08 multi-field blob)', () => {
    it('extracts name and phone from one message when both missing (regex fallback)', async () => {
      const state: ConversationState = {
        step: 'collecting_all',
        collectedFields: [],
        updatedAt: new Date().toISOString(),
      };
      const result = await validateAndApplyExtracted(
        conversationId,
        'Rahul Sharma 9876543210',
        state,
        correlationId
      );
      expect(result.success).toBe(true);
      expect(result.newState.collectedFields).toEqual(expect.arrayContaining(['name', 'phone']));
      const stored = await getCollectedData(conversationId);
      expect(stored?.name).toMatch(/Rahul/i);
      expect(stored?.phone).toBeDefined();
      expect(String(stored?.phone).replace(/\D/g, '').length).toBeGreaterThanOrEqual(10);
    });

    it('self-heals stale booking-intent name/reason before re-extraction', async () => {
      // Reproduces the DM bug on 2026-04-18 where a prior turn captured the phrase
      // "i'd like to book an appointment" as both `name` and `reason_for_visit`, and
      // the follow-up compound intake ("Abhishek Sahil / 35 / male / 8264602737 /
      // i have htn, dmt2, ... / <email>") never overwrote the bad values because
      // those fields were excluded from `missingFields`.
      await setCollectedData(conversationId, {
        name: "i'd like to book an appointment",
        reason_for_visit: "i'd like to book an appointment",
      });
      const state: ConversationState = {
        step: 'collecting_all',
        collectedFields: ['name', 'reason_for_visit'],
        updatedAt: new Date().toISOString(),
      };
      const compoundIntake =
        'Abhishek Sahil\n35\nmale\n8264602737\ni have htn, dmt2, cough sneezing\nas.sahilabhi2937@gmail.com';
      const result = await validateAndApplyExtracted(
        conversationId,
        compoundIntake,
        state,
        correlationId
      );
      expect(result.success).toBe(true);
      const stored = await getCollectedData(conversationId);
      // Bad values must be gone.
      expect(stored?.name).not.toMatch(/book/i);
      expect(stored?.reason_for_visit).not.toMatch(/book/i);
      // Phone/email are picked up deterministically from the compound message.
      expect(stored?.phone).toBe('8264602737');
      expect(stored?.email).toBe('as.sahilabhi2937@gmail.com');
    });
  });
});
