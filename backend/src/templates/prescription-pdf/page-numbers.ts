/**
 * Stamp "Page 1 of 2" on each page after react-pdf render.
 *
 * A dynamic page-number `render` inside the footer does not paint in
 * the current renderer, and nesting it there drops the footer. Stamping
 * the finished PDF keeps the count on every page, including preprinted.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const FONT_SIZE = 9;
const RIGHT_MARGIN = 36;
const BOTTOM_MARGIN = 16;

export async function stampPrescriptionPageNumbers(pdf: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const total = pages.length;
  const color = rgb(15 / 255, 23 / 255, 42 / 255);

  pages.forEach((page, index) => {
    const label = `Page ${index + 1} of ${total}`;
    const width = font.widthOfTextAtSize(label, FONT_SIZE);
    const { width: pageWidth } = page.getSize();
    page.drawText(label, {
      x: Math.max(RIGHT_MARGIN, pageWidth - RIGHT_MARGIN - width),
      y: BOTTOM_MARGIN,
      size: FONT_SIZE,
      font,
      color,
    });
  });

  return Buffer.from(await doc.save());
}
