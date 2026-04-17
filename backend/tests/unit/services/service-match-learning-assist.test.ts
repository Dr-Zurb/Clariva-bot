/**
 * Task 10 (Plan 03): assist should no-op for single-fee doctors. This is a regression guard so
 * staff inbox hints never query learning examples for practices that have no multi-service catalog.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { fetchAssistHintForReviewRow } from '../../../src/services/service-match-learning-assist';
import * as database from '../../../src/config/database';

jest.mock('../../../src/config/database');

const mockedDb = database as jest.Mocked<typeof database>;

describe('service-match-learning-assist (Task 10 guard)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null and never queries service_match_learning_examples when catalog_mode === "single_fee"', async () => {
    const examplesQuery = jest.fn();
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
      return { select: examplesQuery };
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    const hint = await fetchAssistHintForReviewRow({
      row: {
        match_reason_codes: ['ambiguous_complaint'],
        candidate_labels: [{ service_key: 'consultation', label: 'Consultation' }],
        proposed_catalog_service_key: 'consultation',
      },
      doctorId: 'd-single-fee',
      correlationId: 'corr-t10-assist',
      catalogLabelByKey: new Map([['consultation', 'Consultation']]),
    });

    expect(hint).toBeNull();
    expect(examplesQuery).not.toHaveBeenCalled();
  });

  it('does not short-circuit when catalog_mode === "multi_service" (proceeds to examples query)', async () => {
    // Mock the full query-builder chain:
    // admin.from('service_match_learning_examples').select(...).eq(...).eq(...).eq(...).order(...).limit(...)
    // All chain methods return `this` and `.limit` resolves an empty data array so the function
    // exits cleanly. The point of this test is ONLY to prove the guard did NOT short-circuit.
    const examplesChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null } as never),
    };
    const from = jest.fn().mockImplementation((table) => {
      if (table === 'doctor_settings') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest
            .fn()
            .mockResolvedValue({ data: { catalog_mode: 'multi_service' }, error: null } as never),
        };
      }
      return examplesChain;
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);

    await fetchAssistHintForReviewRow({
      row: {
        match_reason_codes: ['ambiguous_complaint'],
        candidate_labels: [{ service_key: 'general', label: 'General' }],
        proposed_catalog_service_key: 'general',
      },
      doctorId: 'd-multi',
      correlationId: 'corr-t10-assist-multi',
      catalogLabelByKey: new Map([['general', 'General']]),
    });

    expect(examplesChain.select).toHaveBeenCalled();
  });
});
