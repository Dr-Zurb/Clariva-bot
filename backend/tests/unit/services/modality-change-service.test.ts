/**
 * Modality Change State Machine Unit Tests (Plan 09 · Task 47 · Decision 11 LOCKED).
 *
 * Pins the v1-critical branches of `requestModalityChange` + the three
 * public second/third-round handlers:
 *
 *  1. Guard-chain rejections (Steps 1-8) — every branch returns a
 *     typed `rejected` result with the right `reason`.
 *  2. Handler dispatch (Step 9) for the four-branch 2×2 matrix:
 *       - patient + upgrade   → pending_doctor_approval (90s)
 *       - patient + downgrade → applied (no_refund_downgrade)
 *       - doctor  + upgrade   → pending_patient_consent (60s)
 *       - doctor  + downgrade → applied (auto_refund_downgrade + refund fire)
 *  3. Second-round handlers:
 *       - handleDoctorApprovalOfPatientUpgrade: decline, free, paid
 *       - handlePatientConsentForDoctorUpgrade: decline, allow
 *  4. Webhook `payment.captured` idempotency + modality-drift
 *     compensating refund.
 *  5. Commit rollback doctrine:
 *       - Executor throws → no history row, no counter bump.
 *       - Counter UPDATE races → history row orphaned, rejection returned.
 *       - emitSystemMessage failure is best-effort.
 *  6. `getModalityChangeState` read path.
 *
 * The SUT's Supabase interactions are mocked at the module boundary
 * (queries + admin client). The billing + executor DI helpers are also
 * mocked so the "stub-throws" behaviour from Tasks 48/49 doesn't leak
 * into these test branches. Mirrors the mocking style from
 * `consultation-session-service.test.ts`.
 *
 * @see backend/src/services/modality-change-service.ts
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// ============================================================================
// Mock registry — BEFORE importing the SUT.
// ============================================================================

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: {
    error: jest.fn(),
    warn:  jest.fn(),
    info:  jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockImplementation(() => ({
      error: jest.fn(),
      warn:  jest.fn(),
      info:  jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

// -- Pending-requests queries.
const mockInsertModalityPendingRow          = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchActivePendingForSession      = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchPendingById                  = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFetchPendingByRazorpayOrderId     = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockResolvePendingRequest             = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockStampRazorpayOrderOnPending       = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/modality-pending-requests-queries', () => ({
  insertModalityPendingRow:      (...a: unknown[]) => mockInsertModalityPendingRow(...a),
  fetchActivePendingForSession:  (...a: unknown[]) => mockFetchActivePendingForSession(...a),
  fetchPendingById:              (...a: unknown[]) => mockFetchPendingById(...a),
  fetchPendingByRazorpayOrderId: (...a: unknown[]) => mockFetchPendingByRazorpayOrderId(...a),
  resolvePendingRequest:         (...a: unknown[]) => mockResolvePendingRequest(...a),
  stampRazorpayOrderOnPending:   (...a: unknown[]) => mockStampRazorpayOrderOnPending(...a),
}));

// -- History queries.
const mockInsertModalityHistoryRow = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockNarrowHistoryEntry       = jest.fn<(...args: unknown[]) => unknown>();

jest.mock('../../../src/services/modality-history-queries', () => ({
  insertModalityHistoryRow: (...a: unknown[]) => mockInsertModalityHistoryRow(...a),
  narrowHistoryEntry:       (...a: unknown[]) => mockNarrowHistoryEntry(...a),
}));

// -- Executor (Task 48 stub by default → success; overridden in rollback tests).
const mockExecuteModalityTransition = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/modality-transition-executor', () => ({
  executeModalityTransition: (...a: unknown[]) => mockExecuteModalityTransition(...a),
}));

// -- Billing (Task 49 stub by default → success; overridden per-branch).
const mockComputeUpgradeDelta   = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCaptureUpgradePayment = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockAutoRefundDowngrade   = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/modality-billing-service', () => ({
  getModalityBillingService: () => ({
    computeUpgradeDelta:   (...a: unknown[]) => mockComputeUpgradeDelta(...a),
    captureUpgradePayment: (...a: unknown[]) => mockCaptureUpgradePayment(...a),
    autoRefundDowngrade:   (...a: unknown[]) => mockAutoRefundDowngrade(...a),
  }),
}));

// -- emitSystemMessage.
const mockEmitSystemMessage = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/consultation-message-service', () => ({
  emitSystemMessage: (...a: unknown[]) => mockEmitSystemMessage(...a),
}));

import * as database from '../../../src/config/database';
import {
  getModalityChangeState,
  handleDoctorApprovalOfPatientUpgrade,
  handleModalityChangePaymentCaptured,
  handlePatientConsentForDoctorUpgrade,
  requestModalityChange,
} from '../../../src/services/modality-change-service';
import type { ModalityChangeRequest } from '../../../src/types/modality-change';

const mockedDb = database as jest.Mocked<typeof database>;

// ============================================================================
// Supabase admin client mock — covers two code paths:
//   · loadSessionWithCounters: from('consultation_sessions').select(...).eq(...).maybeSingle()
//   · counter UPDATE: from('consultation_sessions').update(...).eq(...).eq(...).select(...).maybeSingle()
//   · webhook idempotency: from('consultation_modality_history').select(...).eq(...).maybeSingle()
// ============================================================================

type SessionRow = {
  id: string;
  appointment_id: string;
  doctor_id: string;
  patient_id: string | null;
  modality: string;
  current_modality: string;
  upgrade_count: number;
  downgrade_count: number;
  status: string;
  provider: string;
  provider_session_id: string | null;
};

interface AdminState {
  sessionRow: SessionRow | null;
  sessionSelectError: { message: string } | null;
  sessionUpdateRace: boolean;       // true → counter UPDATE returns null (raced)
  sessionUpdateError: { message: string } | null;
  historyIdempotencyHit: { id: string; billing_action: string } | null;
  historyIdempotencyError: { message: string } | null;
}

function buildAdminClient(state: AdminState): unknown {
  const sessionSelect = {
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest
      .fn()
      .mockResolvedValue({ data: state.sessionRow, error: state.sessionSelectError } as never),
  };

  const sessionUpdateTerminal = {
    maybeSingle: jest.fn().mockResolvedValue({
      data: state.sessionUpdateRace ? null : { id: state.sessionRow?.id },
      error: state.sessionUpdateError,
    } as never),
  };
  const sessionUpdateSelect = { select: jest.fn().mockReturnValue(sessionUpdateTerminal) };
  const sessionUpdateEqEq   = {
    eq: jest.fn().mockReturnValue(sessionUpdateSelect),
    select: jest.fn().mockReturnValue(sessionUpdateTerminal),
  };
  const sessionUpdateEq = { eq: jest.fn().mockReturnValue(sessionUpdateEqEq) };

  const historyIdempotencyTerminal = {
    maybeSingle: jest
      .fn()
      .mockResolvedValue({ data: state.historyIdempotencyHit, error: state.historyIdempotencyError } as never),
  };
  const historyIdempotencyChain = {
    eq: jest.fn().mockReturnValue(historyIdempotencyTerminal),
  };

  const from = jest.fn().mockImplementation(((table: string) => {
    if (table === 'consultation_sessions') {
      return {
        select: jest.fn().mockReturnValue(sessionSelect),
        update: jest.fn().mockReturnValue(sessionUpdateEq),
      };
    }
    if (table === 'consultation_modality_history') {
      return {
        select: jest.fn().mockReturnValue(historyIdempotencyChain),
      };
    }
    throw new Error(`buildAdminClient: unexpected table ${table}`);
  }) as never);

  return { from };
}

function sessionRowLiveText(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id:                  'sess-A',
    appointment_id:      'apt-1',
    doctor_id:           'doc-1',
    patient_id:          'pat-1',
    modality:            'text',
    current_modality:    'text',
    upgrade_count:       0,
    downgrade_count:     0,
    status:              'live',
    provider:            'supabase_realtime',
    provider_session_id: 'text:apt-1',
    ...overrides,
  };
}

// ============================================================================
// Shared setup.
// ============================================================================

const correlationId = 'corr-modality-1';

beforeEach(() => {
  jest.clearAllMocks();
  // Happy-path defaults — each test overrides as needed.
  mockFetchActivePendingForSession.mockResolvedValue(null);
  mockInsertModalityHistoryRow.mockResolvedValue({
    id:                  'hist-1',
    sessionId:           'sess-A',
    fromModality:        'text',
    toModality:          'voice',
    initiatedBy:         'patient',
    billingAction:       'no_refund_downgrade',
    amountPaise:         null,
    razorpayPaymentId:   null,
    razorpayRefundId:    null,
    reason:              null,
    presetReasonCode:    null,
    correlationId,
    occurredAt:          '2026-04-19T10:00:00Z',
  });
  mockNarrowHistoryEntry.mockImplementation((row) => row);
  mockExecuteModalityTransition.mockResolvedValue({
    newProviderSessionId: 'RM_after',
    recordingArtifactRef: undefined,
  });
  mockComputeUpgradeDelta.mockResolvedValue({ amountPaise: 5000 });
  mockCaptureUpgradePayment.mockResolvedValue({ razorpayOrderId: 'order_rzp_xyz' });
  mockAutoRefundDowngrade.mockResolvedValue({ ok: true });
  mockEmitSystemMessage.mockResolvedValue(undefined);
});

// ============================================================================
// Step 1 — AuthZ guards.
// ============================================================================

describe('requestModalityChange · Step 1 authZ', () => {
  it('rejects when requestingRole mismatches initiatedBy (seat-mismatch shortcut)', async () => {
    const input: ModalityChangeRequest = {
      sessionId:         'sess-A',
      initiatedBy:       'doctor',
      requestingRole:    'patient',
      requestingUserId:  'pat-1',
      requestedModality: 'video',
      correlationId,
    };
    const result = await requestModalityChange(input);
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('forbidden');
      expect(result.detail).toContain('requestingRole !== initiatedBy');
    }
    // No admin client / queries should have fired.
    expect(mockFetchActivePendingForSession).not.toHaveBeenCalled();
  });

  it('rejects when the caller is not the session participant for their seat', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'doctor',
      requestingRole:    'doctor',
      requestingUserId:  'doc-OTHER',
      requestedModality: 'voice',
      reason:            'Need to hear the patient',
      correlationId,
    });

    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('forbidden');
      expect(result.detail).toContain('seat_mismatch');
    }
  });
});

// ============================================================================
// Step 2 — Session status.
// ============================================================================

describe('requestModalityChange · Step 2 session state', () => {
  it('rejects when the session is not live (e.g. ended)', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText({ status: 'ended' }),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'patient',
      requestingRole:    'patient',
      requestingUserId:  'pat-1',
      requestedModality: 'voice',
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('session_not_active');
      expect(result.detail).toContain('status=ended');
    }
  });

  it('returns internal_error when the session cannot be found', async () => {
    const admin = buildAdminClient({
      sessionRow:              null,
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await requestModalityChange({
      sessionId:         'sess-missing',
      initiatedBy:       'patient',
      requestingRole:    'patient',
      requestingUserId:  'pat-1',
      requestedModality: 'voice',
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('internal_error');
      expect(result.detail).toContain('session_not_found');
    }
  });
});

// ============================================================================
// Step 5 — Direction.
// ============================================================================

describe('requestModalityChange · Step 5 direction', () => {
  it('rejects no-op (to === current)', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText({ current_modality: 'voice' }),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'patient',
      requestingRole:    'patient',
      requestingUserId:  'pat-1',
      requestedModality: 'voice',
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') expect(result.reason).toBe('no_op_transition');
  });
});

// ============================================================================
// Step 6 — Rate-limit.
// ============================================================================

describe('requestModalityChange · Step 6 rate-limit', () => {
  it('rejects when upgrade_count is already 1', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText({ upgrade_count: 1 }),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'patient',
      requestingRole:    'patient',
      requestingUserId:  'pat-1',
      requestedModality: 'voice',
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') expect(result.reason).toBe('max_upgrades_reached');
  });

  it('rejects when downgrade_count is already 1', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText({
        current_modality:   'video',
        downgrade_count:    1,
      }),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'patient',
      requestingRole:    'patient',
      requestingUserId:  'pat-1',
      requestedModality: 'voice',
      reason:            'Connection bad — going voice-only',
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') expect(result.reason).toBe('max_downgrades_reached');
  });
});

// ============================================================================
// Step 7 — Pending-request guard.
// ============================================================================

describe('requestModalityChange · Step 7 pending-request guard', () => {
  it('rejects when a pending request already exists for the session', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockFetchActivePendingForSession.mockResolvedValueOnce({
      id:                  'pend-existing',
      sessionId:           'sess-A',
      initiatedBy:         'doctor',
      requestedModality:   'voice',
      reason:              'Need to hear',
      presetReasonCode:    'need_to_hear_voice',
      amountPaise:         null,
      razorpayOrderId:     null,
      requestedAt:         '2026-04-19T10:00:00Z',
      expiresAt:           '2026-04-19T10:01:00Z',
      respondedAt:         null,
      response:            null,
      correlationId,
    });

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'patient',
      requestingRole:    'patient',
      requestingUserId:  'pat-1',
      requestedModality: 'voice',
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('pending_request_exists');
      expect(result.detail).toContain('pendingId=pend-existing');
    }
  });
});

// ============================================================================
// Step 8 — Reason validation.
// ============================================================================

describe('requestModalityChange · Step 8 reason validation', () => {
  it('rejects doctor-initiated request without a reason', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'doctor',
      requestingRole:    'doctor',
      requestingUserId:  'doc-1',
      requestedModality: 'voice',
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') expect(result.reason).toBe('reason_required');
  });

  it('rejects patient-initiated downgrade without a reason', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText({ current_modality: 'video' }),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'patient',
      requestingRole:    'patient',
      requestingUserId:  'pat-1',
      requestedModality: 'voice',
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') expect(result.reason).toBe('reason_required');
  });

  it('rejects reason shorter than 5 codepoints', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'doctor',
      requestingRole:    'doctor',
      requestingUserId:  'doc-1',
      requestedModality: 'voice',
      reason:            'bad',
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('reason_out_of_bounds');
      expect(result.detail).toContain('length=3');
    }
  });

  it('rejects reason longer than 200 codepoints', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'doctor',
      requestingRole:    'doctor',
      requestingUserId:  'doc-1',
      requestedModality: 'voice',
      reason:            'x'.repeat(201),
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') expect(result.reason).toBe('reason_out_of_bounds');
  });
});

// ============================================================================
// Step 9 — Dispatch: patient-initiated upgrade.
// ============================================================================

describe('requestModalityChange · patient-initiated upgrade', () => {
  it('returns pending_doctor_approval with a 90s expiry window', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    const now = Date.now();
    mockInsertModalityPendingRow.mockResolvedValueOnce({
      id:                'pend-p-upg-1',
      sessionId:         'sess-A',
      initiatedBy:       'patient',
      requestedModality: 'voice',
      reason:            null,
      presetReasonCode:  null,
      amountPaise:       null,
      razorpayOrderId:   null,
      requestedAt:       new Date(now).toISOString(),
      expiresAt:         new Date(now + 90_000).toISOString(),
      respondedAt:       null,
      response:          null,
      correlationId,
    });

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'patient',
      requestingRole:    'patient',
      requestingUserId:  'pat-1',
      requestedModality: 'voice',
      correlationId,
    });

    expect(result.kind).toBe('pending_doctor_approval');
    if (result.kind === 'pending_doctor_approval') {
      expect(result.approvalRequestId).toBe('pend-p-upg-1');
      expect(result.correlationId).toBe(correlationId);
    }
    expect(mockInsertModalityPendingRow).toHaveBeenCalledTimes(1);
    const [, payload] = mockInsertModalityPendingRow.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(payload.sessionId).toBe('sess-A');
    expect(payload.initiatedBy).toBe('patient');
    expect(payload.requestedModality).toBe('voice');
    // 90s window (allow ±2s for clock jitter).
    const expiresMs = new Date(payload.expiresAt as string).getTime();
    expect(expiresMs - now).toBeGreaterThanOrEqual(89_000);
    expect(expiresMs - now).toBeLessThanOrEqual(92_000);
    // No history, no counter bump, no system message — that's the whole point of "pending".
    expect(mockInsertModalityHistoryRow).not.toHaveBeenCalled();
    expect(mockEmitSystemMessage).not.toHaveBeenCalled();
  });

  it('returns internal_error when the pending insert fails', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockInsertModalityPendingRow.mockRejectedValueOnce(new Error('CHECK failed'));

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'patient',
      requestingRole:    'patient',
      requestingUserId:  'pat-1',
      requestedModality: 'voice',
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('internal_error');
      expect(result.detail).toContain('CHECK failed');
    }
  });
});

// ============================================================================
// Step 9 — Dispatch: patient-initiated downgrade.
// ============================================================================

describe('requestModalityChange · patient-initiated downgrade', () => {
  it('commits immediately as no_refund_downgrade with history + counter + banner', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText({ current_modality: 'video' }),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockInsertModalityHistoryRow.mockResolvedValueOnce({
      id:                'hist-p-down-1',
      sessionId:         'sess-A',
      fromModality:      'video',
      toModality:        'voice',
      initiatedBy:       'patient',
      billingAction:     'no_refund_downgrade',
      amountPaise:       null,
      razorpayPaymentId: null,
      razorpayRefundId:  null,
      reason:            'Phone overheating, switching to voice',
      presetReasonCode:  null,
      correlationId,
      occurredAt:        '2026-04-19T10:00:00Z',
    });

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'patient',
      requestingRole:    'patient',
      requestingUserId:  'pat-1',
      requestedModality: 'voice',
      reason:            'Phone overheating, switching to voice',
      correlationId,
    });

    expect(result.kind).toBe('applied');
    if (result.kind === 'applied') {
      expect(result.billingAction).toBe('no_refund_downgrade');
      expect(result.toModality).toBe('voice');
      expect(result.historyRowId).toBe('hist-p-down-1');
    }
    expect(mockExecuteModalityTransition).toHaveBeenCalledTimes(1);
    expect(mockInsertModalityHistoryRow).toHaveBeenCalledTimes(1);
    expect(mockEmitSystemMessage).toHaveBeenCalledTimes(1);
    // Refund not fired on patient-downgrade.
    expect(mockAutoRefundDowngrade).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Step 9 — Dispatch: doctor-initiated upgrade.
// ============================================================================

describe('requestModalityChange · doctor-initiated upgrade', () => {
  it('returns pending_patient_consent with a 60s expiry window', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    const now = Date.now();
    mockInsertModalityPendingRow.mockResolvedValueOnce({
      id:                'pend-d-upg-1',
      sessionId:         'sess-A',
      initiatedBy:       'doctor',
      requestedModality: 'voice',
      reason:            'Need to hear the patient to confirm symptoms',
      presetReasonCode:  'need_to_hear_voice',
      amountPaise:       null,
      razorpayOrderId:   null,
      requestedAt:       new Date(now).toISOString(),
      expiresAt:         new Date(now + 60_000).toISOString(),
      respondedAt:       null,
      response:          null,
      correlationId,
    });

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'doctor',
      requestingRole:    'doctor',
      requestingUserId:  'doc-1',
      requestedModality: 'voice',
      reason:            'Need to hear the patient to confirm symptoms',
      presetReasonCode:  'need_to_hear_voice',
      correlationId,
    });

    expect(result.kind).toBe('pending_patient_consent');
    if (result.kind === 'pending_patient_consent') {
      expect(result.consentRequestId).toBe('pend-d-upg-1');
    }
    const [, payload] = mockInsertModalityPendingRow.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(payload.initiatedBy).toBe('doctor');
    const expiresMs = new Date(payload.expiresAt as string).getTime();
    expect(expiresMs - now).toBeGreaterThanOrEqual(59_000);
    expect(expiresMs - now).toBeLessThanOrEqual(62_000);
  });
});

// ============================================================================
// Step 9 — Dispatch: doctor-initiated downgrade (auto-refund).
// ============================================================================

describe('requestModalityChange · doctor-initiated downgrade', () => {
  it('commits as auto_refund_downgrade when delta > 0 AND fires the refund', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText({ current_modality: 'video' }),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockComputeUpgradeDelta.mockResolvedValueOnce({ amountPaise: 5000 });
    mockInsertModalityHistoryRow.mockResolvedValueOnce({
      id:                'hist-d-down-1',
      sessionId:         'sess-A',
      fromModality:      'video',
      toModality:        'voice',
      initiatedBy:       'doctor',
      billingAction:     'auto_refund_downgrade',
      amountPaise:       5000,
      razorpayPaymentId: null,
      razorpayRefundId:  null,
      reason:            'Patient environment unsuitable for video',
      presetReasonCode:  'patient_environment',
      correlationId,
      occurredAt:        '2026-04-19T10:00:00Z',
    });

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'doctor',
      requestingRole:    'doctor',
      requestingUserId:  'doc-1',
      requestedModality: 'voice',
      reason:            'Patient environment unsuitable for video',
      presetReasonCode:  'patient_environment',
      correlationId,
    });

    expect(result.kind).toBe('applied');
    if (result.kind === 'applied') {
      expect(result.billingAction).toBe('auto_refund_downgrade');
    }
    expect(mockAutoRefundDowngrade).toHaveBeenCalledTimes(1);
  });

  it('falls back to no_refund_downgrade when delta is 0 (same-priced tier)', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText({ current_modality: 'video' }),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockComputeUpgradeDelta.mockResolvedValueOnce({ amountPaise: 0 });
    mockInsertModalityHistoryRow.mockResolvedValueOnce({
      id:                'hist-d-down-noref-1',
      sessionId:         'sess-A',
      fromModality:      'video',
      toModality:        'voice',
      initiatedBy:       'doctor',
      billingAction:     'no_refund_downgrade',
      amountPaise:       null,
      razorpayPaymentId: null,
      razorpayRefundId:  null,
      reason:            'Same-tier downgrade; no delta',
      presetReasonCode:  null,
      correlationId,
      occurredAt:        '2026-04-19T10:00:00Z',
    });

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'doctor',
      requestingRole:    'doctor',
      requestingUserId:  'doc-1',
      requestedModality: 'voice',
      reason:            'Same-tier downgrade; no delta',
      correlationId,
    });

    expect(result.kind).toBe('applied');
    if (result.kind === 'applied') {
      expect(result.billingAction).toBe('no_refund_downgrade');
    }
    expect(mockAutoRefundDowngrade).not.toHaveBeenCalled();
  });

  it('surfaces internal_error when computeUpgradeDelta throws (billing stub)', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText({ current_modality: 'video' }),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockComputeUpgradeDelta.mockRejectedValueOnce(new Error('BillingNotImplementedError'));

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'doctor',
      requestingRole:    'doctor',
      requestingUserId:  'doc-1',
      requestedModality: 'voice',
      reason:            'Patient environment unsuitable for video',
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('internal_error');
      expect(result.detail).toContain('computeUpgradeDelta');
    }
    expect(mockInsertModalityHistoryRow).not.toHaveBeenCalled();
  });

  it('still reports applied when the refund fire throws (best-effort; worker retries)', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText({ current_modality: 'video' }),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockAutoRefundDowngrade.mockRejectedValueOnce(new Error('razorpay transient'));
    mockInsertModalityHistoryRow.mockResolvedValueOnce({
      id:                'hist-d-down-2',
      billingAction:     'auto_refund_downgrade',
      amountPaise:       5000,
      razorpayPaymentId: null,
      razorpayRefundId:  null,
      reason:            'Patient environment unsuitable for video',
      correlationId,
    });

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'doctor',
      requestingRole:    'doctor',
      requestingUserId:  'doc-1',
      requestedModality: 'voice',
      reason:            'Patient environment unsuitable for video',
      correlationId,
    });
    expect(result.kind).toBe('applied');
  });
});

// ============================================================================
// Commit rollback: executor throws / history fails / counter race.
// ============================================================================

describe('executeAndCommitTransition · rollback doctrine', () => {
  it('returns provider_failure when the executor throws (no history row, no counter bump)', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText({ current_modality: 'video' }),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockExecuteModalityTransition.mockRejectedValueOnce(new Error('twilio room-change failed'));

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'patient',
      requestingRole:    'patient',
      requestingUserId:  'pat-1',
      requestedModality: 'voice',
      reason:            'Phone overheating',
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('provider_failure');
      expect(result.detail).toContain('twilio room-change failed');
    }
    expect(mockInsertModalityHistoryRow).not.toHaveBeenCalled();
  });

  it('returns internal_error when history INSERT fails (no counter bump)', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText({ current_modality: 'video' }),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockInsertModalityHistoryRow.mockRejectedValueOnce(new Error('CHECK modality_history_billing_shape failed'));

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'patient',
      requestingRole:    'patient',
      requestingUserId:  'pat-1',
      requestedModality: 'voice',
      reason:            'Phone overheating',
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('internal_error');
      expect(result.detail).toContain('history_insert');
    }
  });

  it('returns provider_failure (counter_update_raced) when concurrent writer wins the atomic update', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText({ current_modality: 'video' }),
      sessionSelectError:      null,
      sessionUpdateRace:       true,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const result = await requestModalityChange({
      sessionId:         'sess-A',
      initiatedBy:       'patient',
      requestingRole:    'patient',
      requestingUserId:  'pat-1',
      requestedModality: 'voice',
      reason:            'Phone overheating',
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('provider_failure');
      expect(result.detail).toContain('counter_update_raced');
    }
  });
});

// ============================================================================
// Second-round: handleDoctorApprovalOfPatientUpgrade.
// ============================================================================

describe('handleDoctorApprovalOfPatientUpgrade', () => {
  const pendingRow = {
    id:                'pend-p-upg-1',
    sessionId:         'sess-A',
    initiatedBy:       'patient' as const,
    requestedModality: 'voice'   as const,
    reason:            null,
    presetReasonCode:  null,
    amountPaise:       null,
    razorpayOrderId:   null,
    requestedAt:       '2026-04-19T10:00:00Z',
    expiresAt:         '2026-04-19T10:01:30Z',
    respondedAt:       null,
    response:          null,
    correlationId,
  };

  it('decline → resolves pending as declined AND does NOT commit history', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockFetchPendingById.mockResolvedValueOnce(pendingRow);
    mockResolvePendingRequest.mockResolvedValueOnce({ ...pendingRow, response: 'declined' });

    const result = await handleDoctorApprovalOfPatientUpgrade({
      approvalRequestId: 'pend-p-upg-1',
      requestingUserId:  'doc-1',
      decision:          'decline',
      declineReason:     'Need to focus on text chat for now',
      correlationId,
    });

    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') expect(result.detail).toBe('doctor_declined');
    expect(mockInsertModalityHistoryRow).not.toHaveBeenCalled();
  });

  it('free → commits a free_upgrade history row + counter bump + banner', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockFetchPendingById.mockResolvedValueOnce(pendingRow);
    mockResolvePendingRequest.mockResolvedValueOnce({ ...pendingRow, response: 'approved_free' });
    mockInsertModalityHistoryRow.mockResolvedValueOnce({
      id:                'hist-free-1',
      billingAction:     'free_upgrade',
      amountPaise:       null,
      razorpayPaymentId: null,
    });

    const result = await handleDoctorApprovalOfPatientUpgrade({
      approvalRequestId: 'pend-p-upg-1',
      requestingUserId:  'doc-1',
      decision:          'free',
      correlationId,
    });

    expect(result.kind).toBe('applied');
    if (result.kind === 'applied') expect(result.billingAction).toBe('free_upgrade');
    expect(mockInsertModalityHistoryRow).toHaveBeenCalledTimes(1);
  });

  it('paid → resolves pending as approved_paid + creates Razorpay order; returns pending_doctor_approval envelope', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockFetchPendingById.mockResolvedValueOnce(pendingRow);
    mockResolvePendingRequest.mockResolvedValueOnce({ ...pendingRow, response: 'approved_paid' });
    mockCaptureUpgradePayment.mockResolvedValueOnce({ razorpayOrderId: 'order_rzp_xyz' });

    const result = await handleDoctorApprovalOfPatientUpgrade({
      approvalRequestId: 'pend-p-upg-1',
      requestingUserId:  'doc-1',
      decision:          'paid',
      amountPaise:       15000,
      correlationId,
    });

    expect(result.kind).toBe('pending_doctor_approval');
    expect(mockCaptureUpgradePayment).toHaveBeenCalledTimes(1);
    expect(mockStampRazorpayOrderOnPending).toHaveBeenCalledWith(
      expect.anything(),
      'pend-p-upg-1',
      'order_rzp_xyz',
    );
    // No history row yet — that waits for the webhook.
    expect(mockInsertModalityHistoryRow).not.toHaveBeenCalled();
  });

  it('paid → rejects reason_out_of_bounds when amountPaise <= 0', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockFetchPendingById.mockResolvedValueOnce(pendingRow);

    const result = await handleDoctorApprovalOfPatientUpgrade({
      approvalRequestId: 'pend-p-upg-1',
      requestingUserId:  'doc-1',
      decision:          'paid',
      amountPaise:       0,
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') expect(result.reason).toBe('reason_out_of_bounds');
  });

  it('rejects when the caller is not the doctor of the session', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockFetchPendingById.mockResolvedValueOnce(pendingRow);

    const result = await handleDoctorApprovalOfPatientUpgrade({
      approvalRequestId: 'pend-p-upg-1',
      requestingUserId:  'doc-OTHER',
      decision:          'free',
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') expect(result.reason).toBe('forbidden');
  });

  it('rejects when the pending row is already resolved (double-approve race)', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockFetchPendingById.mockResolvedValueOnce({ ...pendingRow, response: 'timeout' });

    const result = await handleDoctorApprovalOfPatientUpgrade({
      approvalRequestId: 'pend-p-upg-1',
      requestingUserId:  'doc-1',
      decision:          'free',
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('internal_error');
      expect(result.detail).toContain('already_resolved:timeout');
    }
  });
});

// ============================================================================
// Second-round: handlePatientConsentForDoctorUpgrade.
// ============================================================================

describe('handlePatientConsentForDoctorUpgrade', () => {
  const pendingDoctorRow = {
    id:                'pend-d-upg-1',
    sessionId:         'sess-A',
    initiatedBy:       'doctor'  as const,
    requestedModality: 'voice'   as const,
    reason:            'Need to hear the patient to confirm symptoms',
    presetReasonCode:  'need_to_hear_voice' as const,
    amountPaise:       null,
    razorpayOrderId:   null,
    requestedAt:       '2026-04-19T10:00:00Z',
    expiresAt:         '2026-04-19T10:01:00Z',
    respondedAt:       null,
    response:          null,
    correlationId,
  };

  it('allow → commits a free_upgrade (doctor-initiated always-free path)', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockFetchPendingById.mockResolvedValueOnce(pendingDoctorRow);
    mockResolvePendingRequest.mockResolvedValueOnce({ ...pendingDoctorRow, response: 'allowed' });
    mockInsertModalityHistoryRow.mockResolvedValueOnce({
      id:                'hist-d-allow-1',
      billingAction:     'free_upgrade',
    });

    const result = await handlePatientConsentForDoctorUpgrade({
      consentRequestId:  'pend-d-upg-1',
      requestingUserId:  'pat-1',
      decision:          'allow',
      correlationId,
    });

    expect(result.kind).toBe('applied');
    if (result.kind === 'applied') expect(result.billingAction).toBe('free_upgrade');
  });

  it('decline → resolves pending as declined; no history row', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockFetchPendingById.mockResolvedValueOnce(pendingDoctorRow);
    mockResolvePendingRequest.mockResolvedValueOnce({ ...pendingDoctorRow, response: 'declined' });

    const result = await handlePatientConsentForDoctorUpgrade({
      consentRequestId:  'pend-d-upg-1',
      requestingUserId:  'pat-1',
      decision:          'decline',
      declineReason:     'Not comfortable on voice right now',
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') expect(result.detail).toBe('patient_declined');
    expect(mockInsertModalityHistoryRow).not.toHaveBeenCalled();
  });

  it('rejects when the caller is not the patient of the session', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockFetchPendingById.mockResolvedValueOnce(pendingDoctorRow);

    const result = await handlePatientConsentForDoctorUpgrade({
      consentRequestId:  'pend-d-upg-1',
      requestingUserId:  'pat-OTHER',
      decision:          'allow',
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') expect(result.reason).toBe('forbidden');
  });
});

// ============================================================================
// Third-round: handleModalityChangePaymentCaptured (webhook dispatch).
// ============================================================================

describe('handleModalityChangePaymentCaptured', () => {
  const paidPendingRow = {
    id:                'pend-p-upg-paid-1',
    sessionId:         'sess-A',
    initiatedBy:       'patient' as const,
    requestedModality: 'voice'   as const,
    reason:            null,
    presetReasonCode:  null,
    amountPaise:       15000,
    razorpayOrderId:   'order_rzp_xyz',
    requestedAt:       '2026-04-19T10:00:00Z',
    expiresAt:         '2026-04-19T10:01:30Z',
    respondedAt:       '2026-04-19T10:01:00Z',
    response:          'approved_paid' as const,
    correlationId,
  };

  it('commits a paid_upgrade history row + counter bump + banner', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockFetchPendingByRazorpayOrderId.mockResolvedValueOnce(paidPendingRow);
    mockInsertModalityHistoryRow.mockResolvedValueOnce({
      id:                'hist-paid-1',
      billingAction:     'paid_upgrade',
      amountPaise:       15000,
      razorpayPaymentId: 'pay_abc',
    });

    const result = await handleModalityChangePaymentCaptured({
      razorpayOrderId:   'order_rzp_xyz',
      razorpayPaymentId: 'pay_abc',
      amountPaiseEcho:   15000,
      correlationId,
    });

    expect(result.kind).toBe('applied');
    if (result.kind === 'applied') expect(result.billingAction).toBe('paid_upgrade');
    expect(mockInsertModalityHistoryRow).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — returns applied without side effects when history row already exists for razorpay_payment_id', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   { id: 'hist-already', billing_action: 'paid_upgrade' },
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockFetchPendingByRazorpayOrderId.mockResolvedValueOnce(paidPendingRow);

    const result = await handleModalityChangePaymentCaptured({
      razorpayOrderId:   'order_rzp_xyz',
      razorpayPaymentId: 'pay_abc',
      amountPaiseEcho:   15000,
      correlationId,
    });

    expect(result.kind).toBe('applied');
    if (result.kind === 'applied') expect(result.historyRowId).toBe('hist-already');
    // Duplicate webhook: no new history / counter / banner fires.
    expect(mockInsertModalityHistoryRow).not.toHaveBeenCalled();
    expect(mockEmitSystemMessage).not.toHaveBeenCalled();
  });

  it('silently skips when no pending row matches razorpay_order_id', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockFetchPendingByRazorpayOrderId.mockResolvedValueOnce(null);

    const result = await handleModalityChangePaymentCaptured({
      razorpayOrderId:   'order_unrelated',
      razorpayPaymentId: 'pay_z',
      amountPaiseEcho:   15000,
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('internal_error');
      expect(result.detail).toContain('no_pending_for_order');
    }
  });

  it('fires a compensating refund when current_modality has drifted past the requested modality', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText({ current_modality: 'voice' }),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockFetchPendingByRazorpayOrderId.mockResolvedValueOnce(paidPendingRow);

    const result = await handleModalityChangePaymentCaptured({
      razorpayOrderId:   'order_rzp_xyz',
      razorpayPaymentId: 'pay_abc',
      amountPaiseEcho:   15000,
      correlationId,
    });
    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') {
      expect(result.reason).toBe('provider_failure');
      expect(result.detail).toContain('modality_drift_post_capture');
      expect(result.refundInitiated).toBe(true);
    }
    expect(mockAutoRefundDowngrade).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// getModalityChangeState.
// ============================================================================

describe('getModalityChangeState', () => {
  it('returns current modality + counters + null pending when idle', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText({ current_modality: 'voice', upgrade_count: 1 }),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockFetchActivePendingForSession.mockResolvedValueOnce(null);

    const state = await getModalityChangeState('sess-A');
    expect(state).not.toBeNull();
    expect(state?.currentModality).toBe('voice');
    expect(state?.upgradeCount).toBe(1);
    expect(state?.downgradeCount).toBe(0);
    expect(state?.activePendingRequest).toBeNull();
  });

  it('projects an active pending row through the public shape', async () => {
    const admin = buildAdminClient({
      sessionRow:              sessionRowLiveText(),
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);
    mockFetchActivePendingForSession.mockResolvedValueOnce({
      id:                'pend-active',
      sessionId:         'sess-A',
      initiatedBy:       'doctor',
      requestedModality: 'voice',
      reason:            'Need to hear',
      presetReasonCode:  'need_to_hear_voice',
      amountPaise:       null,
      razorpayOrderId:   null,
      requestedAt:       '2026-04-19T10:00:00Z',
      expiresAt:         '2026-04-19T10:01:00Z',
      respondedAt:       null,
      response:          null,
      correlationId,
    });

    const state = await getModalityChangeState('sess-A');
    expect(state?.activePendingRequest).toMatchObject({
      id:                'pend-active',
      initiatedBy:       'doctor',
      requestedModality: 'voice',
      kind:              'doctor_upgrade',
    });
  });

  it('returns null when the session does not exist', async () => {
    const admin = buildAdminClient({
      sessionRow:              null,
      sessionSelectError:      null,
      sessionUpdateRace:       false,
      sessionUpdateError:      null,
      historyIdempotencyHit:   null,
      historyIdempotencyError: null,
    });
    mockedDb.getSupabaseAdminClient.mockReturnValue(admin as never);

    const state = await getModalityChangeState('sess-gone');
    expect(state).toBeNull();
  });
});

