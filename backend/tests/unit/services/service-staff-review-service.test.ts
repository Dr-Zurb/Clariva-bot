/**
 * ARM-06: service-staff-review-service — idempotent upsert + validation paths (mocked Supabase).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { upsertPendingStaffServiceReviewRequest } from '../../../src/services/service-staff-review-service';
import * as database from '../../../src/config/database';
import type { ConversationState } from '../../../src/types/conversation';

jest.mock('../../../src/config/database');

const mockedDb = database as jest.Mocked<typeof database>;

describe('service-staff-review-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('upsertPendingStaffServiceReviewRequest returns existing pending row (idempotent)', async () => {
    const existingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const deadline = '2026-04-03T12:00:00.000Z';

    const chain: Record<string, unknown> = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: existingId, sla_deadline_at: deadline, status: 'pending' },
        error: null,
      } as never),
    };
    const from = jest.fn().mockReturnValue(chain);
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const state: ConversationState = {
      matcherProposedCatalogServiceKey: 'general',
      serviceCatalogMatchConfidence: 'low',
      pendingStaffServiceReview: true,
    };

    const out = await upsertPendingStaffServiceReviewRequest({
      doctorId: '550e8400-e29b-41d4-a716-446655440000',
      conversationId: '660e8400-e29b-41d4-a716-446655440001',
      patientId: null,
      correlationId: 'corr-arm06',
      state,
      slaDeadlineIso: deadline,
    });

    expect(out.id).toBe(existingId);
    expect(out.slaDeadlineIso).toBe(deadline);
    expect(from).toHaveBeenCalledWith('service_staff_review_requests');
  });
});
