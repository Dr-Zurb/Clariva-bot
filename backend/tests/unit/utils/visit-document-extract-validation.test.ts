import { describe, expect, it } from '@jest/globals';
import { ValidationError } from '../../../src/utils/errors';
import { validateConfirmVisitExtractedResultsBody } from '../../../src/utils/visit-document-extract-validation';

const PAGE_ID = '990e8400-e29b-41d4-a716-446655440004';
const REPORT_ID = 'aa0e8400-e29b-41d4-a716-446655440005';
const ROW_ID = 'bb0e8400-e29b-41d4-a716-446655440006';

const validPanel = {
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
};

describe('validateConfirmVisitExtractedResultsBody', () => {
  it('accepts a confirmed panel', () => {
    const body = validateConfirmVisitExtractedResultsBody({ panels: [validPanel] });
    expect(body.panels).toHaveLength(1);
    expect(body.panels[0]?.pageId).toBe(PAGE_ID);
  });

  it('rejects an empty panel list', () => {
    expect(() => validateConfirmVisitExtractedResultsBody({ panels: [] })).toThrow(
      ValidationError
    );
  });

  it('rejects a panel with no rows', () => {
    expect(() =>
      validateConfirmVisitExtractedResultsBody({
        panels: [{ ...validPanel, rows: [] }],
      })
    ).toThrow(ValidationError);
  });
});
