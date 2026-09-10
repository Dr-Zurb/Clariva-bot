/**
 * ibi-06: interaction status/signal helpers + doctor-scoped detail.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  buildInteractionTimeline,
  computeInteractionStageCounts,
  countInteractionStages,
  fuseInteractionStatus,
  getInteractionForDoctor,
  isSignalInteraction,
  omitNeedsReviewFromAllLaneCount,
  resolveInteractionProfileLinks,
} from '../../../src/services/interaction-service';
import { getSupabaseAdminClient } from '../../../src/config/database';
import { NotFoundError } from '../../../src/utils/errors';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn(async () => undefined),
}));

const mockGetSupabase = getSupabaseAdminClient as jest.MockedFunction<
  typeof getSupabaseAdminClient
>;

const doctorId = '7ab212da-2694-4e6d-97ff-c71ab451ef52';
const convId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('resolveInteractionProfileLinks', () => {
  it('hides chatter profile without MRN (placeholder lead)', () => {
    expect(
      resolveInteractionProfileLinks({
        patient_id: 'p-chatter',
        medical_record_number: null,
        appointment_patient_id: null,
        appointment_patient_display_name: null,
        appointment_patient_mrn: null,
      })
    ).toEqual({
      chatterProfilePatientId: null,
      bookedForPatientId: null,
      bookedForLabel: null,
    });
  });

  it('links chatter profile only when registered (MRN)', () => {
    expect(
      resolveInteractionProfileLinks({
        patient_id: 'p-chatter',
        medical_record_number: 'MRN-1',
        appointment_patient_id: 'p-chatter',
        appointment_patient_display_name: 'Self',
        appointment_patient_mrn: 'MRN-1',
      }).chatterProfilePatientId
    ).toBe('p-chatter');
  });

  it('surfaces booked-for when appointment patient differs from chatter', () => {
    expect(
      resolveInteractionProfileLinks({
        patient_id: 'p-chatter',
        medical_record_number: null,
        appointment_patient_id: 'p-family',
        appointment_patient_display_name: 'Asha Kumar',
        appointment_patient_mrn: 'MRN-9',
      })
    ).toEqual({
      chatterProfilePatientId: null,
      bookedForPatientId: 'p-family',
      bookedForLabel: 'Asha Kumar',
    });
  });
});

describe('fuseInteractionStatus / isSignalInteraction (ibi-06)', () => {
  it('prefers paid over other statuses', () => {
    expect(
      fuseInteractionStatus({
        appointmentStatus: 'confirmed',
        needsReview: true,
        state: { step: 'awaiting_slot_selection' },
        hasCommentLead: true,
      })
    ).toBe('paid');
  });

  it('fuses cancelled and no_show appointment statuses (ibi-12)', () => {
    expect(
      fuseInteractionStatus({
        appointmentStatus: 'cancelled',
        needsReview: false,
        state: {},
        hasCommentLead: false,
      })
    ).toBe('cancelled');
    expect(
      fuseInteractionStatus({
        appointmentStatus: 'no_show',
        needsReview: true,
        state: {},
        hasCommentLead: false,
      })
    ).toBe('no_show');
  });

  it('returns needs_review when pending staff review and no appointment', () => {
    expect(
      fuseInteractionStatus({
        appointmentStatus: null,
        needsReview: true,
        state: { step: 'awaiting_staff_service_confirmation' },
        hasCommentLead: false,
      })
    ).toBe('needs_review');
  });

  it('returns new_lead for early journey (comment or DM) before past greeting', () => {
    expect(
      fuseInteractionStatus({
        appointmentStatus: null,
        needsReview: false,
        state: { step: 'responded' },
        hasCommentLead: true,
      })
    ).toBe('new_lead');
    expect(
      fuseInteractionStatus({
        appointmentStatus: null,
        needsReview: false,
        state: { step: 'responded' },
        hasCommentLead: false,
      })
    ).toBe('new_lead');
  });

  it('returns in_conversation when past greeting but not yet booking-in-progress', () => {
    expect(
      fuseInteractionStatus({
        appointmentStatus: null,
        needsReview: false,
        state: { step: 'responded', lastPromptKind: 'staff_service_pending' },
        hasCommentLead: false,
      })
    ).toBe('in_conversation');
  });

  it('signal is true for comment lead / appointment / review / past greeting', () => {
    expect(
      isSignalInteraction({
        hasCommentLead: true,
        hasAppointment: false,
        hasReview: false,
        state: {},
      })
    ).toBe(true);
    expect(
      isSignalInteraction({
        hasCommentLead: false,
        hasAppointment: true,
        hasReview: false,
        state: {},
      })
    ).toBe(true);
    expect(
      isSignalInteraction({
        hasCommentLead: false,
        hasAppointment: false,
        hasReview: true,
        state: {},
      })
    ).toBe(true);
    expect(
      isSignalInteraction({
        hasCommentLead: false,
        hasAppointment: false,
        hasReview: false,
        state: { step: 'collecting_name' },
      })
    ).toBe(true);
    expect(
      isSignalInteraction({
        hasCommentLead: false,
        hasAppointment: false,
        hasReview: false,
        state: { step: 'responded' },
      })
    ).toBe(false);
  });
});

describe('buildInteractionTimeline (ibi-08)', () => {
  it('orders comment → first_dm → booked → paid', () => {
    const steps = buildInteractionTimeline({
      conversationId: convId,
      commentLead: { id: 'lead-1', created_at: '2026-07-27T08:00:00.000Z' },
      firstPatientMessageAt: '2026-07-27T08:05:00.000Z',
      state: { step: 'collecting_name', updatedAt: '2026-07-27T08:06:00.000Z' },
      appointment: {
        id: 'apt-1',
        status: 'confirmed',
        created_at: '2026-07-27T09:00:00.000Z',
      },
    });
    expect(steps.map((s) => s.type)).toEqual([
      'comment_captured',
      'first_dm',
      'booking_started',
      'booked',
      'paid',
    ]);
  });

  it('comment-only leads get a single comment_captured step', () => {
    const steps = buildInteractionTimeline({
      conversationId: null,
      commentLead: { id: 'lead-2', created_at: '2026-07-27T08:00:00.000Z' },
    });
    expect(steps).toEqual([
      {
        type: 'comment_captured',
        at: '2026-07-27T08:00:00.000Z',
        comment_lead_id: 'lead-2',
        conversation_id: undefined,
      },
    ]);
  });

  it('emits rescheduled when appointment has related_appointment_id (ibi-15)', () => {
    const steps = buildInteractionTimeline({
      conversationId: convId,
      appointment: {
        id: 'apt-2',
        status: 'pending',
        created_at: '2026-07-27T10:00:00.000Z',
        related_appointment_id: 'apt-1',
      },
    });
    expect(steps.map((s) => s.type)).toContain('rescheduled');
  });

  it('emits rescheduled when multiple appointments exist on the conversation', () => {
    const steps = buildInteractionTimeline({
      conversationId: convId,
      appointment: {
        id: 'apt-2',
        status: 'pending',
        created_at: '2026-07-27T10:00:00.000Z',
      },
      priorAppointments: [
        { id: 'apt-1', created_at: '2026-07-27T09:00:00.000Z' },
      ],
    });
    expect(steps.map((s) => s.type)).toContain('rescheduled');
  });
});

describe('countInteractionStages (ibi-15)', () => {
  it('aggregates funnel stages and ignores no_show', () => {
    const counts = countInteractionStages([
      { status: 'new_lead' },
      { status: 'new_lead' },
      { status: 'booked' },
      { status: 'paid' },
      { status: 'cancelled' },
      { status: 'needs_review' },
      { status: 'no_show' },
    ]);
    expect(counts).toEqual({
      all: 7,
      new_lead: 2,
      in_conversation: 0,
      booking_pending: 0,
      booked: 1,
      paid: 1,
      cancelled: 1,
      needs_review: 1,
    });
  });

  it('omitNeedsReviewFromAllLaneCount subtracts needs_review from all only', () => {
    const counts = countInteractionStages([
      { status: 'new_lead' },
      { status: 'needs_review' },
      { status: 'needs_review' },
      { status: 'booked' },
    ]);
    expect(omitNeedsReviewFromAllLaneCount(counts)).toEqual({
      all: 2,
      new_lead: 1,
      in_conversation: 0,
      booking_pending: 0,
      booked: 1,
      paid: 0,
      cancelled: 0,
      needs_review: 2,
    });
  });
});

describe('computeInteractionStageCounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function chainable(result: { data?: unknown; error?: unknown; count?: number | null }) {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = jest.fn(self);
    chain.eq = jest.fn(self);
    chain.is = jest.fn(self);
    chain.gte = jest.fn(self);
    chain.lte = jest.fn(self);
    chain.in = jest.fn(self);
    chain.order = jest.fn(self);
    chain.range = jest.fn(self);
    chain.limit = jest.fn(self);
    // Terminal: range/select await via thenable or direct resolve when awaited
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: result.data ?? null,
        error: result.error ?? null,
        count: result.count ?? null,
      }).then(resolve);
    return chain;
  }

  it('counts fused conversation stages + unlinked leads outside the list page', async () => {
    const convIdA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const convIdB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    const from = jest.fn((table: string) => {
      if (table === 'conversations') {
        return chainable({
          data: [
            {
              id: convIdA,
              doctor_id: doctorId,
              patient_id: null,
              platform: 'instagram',
              platform_conversation_id: 'ig-a',
              status: 'active',
              metadata: {},
              created_at: '2026-07-01T00:00:00.000Z',
              updated_at: '2026-07-20T00:00:00.000Z',
            },
            {
              id: convIdB,
              doctor_id: doctorId,
              patient_id: null,
              platform: 'instagram',
              platform_conversation_id: 'ig-b',
              status: 'active',
              metadata: { step: 'awaiting_slot_selection' },
              created_at: '2026-07-01T00:00:00.000Z',
              updated_at: '2026-07-21T00:00:00.000Z',
            },
          ],
        });
      }
      if (table === 'comment_leads') {
        // head count for unlinked, then conversation_id select for fuse
        const c = chainable({ count: 3, data: [] });
        return c;
      }
      if (table === 'service_staff_review_requests') {
        return chainable({ data: [] });
      }
      if (table === 'appointments') {
        return chainable({
          data: [
            {
              conversation_id: convIdB,
              status: 'scheduled',
              created_at: '2026-07-21T01:00:00.000Z',
            },
          ],
        });
      }
      return chainable({ data: [] });
    });

    mockGetSupabase.mockReturnValue({ from } as never);

    const counts = await computeInteractionStageCounts(
      doctorId,
      { scope: 'all', dateFrom: '2026-06-01T00:00:00.000Z' },
      'corr-counts'
    );

    // convA → new_lead (early DM), convB → booked, +3 unlinked new_lead
    expect(counts.all).toBe(5);
    expect(counts.new_lead).toBe(4);
    expect(counts.booked).toBe(1);
    expect(counts.in_conversation).toBe(0);
  });

  it('excludes needs_review from counts.all (pinned lane owns those rows)', async () => {
    const convIdA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const convIdB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    const from = jest.fn((table: string) => {
      if (table === 'conversations') {
        return chainable({
          data: [
            {
              id: convIdA,
              doctor_id: doctorId,
              patient_id: null,
              platform: 'instagram',
              platform_conversation_id: 'ig-a',
              status: 'active',
              metadata: {},
              created_at: '2026-07-01T00:00:00.000Z',
              updated_at: '2026-07-20T00:00:00.000Z',
            },
            {
              id: convIdB,
              doctor_id: doctorId,
              patient_id: null,
              platform: 'instagram',
              platform_conversation_id: 'ig-b',
              status: 'active',
              metadata: { step: 'awaiting_staff_service_confirmation' },
              created_at: '2026-07-01T00:00:00.000Z',
              updated_at: '2026-07-21T00:00:00.000Z',
            },
          ],
        });
      }
      if (table === 'comment_leads') {
        return chainable({ count: 0, data: [] });
      }
      if (table === 'service_staff_review_requests') {
        return chainable({
          data: [{ conversation_id: convIdB, status: 'pending' }],
        });
      }
      if (table === 'appointments') {
        return chainable({ data: [] });
      }
      return chainable({ data: [] });
    });

    mockGetSupabase.mockReturnValue({ from } as never);

    const counts = await computeInteractionStageCounts(
      doctorId,
      { scope: 'all' },
      'corr-dedupe'
    );

    // convA new_lead + convB needs_review → all shows only new_lead
    expect(counts.needs_review).toBe(1);
    expect(counts.new_lead).toBe(1);
    expect(counts.all).toBe(1);
  });
});

describe('getInteractionForDoctor (ibi-06/07)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws NotFoundError when neither conversation nor unlinked lead exists', async () => {
    const chain: Record<string, unknown> = {};
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.is = jest.fn(() => chain);
    chain.maybeSingle = jest.fn(async () => ({ data: null, error: null }));

    mockGetSupabase.mockReturnValue({
      from: jest.fn(() => chain),
    } as never);

    await expect(
      getInteractionForDoctor(doctorId, convId, 'corr-1')
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
