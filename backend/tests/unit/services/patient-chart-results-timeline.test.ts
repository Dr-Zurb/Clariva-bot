/**
 * getResultsTimeline — unit tests (soap-data-placement P3 · sdp-05).
 *
 * Projects the patient's prescriptions into a date-desc investigations &
 * results timeline: ordered + resulted + per-visit objective media count.
 * Read-only, no view/migration (P3-D1). PHI-safe (P3-D3).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
}));
jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn().mockResolvedValue(undefined as never),
  logDataModification: jest.fn().mockResolvedValue(undefined as never),
}));

import * as database from '../../../src/config/database';
import * as auditLogger from '../../../src/utils/audit-logger';
import { getResultsTimeline } from '../../../src/services/patient-chart-service';

const mockedDb = database as jest.Mocked<typeof database>;
const mockedAudit = auditLogger as jest.Mocked<typeof auditLogger>;

const correlationId = 'corr-sdp-05';
const doctorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const patientId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

type PrescriptionRow = Record<string, unknown>;
type AttachmentRow = { prescription_id: string; file_path: string | null };

function mockAdmin(options: {
  prescriptions?: PrescriptionRow[];
  attachments?: AttachmentRow[];
  prescriptionError?: unknown;
}) {
  // Captures the doctor_id/patient_id filters applied to the prescriptions read
  // so a test can assert doctor-scoping.
  const prescriptionFilters: Record<string, string> = {};

  mockedDb.getSupabaseAdminClient.mockReturnValue({
    from: jest.fn((table: string) => {
      if (table === 'prescriptions') {
        const builder = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn((col: string, val: string) => {
            prescriptionFilters[col] = val;
            return builder;
          }),
          order: jest.fn(async () => ({
            data: options.prescriptions ?? [],
            error: options.prescriptionError ?? null,
          })),
        };
        return builder;
      }
      if (table === 'prescription_attachments') {
        return {
          select: jest.fn().mockReturnThis(),
          in: jest.fn(async () => ({ data: options.attachments ?? [], error: null })),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  } as never);

  return { prescriptionFilters };
}

describe('getResultsTimeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('projects ordered-only, result-only, and both visits; omits empty visits', async () => {
    mockAdmin({
      prescriptions: [
        {
          id: 'rx-both',
          appointment_id: 'apt-both',
          created_at: '2026-03-01T00:00:00.000Z',
          investigations_orders: 'CBC, LFT',
          test_results_json: [
            { id: 'tr-1', source: 'in_clinic_poc', name: 'RBS', value: '110', unit: 'mg/dL' },
          ],
        },
        {
          id: 'rx-ordered',
          appointment_id: 'apt-ordered',
          created_at: '2026-02-01T00:00:00.000Z',
          investigations_orders: 'Chest X-ray',
          test_results_json: [],
        },
        {
          id: 'rx-result',
          appointment_id: 'apt-result',
          created_at: '2026-01-15T00:00:00.000Z',
          investigations_orders: null,
          test_results_json: [
            { id: 'tr-2', source: 'patient_report', name: 'HbA1c', value: '6.2', unit: '%' },
          ],
        },
        {
          id: 'rx-empty',
          appointment_id: 'apt-empty',
          created_at: '2026-01-01T00:00:00.000Z',
          investigations_orders: '   ',
          test_results_json: [],
        },
      ],
      attachments: [],
    });

    const timeline = await getResultsTimeline(patientId, correlationId, doctorId);

    expect(timeline.map((e) => e.prescriptionId)).toEqual(['rx-both', 'rx-ordered', 'rx-result']);

    expect(timeline[0]).toMatchObject({
      prescriptionId: 'rx-both',
      appointmentId: 'apt-both',
      visitDate: '2026-03-01T00:00:00.000Z',
      ordered: 'CBC, LFT',
      mediaCount: 0,
    });
    expect(timeline[0].resulted).toHaveLength(1);

    expect(timeline[1]).toMatchObject({ ordered: 'Chest X-ray' });
    expect(timeline[1].resulted).toHaveLength(0);

    expect(timeline[2]).toMatchObject({ ordered: null });
    expect(timeline[2].resulted).toHaveLength(1);
  });

  it('returns visits date-descending', async () => {
    mockAdmin({
      prescriptions: [
        {
          id: 'rx-new',
          appointment_id: 'apt-new',
          created_at: '2026-05-01T00:00:00.000Z',
          investigations_orders: 'CBC',
          test_results_json: [],
        },
        {
          id: 'rx-old',
          appointment_id: 'apt-old',
          created_at: '2026-04-01T00:00:00.000Z',
          investigations_orders: 'LFT',
          test_results_json: [],
        },
      ],
      attachments: [],
    });

    const timeline = await getResultsTimeline(patientId, correlationId, doctorId);
    expect(timeline.map((e) => e.visitDate)).toEqual([
      '2026-05-01T00:00:00.000Z',
      '2026-04-01T00:00:00.000Z',
    ]);
  });

  it('counts only objective-segment attachments per visit', async () => {
    mockAdmin({
      prescriptions: [
        {
          id: 'rx-1',
          appointment_id: 'apt-1',
          created_at: '2026-03-01T00:00:00.000Z',
          investigations_orders: 'USG abdomen',
          test_results_json: [],
        },
      ],
      attachments: [
        { prescription_id: 'rx-1', file_path: `${doctorId}/rx-1/objective/uuid-scan1.pdf` },
        { prescription_id: 'rx-1', file_path: `${doctorId}/rx-1/objective/uuid-scan2.jpg` },
        // Non-objective (handwritten Rx) attachment — must not be counted.
        { prescription_id: 'rx-1', file_path: `${doctorId}/rx-1/uuid-handwritten.jpg` },
        // Subjective-pinned photo — different segment, not counted.
        { prescription_id: 'rx-1', file_path: `${doctorId}/rx-1/subjective/c-1/uuid-photo.jpg` },
      ],
    });

    const timeline = await getResultsTimeline(patientId, correlationId, doctorId);
    expect(timeline[0].mediaCount).toBe(2);
  });

  it('surfaces a media-only visit (no ordered, no resulted)', async () => {
    mockAdmin({
      prescriptions: [
        {
          id: 'rx-media',
          appointment_id: 'apt-media',
          created_at: '2026-03-01T00:00:00.000Z',
          investigations_orders: null,
          test_results_json: [],
        },
      ],
      attachments: [
        { prescription_id: 'rx-media', file_path: `${doctorId}/rx-media/objective/uuid-report.pdf` },
      ],
    });

    const timeline = await getResultsTimeline(patientId, correlationId, doctorId);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ ordered: null, mediaCount: 1 });
    expect(timeline[0].resulted).toHaveLength(0);
  });

  it('returns an empty timeline when the patient has no prescriptions', async () => {
    mockAdmin({ prescriptions: [], attachments: [] });
    const timeline = await getResultsTimeline(patientId, correlationId, doctorId);
    expect(timeline).toEqual([]);
  });

  it('scopes the read to the doctor and patient', async () => {
    const { prescriptionFilters } = mockAdmin({ prescriptions: [], attachments: [] });
    await getResultsTimeline(patientId, correlationId, doctorId);
    expect(prescriptionFilters.doctor_id).toBe(doctorId);
    expect(prescriptionFilters.patient_id).toBe(patientId);
  });

  it('logs data access with the patient id only (PHI-safe)', async () => {
    mockAdmin({
      prescriptions: [
        {
          id: 'rx-1',
          appointment_id: 'apt-1',
          created_at: '2026-03-01T00:00:00.000Z',
          investigations_orders: 'CBC',
          test_results_json: [
            { id: 'tr-1', source: 'in_clinic_poc', name: 'RBS', value: '110', unit: 'mg/dL' },
          ],
        },
      ],
      attachments: [],
    });

    await getResultsTimeline(patientId, correlationId, doctorId);

    expect(mockedAudit.logDataAccess).toHaveBeenCalledWith(
      correlationId,
      doctorId,
      'prescription',
      patientId,
    );
    const loggedArgs = mockedAudit.logDataAccess.mock.calls.flat().join(' ');
    expect(loggedArgs).not.toContain('CBC');
    expect(loggedArgs).not.toContain('RBS');
  });
});

describe('sdp-07 close-gate · projection correctness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('attributes ordered, resulted, and media per visit without cross-visit bleed', async () => {
    mockAdmin({
      prescriptions: [
        {
          id: 'rx-march',
          appointment_id: 'apt-march',
          created_at: '2026-03-15T00:00:00.000Z',
          investigations_orders: 'CBC, LFT',
          test_results_json: [
            { id: 'tr-march', source: 'in_clinic_poc', name: 'RBS', value: '98', unit: 'mg/dL' },
          ],
        },
        {
          id: 'rx-feb',
          appointment_id: 'apt-feb',
          created_at: '2026-02-10T00:00:00.000Z',
          investigations_orders: 'USG abdomen',
          test_results_json: [],
        },
        {
          id: 'rx-jan',
          appointment_id: 'apt-jan',
          created_at: '2026-01-05T00:00:00.000Z',
          investigations_orders: null,
          test_results_json: [
            { id: 'tr-jan', source: 'patient_report', name: 'HbA1c', value: '6.1', unit: '%' },
          ],
        },
        {
          id: 'rx-empty',
          appointment_id: 'apt-empty',
          created_at: '2025-12-01T00:00:00.000Z',
          investigations_orders: null,
          test_results_json: [],
        },
      ],
      attachments: [
        { prescription_id: 'rx-march', file_path: `${doctorId}/rx-march/objective/scan-a.pdf` },
        { prescription_id: 'rx-march', file_path: `${doctorId}/rx-march/objective/scan-b.jpg` },
        { prescription_id: 'rx-feb', file_path: `${doctorId}/rx-feb/objective/report.pdf` },
        // Attachments on other visits must not inflate rx-march / rx-jan counts.
        { prescription_id: 'rx-jan', file_path: `${doctorId}/rx-jan/uuid-handwritten.jpg` },
      ],
    });

    const timeline = await getResultsTimeline(patientId, correlationId, doctorId);

    expect(timeline.map((e) => e.prescriptionId)).toEqual(['rx-march', 'rx-feb', 'rx-jan']);
    expect(timeline.map((e) => e.visitDate)).toEqual([
      '2026-03-15T00:00:00.000Z',
      '2026-02-10T00:00:00.000Z',
      '2026-01-05T00:00:00.000Z',
    ]);

    expect(timeline[0]).toMatchObject({
      ordered: 'CBC, LFT',
      mediaCount: 2,
    });
    expect(timeline[0].resulted).toEqual([
      expect.objectContaining({ id: 'tr-march', name: 'RBS' }),
    ]);

    expect(timeline[1]).toMatchObject({
      ordered: 'USG abdomen',
      mediaCount: 1,
    });
    expect(timeline[1].resulted).toHaveLength(0);

    expect(timeline[2]).toMatchObject({
      ordered: null,
      mediaCount: 0,
    });
    expect(timeline[2].resulted).toEqual([
      expect.objectContaining({ id: 'tr-jan', name: 'HbA1c' }),
    ]);
  });

  it('returns empty timeline when every visit lacks ordered, resulted, and media', async () => {
    mockAdmin({
      prescriptions: [
        {
          id: 'rx-blank-a',
          appointment_id: 'apt-a',
          created_at: '2026-03-01T00:00:00.000Z',
          investigations_orders: '   ',
          test_results_json: [],
        },
        {
          id: 'rx-blank-b',
          appointment_id: 'apt-b',
          created_at: '2026-02-01T00:00:00.000Z',
          investigations_orders: null,
          test_results_json: null,
        },
      ],
      attachments: [
        { prescription_id: 'rx-blank-a', file_path: `${doctorId}/rx-blank-a/uuid-draft.jpg` },
      ],
    });

    const timeline = await getResultsTimeline(patientId, correlationId, doctorId);
    expect(timeline).toEqual([]);
  });

  it('surfaces order-only and result-only visits on the same timeline', async () => {
    mockAdmin({
      prescriptions: [
        {
          id: 'rx-order-only',
          appointment_id: 'apt-order',
          created_at: '2026-04-01T00:00:00.000Z',
          investigations_orders: 'Chest X-ray',
          test_results_json: [],
        },
        {
          id: 'rx-result-only',
          appointment_id: 'apt-result',
          created_at: '2026-03-01T00:00:00.000Z',
          investigations_orders: null,
          test_results_json: [
            { id: 'tr-only', source: 'patient_report', name: 'TSH', value: '2.1', unit: 'mIU/L' },
          ],
        },
      ],
      attachments: [],
    });

    const timeline = await getResultsTimeline(patientId, correlationId, doctorId);

    expect(timeline).toHaveLength(2);
    expect(timeline[0]).toMatchObject({
      prescriptionId: 'rx-order-only',
      ordered: 'Chest X-ray',
      mediaCount: 0,
    });
    expect(timeline[0].resulted).toHaveLength(0);

    expect(timeline[1]).toMatchObject({
      prescriptionId: 'rx-result-only',
      ordered: null,
      mediaCount: 0,
    });
    expect(timeline[1].resulted).toHaveLength(1);
  });
});
