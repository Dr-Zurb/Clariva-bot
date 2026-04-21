/**
 * Notification Service · Mutual replay notifications (Plan 07 · Task 30)
 *
 * Covers `notifyPatientOfDoctorReplay` and `notifyDoctorOfPatientReplay`.
 *
 * Pins:
 *   - **Patient DM (doctor replayed)**: SMS + IG-DM in parallel via
 *     `Promise.allSettled`, email is intentionally NOT in the channel
 *     set (Decision 4 + helper rationale comment).
 *   - **Idempotency (patient)**: pre-checks `audit_logs` for any row
 *     keyed on `(action, metadata->>recording_access_audit_id)` and
 *     short-circuits with `{ skipped, reason: 'already_notified' }` —
 *     never re-fires DMs.
 *   - **Audit row written** by `logAuditEvent` after every fan-out
 *     attempt, so the dedup key is set even on `anySent === false`
 *     (a future reconciliation cron sweeps failures).
 *   - **Doctor dashboard event (patient replayed)**: delegates the
 *     idempotency + insert to `dashboard-events-service.insertDashboardEvent`,
 *     does NOT send DMs / SMS / email (Decision 4).
 *   - **No throws** from either helper — the calling
 *     `recording-access-service.mintReplayUrl` invokes them
 *     fire-and-forget; a thrown error would incorrectly bubble into a
 *     legitimate replay.
 *   - **Skip semantics**: every "we couldn't send" branch returns a
 *     structured `{ skipped: true, reason }` so the caller (and tests)
 *     can grep for the rationale.
 *
 * Out of scope:
 *   - The DM string contents (covered in
 *     `dm-copy-recording-replayed.test.ts`).
 *   - The cursor + RLS semantics of dashboard events (covered in
 *     `dashboard-events-service.test.ts`).
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
      practice_name: 'Sunrise Clinic',
      timezone:      'Asia/Kolkata',
    }),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logAuditEvent: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
jest.mock('../../../src/services/consultation-session-service', () => ({
  getJoinTokenForAppointment: jest.fn(),
}));
jest.mock('../../../src/services/dashboard-events-service', () => ({
  insertDashboardEvent: jest.fn(),
}));
jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

process.env.CONSULTATION_JOIN_BASE_URL = 'https://app.clariva.test/consult/join';
process.env.PRESCRIPTION_VIEW_BASE_URL = 'https://app.clariva.test/rx';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const notificationService = require('../../../src/services/notification-service') as {
  notifyPatientOfDoctorReplay: (input: {
    sessionId:              string;
    artifactType:           'audio' | 'transcript';
    recordingAccessAuditId: string;
    correlationId:          string;
  }) => Promise<unknown>;
  notifyDoctorOfPatientReplay: (input: {
    sessionId:              string;
    artifactType:           'audio' | 'transcript';
    recordingAccessAuditId: string;
    accessedByRole:         'patient' | 'support_staff';
    accessedByUserId:       string;
    escalationReason?:      string;
    correlationId:          string;
  }) => Promise<unknown>;
};
const { notifyPatientOfDoctorReplay, notifyDoctorOfPatientReplay } =
  notificationService;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const database = require('../../../src/config/database');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const smsService = require('../../../src/services/twilio-sms-service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const instagramService = require('../../../src/services/instagram-service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const auditLogger = require('../../../src/utils/audit-logger');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dashboardEventsService = require('../../../src/services/dashboard-events-service');

// ----------------------------------------------------------------------------
// Supabase mock builder. Five tables are touched across both helpers:
//   - audit_logs               (patient dedup pre-check)
//   - consultation_sessions    (loadReplayNotificationContext)
//   - patients                 (patient display name + reachability)
//   - conversations            (IG conversation fallback for patient channel)
//   - doctor_settings          (mocked module-level — see jest.mock above)
// ----------------------------------------------------------------------------

interface BuildSupabaseOpts {
  /** Rows returned by the audit_logs idempotency pre-check. */
  auditLogsExisting?: Array<{ id: string }>;
  session?: {
    found:           boolean;
    actualEndedAtIso?: string | null;
  };
  patient?: {
    name?:                string | null;
    phone?:               string | null;
    platform?:            string | null;
    platformExternalId?:  string | null;
  } | null;
  conversation?: { platform_conversation_id: string } | null;
}

function buildSupabaseMock(opts: BuildSupabaseOpts = {}): unknown {
  return {
    from: (table: string): unknown => {
      if (table === 'audit_logs') {
        // Chain: .select('id').eq('action', ...).eq('metadata->>...', ...).limit(1)
        return {
          select: (): unknown => ({
            eq: (): unknown => ({
              eq: (): unknown => ({
                limit: async (): Promise<{
                  data: Array<{ id: string }>;
                  error: null;
                }> => ({
                  data:  opts.auditLogsExisting ?? [],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'consultation_sessions') {
        return {
          select: (): unknown => ({
            eq: (): unknown => ({
              maybeSingle: async (): Promise<{
                data: unknown;
                error: null;
              }> => ({
                data: opts.session?.found
                  ? {
                      doctor_id:       'doc-1',
                      patient_id:      'pat-1',
                      actual_ended_at: opts.session.actualEndedAtIso ?? null,
                    }
                  : null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'patients') {
        return {
          select: (): unknown => ({
            eq: (): unknown => ({
              maybeSingle: async (): Promise<{
                data: unknown;
                error: null;
              }> => ({
                data: opts.patient
                  ? {
                      name:                  opts.patient.name                 ?? null,
                      phone:                 opts.patient.phone                ?? null,
                      platform:              opts.patient.platform             ?? null,
                      platform_external_id:  opts.patient.platformExternalId   ?? null,
                    }
                  : null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'conversations') {
        return {
          select: (): unknown => ({
            eq: (): unknown => ({
              eq: (): unknown => ({
                eq: (): unknown => ({
                  limit: (): unknown => ({
                    maybeSingle: async (): Promise<{
                      data: unknown;
                      error: null;
                    }> => ({
                      data:  opts.conversation ?? null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`buildSupabaseMock: unexpected table ${table}`);
    },
  };
}

// ----------------------------------------------------------------------------
// Setup
// ----------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  smsService.sendSms.mockResolvedValue(true);
  instagramService.sendInstagramMessage.mockResolvedValue({
    message_id: 'ig-msg-1',
  });
  auditLogger.logAuditEvent.mockResolvedValue(undefined);
  dashboardEventsService.insertDashboardEvent.mockResolvedValue({
    inserted: true,
    eventId:  'evt-new',
  });
});

// ============================================================================
// notifyPatientOfDoctorReplay
// ============================================================================

describe('notifyPatientOfDoctorReplay — happy path', () => {
  it('fans out SMS + IG-DM in parallel and writes the dedup audit row', async () => {
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        session: { found: true, actualEndedAtIso: '2026-04-15T12:00:00Z' },
        patient: {
          name: 'Patient One',
          phone: '+15551234567',
          platform: 'instagram',
          platformExternalId: 'ig-pat-1',
        },
      }),
    );

    const result = (await notifyPatientOfDoctorReplay({
      sessionId:              'sess-1',
      artifactType:           'audio',
      recordingAccessAuditId: 'audit-1',
      correlationId:          'cid-1',
    })) as { anySent: boolean; channels: Array<{ channel: string; status: string }> };

    expect(result.anySent).toBe(true);
    expect(result.channels.map((c) => c.channel).sort()).toEqual(
      ['instagram_dm', 'sms'],
    );
    expect(result.channels.every((c) => c.status === 'sent')).toBe(true);

    // Decision 4: NO email channel in the fan-out for replay notifications.
    expect(result.channels.find((c) => c.channel === 'email')).toBeUndefined();

    // SMS + IG providers each called exactly once.
    expect(smsService.sendSms).toHaveBeenCalledTimes(1);
    expect(instagramService.sendInstagramMessage).toHaveBeenCalledTimes(1);

    // The audit row is written keyed on the recording access audit id —
    // this is the dedup key for the next call.
    expect(auditLogger.logAuditEvent).toHaveBeenCalledTimes(1);
    const auditCall = auditLogger.logAuditEvent.mock.calls[0][0];
    expect(auditCall.action).toBe('patient_recording_replay_notification');
    expect(auditCall.metadata.recording_access_audit_id).toBe('audit-1');
    expect(auditCall.metadata.any_sent).toBe(true);
  });

  it('routes through SMS only when the patient has no IG identity', async () => {
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        session: { found: true, actualEndedAtIso: '2026-04-15T12:00:00Z' },
        patient: { name: 'Patient One', phone: '+15551234567', platform: null, platformExternalId: null },
        conversation: null,
      }),
    );

    const result = (await notifyPatientOfDoctorReplay({
      sessionId:              'sess-1',
      artifactType:           'transcript',
      recordingAccessAuditId: 'audit-1',
      correlationId:          'cid-1',
    })) as { anySent: boolean; channels: Array<{ channel: string; status: string; reason?: string }> };

    expect(result.anySent).toBe(true);
    const sms = result.channels.find((c) => c.channel === 'sms');
    const ig  = result.channels.find((c) => c.channel === 'instagram_dm');
    expect(sms?.status).toBe('sent');
    expect(ig?.status).toBe('skipped');
    expect(ig?.reason).toBe('no_recipient');
    expect(instagramService.sendInstagramMessage).not.toHaveBeenCalled();
  });

  it('does not throw when SMS provider rejects — channel marks failed, IG still ships', async () => {
    smsService.sendSms.mockRejectedValueOnce(new Error('twilio 503'));
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        session: { found: true, actualEndedAtIso: '2026-04-15T12:00:00Z' },
        patient: {
          name: 'Patient One',
          phone: '+15551234567',
          platform: 'instagram',
          platformExternalId: 'ig-pat-1',
        },
      }),
    );

    const result = (await notifyPatientOfDoctorReplay({
      sessionId:              'sess-1',
      artifactType:           'audio',
      recordingAccessAuditId: 'audit-1',
      correlationId:          'cid-1',
    })) as { anySent: boolean; channels: Array<{ channel: string; status: string; error?: string }> };

    expect(result.anySent).toBe(true);
    expect(result.channels.find((c) => c.channel === 'sms')?.status).toBe('failed');
    expect(result.channels.find((c) => c.channel === 'instagram_dm')?.status).toBe('sent');
  });
});

describe('notifyPatientOfDoctorReplay — idempotency', () => {
  it('short-circuits with already_notified when audit_logs already has a matching row', async () => {
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        auditLogsExisting: [{ id: 'audit-log-existing' }],
        session: { found: true, actualEndedAtIso: '2026-04-15T12:00:00Z' },
        patient: {
          name: 'Patient One',
          phone: '+15551234567',
          platform: 'instagram',
          platformExternalId: 'ig-pat-1',
        },
      }),
    );

    const result = (await notifyPatientOfDoctorReplay({
      sessionId:              'sess-1',
      artifactType:           'audio',
      recordingAccessAuditId: 'audit-1',
      correlationId:          'cid-1',
    })) as { skipped: true; reason: string };

    expect(result).toEqual({ skipped: true, reason: 'already_notified' });
    // Crucial: no DMs sent, no audit row written.
    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(instagramService.sendInstagramMessage).not.toHaveBeenCalled();
    expect(auditLogger.logAuditEvent).not.toHaveBeenCalled();
  });
});

describe('notifyPatientOfDoctorReplay — defensive skips', () => {
  it('skips when the session lookup returns null', async () => {
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({ session: { found: false } }),
    );

    const result = (await notifyPatientOfDoctorReplay({
      sessionId:              'sess-1',
      artifactType:           'audio',
      recordingAccessAuditId: 'audit-1',
      correlationId:          'cid-1',
    })) as { skipped: true; reason: string };

    expect(result).toEqual({ skipped: true, reason: 'session_not_found' });
    expect(auditLogger.logAuditEvent).not.toHaveBeenCalled();
  });

  it('skips when no SMS phone and no IG identity is reachable', async () => {
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        session: { found: true, actualEndedAtIso: '2026-04-15T12:00:00Z' },
        patient: { phone: null, platform: null, platformExternalId: null },
        conversation: null,
      }),
    );

    const result = (await notifyPatientOfDoctorReplay({
      sessionId:              'sess-1',
      artifactType:           'audio',
      recordingAccessAuditId: 'audit-1',
      correlationId:          'cid-1',
    })) as { skipped: true; reason: string };

    expect(result).toEqual({ skipped: true, reason: 'no_channels' });
    expect(smsService.sendSms).not.toHaveBeenCalled();
  });

  it('skips when the session never ended (defensive — mintReplayUrl normally guards this)', async () => {
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        session: { found: true, actualEndedAtIso: null },
        patient: {
          phone: '+15551234567',
          platform: 'instagram',
          platformExternalId: 'ig-pat-1',
        },
      }),
    );

    const result = (await notifyPatientOfDoctorReplay({
      sessionId:              'sess-1',
      artifactType:           'audio',
      recordingAccessAuditId: 'audit-1',
      correlationId:          'cid-1',
    })) as { skipped: true; reason: string };

    expect(result).toEqual({ skipped: true, reason: 'session_not_ended' });
  });
});

// ============================================================================
// notifyDoctorOfPatientReplay
// ============================================================================

describe('notifyDoctorOfPatientReplay — happy path', () => {
  it('inserts a dashboard event and never sends a DM/SMS/email', async () => {
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        session: { found: true, actualEndedAtIso: '2026-04-15T12:00:00Z' },
        patient: { name: 'Patient One' },
      }),
    );

    const result = (await notifyDoctorOfPatientReplay({
      sessionId:              'sess-1',
      artifactType:           'audio',
      recordingAccessAuditId: 'audit-1',
      accessedByRole:         'patient',
      accessedByUserId:       'pat-1',
      correlationId:          'cid-1',
    })) as { ok: true; eventId: string; inserted: boolean };

    expect(result).toEqual({ ok: true, eventId: 'evt-new', inserted: true });
    // No DMs of any kind.
    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(instagramService.sendInstagramMessage).not.toHaveBeenCalled();

    // The dashboard-events-service is the one writing the event, and we
    // pass the recording access audit id through so it can dedup.
    expect(dashboardEventsService.insertDashboardEvent).toHaveBeenCalledTimes(1);
    const call = dashboardEventsService.insertDashboardEvent.mock.calls[0][0];
    expect(call.doctorId).toBe('doc-1');
    expect(call.eventKind).toBe('patient_replayed_recording');
    expect(call.recordingAccessAuditId).toBe('audit-1');
    expect(call.payload).toMatchObject({
      artifact_type:             'audio',
      recording_access_audit_id: 'audit-1',
      patient_display_name:      'Patient One',
      accessed_by_role:          'patient',
      accessed_by_user_id:       'pat-1',
      consult_date:              '2026-04-15T12:00:00Z',
    });
    // No escalation_reason when not supplied.
    expect(call.payload.escalation_reason).toBeUndefined();
  });

  it('persists escalation_reason in the payload for support_staff replays', async () => {
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        session: { found: true, actualEndedAtIso: '2026-04-15T12:00:00Z' },
        patient: { name: 'Patient One' },
      }),
    );

    await notifyDoctorOfPatientReplay({
      sessionId:              'sess-1',
      artifactType:           'audio',
      recordingAccessAuditId: 'audit-1',
      accessedByRole:         'support_staff',
      accessedByUserId:       'support-1',
      escalationReason:       'Customer ticket #4521',
      correlationId:          'cid-1',
    });

    const call = dashboardEventsService.insertDashboardEvent.mock.calls[0][0];
    expect(call.payload.accessed_by_role).toBe('support_staff');
    expect(call.payload.escalation_reason).toBe('Customer ticket #4521');
  });

  it('returns the dedup result when insertDashboardEvent reports inserted=false', async () => {
    dashboardEventsService.insertDashboardEvent.mockResolvedValueOnce({
      inserted: false,
      eventId:  'evt-existing',
    });
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        session: { found: true, actualEndedAtIso: '2026-04-15T12:00:00Z' },
        patient: { name: 'Patient One' },
      }),
    );

    const result = (await notifyDoctorOfPatientReplay({
      sessionId:              'sess-1',
      artifactType:           'audio',
      recordingAccessAuditId: 'audit-1',
      accessedByRole:         'patient',
      accessedByUserId:       'pat-1',
      correlationId:          'cid-1',
    })) as { ok: true; eventId: string; inserted: boolean };

    expect(result.inserted).toBe(false);
    expect(result.eventId).toBe('evt-existing');
  });
});

describe('notifyDoctorOfPatientReplay — failure handling', () => {
  it('does not throw when insertDashboardEvent rejects (fire-and-forget contract)', async () => {
    dashboardEventsService.insertDashboardEvent.mockRejectedValueOnce(
      new Error('connection lost'),
    );
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({
        session: { found: true, actualEndedAtIso: '2026-04-15T12:00:00Z' },
        patient: { name: 'Patient One' },
      }),
    );

    const result = (await notifyDoctorOfPatientReplay({
      sessionId:              'sess-1',
      artifactType:           'audio',
      recordingAccessAuditId: 'audit-1',
      accessedByRole:         'patient',
      accessedByUserId:       'pat-1',
      correlationId:          'cid-1',
    })) as { skipped: true; reason: string };

    expect(result).toEqual({ skipped: true, reason: 'insert_failed' });
  });

  it('skips when the session lookup returns null', async () => {
    database.getSupabaseAdminClient.mockReturnValue(
      buildSupabaseMock({ session: { found: false } }),
    );

    const result = (await notifyDoctorOfPatientReplay({
      sessionId:              'sess-1',
      artifactType:           'audio',
      recordingAccessAuditId: 'audit-1',
      accessedByRole:         'patient',
      accessedByUserId:       'pat-1',
      correlationId:          'cid-1',
    })) as { skipped: true; reason: string };

    expect(result).toEqual({ skipped: true, reason: 'session_not_found' });
    expect(dashboardEventsService.insertDashboardEvent).not.toHaveBeenCalled();
  });
});
