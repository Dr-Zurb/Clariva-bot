import { describe, it, expect } from '@jest/globals';
import {
  applyFinalCatalogServiceSelection,
  applyMatcherProposalToConversationState,
  applyStaffReviewGateCancellationToConversationState,
  isSlotBookingBlockedPendingStaffReview,
  SERVICE_CATALOG_MATCH_REASON_CODES,
  type ConversationState,
} from '../../../src/types/conversation';
import {
  readConversationState,
  writeConversationState,
} from '../../../src/types/conversation-state-io';

describe('ARM-03 conversation state (matcher + staff review)', () => {
  it('applyMatcherProposalToConversationState sets proposal and review gate', () => {
    const base: ConversationState = {
      step: 'consent',
      serviceMatch: { catalogServiceKey: 'old' },
    };
    const next = applyMatcherProposalToConversationState(base, {
      matcherProposedCatalogServiceKey: 'skin',
      matcherProposedCatalogServiceId: '11111111-1111-4111-8111-111111111111',
      serviceCatalogMatchConfidence: 'low',
      serviceCatalogMatchReasonCodes: [SERVICE_CATALOG_MATCH_REASON_CODES.AMBIGUOUS_COMPLAINT],
      pendingStaffServiceReview: true,
      staffServiceReviewRequestId: '22222222-2222-4222-8222-222222222222',
      staffServiceReviewDeadlineAt: '2026-04-02T12:00:00.000Z',
    });
    expect(next.serviceMatch?.matcherProposedCatalogServiceKey).toBe('skin');
    expect(next.serviceMatch?.matcherProposedCatalogServiceId).toBe(
      '11111111-1111-4111-8111-111111111111'
    );
    expect(next.serviceMatch?.serviceCatalogMatchConfidence).toBe('low');
    expect(next.serviceMatch?.pendingStaffServiceReview).toBe(true);
    expect(next.serviceMatch?.staffServiceReviewRequestId).toBe(
      '22222222-2222-4222-8222-222222222222'
    );
    expect(next.serviceMatch?.catalogServiceKey).toBe('old');
    expect(next.serviceMatch?.serviceSelectionFinalized).toBeUndefined();
  });

  it('applyMatcherProposalToConversationState finalizeSelection copies to catalog and clears review', () => {
    const base: ConversationState = {};
    const next = applyMatcherProposalToConversationState(base, {
      matcherProposedCatalogServiceKey: 'gp',
      matcherProposedConsultationModality: 'video',
      serviceCatalogMatchConfidence: 'high',
      serviceCatalogMatchReasonCodes: [
        SERVICE_CATALOG_MATCH_REASON_CODES.AUTO_FINALIZED_HIGH_CONFIDENCE,
      ],
      finalizeSelection: true,
    });
    expect(next.serviceMatch?.catalogServiceKey).toBe('gp');
    expect(next.serviceMatch?.consultationModality).toBe('video');
    expect(next.serviceMatch?.serviceSelectionFinalized).toBe(true);
    expect(next.serviceMatch?.pendingStaffServiceReview).toBe(false);
    expect(next.serviceMatch?.staffServiceReviewRequestId).toBeUndefined();
    expect(next.serviceMatch?.staffServiceReviewDeadlineAt).toBeUndefined();
  });

  it('applyFinalCatalogServiceSelection sets final keys and clears pending review', () => {
    const base: ConversationState = {
      serviceMatch: {
        matcherProposedCatalogServiceKey: 'skin',
        pendingStaffServiceReview: true,
        staffServiceReviewRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        staffServiceReviewDeadlineAt: '2026-04-01T00:00:00.000Z',
        serviceCatalogMatchConfidence: 'low',
      },
    };
    const next = applyFinalCatalogServiceSelection(base, {
      catalogServiceKey: 'derm',
      catalogServiceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      consultationModality: 'video',
      clearProposal: true,
      reasonCodesAppend: [SERVICE_CATALOG_MATCH_REASON_CODES.STAFF_REASSIGNED_SERVICE],
    });
    expect(next.serviceMatch?.catalogServiceKey).toBe('derm');
    expect(next.serviceMatch?.catalogServiceId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(next.serviceMatch?.consultationModality).toBe('video');
    expect(next.serviceMatch?.serviceSelectionFinalized).toBe(true);
    expect(next.serviceMatch?.pendingStaffServiceReview).toBe(false);
    expect(next.serviceMatch?.staffServiceReviewRequestId).toBeUndefined();
    expect(next.serviceMatch?.staffServiceReviewDeadlineAt).toBeUndefined();
    expect(next.serviceMatch?.matcherProposedCatalogServiceKey).toBeUndefined();
    expect(next.serviceMatch?.serviceCatalogMatchConfidence).toBe('high');
    expect(next.serviceMatch?.serviceCatalogMatchReasonCodes).toContain(
      SERVICE_CATALOG_MATCH_REASON_CODES.STAFF_REASSIGNED_SERVICE
    );
  });

  it('writeConversationState omits cleared proposal fields on nested disk', () => {
    const s = applyMatcherProposalToConversationState(
      {},
      {
        matcherProposedCatalogServiceKey: 'other',
        serviceCatalogMatchConfidence: 'medium',
        finalizeSelection: true,
      }
    );
    const disk = writeConversationState(s);
    const sm = disk.serviceMatch as Record<string, unknown>;
    expect(sm.catalogServiceKey).toBe('other');
    expect(sm.matcherProposedCatalogServiceKey).toBe('other');
    expect(sm.pendingStaffServiceReview).toBe(false);
    expect(disk).not.toHaveProperty('catalogServiceKey');
    expect(Object.keys(disk.serviceMatch as object)).not.toContain('staffServiceReviewRequestId');
    expect(Object.keys(disk.serviceMatch as object)).not.toContain('matcherCandidateLabels');
  });

  it('applyStaffReviewGateCancellationToConversationState clears gate and moves off staff step', () => {
    const base: ConversationState = {
      step: 'awaiting_staff_service_confirmation',
      lastPromptKind: 'staff_service_pending',
      serviceMatch: {
        pendingStaffServiceReview: true,
        staffServiceReviewRequestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        staffServiceReviewDeadlineAt: '2026-04-10T00:00:00.000Z',
      },
    };
    const next = applyStaffReviewGateCancellationToConversationState(
      base,
      SERVICE_CATALOG_MATCH_REASON_CODES.STAFF_REVIEW_CANCELLED_BY_STAFF
    );
    expect(next.step).toBe('responded');
    expect(next.lastPromptKind).toBeUndefined();
    expect(next.serviceMatch?.pendingStaffServiceReview).toBe(false);
    expect(next.serviceMatch?.staffServiceReviewRequestId).toBeUndefined();
    expect(next.serviceMatch?.serviceCatalogMatchReasonCodes).toContain(
      SERVICE_CATALOG_MATCH_REASON_CODES.STAFF_REVIEW_CANCELLED_BY_STAFF
    );
  });

  it('isSlotBookingBlockedPendingStaffReview reads namespaced gate', () => {
    expect(
      isSlotBookingBlockedPendingStaffReview(
        readConversationState({
          pendingStaffServiceReview: true,
          serviceSelectionFinalized: false,
        })
      )
    ).toBe(true);
    expect(
      isSlotBookingBlockedPendingStaffReview(
        readConversationState({
          pendingStaffServiceReview: false,
          serviceSelectionFinalized: true,
          catalogServiceKey: 'gp',
        })
      )
    ).toBe(false);
  });
});
