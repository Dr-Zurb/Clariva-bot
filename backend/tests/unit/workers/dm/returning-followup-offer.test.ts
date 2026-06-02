/**
 * rcp-23: Returning follow-up service offer helpers.
 */

import { describe, it, expect } from '@jest/globals';
import type { ReturningPatientProfile } from '../../../../src/types/returning-patient';
import {
  applyReturningFollowUpAcceptance,
  buildReturningFollowUpOffer,
  canOfferReturningFollowUpService,
  formatReturningFollowUpConfirmMessage,
  parseReturningFollowUpReply,
  resolveReturningFollowUpCatalogOffering,
} from '../../../../src/workers/dm/returning-followup-offer';
import { deterministicServiceIdForLegacyOffering } from '../../../../src/utils/service-catalog-schema';

jest.mock('../../../../src/config/env', () => ({
  env: {
    RETURNING_PATIENT_MEMORY_ENABLED: false,
    LOG_LEVEL: 'info',
    NODE_ENV: 'test',
  },
}));

const catalogFixture = {
  version: 1 as const,
  services: [
    {
      service_id: deterministicServiceIdForLegacyOffering('doc-1', 'follow_up'),
      service_key: 'follow_up',
      label: 'Follow-up Consultation',
      modalities: { video: { enabled: true, price_minor: 50_000 } },
    },
  ],
};

const doctorSettings = {
  doctor_id: 'doc-1',
  service_offerings_json: catalogFixture,
} as never;

function returningProfile(): ReturningPatientProfile {
  return {
    isReturning: true,
    hasGrantedConsent: true,
    consentStatus: 'granted',
    hasName: true,
    hasPhone: true,
    knownFieldKeys: ['name', 'phone'],
    priorVisits: {
      attendedCount: 2,
      lastServiceKey: 'follow_up',
      recencyBucket: 'within_3_months',
    },
  };
}

describe('returning-followup-offer (rcp-23)', () => {
  it('parseReturningFollowUpReply recognizes yes/no', () => {
    expect(parseReturningFollowUpReply('yes')).toBe('yes');
    expect(parseReturningFollowUpReply('no')).toBe('no');
    expect(parseReturningFollowUpReply('maybe')).toBe('unclear');
  });

  it('resolves catalog label from opaque lastServiceKey only', () => {
    const offering = resolveReturningFollowUpCatalogOffering(doctorSettings, 'follow_up');
    expect(offering?.label).toBe('Follow-up Consultation');
    expect(resolveReturningFollowUpCatalogOffering(doctorSettings, 'removed_key')).toBeUndefined();
  });

  it('canOfferReturningFollowUpService requires flag on + catalog hit', () => {
    const { env } = jest.requireMock<{ env: { RETURNING_PATIENT_MEMORY_ENABLED: boolean } }>(
      '../../../../src/config/env'
    );
    env.RETURNING_PATIENT_MEMORY_ENABLED = true;
    expect(
      canOfferReturningFollowUpService(returningProfile(), { step: 'responded' }, doctorSettings)
    ).toBe(true);
    env.RETURNING_PATIENT_MEMORY_ENABLED = false;
    expect(
      canOfferReturningFollowUpService(returningProfile(), { step: 'responded' }, doctorSettings)
    ).toBe(false);
  });

  it('buildReturningFollowUpOffer sets awaiting step and confirm copy', () => {
    const { env } = jest.requireMock<{ env: { RETURNING_PATIENT_MEMORY_ENABLED: boolean } }>(
      '../../../../src/config/env'
    );
    env.RETURNING_PATIENT_MEMORY_ENABLED = true;
    const offer = buildReturningFollowUpOffer(
      { step: 'responded', updatedAt: new Date().toISOString() },
      returningProfile(),
      doctorSettings,
      'book_appointment'
    );
    expect(offer?.state.step).toBe('awaiting_followup_service_confirmation');
    expect(offer?.replyText).toBe(formatReturningFollowUpConfirmMessage('Follow-up Consultation'));
    env.RETURNING_PATIENT_MEMORY_ENABLED = false;
  });

  it('applyReturningFollowUpAcceptance finalizes via applyFinalCatalogServiceSelection', () => {
    const next = applyReturningFollowUpAcceptance(
      { step: 'awaiting_followup_service_confirmation', updatedAt: new Date().toISOString() },
      doctorSettings,
      'follow_up'
    );
    expect(next.serviceMatch?.catalogServiceKey).toBe('follow_up');
    expect(next.serviceMatch?.serviceSelectionFinalized).toBe(true);
    expect(next.serviceMatch?.serviceCatalogMatchReasonCodes).toContain('returning_followup_confirmed');
  });
});
