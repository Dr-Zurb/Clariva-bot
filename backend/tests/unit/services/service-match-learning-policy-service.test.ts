import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  buildPolicyNotificationCopy,
  runStablePatternDetectionJob,
} from '../../../src/services/service-match-learning-policy-service';
import * as database from '../../../src/config/database';

jest.mock('../../../src/config/database');

const mockedDb = database as jest.Mocked<typeof database>;

describe('service-match-learning-policy-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('buildPolicyNotificationCopy includes counts and keys without patient text', () => {
    const { title, body } = buildPolicyNotificationCopy({
      resolutionCount: 7,
      windowDays: 30,
      proposedCatalogServiceKey: 'general_consult',
      finalCatalogServiceKey: 'teleconsult',
    });
    expect(title).toContain('Repeated');
    expect(body).toContain('7');
    expect(body).toContain('30');
    expect(body).toContain('general_consult');
    expect(body).toContain('teleconsult');
    expect(body).toContain('structured');
  });

  // Task 10 (Plan 03): single-fee doctors should be excluded from cron policy detection — their
  // pattern rows (if any) are stale/orphaned and generating autobook suggestions for them would
  // be nonsensical. Confirm the job counts them under `skipped` and does NOT insert a suggestion.
  it('Task 10: runStablePatternDetectionJob skips doctors in catalog_mode="single_fee"', async () => {
    const suggestionInsert = jest.fn();
    const autobookMaybeSingle = jest
      .fn()
      .mockResolvedValue({ data: null, error: null } as never);
    const suggestionMaybeSingle = jest
      .fn()
      .mockResolvedValue({ data: null, error: null } as never);

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
      if (table === 'service_match_autobook_policies') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          is: jest.fn().mockReturnThis(),
          maybeSingle: autobookMaybeSingle,
        };
      }
      if (table === 'service_match_learning_policy_suggestions') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gt: jest.fn().mockReturnThis(),
          maybeSingle: suggestionMaybeSingle,
          insert: suggestionInsert,
        };
      }
      return {};
    });

    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          doctor_id: 'd-single-fee',
          pattern_key: 'pk-abc',
          proposed_catalog_service_key: 'general',
          final_catalog_service_key: 'acute',
          resolution_count: 5,
          window_start: '2026-03-17T00:00:00.000Z',
          window_end: '2026-04-16T00:00:00.000Z',
        },
      ],
      error: null,
    } as never);

    mockedDb.getSupabaseAdminClient.mockReturnValue({ from, rpc } as never);

    const result = await runStablePatternDetectionJob('corr-t10-policy');

    expect(result.candidates).toBe(1);
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(suggestionInsert).not.toHaveBeenCalled();
    // autobook / suggestion existence checks must NOT be reached — we short-circuit above them.
    expect(autobookMaybeSingle).not.toHaveBeenCalled();
    expect(suggestionMaybeSingle).not.toHaveBeenCalled();
  });
});
