/**
 * Lab-report PDF text-layer extraction (rpt-05.1).
 *
 * Reads an already-uploaded PDF's embedded text layer (no vision, no
 * external AI, no PHI egress) and returns verbatim rows for the doctor
 * to verify. Clinical alias matching stays on the frontend library.
 *
 * The PDF reader is injectable so table reconstruction is unit-tested
 * without a network or a binary fixture. The default reader uses
 * pdfjs-dist (legacy Node build) positioned text. Empty / image-only
 * PDFs fail soft (zero rows).
 *
 * `extractLabPdfFromAttachment` also owns the reader dispatch: photo
 * attachments go to the gated vision reader (rpt-05.6), which returns the
 * same `RawExtractedRow` shape so everything downstream is shared. This
 * module itself remains PHI-egress-free; only that delegate calls out.
 *
 * Logs page/row counts only — never names, values, or file paths.
 */

import path from 'path';
import { logger } from '../config/logger';
import { ValidationError } from '../utils/errors';
import { downloadAttachmentBytes } from './prescription-attachment-service';
import { LAB_VISION_MIME, extractLabRowsFromImage } from './lab-vision-extract-service';
import {
  reconstructLabTable,
  type LabPdfTableExtract,
  type PositionedTextItem,
  type RawExtractedRow,
} from './lab-pdf-table';

export type {
  LabPdfPageExtract,
  LabPdfPageSkipReason,
  LabPdfTableExtract,
  PositionedTextItem,
  RawExtractedRow,
} from './lab-pdf-table';

const PDF_MAGIC = '%PDF';

export type ReadPdfPageItems = (bytes: Buffer) => Promise<PositionedTextItem[]>;

export interface ExtractLabPdfDeps {
  readPageItems?: ReadPdfPageItems;
}

export interface LabPdfExtractResult extends LabPdfTableExtract {
  pageCount: number;
}

export interface PdfJsTextItem {
  str?: string;
  width?: number;
  transform?: number[];
}

function isPdfJsTextItem(item: unknown): item is PdfJsTextItem {
  return typeof item === 'object' && item !== null && 'str' in item;
}

function pdfjsStandardFontDataUrl(): string {
  const pkg = path.dirname(require.resolve('pdfjs-dist/package.json'));
  return path.join(pkg, 'standard_fonts') + path.sep;
}

/** Map pdf.js text items to page-down coordinates (larger y = further down). */
export function itemsFromPdfJsPage(
  items: readonly unknown[],
  pageHeight: number,
  pageIndex: number
): PositionedTextItem[] {
  const out: PositionedTextItem[] = [];
  for (const raw of items) {
    if (!isPdfJsTextItem(raw)) continue;
    const text = (raw.str ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const transform = raw.transform ?? [];
    const x = typeof transform[4] === 'number' ? transform[4] : 0;
    const yRaw = typeof transform[5] === 'number' ? transform[5] : 0;
    const y = pageHeight > 0 ? pageHeight - yRaw : yRaw;
    const width =
      typeof raw.width === 'number' && raw.width > 0 ? raw.width : Math.max(text.length * 0.4, 0.4);
    out.push({ text, x, y, width, pageIndex });
  }
  return out;
}

function loadPdfjs(): {
  getDocument: (opts: Record<string, unknown>) => { promise: Promise<PdfJsDocument> };
} {
  // v3 CJS build — Jest and this CommonJS backend cannot load the v4+ ESM .mjs.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('pdfjs-dist/build/pdf.js') as {
    getDocument: (opts: Record<string, unknown>) => { promise: Promise<PdfJsDocument> };
  };
}

async function defaultReadPageItems(bytes: Buffer): Promise<PositionedTextItem[]> {
  const copy = Buffer.from(bytes);
  const pdfjs = loadPdfjs();

  let doc: PdfJsDocument | null = null;
  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(copy),
      disableWorker: true,
      isEvalSupported: false,
      standardFontDataUrl: pdfjsStandardFontDataUrl(),
    });
    doc = await loadingTask.promise;
    const items: PositionedTextItem[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      items.push(...itemsFromPdfJsPage(content.items, viewport.height, pageNumber - 1));
    }
    return items;
  } catch {
    throw new ValidationError('Unable to read PDF');
  } finally {
    if (doc) {
      await doc.destroy().catch(() => undefined);
    }
  }
}

interface PdfJsDocument {
  numPages: number;
  getPage(n: number): Promise<{
    getViewport(opts: { scale: number }): { height: number };
    getTextContent(): Promise<{ items: unknown[] }>;
  }>;
  destroy(): Promise<void>;
}

function assertPdfBytes(bytes: Buffer): void {
  if (!Buffer.isBuffer(bytes) || bytes.length < 5) {
    throw new ValidationError('PDF is required');
  }
  if (bytes.subarray(0, 4).toString('utf8') !== PDF_MAGIC) {
    throw new ValidationError('File is not a PDF');
  }
}

/**
 * Extract verbatim lab rows from a PDF buffer. Suggestion-only — the
 * caller must still put rows through a verify dialog before applying.
 */
export async function extractLabRowsFromPdf(
  bytes: Buffer,
  deps: ExtractLabPdfDeps = {}
): Promise<LabPdfExtractResult> {
  assertPdfBytes(bytes);
  const readPageItems = deps.readPageItems ?? defaultReadPageItems;
  const items = await readPageItems(bytes);
  const table = reconstructLabTable(items);
  const pageCount = new Set(items.map((item) => item.pageIndex)).size;

  logger.info(
    {
      pageCount,
      rowCount: table.rows.length,
      skippedPageCount: table.skippedPageIndexes.length,
    },
    'lab_pdf_extract: completed'
  );

  return {
    ...table,
    pageCount,
  };
}

export function boundRawExtractedRows(rows: RawExtractedRow[], maxRows = 200): RawExtractedRow[] {
  return rows.slice(0, maxRows).map((row) => ({
    rawName: row.rawName.slice(0, 120),
    rawValue: row.rawValue == null ? null : row.rawValue.slice(0, 40),
    rawUnit: row.rawUnit == null ? null : row.rawUnit.slice(0, 40),
    rawRange: row.rawRange == null ? null : row.rawRange.slice(0, 80),
    rawMethod: row.rawMethod == null ? null : row.rawMethod.slice(0, 80),
    pageIndex: row.pageIndex,
    lineText: row.lineText.slice(0, 240),
  }));
}

const PDF_MIME = new Set(['application/pdf', 'application/x-pdf']);

export type DownloadAttachmentBytes = typeof downloadAttachmentBytes;

export type ExtractLabRowsFromImage = typeof extractLabRowsFromImage;

export interface ExtractLabPdfFromAttachmentDeps extends ExtractLabPdfDeps {
  download?: DownloadAttachmentBytes;
  /** Injectable for tests; defaults to the real vision reader. */
  extractImage?: ExtractLabRowsFromImage;
}

/**
 * Which reader produced the rows. `vision` rows came from a model, so
 * `lineText` is NOT verbatim provenance and the UI must lean on the source
 * image instead (rpt-05.6).
 */
export type LabExtractSource = 'pdf_text' | 'vision';

export interface LabPdfExtractFromAttachmentResult {
  attachmentId: string;
  rows: RawExtractedRow[];
  pageCount: number;
  skippedPageIndexes: number[];
  source: LabExtractSource;
}

/**
 * MIME dispatch shared by prescription attachments and desk visit pages.
 * Suggestion-only — caller must still verify before applying.
 */
export async function extractLabFromBytes(
  args: {
    sourceId: string;
    bytes: Buffer;
    fileType: string | null;
    correlationId: string;
  },
  deps: ExtractLabPdfFromAttachmentDeps = {}
): Promise<LabPdfExtractFromAttachmentResult> {
  const mime = (args.fileType ?? '').trim().toLowerCase();

  if (LAB_VISION_MIME.has(mime)) {
    const extractImage = deps.extractImage ?? extractLabRowsFromImage;
    const extracted = await extractImage(args.bytes, mime, { correlationId: args.correlationId });
    return {
      attachmentId: args.sourceId,
      rows: boundRawExtractedRows(extracted.rows),
      // A photo is one page, and the vision reader has no notion of a page it
      // refused to read — it fails soft with zero rows instead.
      pageCount: 1,
      skippedPageIndexes: [],
      source: 'vision',
    };
  }

  if (mime && !PDF_MIME.has(mime)) {
    throw new ValidationError('Extraction supports PDF or photo reports only');
  }

  const extracted = await extractLabRowsFromPdf(args.bytes, { readPageItems: deps.readPageItems });
  return {
    attachmentId: args.sourceId,
    rows: boundRawExtractedRows(extracted.rows),
    pageCount: extracted.pageCount,
    skippedPageIndexes: extracted.skippedPageIndexes,
    source: 'pdf_text',
  };
}

/**
 * Own the attachment, pull bytes via service-role, extract verbatim rows.
 * Suggestion-only — caller must still verify before applying.
 *
 * Dispatches on MIME to one of two readers behind a shared row contract:
 * deterministic PDF text-layer reconstruction, or the gated vision reader for
 * photos (rpt-05.6). Unknown MIME still routes to the PDF reader, preserving
 * the tolerance for attachments registered without a `file_type`.
 */
export async function extractLabPdfFromAttachment(
  args: {
    prescriptionId: string;
    attachmentId: string;
    userId: string;
    correlationId: string;
  },
  deps: ExtractLabPdfFromAttachmentDeps = {}
): Promise<LabPdfExtractFromAttachmentResult> {
  const download = deps.download ?? downloadAttachmentBytes;
  const { bytes, fileType, attachmentId } = await download(
    args.prescriptionId,
    args.attachmentId,
    args.correlationId,
    args.userId
  );

  return extractLabFromBytes(
    {
      sourceId: attachmentId,
      bytes,
      fileType,
      correlationId: args.correlationId,
    },
    deps
  );
}
