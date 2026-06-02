/**
 * Plan 01 / Task 03 — reassignServiceStaffReviewRequest: hint-append learning flow.
 *
 * Asserts that on reassign:
 *  - correctServiceHintAppend is sanitized and appended to the target service's hints.
 *  - wrongServiceHintAppend is sanitized and appended to the originally-proposed service's hints.
 *  - The wrong-service branch is skipped when proposed == final (no teaching needed).
 *  - No hint appends happen when neither payload is provided.
 *  - Audit event metadata records which hint branches fired.
 *  - Review row is transitioned from pending → reassigned.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/services/doctor-settings-service', () => ({
  __esModule: true,
  getDoctorSettings: jest.fn(),
  appendMatcherHintsOnDoctorCatalogOffering: jest.fn(),
}));

jest.mock('../../../src/services/conversation-service', () => ({
  __esModule: true,
  findConversationById: jest.fn(),
  getConversationState: jest.fn(),
  updateConversationState: jest.fn(),
}));

jest.mock('../../../src/services/service-match-learning-ingest', () => ({
  __esModule: true,
  ingestServiceMatchLearningExample: jest.fn(),
}));

jest.mock('../../../src/services/instagram-connect-service', () => ({
  __esModule: true,
  getInstagramAccessTokenForDoctor: jest.fn(),
}));

jest.mock('../../../src/services/instagram-service', () => ({
  __esModule: true,
  sendInstagramMessage: jest.fn(),
}));

jest.mock('../../../src/services/message-service', () => ({
  __esModule: true,
  createMessage: jest.fn(),
}));

jest.mock('../../../src/services/slot-selection-service', () => ({
  __esModule: true,
  buildBookingPageUrl: jest.fn().mockReturnValue('https://book.example/x'),
}));

jest.mock('../../../src/services/service-match-learning-shadow', () => ({
  __esModule: true,
  recordShadowEvaluationForNewPendingReview: jest.fn(),
}));

jest.mock('../../../src/services/service-match-learning-assist', () => ({
  __esModule: true,
  fetchAssistHintForReviewRow: jest.fn(),
}));

import { reassignServiceStaffReviewRequest } from '../../../src/services/service-staff-review-service';
import * as database from '../../../src/config/database';
import * as doctorSettings from '../../../src/services/doctor-settings-service';
import * as conversationService from '../../../src/services/conversation-service';
import type { DoctorSettingsRow } from '../../../src/types/doctor-settings';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedDoctorSettings = doctorSettings as jest.Mocked<typeof doctorSettings>;
const mockedConv = conversationService as jest.Mocked<typeof conversationService>;

const doctorId = '550e8400-e29b-41d4-a716-446655440001';
const actorUserId = doctorId;
const reviewId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const correlationId = 'corr-reassign-001';

const SVC_ACNE_ID = '11111111-1111-4111-8111-111111111111';
const SVC_HAIR_ID = '22222222-2222-4222-8222-222222222222';
const SVC_OTHER_ID = '33333333-3333-4333-8333-333333333333';

function baseReviewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: reviewId,
    doctor_id: doctorId,
    conversation_id: 'conv-1',
    patient_id: null,
    correlation_id: null,
    status: 'pending',
    proposed_catalog_service_key: 'hair_treatment',
    proposed_catalog_service_id: SVC_HAIR_ID,
    proposed_consultation_modality: 'text',
    match_confidence: 'low',
    match_reason_codes: [],
    candidate_labels: [],
    sla_deadline_at: null,
    sla_breached_at: null,
    created_at: '2026-04-16T00:00:00Z',
    updated_at: '2026-04-16T00:00:00Z',
    resolved_at: null,
    resolved_by_user_id: null,
    final_catalog_service_key: null,
    final_catalog_service_id: null,
    final_consultation_modality: null,
    resolution_internal_note: null,
    ...overrides,
  };
}

function makeDoctorSettings(): DoctorSettingsRow {
  return {
    doctor_id: doctorId,
    appointment_fee_minor: 50000,
    appointment_fee_currency: 'INR',
    country: 'IN',
    practice_name: null,
    timezone: 'Asia/Kolkata',
    slot_interval_minutes: 15,
    max_advance_booking_days: 90,
    min_advance_hours: 0,
    business_hours_summary: null,
    cancellation_policy_hours: null,
    max_appointments_per_day: null,
    booking_buffer_minutes: null,
    welcome_message: null,
    specialty: null,
    address_summary: null,
    consultation_types: null,
    service_offerings_json: {
      version: 1,
      services: [
        {
          service_id: SVC_ACNE_ID,
          service_key: 'acne_treatment',
          label: 'Acne Treatment',
          modalities: { text: { enabled: true, price_minor: 50000 } },
        },
        {
          service_id: SVC_HAIR_ID,
          service_key: 'hair_treatment',
          label: 'Hair Treatment',
          modalities: { text: { enabled: true, price_minor: 50000 } },
        },
        {
          service_id: SVC_OTHER_ID,
          service_key: 'other',
          label: 'Other / not listed',
          modalities: { text: { enabled: true, price_minor: 50000 } },
        },
      ],
    },
    service_catalog_templates_json: { templates: [] },
    default_notes: null,
    payout_schedule: null,
    payout_minor: null,
    razorpay_linked_account_id: null,
    opd_mode: 'slot',
    opd_policies: null,
    instagram_receptionist_paused: false,
    instagram_receptionist_pause_message: null,
    catalog_mode: null,
    created_at: '',
    updated_at: '',
  } as DoctorSettingsRow;
}

/**
 * Mock `getSupabaseAdminClient()` for the reassign path. We simulate three tables:
 *   - service_staff_review_requests: select-one (review lookup) + update (state transition)
 *   - service_staff_review_audit_events: insert (audit)
 * Anything else returns a minimal chain whose terminals resolve to `{ data: null, error: null }`
 * (safe no-ops for side-paths we don't care about here).
 */
function installSupabaseMock(opts: { reviewRow: Record<string, unknown> }): {
  updatedPayload: Record<string, unknown> | null;
  auditInsertPayload: Record<string, unknown> | null;
} {
  const box = {
    updatedPayload: null as Record<string, unknown> | null,
    auditInsertPayload: null as Record<string, unknown> | null,
  };

  const from = jest.fn().mockImplementation((...args: unknown[]) => {
    const table = args[0] as string;
    if (table === 'service_staff_review_requests') {
      // Two code paths on this table:
      //  - .select('*').eq(...).eq(...).maybeSingle()  → return reviewRow
      //  - .update(...).eq(...).eq(...).select('*').single()  → capture payload, return updated row
      return {
        select: jest.fn().mockImplementation(() => {
          const eqFirst = jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest
                .fn()
                .mockResolvedValue({ data: opts.reviewRow, error: null } as never),
            }),
          });
          return { eq: eqFirst };
        }),
        update: jest.fn().mockImplementation((...updArgs: unknown[]) => {
          const payload = updArgs[0] as Record<string, unknown>;
          box.updatedPayload = payload;
          return {
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  single: jest.fn().mockResolvedValue({
                    data: { ...opts.reviewRow, ...payload, status: 'reassigned' },
                    error: null,
                  } as never),
                }),
              }),
            }),
          };
        }),
      };
    }

    if (table === 'service_staff_review_audit_events') {
      return {
        insert: jest.fn().mockImplementation((...insArgs: unknown[]) => {
          const payload = insArgs[0] as Record<string, unknown>;
          box.auditInsertPayload = payload;
          return Promise.resolve({ error: null });
        }),
      };
    }

    // Minimal safe fall-through for any other table we don't directly care about.
    const chain: Record<string, unknown> = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ error: null } as never),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null } as never),
      single: jest.fn().mockResolvedValue({ data: null, error: null } as never),
    };
    return chain;
  });

  mockedDb.getSupabaseAdminClient.mockReturnValue({ from } as never);
  return box;
}

describe('reassignServiceStaffReviewRequest (hint-append learning)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDoctorSettings.getDoctorSettings.mockResolvedValue(makeDoctorSettings());
    mockedDoctorSettings.appendMatcherHintsOnDoctorCatalogOffering.mockResolvedValue(true);
    mockedConv.findConversationById.mockResolvedValue(null as never); // DM branch is a no-op
    mockedConv.getConversationState.mockResolvedValue({} as never);
    mockedConv.updateConversationState.mockResolvedValue({ id: 'conv-1' } as never);
  });

  it('appends correct-service hints on the final service (include_when path)', async () => {
    const audit = installSupabaseMock({ reviewRow: baseReviewRow() });

    await reassignServiceStaffReviewRequest({
      doctorId,
      actorUserId,
      reviewId,
      correlationId,
      catalogServiceKey: 'acne_treatment',
      correctServiceHintAppend: { include_when: '  Severe ACNE on back!!  ' },
    });

    const calls = mockedDoctorSettings.appendMatcherHintsOnDoctorCatalogOffering.mock.calls;
    // Expect exactly one call — to the correct service (sanitized payload).
    expect(calls).toHaveLength(1);
    const [dId, cId, svcKey, patch] = calls[0]!;
    expect(dId).toBe(doctorId);
    expect(cId).toBe(correlationId);
    expect(svcKey).toBe('acne_treatment');
    expect(patch).toEqual({ include_when: 'severe acne on back' });

    // Audit metadata should flag correct_service_hints_appended.
    expect(audit.auditInsertPayload).not.toBeNull();
    const auditMeta = (audit.auditInsertPayload!['metadata'] ?? {}) as Record<string, unknown>;
    expect(auditMeta['correct_service_hints_appended']).toBe(true);
    expect(auditMeta['wrong_service_hints_appended']).toBeUndefined();
    expect(auditMeta['catalog_matcher_hints_updated']).toBe(true);

    // Review row should be transitioned to reassigned (correct final keys/ids).
    expect(audit.updatedPayload).not.toBeNull();
    expect(audit.updatedPayload!['status']).toBe('reassigned');
    expect(audit.updatedPayload!['final_catalog_service_key']).toBe('acne_treatment');
    expect(audit.updatedPayload!['final_catalog_service_id']).toBe(SVC_ACNE_ID);
  });

  it('appends wrong-service hints on the originally-proposed service (exclude_when path)', async () => {
    const audit = installSupabaseMock({ reviewRow: baseReviewRow() });

    await reassignServiceStaffReviewRequest({
      doctorId,
      actorUserId,
      reviewId,
      correlationId,
      catalogServiceKey: 'acne_treatment',
      wrongServiceHintAppend: { exclude_when: 'Severe acne on back' },
    });

    const calls = mockedDoctorSettings.appendMatcherHintsOnDoctorCatalogOffering.mock.calls;
    expect(calls).toHaveLength(1);
    const [, , svcKey, patch] = calls[0]!;
    // wrong service = originally-proposed ("hair_treatment"), lowercased/trimmed.
    expect(svcKey).toBe('hair_treatment');
    expect(patch).toEqual({ exclude_when: 'severe acne on back' });

    const auditMeta = (audit.auditInsertPayload!['metadata'] ?? {}) as Record<string, unknown>;
    expect(auditMeta['wrong_service_hints_appended']).toBe(true);
    expect(auditMeta['correct_service_hints_appended']).toBeUndefined();
  });

  it('appends to BOTH services when both patches are provided', async () => {
    installSupabaseMock({ reviewRow: baseReviewRow() });

    await reassignServiceStaffReviewRequest({
      doctorId,
      actorUserId,
      reviewId,
      correlationId,
      catalogServiceKey: 'acne_treatment',
      correctServiceHintAppend: { include_when: 'severe acne on back' },
      wrongServiceHintAppend: { exclude_when: 'severe acne on back' },
    });

    const calls = mockedDoctorSettings.appendMatcherHintsOnDoctorCatalogOffering.mock.calls;
    expect(calls).toHaveLength(2);
    const keys = calls.map((c) => c[2]);
    expect(keys).toEqual(expect.arrayContaining(['acne_treatment', 'hair_treatment']));
  });

  it('skips wrong-service branch when reassigning to the same service as proposed', async () => {
    installSupabaseMock({
      reviewRow: baseReviewRow({
        proposed_catalog_service_key: 'acne_treatment',
        proposed_catalog_service_id: SVC_ACNE_ID,
      }),
    });

    await reassignServiceStaffReviewRequest({
      doctorId,
      actorUserId,
      reviewId,
      correlationId,
      catalogServiceKey: 'acne_treatment', // same as proposed
      correctServiceHintAppend: { include_when: 'severe acne on back' },
      wrongServiceHintAppend: { exclude_when: 'should not be applied' },
    });

    const calls = mockedDoctorSettings.appendMatcherHintsOnDoctorCatalogOffering.mock.calls;
    // Only the correct-service call should have been made.
    expect(calls).toHaveLength(1);
    expect(calls[0]![2]).toBe('acne_treatment');
    expect(calls[0]![3]).toEqual({ include_when: 'severe acne on back' });
  });

  it('does not call append helper when neither hint payload is provided', async () => {
    const audit = installSupabaseMock({ reviewRow: baseReviewRow() });

    await reassignServiceStaffReviewRequest({
      doctorId,
      actorUserId,
      reviewId,
      correlationId,
      catalogServiceKey: 'acne_treatment',
    });

    expect(mockedDoctorSettings.appendMatcherHintsOnDoctorCatalogOffering).not.toHaveBeenCalled();

    const auditMeta = (audit.auditInsertPayload!['metadata'] ?? {}) as Record<string, unknown>;
    expect(auditMeta['correct_service_hints_appended']).toBeUndefined();
    expect(auditMeta['wrong_service_hints_appended']).toBeUndefined();
    expect(auditMeta['catalog_matcher_hints_updated']).toBeUndefined();
  });

  it('omits empty sanitized patches (e.g. whitespace-only) without crashing', async () => {
    installSupabaseMock({ reviewRow: baseReviewRow() });

    await reassignServiceStaffReviewRequest({
      doctorId,
      actorUserId,
      reviewId,
      correlationId,
      catalogServiceKey: 'acne_treatment',
      correctServiceHintAppend: { include_when: '   ' },
      wrongServiceHintAppend: { exclude_when: '\n\t' },
    });

    expect(mockedDoctorSettings.appendMatcherHintsOnDoctorCatalogOffering).not.toHaveBeenCalled();
  });
});
