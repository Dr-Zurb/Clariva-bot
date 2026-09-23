import { PDFDocument } from 'pdf-lib';
import { stampPrescriptionPageNumbers } from '../../../src/templates/prescription-pdf/page-numbers';

describe('stampPrescriptionPageNumbers', () => {
  it('writes Page n of N at the bottom of every page', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.addPage();
    const stamped = await stampPrescriptionPageNumbers(Buffer.from(await doc.save()));

    const pdfjs = require('pdfjs-dist/build/pdf.js') as {
      getDocument: (opts: Record<string, unknown>) => {
        promise: Promise<{
          numPages: number;
          getPage: (n: number) => Promise<{
            getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
          }>;
        }>;
      };
    };
    const loaded = await pdfjs
      .getDocument({ data: new Uint8Array(stamped), disableWorker: true })
      .promise;

    expect(loaded.numPages).toBe(2);
    for (let n = 1; n <= loaded.numPages; n += 1) {
      const page = await loaded.getPage(n);
      const content = await page.getTextContent();
      const text = content.items.map((item) => item.str ?? '').join(' ');
      expect(text).toContain(`Page ${n} of 2`);
    }
  });
});
