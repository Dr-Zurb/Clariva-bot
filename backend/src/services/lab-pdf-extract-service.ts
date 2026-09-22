/**
 * Lab-report PDF text-layer extraction (rpt-05.1).
 *
 * Reads an already-uploaded PDF's embedded text layer (no vision, no
 * external AI, no PHI egress) and returns verbatim rows for the doctor
 * to verify. Clinical alias matching stays on the frontend library.
 *
 * The PDF reader is injectable so table reconstruction is unit-tested
 * without a network or a binary fixture. The default reader uses
 * pdfjs-dist (legacy Node build) positioned text. A page with no rows
 * stays empty unless the gated vision reader is on, in which case that
 * page is rendered to an image and transcribed by the same photo reader.
 * The switch stays off until consent is recorded, so a text PDF does not
 * leave the server by default.
 *
 * `extractLabPdfFromAttachment` also owns the reader dispatch: photo
 * attachments go to the gated vision reader (rpt-05.6), which returns the
 * same `RawExtractedRow` shape so everything downstream is shared. This
 * module's text path stays PHI-egress-free; only that delegate calls out.
 *
 * Logs page/row counts only — never names, values, or file paths.
 */

import path from 'path';
import { logger } from '../config/logger';
import { ValidationError } from '../utils/errors';
import { downloadAttachmentBytes } from './prescription-attachment-service';
import { isLabVisionExtractEnabled } from '../config/openai';
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
  /**
   * Real PDF page count when the text injector cannot see blank pages.
   * The default reader uses the document's own page count.
   */
  pageCount?: number;
}

/** A page image for the vision reader, or null when it could not be rendered. */
export type RenderPdfPage = (bytes: Buffer, pageIndex: number) => Promise<Buffer | null>;

/** Cap model calls. Extra pages stay skipped for manual entry. */
const MAX_VISION_FALLBACK_PAGES = 8;
const RENDER_SCALE = 2;
const MAX_RENDER_EDGE = 2000;

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

async function openPdfDocument(bytes: Buffer): Promise<PdfJsDocument> {
  const pdfjs = loadPdfjs();
  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(Buffer.from(bytes)),
      disableWorker: true,
      isEvalSupported: false,
      standardFontDataUrl: pdfjsStandardFontDataUrl(),
    });
    return await loadingTask.promise;
  } catch {
    throw new ValidationError('Unable to read PDF');
  }
}

async function defaultReadPdf(bytes: Buffer): Promise<{
  items: PositionedTextItem[];
  pageCount: number;
}> {
  let doc: PdfJsDocument | null = null;
  try {
    doc = await openPdfDocument(bytes);
    const items: PositionedTextItem[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      items.push(...itemsFromPdfJsPage(content.items, viewport.height, pageNumber - 1));
    }
    return { items, pageCount: doc.numPages };
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('Unable to read PDF');
  } finally {
    if (doc) {
      await doc.destroy().catch(() => undefined);
    }
  }
}

let renderUnavailableLogged = false;

/**
 * Rasterize one PDF page to JPEG for the vision reader. Returns null when
 * canvas is missing or the page cannot be drawn. Never logs page content.
 */
export async function renderPdfPageJpeg(bytes: Buffer, pageIndex: number): Promise<Buffer | null> {
  if (pageIndex < 0) return null;
  let createCanvas: (
    width: number,
    height: number
  ) => {
    getContext(kind: '2d'): {
      fillStyle: string;
      fillRect(x: number, y: number, w: number, h: number): void;
    };
    toBuffer(type: 'image/jpeg', opts: { quality: number }): Buffer;
    width: number;
    height: number;
  };
  try {
    // Optional native peer. Text extraction still works when it is absent.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const canvas = require('canvas') as {
      createCanvas: typeof createCanvas;
    };
    createCanvas = canvas.createCanvas;
  } catch {
    if (!renderUnavailableLogged) {
      renderUnavailableLogged = true;
      logger.warn('lab_pdf_extract: page render unavailable');
    }
    return null;
  }

  let doc: PdfJsDocument | null = null;
  try {
    doc = await openPdfDocument(bytes);
    if (pageIndex >= doc.numPages) return null;
    const page = await doc.getPage(pageIndex + 1);
    let viewport = page.getViewport({ scale: RENDER_SCALE });
    const longest = Math.max(viewport.width, viewport.height);
    if (longest > MAX_RENDER_EDGE) {
      viewport = page.getViewport({ scale: RENDER_SCALE * (MAX_RENDER_EDGE / longest) });
    }
    const width = Math.max(1, Math.ceil(viewport.width));
    const height = Math.max(1, Math.ceil(viewport.height));
    const surface = createCanvas(width, height);
    const ctx = surface.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return surface.toBuffer('image/jpeg', { quality: 0.82 });
  } catch {
    logger.warn({ pageIndex }, 'lab_pdf_extract: page image render failed');
    return null;
  } finally {
    if (doc) {
      await doc.destroy().catch(() => undefined);
    }
  }
}

interface PdfJsPage {
  getViewport(opts: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: unknown[] }>;
  render(opts: { canvasContext: unknown; viewport: { width: number; height: number } }): {
    promise: Promise<void>;
  };
}

interface PdfJsDocument {
  numPages: number;
  getPage(n: number): Promise<PdfJsPage>;
  destroy(): Promise<void>;
}

/** Pages that produced no rows, including scanned pages with no text layer. */
function pagesMissingRows(table: LabPdfTableExtract, pageCount: number): number[] {
  const withRows = new Set(
    table.pages.filter((page) => page.rows.length > 0).map((page) => page.pageIndex)
  );
  const missing = new Set(table.skippedPageIndexes);
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    if (!withRows.has(pageIndex)) missing.add(pageIndex);
  }
  return [...missing].sort((a, b) => a - b);
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
  let items: PositionedTextItem[];
  let pageCount: number;
  if (deps.readPageItems) {
    items = await deps.readPageItems(bytes);
    const fromItems = items.reduce((max, item) => Math.max(max, item.pageIndex + 1), 0);
    pageCount = deps.pageCount ?? fromItems;
  } else {
    const read = await defaultReadPdf(bytes);
    items = read.items;
    pageCount = read.pageCount;
  }
  const table = reconstructLabTable(items);
  const skippedPageIndexes = pagesMissingRows(table, pageCount);

  logger.info(
    {
      pageCount,
      rowCount: table.rows.length,
      skippedPageCount: skippedPageIndexes.length,
    },
    'lab_pdf_extract: completed'
  );

  return {
    ...table,
    pageCount,
    skippedPageIndexes,
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
  /** Defaults to the PHI-egress switch. Tests pass a stub. */
  isVisionEnabled?: () => boolean;
  /** Defaults to rendering the page with pdf.js. Tests pass a stub. */
  renderSkippedPage?: RenderPdfPage;
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

  const extracted = await extractLabRowsFromPdf(args.bytes, {
    readPageItems: deps.readPageItems,
    pageCount: deps.pageCount,
  });
  const filled = await fillSkippedPages(args.bytes, extracted, args.correlationId, deps);
  return {
    attachmentId: args.sourceId,
    rows: boundRawExtractedRows(filled.rows),
    pageCount: extracted.pageCount,
    skippedPageIndexes: filled.skippedPageIndexes,
    source: filled.usedVision ? 'vision' : 'pdf_text',
  };
}

/**
 * Text rows stay. A page with none is rendered and transcribed only when the
 * vision switch is on. A failed page stays skipped; it does not drop the
 * pages that already read.
 */
async function fillSkippedPages(
  bytes: Buffer,
  extracted: LabPdfExtractResult,
  correlationId: string,
  deps: ExtractLabPdfFromAttachmentDeps
): Promise<{
  rows: RawExtractedRow[];
  skippedPageIndexes: number[];
  usedVision: boolean;
}> {
  const visionOn = (deps.isVisionEnabled ?? isLabVisionExtractEnabled)();
  if (!visionOn || extracted.skippedPageIndexes.length === 0) {
    return {
      rows: extracted.rows,
      skippedPageIndexes: extracted.skippedPageIndexes,
      usedVision: false,
    };
  }

  const render = deps.renderSkippedPage ?? renderPdfPageJpeg;
  const extractImage = deps.extractImage ?? extractLabRowsFromImage;
  const targets = extracted.skippedPageIndexes.slice(0, MAX_VISION_FALLBACK_PAGES);
  const stillSkipped = extracted.skippedPageIndexes.slice(MAX_VISION_FALLBACK_PAGES);
  const visionRows: RawExtractedRow[] = [];
  let visionPageCount = 0;

  for (const pageIndex of targets) {
    try {
      const image = await render(bytes, pageIndex);
      if (!image) {
        stillSkipped.push(pageIndex);
        continue;
      }
      const result = await extractImage(image, 'image/jpeg', { correlationId });
      const pageRows = result.rows.map((row) => ({ ...row, pageIndex }));
      if (pageRows.length === 0) {
        stillSkipped.push(pageIndex);
        continue;
      }
      visionRows.push(...pageRows);
      visionPageCount += 1;
    } catch {
      stillSkipped.push(pageIndex);
      logger.warn({ correlationId, pageIndex }, 'lab_pdf_extract: vision fallback failed');
    }
  }

  stillSkipped.sort((a, b) => a - b);
  logger.info(
    {
      correlationId,
      visionPageCount,
      visionRowCount: visionRows.length,
    },
    'lab_pdf_extract: vision fallback completed'
  );

  const rows = [...extracted.rows, ...visionRows].sort((a, b) => a.pageIndex - b.pageIndex);
  return {
    rows,
    skippedPageIndexes: stillSkipped,
    usedVision: visionRows.length > 0,
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
