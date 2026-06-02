/**
 * Task 10 (Plan 03): autobook must not attempt any policy lookup (or DM build) for single-fee
 * doctors. Even if stale policy rows or state shapes exist, the guard short-circuits before DB.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { tryApplyLearningPolicyAutobook } from '../../../src/services/service-match-learning-autobook';
import * as database from '../../../src/config/database';

jest.mock('../../../src/config/database');

const mockedDb = database as jest.Mocked<typeof database>;

describe('service-match-learning-autobook (Task 10 guard)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns {applied:false} and never queries service_match_autobook_policies when catalog_mode === "single_fee"', async () => {
    const policiesSelect = jest.fn();
    const from = jest.fn().mockImplementation((table) => {
      if (table === 'doctor_settings') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest
            .fn()
            .mockResolvedValue({ data: { catalog_mode: 'single_fee' }, error: null } as never),
        };
      }
      return { select: policiesSelect };
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const out = await tryApplyLearningPolicyAutobook({
      doctorId: 'd-single-fee',
      conversationId: 'conv-1',
      // Satisfy the state gating shape so the guard is the only thing that short-circuits.
      state: {
        step: 'awaiting_staff_service_confirmation',
        pendingStaffServiceReview: true,
        matcherProposedCatalogServiceKey: 'consultation',
        serviceCatalogMatchReasonCodes: ['ambiguous_complaint'],
      },
      candidateLabels: [{ service_key: 'consultation', label: 'Consultation' }],
      correlationId: 'corr-t10-autobook',
    });

    expect(out).toEqual({ applied: false });
    expect(policiesSelect).not.toHaveBeenCalled();
  });
});
