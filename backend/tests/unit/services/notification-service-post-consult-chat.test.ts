/**
 * Notification Service · Post-consult chat-history DM (Plan 07 · Task 31)
 *
 * Covers `sendPostConsultChatHistoryDm` — fired from
 * `consultation-session-service.ts#endSession` (fire-and-forget) to ping
 * the patient with a 90-day-TTL link to their readonly chat history.
 *
 * Pins:
 *   - **Channels**: IG-DM + SMS in parallel via `Promise.allSettled`.
 *     Email is intentionally NOT in the fan-out (Decision 1 sub-decision
 *     comment — preserves email signal for booking/payment/Rx delivery).
 *   - **Idempotency**: keyed on `consultation_sessions.post_consult_dm_sent_at`
 *     (column added in migration 067). A second call after the first
 *     dispatch returns `{ skipped: true, reason: 'already_sent' }`
 *     without touching providers.
 *   - **Audit row** written by `logAuditEvent` after every fan-out
 *     attempt — even on full failure — so a future reconciliation
 *     cron can sweep `post_consult_dm_sent_at IS NOT NULL AND any_sent
 *     = false`.
 *   - **HMAC mint**: uses the existing `generateConsultationToken`
 *     primitive with a 90-day TTL. Failure to mint short-circuits as
 *     `{ skipped: true, reason: 'hmac_mint_failed' }`.
 *   - **Defensive skips**: missing `actual_ended_at`,
 *     `APP_BASE_URL` unset, no patient on session, no reachable
 *     channels — all map to a structured `{ skipped, reason }` and
 *     never throw.
 *   - **Stamp-on-attempt semantics**: the dedup column is updated even
 *     when every channel fails so a tight retry loop can't hammer
 *     providers (defer to the audit log for retry decisions).
 *
 * Out of scope:
 *   - The DM string contents (covered in `dm-copy-post-consult-chat.test.ts`).
 *   - The endSession call site (covered in
 *     `consultation-session-service-end-session-sends-chat-dm.test.ts`).
 *   - The `/chat-history-token` token-exchange route (covered in
 *     `consultation-chat-history-token.test.ts`).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ----------------------------------------------------------------------------
// Mocks (hoisted by jest before module evaluation).
// ----------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/config/email', () => ({
  sendEmail: jest.fn(),
}));
jest.mock('../../../src/services/twilio-sms-service', () => ({
  sendSms: jest.fn(),
}));
jest.mock('../../../src/services/instagram-service', () => ({
  sendInstagramMessage: jest.fn(),
  sendInstagramImage:   jest.fn(),
}));
jest.mock('../../../src/services/instagram-connect-service', () => ({
  getInstagramAccessTokenForDoctor: jest
    .fn<() => Promise<string>>()
    .mockResolvedValue('doctor-ig-token'),
}));
jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: jest
    .fn<() => Promise<{ practice_name: string; timezone: string }>>()
    .mockResolvedValue({
      practice_name: "Dr. Sharma's practice",
      timezone:      'Asia/Kolkata',
    }),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logAuditEvent: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
jest.mock('../../../src/services/consultation-session-service', () => ({
  // Imported by notification-service.ts at module load (used by other
  // helpers, not by sendPostConsultChatHistoryDm). Mock keeps the
  // module graph happy.
  getJoinTokenForAppointment: jest.fn(),
}));
jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// Lock env BEFORE the service is imported. APP_BASE_URL is required for
// the joinUrl composition; CONSULTATION_TOKEN_SECRET feeds the real
// HMAC primitive (we deliberately exercise it end-to-end so a future
// breaking change to the primitive surfaces in this test, not just the
// dedicated consultation-token unit test).
process.env.APP_BASE_URL = 'https://app.clariva.test';
process.env.CONSULTATION_TOKEN_SECRET =
  'unit-test-consultation-token-secret-32-chars-min-length';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const notificationService = require('../../../src/services/notification-service') as {
  sendPostConsultChatHistoryDm: (input: {
    sessionId:     string;
    correlationId: string;
  }) => Promise<unknown>;
};
const { sendPostConsultChatHistoryDm } = notificationService;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const database = require('../../../src/config/database');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const smsService = require('../../../src/services/twilio-sms-service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const instagramService = require('../../../src/services/instagram-service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const auditLogger = require('../../../src/utils/audit-logger');

// ----------------------------------------------------------------------------
// Constants + fixtures
// ----------------------------------------------------------------------------

const sessionId      = '11111111-1111-1111-1111-111111111111';
const appointmentId  = '22222222-2222-2222-2222-222222222222';
const doctorId       = '33333333-3333-3333-3333-333333333333';
const patientId      = '44444444-4444-4444-4444-444444444444';
const conversationId = '66666666-6666-6666-6666-666666666666';
const correlationId  = 'cid-post-consult-chat-test';

interface PatientShape {
  phone:                string | null;
  email:                string | null;
  platform:             string | null;
  platform_external_id: string | null;
}

interface BuildSupabaseOpts {
  session?: {
    found:                  boolean;
    actualEndedAtIso?:      string | null;
    patientId?:             string | null;
    postConsultDmSentAtIso?: string | null;
  };
  appointment?: { found: boolean; phone?: string | null };
  patient?:     PatientShape | null;
  conversation?: { platform_conversation_id: string } | null;
  /**
   * If supplied, the test wants to introspect the payload sent to
   * `consultation_sessions.update({...}).eq('id', sessionId)`. Each
   * call appends `{ sessionId, payload }` to this array.
   */
  captureSessionUpdate?: { sessionId: string; payload: unknown }[];
}

/**
 * Build a Supabase admin-client mock that handles every chain shape the
 * helper uses. Mirrors the pattern in `notification-service-fanout.test.ts`
 * — kept self-contained here rather than extracted to share helper
 * because the column set differs (we select `post_consult_dm_sent_at`
 * which the fan-out doesn't).
 */
function buildSupabaseMock(opts: BuildSupabaseOpts) {
  const sessionRow = opts.session?.found
    ? {
        id:                       sessionId,
        appointment_id:           appointmentId,
        doctor_id:                doctorId,
        patient_id:               opts.session.patientId === undefined
          ? patientId
          : opts.session.patientId,
        actual_ended_at:          opts.session.actualEndedAtIso ?? null,
        post_consult_dm_sent_at:  opts.session.postConsultDmSentAtIso ?? null,
      }
    : null;

  const appointmentRow = opts.appointment?.found
    ? {
        id:               appointmentId,
        patient_id:       patientId,
        patient_phone:    opts.appointment.phone === undefined ? null : opts.appointment.phone,
        doctor_id:        doctorId,
        conversation_id:  conversationId,
      }
    : null;

  const patientRow = opts.patient ?? null;
  const conversationRow = opts.conversation ?? null;
  const updateCaptures = opts.captureSessionUpdate ?? [];

  const buildSelectChain = (table: string) => {
    const chain: Record<string, unknown> = {
      select: jest.fn(() => chain),
      eq:     jest.fn(() => chain),
      limit:  jest.fn(() => chain),
      maybeSingle: jest.fn().mockImplementation(() => {
        if (table === 'consultation_sessions') {
          return Promise.resolve({ data: sessionRow, error: null });
        }
        if (table === 'conversations') {
          return Promise.resolve({ data: conversationRow, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      single: jest.fn().mockImplementation(() => {
        if (table === 'appointments') {
          return Promise.resolve({
            data:  appointmentRow,
            error: appointmentRow ? null : { message: 'not found' },
          });
        }
        if (table === 'patients') {
          return Promise.resolve({
            data:  patientRow,
            error: patientRow ? null : { message: 'not found' },
          });
        }
        if (table === 'conversations') {
          return Promise.resolve({ data: conversationRow, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };
    return chain;
  };

  const buildUpdateChain = (table: string) => {
    let payload: unknown = null;
    const chain: Record<string, unknown> = {
      update: jest.fn((p: unknown) => {
        payload = p;
        return chain;
      }),
      eq: jest.fn((_col: string, val: string) => {
        if (table === 'consultation_sessions') {
          updateCaptures.push({ sessionId: val, payload });
        }
        return chain;
      }),
      then: (cb: (r: { data: null; error: null }) => unknown) =>
        Promise.resolve(cb({ data: null, error: null })),
    };
    return chain;
  };

  const from = jest.fn((table: string) => {
    let activeChain: Record<string, unknown> | null = null;

    const ensureSelect = () => {
      if (!activeChain) activeChain = buildSelectChain(table);
      return activeChain;
    };
    const ensureUpdate = () => {
      if (!activeChain) activeChain = buildUpdateChain(table);
      return activeChain;
    };

    return {
      select: jest.fn((...args: unknown[]) => {
        const c = ensureSelect();
        (c.select as jest.Mock)(...args);
        return c;
      }),
      update: jest.fn((...args: unknown[]) => {
        const c = ensureUpdate();
        (c.update as jest.Mock)(...args);
        return c;
      }),
      eq: jest.fn(() => {
        throw new Error(`Unexpected .eq() before .select()/.update() on ${table}`);
      }),
    };
  });

  return { from };
}

function defaultPatient(overrides: Partial<PatientShape> = {}): PatientShape {
  return {
    phone:                '+15551234567',
    email:                'patient@example.com',
    platform:             'instagram',
    platform_external_id: 'ig-psid-12345',
    ...overrides,
  };
}

// ----------------------------------------------------------------------------
// Setup
// ----------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  smsService.sendSms.mockResolvedValue(true);
  instagramService.sendInstagramMessage.mockResolvedValue({
    message_id:   'ig-mid-post-consult',
    recipient_id: 'ig-psid-12345',
  });
  auditLogger.logAuditEvent.mockResolvedValue(undefined);
});

// ============================================================================
// Happy path
// ============================================================================

describe('sendPostConsultChatHistoryDm — happy path', () => {
  it('fans out IG-DM + SMS in parallel, stamps post_consult_dm_sent_at, audits success', async () => {
    const captured: { sessionId: string; payload: unknown }[] = [];
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        session: {
          found:             true,
          actualEndedAtIso:  '2026-04-19T12:00:00Z',
        },
        appointment: { found: true, phone: '+15551234567' },
        patient:     defaultPatient(),
        captureSessionUpdate: captured,
      }),
    );

    const result = (await sendPostConsultChatHistoryDm({
      sessionId,
      correlationId,
    })) as {
      anySent: boolean;
      channels: Array<{ channel: string; status: string }>;
    };

    expect(result.anySent).toBe(true);
    expect(result.channels.map((c) => c.channel).sort()).toEqual([
      'instagram_dm',
      'sms',
    ]);
    expect(result.channels.every((c) => c.status === 'sent')).toBe(true);

    // Decision 1 sub-decision: NO email channel for chat-history DM.
    expect(result.channels.find((c) => c.channel === 'email')).toBeUndefined();

    expect(smsService.sendSms).toHaveBeenCalledTimes(1);
    expect(instagramService.sendInstagramMessage).toHaveBeenCalledTimes(1);

    // Both channels see the same composed body — joinUrl is the proof
    // that env wiring + HMAC mint completed end-to-end.
    const smsBody = smsService.sendSms.mock.calls[0][1] as string;
    const igBody  = instagramService.sendInstagramMessage.mock.calls[0][1] as string;
    expect(smsBody).toContain('https://app.clariva.test/c/history/' + sessionId + '?t=');
    expect(igBody).toContain('https://app.clariva.test/c/history/' + sessionId + '?t=');
    expect(smsBody).toContain("Dr. Sharma's practice");
    expect(smsBody).toContain('Available for 90 days');

    // Dedup column stamped — exactly one update against this session.
    expect(captured).toHaveLength(1);
    expect(captured[0].sessionId).toBe(sessionId);
    expect(captured[0].payload).toMatchObject({
      post_consult_dm_sent_at: expect.any(String),
    });

    // Audit row written, success status, channels reflected.
    expect(auditLogger.logAuditEvent).toHaveBeenCalledTimes(1);
    const auditCall = auditLogger.logAuditEvent.mock.calls[0][0];
    expect(auditCall.action).toBe('post_consult_chat_history_notification');
    expect(auditCall.resourceType).toBe('consultation_session');
    expect(auditCall.resourceId).toBe(sessionId);
    expect(auditCall.status).toBe('success');
    expect(auditCall.metadata.any_sent).toBe(true);
  });

  it('routes through SMS only when the patient has no IG identity', async () => {
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        session: {
          found:             true,
          actualEndedAtIso:  '2026-04-19T12:00:00Z',
        },
        appointment: { found: true, phone: '+15551234567' },
        patient: defaultPatient({
          platform:             null,
          platform_external_id: null,
        }),
        conversation: null,
      }),
    );

    const result = (await sendPostConsultChatHistoryDm({
      sessionId,
      correlationId,
    })) as {
      anySent: boolean;
      channels: Array<{ channel: string; status: string; reason?: string }>;
    };

    expect(result.anySent).toBe(true);
    const sms = result.channels.find((c) => c.channel === 'sms');
    const ig  = result.channels.find((c) => c.channel === 'instagram_dm');
    expect(sms?.status).toBe('sent');
    expect(ig?.status).toBe('skipped');
    expect(ig?.reason).toBe('no_recipient');
    expect(instagramService.sendInstagramMessage).not.toHaveBeenCalled();
  });

  it('still ships IG-DM when SMS provider rejects (Promise.allSettled isolation)', async () => {
    smsService.sendSms.mockRejectedValueOnce(new Error('twilio 503'));
    const captured: { sessionId: string; payload: unknown }[] = [];
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        session: {
          found:             true,
          actualEndedAtIso:  '2026-04-19T12:00:00Z',
        },
        appointment: { found: true, phone: '+15551234567' },
        patient:     defaultPatient(),
        captureSessionUpdate: captured,
      }),
    );

    const result = (await sendPostConsultChatHistoryDm({
      sessionId,
      correlationId,
    })) as {
      anySent: boolean;
      channels: Array<{ channel: string; status: string; error?: string }>;
    };

    expect(result.anySent).toBe(true);
    expect(result.channels.find((c) => c.channel === 'sms')?.status).toBe('failed');
    expect(result.channels.find((c) => c.channel === 'instagram_dm')?.status).toBe('sent');

    // Dedup column STILL stamped — partial-success is "we tried"
    expect(captured).toHaveLength(1);
  });

  it('stamps the dedup column AND audits failure when both channels fail', async () => {
    smsService.sendSms.mockResolvedValueOnce(false);
    instagramService.sendInstagramMessage.mockRejectedValueOnce(
      new Error('meta graph api 5xx'),
    );
    const captured: { sessionId: string; payload: unknown }[] = [];
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        session: {
          found:             true,
          actualEndedAtIso:  '2026-04-19T12:00:00Z',
        },
        appointment: { found: true, phone: '+15551234567' },
        patient:     defaultPatient(),
        captureSessionUpdate: captured,
      }),
    );

    const result = (await sendPostConsultChatHistoryDm({
      sessionId,
      correlationId,
    })) as {
      anySent: boolean;
      channels: Array<{ channel: string; status: string }>;
    };

    expect(result.anySent).toBe(false);
    expect(result.channels.every((c) => c.status === 'failed')).toBe(true);

    // Stamp-on-attempt: prevents tight retry loops from hammering the
    // providers. Reconciliation cron's job to retry, not the inline
    // helper's.
    expect(captured).toHaveLength(1);

    // Audit reflects failure status.
    const auditCall = auditLogger.logAuditEvent.mock.calls[0][0];
    expect(auditCall.status).toBe('failure');
    expect(auditCall.metadata.any_sent).toBe(false);
  });
});

// ============================================================================
// Idempotency
// ============================================================================

describe('sendPostConsultChatHistoryDm — idempotency', () => {
  it('short-circuits with already_sent when post_consult_dm_sent_at is set', async () => {
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        session: {
          found:                   true,
          actualEndedAtIso:        '2026-04-19T12:00:00Z',
          postConsultDmSentAtIso:  '2026-04-19T12:01:00Z',
        },
        appointment: { found: true },
        patient:     defaultPatient(),
      }),
    );

    const result = (await sendPostConsultChatHistoryDm({
      sessionId,
      correlationId,
    })) as { skipped: true; reason: string };

    expect(result).toEqual({ skipped: true, reason: 'already_sent' });

    // Crucial: no providers called, no audit row written.
    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(instagramService.sendInstagramMessage).not.toHaveBeenCalled();
    expect(auditLogger.logAuditEvent).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Defensive skips
// ============================================================================

describe('sendPostConsultChatHistoryDm — defensive skips', () => {
  it('skips when admin client is unavailable', async () => {
    database.getSupabaseAdminClient.mockReturnValue(null);

    const result = (await sendPostConsultChatHistoryDm({
      sessionId,
      correlationId,
    })) as { skipped: true; reason: string };

    expect(result).toEqual({ skipped: true, reason: 'admin_client_unavailable' });
  });

  it('skips when the session lookup returns null', async () => {
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({ session: { found: false } }),
    );

    const result = (await sendPostConsultChatHistoryDm({
      sessionId,
      correlationId,
    })) as { skipped: true; reason: string };

    expect(result).toEqual({ skipped: true, reason: 'session_not_found' });
    expect(auditLogger.logAuditEvent).not.toHaveBeenCalled();
  });

  it('skips when the session has no patient_id (guest booking edge)', async () => {
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        session: {
          found:             true,
          actualEndedAtIso:  '2026-04-19T12:00:00Z',
          patientId:         null,
        },
      }),
    );

    const result = (await sendPostConsultChatHistoryDm({
      sessionId,
      correlationId,
    })) as { skipped: true; reason: string };

    expect(result).toEqual({ skipped: true, reason: 'no_patient_on_session' });
  });

  it('skips when actual_ended_at is missing (defensive — endSession sets this)', async () => {
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        session: {
          found:             true,
          actualEndedAtIso:  null,
        },
      }),
    );

    const result = (await sendPostConsultChatHistoryDm({
      sessionId,
      correlationId,
    })) as { skipped: true; reason: string };

    expect(result).toEqual({ skipped: true, reason: 'session_not_ended' });
  });

  it('skips when APP_BASE_URL is unset', async () => {
    const originalBaseUrl = process.env.APP_BASE_URL;
    delete process.env.APP_BASE_URL;
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const reloaded = require('../../../src/services/notification-service') as {
      sendPostConsultChatHistoryDm: typeof sendPostConsultChatHistoryDm;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const databaseReloaded = require('../../../src/config/database');
    databaseReloaded.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        session: {
          found:             true,
          actualEndedAtIso:  '2026-04-19T12:00:00Z',
        },
      }),
    );

    try {
      const result = (await reloaded.sendPostConsultChatHistoryDm({
        sessionId,
        correlationId,
      })) as { skipped: true; reason: string };

      expect(result).toEqual({ skipped: true, reason: 'app_base_url_unset' });
    } finally {
      if (originalBaseUrl) process.env.APP_BASE_URL = originalBaseUrl;
    }
  });

  it('skips when the appointment lookup fails (no fan-out target)', async () => {
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        session: {
          found:             true,
          actualEndedAtIso:  '2026-04-19T12:00:00Z',
        },
        appointment: { found: false },
      }),
    );

    const result = (await sendPostConsultChatHistoryDm({
      sessionId,
      correlationId,
    })) as { skipped: true; reason: string };

    expect(result).toEqual({ skipped: true, reason: 'appointment_not_found' });
    expect(smsService.sendSms).not.toHaveBeenCalled();
  });

  it('skips when no SMS phone and no IG identity is reachable', async () => {
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        session: {
          found:             true,
          actualEndedAtIso:  '2026-04-19T12:00:00Z',
        },
        appointment: { found: true, phone: null },
        patient: defaultPatient({
          phone:                null,
          platform:             null,
          platform_external_id: null,
        }),
        conversation: null,
      }),
    );

    const result = (await sendPostConsultChatHistoryDm({
      sessionId,
      correlationId,
    })) as { skipped: true; reason: string };

    expect(result).toEqual({ skipped: true, reason: 'no_channels' });
    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(instagramService.sendInstagramMessage).not.toHaveBeenCalled();
  });
});
