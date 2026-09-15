import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

const listVisitDocuments = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const createVisitDocument = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const extractLabFromVisitPage = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const confirmVisitDocumentExtractedResults = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../../../src/services/visit-documents-service', () => ({
  listVisitDocuments: (...args: unknown[]) => listVisitDocuments(...args),
  createVisitDocument: (...args: unknown[]) => createVisitDocument(...args),
  createVisitDocumentUploadUrl: jest.fn(),
  addVisitDocumentPage: jest.fn(),
  updateVisitDocument: jest.fn(),
  getVisitDocumentPageDownloadUrl: jest.fn(),
  deleteVisitDocument: jest.fn(),
  deleteVisitDocumentPage: jest.fn(),
  listVisitDocumentsForPatient: jest.fn(),
  extractLabFromVisitPage: (...args: unknown[]) => extractLabFromVisitPage(...args),
  confirmVisitDocumentExtractedResults: (...args: unknown[]) =>
    confirmVisitDocumentExtractedResults(...args),
}));

jest.mock('../../../src/config/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

import {
  confirmVisitDocumentExtractedResultsHandler,
  createVisitDocumentHandler,
  extractVisitDocumentPageLabHandler,
  listVisitDocumentsHandler,
} from '../../../src/controllers/visit-documents-controller';

const DOCTOR_ID = '550e8400-e29b-41d4-a716-446655440000';
const ACTOR_ID = '660e8400-e29b-41d4-a716-446655440001';
const APT_ID = '880e8400-e29b-41d4-a716-446655440003';
const DOC_ID = '770e8400-e29b-41d4-a716-446655440002';
const PAGE_ID = '990e8400-e29b-41d4-a716-446655440004';
const REPORT_ID = 'aa0e8400-e29b-41d4-a716-446655440005';
const ROW_ID = 'bb0e8400-e29b-41d4-a716-446655440006';

function mockRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

function staffReq(overrides: Record<string, unknown> = {}): Request {
  return {
    user: { id: ACTOR_ID },
    actingDoctorId: DOCTOR_ID,
    actorId: ACTOR_ID,
    actorKind: 'staff',
    staffCapabilities: ['papers'],
    correlationId: 'cid',
    params: { id: APT_ID },
    body: {},
    ...overrides,
  } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('visit document handlers', () => {
  it('GET lists documents for the acting doctor', async () => {
    listVisitDocuments.mockResolvedValue([]);
    const res = mockRes();
    let err: unknown;
    listVisitDocumentsHandler(staffReq(), res, ((nextErr?: unknown) => {
      err = nextErr;
    }) as never);
    await new Promise((resolve) => setImmediate(resolve));

    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(listVisitDocuments).toHaveBeenCalledWith(
      APT_ID,
      DOCTOR_ID,
      'cid',
      ACTOR_ID,
      ['papers']
    );
  });

  it('POST creates a labelled document', async () => {
    createVisitDocument.mockResolvedValue({ id: 'd1', pages: [] });
    const res = mockRes();
    let err: unknown;
    createVisitDocumentHandler(
      staffReq({
        body: {
          documentType: 'lab_report',
          filePath: `${DOCTOR_ID}/desk/${APT_ID}/a.jpg`,
          fileType: 'image/jpeg',
        },
      }),
      res,
      ((nextErr?: unknown) => {
        err = nextErr;
      }) as never
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(201);
    expect(createVisitDocument).toHaveBeenCalledWith(
      APT_ID,
      DOCTOR_ID,
      expect.objectContaining({ documentType: 'lab_report', fileType: 'image/jpeg' }),
      'cid',
      ACTOR_ID,
      ['papers']
    );
  });

  it('POST extract-lab returns suggestion rows and writes nothing', async () => {
    extractLabFromVisitPage.mockResolvedValue({
      pageId: PAGE_ID,
      rows: [],
      pageCount: 1,
      skippedPageIndexes: [],
      source: 'vision',
    });
    const res = mockRes();
    let err: unknown;
    extractVisitDocumentPageLabHandler(
      staffReq({ params: { id: APT_ID, documentId: DOC_ID, pageId: PAGE_ID } }),
      res,
      ((nextErr?: unknown) => {
        err = nextErr;
      }) as never
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(extractLabFromVisitPage).toHaveBeenCalledWith(
      APT_ID,
      DOC_ID,
      PAGE_ID,
      DOCTOR_ID,
      'cid',
      ACTOR_ID,
      {},
      ['papers']
    );
  });

  it('PUT extracted-results rejects an empty body', async () => {
    const res = mockRes();
    let err: unknown;
    confirmVisitDocumentExtractedResultsHandler(
      staffReq({
        params: { id: APT_ID, documentId: DOC_ID },
        body: { panels: [] },
      }),
      res,
      ((nextErr?: unknown) => {
        err = nextErr;
      }) as never
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(err).toBeDefined();
    expect(confirmVisitDocumentExtractedResults).not.toHaveBeenCalled();
  });

  it('PUT extracted-results confirms a panel', async () => {
    confirmVisitDocumentExtractedResults.mockResolvedValue({
      id: DOC_ID,
      extracted_results: [],
    });
    const res = mockRes();
    let err: unknown;
    confirmVisitDocumentExtractedResultsHandler(
      staffReq({
        params: { id: APT_ID, documentId: DOC_ID },
        body: {
          panels: [
            {
              pageId: PAGE_ID,
              report: {
                id: REPORT_ID,
                kind: 'lab',
                title: 'Page 1',
                reportDate: '2026-09-13',
                labName: null,
                attachmentIds: [PAGE_ID],
                findings: null,
                entryMethod: 'extracted',
              },
              rows: [
                {
                  id: ROW_ID,
                  source: 'patient_report',
                  name: 'Haemoglobin',
                  value: '11.8',
                  unit: 'g/dL',
                  date: '2026-09-13',
                  interpretation: null,
                  notes: null,
                  reportId: REPORT_ID,
                  refLow: 12,
                  refHigh: 15,
                  refText: null,
                  method: null,
                },
              ],
            },
          ],
        },
      }),
      res,
      ((nextErr?: unknown) => {
        err = nextErr;
      }) as never
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(err).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(confirmVisitDocumentExtractedResults).toHaveBeenCalledWith(
      APT_ID,
      DOC_ID,
      DOCTOR_ID,
      expect.arrayContaining([expect.objectContaining({ pageId: PAGE_ID })]),
      'cid',
      ACTOR_ID,
      ['papers']
    );
  });
});
