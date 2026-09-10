/**
 * Lab PDF table reconstruction — fail-closed columnization (rpt-05.1).
 *
 * Synthetic positioned items only. No PDF library, no PHI fixtures.
 */

import { describe, expect, it } from '@jest/globals';
import { reconstructLabTable, type PositionedTextItem } from '../../../src/services/lab-pdf-table';

function item(
  text: string,
  x: number,
  y: number,
  width?: number,
  pageIndex = 0
): PositionedTextItem {
  return { text, x, y, width: width ?? text.length * 6, pageIndex };
}

function cbcHeader(y = 40, pageIndex = 0): PositionedTextItem[] {
  return [
    item('Test', 20, y, 24, pageIndex),
    item('Result', 200, y, 36, pageIndex),
    item('Unit', 280, y, 24, pageIndex),
    item('Reference Range', 360, y, 90, pageIndex),
  ];
}

describe('reconstructLabTable', () => {
  it('extracts a standard 4-column CBC table verbatim', () => {
    const items = [
      item('COMPLETE BLOOD COUNT', 20, 10, 140),
      ...cbcHeader(),
      item('Haemoglobin', 20, 60, 72),
      item('11.8', 200, 60, 24),
      item('g/dL', 280, 60, 24),
      item('12.0 - 15.0', 360, 60, 72),
      item('RBC Count', 20, 80, 60),
      item('4.2', 200, 80, 18),
      item('mill/cumm', 280, 80, 54),
      item('4.5 - 5.5', 360, 80, 54),
    ];

    const result = reconstructLabTable(items);
    expect(result.skippedPageIndexes).toEqual([]);
    expect(result.rows).toEqual([
      {
        rawName: 'Haemoglobin',
        rawValue: '11.8',
        rawUnit: 'g/dL',
        rawRange: '12.0 - 15.0',
        rawMethod: null,
        pageIndex: 0,
        lineText: 'Haemoglobin 11.8 g/dL 12.0 - 15.0',
      },
      {
        rawName: 'RBC Count',
        rawValue: '4.2',
        rawUnit: 'mill/cumm',
        rawRange: '4.5 - 5.5',
        rawMethod: null,
        pageIndex: 0,
        lineText: 'RBC Count 4.2 mill/cumm 4.5 - 5.5',
      },
    ]);
  });

  it('splits a glued value+unit when there is no unit column', () => {
    const items = [
      item('Test', 20, 20, 24),
      item('Result', 200, 20, 36),
      item('Reference Range', 360, 20, 90),
      item('Haemoglobin', 20, 40, 72),
      item('11.8 g/dL', 200, 40, 54),
      item('12.0 - 15.0', 360, 40, 72),
    ];

    const [row] = reconstructLabTable(items).rows;
    expect(row).toMatchObject({
      rawName: 'Haemoglobin',
      rawValue: '11.8',
      rawUnit: 'g/dL',
      rawRange: '12.0 - 15.0',
    });
  });

  it('keeps qualitative results as raw values', () => {
    const items = [
      ...cbcHeader(),
      item('HBsAg', 20, 60, 36),
      item('Negative', 200, 60, 48),
      item('', 280, 60, 0),
      item('Negative', 360, 60, 48),
    ].filter((it) => it.text.length > 0);

    const [row] = reconstructLabTable(items).rows;
    expect(row).toMatchObject({
      rawName: 'HBsAg',
      rawValue: 'Negative',
      rawRange: 'Negative',
    });
  });

  it('skips a page with no name+value header (fail-closed)', () => {
    const items = [
      item('Haemoglobin', 20, 40, 72),
      item('11.8', 200, 40, 24),
      item('g/dL', 280, 40, 24),
    ];

    const result = reconstructLabTable(items);
    expect(result.rows).toEqual([]);
    expect(result.skippedPageIndexes).toEqual([0]);
    expect(result.pages[0].skipReason).toBe('no_header');
  });

  it('skips a page when value and range headers sit on top of each other', () => {
    const items = [
      item('Test', 20, 20, 24),
      item('Result', 200, 20, 36),
      item('Range', 206, 20, 30),
      item('Haemoglobin', 20, 40, 72),
      item('11.8', 200, 40, 24),
      item('12.0 - 15.0', 206, 40, 72),
    ];

    const result = reconstructLabTable(items);
    expect(result.rows).toEqual([]);
    expect(result.pages[0].skipReason).toBe('ambiguous_columns');
  });

  it('drops a row whose only "value" is a printed range', () => {
    const items = [
      item('Test', 20, 20, 24),
      item('Result', 200, 20, 36),
      item('Haemoglobin', 20, 40, 72),
      item('12.0 - 15.0', 200, 40, 72),
    ];

    expect(reconstructLabTable(items).rows).toEqual([]);
  });

  it('drops a row whose value vs range assignment is ambiguous', () => {
    const items = [
      ...cbcHeader(),
      item('Haemoglobin', 20, 60, 72),
      item('11.8', 200, 60, 24),
      item('g/dL', 280, 60, 24),
      item('12.0 - 15.0', 360, 60, 72),
      // Midway between Result (200) and Reference Range (360) — refuse the row.
      item('WBC', 20, 80, 24),
      item('7200', 280, 80, 30),
    ];

    const result = reconstructLabTable(items);
    expect(result.rows.map((r) => r.rawName)).toEqual(['Haemoglobin']);
  });

  it('ignores preamble above the header and continues after a second header', () => {
    const items = [
      item('Patient Name', 20, 8, 72),
      item('Age / Sex', 20, 20, 54),
      ...cbcHeader(40),
      item('Haemoglobin', 20, 60, 72),
      item('11.8', 200, 60, 24),
      item('g/dL', 280, 60, 24),
      item('12.0 - 15.0', 360, 60, 72),
      item('LIVER FUNCTION TEST', 20, 100, 120),
      item('Test', 20, 120, 24),
      item('Result', 200, 120, 36),
      item('Unit', 280, 120, 24),
      item('Reference Range', 360, 120, 90),
      item('SGPT (ALT)', 20, 140, 66),
      item('32', 200, 140, 12),
      item('U/L', 280, 140, 18),
      item('0 - 40', 360, 140, 36),
    ];

    expect(reconstructLabTable(items).rows.map((r) => r.rawName)).toEqual([
      'Haemoglobin',
      'SGPT (ALT)',
    ]);
  });

  it('extracts a method column when the header names it', () => {
    const items = [
      item('Test', 20, 20, 24),
      item('Result', 180, 20, 36),
      item('Unit', 250, 20, 24),
      item('Reference Range', 320, 20, 90),
      item('Method', 460, 20, 36),
      item('HbA1c', 20, 40, 36),
      item('6.4', 180, 40, 18),
      item('%', 250, 40, 12),
      item('4.0 - 5.6', 320, 40, 54),
      item('HPLC', 460, 40, 24),
    ];

    expect(reconstructLabTable(items).rows[0]).toMatchObject({
      rawName: 'HbA1c',
      rawValue: '6.4',
      rawUnit: '%',
      rawRange: '4.0 - 5.6',
      rawMethod: 'HPLC',
    });
  });

  it('skips an image-only page and keeps the text-layer page', () => {
    const items = [
      ...cbcHeader(40, 0),
      item('Haemoglobin', 20, 60, 72, 0),
      item('11.8', 200, 60, 24, 0),
      item('g/dL', 280, 60, 24, 0),
      item('12.0 - 15.0', 360, 60, 72, 0),
      item('Page', 20, 20, 24, 1),
    ];

    const result = reconstructLabTable(items);
    expect(result.rows).toHaveLength(1);
    expect(result.skippedPageIndexes).toEqual([1]);
    expect(result.pages[1].skipReason).toBe('no_text');
  });
});
