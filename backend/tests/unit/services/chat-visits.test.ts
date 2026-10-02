/**
 * Upcoming visits from an Instagram chat link. Date and token only.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const DOCTOR = '11111111-1111-4111-8111-111111111111';
const CONVERSATION = '22222222-2222-4222-8222-222222222222';
const CODE = 'ABCdef23';

const mockFindLink = jest.fn();
const mockFindConversation = jest.fn();
const selected: string[] = [];
let appointments: { id: string; appointment_date: string }[] = [];
let tokens: { appointment_id: string; token_number: number }[] = [];

function payload(table: string): { data: unknown; error: null } {
  if (table === 'doctor_settings') {
    return { data: { doctor_id: DOCTOR, public_slug: 'city-clinic' }, error: null };
  }
  if (table === 'appointments') return { data: appointments, error: null };
  if (table === 'opd_queue_entries') return { data: tokens, error: null };
  return { data: null, error: null };
}

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => ({
      select: (columns: string) => {
        selected.push(`${table}:${columns}`);
        const builder: {
          eq: () => typeof builder;
          in: () => typeof builder;
          gte: () => typeof builder;
          order: () => typeof builder;
          limit: () => typeof builder;
          maybeSingle: () => Promise<{ data: unknown; error: null }>;
          then: (
            resolve: (value: { data: unknown; error: null }) => unknown,
            reject?: (reason: unknown) => unknown
          ) => Promise<unknown>;
        } = {
          eq: () => builder,
          in: () => builder,
          gte: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: async () => payload(table),
          then: (resolve, reject) => Promise.resolve(payload(table)).then(resolve, reject),
        };
        return builder;
      },
    }),
  }),
}));

jest.mock('../../../src/services/visit-page-link-service', () => {
  const actual = jest.requireActual('../../../src/services/visit-page-link-service') as {
    isVisitPageCode: (value: string) => boolean;
  };
  return {
    isVisitPageCode: actual.isVisitPageCode,
    findVisitPageLink: (...args: unknown[]) => mockFindLink(...args),
  };
});

jest.mock('../../../src/services/conversation-service', () => ({
  findConversationById: (...args: unknown[]) => mockFindConversation(...args),
}));

import { listUpcomingChatVisits } from '../../../src/services/public-clinic-booking-service';

describe('listUpcomingChatVisits', () => {
  beforeEach(() => {
    selected.length = 0;
    appointments = [];
    tokens = [];
    mockFindLink.mockReset();
    mockFindConversation.mockReset();
    mockFindLink.mockResolvedValue({ conversationId: CONVERSATION, doctorId: DOCTOR } as never);
    mockFindConversation.mockResolvedValue({ doctor_id: DOCTOR } as never);
  });

  it('returns nothing when the code does not belong to this practice', async () => {
    mockFindLink.mockResolvedValue(null as never);
    await expect(listUpcomingChatVisits('city-clinic', CODE, 'corr')).resolves.toEqual({
      visits: [],
    });
    expect(selected.some((entry) => entry.startsWith('appointments:'))).toBe(false);
  });

  it('returns the visit time and queue token, and no patient fields', async () => {
    appointments = [{ id: 'appt-1', appointment_date: '2099-01-15T04:30:00.000Z' }];
    tokens = [{ appointment_id: 'appt-1', token_number: 4 }];

    await expect(listUpcomingChatVisits('city-clinic', CODE, 'corr')).resolves.toEqual({
      visits: [{ at: '2099-01-15T04:30:00.000Z', token: 4 }],
    });
    expect(selected).toContain('appointments:id, appointment_date');
    expect(selected.join(' ')).not.toContain('patient');
  });

  it('returns a clock time with no token when the visit is not in a queue', async () => {
    appointments = [{ id: 'appt-2', appointment_date: '2099-01-16T04:30:00.000Z' }];
    tokens = [];

    await expect(listUpcomingChatVisits('city-clinic', CODE, 'corr')).resolves.toEqual({
      visits: [{ at: '2099-01-16T04:30:00.000Z', token: null }],
    });
  });
});
