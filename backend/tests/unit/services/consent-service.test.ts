/**
 * Consent Service Unit Tests (e-task-5)
 *
 * Tests for parseConsentReply, persistPatientAfterConsent, handleConsentDenied.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  parseConsentReply,
  persistPatientAfterConsent,
  handleConsentDenied,
  handleRevocation,
} from '../../../src/services/consent-service';
import * as patientService from '../../../src/services/patient-service';
import * as collectionService from '../../../src/services/collection-service';
import * as auditLogger from '../../../src/utils/audit-logger';

jest.mock('../../../src/services/patient-service');
jest.mock('../../../src/services/collection-service');
jest.mock('../../../src/utils/audit-logger');

const mockedPatient = patientService as jest.Mocked<typeof patientService>;
const mockedCollection = collectionService as jest.Mocked<typeof collectionService>;
const mockedAudit = auditLogger as jest.Mocked<typeof auditLogger>;

describe('Consent Service', () => {
  const conversationId = 'conv-123';
  const patientId = 'patient-456';
  const correlationId = 'corr-789';

  beforeEach(() => {
    jest.resetAllMocks();
    (mockedAudit.logConsentEvent as jest.Mock) = jest.fn().mockImplementation(() => Promise.resolve());
  });

  describe('parseConsentReply', () => {
    it('returns granted for yes/agree/ok', () => {
      expect(parseConsentReply('yes')).toBe('granted');
      expect(parseConsentReply('Yes')).toBe('granted');
      expect(parseConsentReply('I agree')).toBe('granted');
      expect(parseConsentReply('ok')).toBe('granted');
      expect(parseConsentReply('sure')).toBe('granted');
    });

    it('returns denied for no/revoke/decline', () => {
      expect(parseConsentReply('no')).toBe('denied');
      expect(parseConsentReply('No')).toBe('denied');
      expect(parseConsentReply('revoke')).toBe('denied');
      expect(parseConsentReply('decline')).toBe('denied');
    });

    it('returns unclear for ambiguous input', () => {
      expect(parseConsentReply('')).toBe('unclear');
      expect(parseConsentReply('maybe')).toBe('unclear');
      expect(parseConsentReply('I have a question')).toBe('unclear');
    });
  });

  describe('persistPatientAfterConsent', () => {
    beforeEach(() => {
      mockedCollection.getCollectedData.mockReturnValue({
        name: 'PATIENT_TEST',
        phone: '+10000000000',
        date_of_birth: '1990-01-15',
        gender: 'female',
      });
      mockedPatient.updatePatient.mockResolvedValue({} as any);
    });

    it('updates patient and clears collected data on success', async () => {
      const reply = await persistPatientAfterConsent(
        conversationId,
        patientId,
        'instagram_dm',
        correlationId
      );

      expect(mockedCollection.getCollectedData).toHaveBeenCalledWith(conversationId);
      expect(mockedPatient.updatePatient).toHaveBeenCalledWith(
        patientId,
        expect.objectContaining({
          name: 'PATIENT_TEST',
          phone: '+10000000000',
          consent_status: 'granted',
          consent_method: 'instagram_dm',
        }),
        correlationId
      );
      expect(mockedCollection.clearCollectedData).toHaveBeenCalledWith(conversationId);
      expect(mockedAudit.logConsentEvent).toHaveBeenCalledWith({
        correlationId,
        patientId,
        status: 'granted',
        method: 'instagram_dm',
      });
      expect(reply).toContain('saved your details');
    });

    it('returns fallback when no collected data', async () => {
      mockedCollection.getCollectedData.mockReturnValue(null);

      const reply = await persistPatientAfterConsent(
        conversationId,
        patientId,
        'instagram_dm',
        correlationId
      );

      expect(mockedPatient.updatePatient).not.toHaveBeenCalled();
      expect(mockedCollection.clearCollectedData).toHaveBeenCalledWith(conversationId);
      expect(reply).toContain('start over');
    });
  });

  describe('handleConsentDenied', () => {
    it('clears collected data and audits', async () => {
      const reply = await handleConsentDenied(conversationId, patientId, correlationId);

      expect(mockedCollection.clearCollectedData).toHaveBeenCalledWith(conversationId);
      expect(mockedAudit.logConsentEvent).toHaveBeenCalledWith({
        correlationId,
        patientId,
        status: 'denied',
        method: 'instagram_dm',
      });
      expect(reply).toContain("haven't saved");
    });
  });

  describe('handleRevocation', () => {
    it('anonymizes PHI and updates consent status when patient had granted consent', async () => {
      mockedPatient.findPatientById.mockResolvedValue({
        id: patientId,
        consent_status: 'granted',
      } as any);
      mockedPatient.updatePatient.mockResolvedValue({} as any);

      const reply = await handleRevocation(conversationId, patientId, correlationId);

      expect(mockedCollection.clearCollectedData).toHaveBeenCalledWith(conversationId);
      expect(mockedPatient.findPatientById).toHaveBeenCalledWith(patientId, correlationId);
      expect(mockedPatient.updatePatient).toHaveBeenCalledWith(
        patientId,
        expect.objectContaining({
          name: '[Anonymized]',
          consent_status: 'revoked',
        }),
        correlationId
      );
      expect(mockedAudit.logConsentEvent).toHaveBeenCalledWith({
        correlationId,
        patientId,
        status: 'revoked',
        method: 'instagram_dm',
      });
      expect(reply).toContain('removed');
    });

    it('returns message when already revoked', async () => {
      mockedPatient.findPatientById.mockResolvedValue({
        id: patientId,
        consent_status: 'revoked',
      } as any);

      const reply = await handleRevocation(conversationId, patientId, correlationId);

      expect(mockedPatient.updatePatient).not.toHaveBeenCalled();
      expect(reply).toContain('already been removed');
    });

    it('returns message when no stored data (pending)', async () => {
      mockedPatient.findPatientById.mockResolvedValue({
        id: patientId,
        consent_status: 'pending',
      } as any);

      const reply = await handleRevocation(conversationId, patientId, correlationId);

      expect(mockedPatient.updatePatient).not.toHaveBeenCalled();
      expect(reply).toContain("don't have any stored");
    });
  });
});
