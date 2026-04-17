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

    const chain: Record<string, unknown> = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: existingId, status: 'pending' },
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
    });

    expect(out.id).toBe(existingId);
    expect(from).toHaveBeenCalledWith('service_staff_review_requests');
  });

  // Task 10 (Plan 03): single-fee doctors never produce a review row — the enqueue must be a
  // no-op returning `{ id: null }` and MUST NOT hit the DB. This keeps the review inbox clean
  // and avoids orphaned rows that can't be resolved (there's only one service to pick).
  it('Task 10: upsert is a no-op for catalog_mode="single_fee" and never calls the DB', async () => {
    const from = jest.fn();
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const state: ConversationState = {
      matcherProposedCatalogServiceKey: 'consultation',
      serviceCatalogMatchConfidence: 'high',
      pendingStaffServiceReview: false,
    };

    const out = await upsertPendingStaffServiceReviewRequest({
      doctorId: '550e8400-e29b-41d4-a716-446655440000',
      conversationId: '660e8400-e29b-41d4-a716-446655440001',
      patientId: null,
      correlationId: 'corr-t10-single-fee',
      state,
      catalogMode: 'single_fee',
    });

    expect(out.id).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('Task 10: upsert runs normal path for catalog_mode="multi_service" / null', async () => {
    const existingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const chain: Record<string, unknown> = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: existingId, status: 'pending' },
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

    const outMulti = await upsertPendingStaffServiceReviewRequest({
      doctorId: '550e8400-e29b-41d4-a716-446655440000',
      conversationId: '660e8400-e29b-41d4-a716-446655440001',
      patientId: null,
      correlationId: 'corr-t10-multi',
      state,
      catalogMode: 'multi_service',
    });
    expect(outMulti.id).toBe(existingId);

    const outNull = await upsertPendingStaffServiceReviewRequest({
      doctorId: '550e8400-e29b-41d4-a716-446655440000',
      conversationId: '660e8400-e29b-41d4-a716-446655440001',
      patientId: null,
      correlationId: 'corr-t10-null',
      state,
      catalogMode: null,
    });
    expect(outNull.id).toBe(existingId);

    expect(from).toHaveBeenCalledWith('service_staff_review_requests');
  });
});
