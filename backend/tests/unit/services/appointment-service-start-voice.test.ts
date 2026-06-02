/**
 * Appointment Service · startVoiceConsultation (Plan 05 · Task 24)
 *
 * Focused unit test suite for the voice-specific entry point added
 * alongside `startConsultation` (video). Keeps the surface narrow:
 *   - routes through the facade with `modality: 'voice'`
 *   - composes the patient join URL as `${APP_BASE_URL}/c/voice/{sessionId}?t=...`
 *     (Principle 8 LOCKED — audio-only web call, not a phone call)
 *   - surfaces the facade-provisioned `companion` object on the
 *     fresh-create branch
 *   - short-circuits on an existing voice session (idempotent rejoin —
 *     no re-provisioning) AND synthesises a minimal companion handle
 *     ({ sessionId, expiresAt }; patientJoinUrl/patientToken stay
 *     null) so the doctor's `<VoiceConsultRoom>` can mount the chat
 *     side-panel after a page refresh / rehydrate
 *
 * Heavily mocked: we don't exercise Twilio / HMAC / Supabase wiring
 * here — the lower-level services are verified in their own suites.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ----------------------------------------------------------------------------
// Mocks — hoisted.
// ----------------------------------------------------------------------------

jest.mock('../../../src/services/consultation-session-service', () => {
  const actual = jest.requireActual(
    '../../../src/services/consultation-session-service',
  ) as object;
  return {
    ...actual,
    createSession: jest.fn(),
    findActiveSessionByAppointment: jest.fn(),
    getJoinTokenForAppointment: jest.fn().mockResolvedValue({
      token:     'doctor-twilio-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    } as never),
    isVideoModalityConfigured: jest.fn().mockReturnValue(true),
    findLatestAppointmentSessionSummary: jest.fn(async () => null),
    findLatestAppointmentSessionSummariesBulk: jest.fn(async () => new Map()),
  };
});

jest.mock('../../../src/services/notification-service', () => ({
  sendConsultationLinkToPatient: jest.fn().mockResolvedValue(undefined as never),
}));

jest.mock('../../../src/utils/consultation-token', () => ({
  generateConsultationToken: jest.fn().mockReturnValue('hmac-voice-token'),
  verifyConsultationToken:   jest.fn(),
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logAuditEvent:       jest.fn().mockResolvedValue(undefined as never),
  logDataAccess:       jest.fn().mockResolvedValue(undefined as never),
  logDataModification: jest.fn().mockResolvedValue(undefined as never),
  logSecurityEvent:    jest.fn().mockResolvedValue(undefined as never),
}));

jest.mock('../../../src/services/patient-service', () => ({
  ensurePatientMrnIfEligible: jest.fn(async () => 'P-00001'),
}));

jest.mock('../../../src/services/doctor-settings-service', () => ({
  getDoctorSettings: jest.fn(async () => null),
}));

jest.mock('../../../src/services/care-episode-service', () => ({
  syncCareEpisodeLifecycleOnAppointmentCompleted: jest.fn(async () => {}),
}));

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

process.env.APP_BASE_URL = 'https://app.clariva.test';
process.env.CONSULTATION_JOIN_BASE_URL = 'https://app.clariva.test/consult/join';
process.env.SLOT_INTERVAL_MINUTES = '30';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sessionService = require('../../../src/services/consultation-session-service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const notificationService = require('../../../src/services/notification-service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const database = require('../../../src/config/database');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startVoiceConsultation } = require('../../../src/services/appointment-service');

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

const correlationId = 'corr-voice-start';
const doctorId      = 'd0000000-0000-0000-0000-000000000001';
const appointmentId = 'a0000000-0000-0000-0000-000000000002';
const patientId     = 'p0000000-0000-0000-0000-000000000003';
const sessionId     = 's0000000-0000-0000-0000-000000000004';
const roomSid       = 'RM0000000000000000000000000000000v';

function appointmentRow(overrides: Partial<Record<string, unknown>> = {}) {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return {
    id:              appointmentId,
    doctor_id:       doctorId,
    patient_id:      patientId,
    patient_name:    'PATIENT_TEST',
    patient_phone:   '+10000000000',
    appointment_date: future.toISOString(),
    status:          'confirmed',
    reason_for_visit: 'Follow-up',
    notes:           null,
    consultation_type: 'voice',
    created_at:      new Date().toISOString(),
    updated_at:      new Date().toISOString(),
    ...overrides,
  };
}

function buildAdminMock(appointmentOverrides: Partial<Record<string, unknown>> = {}) {
  const row = appointmentRow(appointmentOverrides);
  // The chain object stands in for a Supabase query builder. It needs to:
  //   1. Support both READ chains: `.select().eq().single()` /
  //      `.maybeSingle()` — `eq` returns the chain so the next link is
  //      callable.
  //   2. Support a WRITE chain: `.update(patch).eq('id', ...)` where the
  //      whole chain is `await`ed for `{ error }` — so the chain itself
  //      must be thenable, resolving to `{ data: null, error: null }`.
  // Implementing `then` on the chain gives us both at once: synchronous
  // chaining works as long as no caller `await`s an intermediate link,
  // and the final `await chain` triggers the thenable to resolve.
  const chain: Record<string, unknown> = {
    select:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
    single:      jest.fn().mockResolvedValue({ data: row, error: null } as never),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null } as never),
    update:      jest.fn().mockReturnThis(),
    then:        (resolve: (v: unknown) => void) =>
      resolve({ data: null, error: null }),
  };
  return {
    from: jest.fn().mockReturnValue(chain),
    _chain: chain,
    _row: row,
  };
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

describe('appointment-service.startVoiceConsultation (Plan 05 · Task 24)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fresh-create: routes modality="voice" through the facade and builds /c/voice/{sessionId}?t= URL', async () => {
    const admin = buildAdminMock();
    database.getSupabaseAdminClient.mockReturnValue(admin);

    sessionService.findActiveSessionByAppointment.mockResolvedValue(null);
    sessionService.createSession.mockResolvedValue({
      id:                sessionId,
      providerSessionId: roomSid,
      modality:          'voice',
      status:            'live',
      companion: {
        sessionId,
        patientJoinUrl: `https://app.clariva.test/c/text/${sessionId}?t=companion-hmac`,
        patientToken:   'companion-hmac',
        expiresAt:      new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    });

    const result = await startVoiceConsultation(appointmentId, correlationId, doctorId);

    expect(sessionService.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId,
        doctorId,
        patientId,
        modality: 'voice',
      }),
      correlationId,
    );

    expect(sessionService.getJoinTokenForAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ modality: 'voice', role: 'doctor' }),
      correlationId,
    );

    expect(result.roomSid).toBe(roomSid);
    expect(result.roomName).toBe(`appointment-voice-${appointmentId}`);
    expect(result.doctorToken).toBe('doctor-twilio-token');
    expect(result.patientJoinToken).toBe('hmac-voice-token');
    expect(result.patientJoinUrl).toBe(
      `https://app.clariva.test/c/voice/${sessionId}?t=hmac-voice-token`,
    );
    expect(result.companion?.sessionId).toBe(sessionId);

    expect(notificationService.sendConsultationLinkToPatient).toHaveBeenCalledWith(
      appointmentId,
      result.patientJoinUrl,
      correlationId,
    );
  });

  it('idempotent rejoin: short-circuits create + synthesises minimal companion ({sessionId, expiresAt}) for chat-panel rehydrate', async () => {
    const admin = buildAdminMock();
    database.getSupabaseAdminClient.mockReturnValue(admin);

    const expectedEndAt = new Date('2026-05-04T09:30:00Z');
    sessionService.findActiveSessionByAppointment.mockResolvedValue({
      id:                sessionId,
      providerSessionId: roomSid,
      modality:          'voice',
      status:            'live',
      expectedEndAt,
    });

    const result = await startVoiceConsultation(appointmentId, correlationId, doctorId);

    expect(sessionService.createSession).not.toHaveBeenCalled();
    expect(result.roomSid).toBe(roomSid);
    expect(result.roomName).toBe(`appointment-voice-${appointmentId}`);
    // Plan 06 fix — rejoin now surfaces a minimal companion so the
    // doctor's `<VoiceConsultRoom>` mounts the chat side-panel on
    // page refresh / rehydrate. patientJoinUrl/patientToken stay
    // null because the doctor doesn't read them (chat auth flows
    // via dashboard Supabase session) and the patient mints fresh
    // patient-side creds via their own join page exchange.
    expect(result.companion).toEqual({
      sessionId,
      patientJoinUrl: null,
      patientToken:   null,
      expiresAt:      expectedEndAt.toISOString(),
    });
    expect(result.patientJoinUrl).toContain(`/c/voice/${sessionId}?t=`);
  });

  it('rejects appointments not in pending/confirmed', async () => {
    const admin = buildAdminMock({ status: 'completed' });
    database.getSupabaseAdminClient.mockReturnValue(admin);

    await expect(
      startVoiceConsultation(appointmentId, correlationId, doctorId),
    ).rejects.toThrow(/pending or confirmed/i);

    expect(sessionService.createSession).not.toHaveBeenCalled();
  });

  it('throws when Twilio Video is not configured', async () => {
    const admin = buildAdminMock();
    database.getSupabaseAdminClient.mockReturnValue(admin);
    sessionService.isVideoModalityConfigured.mockReturnValue(false);

    await expect(
      startVoiceConsultation(appointmentId, correlationId, doctorId),
    ).rejects.toThrow(/not configured/i);

    sessionService.isVideoModalityConfigured.mockReturnValue(true);
  });
});
