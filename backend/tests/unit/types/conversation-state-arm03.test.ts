import { describe, it, expect } from '@jest/globals';
import {
  applyFinalCatalogServiceSelection,
  applyMatcherProposalToConversationState,
  applyStaffReviewGateCancellationToConversationState,
  SERVICE_CATALOG_MATCH_REASON_CODES,
  type ConversationState,
} from '../../../src/types/conversation';

describe('ARM-03 conversation state (matcher + staff review)', () => {
  it('applyMatcherProposalToConversationState sets proposal and review gate', () => {
    const base: ConversationState = { step: 'consent', catalogServiceKey: 'old' };
    const next = applyMatcherProposalToConversationState(base, {
      matcherProposedCatalogServiceKey: 'skin',
      matcherProposedCatalogServiceId: '11111111-1111-4111-8111-111111111111',
      serviceCatalogMatchConfidence: 'low',
      serviceCatalogMatchReasonCodes: [SERVICE_CATALOG_MATCH_REASON_CODES.AMBIGUOUS_COMPLAINT],
      pendingStaffServiceReview: true,
      staffServiceReviewRequestId: '22222222-2222-4222-8222-222222222222',
      staffServiceReviewDeadlineAt: '2026-04-02T12:00:00.000Z',
    });
    expect(next.matcherProposedCatalogServiceKey).toBe('skin');
    expect(next.matcherProposedCatalogServiceId).toBe('11111111-1111-4111-8111-111111111111');
    expect(next.serviceCatalogMatchConfidence).toBe('low');
    expect(next.pendingStaffServiceReview).toBe(true);
    expect(next.staffServiceReviewRequestId).toBe('22222222-2222-4222-8222-222222222222');
    expect(next.catalogServiceKey).toBe('old');
    expect(next.serviceSelectionFinalized).toBeUndefined();
  });

  it('applyMatcherProposalToConversationState finalizeSelection copies to catalog and clears review', () => {
    const base: ConversationState = {};
    const next = applyMatcherProposalToConversationState(base, {
      matcherProposedCatalogServiceKey: 'gp',
      matcherProposedConsultationModality: 'video',
      serviceCatalogMatchConfidence: 'high',
      serviceCatalogMatchReasonCodes: [SERVICE_CATALOG_MATCH_REASON_CODES.AUTO_FINALIZED_HIGH_CONFIDENCE],
      finalizeSelection: true,
    });
    expect(next.catalogServiceKey).toBe('gp');
    expect(next.consultationModality).toBe('video');
    expect(next.serviceSelectionFinalized).toBe(true);
    expect(next.pendingStaffServiceReview).toBe(false);
    expect(next.staffServiceReviewRequestId).toBeUndefined();
    expect(next.staffServiceReviewDeadlineAt).toBeUndefined();
  });

  it('applyFinalCatalogServiceSelection sets final keys and clears pending review', () => {
    const base: ConversationState = {
      matcherProposedCatalogServiceKey: 'skin',
      pendingStaffServiceReview: true,
      staffServiceReviewRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      staffServiceReviewDeadlineAt: '2026-04-01T00:00:00.000Z',
      serviceCatalogMatchConfidence: 'low',
    };
    const next = applyFinalCatalogServiceSelection(base, {
      catalogServiceKey: 'derm',
      catalogServiceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      consultationModality: 'video',
      clearProposal: true,
      reasonCodesAppend: [SERVICE_CATALOG_MATCH_REASON_CODES.STAFF_REASSIGNED_SERVICE],
    });
    expect(next.catalogServiceKey).toBe('derm');
    expect(next.catalogServiceId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(next.consultationModality).toBe('video');
    expect(next.serviceSelectionFinalized).toBe(true);
    expect(next.pendingStaffServiceReview).toBe(false);
    expect(next.staffServiceReviewRequestId).toBeUndefined();
    expect(next.staffServiceReviewDeadlineAt).toBeUndefined();
    expect(next.matcherProposedCatalogServiceKey).toBeUndefined();
    expect(next.serviceCatalogMatchConfidence).toBe('high');
    expect(next.serviceCatalogMatchReasonCodes).toContain(
      SERVICE_CATALOG_MATCH_REASON_CODES.STAFF_REASSIGNED_SERVICE
    );
  });

  it('JSON round-trip omits undefined optional ARM-03 fields', () => {
    const s: ConversationState = applyMatcherProposalToConversationState(
      {},
      {
        matcherProposedCatalogServiceKey: 'other',
        serviceCatalogMatchConfidence: 'medium',
        finalizeSelection: true,
      }
    );
    const json = JSON.parse(JSON.stringify(s)) as ConversationState;
    expect(json.catalogServiceKey).toBe('other');
    expect(json.matcherProposedCatalogServiceKey).toBe('other');
    expect(json.pendingStaffServiceReview).toBe(false);
    expect(Object.keys(json)).not.toContain('staffServiceReviewRequestId');
  });

  it('applyStaffReviewGateCancellationToConversationState clears gate and moves off staff step', () => {
    const base: ConversationState = {
      step: 'awaiting_staff_service_confirmation',
      lastPromptKind: 'staff_service_pending',
      pendingStaffServiceReview: true,
      staffServiceReviewRequestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      staffServiceReviewDeadlineAt: '2026-04-10T00:00:00.000Z',
    };
    const next = applyStaffReviewGateCancellationToConversationState(
      base,
      SERVICE_CATALOG_MATCH_REASON_CODES.STAFF_REVIEW_CANCELLED_BY_STAFF
    );
    expect(next.step).toBe('responded');
    expect(next.lastPromptKind).toBeUndefined();
    expect(next.pendingStaffServiceReview).toBe(false);
    expect(next.staffServiceReviewRequestId).toBeUndefined();
    expect(next.serviceCatalogMatchReasonCodes).toContain(
      SERVICE_CATALOG_MATCH_REASON_CODES.STAFF_REVIEW_CANCELLED_BY_STAFF
    );
  });
});
