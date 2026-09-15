import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
  supabase: {},
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn(async () => undefined),
  logDataModification: jest.fn(async () => undefined),
  logAuditEvent: jest.fn(async () => undefined),
}));

import { getSupabaseAdminClient } from '../../../src/config/database';
import { logAuditEvent } from '../../../src/utils/audit-logger';
import { NotFoundError } from '../../../src/utils/errors';
import {
  applyLabOrderFulfillments,
  daysPendingSince,
  isCoveringInternalDocument,
  isLabLoopComplete,
  isUsLabReportDocument,
  listLabOrdersForAppointment,
  listPendingLabAppointments,
  PENDING_LAB_WINDOW_DAYS,
  pendingWindowStart,
  pickCurrentPrescription,
  projectInvestigationOrders,
  upsertLabOrderFulfillments,
} from '../../../src/services/desk-lab-orders-service';
import { ValidationError } from '../../../src/utils/errors';

const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const ACTOR_ID = '00000000-0000-0000-0000-0000000000cc';
const APT_ID = '00000000-0000-0000-0000-0000000000ff';
const OLD_RX = '00000000-0000-0000-0000-0000000000a1';
const NEW_RX = '00000000-0000-0000-0000-0000000000a2';

const CBC = { id: 'ord-cbc', label: 'CBC', kind: 'panel' };
const LFT = { id: 'ord-lft', label: 'LFT', kind: 'panel' };

type QueryResult = { data: unknown; error: unknown };

function listChain(result: QueryResult) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    order: jest.fn<(...args: unknown[]) => Promise<QueryResult>>().mockResolvedValue(result),
    maybeSingle: jest.fn<(...args: unknown[]) => Promise<QueryResult>>().mockResolvedValue(result),
  };
}

describe('projectInvestigationOrders', () => {
  it('maps id to orderId and drops incomplete rows', () => {
    expect(
      projectInvestigationOrders([
        CBC,
        { id: 'x', label: '  ', kind: 'panel' },
        { label: 'No id', kind: 'custom' },
        LFT,
      ])
    ).toEqual([
      {
        orderId: 'ord-cbc',
        label: 'CBC',
        kind: 'panel',
        status: 'pending',
        reasonCode: null,
        reasonNote: null,
        documentId: null,
      },
      {
        orderId: 'ord-lft',
        label: 'LFT',
        kind: 'panel',
        status: 'pending',
        reasonCode: null,
        reasonNote: null,
        documentId: null,
      },
    ]);
  });
});

describe('applyLabOrderFulfillments / isLabLoopComplete', () => {
  const pendingCbc = {
    orderId: 'ord-cbc',
    label: 'CBC',
    kind: 'panel',
    status: 'pending' as const,
    reasonCode: null,
    reasonNote: null,
    documentId: null,
  };

  it('marks uploaded and not_done rows and ignores junk', () => {
    const merged = applyLabOrderFulfillments(
      [pendingCbc, { ...pendingCbc, orderId: 'ord-lft', label: 'LFT' }],
      [
        {
          appointment_id: APT_ID,
          order_id: 'ord-cbc',
          status: 'uploaded',
          reason_code: null,
          reason_note: null,
          document_id: 'doc-1',
        },
        {
          appointment_id: APT_ID,
          order_id: 'ord-lft',
          status: 'not_done',
          reason_code: 'patient_refused',
          reason_note: null,
          document_id: null,
        },
        {
          appointment_id: APT_ID,
          order_id: 'ord-ghost',
          status: 'uploaded',
          reason_code: null,
          reason_note: null,
          document_id: 'doc-2',
        },
      ]
    );
    expect(merged[0]).toMatchObject({ status: 'uploaded', documentId: 'doc-1' });
    expect(merged[1]).toMatchObject({ status: 'not_done', reasonCode: 'patient_refused' });
    expect(isLabLoopComplete(merged)).toBe(true);
    expect(isLabLoopComplete([pendingCbc])).toBe(false);
  });

  it('treats only in-house lab or imaging as a covering file', () => {
    expect(isCoveringInternalDocument('lab_report', 'us')).toBe(true);
    expect(isCoveringInternalDocument('imaging', 'us')).toBe(true);
    expect(isCoveringInternalDocument('lab_report', 'outside')).toBe(false);
    expect(isCoveringInternalDocument('other', 'us')).toBe(false);
  });
});

describe('pickCurrentPrescription', () => {
  it('skips superseded rows and keeps the latest current', () => {
    const current = pickCurrentPrescription([
      {
        id: OLD_RX,
        appointment_id: APT_ID,
        attested_at: '2026-09-01T00:00:00.000Z',
        superseded_by_id: NEW_RX,
        created_at: '2026-09-01T00:00:00.000Z',
        investigations_orders_json: [CBC],
      },
      {
        id: NEW_RX,
        appointment_id: APT_ID,
        attested_at: '2026-09-02T00:00:00.000Z',
        superseded_by_id: null,
        created_at: '2026-09-02T00:00:00.000Z',
        investigations_orders_json: [LFT],
      },
    ]);
    expect(current?.id).toBe(NEW_RX);
  });
});

describe('daysPendingSince / window', () => {
  it('floors elapsed days and starts the window 60 days back', () => {
    const now = new Date('2026-09-13T12:00:00.000Z');
    expect(daysPendingSince('2026-09-08T12:00:00.000Z', now)).toBe(5);
    expect(PENDING_LAB_WINDOW_DAYS).toBe(60);
    expect(pendingWindowStart(now).toISOString()).toBe('2026-07-15T12:00:00.000Z');
  });
});

describe('isUsLabReportDocument', () => {
  it('is only an internal lab result when type and ordered_by match', () => {
    expect(isUsLabReportDocument('lab_report', 'us')).toBe(true);
    expect(isUsLabReportDocument('lab_report', 'outside')).toBe(false);
    expect(isUsLabReportDocument('other', 'us')).toBe(false);
  });
});

describe('listLabOrdersForAppointment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty orders for an unattested draft', async () => {
    const apt = listChain({
      data: { id: APT_ID, doctor_id: DOCTOR_ID },
      error: null,
    });
    const rx = listChain({
      data: [
        {
          id: NEW_RX,
          appointment_id: APT_ID,
          attested_at: null,
          superseded_by_id: null,
          created_at: '2026-09-12T00:00:00.000Z',
          investigations_orders_json: [CBC],
        },
      ],
      error: null,
    });
    const fulfill = listChain({ data: [], error: null });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'appointments') return apt;
        if (table === 'prescriptions') return rx;
        return fulfill;
      }),
    });

    const orders = await listLabOrdersForAppointment(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID);
    expect(orders).toEqual([]);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ACTOR_ID,
        action: 'read_lab_orders',
        resourceId: APT_ID,
        metadata: { order_count: 0, closed_count: 0 },
        onBehalfOfDoctorId: DOCTOR_ID,
      })
    );
  });

  it('skips a superseded prescription and returns the latest attested orders', async () => {
    const apt = listChain({
      data: { id: APT_ID, doctor_id: DOCTOR_ID },
      error: null,
    });
    const rx = listChain({
      data: [
        {
          id: OLD_RX,
          appointment_id: APT_ID,
          attested_at: '2026-09-01T00:00:00.000Z',
          superseded_by_id: NEW_RX,
          created_at: '2026-09-01T00:00:00.000Z',
          investigations_orders_json: [CBC],
        },
        {
          id: NEW_RX,
          appointment_id: APT_ID,
          attested_at: '2026-09-02T00:00:00.000Z',
          superseded_by_id: null,
          created_at: '2026-09-02T00:00:00.000Z',
          investigations_orders_json: [LFT],
        },
      ],
      error: null,
    });
    const fulfill = listChain({ data: [], error: null });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'appointments') return apt;
        if (table === 'prescriptions') return rx;
        return fulfill;
      }),
    });

    const orders = await listLabOrdersForAppointment(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID);
    expect(orders).toEqual([
      {
        orderId: 'ord-lft',
        label: 'LFT',
        kind: 'panel',
        status: 'pending',
        reasonCode: null,
        reasonNote: null,
        documentId: null,
      },
    ]);
  });

  it('resolves multiple current rows to the newest attested prescription', async () => {
    const apt = listChain({
      data: { id: APT_ID, doctor_id: DOCTOR_ID },
      error: null,
    });
    const rx = listChain({
      data: [
        {
          id: OLD_RX,
          appointment_id: APT_ID,
          attested_at: '2026-09-01T00:00:00.000Z',
          superseded_by_id: null,
          created_at: '2026-09-01T00:00:00.000Z',
          investigations_orders_json: [CBC],
        },
        {
          id: NEW_RX,
          appointment_id: APT_ID,
          attested_at: '2026-09-03T00:00:00.000Z',
          superseded_by_id: null,
          created_at: '2026-09-03T00:00:00.000Z',
          investigations_orders_json: [LFT],
        },
      ],
      error: null,
    });
    const fulfill = listChain({ data: [], error: null });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'appointments') return apt;
        if (table === 'prescriptions') return rx;
        return fulfill;
      }),
    });

    const orders = await listLabOrdersForAppointment(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID);
    expect(orders).toEqual([
      {
        orderId: 'ord-lft',
        label: 'LFT',
        kind: 'panel',
        status: 'pending',
        reasonCode: null,
        reasonNote: null,
        documentId: null,
      },
    ]);
  });

  it('hides another doctor appointment', async () => {
    const apt = listChain({
      data: { id: APT_ID, doctor_id: 'other-doctor' },
      error: null,
    });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => apt),
    });

    await expect(
      listLabOrdersForAppointment(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID)
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('listPendingLabAppointments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockPending(opts: {
    appointments: unknown[];
    prescriptions: unknown[];
    documents: unknown[];
    fulfillments?: unknown[];
  }) {
    const apt = listChain({ data: opts.appointments, error: null });
    const rx = listChain({ data: opts.prescriptions, error: null });
    const docs = listChain({ data: opts.documents, error: null });
    const fulfill = listChain({ data: opts.fulfillments ?? [], error: null });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'appointments') return apt;
        if (table === 'prescriptions') return rx;
        if (table === 'visit_lab_order_fulfillments') return fulfill;
        return docs;
      }),
    });
    return { apt, rx, docs, fulfill };
  }

  const recentDate = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const olderDate = new Date(Date.now() - 10 * 86_400_000).toISOString();
  const tooOldDate = new Date(Date.now() - 70 * 86_400_000).toISOString();

  const baseApt = {
    id: APT_ID,
    doctor_id: DOCTOR_ID,
    patient_id: '00000000-0000-0000-0000-0000000000ee',
    patient_name: 'Test Patient',
    patient_phone: '9999999999',
    appointment_date: recentDate,
    status: 'completed',
    patient_checked_in_at: recentDate,
    patient: {
      date_of_birth: '1990-01-01',
      gender: 'female',
      age: 36,
      medical_record_number: 'P-00837',
    },
  };

  const attestedRx = {
    id: NEW_RX,
    appointment_id: APT_ID,
    attested_at: recentDate,
    superseded_by_id: null,
    created_at: recentDate,
    investigations_orders_json: [CBC],
  };

  it('does not mark a visit closed just because a us lab_report exists', async () => {
    mockPending({
      appointments: [baseApt],
      prescriptions: [attestedRx],
      documents: [
        {
          id: 'doc-us',
          appointment_id: APT_ID,
          document_type: 'lab_report',
          ordered_by: 'us',
        },
      ],
    });

    const items = await listPendingLabAppointments(DOCTOR_ID, 'cid', ACTOR_ID);
    expect(items).toHaveLength(1);
    expect(items[0].report_uploaded).toBe(false);
    expect(items[0].orders_closed).toBe(0);
    expect(items[0].orders[0].status).toBe('pending');
  });

  it('marks a visit closed when every order is uploaded or not done', async () => {
    mockPending({
      appointments: [baseApt],
      prescriptions: [attestedRx],
      documents: [
        {
          id: 'doc-us',
          appointment_id: APT_ID,
          document_type: 'lab_report',
          ordered_by: 'us',
        },
      ],
      fulfillments: [
        {
          appointment_id: APT_ID,
          order_id: 'ord-cbc',
          status: 'uploaded',
          reason_code: null,
          reason_note: null,
          document_id: 'doc-us',
        },
      ],
    });

    const items = await listPendingLabAppointments(DOCTOR_ID, 'cid', ACTOR_ID);
    expect(items).toHaveLength(1);
    expect(items[0].report_uploaded).toBe(true);
    expect(items[0].orders_closed).toBe(1);
    expect(items[0].orders[0]).toMatchObject({
      status: 'uploaded',
      documentId: 'doc-us',
    });
  });

  it('keeps an appointment that only has papers / outside documents', async () => {
    mockPending({
      appointments: [baseApt],
      prescriptions: [attestedRx],
      documents: [
        {
          id: 'doc-paper',
          appointment_id: APT_ID,
          document_type: 'other',
          ordered_by: 'outside',
        },
      ],
    });

    const items = await listPendingLabAppointments(DOCTOR_ID, 'cid', ACTOR_ID);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(
      expect.objectContaining({
        id: APT_ID,
        patient_id: baseApt.patient_id,
        patient_name: 'Test Patient',
        patient_phone: '9999999999',
        patient_mrn: 'P-00837',
        patient_sex: 'female',
        status: 'completed',
        has_visit_documents: true,
        visit_document_count: 1,
        report_uploaded: false,
        orders_closed: 0,
        orders_total: 1,
        orders: [
          {
            orderId: 'ord-cbc',
            label: 'CBC',
            kind: 'panel',
            status: 'pending',
            reasonCode: null,
            reasonNote: null,
            documentId: null,
          },
        ],
      })
    );
    expect(items[0].days_pending).toBeGreaterThanOrEqual(3);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ACTOR_ID,
        action: 'read_lab_pending',
        metadata: { item_count: 1, window_days: 60 },
        onBehalfOfDoctorId: DOCTOR_ID,
      })
    );
  });

  it('excludes cancelled appointments', async () => {
    mockPending({
      appointments: [{ ...baseApt, status: 'cancelled' }],
      prescriptions: [attestedRx],
      documents: [],
    });

    const items = await listPendingLabAppointments(DOCTOR_ID, 'cid', ACTOR_ID);
    expect(items).toEqual([]);
  });

  it('excludes appointments older than 60 days', async () => {
    const { apt } = mockPending({
      appointments: [{ ...baseApt, appointment_date: tooOldDate }],
      prescriptions: [{ ...attestedRx, attested_at: tooOldDate, created_at: tooOldDate }],
      documents: [],
    });

    const items = await listPendingLabAppointments(DOCTOR_ID, 'cid', ACTOR_ID);
    expect(items).toEqual([]);
    expect(apt.gte).toHaveBeenCalledWith('appointment_date', expect.any(String));
    const cutoff = Date.parse((apt.gte as jest.Mock).mock.calls[0][1] as string);
    expect(Date.now() - cutoff).toBeGreaterThan(59 * 86_400_000);
  });

  it('sorts oldest pending first', async () => {
    const otherId = '00000000-0000-0000-0000-0000000000b1';
    mockPending({
      appointments: [
        { ...baseApt, appointment_date: recentDate },
        {
          ...baseApt,
          id: otherId,
          appointment_date: olderDate,
          patient_checked_in_at: olderDate,
        },
      ],
      prescriptions: [
        attestedRx,
        {
          ...attestedRx,
          id: OLD_RX,
          appointment_id: otherId,
          attested_at: olderDate,
          created_at: olderDate,
          investigations_orders_json: [LFT],
        },
      ],
      documents: [],
    });

    const items = await listPendingLabAppointments(DOCTOR_ID, 'cid', ACTOR_ID);
    expect(items.map((item) => item.id)).toEqual([otherId, APT_ID]);
    expect(items[0].days_pending).toBeGreaterThan(items[1].days_pending);
  });

  it('does not load prescriptions with a window-sized appointment in()', async () => {
    const { rx, apt } = mockPending({
      appointments: [baseApt],
      prescriptions: [attestedRx],
      documents: [],
    });

    await listPendingLabAppointments(DOCTOR_ID, 'cid', ACTOR_ID);
    expect(rx.in).not.toHaveBeenCalled();
    expect(rx.not).toHaveBeenCalledWith('attested_at', 'is', null);
    expect(apt.in).toHaveBeenCalledWith('id', [APT_ID]);
  });
});

describe('upsertLabOrderFulfillments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockWrite(opts: {
    appointment?: { id: string; doctor_id: string } | null;
    prescriptions?: unknown[];
    documents?: unknown[];
    fulfillments?: unknown[];
  }) {
    const apt = listChain({
      data: opts.appointment ?? { id: APT_ID, doctor_id: DOCTOR_ID },
      error: null,
    });
    const rx = listChain({
      data:
        opts.prescriptions ?? [
          {
            id: NEW_RX,
            appointment_id: APT_ID,
            attested_at: '2026-09-13T00:00:00.000Z',
            superseded_by_id: null,
            created_at: '2026-09-13T00:00:00.000Z',
            investigations_orders_json: [CBC],
          },
        ],
      error: null,
    });
    const docs = listChain({ data: opts.documents ?? [], error: null });
    const fulfill = {
      ...listChain({ data: opts.fulfillments ?? [], error: null }),
      upsert: jest
        .fn<(...args: unknown[]) => Promise<QueryResult>>()
        .mockResolvedValue({ data: null, error: null }),
      delete: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            in: jest
              .fn<(...args: unknown[]) => Promise<QueryResult>>()
              .mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    };
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'appointments') return apt;
        if (table === 'prescriptions') return rx;
        if (table === 'visit_documents') return docs;
        return fulfill;
      }),
    });
    return { fulfill };
  }

  it('rejects an order that is not on the attested visit', async () => {
    mockWrite({});
    await expect(
      upsertLabOrderFulfillments(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID, [
        { orderId: 'ord-ghost', status: 'not_done', reasonCode: 'patient_refused' },
      ])
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('requires a covering in-house file when marking uploaded', async () => {
    mockWrite({ documents: [] });
    await expect(
      upsertLabOrderFulfillments(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID, [
        {
          orderId: 'ord-cbc',
          status: 'uploaded',
          documentId: '00000000-0000-0000-0000-0000000000d1',
        },
      ])
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('upserts a not-done reason and returns the merged order', async () => {
    const { fulfill } = mockWrite({
      fulfillments: [
        {
          appointment_id: APT_ID,
          order_id: 'ord-cbc',
          status: 'not_done',
          reason_code: 'sample_not_collected',
          reason_note: null,
          document_id: null,
        },
      ],
    });

    const orders = await upsertLabOrderFulfillments(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID, [
      { orderId: 'ord-cbc', status: 'not_done', reasonCode: 'sample_not_collected' },
    ]);

    expect(fulfill.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          appointment_id: APT_ID,
          order_id: 'ord-cbc',
          status: 'not_done',
          reason_code: 'sample_not_collected',
          document_id: null,
        }),
      ],
      { onConflict: 'appointment_id,order_id' }
    );
    expect(orders[0]).toMatchObject({
      orderId: 'ord-cbc',
      status: 'not_done',
      reasonCode: 'sample_not_collected',
    });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'write_lab_order_fulfillment',
        metadata: { update_count: 1, uploaded_count: 0, not_done_count: 1 },
      })
    );
  });
});
