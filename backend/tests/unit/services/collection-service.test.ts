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
  getCollectedData,
  setCollectedData,
  clearCollectedData,
  COLLECTION_ORDER,
  REQUIRED_COLLECTION_FIELDS,
  getInitialCollectionStep,
} from '../../../src/services/collection-service';
import * as auditLogger from '../../../src/utils/audit-logger';

jest.mock('../../../src/utils/audit-logger');

const mockedAudit = auditLogger as jest.Mocked<typeof auditLogger>;

describe('Collection Service', () => {
  const conversationId = 'conv-123';
  const correlationId = 'corr-456';

  beforeEach(() => {
    jest.resetAllMocks();
    clearCollectedData(conversationId);
    (mockedAudit.logPatientDataCollection as jest.Mock) = jest
      .fn()
      .mockImplementation(() => Promise.resolve());
  });

  describe('COLLECTION_ORDER and REQUIRED_COLLECTION_FIELDS', () => {
    it('has expected order and required fields', () => {
      expect(COLLECTION_ORDER).toEqual([
        'name',
        'phone',
        'date_of_birth',
        'gender',
        'reason_for_visit',
      ]);
      expect(REQUIRED_COLLECTION_FIELDS).toEqual(['name', 'phone']);
    });
  });

  describe('getNextCollectionField', () => {
    it('returns first field when none collected', () => {
      expect(getNextCollectionField([])).toBe('name');
      expect(getNextCollectionField(undefined)).toBe('name');
    });

    it('returns next field when some collected', () => {
      expect(getNextCollectionField(['name'])).toBe('phone');
      expect(getNextCollectionField(['name', 'phone'])).toBe('date_of_birth');
      expect(getNextCollectionField(['name', 'phone', 'date_of_birth'])).toBe(
        'gender'
      );
      expect(
        getNextCollectionField(['name', 'phone', 'date_of_birth', 'gender'])
      ).toBe('reason_for_visit');
    });

    it('returns null when all collected', () => {
      expect(
        getNextCollectionField([
          'name',
          'phone',
          'date_of_birth',
          'gender',
          'reason_for_visit',
        ])
      ).toBeNull();
    });
  });

  describe('hasAllRequiredFields', () => {
    it('returns false when required missing', () => {
      expect(hasAllRequiredFields([])).toBe(false);
      expect(hasAllRequiredFields(['name'])).toBe(false);
    });

    it('returns true when name and phone collected', () => {
      expect(hasAllRequiredFields(['name', 'phone'])).toBe(true);
      expect(hasAllRequiredFields(['name', 'phone', 'date_of_birth'])).toBe(
        true
      );
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
    it('on success updates store and returns newState with next step', () => {
      const state: { collectedFields: string[]; step?: string } = {
        collectedFields: [],
        step: 'collecting_name',
      };
      const result = validateAndApply(
        conversationId,
        'name',
        'PATIENT_TEST',
        state,
        correlationId
      );
      expect(result.success).toBe(true);
      expect(result.newState.collectedFields).toEqual(['name']);
      expect(result.newState.step).toBe('collecting_phone');
      expect(getCollectedData(conversationId)).toEqual({ name: 'PATIENT_TEST' });
      expect(mockedAudit.logPatientDataCollection).toHaveBeenCalledWith({
        correlationId,
        conversationId,
        fieldName: 'name',
        status: 'collected',
      });
    });

    it('on validation failure returns replyOverride and does not update store', () => {
      const state = {
        collectedFields: [] as string[],
        step: 'collecting_phone',
      };
      const result = validateAndApply(
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
      expect(getCollectedData(conversationId)).toBeNull();
      expect(mockedAudit.logPatientDataCollection).toHaveBeenCalledWith({
        correlationId,
        conversationId,
        fieldName: 'phone',
        status: 'validation_failed',
      });
    });

    it('when all required collected sets step to consent', () => {
      setCollectedData(conversationId, { name: 'A', phone: '+10000000000' });
      const state = {
        collectedFields: ['name', 'phone'],
        step: 'collecting_date_of_birth',
      };
      const result = validateAndApply(
        conversationId,
        'date_of_birth',
        '1990-01-15',
        state,
        correlationId
      );
      expect(result.success).toBe(true);
      expect(result.newState.collectedFields).toEqual([
        'name',
        'phone',
        'date_of_birth',
      ]);
      expect(result.newState.step).toBe('collecting_gender');
    });

    it('after last optional field sets step to consent', () => {
      setCollectedData(conversationId, {
        name: 'A',
        phone: '+10000000000',
        date_of_birth: '1990-01-15',
        gender: 'other',
      });
      const state = {
        collectedFields: ['name', 'phone', 'date_of_birth', 'gender'],
        step: 'collecting_reason_for_visit',
      };
      const result = validateAndApply(
        conversationId,
        'reason_for_visit',
        'Checkup',
        state,
        correlationId
      );
      expect(result.success).toBe(true);
      expect(result.newState.step).toBe('consent');
    });
  });

  describe('getCollectedData / setCollectedData / clearCollectedData', () => {
    it('returns null when no data', () => {
      expect(getCollectedData(conversationId)).toBeNull();
    });

    it('stores and retrieves partial data', () => {
      setCollectedData(conversationId, { name: 'PATIENT_TEST', phone: '+10000000000' });
      expect(getCollectedData(conversationId)).toEqual({
        name: 'PATIENT_TEST',
        phone: '+10000000000',
      });
    });

    it('clearCollectedData removes data', () => {
      setCollectedData(conversationId, { name: 'PATIENT_TEST' });
      clearCollectedData(conversationId);
      expect(getCollectedData(conversationId)).toBeNull();
    });
  });

  describe('getInitialCollectionStep', () => {
    it('returns collecting_name', () => {
      expect(getInitialCollectionStep()).toBe('collecting_name');
    });
  });
});
