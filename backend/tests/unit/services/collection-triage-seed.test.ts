/**
 * e-task-dm-04: seedCollectedReasonFromStateIfValid
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  seedCollectedReasonFromStateIfValid,
  getCollectedData,
  clearCollectedData,
} from '../../../src/services/collection-service';

jest.mock('../../../src/config/queue', () => ({
  isQueueEnabled: () => false,
  getWebhookQueue: () => ({}),
  getQueueConnection: () => null,
}));

describe('seedCollectedReasonFromStateIfValid (e-task-dm-04)', () => {
  const conversationId = 'conv-triage-seed-1';

  beforeEach(async () => {
    await clearCollectedData(conversationId);
  });

  it('returns empty when reason missing', async () => {
    const fields = await seedCollectedReasonFromStateIfValid(conversationId, undefined);
    expect(fields).toEqual([]);
    expect(await getCollectedData(conversationId)).toBeNull();
  });

  it('seeds Redis store and returns reason_for_visit field token', async () => {
    const fields = await seedCollectedReasonFromStateIfValid(
      conversationId,
      'Follow-up for blood sugar management'
    );
    expect(fields).toEqual(['reason_for_visit']);
    const data = await getCollectedData(conversationId);
    expect(data?.reason_for_visit).toBe('Follow-up for blood sugar management');
  });

  it('returns empty on invalid reason without throwing', async () => {
    const fields = await seedCollectedReasonFromStateIfValid(conversationId, '');
    expect(fields).toEqual([]);
  });
});
