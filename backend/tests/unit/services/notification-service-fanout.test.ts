/**
 * Notification Service · Urgent-moment fan-out helpers (Plan 01 · Task 16)
 *
 * Covers `sendConsultationReadyToPatient` and `sendPrescriptionReadyToPatient`.
 * The fan-out helpers fire SMS + email + IG DM via `Promise.allSettled` and
 * return a typed `FanOutResult`.
 *
 * The test surface is intentionally narrow:
 *   - happy path (all three channels fire in parallel)
 *   - IG-only (no phone, no email → SMS + email return `'skipped'`)
 *   - SMS fails (provider throw → SMS `'failed'`, others still ship)
 *   - dedup (second call within 60s short-circuits with `recent_duplicate`)
 *   - modality-aware copy (the copy builder is invoked with the session's
 *     modality value)
 *
 * The existing `notification-service.test.ts` covers the legacy cascade
 * helpers (`sendConsultationLinkToPatient`, `sendPrescriptionToPatient`)
 * — those stay untouched.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { FanOutResult } from '../../../src/types/notification';

// ----------------------------------------------------------------------------
// Mocks. Hoisted by jest before module evaluation.
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
  getInstagramAccessTokenForDoctor: jest.fn().mockResolvedValue('doctor-ig-token' as never),
}));
jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: jest.fn().mockResolvedValue({
    practice_name: 'Acme Clinic',
    timezone:      'Asia/Kolkata',
  } as never),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined as never),
}));
jest.mock('../../../src/services/consultation-session-service', () => ({
  getJoinTokenForAppointment: jest.fn().mockResolvedValue({
    token:     'join-token-xyz',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  } as never),
}));
jest.mock('../../../src/utils/dm-copy', () => {
  const actual = jest.requireActual('../../../src/utils/dm-copy') as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    buildConsultationReadyDm:   jest.fn(),
    buildPrescriptionReadyPingDm: jest.fn(),
  };
});

// Lock the env BEFORE the service is imported.
process.env.CONSULTATION_JOIN_BASE_URL = 'https://app.clariva.test/consult/join';
process.env.CONSULTATION_READY_NOTIFY_DEDUP_SECONDS = '60';
process.env.PRESCRIPTION_VIEW_BASE_URL = 'https://app.clariva.test/rx';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const notificationService = require('../../../src/services/notification-service') as {
  sendConsultationReadyToPatient: (input: {
    sessionId:     string;
    correlationId: string;
    force?:        boolean;
  }) => Promise<FanOutResult>;
  sendPrescriptionReadyToPatient: (input: {
    prescriptionId: string;
    correlationId:  string;
  }) => Promise<FanOutResult>;
};
const {
  sendConsultationReadyToPatient,
  sendPrescriptionReadyToPatient,
} = notificationService;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const database = require('../../../src/config/database');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const emailConfig = require('../../../src/config/email');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const smsService = require('../../../src/services/twilio-sms-service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const instagramService = require('../../../src/services/instagram-service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dmCopy = require('../../../src/utils/dm-copy');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sessionService = require('../../../src/services/consultation-session-service');

// ----------------------------------------------------------------------------
// Constants + fixtures
// ----------------------------------------------------------------------------

const correlationId  = 'cid-fanout-test';
const sessionId      = '11111111-1111-1111-1111-111111111111';
const appointmentId  = '22222222-2222-2222-2222-222222222222';
const doctorId       = '33333333-3333-3333-3333-333333333333';
const patientId      = '44444444-4444-4444-4444-444444444444';
const prescriptionId = '55555555-5555-5555-5555-555555555555';
const conversationId = '66666666-6666-6666-6666-666666666666';

interface PatientShape {
  phone:                string | null;
  email:                string | null;
  platform:             string | null;
  platform_external_id: string | null;
}

interface BuildSupabaseOpts {
  session?:               { found: boolean; lastReadyAt?: string | null; modality?: string };
  appointment?:           { found: boolean; phone?: string | null };
  patient?:               PatientShape | null;
  conversation?:          { platform_conversation_id: string } | null;
  prescription?:          { found: boolean };
  captureLastReadyUpdate?: { sessionId: string; payload: unknown }[];
}

/**
 * Build a Supabase admin-client mock that handles every chain shape the
 * fan-out helpers use:
 *   - `from('consultation_sessions').select(...).eq(...).maybeSingle()`
 *   - `from('appointments').select(...).eq(...).single()`
 *   - `from('patients').select(...).eq(...).single()`
 *   - `from('conversations').select(...).eq(...).limit(1).maybeSingle()` /
 *     `.single()`
 *   - `from('prescriptions').select(...).eq(...).single()`
 *   - `from('consultation_sessions').update(...).eq(...).then(cb)`
 */
function buildSupabaseMock(opts: BuildSupabaseOpts) {
  const sessionRow = opts.session?.found
    ? {
        id:                          sessionId,
        appointment_id:              appointmentId,
        doctor_id:                   doctorId,
        patient_id:                  patientId,
        modality:                    opts.session.modality ?? 'video',
        last_ready_notification_at:  opts.session.lastReadyAt ?? null,
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
  const prescriptionRow = opts.prescription?.found
    ? { id: prescriptionId, appointment_id: appointmentId }
    : null;

  const updateCaptures = opts.captureLastReadyUpdate ?? [];

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
        if (table === 'prescriptions') {
          return Promise.resolve({
            data:  prescriptionRow,
            error: prescriptionRow ? null : { message: 'not found' },
          });
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
    // Return a hybrid chain that supports BOTH select-shape and update-shape.
    // The helper code paths never mix them on the same .from() call: they
    // either select-then-await or update-then-eq-then-await. We discriminate
    // by which method is called first.
    let mode: 'select' | 'update' | null = null;
    let activeChain: Record<string, unknown> | null = null;

    const ensureSelect = () => {
      if (!activeChain) {
        mode = 'select';
        activeChain = buildSelectChain(table);
      }
      return activeChain;
    };
    const ensureUpdate = () => {
      if (!activeChain) {
        mode = 'update';
        activeChain = buildUpdateChain(table);
      }
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
      // Defensive — if a caller chains .eq directly off .from() (none do
      // today), surface a clear error instead of silently breaking.
      eq: jest.fn(() => {
        throw new Error(`Unexpected .eq() before .select()/.update() on ${table}`);
      }),
      __mode: () => mode,
    };
  });

  return { from };
}

function defaultPatient(overrides: Partial<PatientShape> = {}): PatientShape {
  return {
    phone:                '+919876500001',
    email:                'patient@example.com',
    platform:             'instagram',
    platform_external_id: 'ig-psid-12345',
    ...overrides,
  };
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

describe('Notification fan-out helpers (Plan 01 · Task 16)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    smsService.sendSms.mockResolvedValue(true);
    emailConfig.sendEmail.mockResolvedValue(true);
    instagramService.sendInstagramMessage.mockResolvedValue({
      message_id:   'ig-mid-abc',
      recipient_id: 'ig-psid-12345',
    });
    dmCopy.buildConsultationReadyDm.mockReturnValue('CONSULT_READY_BODY');
    dmCopy.buildPrescriptionReadyPingDm.mockReturnValue('RX_READY_BODY');
  });

  // --------------------------------------------------------------------------
  // sendConsultationReadyToPatient
  // --------------------------------------------------------------------------

  describe('sendConsultationReadyToPatient', () => {
    it('happy path: all three channels fire in parallel and report sent', async () => {
      const captured: { sessionId: string; payload: unknown }[] = [];
      const supa = buildSupabaseMock({
        session:                { found: true, modality: 'video' },
        appointment:            { found: true, phone: '+919876500001' },
        patient:                defaultPatient(),
        captureLastReadyUpdate: captured,
      });
      database.getSupabaseAdminClient.mockReturnValue(supa);

      const result = await sendConsultationReadyToPatient({ sessionId, correlationId });

      expect(result.anySent).toBe(true);
      expect(result.sessionOrPrescriptionId).toBe(sessionId);
      expect(result.channels).toHaveLength(3);

      const channelMap = Object.fromEntries(result.channels.map((c) => [c.channel, c]));
      expect(channelMap.sms.status).toBe('sent');
      expect(channelMap.email.status).toBe('sent');
      expect(channelMap.instagram_dm.status).toBe('sent');

      // All three providers were called with the same body.
      expect(smsService.sendSms).toHaveBeenCalledWith(
        '+919876500001',
        'CONSULT_READY_BODY',
        correlationId
      );
      expect(emailConfig.sendEmail).toHaveBeenCalledWith(
        'patient@example.com',
        'Your consult is starting',
        'CONSULT_READY_BODY',
        correlationId
      );
      expect(instagramService.sendInstagramMessage).toHaveBeenCalledWith(
        'ig-psid-12345',
        'CONSULT_READY_BODY',
        correlationId,
        'doctor-ig-token'
      );

      // Dedup column was stamped.
      expect(captured.length).toBeGreaterThan(0);
      const lastUpdate = captured[captured.length - 1]!;
      expect(lastUpdate.sessionId).toBe(sessionId);
      expect((lastUpdate.payload as Record<string, unknown>)).toHaveProperty(
        'last_ready_notification_at'
      );
    });

    it('passes session.modality through to the copy builder (video)', async () => {
      const supa = buildSupabaseMock({
        session:     { found: true, modality: 'video' },
        appointment: { found: true, phone: '+919876500001' },
        patient:     defaultPatient(),
      });
      database.getSupabaseAdminClient.mockReturnValue(supa);

      await sendConsultationReadyToPatient({ sessionId, correlationId });

      expect(dmCopy.buildConsultationReadyDm).toHaveBeenCalledWith(
        expect.objectContaining({
          modality:     'video',
          practiceName: 'Acme Clinic',
          joinUrl:      expect.stringMatching(/\?token=join-token-xyz$/),
        })
      );
    });

    it('IG-only patient: SMS + email skipped with no_recipient, IG sent', async () => {
      const supa = buildSupabaseMock({
        session:     { found: true, modality: 'video' },
        appointment: { found: true, phone: null },
        patient:     defaultPatient({ phone: null, email: null }),
      });
      database.getSupabaseAdminClient.mockReturnValue(supa);

      const result = await sendConsultationReadyToPatient({ sessionId, correlationId });

      const map = Object.fromEntries(result.channels.map((c) => [c.channel, c]));
      expect(map.sms.status).toBe('skipped');
      expect((map.sms as { reason: string }).reason).toBe('no_recipient');
      expect(map.email.status).toBe('skipped');
      expect((map.email as { reason: string }).reason).toBe('no_recipient');
      expect(map.instagram_dm.status).toBe('sent');

      expect(result.anySent).toBe(true);
      expect(smsService.sendSms).not.toHaveBeenCalled();
      expect(emailConfig.sendEmail).not.toHaveBeenCalled();
    });

    it('SMS provider throws: SMS marked failed, email + IG still ship', async () => {
      const supa = buildSupabaseMock({
        session:     { found: true, modality: 'video' },
        appointment: { found: true, phone: '+919876500001' },
        patient:     defaultPatient(),
      });
      database.getSupabaseAdminClient.mockReturnValue(supa);
      smsService.sendSms.mockRejectedValue(new Error('twilio 21408'));

      const result = await sendConsultationReadyToPatient({ sessionId, correlationId });

      const map = Object.fromEntries(result.channels.map((c) => [c.channel, c]));
      expect(map.sms.status).toBe('failed');
      expect((map.sms as { error: string }).error).toContain('twilio 21408');
      expect(map.email.status).toBe('sent');
      expect(map.instagram_dm.status).toBe('sent');
      expect(result.anySent).toBe(true);
    });

    it('dedup: second call within window short-circuits with recent_duplicate', async () => {
      const justNow = new Date(Date.now() - 5_000).toISOString();
      const supa = buildSupabaseMock({
        session:     { found: true, modality: 'video', lastReadyAt: justNow },
        appointment: { found: true, phone: '+919876500001' },
        patient:     defaultPatient(),
      });
      database.getSupabaseAdminClient.mockReturnValue(supa);

      const result = await sendConsultationReadyToPatient({ sessionId, correlationId });

      expect(result.reason).toBe('recent_duplicate');
      expect(result.anySent).toBe(false);
      expect(result.channels).toHaveLength(0);
      expect(smsService.sendSms).not.toHaveBeenCalled();
      expect(emailConfig.sendEmail).not.toHaveBeenCalled();
      expect(instagramService.sendInstagramMessage).not.toHaveBeenCalled();
    });

    it('force=true bypasses the recent-duplicate dedup window (Task 24 resend-link)', async () => {
      const justNow = new Date(Date.now() - 5_000).toISOString();
      const supa = buildSupabaseMock({
        session:     { found: true, modality: 'video', lastReadyAt: justNow },
        appointment: { found: true, phone: '+919876500001' },
        patient:     defaultPatient(),
      });
      database.getSupabaseAdminClient.mockReturnValue(supa);

      const result = await sendConsultationReadyToPatient({
        sessionId,
        correlationId,
        force: true,
      });

      expect(result.reason).toBeUndefined();
      expect(result.channels.length).toBeGreaterThan(0);
      // At least one delivery channel should have been invoked.
      const attemptedChannels = [
        smsService.sendSms.mock.calls.length,
        emailConfig.sendEmail.mock.calls.length,
        instagramService.sendInstagramMessage.mock.calls.length,
      ].reduce((a, b) => a + b, 0);
      expect(attemptedChannels).toBeGreaterThan(0);
    });

    it('returns empty result when session row not found', async () => {
      const supa = buildSupabaseMock({
        session:     { found: false },
        appointment: { found: false },
      });
      database.getSupabaseAdminClient.mockReturnValue(supa);

      const result = await sendConsultationReadyToPatient({ sessionId, correlationId });

      expect(result.anySent).toBe(false);
      expect(result.channels).toHaveLength(0);
      expect(sessionService.getJoinTokenForAppointment).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // sendPrescriptionReadyToPatient
  // --------------------------------------------------------------------------

  describe('sendPrescriptionReadyToPatient', () => {
    it('happy path: all three channels fire in parallel with the prescription view URL', async () => {
      const supa = buildSupabaseMock({
        prescription: { found: true },
        appointment:  { found: true, phone: '+919876500001' },
        patient:      defaultPatient(),
      });
      database.getSupabaseAdminClient.mockReturnValue(supa);

      const result = await sendPrescriptionReadyToPatient({
        prescriptionId,
        correlationId,
      });

      expect(result.anySent).toBe(true);
      expect(result.sessionOrPrescriptionId).toBe(prescriptionId);
      expect(result.channels).toHaveLength(3);
      const map = Object.fromEntries(result.channels.map((c) => [c.channel, c]));
      expect(map.sms.status).toBe('sent');
      expect(map.email.status).toBe('sent');
      expect(map.instagram_dm.status).toBe('sent');

      expect(dmCopy.buildPrescriptionReadyPingDm).toHaveBeenCalledWith(
        expect.objectContaining({
          practiceName: 'Acme Clinic',
          viewUrl:      `https://app.clariva.test/rx/${prescriptionId}`,
        })
      );
    });

    it('returns empty result when prescription not found', async () => {
      const supa = buildSupabaseMock({
        prescription: { found: false },
        appointment:  { found: false },
      });
      database.getSupabaseAdminClient.mockReturnValue(supa);

      const result = await sendPrescriptionReadyToPatient({
        prescriptionId,
        correlationId,
      });

      expect(result.anySent).toBe(false);
      expect(result.channels).toHaveLength(0);
    });
  });
});
