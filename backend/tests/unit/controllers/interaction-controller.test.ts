/**
 * ibi-03: listInteractionMessagesHandler — auth + Zod + doctor-scoped service call.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';

jest.mock('../../../src/services/message-service', () => ({
  getConversationMessagesForDoctor: jest.fn(),
}));

jest.mock('../../../src/services/interaction-service', () => ({
  listInteractionsForDoctor: jest.fn(),
  getInteractionForDoctor: jest.fn(),
}));

import {
  getInteractionHandler,
  listInteractionMessagesHandler,
  listInteractionsHandler,
} from '../../../src/controllers/interaction-controller';
import { getConversationMessagesForDoctor } from '../../../src/services/message-service';
import {
  getInteractionForDoctor,
  listInteractionsForDoctor,
} from '../../../src/services/interaction-service';
import { UnauthorizedError, ValidationError } from '../../../src/utils/errors';

const mockedGet = getConversationMessagesForDoctor as jest.MockedFunction<
  typeof getConversationMessagesForDoctor
>;
const mockedList = listInteractionsForDoctor as jest.MockedFunction<
  typeof listInteractionsForDoctor
>;
const mockedDetail = getInteractionForDoctor as jest.MockedFunction<
  typeof getInteractionForDoctor
>;

const DOCTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONV_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function invoke(
  handler: typeof listInteractionMessagesHandler,
  req: Request,
  res: Response
): Promise<unknown> {
  let captured: unknown;
  await new Promise<void>((resolve, reject) => {
    const next = (err?: unknown) => {
      if (err) reject(err);
      else resolve();
    };
    void Promise.resolve(handler(req, res, next)).then(
      () => resolve(),
      (err: unknown) => reject(err)
    );
  }).catch((err) => {
    captured = err;
  });
  return captured;
}

function makeRes(): Response {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('listInteractionMessagesHandler (ibi-03)', () => {
  it('returns 200 with messages for authenticated doctor', async () => {
    mockedGet.mockResolvedValueOnce({
      messages: [
        {
          id: 'm1',
          conversation_id: CONV_ID,
          sender_type: 'patient',
          content: 'hi',
          intent: null,
          created_at: '2026-07-27T08:00:00.000Z',
        },
      ],
      hasMoreOlder: false,
    });

    const req = {
      user: { id: DOCTOR_ID },
      correlationId: 'corr-1',
      params: { id: CONV_ID },
      query: {},
    } as unknown as Request;
    const res = makeRes();

    const err = await invoke(listInteractionMessagesHandler, req, res);
    expect(err).toBeUndefined();
    expect(mockedGet).toHaveBeenCalledWith(DOCTOR_ID, CONV_ID, 'corr-1', {
      limit: undefined,
      before: undefined,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as jest.Mock).mock.calls[0]![0] as {
      data: { messages: unknown[]; hasMoreOlder: boolean };
    };
    expect(body.data.messages).toHaveLength(1);
    expect(body.data.hasMoreOlder).toBe(false);
  });

  it('throws UnauthorizedError when no user', async () => {
    const req = {
      correlationId: 'corr-1',
      params: { id: CONV_ID },
    } as unknown as Request;
    const res = makeRes();

    const err = await invoke(listInteractionMessagesHandler, req, res);
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('throws ValidationError for non-uuid id', async () => {
    const req = {
      user: { id: DOCTOR_ID },
      correlationId: 'corr-1',
      params: { id: 'not-a-uuid' },
    } as unknown as Request;
    const res = makeRes();

    const err = await invoke(listInteractionMessagesHandler, req, res);
    expect(err).toBeInstanceOf(ValidationError);
    expect(mockedGet).not.toHaveBeenCalled();
  });
});

describe('listInteractionsHandler (ibi-06)', () => {
  it('defaults scope=signal and uses req.user.id', async () => {
    mockedList.mockResolvedValueOnce({
      interactions: [],
      nextCursor: null,
      counts: {
        all: 0,
        new_lead: 0,
        in_conversation: 0,
        booking_pending: 0,
        booked: 0,
        paid: 0,
        cancelled: 0,
        needs_review: 0,
      },
    });
    const req = {
      user: { id: DOCTOR_ID },
      correlationId: 'corr-1',
      query: {},
    } as unknown as Request;
    const res = makeRes();

    const err = await invoke(listInteractionsHandler as never, req, res);
    expect(err).toBeUndefined();
    expect(mockedList).toHaveBeenCalledWith(
      DOCTOR_ID,
      expect.objectContaining({ scope: 'signal' }),
      'corr-1'
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('getInteractionHandler (ibi-06)', () => {
  it('returns detail for owned interaction', async () => {
    mockedDetail.mockResolvedValueOnce({
      id: CONV_ID,
      kind: 'conversation',
      channel: 'instagram',
      patient_id: null,
      patient_display_name: null,
      medical_record_number: null,
      lead_label: 'Instagram chat',
      last_message_snippet: null,
      status: 'in_conversation',
      has_comment_lead: false,
      needs_review: false,
      appointment_id: null,
      appointment_patient_id: null,
      appointment_patient_display_name: null,
      appointment_patient_mrn: null,
      platform_external_id: 'abcd',
      platform_username: null,
      avatar_url: null,
      created_at: '2026-07-27T08:00:00.000Z',
      updated_at: '2026-07-27T08:00:00.000Z',
      timeline: [],
    });

    const req = {
      user: { id: DOCTOR_ID },
      correlationId: 'corr-1',
      params: { id: CONV_ID },
    } as unknown as Request;
    const res = makeRes();

    const err = await invoke(getInteractionHandler as never, req, res);
    expect(err).toBeUndefined();
    expect(mockedDetail).toHaveBeenCalledWith(DOCTOR_ID, CONV_ID, 'corr-1');
  });
});
