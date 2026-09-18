/**
 * Dashboard Insights Controller unit tests (insights-v1 · ins-01 / ins-03).
 *
 * Covers: happy path (doctor-scoped call + canonical response), Zod
 * validation (bad `from`/`to` → error → mapped to 422 by middleware),
 * missing auth → 401, doctor-isolation, and the funnel handler.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

jest.mock('../../../src/services/dashboard-insights-service', () => ({
  getPracticeHealth: jest.fn(),
  getBookingFunnel: jest.fn(),
  getClinicalMix: jest.fn(),
  getTelehealthQuality: jest.fn(),
  CLINICAL_MIX_DEFAULT_LIMIT: 10,
  CLINICAL_MIX_MAX_LIMIT: 50,
}));

import {
  getInsightsClinicalMixHandler,
  getInsightsFunnelHandler,
  getInsightsOverviewHandler,
  getInsightsTelehealthHandler,
} from '../../../src/controllers/dashboard-insights-controller';
import {
  getBookingFunnel,
  getClinicalMix,
  getPracticeHealth,
  getTelehealthQuality,
} from '../../../src/services/dashboard-insights-service';
import { UnauthorizedError, ValidationError } from '../../../src/utils/errors';

const mockedGetPracticeHealth = getPracticeHealth as jest.MockedFunction<
  typeof getPracticeHealth
>;
const mockedGetBookingFunnel = getBookingFunnel as jest.MockedFunction<
  typeof getBookingFunnel
>;
const mockedGetClinicalMix = getClinicalMix as jest.MockedFunction<
  typeof getClinicalMix
>;
const mockedGetTelehealthQuality = getTelehealthQuality as jest.MockedFunction<
  typeof getTelehealthQuality
>;

const DOCTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_DOCTOR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const OVERVIEW_DTO = {
  range: { from: '2026-06-01', to: '2026-06-30' },
  volume: { total: 0, byStatus: {}, byModality: {} },
  noShowRate: 0,
  revenueCapturedMinor: 0,
  currency: 'INR',
  consult: { completionRate: 0, medianDurationSeconds: 0 },
};

const FUNNEL_DTO = {
  range: { from: '2026-06-01', to: '2026-06-30' },
  funnel: {
    slotsSelected: 10,
    slotsConsumed: 8,
    paymentsCaptured: 6,
    appointmentsConfirmed: 5,
  },
  review: {
    pending: 2,
    medianResolutionSeconds: 900,
    breachedSla: 1,
  },
};

const CLINICAL_MIX_DTO = {
  range: { from: '2026-06-01', to: '2026-06-30' },
  topDiagnoses: [{ label: 'Hypertension', count: 4, code: 'BA00' }],
  topMedicines: [{ label: 'Metformin', count: 3 }],
  topInvestigations: [{ label: 'HbA1c', count: 2 }],
  diagnosesSource: 'diagnoses_json' as const,
};

const TELEHEALTH_DTO = {
  range: { from: '2026-06-01', to: '2026-06-30' },
  modalityMix: { text: 1, voice: 2, video: 3 },
  switches: { upgrades: 1, downgrades: 0 },
  joinSuccessRate: 0.8,
  quality: {
    video: { p50Rtt: 40, p95Rtt: 90, avgPacketLoss: 1.2 },
    voice: { p50Rtt: 30, p95Rtt: 60, avgPacketLoss: 0.5 },
  },
};

async function invoke(
  handler: typeof getInsightsOverviewHandler,
  req: Request,
  res: Response
): Promise<unknown> {
  let captured: unknown;
  const next = (err?: unknown): void => {
    captured = err;
  };
  handler(req, res, next);
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  return captured;
}

function mockReqRes(overrides: Partial<Request> = {}): {
  req: Request;
  res: Response;
  status: jest.Mock;
  json: jest.Mock;
} {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn();
  const res = { status, json } as unknown as Response;
  const req = {
    query: {},
    user: { id: DOCTOR_ID },
    correlationId: 'corr-insights',
    ...overrides,
  } as unknown as Request;
  return { req, res, status, json };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetPracticeHealth.mockResolvedValue(OVERVIEW_DTO as never);
  mockedGetBookingFunnel.mockResolvedValue(FUNNEL_DTO as never);
  mockedGetClinicalMix.mockResolvedValue(CLINICAL_MIX_DTO as never);
  mockedGetTelehealthQuality.mockResolvedValue(TELEHEALTH_DTO as never);
});

describe('getInsightsOverviewHandler', () => {
  it('returns 200 with the canonical response and doctor-scoped call', async () => {
    const { req, res, status, json } = mockReqRes({
      query: { from: '2026-06-01', to: '2026-06-30' } as never,
    });

    const err = await invoke(getInsightsOverviewHandler, req, res);

    expect(err).toBeUndefined();
    expect(mockedGetPracticeHealth).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      from: '2026-06-01',
      to: '2026-06-30',
      correlationId: 'corr-insights',
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: OVERVIEW_DTO })
    );
  });

  it('applies default range (today, today − 30d) when params are omitted', async () => {
    const { req, res } = mockReqRes({ query: {} as never });

    const err = await invoke(getInsightsOverviewHandler, req, res);
    expect(err).toBeUndefined();

    const call = mockedGetPracticeHealth.mock.calls[0]![0];
    const spanMs =
      Date.parse(`${call.to}T00:00:00.000Z`) -
      Date.parse(`${call.from}T00:00:00.000Z`);
    expect(Math.round(spanMs / 86_400_000)).toBe(30);
  });

  it('rejects a malformed `from` with a ZodError (→ 422)', async () => {
    const { req, res } = mockReqRes({ query: { from: 'not-a-date' } as never });

    const err = await invoke(getInsightsOverviewHandler, req, res);

    expect(err).toBeInstanceOf(ZodError);
    expect(mockedGetPracticeHealth).not.toHaveBeenCalled();
  });

  it('rejects `from` after `to` with a ValidationError', async () => {
    const { req, res } = mockReqRes({
      query: { from: '2026-06-30', to: '2026-06-01' } as never,
    });

    const err = await invoke(getInsightsOverviewHandler, req, res);

    expect(err).toBeInstanceOf(ValidationError);
    expect(mockedGetPracticeHealth).not.toHaveBeenCalled();
  });

  it('rejects a span greater than 366 days with a ValidationError', async () => {
    const { req, res } = mockReqRes({
      query: { from: '2024-01-01', to: '2026-01-01' } as never,
    });

    const err = await invoke(getInsightsOverviewHandler, req, res);

    expect(err).toBeInstanceOf(ValidationError);
    expect(mockedGetPracticeHealth).not.toHaveBeenCalled();
  });

  it('returns 401 when authentication is missing', async () => {
    const { req, res } = mockReqRes({ user: undefined });

    const err = await invoke(getInsightsOverviewHandler, req, res);

    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(mockedGetPracticeHealth).not.toHaveBeenCalled();
  });

  it('never trusts a `doctorId` from the query — uses req.user.id', async () => {
    const { req, res } = mockReqRes({
      query: { doctorId: OTHER_DOCTOR_ID } as never,
    });

    const err = await invoke(getInsightsOverviewHandler, req, res);

    expect(err).toBeUndefined();
    expect(mockedGetPracticeHealth).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId: DOCTOR_ID })
    );
  });
});

describe('getInsightsFunnelHandler', () => {
  it('returns 200 with the funnel DTO, doctor-scoped', async () => {
    const { req, res, status, json } = mockReqRes({
      query: { from: '2026-06-01', to: '2026-06-30' } as never,
    });

    const err = await invoke(getInsightsFunnelHandler, req, res);

    expect(err).toBeUndefined();
    expect(mockedGetBookingFunnel).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      from: '2026-06-01',
      to: '2026-06-30',
      correlationId: 'corr-insights',
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: FUNNEL_DTO })
    );
  });

  it('rejects bad range and missing auth the same way as overview', async () => {
    const bad = mockReqRes({
      query: { from: '2026-06-30', to: '2026-06-01' } as never,
    });
    const badErr = await invoke(getInsightsFunnelHandler, bad.req, bad.res);
    expect(badErr).toBeInstanceOf(ValidationError);
    expect(mockedGetBookingFunnel).not.toHaveBeenCalled();

    const unauth = mockReqRes({ user: undefined });
    const unauthErr = await invoke(
      getInsightsFunnelHandler,
      unauth.req,
      unauth.res
    );
    expect(unauthErr).toBeInstanceOf(UnauthorizedError);
  });
});

describe('getInsightsClinicalMixHandler', () => {
  it('returns 200 with default limit 10', async () => {
    const { req, res, status, json } = mockReqRes({
      query: { from: '2026-06-01', to: '2026-06-30' } as never,
    });

    const err = await invoke(getInsightsClinicalMixHandler, req, res);

    expect(err).toBeUndefined();
    expect(mockedGetClinicalMix).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      from: '2026-06-01',
      to: '2026-06-30',
      limit: 10,
      correlationId: 'corr-insights',
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: CLINICAL_MIX_DTO })
    );
  });

  it('rejects an out-of-range limit with ZodError', async () => {
    const { req, res } = mockReqRes({
      query: { from: '2026-06-01', to: '2026-06-30', limit: '99' } as never,
    });

    const err = await invoke(getInsightsClinicalMixHandler, req, res);

    expect(err).toBeInstanceOf(ZodError);
    expect(mockedGetClinicalMix).not.toHaveBeenCalled();
  });
});

describe('getInsightsTelehealthHandler', () => {
  it('returns 200 with the telehealth DTO, doctor-scoped', async () => {
    const { req, res, status, json } = mockReqRes({
      query: { from: '2026-06-01', to: '2026-06-30' } as never,
    });

    const err = await invoke(getInsightsTelehealthHandler, req, res);

    expect(err).toBeUndefined();
    expect(mockedGetTelehealthQuality).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      from: '2026-06-01',
      to: '2026-06-30',
      correlationId: 'corr-insights',
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: TELEHEALTH_DTO })
    );
  });

  it('rejects bad range and missing auth the same way as overview', async () => {
    const bad = mockReqRes({
      query: { from: '2026-06-30', to: '2026-06-01' } as never,
    });
    const badErr = await invoke(getInsightsTelehealthHandler, bad.req, bad.res);
    expect(badErr).toBeInstanceOf(ValidationError);
    expect(mockedGetTelehealthQuality).not.toHaveBeenCalled();

    const unauth = mockReqRes({ user: undefined });
    const unauthErr = await invoke(
      getInsightsTelehealthHandler,
      unauth.req,
      unauth.res
    );
    expect(unauthErr).toBeInstanceOf(UnauthorizedError);
  });
});
