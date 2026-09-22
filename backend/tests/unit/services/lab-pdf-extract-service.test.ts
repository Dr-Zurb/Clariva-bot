/**
 * Lab PDF extract service — magic-byte gate + injectable reader (rpt-05.1).
 *
 * Default pdfjs-dist path is covered by a generated-PDF test; table
 * reconstruction itself lives in lab-pdf-table.test.ts.
 */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import PDFDocument from 'pdfkit';
import { ValidationError } from '../../../src/utils/errors';
import {
  boundRawExtractedRows,
  extractLabFromBytes,
  extractLabPdfFromAttachment,
  extractLabRowsFromPdf,
  itemsFromPdfJsPage,
  renderPdfPageJpeg,
  type PositionedTextItem,
} from '../../../src/services/lab-pdf-extract-service';

const info = jest.fn();

jest.mock('../../../src/config/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: (...args: unknown[]) => info(...args),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

beforeEach(() => {
  info.mockClear();
});

function item(
  text: string,
  x: number,
  y: number,
  width?: number,
  pageIndex = 0
): PositionedTextItem {
  return { text, x, y, width: width ?? text.length * 6, pageIndex };
}

function buildTablePdf(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(11);
    doc.text('Test', 50, 80, { lineBreak: false });
    doc.text('Result', 220, 80, { lineBreak: false });
    doc.text('Unit', 320, 80, { lineBreak: false });
    doc.text('Reference Range', 400, 80, { lineBreak: false });
    doc.text('Haemoglobin', 50, 110, { lineBreak: false });
    doc.text('11.8', 220, 110, { lineBreak: false });
    doc.text('g/dL', 320, 110, { lineBreak: false });
    doc.text('12.0 - 15.0', 400, 110, { lineBreak: false });
    doc.end();
  });
}

describe('extractLabRowsFromPdf', () => {
  it('rejects a non-PDF buffer without calling the reader', async () => {
    const readPageItems = jest.fn(async () => []);
    await expect(
      extractLabRowsFromPdf(Buffer.from('not-a-pdf'), { readPageItems })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(readPageItems).not.toHaveBeenCalled();
  });

  it('rejects an empty buffer', async () => {
    await expect(extractLabRowsFromPdf(Buffer.alloc(0))).rejects.toBeInstanceOf(ValidationError);
  });

  it('reconstructs rows from an injected text layer and logs counts only', async () => {
    const bytes = Buffer.from('%PDF-1.4 injected');
    const result = await extractLabRowsFromPdf(bytes, {
      readPageItems: async () => [
        item('Test', 20, 20, 24),
        item('Result', 200, 20, 36),
        item('Unit', 280, 20, 24),
        item('Reference Range', 360, 20, 90),
        item('Haemoglobin', 20, 40, 72),
        item('11.8', 200, 40, 24),
        item('g/dL', 280, 40, 24),
        item('12.0 - 15.0', 360, 40, 72),
      ],
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].rawValue).toBe('11.8');
    expect(result.pageCount).toBe(1);
    expect(info).toHaveBeenCalledTimes(1);
    const meta = info.mock.calls[0][0] as Record<string, unknown>;
    expect(meta).toEqual({
      pageCount: 1,
      rowCount: 1,
      skippedPageCount: 0,
    });
  });

  it('returns zero rows when the text layer has no table header', async () => {
    const bytes = Buffer.from('%PDF-1.4 injected');
    const result = await extractLabRowsFromPdf(bytes, {
      readPageItems: async () => [item('scan page', 20, 20, 60)],
    });
    expect(result.rows).toEqual([]);
    expect(result.skippedPageIndexes).toEqual([0]);
  });

  it('reads a generated PDF through the default pdfjs adapter', async () => {
    const bytes = await buildTablePdf();
    const result = await extractLabRowsFromPdf(bytes);
    expect(result.pageCount).toBe(1);
    const hb = result.rows.find((row) => /haemoglobin/i.test(row.rawName));
    expect(hb).toBeDefined();
    expect(hb?.rawValue).toBe('11.8');
    expect(hb?.rawUnit).toMatch(/g\/dL/i);
    expect(hb?.rawRange).toMatch(/12\.0/);
  });
});

describe('extractLabPdfFromAttachment', () => {
  const tableItems: PositionedTextItem[] = [
    item('Test', 20, 20, 24),
    item('Result', 200, 20, 36),
    item('Unit', 280, 20, 24),
    item('Reference Range', 360, 20, 90),
    item('Haemoglobin', 20, 40, 72),
    item('11.8', 200, 40, 24),
    item('g/dL', 280, 40, 24),
    item('12.0 - 15.0', 360, 40, 72),
  ];

  it('extracts rows from an owned PDF attachment', async () => {
    const download = jest.fn(async () => ({
      bytes: Buffer.from('%PDF-1.4 owned'),
      fileType: 'application/pdf',
      attachmentId: 'att-1',
    }));

    const result = await extractLabPdfFromAttachment(
      {
        prescriptionId: 'rx-1',
        attachmentId: 'att-1',
        userId: 'doc-1',
        correlationId: 'corr-1',
      },
      { download, readPageItems: async () => tableItems }
    );

    expect(download).toHaveBeenCalledWith('rx-1', 'att-1', 'corr-1', 'doc-1');
    expect(result.attachmentId).toBe('att-1');
    expect(result.rows[0].rawValue).toBe('11.8');
    expect(result.pageCount).toBe(1);
  });

  it('routes a JPEG attachment to the vision reader, not the PDF reader', async () => {
    const readPageItems = jest.fn(async () => tableItems);
    const extractImage = jest.fn(async () => ({
      rows: [
        {
          rawName: 'Haemoglobin',
          rawValue: '11.8',
          rawUnit: 'g/dL',
          rawRange: '12.0 - 15.0',
          rawMethod: null,
          pageIndex: 0,
          lineText: 'Haemoglobin 11.8 g/dL 12.0 - 15.0',
        },
      ],
    }));

    const result = await extractLabPdfFromAttachment(
      {
        prescriptionId: 'rx-1',
        attachmentId: 'att-2',
        userId: 'doc-1',
        correlationId: 'corr-1',
      },
      {
        download: async () => ({
          bytes: Buffer.from('jpeg-bytes'),
          fileType: 'image/jpeg',
          attachmentId: 'att-2',
        }),
        readPageItems,
        extractImage,
      }
    );

    expect(readPageItems).not.toHaveBeenCalled();
    expect(extractImage).toHaveBeenCalledWith(Buffer.from('jpeg-bytes'), 'image/jpeg', {
      correlationId: 'corr-1',
    });
    expect(result.source).toBe('vision');
    expect(result.rows[0].rawValue).toBe('11.8');
    // A photo is one page, and the vision reader never reports a skipped page.
    expect(result.pageCount).toBe(1);
    expect(result.skippedPageIndexes).toEqual([]);
  });

  it('marks PDF rows as text-layer sourced so the UI can trust lineText', async () => {
    const result = await extractLabPdfFromAttachment(
      {
        prescriptionId: 'rx-1',
        attachmentId: 'att-1',
        userId: 'doc-1',
        correlationId: 'corr-1',
      },
      {
        download: async () => ({
          bytes: Buffer.from('%PDF-1.4 owned'),
          fileType: 'application/pdf',
          attachmentId: 'att-1',
        }),
        readPageItems: async () => tableItems,
      }
    );
    expect(result.source).toBe('pdf_text');
  });

  it('rejects a file type neither reader handles', async () => {
    const extractImage = jest.fn(async () => ({ rows: [] }));
    await expect(
      extractLabPdfFromAttachment(
        {
          prescriptionId: 'rx-1',
          attachmentId: 'att-3',
          userId: 'doc-1',
          correlationId: 'corr-1',
        },
        {
          download: async () => ({
            bytes: Buffer.from('not-used'),
            fileType: 'text/plain',
            attachmentId: 'att-3',
          }),
          extractImage,
        }
      )
    ).rejects.toBeInstanceOf(ValidationError);
    expect(extractImage).not.toHaveBeenCalled();
  });
});

function visionRow(pageIndex = 0) {
  return {
    rawName: 'Haemoglobin',
    rawValue: '11.8',
    rawUnit: 'g/dL',
    rawRange: '12.0 - 15.0',
    rawMethod: null,
    pageIndex,
    lineText: 'Haemoglobin 11.8 g/dL 12.0 - 15.0',
  };
}

describe('extractLabFromBytes vision fallback', () => {
  const pdf = Buffer.from('%PDF-1.4 owned');

  it('does not render or call the model when the vision switch is off', async () => {
    const renderSkippedPage = jest.fn(async () => Buffer.from('jpeg'));
    const extractImage = jest.fn(async () => ({ rows: [visionRow()] }));

    const result = await extractLabFromBytes(
      { sourceId: 'page-1', bytes: pdf, fileType: 'application/pdf', correlationId: 'corr-1' },
      {
        readPageItems: async () => [item('scan page', 20, 20, 60)],
        isVisionEnabled: () => false,
        renderSkippedPage,
        extractImage,
      }
    );

    expect(renderSkippedPage).not.toHaveBeenCalled();
    expect(extractImage).not.toHaveBeenCalled();
    expect(result.source).toBe('pdf_text');
    expect(result.rows).toEqual([]);
    expect(result.skippedPageIndexes).toEqual([0]);
  });

  it('transcribes a skipped page and keeps a page the text reader already placed', async () => {
    const renderSkippedPage = jest.fn(async () => Buffer.from('jpeg'));
    const extractImage = jest.fn(async () => ({ rows: [visionRow(0)] }));

    const result = await extractLabFromBytes(
      { sourceId: 'page-1', bytes: pdf, fileType: 'application/pdf', correlationId: 'corr-1' },
      {
        readPageItems: async () => [
          item('Test', 20, 20, 24, 0),
          item('Result', 200, 20, 36, 0),
          item('Unit', 280, 20, 24, 0),
          item('Reference Range', 360, 20, 90, 0),
          item('Haemoglobin', 20, 40, 72, 0),
          item('11.8', 200, 40, 24, 0),
          item('g/dL', 280, 40, 24, 0),
          item('12.0 - 15.0', 360, 40, 72, 0),
          item('scan page', 20, 20, 60, 1),
        ],
        isVisionEnabled: () => true,
        renderSkippedPage,
        extractImage,
      }
    );

    expect(renderSkippedPage).toHaveBeenCalledTimes(1);
    expect(renderSkippedPage).toHaveBeenCalledWith(pdf, 1);
    expect(extractImage).toHaveBeenCalledWith(Buffer.from('jpeg'), 'image/jpeg', {
      correlationId: 'corr-1',
    });
    expect(result.source).toBe('vision');
    expect(result.skippedPageIndexes).toEqual([]);
    expect(result.rows.map((row) => row.pageIndex)).toEqual([0, 1]);
    expect(result.rows[1].rawValue).toBe('11.8');
  });

  it('keeps the text rows when the model call fails', async () => {
    const result = await extractLabFromBytes(
      { sourceId: 'page-1', bytes: pdf, fileType: 'application/pdf', correlationId: 'corr-1' },
      {
        readPageItems: async () => [
          item('Test', 20, 20, 24, 0),
          item('Result', 200, 20, 36, 0),
          item('Haemoglobin', 20, 40, 72, 0),
          item('11.8', 200, 40, 24, 0),
          item('no table', 20, 20, 48, 1),
        ],
        isVisionEnabled: () => true,
        renderSkippedPage: async () => Buffer.from('jpeg'),
        extractImage: async () => {
          throw new Error('model down');
        },
      }
    );

    expect(result.source).toBe('pdf_text');
    expect(result.rows).toHaveLength(1);
    expect(result.skippedPageIndexes).toEqual([1]);
  });

  it('treats a page with no text items as skipped and sends only that page', async () => {
    const renderSkippedPage = jest.fn(async () => Buffer.from('jpeg'));
    await extractLabFromBytes(
      { sourceId: 'page-1', bytes: pdf, fileType: 'application/pdf', correlationId: 'corr-1' },
      {
        pageCount: 2,
        readPageItems: async () => [
          item('Test', 20, 20, 24, 0),
          item('Result', 200, 20, 36, 0),
          item('Haemoglobin', 20, 40, 72, 0),
          item('11.8', 200, 40, 24, 0),
        ],
        isVisionEnabled: () => true,
        renderSkippedPage,
        extractImage: async () => ({ rows: [] }),
      }
    );

    expect(renderSkippedPage).toHaveBeenCalledTimes(1);
    expect(renderSkippedPage).toHaveBeenCalledWith(pdf, 1);
  });
});

describe('renderPdfPageJpeg', () => {
  it('returns a jpeg for a generated PDF page', async () => {
    const jpeg = await renderPdfPageJpeg(await buildTablePdf(), 0);
    expect(jpeg).not.toBeNull();
    expect(jpeg?.subarray(0, 3).toString('hex')).toBe('ffd8ff');
  });
});

describe('itemsFromPdfJsPage', () => {
  it('flips PDF-space y so larger y is further down the page', () => {
    const items = itemsFromPdfJsPage(
      [
        { str: 'Test', width: 4, transform: [1, 0, 0, 1, 2, 90] },
        { str: '11.8', width: 3, transform: [1, 0, 0, 1, 10, 70] },
      ],
      100,
      0
    );
    expect(items.map((it) => ({ text: it.text, y: it.y }))).toEqual([
      { text: 'Test', y: 10 },
      { text: '11.8', y: 30 },
    ]);
  });
});

describe('boundRawExtractedRows', () => {
  it('caps row count and field lengths without inventing values', () => {
    const bounded = boundRawExtractedRows(
      [
        {
          rawName: 'H'.repeat(200),
          rawValue: '1'.repeat(80),
          rawUnit: 'u'.repeat(80),
          rawRange: 'r'.repeat(200),
          rawMethod: 'm'.repeat(200),
          pageIndex: 0,
          lineText: 'L'.repeat(400),
        },
      ],
      1
    );
    expect(bounded[0].rawName).toHaveLength(120);
    expect(bounded[0].rawValue).toHaveLength(40);
    expect(bounded[0].lineText).toHaveLength(240);
  });
});
