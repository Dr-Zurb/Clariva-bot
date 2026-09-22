import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../src/config/database', () => ({
  getSupabaseAdminClient: jest.fn(),
  supabase: {},
}));

jest.mock('../../../src/utils/audit-logger', () => ({
  logDataAccess: jest.fn(async () => undefined),
  logDataModification: jest.fn(async () => undefined),
  logAuditEvent: jest.fn(async () => undefined),
}));

const registerAttachment = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const assertPrescriptionContentWritable = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/prescription-attachment-service', () => ({
  registerAttachment: (...args: unknown[]) => registerAttachment(...args),
}));

jest.mock('../../../src/services/prescription-service', () => ({
  assertPrescriptionContentWritable: (...args: unknown[]) =>
    assertPrescriptionContentWritable(...args),
}));

import { getSupabaseAdminClient } from '../../../src/config/database';
import {
  confirmVisitDocumentExtractedResults,
  createVisitDocument,
  deleteVisitDocument,
  extractLabFromVisitPage,
  listVisitDocuments,
  parseExtractedResults,
  promoteVisitDocumentPageToPrescription,
} from '../../../src/services/visit-documents-service';
import { logDataAccess, logDataModification } from '../../../src/utils/audit-logger';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../src/utils/errors';

const DOCTOR_ID = '00000000-0000-0000-0000-0000000000aa';
const ACTOR_ID = '00000000-0000-0000-0000-0000000000cc';
const APT_ID = '00000000-0000-0000-0000-0000000000ff';
const OTHER_APT = '00000000-0000-0000-0000-0000000000a1';
const PATIENT_ID = '00000000-0000-0000-0000-0000000000ee';
const DOC_ID = '00000000-0000-0000-0000-0000000000bb';
const PAGE_ID = '00000000-0000-0000-0000-0000000000dd';
const RX_ID = '00000000-0000-0000-0000-0000000000ab';
const SOURCE_FILE = `${DOCTOR_ID}/desk/${APT_ID}/11111111-1111-1111-1111-111111111111-report.jpg`;

const CHECKED_IN = {
  id: APT_ID,
  doctor_id: DOCTOR_ID,
  patient_id: PATIENT_ID,
  status: 'confirmed',
  patient_checked_in_at: '2026-09-12T04:00:00.000Z',
};

function appointmentChain(row: Record<string, unknown> | null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      data: row,
      error: null,
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listVisitDocuments', () => {
  it('returns an empty list and audits the staff actor', async () => {
    const apt = appointmentChain(CHECKED_IN);
    const docs = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: [],
        error: null,
      }),
    };
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => (table === 'appointments' ? apt : docs)),
    });

    const rows = await listVisitDocuments(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID);
    expect(rows).toEqual([]);
    expect(logDataAccess).toHaveBeenCalledWith('cid', ACTOR_ID, 'visit_document', PATIENT_ID);
  });

  it('hides another doctor appointment', async () => {
    const apt = appointmentChain({ ...CHECKED_IN, doctor_id: 'other' });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => apt),
    });

    await expect(listVisitDocuments(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('hides internal labs from a papers-only login', async () => {
    const apt = appointmentChain(CHECKED_IN);
    const docs = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: [
          {
            id: DOC_ID,
            doctor_id: DOCTOR_ID,
            patient_id: PATIENT_ID,
            appointment_id: APT_ID,
            document_type: 'lab_report',
            report_date: '2026-09-01',
            ordered_by: 'us',
            source: 'front_desk',
            actor_id: ACTOR_ID,
            created_at: '2026-09-12T04:01:00.000Z',
            updated_at: '2026-09-12T04:01:00.000Z',
          },
          {
            id: 'paper-1',
            doctor_id: DOCTOR_ID,
            patient_id: PATIENT_ID,
            appointment_id: APT_ID,
            document_type: 'other',
            report_date: null,
            ordered_by: 'outside',
            source: 'front_desk',
            actor_id: ACTOR_ID,
            created_at: '2026-09-12T04:01:00.000Z',
            updated_at: '2026-09-12T04:01:00.000Z',
          },
        ],
        error: null,
      }),
    };
    const pages = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: [],
        error: null,
      }),
    };
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'appointments') return apt;
        if (table === 'visit_document_pages') return pages;
        return docs;
      }),
    });

    const rows = await listVisitDocuments(APT_ID, DOCTOR_ID, 'cid', ACTOR_ID, ['papers']);
    expect(rows.map((row) => row.id)).toEqual(['paper-1']);
  });
});

describe('createVisitDocument', () => {
  it('rejects an internal lab from a papers-only login', async () => {
    const apt = appointmentChain(CHECKED_IN);
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => apt),
    });

    await expect(
      createVisitDocument(
        APT_ID,
        DOCTOR_ID,
        {
          documentType: 'lab_report',
          orderedBy: 'us',
          filePath: `${DOCTOR_ID}/desk/${APT_ID}/file.jpg`,
          fileType: 'image/jpeg',
        },
        'cid',
        ACTOR_ID,
        ['papers']
      )
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects before check-in', async () => {
    const apt = appointmentChain({ ...CHECKED_IN, patient_checked_in_at: null });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => apt),
    });

    await expect(
      createVisitDocument(
        APT_ID,
        DOCTOR_ID,
        {
          documentType: 'lab_report',
          filePath: `${DOCTOR_ID}/desk/${APT_ID}/file.jpg`,
          fileType: 'image/jpeg',
        },
        'cid',
        ACTOR_ID
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('inserts a labelled document and audits the staff actor', async () => {
    const created = {
      id: DOC_ID,
      doctor_id: DOCTOR_ID,
      patient_id: PATIENT_ID,
      appointment_id: APT_ID,
      document_type: 'lab_report',
      report_date: null,
      ordered_by: 'outside',
      source: 'front_desk',
      actor_id: ACTOR_ID,
      created_at: '2026-09-12T04:01:00.000Z',
      updated_at: '2026-09-12T04:01:00.000Z',
    };
    const page = {
      id: PAGE_ID,
      document_id: DOC_ID,
      doctor_id: DOCTOR_ID,
      file_path: `${DOCTOR_ID}/desk/${APT_ID}/file.jpg`,
      file_type: 'image/jpeg',
      page_index: 0,
      created_at: '2026-09-12T04:01:00.000Z',
    };
    const apt = appointmentChain(CHECKED_IN);
    const countDocs = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    };
    countDocs.eq.mockReturnValue({
      eq: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: [],
        error: null,
      }),
    });

    const insertDoc = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: created,
        error: null,
      }),
    };
    const insertPage = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: page,
        error: null,
      }),
    };

    let visitDocCalls = 0;
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'appointments') return apt;
        if (table === 'visit_document_pages') return insertPage;
        visitDocCalls += 1;
        return visitDocCalls === 1 ? countDocs : insertDoc;
      }),
    });

    const row = await createVisitDocument(
      APT_ID,
      DOCTOR_ID,
      {
        documentType: 'lab_report',
        filePath: `${DOCTOR_ID}/desk/${APT_ID}/file.jpg`,
        fileType: 'image/jpeg',
      },
      'cid',
      ACTOR_ID
    );

    expect(row.id).toBe(DOC_ID);
    expect(row.pages).toHaveLength(1);
    expect(row.pages[0]?.id).toBe(PAGE_ID);
    expect(row.source).toBe('front_desk');
    expect(logDataModification).toHaveBeenCalledWith(
      'cid',
      ACTOR_ID,
      'create',
      'visit_document',
      DOC_ID,
      undefined,
      DOCTOR_ID
    );
  });
});

const DOCUMENT_ROW = {
  id: DOC_ID,
  doctor_id: DOCTOR_ID,
  patient_id: PATIENT_ID,
  appointment_id: APT_ID,
  document_type: 'lab_report',
  report_date: '2026-09-01',
  ordered_by: 'outside',
  source: 'front_desk',
  actor_id: ACTOR_ID,
  created_at: '2026-09-12T04:01:00.000Z',
  updated_at: '2026-09-12T04:01:00.000Z',
};

const PAGE_ROW = {
  id: PAGE_ID,
  document_id: DOC_ID,
  doctor_id: DOCTOR_ID,
  file_path: SOURCE_FILE,
  file_type: 'image/jpeg',
  page_index: 0,
  created_at: '2026-09-12T04:01:00.000Z',
};

const RX_ROW = {
  id: RX_ID,
  doctor_id: DOCTOR_ID,
  appointment_id: APT_ID,
};

const PROMOTED_ATTACHMENT = {
  id: '00000000-0000-0000-0000-0000000000ae',
  prescription_id: RX_ID,
  file_path: `${DOCTOR_ID}/${RX_ID}/objective/dest.jpg`,
  file_type: 'image/jpeg',
  caption: null,
  uploaded_at: '2026-09-12T04:02:00.000Z',
};

function promoteClient(opts: {
  appointment?: Record<string, unknown> | null;
  document?: Record<string, unknown> | null;
  page?: Record<string, unknown> | null;
  prescription?: Record<string, unknown> | null;
  storage?: Record<string, unknown>;
}) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'appointments') return appointmentChain(opts.appointment ?? CHECKED_IN);
      if (table === 'visit_documents') return appointmentChain(opts.document === undefined ? DOCUMENT_ROW : opts.document);
      if (table === 'visit_document_pages') return appointmentChain(opts.page === undefined ? PAGE_ROW : opts.page);
      if (table === 'prescriptions') return appointmentChain(opts.prescription === undefined ? RX_ROW : opts.prescription);
      return appointmentChain(null);
    }),
    storage: {
      from: jest.fn(() => opts.storage ?? { copy: jest.fn() }),
    },
  };
}

describe('promoteVisitDocumentPageToPrescription', () => {
  beforeEach(() => {
    registerAttachment.mockResolvedValue(PROMOTED_ATTACHMENT);
    assertPrescriptionContentWritable.mockResolvedValue(undefined);
  });

  it('hides another doctor appointment', async () => {
    (getSupabaseAdminClient as jest.Mock).mockReturnValue(
      promoteClient({ appointment: { ...CHECKED_IN, doctor_id: 'other' } })
    );

    await expect(
      promoteVisitDocumentPageToPrescription(RX_ID, APT_ID, DOC_ID, PAGE_ID, DOCTOR_ID, 'cid', DOCTOR_ID)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(registerAttachment).not.toHaveBeenCalled();
  });

  it('rejects a page that is not on this appointment', async () => {
    (getSupabaseAdminClient as jest.Mock).mockReturnValue(promoteClient({ document: null }));

    await expect(
      promoteVisitDocumentPageToPrescription(RX_ID, APT_ID, DOC_ID, PAGE_ID, DOCTOR_ID, 'cid', DOCTOR_ID)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(registerAttachment).not.toHaveBeenCalled();
  });

  it('rejects a prescription for a different appointment', async () => {
    (getSupabaseAdminClient as jest.Mock).mockReturnValue(
      promoteClient({ prescription: { ...RX_ROW, appointment_id: OTHER_APT } })
    );

    await expect(
      promoteVisitDocumentPageToPrescription(RX_ID, APT_ID, DOC_ID, PAGE_ID, DOCTOR_ID, 'cid', DOCTOR_ID)
    ).rejects.toBeInstanceOf(ValidationError);
    expect(registerAttachment).not.toHaveBeenCalled();
  });

  it('copies the desk object and registers an objective attachment', async () => {
    const copy = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      data: { path: 'dest' },
      error: null,
    });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue(promoteClient({ storage: { copy } }));

    const attachment = await promoteVisitDocumentPageToPrescription(
      RX_ID,
      APT_ID,
      DOC_ID,
      PAGE_ID,
      DOCTOR_ID,
      'cid',
      DOCTOR_ID
    );

    expect(attachment.id).toBe(PROMOTED_ATTACHMENT.id);
    expect(copy).toHaveBeenCalledTimes(1);
    const [fromPath, toPath] = copy.mock.calls[0] as [string, string];
    expect(fromPath).toBe(SOURCE_FILE);
    expect(toPath).toMatch(new RegExp(`^${DOCTOR_ID}/${RX_ID}/objective/[0-9a-f-]+-report\\.jpg$`));
    expect(registerAttachment).toHaveBeenCalledWith(
      RX_ID,
      toPath,
      'image/jpeg',
      null,
      'cid',
      DOCTOR_ID
    );
    expect(logDataModification).toHaveBeenCalledWith(
      'cid',
      DOCTOR_ID,
      'create',
      'visit_document_promote',
      PAGE_ID
    );
  });

  it('falls back to download and upload when copy is unavailable', async () => {
    const download = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      data: { size: 4 },
      error: null,
    });
    const upload = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      error: null,
    });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue(
      promoteClient({ storage: { download, upload } })
    );

    await promoteVisitDocumentPageToPrescription(
      RX_ID,
      APT_ID,
      DOC_ID,
      PAGE_ID,
      DOCTOR_ID,
      'cid',
      DOCTOR_ID
    );

    expect(download).toHaveBeenCalledWith(SOURCE_FILE);
    expect(upload).toHaveBeenCalledTimes(1);
    const [toPath, body, opts] = upload.mock.calls[0] as [string, unknown, { contentType: string }];
    expect(toPath).toMatch(new RegExp(`^${DOCTOR_ID}/${RX_ID}/objective/[0-9a-f-]+-report\\.jpg$`));
    expect(body).toEqual({ size: 4 });
    expect(opts.contentType).toBe('image/jpeg');
    expect(registerAttachment).toHaveBeenCalled();
  });
});

const PANEL = {
  pageId: PAGE_ID,
  report: {
    id: '00000000-0000-0000-0000-0000000000c1',
    kind: 'lab' as const,
    title: 'Page 1',
    reportDate: '2026-09-13',
    labName: null,
    attachmentIds: [PAGE_ID],
    findings: null,
    entryMethod: 'extracted' as const,
  },
  rows: [
    {
      id: '00000000-0000-0000-0000-0000000000c2',
      source: 'patient_report' as const,
      name: 'Haemoglobin',
      value: '11.8',
      unit: 'g/dL',
      date: '2026-09-13',
      interpretation: null,
      notes: null,
      reportId: '00000000-0000-0000-0000-0000000000c1',
      refLow: 12,
      refHigh: 15,
      refText: null,
      method: null,
    },
  ],
};

describe('parseExtractedResults', () => {
  it('returns an empty list for garbage', () => {
    expect(parseExtractedResults(null)).toEqual([]);
    expect(parseExtractedResults({ nope: true })).toEqual([]);
    expect(parseExtractedResults(['x'])).toEqual([]);
  });

  it('keeps a well-formed panel', () => {
    const parsed = parseExtractedResults([
      { ...PANEL, confirmed_at: '2026-09-13T02:00:00.000Z', confirmed_by: ACTOR_ID },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.pageId).toBe(PAGE_ID);
    expect(parsed[0]?.rows[0]?.name).toBe('Haemoglobin');
  });
});

describe('extractLabFromVisitPage', () => {
  it('downloads the page and returns suggestion rows', async () => {
    const download = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      data: {
        arrayBuffer: async () => Buffer.from('jpeg-bytes'),
      },
      error: null,
    });
    const extractImage = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      rows: [
        {
          rawName: 'Haemoglobin',
          rawValue: '11.8',
          rawUnit: 'g/dL',
          rawRange: '12.0 - 15.0',
          rawMethod: null,
          pageIndex: 0,
          lineText: 'Haemoglobin 11.8 g/dL',
        },
      ],
    });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'appointments') return appointmentChain(CHECKED_IN);
        if (table === 'visit_documents') return appointmentChain(DOCUMENT_ROW);
        if (table === 'visit_document_pages') return appointmentChain(PAGE_ROW);
        return appointmentChain(null);
      }),
      storage: { from: jest.fn(() => ({ download })) },
    });

    const result = await extractLabFromVisitPage(
      APT_ID,
      DOC_ID,
      PAGE_ID,
      DOCTOR_ID,
      'cid',
      ACTOR_ID,
      { extractImage: extractImage as never }
    );

    expect(download).toHaveBeenCalledWith(SOURCE_FILE);
    expect(result.pageId).toBe(PAGE_ID);
    expect(result.source).toBe('vision');
    expect(result.rows[0]?.rawValue).toBe('11.8');
    expect(logDataAccess).toHaveBeenCalledWith('cid', ACTOR_ID, 'visit_document_page', PAGE_ID);
  });
});

describe('confirmVisitDocumentExtractedResults', () => {
  it('merges incoming panels by pageId and keeps the other page', async () => {
    const otherPageId = '00000000-0000-0000-0000-0000000000d1';
    const existingOther = {
      ...PANEL,
      pageId: otherPageId,
      confirmed_at: '2026-09-12T04:00:00.000Z',
      confirmed_by: ACTOR_ID,
    };
    const pages = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: [PAGE_ROW],
        error: null,
      }),
    };
    const updated = {
      ...DOCUMENT_ROW,
      extracted_results: [{ ...PANEL, confirmed_at: 'now', confirmed_by: ACTOR_ID }, existingOther],
    };
    const updateDoc = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: updated,
        error: null,
      }),
    };
    let visitDocCalls = 0;
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'appointments') return appointmentChain(CHECKED_IN);
        if (table === 'visit_document_pages') return pages;
        visitDocCalls += 1;
        if (visitDocCalls === 1) {
          return appointmentChain({
            ...DOCUMENT_ROW,
            extracted_results: [existingOther],
          });
        }
        return updateDoc;
      }),
    });

    const document = await confirmVisitDocumentExtractedResults(
      APT_ID,
      DOC_ID,
      DOCTOR_ID,
      [PANEL],
      'cid',
      ACTOR_ID
    );

    expect(document.extracted_results).toHaveLength(2);
    expect(document.extracted_results.map((panel) => panel.pageId).sort()).toEqual(
      [PAGE_ID, otherPageId].sort()
    );
    expect(updateDoc.update).toHaveBeenCalledWith(
      expect.objectContaining({
        extracted_results: expect.arrayContaining([
          expect.objectContaining({ pageId: PAGE_ID, confirmed_by: ACTOR_ID }),
          expect.objectContaining({ pageId: otherPageId }),
        ]),
      })
    );
    expect(logDataModification).toHaveBeenCalledWith(
      'cid',
      ACTOR_ID,
      'update',
      'visit_document_extract',
      DOC_ID,
      ['pages:1'],
      DOCTOR_ID
    );
  });

  it('rejects a page that is not on this document', async () => {
    const pages = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        data: [PAGE_ROW],
        error: null,
      }),
    };
    (getSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'appointments') return appointmentChain(CHECKED_IN);
        if (table === 'visit_document_pages') return pages;
        return appointmentChain(DOCUMENT_ROW);
      }),
    });

    await expect(
      confirmVisitDocumentExtractedResults(
        APT_ID,
        DOC_ID,
        DOCTOR_ID,
        [{ ...PANEL, pageId: '00000000-0000-0000-0000-0000000000ee' }],
        'cid',
        ACTOR_ID
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

function deleteClient(document: Record<string, unknown>) {
  const pages = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
      data: [PAGE_ROW],
      error: null,
    }),
  };
  const remove = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
    error: null,
  });
  return {
    from: jest.fn((table: string) => {
      if (table === 'appointments') return appointmentChain(CHECKED_IN);
      if (table === 'visit_document_pages') return pages;
      if (table === 'prescriptions') return appointmentChain(RX_ROW);
      if (table === 'visit_documents') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest
            .fn<(...args: unknown[]) => Promise<unknown>>()
            .mockResolvedValue({ data: document, error: null }),
          delete: jest.fn().mockReturnThis(),
        };
      }
      return appointmentChain(null);
    }),
    storage: { from: jest.fn(() => ({ remove })) },
  };
}

describe('deleteVisitDocument', () => {
  it('lets labs staff remove an in-visit report they uploaded', async () => {
    const client = deleteClient({ ...DOCUMENT_ROW, ordered_by: 'us' });
    (getSupabaseAdminClient as jest.Mock).mockReturnValue(client);

    await deleteVisitDocument(APT_ID, DOC_ID, DOCTOR_ID, 'cid', ACTOR_ID, true, [
      'internal_labs',
    ]);

    expect(client.storage.from).toHaveBeenCalledWith('prescription-attachments');
    expect(logDataModification).toHaveBeenCalledWith(
      'cid',
      ACTOR_ID,
      'delete',
      'visit_document',
      DOC_ID,
      undefined,
      DOCTOR_ID
    );
  });

  it('lets papers staff remove a file after the doctor opened the visit', async () => {
    const client = deleteClient(DOCUMENT_ROW);
    (getSupabaseAdminClient as jest.Mock).mockReturnValue(client);

    await deleteVisitDocument(APT_ID, DOC_ID, DOCTOR_ID, 'cid', ACTOR_ID, true, ['papers']);

    expect(client.storage.from).toHaveBeenCalledWith('prescription-attachments');
    expect(logDataModification).toHaveBeenCalledWith(
      'cid',
      ACTOR_ID,
      'delete',
      'visit_document',
      DOC_ID,
      undefined,
      DOCTOR_ID
    );
  });
});
