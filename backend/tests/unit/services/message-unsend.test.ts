/**
 * An unsent Instagram message is removed from the doctor's thread.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const DOCTOR = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const MESSAGE = '33333333-3333-4333-8333-333333333333';
const CONVERSATION = '44444444-4444-4444-8444-444444444444';

const deletedIds: string[] = [];
let storedDoctor = DOCTOR;

jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn(async () => undefined),
  logDataModification: jest.fn(async () => undefined),
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === 'messages') {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () => ({
                  data: { id: MESSAGE, conversation_id: CONVERSATION },
                  error: null,
                }),
              }),
            }),
          }),
          delete: () => ({
            eq: async (_column: string, id: string) => {
              deletedIds.push(id);
              return { error: null };
            },
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: storedDoctor === DOCTOR ? { id: CONVERSATION } : null,
                error: null,
              }),
            }),
          }),
        }),
      };
    },
  }),
}));

import { deleteUnsentMessage } from '../../../src/services/message-service';

describe('deleteUnsentMessage', () => {
  beforeEach(() => {
    deletedIds.length = 0;
    storedDoctor = DOCTOR;
  });

  it('deletes the stored message for this doctor', async () => {
    await expect(deleteUnsentMessage(DOCTOR, 'mid.unsent', 'corr')).resolves.toBe(true);
    expect(deletedIds).toEqual([MESSAGE]);
  });

  it('does not delete a message that belongs to another doctor', async () => {
    storedDoctor = OTHER;
    await expect(deleteUnsentMessage(DOCTOR, 'mid.unsent', 'corr')).resolves.toBe(false);
    expect(deletedIds).toEqual([]);
  });
});
